import { expect, type APIRequestContext, type Page, test } from '@playwright/test'

const API_BASE_URL = process.env.OPENCORD_API_BASE_URL ?? 'http://localhost:8080'
const SEED_OWNER_EMAIL = process.env.OPENCORD_SEED_OWNER_EMAIL ?? 'owner@opencord.local'
const SEED_OWNER_PASSWORD =
  process.env.OPENCORD_SEED_OWNER_PASSWORD ?? 'correct horse battery staple'

type SeedContext = {
  sessionToken: string
  headers: { Authorization: string }
  userId: string
  organizationId: string
  spaceId: string
  channelId: string
}

let seedContextPromise: Promise<SeedContext> | null = null

test('boots a local alpha workspace and sends, edits, and deletes a server-backed message', async ({
  page,
}) => {
  const suffix = Date.now()
  const email = `alpha-${suffix}@example.com`
  const message = `phase 9 browser smoke ${suffix}`
  const editedMessage = `phase 9 browser smoke edited ${suffix}`

  await page.goto('/')

  await expect(page.getByText('API online')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Local alpha email').fill(email)
  await page.getByLabel('Local alpha display name').fill('Alpha Browser')
  await page.getByLabel('Local alpha password').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Start local alpha' }).click()

  await expect(page.getByText('Alpha Browser')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: '# general' })).toBeVisible()

  await page.getByLabel('Message composer').fill(message)
  await page.getByRole('button', { name: 'Send message' }).click()

  const timeline = page.getByLabel('Message timeline')
  await expect(timeline).toContainText(message, { timeout: 15_000 })

  const messageCard = page.locator('article.message-card').filter({ hasText: message })
  await messageCard.getByRole('button', { name: 'Edit message' }).click()
  await page.getByLabel('Edit message text').fill(editedMessage)
  await page.getByRole('button', { name: 'Save edit' }).click()

  await expect(timeline).toContainText(editedMessage, { timeout: 15_000 })
  await page
    .locator('article.message-card')
    .filter({ hasText: editedMessage })
    .getByRole('button', { name: 'Delete message' })
    .click()
  await expect(timeline).not.toContainText(editedMessage)
})

test('loads seeded rich messages, attachments, voice channels, meetings, and ICS invite', async ({
  page,
  request,
}) => {
  const seeded = await loadSeedContext(request)
  const suffix = Date.now()
  const botMessage = `phase 9 compat bot message ${suffix}`
  const webhookMessage = `phase 9 webhook message ${suffix}`

  const bot = await createBot(request, seeded, `Playwright Bot ${suffix}`)
  await inviteBot(request, seeded, bot.applicationId)
  await postCompatBotMessage(request, seeded.channelId, bot.token, botMessage)

  const webhook = await createWebhook(request, seeded, `Playwright Hook ${suffix}`)
  await executeWebhook(request, webhook, webhookMessage, 'Playwright Hook')

  await startSeededLocalAlpha(page)

  const timeline = page.getByLabel('Message timeline')
  await expect(timeline).toContainText('Welcome to the OpenCord local alpha workspace.', {
    timeout: 15_000,
  })
  await expect(timeline).toContainText('Local alpha rich message fixture.')
  await expect(timeline).toContainText('Fixture for rich message rendering.')
  await expect(timeline).toContainText('local-alpha-readme.txt')
  await expect(timeline).toContainText('text/plain')
  await expect(timeline).toContainText(botMessage)
  await expect(timeline).toContainText(webhookMessage)
  await expect(timeline).toContainText('Playwright Hook')
  await expect(page.getByRole('button', { name: 'Join Voice: Voice Lounge' })).toBeVisible()

  await page.getByRole('button', { name: 'Calendar' }).click()

  const upcomingMeetings = page.getByLabel('Upcoming meetings')
  await expect(upcomingMeetings).toContainText('OpenCord Local Alpha Standup')
  await expect(upcomingMeetings).toContainText('/join/mtg-')

  const meetings = await request.get(`${API_BASE_URL}/organizations/${seeded.organizationId}/meetings`, {
    headers: seeded.headers,
  })
  expect(meetings.ok()).toBeTruthy()
  const meetingBody = await meetings.json()
  const meeting = meetingBody.meetings.find(
    (candidate: { title?: string }) => candidate.title === 'OpenCord Local Alpha Standup',
  )
  expect(meeting).toBeTruthy()

  const invite = await request.get(`${API_BASE_URL}/meetings/${meeting.id}/invite.ics`, {
    headers: seeded.headers,
  })
  expect(invite.ok()).toBeTruthy()
  expect(invite.headers()['content-type']).toBe('text/calendar; charset=utf-8')
  const inviteBody = await invite.text()
  expect(inviteBody).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')
  expect(inviteBody).toContain(`UID:${meeting.id}@opencord\r\n`)
  expect(inviteBody).toContain('SUMMARY:OpenCord Local Alpha Standup\r\n')
  expect(inviteBody).toContain('DTSTART:20990109T090000Z\r\n')
  expect(inviteBody).toContain('DTEND:20990109T093000Z\r\n')
  expect(inviteBody).toContain(`URL:${meeting.join_url}\r\n`)
})

