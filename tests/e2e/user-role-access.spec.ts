import { expect, test } from '@playwright/test'
import { authenticate, mockChatSocket, mockHermesApi, TEST_USER_ACCESS_KEY } from './fixtures'

test('regular users keep collaboration access while management routes stay hidden', async ({ page }) => {
  await authenticate(page, TEST_USER_ACCESS_KEY, 'research')
  const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'user' })
  await mockChatSocket(page)

  await page.goto('/#/hermes/models')
  await expect(page).toHaveURL(/#\/hermes\/chat$/)

  const sidebar = page.locator('aside.sidebar')
  for (const allowed of [/^Chat$/, /^Group Chat/, /^Jobs$/, /^Kanban$/, /^Skills$/, /^MCP$/, /^Files$/, /^Usage$/, /^Skills Usage$/, /^Settings$/]) {
    await expect(sidebar.getByRole('link', { name: allowed })).toBeVisible()
  }
  for (const forbidden of ['Models', 'Plugins', 'Memory', 'Logs', 'Performance', 'Terminal', 'Profiles']) {
    await expect(sidebar.getByRole('link', { name: new RegExp(`^${forbidden}$`) })).toHaveCount(0)
  }

  await page.goto('/#/hermes/terminal')
  await expect(page).toHaveURL(/#\/hermes\/chat$/)

  await page.getByTestId('profile-selector-select').click()
  await expect(page.getByRole('dialog').filter({ hasText: 'default' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restart Gateway' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Restart Profile' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Avatar' })).toHaveCount(0)

  const reloadPromise = page.waitForEvent('framenavigated', frame => frame === page.mainFrame())
  await page.locator('.profile-runtime-item').filter({ hasText: /^default/ }).getByRole('button', { name: 'Switch Frontend Profile' }).click()
  await reloadPromise
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByTestId('profile-selector-select').filter({ hasText: 'default' })).toBeVisible()
  expect(await page.evaluate(() => window.localStorage.getItem('hermes_active_profile_name'))).toBe('default')
  expect(api.requests.some(request => request.pathname === '/api/hermes/profiles/runtime-statuses')).toBe(false)
  expect(api.requests.some(request => request.pathname === '/api/hermes/profiles/active')).toBe(false)
  expect(api.requests.some(request => request.pathname === '/api/hermes/config')).toBe(false)

  const deniedStatuses = await page.evaluate(async (token) => {
    const headers = { Authorization: `Bearer ${token}` }
    const [config, runtime] = await Promise.all([
      fetch('/api/hermes/config', { headers }),
      fetch('/api/hermes/profiles/runtime-statuses', { headers }),
    ])
    return [config.status, runtime.status]
  }, TEST_USER_ACCESS_KEY)
  expect(deniedStatuses).toEqual([403, 403])
  expect(api.unexpectedRequests).toEqual([])
})

test('regular user model selector hides custom model input and remove buttons', async ({ page }) => {
  await authenticate(page, TEST_USER_ACCESS_KEY, 'research')
  const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'user' })
  await mockChatSocket(page)

  await page.goto('/#/hermes/chat')

  // Open the model selector modal
  await page.locator('.model-trigger').click()

  // The NModal should open — check for the modal title
  await expect(page.locator('.n-modal').getByText('Models', { exact: true }).first()).toBeVisible()

  // Custom model input section should NOT be visible for regular users (v-if="!isRegularUser")
  await expect(page.locator('.model-custom')).toHaveCount(0)

  // Custom model remove buttons should NOT be present (v-if="!isRegularUser && isCustomModel(...)")
  await expect(page.locator('.model-custom-remove')).toHaveCount(0)

  expect(api.unexpectedRequests).toEqual([])
})

test('regular user drawer panel hides terminal tab', async ({ page }) => {
  await authenticate(page, TEST_USER_ACCESS_KEY, 'research')
  const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'user' })
  await mockChatSocket(page)

  await page.goto('/#/hermes/chat')

  // Open drawer panel by clicking the drawer button
  await page.locator('.drawer-button').first().click()

  // Wait for drawer panel to show (it transitions with CSS)
  await expect(page.locator('.drawer-panel.show')).toBeVisible()

  // Workspace tab should be visible (i18n: drawer.files = "Workspace")
  await expect(page.locator('.drawer-panel .tab-button').getByText('Workspace').first()).toBeVisible()

  // Terminal tab should NOT be present for regular users
  await expect(page.locator('.drawer-panel .tab-button').getByText('Terminal')).toHaveCount(0)

  expect(api.unexpectedRequests).toEqual([])
})

test('regular user history uses simpler session list API', async ({ page }) => {
  await authenticate(page, TEST_USER_ACCESS_KEY, 'research')
  const api = await mockHermesApi(page, {
    initialProfileName: 'research',
    userRole: 'user',
    sessions: [
      { id: 's1', title: 'Test Session', model: 'test-model', provider: 'test-provider', created_at: Date.now(), updated_at: Date.now(), message_count: 1 },
    ],
  })

  await page.goto('/#/hermes/history')
  await expect(page.getByText('Test Session').first()).toBeVisible()

  // Regular users should call /api/hermes/sessions (not /api/hermes/sessions/hermes)
  expect(api.requests.some(r => r.pathname === '/api/hermes/sessions')).toBe(true)
  expect(api.requests.some(r => r.pathname === '/api/hermes/sessions/hermes')).toBe(false)
  // They should NOT call /api/hermes/config (settingsStore.fetchSettings skipped)
  expect(api.requests.some(r => r.pathname === '/api/hermes/config')).toBe(false)

  expect(api.unexpectedRequests).toEqual([])
})

