import path from 'node:path'
import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  desktopCapturer,
  ipcMain,
  nativeImage,
  safeStorage,
  session,
  shell,
  type DesktopCapturerSource,
} from 'electron'

import {
  createMainWindowOptions,
  desktopMediaAutomationConfig,
  resolveRendererEntry,
  type DesktopMediaAutomationConfig,
} from './config'
import {
  DESKTOP_CLIENT_COMMAND_CHANNEL,
  DESKTOP_CLIENT_STATE_CHANNEL,
  DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL,
  DESKTOP_CAPTURE_PICKER_RESPONSE_CHANNEL,
  DESKTOP_LIFECYCLE_STATE_CHANNEL,
  buildDesktopApplicationMenuTemplate,
  buildDesktopTrayMenuTemplate,
  createEmptyDesktopClientState,
  parseDesktopCapturePickerResponse,
  parseDesktopClientState,
  type DesktopClientCommand,
  type DesktopClientState,
  type DesktopCapturePickerRequest,
  type DesktopCaptureSource,
  type DesktopLifecycleState,
} from './desktopNative'
import {
  DEEP_LINK_ROUTE_CHANNEL,
  firstDesktopDeepLinkArg,
  parseDesktopDeepLinkRoute,
  type DesktopDeepLinkRoute,
} from './deepLinks'
import {
  DEVICE_SESSION_SECRET_GET_CHANNEL,
  DEVICE_SESSION_SECRET_REMOVE_CHANNEL,
  DEVICE_SESSION_SECRET_SET_CHANNEL,
  createDesktopDeviceSessionSecretStore,
  isDeviceSessionSecretKey,
} from './deviceSessionSecrets'
import {
  MESSAGE_NOTIFICATION_CHANNEL,
  buildMessageNotification,
  isMessageNotificationPayload,
  notificationClickRouteFromPayload,
  shouldShowMessageNotification,
} from './notifications'

const appRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appRoot, '../..')
const preloadPath = path.join(__dirname, 'preload.js')
const smokeMode = process.argv.includes('--smoke')
const backgroundSmokeMode = process.argv.includes('--background-smoke')
const e2eUserDataPath = process.env.OPENCORD_DESKTOP_USER_DATA_PATH?.trim()
if (e2eUserDataPath) {
  app.setPath('userData', e2eUserDataPath)
}
const mediaAutomationConfig = desktopMediaAutomationConfig()
const deviceSessionSecrets = createDesktopDeviceSessionSecretStore({
  safeStorage,
  userDataPath: app.getPath('userData'),
})

let mainWindow: BrowserWindow | null = null
let pendingDeepLinkRoute: DesktopDeepLinkRoute | null = null
let desktopClientState: DesktopClientState = createEmptyDesktopClientState()
let tray: Tray | null = null
let isQuitting = false
let desktopCapturePickerSequence = 0
const pendingDesktopCapturePickers = new Map<
  string,
  {
    resolve: (sourceId: string | null) => void
    timeout: NodeJS.Timeout
  }
>()

applyDesktopMediaAutomationCommandLine(mediaAutomationConfig)
captureDesktopDeepLink(firstDesktopDeepLinkArg(process.argv))

ipcMain.handle(MESSAGE_NOTIFICATION_CHANNEL, (_event, payload: unknown) => {
  if (!isMessageNotificationPayload(payload) || !Notification.isSupported()) {
    return false
  }

  if (
    !shouldShowMessageNotification({
      isWindowFocused: mainWindow?.isFocused() ?? false,
      own: payload.own,
    })
  ) {
    return false
  }

  const notification = new Notification(buildMessageNotification(payload))
  const clickRoute = notificationClickRouteFromPayload(payload)
  if (clickRoute) {
    notification.on('click', () => {
      routeDesktopWindow(clickRoute)
    })
  }
  notification.show()
  return true
})

ipcMain.handle(DESKTOP_CLIENT_STATE_CHANNEL, (_event, payload: unknown) => {
  const nextState = parseDesktopClientState(payload)
  if (!nextState) {
    return false
  }

  desktopClientState = nextState
  refreshDesktopNativeShell()
  return true
})

