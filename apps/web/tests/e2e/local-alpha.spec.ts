import { expect, test } from '@playwright/test'

test('boots a local alpha workspace and sends a server-backed message', async ({ page }) => {
  const suffix = Date.now()
  const email = `alpha-${suffix}@example.com`
  const message = `phase 9 browser smoke ${suffix}`

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

  await expect(page.getByLabel('Message timeline')).toContainText(message, { timeout: 15_000 })
})
