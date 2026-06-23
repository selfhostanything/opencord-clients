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

  it('receives realtime channel messages and marks unopened channels unread', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const state = mobileReducer(inGeneral, {
      type: 'realtime.message_created',
      envelope: {
        id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc96',
        type: 'message.created',
        organization_id: 'org-1',
        scope: { space_id: 'space-1', channel_id: 'backend' },
        occurred_at: '2026-06-23T02:00:00.000Z',
        data: {
          message: {
            id: 'msg-1',
            channel_id: 'backend',
            author_user_id: 'user-2',
            content: 'Backend deploy finished',
          },
        },
      },
    })

    expect(state.messages.at(-1)).toMatchObject({
      id: 'msg-1',
      channelId: 'backend',
      authorName: 'user-2',
      content: 'Backend deploy finished',
      own: false,
    })
    expect(state.channels.find((channel) => channel.id === 'backend')?.unread).toBe(true)
  })

  it('receives realtime messages in the open channel without unread noise', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inBackend = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'backend' })
    const state = mobileReducer(inBackend, {
      type: 'realtime.message_created',
      envelope: {
        id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc96',
        type: 'message.created',
        organization_id: 'org-1',
        scope: { space_id: 'space-1', channel_id: 'backend' },
        occurred_at: '2026-06-23T02:00:00.000Z',
        data: {
          message: {
            id: 'msg-2',
            channel_id: 'backend',
            author_user_id: 'user-2',
            content: 'Watching logs now',
          },
        },
      },
    })

    expect(state.messages.at(-1)?.content).toBe('Watching logs now')
    expect(state.channels.find((channel) => channel.id === 'backend')?.unread).toBe(false)
  })
})