ipcMain.handle(DESKTOP_CAPTURE_PICKER_RESPONSE_CHANNEL, (_event, payload: unknown) => {
  const response = parseDesktopCapturePickerResponse(payload)
  if (!response) {
    return false
  }

  const pending = pendingDesktopCapturePickers.get(response.requestId)
  if (!pending) {
    return false
  }

  clearTimeout(pending.timeout)
  pendingDesktopCapturePickers.delete(response.requestId)
  pending.resolve(response.sourceId)
  return true
})

ipcMain.handle(DEVICE_SESSION_SECRET_GET_CHANNEL, (_event, key: unknown) => {
  if (!isDeviceSessionSecretKey(key)) {
    return null
  }

  return deviceSessionSecrets.getItem(key)
})

ipcMain.handle(DEVICE_SESSION_SECRET_SET_CHANNEL, async (_event, key: unknown, value: unknown) => {
  if (!isDeviceSessionSecretKey(key) || typeof value !== 'string') {
    return false
  }

  await deviceSessionSecrets.setItem(key, value)
  return true
})

ipcMain.handle(DEVICE_SESSION_SECRET_REMOVE_CHANNEL, async (_event, key: unknown) => {
  if (!isDeviceSessionSecretKey(key)) {
    return false
  }

  await deviceSessionSecrets.removeItem(key)
  return true
})

async function createWindow() {
  const window = new BrowserWindow(createMainWindowOptions(preloadPath))
  mainWindow = window

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isRendererNavigationAllowed(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  window.webContents.once('did-finish-load', () => {
    flushPendingDeepLinkRoute(window)
    refreshDesktopNativeShell()
    sendDesktopLifecycleState(window)
    if (backgroundSmokeMode) {
      void runDesktopBackgroundSmoke(window)
      return
    }
    if (smokeMode) {
      console.log('opencord-desktop-ready')
      app.quit()
    }
  })
  window.once('ready-to-show', () => {
    window.show()
    refreshDesktopNativeShell()
    sendDesktopLifecycleState(window)
  })
  window.on('minimize', () => {
    refreshDesktopNativeShell()
    sendDesktopLifecycleState(window)
  })
  window.on('restore', () => {
    refreshDesktopNativeShell()
    sendDesktopLifecycleState(window)
  })
  window.on('show', () => {
    refreshDesktopNativeShell()
    sendDesktopLifecycleState(window)
  })
  window.on('hide', () => {
    refreshDesktopNativeShell()
    sendDesktopLifecycleState(window)
  })
  window.on('focus', () => {
    sendDesktopLifecycleState(window)
  })
  window.on('blur', () => {
    sendDesktopLifecycleState(window)
  })
  window.on('close', (event) => {
    if (isQuitting || smokeMode || backgroundSmokeMode) {
      return
    }

    event.preventDefault()
    window.hide()
    refreshDesktopNativeShell()
    sendDesktopLifecycleState(window)
  })
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  const rendererEntry = resolveRendererEntry({ repoRoot })
  if (rendererEntry.kind === 'url') {
    await window.loadURL(rendererEntry.value)
  } else {
    await window.loadFile(rendererEntry.value)
  }
}

function isRendererNavigationAllowed(url: string) {
  const rendererEntry = resolveRendererEntry({ repoRoot })
  if (rendererEntry.kind === 'url') {
    return url.startsWith(rendererEntry.value)
  }

  return url.startsWith('file://')
}

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    captureDesktopDeepLink(firstDesktopDeepLinkArg(argv))
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
      flushPendingDeepLinkRoute(mainWindow)
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    captureDesktopDeepLink(url)
    if (mainWindow) {
      flushPendingDeepLinkRoute(mainWindow)
    }
  })

  app.whenReady().then(async () => {
    app.setAsDefaultProtocolClient('opencord')
    configureDesktopDisplayMedia(mediaAutomationConfig)
    await createWindow()
    configureDesktopNativeShell()

    app.on('activate', () => {
      if (mainWindow === null || mainWindow.isDestroyed()) {
        void createWindow()
      }
    })
  })
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function runDesktopBackgroundSmoke(window: BrowserWindow) {
  window.show()
  sendDesktopLifecycleState(window)
  await waitForDesktopSmoke()
  window.hide()
  sendDesktopLifecycleState(window)
  const realtimeMarker = await waitForDesktopRealtimeMarker(window)

  const visible = window.isVisible()
  const rendererAlive = !window.webContents.isDestroyed()

  console.log(
    `opencord-desktop-background-smoke:${JSON.stringify({
      realtimeMarker,
      rendererAlive,
      visible,
    })}`,
  )
  isQuitting = true
  app.quit()
}

