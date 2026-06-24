import type { MenuItemConstructorOptions } from 'electron'

export const DESKTOP_CLIENT_STATE_CHANNEL = 'opencord:desktop:client-state'
export const DESKTOP_CLIENT_COMMAND_CHANNEL = 'opencord:desktop:command'
export const DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL =
  'opencord:desktop-capture:picker-request'
export const DESKTOP_CAPTURE_PICKER_RESPONSE_CHANNEL =
  'opencord:desktop-capture:picker-response'

export type DesktopSettingsPanel =
  | 'account'
  | 'server-connections'
  | 'voice-video'
  | 'privacy-permissions'
  | 'notifications'
  | 'appearance'
  | 'developer'
  | 'native-call-integration'

export type DesktopClientServer = {
  active: boolean
  id: string
  name: string
  url: string
}

export type DesktopClientSpace = {
  id: string
  name: string
}

export type DesktopClientChannel = {
  id: string
  kind: 'text' | 'voice'
  name: string
  spaceId: string
}

export type DesktopClientVoiceState = {
  channelId: string | null
  channelName: string | null
  connected: boolean
  deafened: boolean
  muted: boolean
  screenSharing: boolean
}

export type DesktopClientState = {
  activeChannel: DesktopClientChannel | null
  activeServer: DesktopClientServer
  activeSpace: DesktopClientSpace | null
  channels: DesktopClientChannel[]
  servers: DesktopClientServer[]
  voice: DesktopClientVoiceState
}

export type DesktopClientCommand =
  | { kind: 'select-server'; serverId: string }
  | { kind: 'select-channel'; channelId: string }
  | { kind: 'show-channel-search' }
  | { kind: 'show-settings'; panel: DesktopSettingsPanel }
  | { kind: 'voice-toggle-mute' }
  | { kind: 'voice-toggle-deafen' }
  | { kind: 'voice-leave' }
  | { kind: 'screen-share-toggle' }

export type DesktopCaptureSource = {
  id: string
  kind: 'screen' | 'window'
  name: string
  thumbnailDataUrl: string | null
}

export type DesktopCapturePickerRequest = {
  requestId: string
  sources: DesktopCaptureSource[]
}

export type DesktopCapturePickerResponse = {
  requestId: string
  sourceId: string | null
}

type NativeMenuOptions = {
  isDev: boolean
  quit: () => void
  reload: () => void
  sendCommand: (command: DesktopClientCommand) => void
  showWindow: () => void
  toggleDevTools: () => void
}

type TrayMenuOptions = {
  hideWindow: () => void
  isWindowVisible: boolean
  quit: () => void
  sendCommand: (command: DesktopClientCommand) => void
  showWindow: () => void
}

const settingsPanels = new Set<DesktopSettingsPanel>([
  'account',
  'server-connections',
  'voice-video',
  'privacy-permissions',
  'notifications',
  'appearance',
  'developer',
  'native-call-integration',
])

export function createEmptyDesktopClientState(): DesktopClientState {
  const activeServer = {
    active: true,
    id: 'local-opencord',
    name: 'Local OpenCord',
    url: 'http://localhost:8080',
  }

  return {
    activeChannel: null,
    activeServer,
    activeSpace: null,
    channels: [],
    servers: [activeServer],
    voice: {
      channelId: null,
      channelName: null,
      connected: false,
      deafened: false,
      muted: false,
      screenSharing: false,
    },
  }
}

export function parseDesktopClientState(value: unknown): DesktopClientState | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const activeServer = parseDesktopClientServer(payload.activeServer)
  const servers = arrayValue(payload.servers, parseDesktopClientServer, 12)
  const channels = arrayValue(payload.channels, parseDesktopClientChannel, 80)
  const voice = parseDesktopClientVoiceState(payload.voice)
  if (!activeServer || !servers || !channels || !voice) {
    return null
  }

  const activeSpace = parseNullable(payload.activeSpace, parseDesktopClientSpace)
  const activeChannel = parseNullable(payload.activeChannel, parseDesktopClientChannel)
  if (activeSpace === undefined || activeChannel === undefined) {
    return null
  }

  const normalizedServers = servers.some((server) => server.id === activeServer.id)
    ? servers
    : [activeServer, ...servers]

  return {
    activeChannel,
    activeServer: { ...activeServer, active: true },
    activeSpace,
    channels,
    servers: normalizedServers.map((server) => ({
      ...server,
      active: server.id === activeServer.id,
    })),
    voice,
  }
}

export function isDesktopClientCommand(value: unknown): value is DesktopClientCommand {
  return parseDesktopClientCommand(value) !== null
}

