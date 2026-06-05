import { expect, test } from '@playwright/test'
import { authenticate, mockHermesApi, TEST_ACCESS_KEY, TEST_ADMIN_ACCESS_KEY, TEST_USER_ACCESS_KEY } from './fixtures'

test.describe('settings RBAC', () => {
  test('regular user sees only account tab in settings', async ({ page }) => {
    await authenticate(page, TEST_USER_ACCESS_KEY, 'research')
    const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'user' })

    await page.goto('/#/hermes/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Only the Account tab should be visible
    const tabs = page.locator('.settings-view .n-tabs .n-tabs-tab')
    await expect(tabs).toHaveCount(1)
    await expect(tabs.first()).toHaveText(/Account/)

    // Config tabs should not be present
    for (const tabName of ['Display', 'Agent', 'Memory', 'Compression', 'Session', 'Privacy', 'Models', 'Voice', 'Account Management']) {
      await expect(page.locator('.settings-view .n-tabs').getByText(tabName, { exact: false })).toHaveCount(0)
    }

    // Navigating with ?tab=display should normalize back to account
    await page.goto('/#/hermes/settings?tab=display')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.locator('.settings-view .n-tabs .n-tabs-tab')).toHaveCount(1)

    // Regular users skip settingsStore.fetchSettings() — /api/hermes/config should NOT be called
    expect(api.requests.some(r => r.pathname === '/api/hermes/config')).toBe(false)
    expect(api.unexpectedRequests).toEqual([])
  })

  test('admin sees config tabs but not users tab in settings', async ({ page }) => {
    await authenticate(page, TEST_ADMIN_ACCESS_KEY, 'research')
    const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'admin' })

    await page.goto('/#/hermes/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Account + config tabs should be visible
    const tabs = page.locator('.settings-view .n-tabs .n-tabs-tab')
    // At least: account, display, agent, memory, compression, session, privacy, models, voice = 9
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(9)

    // "Account Management" (users) tab should NOT be visible — admin is not super_admin
    await expect(page.locator('.settings-view .n-tabs').getByText('Account Management', { exact: false })).toHaveCount(0)

    expect(api.unexpectedRequests).toEqual([])
  })

  test('super admin sees all settings tabs including users', async ({ page }) => {
    await authenticate(page, TEST_ACCESS_KEY, 'research')
    const api = await mockHermesApi(page, { initialProfileName: 'research' })

    await page.goto('/#/hermes/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // All tabs including Account Management should be visible
    const tabs = page.locator('.settings-view .n-tabs .n-tabs-tab')
    // account + users + display + agent + memory + compression + session + privacy + models + voice = 10
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(10)

    // Users tab should be present
    await expect(tabs.getByText('Account Management', { exact: false }).first()).toBeVisible()

    expect(api.unexpectedRequests).toEqual([])
  })
})