function waitForDesktopSmoke() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 200)
  })
}

async function waitForDesktopRealtimeMarker(window: BrowserWindow) {
  const startedAt = Date.now()
  while (!window.webContents.isDestroyed() && Date.now() - startedAt < 5_000) {
    const markerFound = await window.webContents.executeJavaScript(
      "Boolean(document.querySelector('[data-realtime-url]'))",
    )
    if (markerFound) {
      return true
    }
    await waitForDesktopSmoke()
  }

  return false
}

function applyDesktopMediaAutomationCommandLine(config: DesktopMediaAutomationConfig) {
  if (!config.enabled) {
    return
  }

  for (const commandLineSwitch of config.commandLineSwitches) {
    if (commandLineSwitch.value) {
      app.commandLine.appendSwitch(commandLineSwitch.name, commandLineSwitch.value)
    } else {
      app.commandLine.appendSwitch(commandLineSwitch.name)
    }
  }
}

function configureDesktopDisplayMedia(config: DesktopMediaAutomationConfig) {
  if (config.enabled) {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media')
    })
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
      permission === 'media',
    )
    console.log('opencord-desktop-media-e2e-ready')
  }

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void selectDesktopCaptureSource(config).then((source) => {
      if (!source) {
        callback({})
        return
      }

      if (config.enabled) {
        console.log(`opencord-desktop-e2e-display-source:${source.id}:${source.name}`)
      }
      callback({ video: source })
    })
  }, { useSystemPicker: false })
}

async function selectDesktopCaptureSource(config: DesktopMediaAutomationConfig) {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
  if (!config.enabled) {
    return selectDesktopCaptureSourceWithPicker(sources)
  }

  const preferredSourceName = config.preferredSourceName?.toLowerCase()
  if (preferredSourceName) {
    const preferredSource = sources.find((source) =>
      source.name.toLowerCase().includes(preferredSourceName),
    )
    if (preferredSource) {
      return preferredSource
    }
  }

  return sources.find((source) => source.id.startsWith('screen:')) ?? sources[0] ?? null
}

async function selectDesktopCaptureSourceWithPicker(sources: DesktopCapturerSource[]) {
  if (!mainWindow || mainWindow.isDestroyed() || sources.length === 0) {
    return null
  }

  showMainWindow()
  const request = desktopCapturePickerRequestFromSources(sources)
  mainWindow.webContents.send(DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL, request)
  const selectedSourceId = await waitForDesktopCapturePickerResponse(request.requestId)
  if (!selectedSourceId) {
    return null
  }

  return sources.find((source) => source.id === selectedSourceId) ?? null
}

function desktopCapturePickerRequestFromSources(
  sources: DesktopCapturerSource[],
): DesktopCapturePickerRequest {
  desktopCapturePickerSequence += 1
  return {
    requestId: `desktop-capture-${Date.now()}-${desktopCapturePickerSequence}`,
    sources: sources.slice(0, 80).map(desktopCaptureSourceForRenderer),
  }
}

function desktopCaptureSourceForRenderer(source: DesktopCapturerSource): DesktopCaptureSource {
  const thumbnail = source.thumbnail.isEmpty()
    ? null
    : source.thumbnail.resize({ width: 320 }).toDataURL()

  return {
    id: source.id,
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    name: source.name,
    thumbnailDataUrl: thumbnail,
  }
}

