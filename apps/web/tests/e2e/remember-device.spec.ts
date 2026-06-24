import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
  test,
} from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import os from 'node:os'

const API_BASE_URL = process.env.OPENCORD_API_BASE_URL ?? 'http://localhost:8080'
const WEB_BASE_URL = process.env.OPENCORD_WEB_BASE_URL ?? 'http://localhost:5173'
const DESKTOP_MAIN_PATH =
  process.env.OPENCORD_DESKTOP_MAIN_PATH ??
  path.resolve(process.cwd(), '../desktop/dist/main.js')
const ANDROID_PACKAGE = 'com.opencord'
const IOS_APP_BUNDLE_ID = 'com.opencord'
const IOS_SIMULATOR_UDID =
  process.env.OPENCORD_PHASE11_IOS_UDID ??
  process.env.OPENCORD_PHASE10_IOS_UDID ??
  'E9313E00-DBAE-447F-BF3B-960F3E2586AB'
const IOS_APP_PATH =
  process.env.OPENCORD_PHASE11_IOS_APP_PATH ??
  process.env.OPENCORD_PHASE10_IOS_APP_PATH ??
  path.resolve(process.cwd(), '../mobile/ios/build/Build/Products/Debug-iphonesimulator/OpenCord.app')
const IOS_DEVELOPER_DIR =
  process.env.OPENCORD_IOS_DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer'
const MOBILE_E2E_PASSWORD = 'correct horse battery staple'
const EVIDENCE_ROOT =
  process.env.OPENCORD_PHASE11_EVIDENCE_DIR ??
  '<WORKSPACE>/opencord/output/phase-11-client-ui-feature-parity'