export function parseDesktopClientCommand(value: unknown): DesktopClientCommand | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  switch (payload.kind) {
    case 'select-server': {
      const serverId = nonEmptyString(payload.serverId)
      return serverId ? { kind: payload.kind, serverId } : null
    }
    case 'select-channel': {
      const channelId = nonEmptyString(payload.channelId)
      return channelId ? { kind: payload.kind, channelId } : null
    }
    case 'show-channel-search':
    case 'voice-toggle-mute':
    case 'voice-toggle-deafen':
    case 'voice-leave':
    case 'screen-share-toggle':
      return { kind: payload.kind }
    case 'show-settings': {
      const panel = nonEmptyString(payload.panel)
      return panel && settingsPanels.has(panel as DesktopSettingsPanel)
        ? { kind: payload.kind, panel: panel as DesktopSettingsPanel }
        : null
    }
    default:
      return null
  }
}

export function parseDesktopCapturePickerRequest(
  value: unknown,
): DesktopCapturePickerRequest | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const requestId = nonEmptyString(payload.requestId)
  const sources = arrayValue(payload.sources, parseDesktopCaptureSource, 80)
  if (!requestId || !sources) {
    return null
  }

  return { requestId, sources }
}

export function parseDesktopCapturePickerResponse(
  value: unknown,
): DesktopCapturePickerResponse | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const requestId = nonEmptyString(payload.requestId)
  if (!requestId) {
    return null
  }

  if (payload.sourceId === null) {
    return { requestId, sourceId: null }
  }

  const sourceId = nonEmptyString(payload.sourceId)
  return sourceId ? { requestId, sourceId } : null
}

export function buildDesktopTrayMenuTemplate(
  state: DesktopClientState,
  options: TrayMenuOptions,
): MenuItemConstructorOptions[] {
  const voiceConnected = state.voice.connected
  const showHideLabel = options.isWindowVisible ? 'Hide OpenCord' : 'Show OpenCord'

  return [
    {
      click: options.isWindowVisible ? options.hideWindow : options.showWindow,
      label: showHideLabel,
    },
    { type: 'separator' },
    {
      enabled: false,
      label: `Server: ${menuText(state.activeServer.name, 'OpenCord')}`,
    },
    {
      enabled: false,
      label: `Channel: ${menuText(state.activeChannel?.name, 'No channel')}`,
    },
    {
      enabled: false,
      label: `Voice: ${desktopVoiceStatusLabel(state)}`,
    },
    { type: 'separator' },
    {
      enabled: voiceConnected,
      label: state.voice.muted ? 'Unmute Microphone' : 'Mute Microphone',
      click: () => options.sendCommand({ kind: 'voice-toggle-mute' }),
    },
    {
      enabled: voiceConnected,
      label: state.voice.deafened ? 'Undeafen Audio' : 'Deafen Audio',
      click: () => options.sendCommand({ kind: 'voice-toggle-deafen' }),
    },
    {
      enabled: voiceConnected,
      label: 'Leave Voice',
      click: () => options.sendCommand({ kind: 'voice-leave' }),
    },
    { type: 'separator' },
    { click: options.quit, label: 'Quit OpenCord' },
  ]
}

