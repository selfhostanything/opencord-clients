import { contextBridge, ipcRenderer } from 'electron'

import {
  DEVICE_SESSION_SECRET_GET_CHANNEL,
  DEVICE_SESSION_SECRET_REMOVE_CHANNEL,
  DEVICE_SESSION_SECRET_SET_CHANNEL,
  isDeviceSessionSecretKey,
} from './deviceSessionSecretBridge'
import {
  DESKTOP_CLIENT_COMMAND_CHANNEL,
  DESKTOP_CLIENT_STATE_CHANNEL,
  DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL,
  DESKTOP_CAPTURE_PICKER_RESPONSE_CHANNEL,
  isDesktopClientCommand,
  DESKTOP_LIFECYCLE_STATE_CHANNEL,
  parseDesktopCapturePickerRequest,
  parseDesktopCapturePickerResponse,
  parseDesktopClientState,
  parseDesktopLifecycleState,
  type DesktopClientCommand,
  type DesktopClientState,
  type DesktopCapturePickerRequest,
  type DesktopCapturePickerResponse,
  type DesktopLifecycleState,
} from './desktopNative'
import {
  DEEP_LINK_ROUTE_CHANNEL,
  isDesktopDeepLinkRoute,
  type DesktopDeepLinkRoute,
} from './deepLinks'

type MessageNotificationPayload = {
  channelName: string
  authorName: string
  body: string
  own: boolean
  notificationLink?: string
}

const MESSAGE_NOTIFICATION_CHANNEL = 'opencord:notification:message'

contextBridge.exposeInMainWorld('openCordDesktop', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome ?? 'unknown',
    electron: process.versions.electron ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
  notifications: {
    showMessage(payload: MessageNotificationPayload) {
      if (!isMessageNotificationPayload(payload)) {
        return Promise.resolve(false)
      }

      return ipcRenderer.invoke(MESSAGE_NOTIFICATION_CHANNEL, payload) as Promise<boolean>
    },
  },
  desktopState: {
    update(payload: DesktopClientState) {
      const state = parseDesktopClientState(payload)
      if (!state) {
        return Promise.resolve(false)
      }

      return ipcRenderer.invoke(DESKTOP_CLIENT_STATE_CHANNEL, state) as Promise<boolean>
    },
  },
  desktopCommands: {
    onCommand(handler: (command: DesktopClientCommand) => void) {
      if (typeof handler !== 'function') {
        return () => undefined
      }

      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isDesktopClientCommand(payload)) {
          handler(payload)
        }
      }

      ipcRenderer.on(DESKTOP_CLIENT_COMMAND_CHANNEL, listener)
      return () => {
        ipcRenderer.removeListener(DESKTOP_CLIENT_COMMAND_CHANNEL, listener)
      }
    },
  },
  screenShare: {
    onPickerRequest(handler: (request: DesktopCapturePickerRequest) => void) {
      if (typeof handler !== 'function') {
        return () => undefined
      }

      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        const request = parseDesktopCapturePickerRequest(payload)
        if (request) {
          handler(request)
        }
      }

      ipcRenderer.on(DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL, listener)
      return () => {
        ipcRenderer.removeListener(DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL, listener)
      }
    },
    respond(response: DesktopCapturePickerResponse) {
      const payload = parseDesktopCapturePickerResponse(response)
      if (!payload) {
        return Promise.resolve(false)
      }

      return ipcRenderer.invoke(DESKTOP_CAPTURE_PICKER_RESPONSE_CHANNEL, payload) as Promise<boolean>
    },
  },
  lifecycle: {
    onState(handler: (state: DesktopLifecycleState) => void) {
      if (typeof handler !== 'function') {
        return () => undefined
      }

      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        const state = parseDesktopLifecycleState(payload)
        if (state) {
          handler(state)
        }
      }

      ipcRenderer.on(DESKTOP_LIFECYCLE_STATE_CHANNEL, listener)
      return () => {
        ipcRenderer.removeListener(DESKTOP_LIFECYCLE_STATE_CHANNEL, listener)
      }
    },
  },
  deviceSessions: {
    getSecret(key: string) {
      if (!isDeviceSessionSecretKey(key)) {
        return Promise.resolve(null)
      }

      return ipcRenderer.invoke(DEVICE_SESSION_SECRET_GET_CHANNEL, key) as Promise<string | null>
    },
    removeSecret(key: string) {
      if (!isDeviceSessionSecretKey(key)) {
        return Promise.resolve(false)
      }

      return ipcRenderer.invoke(DEVICE_SESSION_SECRET_REMOVE_CHANNEL, key) as Promise<boolean>
    },
    setSecret(key: string, value: string) {
      if (!isDeviceSessionSecretKey(key) || typeof value !== 'string') {
        return Promise.resolve(false)
      }

      return ipcRenderer.invoke(DEVICE_SESSION_SECRET_SET_CHANNEL, key, value) as Promise<boolean>
    },
  },
  deepLinks: {
    onRoute(handler: (route: DesktopDeepLinkRoute) => void) {
      if (typeof handler !== 'function') {
        return () => undefined
      }

      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isDesktopDeepLinkRoute(payload)) {
          handler(payload)
        }
      }

      ipcRenderer.on(DEEP_LINK_ROUTE_CHANNEL, listener)
      return () => {
        ipcRenderer.removeListener(DEEP_LINK_ROUTE_CHANNEL, listener)
      }
    },
  },
})

function isMessageNotificationPayload(value: unknown): value is MessageNotificationPayload {
  if (!isObject(value)) {
    return false
  }

  return (
    isNonEmptyString(value.channelName) &&
    isNonEmptyString(value.authorName) &&
    isNonEmptyString(value.body) &&
    typeof value.own === 'boolean' &&
    optionalNotificationLinkIsValid(value.notificationLink)
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalNotificationLinkIsValid(value: unknown) {
  if (value === undefined) {
    return true
  }
  if (typeof value !== 'string') {
    return false
  }

  try {
    const url = new URL(value)
    const isOpenCordNotification = url.protocol === 'opencord:' && url.host === 'notification'
    const isUniversalNotification =
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.pathname.replace(/\/+$/, '') === '/notification'

    return isOpenCordNotification || isUniversalNotification
  } catch {
    return false
  }
}