const EVIDENCE_DIR =
  process.env.OPENCORD_PHASE11_REMEMBER_E2E_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-11-remember-device-e2e`)
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, 'screenshots')
const LOG_DIR = path.join(EVIDENCE_DIR, 'logs')

type MobileE2EStateSnapshot = {
  accountEmail?: string | null
  receivedAt: string
  runId?: string | null
  screen?: string
  sequence: number
}

type MobileE2ECommandServer = {
  close: () => Promise<void>
  latestState: () => MobileE2EStateSnapshot | null
  stateUrl: string
  url: string
}

test.beforeAll(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  await mkdir(LOG_DIR, { recursive: true })
})

test('OC-11 browser remembers login after restart and skips restore when unchecked', async ({
  context,
  page,
}) => {
  const suffix = Date.now()
  const rememberedEmail = `remember-browser-${suffix}@example.com`
  const rememberedName = `Remember Browser ${suffix}`
  const sessionOnlyEmail = `session-browser-${suffix}@example.com`
  const sessionOnlyName = `Session Browser ${suffix}`

  await startLocalAlpha(page, {
    displayName: rememberedName,
    email: rememberedEmail,
    rememberDevice: true,
  })
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'browser-remember-login.png') })
  expect(await localAlphaSnapshot(page)).not.toContain('session-token')

  const restoredPage = await context.newPage()
  const restoredRefreshes = countRequests(restoredPage, '/auth/refresh')
  await restoredPage.goto('/')
  await expect(restoredPage.getByText(rememberedName)).toBeVisible({ timeout: 20_000 })
  await expect.poll(restoredRefreshes, { timeout: 10_000 }).toBeGreaterThan(0)
  await restoredPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'browser-remember-restored.png') })
  await restoredPage.close()

  await startLocalAlpha(page, {
    displayName: sessionOnlyName,
    email: sessionOnlyEmail,
    rememberDevice: false,
  })
  await expect(page.getByText(sessionOnlyName)).toBeVisible({ timeout: 20_000 })
  expect(await localAlphaSnapshot(page)).toBeNull()
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'browser-session-only-login.png') })

  const sessionOnlyRestart = await context.newPage()
  const sessionOnlyRefreshes = countRequests(sessionOnlyRestart, '/auth/refresh')
  await sessionOnlyRestart.goto('/')
  await expect(sessionOnlyRestart.getByText('API online')).toBeVisible({ timeout: 20_000 })
  await expect(sessionOnlyRestart.getByText(sessionOnlyName)).not.toBeVisible()
  expect(sessionOnlyRefreshes()).toBe(0)
  await sessionOnlyRestart.screenshot({
    path: path.join(SCREENSHOT_DIR, 'browser-session-only-after-restart.png'),
  })
  await sessionOnlyRestart.close()

  await writeFile(
    path.join(EVIDENCE_DIR, 'browser-result.md'),
    [
      '# Browser Remember Device E2E',
      '',
      `- Remembered user restored without re-entering password: ${rememberedEmail}`,
      `- Session-only user did not restore after restart: ${sessionOnlyEmail}`,
      `- Evidence directory: ${EVIDENCE_DIR}`,
      '',
    ].join('\n'),
  )
})

test('OC-11 Electron remembers login after restart and clears persistence when unchecked', async () => {
  test.skip(
    process.env.OPENCORD_PHASE11_ELECTRON_E2E !== '1',
    'Set OPENCORD_PHASE11_ELECTRON_E2E=1 after building apps/desktop to run Electron restart E2E.',
  )

  const suffix = Date.now()
  const userDataPath = path.join(os.tmpdir(), `opencord-electron-remember-${suffix}`)
  const rememberedEmail = `remember-electron-${suffix}@example.com`
  const rememberedName = `Remember Electron ${suffix}`
  const sessionOnlyEmail = `session-electron-${suffix}@example.com`
  const sessionOnlyName = `Session Electron ${suffix}`

  await rm(userDataPath, { force: true, recursive: true })

  let app = await launchElectron(userDataPath)
  let page = await app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 840 })
  await startLocalAlpha(page, {
    displayName: rememberedName,
    email: rememberedEmail,
    navigate: false,
    rememberDevice: true,
  })
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'electron-remember-login.png') })
  await app.close()

  app = await launchElectron(userDataPath)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 840 })
  const restoredRefreshes = countRequests(page, '/auth/refresh')
  await expect(page.getByText(rememberedName)).toBeVisible({ timeout: 25_000 })
  await expect.poll(restoredRefreshes, { timeout: 10_000 }).toBeGreaterThan(0)
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'electron-remember-restored.png') })

  await startLocalAlpha(page, {
    displayName: sessionOnlyName,
    email: sessionOnlyEmail,
    navigate: false,
    rememberDevice: false,
  })
  expect(await localAlphaSnapshot(page)).toBeNull()
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'electron-session-only-login.png') })
  await app.close()

  app = await launchElectron(userDataPath)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 840 })
  const sessionOnlyRefreshes = countRequests(page, '/auth/refresh')
  await expect(page.getByText('API online')).toBeVisible({ timeout: 25_000 })
  await expect(page.getByText(rememberedName)).not.toBeVisible()
  await expect(page.getByText(sessionOnlyName)).not.toBeVisible()
  expect(sessionOnlyRefreshes()).toBe(0)
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'electron-session-only-after-restart.png'),
  })
  await app.close()

  await writeFile(
    path.join(EVIDENCE_DIR, 'electron-result.md'),
    [
      '# Electron Remember Device E2E',
      '',
      `- Remembered user restored through secure bridge: ${rememberedEmail}`,
      `- Session-only user cleared prior desktop persistence: ${sessionOnlyEmail}`,
      `- User data path: ${userDataPath}`,
      '',
    ].join('\n'),
  )
})

test('OC-11 Android 15 remembers login after restart and skips restore when unchecked', async () => {
  test.setTimeout(240_000)
  test.skip(
    process.env.OPENCORD_PHASE11_ANDROID_E2E !== '1',
    'Set OPENCORD_PHASE11_ANDROID_E2E=1 with an installed Android app and running emulator.',
  )

  const suffix = Date.now()
  const rememberedEmail = `remember-android-${suffix}@example.com`
  const sessionOnlyEmail = `session-android-${suffix}@example.com`
  const rememberedRun = `oc-11-android-remember-${suffix}`
  const restoredRun = `oc-11-android-restored-${suffix}`
  const sessionRun = `oc-11-android-session-${suffix}`
  const sessionRestartRun = `oc-11-android-session-restart-${suffix}`
  const commandServer = await startMobileE2ECommandServer()

  try {
    await ensureMobileE2EAccount({
      displayName: `Remember Android ${suffix}`,
      email: rememberedEmail,
    })
    await ensureMobileE2EAccount({
      displayName: `Session Android ${suffix}`,
      email: sessionOnlyEmail,
    })

    await androidClearAndLaunchLogin({
      commandUrl: androidHostUrl(commandServer.url),
      email: rememberedEmail,
      rememberDevice: true,
      runId: rememberedRun,
    })
    const loginState = await waitForMobileE2EState(
      commandServer,
      (state) => state.runId === rememberedRun && state.screen === 'channels',
      90_000,
      'Android remembered login rendered channels',
    )
    expect(loginState.accountEmail).toBe(rememberedEmail)
    await writeFile(
      path.join(LOG_DIR, 'android-remember-login-state.json'),
      mobileE2EStateJson(loginState),
    )
    await writeAndroidScreenshot('android-remember-login.png')

    await adb(['shell', 'am', 'force-stop', ANDROID_PACKAGE])
    await androidLaunchRestoreOnly({
      commandUrl: androidHostUrl(commandServer.url),
      email: rememberedEmail,
      runId: restoredRun,
    })
    const restoredState = await waitForMobileE2EState(
      commandServer,
      (state) =>
        state.runId === restoredRun &&
        state.screen === 'channels' &&
        state.accountEmail === rememberedEmail,
      90_000,
      'Android restored remembered session after restart',
    )
    await writeFile(
      path.join(LOG_DIR, 'android-remember-restored-state.json'),
      mobileE2EStateJson(restoredState),
    )
    await writeAndroidScreenshot('android-remember-restored.png')

    await androidClearAndLaunchLogin({
      commandUrl: androidHostUrl(commandServer.url),
      email: sessionOnlyEmail,
      rememberDevice: false,
      runId: sessionRun,
    })
    await waitForMobileE2EState(
      commandServer,
      (state) => state.runId === sessionRun && state.screen === 'channels',
      90_000,
      'Android session-only login rendered channels',
    )
    await writeAndroidScreenshot('android-session-only-login.png')

    await adb(['shell', 'am', 'force-stop', ANDROID_PACKAGE])
    await androidLaunchRestoreOnly({
      commandUrl: androidHostUrl(commandServer.url),
      email: sessionOnlyEmail,
      runId: sessionRestartRun,
    })
    const sessionRestartState = await waitForStableMobileLoginScreen(
      commandServer,
      sessionRestartRun,
      10_000,
    )
    await writeFile(
      path.join(LOG_DIR, 'android-session-only-after-restart-state.json'),
      mobileE2EStateJson(sessionRestartState),
    )
    await writeAndroidScreenshot('android-session-only-after-restart.png')
  } finally {
    await commandServer.close()
  }
})

test('OC-11 iPhone 17 Pro Max iOS 26.5 remembers login after restart and skips restore when unchecked', async () => {
  test.setTimeout(300_000)
  test.skip(
    process.env.OPENCORD_PHASE11_IOS_E2E !== '1',
    'Set OPENCORD_PHASE11_IOS_E2E=1 with a built iOS simulator app.',
  )

  const suffix = Date.now()
  const rememberedEmail = `remember-ios-${suffix}@example.com`
  const sessionOnlyEmail = `session-ios-${suffix}@example.com`
  const rememberedRun = `oc-11-ios-remember-${suffix}`
  const restoredRun = `oc-11-ios-restored-${suffix}`
  const sessionRun = `oc-11-ios-session-${suffix}`
  const sessionRestartRun = `oc-11-ios-session-restart-${suffix}`
  const commandServer = await startMobileE2ECommandServer()

  try {
    await ensureMobileE2EAccount({
      displayName: `Remember iOS ${suffix}`,
      email: rememberedEmail,
    })
    await ensureMobileE2EAccount({
      displayName: `Session iOS ${suffix}`,
      email: sessionOnlyEmail,
    })

    await iosInstallFreshApp()
    await iosLaunchLogin({
      commandUrl: commandServer.url,
      email: rememberedEmail,
      rememberDevice: true,
      runId: rememberedRun,
    })
    const loginState = await waitForMobileE2EState(
      commandServer,
      (state) => state.runId === rememberedRun && state.screen === 'channels',
      120_000,
      'iOS remembered login rendered channels',
    )
    expect(loginState.accountEmail).toBe(rememberedEmail)
    await writeFile(path.join(LOG_DIR, 'ios-remember-login-state.json'), mobileE2EStateJson(loginState))
    await writeIosScreenshot('ios-remember-login.png')

    await iosSimctl(['terminate', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
    await iosLaunchRestoreOnly({
      commandUrl: commandServer.url,
      email: rememberedEmail,
      runId: restoredRun,
    })
    const restoredState = await waitForMobileE2EState(
      commandServer,
      (state) =>
        state.runId === restoredRun &&
        state.screen === 'channels' &&
        state.accountEmail === rememberedEmail,
      120_000,
      'iOS restored remembered session after restart',
    )
    await writeFile(
      path.join(LOG_DIR, 'ios-remember-restored-state.json'),
      mobileE2EStateJson(restoredState),
    )
    await writeIosScreenshot('ios-remember-restored.png')

    await iosInstallFreshApp()
    await iosLaunchLogin({
      commandUrl: commandServer.url,
      email: sessionOnlyEmail,
      rememberDevice: false,
      runId: sessionRun,
    })
    await waitForMobileE2EState(
      commandServer,
      (state) => state.runId === sessionRun && state.screen === 'channels',
      120_000,
      'iOS session-only login rendered channels',
    )
    await writeIosScreenshot('ios-session-only-login.png')

    await iosSimctl(['terminate', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
    await iosLaunchRestoreOnly({
      commandUrl: commandServer.url,
      email: sessionOnlyEmail,
      runId: sessionRestartRun,
    })
    const sessionRestartState = await waitForStableMobileLoginScreen(
      commandServer,
      sessionRestartRun,
      10_000,
    )
    await writeFile(
      path.join(LOG_DIR, 'ios-session-only-after-restart-state.json'),
      mobileE2EStateJson(sessionRestartState),
    )
    await writeIosScreenshot('ios-session-only-after-restart.png')
  } finally {
    await commandServer.close()
  }
})

async function startLocalAlpha(
  page: Page,
  input: { displayName: string; email: string; navigate?: boolean; rememberDevice: boolean },
) {
  if (input.navigate !== false) {
    await page.goto('/')
  }
  await expect(page.getByText('API online')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Local alpha email').fill(input.email)
  await page.getByLabel('Local alpha display name').fill(input.displayName)
  await page.getByLabel('Local alpha password').fill(MOBILE_E2E_PASSWORD)
  const checkbox = page.getByLabel('Remember this device')
  if ((await checkbox.isChecked()) !== input.rememberDevice) {
    await checkbox.click()
  }
  const authRequest = page.waitForRequest((request) => {
    const methodMatches = request.method() === 'POST'
    const pathMatches =
      request.url().endsWith('/auth/register') || request.url().endsWith('/auth/login')
    const body = request.postData() ?? ''
    return methodMatches && pathMatches && body.includes(`"remember_device":${input.rememberDevice}`)
  })
  await page.getByRole('button', { name: 'Start local alpha' }).click()
  await authRequest
  await expect(page.getByText(input.displayName)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: '# general' })).toBeVisible()
}

async function ensureMobileE2EAccount(input: { displayName: string; email: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    body: JSON.stringify({
      display_name: input.displayName,
      email: input.email,
      password: MOBILE_E2E_PASSWORD,
      remember_device: false,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (response.ok || response.status === 409) {
    return
  }

  throw new Error(
    `Failed to create native E2E account ${input.email}: ${response.status} ${await response.text()}`,
  )
}

function countRequests(page: Page, pathSuffix: string) {
  let count = 0
  page.on('request', (request) => {
    if (request.url().endsWith(pathSuffix)) {
      count += 1
    }
  })
  return () => count
}

async function localAlphaSnapshot(page: Page) {
  return page.evaluate(() => window.localStorage.getItem('opencord.localAlphaSession:v1'))
}

async function launchElectron(userDataPath: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [DESKTOP_MAIN_PATH],
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      OPENCORD_DESKTOP_RENDERER_URL: WEB_BASE_URL,
      OPENCORD_DESKTOP_USER_DATA_PATH: userDataPath,
    },
  })
}

async function androidClearAndLaunchLogin(input: {
  commandUrl: string
  email: string
  rememberDevice: boolean
  runId: string
}) {
  await adb(['shell', 'am', 'force-stop', ANDROID_PACKAGE])
  await adb(['shell', 'pm', 'clear', ANDROID_PACKAGE])
  await androidLaunchLogin(input)
}

async function androidLaunchLogin(input: {
  commandUrl: string
  email: string
  rememberDevice: boolean
  runId: string
}) {
  await adbShell([
    'am',
    'start',
    '-W',
    '-n',
    `${ANDROID_PACKAGE}/.MainActivity`,
    '--ez',
    'OPENCORD_MOBILE_E2E',
    'true',
    '--ez',
    'OPENCORD_E2E_REMEMBER_DEVICE',
    input.rememberDevice ? 'true' : 'false',
    '--es',
    'OPENCORD_E2E_SERVER_URL',
    androidHostUrl(API_BASE_URL),
    '--es',
    'OPENCORD_E2E_EMAIL',
    input.email,
    '--es',
    'OPENCORD_E2E_PASSWORD',
    MOBILE_E2E_PASSWORD,
    '--es',
    'OPENCORD_E2E_RUN_ID',
    input.runId,
    '--es',
    'OPENCORD_E2E_COMMAND_URL',
    input.commandUrl,
  ])
}

async function androidLaunchRestoreOnly(input: {
  commandUrl: string
  email: string
  runId: string
}) {
  await adbShell([
    'am',
    'start',
    '-W',
    '-n',
    `${ANDROID_PACKAGE}/.MainActivity`,
    '--ez',
    'OPENCORD_MOBILE_E2E',
    'true',
    '--ez',
    'OPENCORD_E2E_RESTORE_ONLY',
    'true',
    '--es',
    'OPENCORD_E2E_SERVER_URL',
    androidHostUrl(API_BASE_URL),
    '--es',
    'OPENCORD_E2E_EMAIL',
    input.email,
    '--es',
    'OPENCORD_E2E_RUN_ID',
    input.runId,
    '--es',
    'OPENCORD_E2E_COMMAND_URL',
    input.commandUrl,
  ])
}

async function iosInstallFreshApp() {
  await iosSimctl(['boot', IOS_SIMULATOR_UDID], { allowFailure: true })
  await iosSimctl(['bootstatus', IOS_SIMULATOR_UDID, '-b'])
  await iosSimctl(['terminate', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
  await iosSimctl(['uninstall', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
  await iosSimctl(['install', IOS_SIMULATOR_UDID, IOS_APP_PATH])
}

async function iosLaunchLogin(input: {
  commandUrl: string
  email: string
  rememberDevice: boolean
  runId: string
}) {
  await iosSimctl(
    [
      'launch',
      '--terminate-running-process',
      `--stdout=${path.join(LOG_DIR, `${input.runId}-ios-stdout.log`)}`,
      `--stderr=${path.join(LOG_DIR, `${input.runId}-ios-stderr.log`)}`,
      IOS_SIMULATOR_UDID,
      IOS_APP_BUNDLE_ID,
    ],
    {
      env: {
        SIMCTL_CHILD_OPENCORD_E2E_COMMAND_URL: input.commandUrl,
        SIMCTL_CHILD_OPENCORD_E2E_EMAIL: input.email,
        SIMCTL_CHILD_OPENCORD_E2E_PASSWORD: MOBILE_E2E_PASSWORD,
        SIMCTL_CHILD_OPENCORD_E2E_REMEMBER_DEVICE: input.rememberDevice ? '1' : '0',
        SIMCTL_CHILD_OPENCORD_E2E_RUN_ID: input.runId,
        SIMCTL_CHILD_OPENCORD_E2E_SERVER_URL: API_BASE_URL,
        SIMCTL_CHILD_OPENCORD_MOBILE_E2E: '1',
      },
    },
  )
}

async function iosLaunchRestoreOnly(input: {
  commandUrl: string
  email: string
  runId: string
}) {
  await iosSimctl(
    [
      'launch',
      '--terminate-running-process',
      `--stdout=${path.join(LOG_DIR, `${input.runId}-ios-stdout.log`)}`,
      `--stderr=${path.join(LOG_DIR, `${input.runId}-ios-stderr.log`)}`,
      IOS_SIMULATOR_UDID,
      IOS_APP_BUNDLE_ID,
    ],
    {
      env: {
        SIMCTL_CHILD_OPENCORD_E2E_COMMAND_URL: input.commandUrl,
        SIMCTL_CHILD_OPENCORD_E2E_EMAIL: input.email,
        SIMCTL_CHILD_OPENCORD_E2E_RESTORE_ONLY: '1',
        SIMCTL_CHILD_OPENCORD_E2E_RUN_ID: input.runId,
        SIMCTL_CHILD_OPENCORD_E2E_SERVER_URL: API_BASE_URL,
        SIMCTL_CHILD_OPENCORD_MOBILE_E2E: '1',
      },
    },
  )
}

async function waitForStableMobileLoginScreen(
  server: MobileE2ECommandServer,
  runId: string,
  stableMs: number,
) {
  const firstLoginState = await waitForMobileE2EState(
    server,
    (state) => state.runId === runId && state.screen === 'login',
    90_000,
    'mobile session-only restart stayed on login',
  )
  await delay(stableMs)
  const latest = server.latestState()
  expect(latest?.runId).toBe(runId)
  expect(latest?.screen).toBe('login')
  return latest ?? firstLoginState
}

async function startMobileE2ECommandServer(): Promise<MobileE2ECommandServer> {
  let latestState: MobileE2EStateSnapshot | null = null
  let stateSequence = 0
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/command')) {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      })
      response.end(JSON.stringify({ command: null, id: null }))
      return
    }

    if (request.url?.startsWith('/state')) {
      if (request.method === 'GET') {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
        })
        response.end(JSON.stringify(latestState ?? { state: null }))
        return
      }

      if (request.method === 'POST') {
        void readJsonRequest(request)
          .then((body) => {
            stateSequence += 1
            latestState = {
              ...(body && typeof body === 'object' ? body : {}),
              receivedAt: new Date().toISOString(),
              sequence: stateSequence,
            } as MobileE2EStateSnapshot
            response.writeHead(204, { 'Cache-Control': 'no-store' })
            response.end()
          })
          .catch((error: unknown) => {
            response.writeHead(400, {
              'Cache-Control': 'no-store',
              'Content-Type': 'application/json',
            })
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid state' }))
          })
        return
      }
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
    latestState: () => latestState,
    stateUrl: `http://127.0.0.1:${address.port}/state`,
    url: `http://127.0.0.1:${address.port}/command`,
  }
}