function waitForDesktopCapturePickerResponse(requestId: string) {
  return new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => {
      pendingDesktopCapturePickers.delete(requestId)
      resolve(null)
    }, 60_000)

    pendingDesktopCapturePickers.set(requestId, { resolve, timeout })
  })
}

function configureDesktopNativeShell() {
  refreshDesktopNativeShell()
}

function refreshDesktopNativeShell() {
  if (!app.isReady()) {
    return
  }

  refreshApplicationMenu()
  refreshTrayMenu()
}

function refreshApplicationMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildDesktopApplicationMenuTemplate(desktopClientState, {
        isDev: !app.isPackaged,
        quit: quitOpenCord,
        reload: () => mainWindow?.reload(),
        sendCommand: sendDesktopClientCommand,
        showWindow: showMainWindow,
        toggleDevTools: () => mainWindow?.webContents.toggleDevTools(),
      }),
    ),
  )
}

function refreshTrayMenu() {
  if (!tray) {
    tray = new Tray(openCordTrayIcon())
    tray.setTitle('OC')
    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide()
      } else {
        showMainWindow()
      }
      refreshDesktopNativeShell()
    })
  }

  tray.setToolTip('OpenCord')
  tray.setContextMenu(
    Menu.buildFromTemplate(
      buildDesktopTrayMenuTemplate(desktopClientState, {
        hideWindow: () => {
          mainWindow?.hide()
          refreshDesktopNativeShell()
        },
        isWindowVisible: mainWindow?.isVisible() ?? false,
        quit: quitOpenCord,
        sendCommand: sendDesktopClientCommand,
        showWindow: showMainWindow,
      }),
    ),
  )
}

function openCordTrayIcon() {
  const image = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSI0IiBmaWxsPSIjMDBhOTg4Ii8+PGNpcmNsZSBjeD0iOSIgY3k9IjkiIHI9IjUiIGZpbGw9IiMxNTE1MTUiLz48Y2lyY2xlIGN4PSI5IiBjeT0iOSIgcj0iMyIgZmlsbD0iIzAwZjk5NSIvPjwvc3ZnPg==',
  )
  image.setTemplateImage(true)
  return image
}

function showMainWindow() {
  if (!mainWindow) {
    void createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
  refreshDesktopNativeShell()
}

function quitOpenCord() {
  isQuitting = true
  app.quit()
}

function sendDesktopClientCommand(command: DesktopClientCommand) {
  showMainWindow()
  mainWindow?.webContents.send(DESKTOP_CLIENT_COMMAND_CHANNEL, command)
}

function sendDesktopLifecycleState(window: BrowserWindow) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return
  }

  window.webContents.send(DESKTOP_LIFECYCLE_STATE_CHANNEL, desktopLifecycleStateForWindow(window))
}

function desktopLifecycleStateForWindow(window: BrowserWindow): DesktopLifecycleState {
  const visibility = window.isMinimized()
    ? 'minimized'
    : window.isVisible()
      ? 'visible'
      : 'hidden'

  return {
    backgroundRealtime: !window.webContents.isDestroyed(),
    focused: window.isFocused(),
    visibility,
  }
}

function captureDesktopDeepLink(value: string | null) {
  if (!value) {
    return false
  }

  const route = parseDesktopDeepLinkRoute(value)
  if (!route) {
    return false
  }

  pendingDeepLinkRoute = route
  return true
}

function routeDesktopWindow(route: DesktopDeepLinkRoute) {
  pendingDeepLinkRoute = route
  if (!mainWindow) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
  flushPendingDeepLinkRoute(mainWindow)
}

function flushPendingDeepLinkRoute(window: BrowserWindow) {
  if (!pendingDeepLinkRoute) {
    return
  }

  window.webContents.send(DEEP_LINK_ROUTE_CHANNEL, pendingDeepLinkRoute)
  pendingDeepLinkRoute = null
}