test('fans out realtime message events to browser clients after reconnect', async ({
  browser,
  page,
  request,
}) => {
  const seeded = await loadSeedContext(request)
  const webhook = await createWebhook(request, seeded, `Realtime Hook ${Date.now()}`)
  const listener = await browser.newPage()
  await listener.goto('/')
  await openRealtimeSocket(listener, seeded.sessionToken)

  const firstMessage = `phase 9 realtime fanout ${Date.now()}`
  const firstEvent = waitForRealtimeMessage(listener, firstMessage)
  await executeWebhook(request, webhook, firstMessage)
  await expect(firstEvent).resolves.toMatchObject({
    type: 'message.created',
    data: { message: expect.objectContaining({ content: firstMessage }) },
  })

  await closeRealtimeSocket(listener)

  const secondMessage = `phase 9 realtime reconnect ${Date.now()}`
  await openRealtimeSocket(listener, seeded.sessionToken)
  const secondEvent = waitForRealtimeMessage(listener, secondMessage)
  await executeWebhook(request, webhook, secondMessage)
  await expect(secondEvent).resolves.toMatchObject({
    type: 'message.created',
    data: { message: expect.objectContaining({ content: secondMessage }) },
  })

  await closeRealtimeSocket(listener)
  await listener.close()
  await page.goto('/')
  await expect(page.getByText('API online')).toBeVisible({ timeout: 15_000 })
})

async function startSeededLocalAlpha(page: Page) {
  await page.goto('/')
  await expect(page.getByText('API online')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Local alpha email').fill(SEED_OWNER_EMAIL)
  await page.getByLabel('Local alpha display name').fill('OpenCord Owner')
  await page.getByLabel('Local alpha password').fill(SEED_OWNER_PASSWORD)
  await page.getByRole('button', { name: 'Start local alpha' }).click()

  const result = await Promise.race([
    page
      .getByText('OpenCord Owner')
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => 'ready' as const),
    page
      .getByRole('alert')
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => 'error' as const),
  ])
  if (result === 'error') {
    const message = await page.getByRole('alert').textContent()
    if (!message?.toLowerCase().includes('rate limit')) {
      throw new Error(`Seeded local alpha login failed: ${message}`)
    }
    await page.waitForTimeout(61_000)
    await page.getByRole('button', { name: 'Start local alpha' }).click()
    await expect(page.getByText('OpenCord Owner')).toBeVisible({ timeout: 15_000 })
  }

  await expect(page.getByRole('heading', { name: '# general' })).toBeVisible()
}

async function loadSeedContext(request: APIRequestContext) {
  seedContextPromise ??= loadSeedContextFresh(request).catch((error) => {
    seedContextPromise = null
    throw error
  })

  return seedContextPromise
}

async function loadSeedContextFresh(request: APIRequestContext): Promise<SeedContext> {
  const auth = await request.post(`${API_BASE_URL}/auth/login`, {
    data: {
      email: SEED_OWNER_EMAIL,
      password: SEED_OWNER_PASSWORD,
    },
  })
  if (auth.status() === 429) {
    const retryAfter = Number(auth.headers()['retry-after'] ?? auth.headers()['x-ratelimit-reset'] ?? '60')
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(Math.max(retryAfter, 1), 61) * 1_000),
    )
    return loadSeedContextFresh(request)
  }
  if (!auth.ok()) {
    throw new Error(`Seed login failed with ${auth.status()}: ${await auth.text()}`)
  }
  const authBody = await auth.json()
  const sessionToken = authBody.session.token as string
  const userId = authBody.user.id as string
  const headers = { Authorization: `Bearer ${sessionToken}` }

  const organizations = await request.get(`${API_BASE_URL}/organizations`, { headers })
  expect(organizations.ok()).toBeTruthy()
  const organizationBody = await organizations.json()
  const organization = organizationBody.organizations.find(
    (candidate: { name?: string }) => candidate.name === 'OpenCord Local Alpha',
  )
  expect(organization).toBeTruthy()

  const spaces = await request.get(`${API_BASE_URL}/organizations/${organization.id}/spaces`, {
    headers,
  })
  expect(spaces.ok()).toBeTruthy()
  const spaceBody = await spaces.json()
  const space = spaceBody.spaces.find(
    (candidate: { name?: string }) => candidate.name === 'Local Alpha',
  )
  expect(space).toBeTruthy()

  const channels = await request.get(`${API_BASE_URL}/spaces/${space.id}/channels`, { headers })
  expect(channels.ok()).toBeTruthy()
  const channelBody = await channels.json()
  const channel = channelBody.channels.find(
    (candidate: { kind?: string; name?: string }) =>
      candidate.kind === 'text' && candidate.name === 'general',
  )
  expect(channel).toBeTruthy()

  return {
    sessionToken,
    headers,
    userId,
    organizationId: organization.id as string,
    spaceId: space.id as string,
    channelId: channel.id as string,
  }
}

