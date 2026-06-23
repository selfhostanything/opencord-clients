import { describe, expect, it } from 'vitest'

import { createInitialMobileState, mobileReducer } from './mobileState'

describe('mobile app state', () => {
  it('starts on the login screen with default OpenCord server data', () => {
    const state = createInitialMobileState()

    expect(state.screen).toBe('login')
    expect(state.serverUrl).toBe('http://localhost:8080')
    expect(state.channels.map((channel) => channel.name)).toContain('general')
  })

  it('logs in to a selected server and shows channels', () => {
    const state = mobileReducer(
      createInitialMobileState(),
      {
        type: 'login.submit',
        serverUrl: 'https://chat.example.com',
        email: 'user@example.com',
      },
    )

    expect(state.screen).toBe('channels')
    expect(state.serverUrl).toBe('https://chat.example.com')
    expect(state.account?.email).toBe('user@example.com')
  })

  it('selects a channel and opens chat', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const state = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'backend' })

    expect(state.screen).toBe('chat')
    expect(state.selectedChannelId).toBe('backend')
  })

  it('adds local messages to the selected channel', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inChannel = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const state = mobileReducer(inChannel, {
      type: 'message.send',
      content: 'Hello from mobile',
    })

    expect(state.messages.at(-1)).toMatchObject({
      channelId: 'general',
      authorName: 'You',
      content: 'Hello from mobile',
      own: true,
    })
  })
})
