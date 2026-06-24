import { describe, expect, it, beforeEach } from 'vitest'

import type { OpenCordRouteTarget } from '@opencord/client-contracts'

import {
  clearMobileRuntimeStores,
  resetMobileStoresForTest,
  useMobileChatStore,
  useMobileMeetingsStore,
  useMobileSessionStore,
  useMobileSettingsStore,
  useMobileVoiceStore,
} from './mobileStores'

describe('mobile Zustand stores', () => {
  beforeEach(() => {
    resetMobileStoresForTest()
  })

  it('stores non-secret session route state without retaining auth tokens', () => {
    const channelRoute: OpenCordRouteTarget = {
      kind: 'channel',
      serverId: 'local-opencord',
      organizationId: 'org-1',
      spaceId: 'space-1',
      channelId: 'general',
    }

    useMobileSessionStore.getState().setAccountMetadata({
      displayName: 'Ada',
      email: 'ada@example.com',
    })
    useMobileSessionStore.getState().setRouteTarget(channelRoute)

    expect(useMobileSessionStore.getState()).toMatchObject({
      account: {
        displayName: 'Ada',
        email: 'ada@example.com',
      },
      activeServerId: 'local-opencord',
      selectedOrganizationId: 'org-1',
      selectedSpaceId: 'space-1',
      selectedChannelId: 'general',
      routePath: '/servers/local-opencord/spaces/space-1/channels/general',
    })
    expect('sessionToken' in useMobileSessionStore.getState()).toBe(false)
  })

  it('tracks composer, reply/edit state, pending attachments, and unread markers', () => {
    useMobileChatStore.getState().setComposerText('general', 'Ship it')
    useMobileChatStore.getState().beginReply({ channelId: 'general', messageId: 'msg-1' })
    useMobileChatStore.getState().openMessageActions({ channelId: 'general', messageId: 'msg-1' })
    useMobileChatStore.getState().setPendingAttachments('general', [
      {
        id: 'local-file-1',
        fileName: 'diagram.png',
        contentType: 'image/png',
        uploadProgress: 0,
        uploadStatus: 'ready',
        sizeBytes: 1200,
        localUri: 'file:///tmp/diagram.png',
      },
    ])
    useMobileChatStore.getState().markChannelUnread('backend')

    expect(useMobileChatStore.getState()).toMatchObject({
      composerTextByChannelId: {
        general: 'Ship it',
      },
      replyTarget: {
        channelId: 'general',
        messageId: 'msg-1',
      },
      pendingAttachmentsByChannelId: {
        general: [
          {
            id: 'local-file-1',
            fileName: 'diagram.png',
            contentType: 'image/png',
            uploadProgress: 0,
            uploadStatus: 'ready',
            sizeBytes: 1200,
            localUri: 'file:///tmp/diagram.png',
          },
        ],
      },
      messageActionSheetTarget: {
        channelId: 'general',
        messageId: 'msg-1',
      },
      unreadChannelIds: ['backend'],
    })

    useMobileChatStore.getState().beginEdit({ channelId: 'general', messageId: 'msg-2' })
    expect(useMobileChatStore.getState().editTarget).toEqual({
      channelId: 'general',
      messageId: 'msg-2',
    })
    expect(useMobileChatStore.getState().replyTarget).toBeNull()

    useMobileChatStore.getState().clearDraftTarget()
    expect(useMobileChatStore.getState().editTarget).toBeNull()
    expect(useMobileChatStore.getState().replyTarget).toBeNull()
    expect(useMobileChatStore.getState().messageActionSheetTarget).toBeNull()
  })

  it('tracks mobile meeting list, detail, form, and local reminders', () => {
    useMobileMeetingsStore.getState().setMeetings([
      mobileMeetingFixture({
        id: 'meeting-cancelled',
        status: 'cancelled',
        title: 'Cancelled sync',
      }),
      mobileMeetingFixture({
        id: 'meeting-1',
        title: 'Roadmap Review',
      }),
    ])
    useMobileMeetingsStore.getState().selectMeeting('meeting-1')
    useMobileMeetingsStore.getState().openCreateForm({
      channelId: 'general',
      defaultStartsAt: '2026-06-25T10:00',
      defaultEndsAt: '2026-06-25T10:30',
      organizationId: 'org-1',
      spaceId: 'space-1',
    })
    useMobileMeetingsStore.getState().setFormField('title', 'Mobile standup')
    useMobileMeetingsStore.getState().setFormField('reminderOffsetMinutes', 15)

    expect(useMobileMeetingsStore.getState()).toMatchObject({
      form: {
        channelId: 'general',
        endsAt: '2026-06-25T10:30',
        mode: 'create',
        organizationId: 'org-1',
        reminderOffsetMinutes: 15,
        spaceId: 'space-1',
        startsAt: '2026-06-25T10:00',
        title: 'Mobile standup',
      },
      selectedMeetingId: 'meeting-1',
    })
    expect(useMobileMeetingsStore.getState().meetings.map((meeting) => meeting.id)).toEqual([
      'meeting-1',
      'meeting-cancelled',
    ])

    useMobileMeetingsStore.getState().openEditForm(mobileMeetingFixture({
      id: 'meeting-1',
      title: 'Roadmap Review',
    }))
    expect(useMobileMeetingsStore.getState().form).toMatchObject({
      meetingId: 'meeting-1',
      mode: 'edit',
      title: 'Roadmap Review',
    })

    useMobileMeetingsStore.getState().setLocalReminder('meeting-1', {
      channel: 'in_app',
      offsetMinutes: 10,
    })
    useMobileMeetingsStore.getState().upsertMeeting(mobileMeetingFixture({
      id: 'meeting-1',
      status: 'cancelled',
    }))
    expect(useMobileMeetingsStore.getState().localRemindersByMeetingId).toEqual({
      'meeting-1': {
        channel: 'in_app',
        offsetMinutes: 10,
      },
    })
    expect(useMobileMeetingsStore.getState().meetings[0]).toMatchObject({
      id: 'meeting-1',
      status: 'cancelled',
    })

    useMobileMeetingsStore.getState().closeForm()
    expect(useMobileMeetingsStore.getState().form).toBeNull()
  })

  it('tracks voice route, mute/deafen controls, and screen-share watcher state', () => {
    useMobileVoiceStore.getState().joinRoute({
      kind: 'channel',
      serverId: 'local-opencord',
      spaceId: 'space-1',
      channelId: 'voice',
    })
    useMobileVoiceStore.getState().setMute(true)
    useMobileVoiceStore.getState().setDeafened(true)
    useMobileVoiceStore.getState().setScreenShareWatcher({
      status: 'watching',
      remoteScreenShares: 2,
    })

    expect(useMobileVoiceStore.getState()).toMatchObject({
      activeRoute: {
        kind: 'channel',
        serverId: 'local-opencord',
        spaceId: 'space-1',
        channelId: 'voice',
      },
      muted: true,
      deafened: true,
      screenShareWatcher: {
        status: 'watching',
        remoteScreenShares: 2,
      },
    })
  })

  it('keeps quiet settings route and permission purpose state', () => {
    useMobileSettingsStore.getState().openPanel('voice-video')
    useMobileSettingsStore.getState().setPermissionRows([
      {
        kind: 'microphone',
        label: 'Microphone',
        status: 'promptable',
        purpose: 'Used when you speak in voice channels or meetings.',
        canRequest: true,
      },
    ])
    useMobileSettingsStore.getState().setNotificationPermission('system-settings-required')
    useMobileSettingsStore.getState().setNativeCallIntegration('granted')

    expect(useMobileSettingsStore.getState()).toMatchObject({
      activePanel: 'voice-video',
      notificationPermission: 'system-settings-required',
      nativeCallIntegration: 'granted',
      permissionRows: [
        {
          kind: 'microphone',
          label: 'Microphone',
          status: 'promptable',
          purpose: 'Used when you speak in voice channels or meetings.',
          canRequest: true,
        },
      ],
    })
  })

  it('clears mobile runtime stores after logout without retaining secrets', () => {
    useMobileSessionStore.getState().setAccountMetadata({
      displayName: 'Ada',
      email: 'ada@example.com',
    })
    useMobileChatStore.getState().setComposerText('general', 'draft')
    useMobileChatStore.getState().beginReply({ channelId: 'general', messageId: 'msg-1' })
    useMobileMeetingsStore.getState().setMeetings([mobileMeetingFixture()])
    useMobileVoiceStore.getState().joinRoute({
      kind: 'channel',
      serverId: 'local-opencord',
      spaceId: 'space-1',
      channelId: 'voice',
    })
    useMobileSettingsStore.getState().openPanel('developer')

    clearMobileRuntimeStores()

    expect(useMobileSessionStore.getState()).toMatchObject({
      account: null,
      routePath: '/',
      routeTarget: null,
    })
    expect(useMobileChatStore.getState()).toMatchObject({
      composerTextByChannelId: {},
      replyTarget: null,
    })
    expect(useMobileMeetingsStore.getState()).toMatchObject({
      meetings: [],
      selectedMeetingId: null,
    })
    expect(useMobileVoiceStore.getState()).toMatchObject({
      activeRoute: null,
      connectionStatus: 'idle',
    })
    expect(useMobileSettingsStore.getState().activePanel).toBe('account')
    expect(JSON.stringify(useMobileSessionStore.getState())).not.toContain('token')
  })
})

function mobileMeetingFixture(overrides: Partial<ReturnType<typeof baseMobileMeetingFixture>> = {}) {
  return {
    ...baseMobileMeetingFixture(),
    ...overrides,
  }
}

function baseMobileMeetingFixture() {
  return {
    id: 'meeting-1',
    organizationId: 'org-1',
    spaceId: 'space-1',
    channelId: 'general',
    createdByUserId: 'user-1',
    title: 'Roadmap Review',
    description: 'Launch scope',
    status: 'scheduled',
    startsAt: '2026-06-25T10:00:00Z',
    endsAt: '2026-06-25T10:30:00Z',
    timezone: 'Asia/Bangkok',
    joinSlug: 'mtg-meeting-1',
    joinUrl: 'https://chat.example.com/join/mtg-meeting-1',
    cancelledAt: null,
    attendees: [],
    reminders: [],
  }
}