async function waitForMobileE2EState(
  server: MobileE2ECommandServer,
  predicate: (state: MobileE2EStateSnapshot) => boolean,
  timeoutMs: number,
  description: string,
) {
  const deadline = Date.now() + timeoutMs
  let latest: MobileE2EStateSnapshot | null = null
  while (Date.now() < deadline) {
    latest = server.latestState()
    if (latest && predicate(latest)) {
      return latest
    }
    await delay(500)
  }

  throw new Error(
    `Timed out waiting for mobile E2E state: ${description}\n${JSON.stringify(latest, null, 2)}`,
  )
}

async function readJsonRequest(request: IncomingMessage) {
  return await new Promise<unknown>((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'))
        request.destroy()
      }
    })
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

async function writeAndroidScreenshot(fileName: string) {
  const screenshot = await adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer' })
  await writeFile(path.join(SCREENSHOT_DIR, fileName), screenshot)
}

async function writeIosScreenshot(fileName: string) {
  await iosSimctl(['io', IOS_SIMULATOR_UDID, 'screenshot', path.join(SCREENSHOT_DIR, fileName)])
}

async function adb(
  args: string[],
  options: { allowFailure?: boolean; encoding?: 'buffer' | 'utf8' } = {},
): Promise<string>
async function adb(
  args: string[],
  options: { allowFailure?: boolean; encoding?: 'buffer' | 'utf8' },
): Promise<Buffer>
async function adb(
  args: string[],
  options: { allowFailure?: boolean; encoding?: 'buffer' | 'utf8' } = {},
) {
  return new Promise<string | Buffer>((resolve, reject) => {
    execFile(
      'adb',
      args,
      {
        encoding: options.encoding === 'buffer' ? 'buffer' : 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && !options.allowFailure) {
          reject(new Error(`adb ${args.join(' ')} failed: ${error.message}\n${String(stderr)}`))
          return
        }
        resolve(stdout)
      },
    )
  })
}

async function adbShell(args: string[], options: { allowFailure?: boolean } = {}) {
  return adb(['shell', args.map(shellQuote).join(' ')], options)
}

async function iosSimctl(
  args: string[],
  options: { allowFailure?: boolean; env?: NodeJS.ProcessEnv } = {},
) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      'xcrun',
      ['simctl', ...args],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DEVELOPER_DIR: IOS_DEVELOPER_DIR,
          ...options.env,
        },
        maxBuffer: 30 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && !options.allowFailure) {
          reject(new Error(`xcrun simctl ${args.join(' ')} failed: ${error.message}\n${String(stderr)}`))
          return
        }
        resolve(`${stdout}${stderr}`)
      },
    )
  })
}

function androidHostUrl(url: string) {
  return url.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2')
}

function mobileE2EStateJson(state: MobileE2EStateSnapshot) {
  return `${JSON.stringify(state, null, 2)}\n`
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function timestampForEvidence() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}