export function buildDesktopApplicationMenuTemplate(
  state: DesktopClientState,
  options: NativeMenuOptions,
): MenuItemConstructorOptions[] {
  return [
    {
      label: 'OpenCord',
      submenu: [
        { click: options.showWindow, label: 'Show OpenCord' },
        { type: 'separator' },
        { click: options.quit, label: 'Quit OpenCord', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'Server',
      submenu: [
        {
          label: 'Switch Server',
          submenu: state.servers.map((server) => ({
            checked: server.active,
            click: () => options.sendCommand({ kind: 'select-server', serverId: server.id }),
            label: menuText(server.name, server.url),
            type: 'radio',
          })),
        },
        { type: 'separator' },
        { click: () => options.sendCommand({ kind: 'show-channel-search' }), label: 'Quick Channel Search', accelerator: 'CmdOrCtrl+K' },
      ],
    },
    {
      label: 'Channel',
      submenu: [
        {
          label: 'Text Channels',
          submenu: channelMenuItems(state, 'text', options),
        },
        {
          label: 'Voice Channels',
          submenu: channelMenuItems(state, 'voice', options),
        },
      ],
    },
    {
      label: 'Voice',
      submenu: [
        {
          enabled: state.voice.connected,
          label: state.voice.muted ? 'Unmute Microphone' : 'Mute Microphone',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => options.sendCommand({ kind: 'voice-toggle-mute' }),
        },
        {
          enabled: state.voice.connected,
          label: state.voice.deafened ? 'Undeafen Audio' : 'Deafen Audio',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => options.sendCommand({ kind: 'voice-toggle-deafen' }),
        },
        {
          enabled: state.voice.connected,
          label: 'Leave Voice',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => options.sendCommand({ kind: 'voice-leave' }),
        },
        { type: 'separator' },
        {
          enabled: state.voice.connected,
          label: state.voice.screenSharing ? 'Stop Screen Share' : 'Share Screen',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => options.sendCommand({ kind: 'screen-share-toggle' }),
        },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        {
          click: () => options.sendCommand({ kind: 'show-settings', panel: 'voice-video' }),
          label: 'Voice & Video',
        },
        {
          click: () => options.sendCommand({ kind: 'show-settings', panel: 'notifications' }),
          label: 'Notifications',
        },
        {
          click: () => options.sendCommand({ kind: 'show-settings', panel: 'server-connections' }),
          label: 'Server Connections',
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { click: options.reload, label: 'Reload', accelerator: 'CmdOrCtrl+R' },
        {
          click: options.toggleDevTools,
          enabled: options.isDev,
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CmdOrCtrl+I',
        },
      ],
    },
  ]
}

export function desktopVoiceStatusLabel(state: DesktopClientState) {
  if (!state.voice.connected) {
    return 'Not connected'
  }

  const flags = [
    state.voice.muted ? 'muted' : null,
    state.voice.deafened ? 'deafened' : null,
    state.voice.screenSharing ? 'sharing' : null,
  ].filter(Boolean)
  const suffix = flags.length > 0 ? ` (${flags.join(', ')})` : ''
  return `${state.voice.channelName ?? 'Voice'}${suffix}`
}

function channelMenuItems(
  state: DesktopClientState,
  kind: DesktopClientChannel['kind'],
  options: NativeMenuOptions,
): MenuItemConstructorOptions[] {
  const channels = state.channels.filter((channel) => channel.kind === kind)
  if (channels.length === 0) {
    return [{ enabled: false, label: 'No channels' }]
  }

  return channels.map((channel) => ({
    checked: state.activeChannel?.id === channel.id,
    click: () => options.sendCommand({ kind: 'select-channel', channelId: channel.id }),
    label: kind === 'text' ? `# ${menuText(channel.name, channel.id)}` : menuText(channel.name, channel.id),
    type: 'radio',
  }))
}

function parseDesktopClientServer(value: unknown): DesktopClientServer | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const id = nonEmptyString(payload.id)
  const name = nonEmptyString(payload.name)
  const url = nonEmptyString(payload.url)
  if (!id || !name || !url || typeof payload.active !== 'boolean') {
    return null
  }

  return { active: payload.active, id, name, url }
}

function parseDesktopClientSpace(value: unknown): DesktopClientSpace | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const id = nonEmptyString(payload.id)
  const name = nonEmptyString(payload.name)
  return id && name ? { id, name } : null
}

function parseDesktopClientChannel(value: unknown): DesktopClientChannel | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const id = nonEmptyString(payload.id)
  const name = nonEmptyString(payload.name)
  const spaceId = nonEmptyString(payload.spaceId)
  if (!id || !name || !spaceId || (payload.kind !== 'text' && payload.kind !== 'voice')) {
    return null
  }

  return { id, kind: payload.kind, name, spaceId }
}

function parseDesktopClientVoiceState(value: unknown): DesktopClientVoiceState | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const channelId = nullableString(payload.channelId)
  const channelName = nullableString(payload.channelName)
  if (channelId === undefined || channelName === undefined) {
    return null
  }

  if (
    typeof payload.connected !== 'boolean' ||
    typeof payload.deafened !== 'boolean' ||
    typeof payload.muted !== 'boolean' ||
    typeof payload.screenSharing !== 'boolean'
  ) {
    return null
  }

  return {
    channelId,
    channelName,
    connected: payload.connected,
    deafened: payload.deafened,
    muted: payload.muted,
    screenSharing: payload.screenSharing,
  }
}

function parseDesktopCaptureSource(value: unknown): DesktopCaptureSource | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const id = nonEmptyString(payload.id)
  const name = nonEmptyString(payload.name)
  const thumbnailDataUrl = nullableDataUrl(payload.thumbnailDataUrl)
  if (
    !id ||
    !name ||
    (payload.kind !== 'screen' && payload.kind !== 'window') ||
    thumbnailDataUrl === undefined
  ) {
    return null
  }

  return {
    id,
    kind: payload.kind,
    name,
    thumbnailDataUrl,
  }
}

function parseNullable<T>(
  value: unknown,
  parser: (candidate: unknown) => T | null,
): T | null | undefined {
  if (value === null) {
    return null
  }

  return parser(value) ?? undefined
}

function arrayValue<T>(
  value: unknown,
  parser: (candidate: unknown) => T | null,
  maxLength: number,
): T[] | null {
  if (!Array.isArray(value) || value.length > maxLength) {
    return null
  }

  const parsed = value.map(parser)
  return parsed.every((item): item is T => item !== null) ? parsed : null
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? cleanString(value) : null
}

function nullableString(value: unknown) {
  if (value === null) {
    return null
  }

  return typeof value === 'string' && value.trim().length > 0 ? cleanString(value) : undefined
}

function nullableDataUrl(value: unknown) {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  if (
    normalized === '' ||
    normalized.length > 1_500_000 ||
    !normalized.startsWith('data:image/')
  ) {
    return undefined
  }

  return normalized
}

function cleanString(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function menuText(value: string | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, ' ').trim() || fallback
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized
}
