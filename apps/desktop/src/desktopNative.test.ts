import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

import {
  DESKTOP_CLIENT_COMMAND_CHANNEL,
  DESKTOP_CLIENT_STATE_CHANNEL,
  DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL,
  DESKTOP_CAPTURE_PICKER_RESPONSE_CHANNEL,
  DESKTOP_LIFECYCLE_STATE_CHANNEL,
  buildDesktopApplicationMenuTemplate,
  buildDesktopTrayMenuTemplate,
  createEmptyDesktopClientState,
  desktopVoiceStatusLabel,
  isDesktopClientCommand,
  parseDesktopCapturePickerRequest,
  parseDesktopCapturePickerResponse,
  parseDesktopClientCommand,
  parseDesktopClientState,
  parseDesktopLifecycleState,
  type DesktopClientCommand,
} from './desktopNative'

describe('desktop native shell bridge', () => {
  it('uses dedicated IPC channels for desktop state and commands', () => {
    expect(DESKTOP_CLIENT_STATE_CHANNEL).toBe('opencord:desktop:client-state')
    expect(DESKTOP_CLIENT_COMMAND_CHANNEL).toBe('opencord:desktop:command')
    expect(DESKTOP_CAPTURE_PICKER_REQUEST_CHANNEL).toBe(
      'opencord:desktop-capture:picker-request',
    )
    expect(DESKTOP_CAPTURE_PICKER_RESPONSE_CHANNEL).toBe(
      'opencord:desktop-capture:picker-response',
    )
    expect(DESKTOP_LIFECYCLE_STATE_CHANNEL).toBe('opencord:desktop:lifecycle-state')
  })

  it('validates and normalizes non-secret renderer desktop state', () => {
    expect(parseDesktopClientState(validDesktopState())).toEqual(validDesktopState())
    expect(parseDesktopClientState({ ...validDesktopState(), token: 'secret' })).toEqual(
      validDesktopState(),
    )
    expect(parseDesktopClientState({ ...validDesktopState(), activeServer: null })).toBeNull()
    expect(parseDesktopClientState({ ...validDesktopState(), channels: new Array(81).fill({}) }))
      .toBeNull()
  })

  it('validates renderer command payloads before they cross the preload bridge', () => {
    expect(parseDesktopClientCommand({ kind: 'select-server', serverId: 'local' })).toEqual({
      kind: 'select-server',
      serverId: 'local',
    })
    expect(parseDesktopClientCommand({ kind: 'show-settings', panel: 'notifications' })).toEqual({
      kind: 'show-settings',
      panel: 'notifications',
    })
    expect(isDesktopClientCommand({ kind: 'voice-toggle-mute' })).toBe(true)
    expect(isDesktopClientCommand({ kind: 'show-settings', panel: 'secrets' })).toBe(false)
    expect(isDesktopClientCommand({ kind: 'select-server', serverId: '' })).toBe(false)
  })

  it('validates desktop capture picker requests and responses', () => {
    expect(
      parseDesktopCapturePickerRequest({
        requestId: 'capture-1',
        sources: [
          {
            id: 'screen:0:0',
            kind: 'screen',
            name: 'Entire Screen',
            thumbnailDataUrl: 'data:image/png;base64,abcd',
          },
          {
            id: 'window:123:0',
            kind: 'window',
            name: 'OpenCord',
            thumbnailDataUrl: null,
          },
        ],
      }),
    ).toEqual({
      requestId: 'capture-1',
      sources: [
        {
          id: 'screen:0:0',
          kind: 'screen',
          name: 'Entire Screen',
          thumbnailDataUrl: 'data:image/png;base64,abcd',
        },
        {
          id: 'window:123:0',
          kind: 'window',
          name: 'OpenCord',
          thumbnailDataUrl: null,
        },
      ],
    })
    expect(
      parseDesktopCapturePickerRequest({
        requestId: 'capture-1',
        sources: [{ id: 'screen:0:0', kind: 'camera', name: 'Camera', thumbnailDataUrl: null }],
      }),
    ).toBeNull()
    expect(
      parseDesktopCapturePickerRequest({
        requestId: 'capture-1',
        sources: [{ id: 'screen:0:0', kind: 'screen', name: 'Screen', thumbnailDataUrl: 'http://x' }],
      }),
    ).toBeNull()

    expect(
      parseDesktopCapturePickerResponse({ requestId: 'capture-1', sourceId: 'screen:0:0' }),
    ).toEqual({ requestId: 'capture-1', sourceId: 'screen:0:0' })
    expect(parseDesktopCapturePickerResponse({ requestId: 'capture-1', sourceId: null }))
      .toEqual({ requestId: 'capture-1', sourceId: null })
    expect(parseDesktopCapturePickerResponse({ requestId: '', sourceId: 'screen:0:0' }))
      .toBeNull()
  })

  it('validates desktop lifecycle state before it crosses the preload bridge', () => {
    expect(
      parseDesktopLifecycleState({
        backgroundRealtime: true,
        focused: false,
        visibility: 'hidden',
      }),
    ).toEqual({
      backgroundRealtime: true,
      focused: false,
      visibility: 'hidden',
    })
    expect(
      parseDesktopLifecycleState({
        backgroundRealtime: true,
        focused: false,
        visibility: 'minimized',
      }),
    ).toEqual({
      backgroundRealtime: true,
      focused: false,
      visibility: 'minimized',
    })
    expect(
      parseDesktopLifecycleState({
        backgroundRealtime: true,
        focused: false,
        visibility: 'background',
      }),
    ).toBeNull()
    expect(
      parseDesktopLifecycleState({
        backgroundRealtime: 'yes',
        focused: false,
        visibility: 'hidden',
      }),
    ).toBeNull()
  })

  it('builds a tray menu that mirrors server, channel, and voice state', () => {
    const sendCommand = vi.fn<(command: DesktopClientCommand) => void>()
    const menu = buildDesktopTrayMenuTemplate(validDesktopState(), {
      hideWindow: vi.fn(),
      isWindowVisible: true,
      quit: vi.fn(),
      sendCommand,
      showWindow: vi.fn(),
    })

    expect(menu.map((item) => item.label)).toContain('Hide OpenCord')
    expect(menu.map((item) => item.label)).toContain('Server: Local OpenCord')
    expect(menu.map((item) => item.label)).toContain('Channel: general')
    expect(menu.map((item) => item.label)).toContain('Voice: Standup (muted)')

    const muteItem = menu.find((item) => item.label === 'Unmute Microphone')
    expect(muteItem?.enabled).toBe(true)
    muteItem?.click?.(undefined as never, undefined as never, undefined as never)
    expect(sendCommand).toHaveBeenCalledWith({ kind: 'voice-toggle-mute' })
  })

  it('builds app menus for server switching, channel search, settings, and voice actions', () => {
    const sendCommand = vi.fn<(command: DesktopClientCommand) => void>()
    const menu = buildDesktopApplicationMenuTemplate(validDesktopState(), {
      isDev: true,
      quit: vi.fn(),
      reload: vi.fn(),
      sendCommand,
      showWindow: vi.fn(),
      toggleDevTools: vi.fn(),
    })

    expect(menu.map((item) => item.label)).toEqual([
      'OpenCord',
      'Server',
      'Channel',
      'Voice',
      'Settings',
      'View',
    ])

    const serverMenu = menu.find((item) => item.label === 'Server')?.submenu
    expect(Array.isArray(serverMenu)).toBe(true)
    const quickSearch = (serverMenu as MenuItemConstructorOptions[]).find(
      (item) => item.label === 'Quick Channel Search',
    )
    quickSearch?.click?.(undefined as never, undefined as never, undefined as never)
    expect(sendCommand).toHaveBeenCalledWith({ kind: 'show-channel-search' })

    const voiceMenu = menu.find((item) => item.label === 'Voice')?.submenu
    const leaveVoice = (voiceMenu as MenuItemConstructorOptions[]).find(
      (item) => item.label === 'Leave Voice',
    )
    expect(leaveVoice?.enabled).toBe(true)
  })

  it('keeps empty state menus disabled until renderer state arrives', () => {
    const state = createEmptyDesktopClientState()
    expect(desktopVoiceStatusLabel(state)).toBe('Not connected')

    const menu = buildDesktopTrayMenuTemplate(state, {
      hideWindow: vi.fn(),
      isWindowVisible: false,
      quit: vi.fn(),
      sendCommand: vi.fn(),
      showWindow: vi.fn(),
    })

    expect(menu.map((item) => item.label)).toContain('Show OpenCord')
    expect(menu.find((item) => item.label === 'Mute Microphone')?.enabled).toBe(false)
  })
})

function validDesktopState() {
  return {
    activeChannel: {
      id: 'general',
      kind: 'text' as const,
      name: 'general',
      spaceId: 'opencord',
    },
    activeServer: {
      active: true,
      id: 'local-opencord',
      name: 'Local OpenCord',
      url: 'http://localhost:8080',
    },
    activeSpace: {
      id: 'opencord',
      name: 'OpenCord',
    },
    channels: [
      {
        id: 'general',
        kind: 'text' as const,
        name: 'general',
        spaceId: 'opencord',
      },
      {
        id: 'standup',
        kind: 'voice' as const,
        name: 'Standup',
        spaceId: 'opencord',
      },
    ],
    servers: [
      {
        active: true,
        id: 'local-opencord',
        name: 'Local OpenCord',
        url: 'http://localhost:8080',
      },
    ],
    voice: {
      channelId: 'standup',
      channelName: 'Standup',
      connected: true,
      deafened: false,
      muted: true,
      screenSharing: false,
    },
  }
}