async function createBot(
  request: APIRequestContext,
  seeded: Awaited<ReturnType<typeof loadSeedContext>>,
  name: string,
) {
  const response = await request.post(
    `${API_BASE_URL}/organizations/${seeded.organizationId}/bot-applications`,
    {
      headers: seeded.headers,
      data: {
        name,
        description: 'Playwright local alpha bot fixture',
      },
    },
  )
  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  return {
    applicationId: body.bot_application.id as string,
    token: body.bot_token.token as string,
  }
}

async function inviteBot(
  request: APIRequestContext,
  seeded: Awaited<ReturnType<typeof loadSeedContext>>,
  applicationId: string,
) {
  const response = await request.post(
    `${API_BASE_URL}/organizations/${seeded.organizationId}/bot-applications/${applicationId}/spaces/${seeded.spaceId}/invite`,
    {
      headers: seeded.headers,
      data: { role: 'member' },
    },
  )
  expect(response.ok()).toBeTruthy()
}

async function postCompatBotMessage(
  request: APIRequestContext,
  channelId: string,
  token: string,
  content: string,
) {
  const response = await request.post(
    `${API_BASE_URL}/api/compat/discord/v10/channels/${channelId}/messages`,
    {
      headers: { Authorization: `Bot ${token}` },
      data: { content },
    },
  )
  expect(response.ok()).toBeTruthy()
}

async function createWebhook(
  request: APIRequestContext,
  seeded: Awaited<ReturnType<typeof loadSeedContext>>,
  name: string,
) {
  const response = await request.post(`${API_BASE_URL}/channels/${seeded.channelId}/webhooks`, {
    headers: seeded.headers,
    data: { name },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  return {
    id: body.webhook.id as string,
    token: body.webhook.token as string,
  }
}

async function executeWebhook(
  request: APIRequestContext,
  webhook: Awaited<ReturnType<typeof createWebhook>>,
  content: string,
  username?: string,
) {
  const response = await request.post(`${API_BASE_URL}/api/webhooks/${webhook.id}/${webhook.token}`, {
    data: { content, username },
  })
  expect(response.ok()).toBeTruthy()
}

async function openRealtimeSocket(page: Page, token: string) {
  await page.evaluate(
    (url) =>
      new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url)
        ;(window as unknown as { __opencordRealtimeSocket?: WebSocket }).__opencordRealtimeSocket =
          socket
        const timeout = window.setTimeout(() => {
          socket.close()
          reject(new Error('Timed out opening realtime socket'))
        }, 15_000)

        socket.onopen = () => {
          window.clearTimeout(timeout)
          resolve()
        }
        socket.onerror = () => {
          window.clearTimeout(timeout)
          reject(new Error('Realtime socket failed to open'))
        }
      }),
    realtimeUrl(token),
  )
}

function waitForRealtimeMessage(page: Page, content: string) {
  return page.evaluate(
    (content) =>
      new Promise<unknown>((resolve, reject) => {
        const socket = (window as unknown as { __opencordRealtimeSocket?: WebSocket })
          .__opencordRealtimeSocket
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          reject(new Error('Realtime socket is not open'))
          return
        }

        const timeout = window.setTimeout(() => {
          socket.removeEventListener('message', onMessage)
          reject(new Error(`Timed out waiting for realtime message: ${content}`))
        }, 15_000)

        const onMessage = (event: MessageEvent) => {
          const payload = JSON.parse(event.data)
          if (payload.type === 'message.created' && payload.data?.message?.content === content) {
            window.clearTimeout(timeout)
            socket.removeEventListener('message', onMessage)
            resolve(payload)
          }
        }
        socket.addEventListener('message', onMessage)
      }),
    content,
  )
}

async function closeRealtimeSocket(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __opencordRealtimeSocket?: WebSocket }).__opencordRealtimeSocket?.close()
  })
}

function realtimeUrl(token: string) {
  const url = new URL(API_BASE_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws'
  url.searchParams.set('token', token)
  return url.toString()
}
