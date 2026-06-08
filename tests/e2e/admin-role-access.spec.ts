import { expect, test } from '@playwright/test'
import { authenticate, mockChatSocket, mockHermesApi, TEST_ADMIN_ACCESS_KEY } from './fixtures'

test.describe('admin role access', () => {
  test('admin sees management sidebar items but not super-admin ones', async ({ page }) => {
    await authenticate(page, TEST_ADMIN_ACCESS_KEY, 'research')
    const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'admin' })
    await mockChatSocket(page)

    await page.goto('/#/hermes/chat')
    await expect(page.locator('aside.sidebar')).toBeVisible()

    const sidebar = page.locator('aside.sidebar')
    // Admin-visible management items
    for (const item of ['Models', 'Skills', 'Plugins', 'Memory', 'MCP', 'Logs']) {
      await expect(sidebar.getByRole('link', { name: new RegExp(`^${item}$`) })).toBeVisible()
    }

    // Super-admin-only items should NOT be visible
    for (const item of ['Profiles', 'Performance']) {
      await expect(sidebar.getByRole('link', { name: new RegExp(`^${item}$`) })).toHaveCount(0)
    }

    expect(api.unexpectedRequests).toEqual([])
  })

  test('admin can access management routes but not profiles', async ({ page }) => {
    await authenticate(page, TEST_ADMIN_ACCESS_KEY, 'research')
    const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'admin' })
    await mockChatSocket(page)

    // Admin can access models (not redirected)
    await page.goto('/#/hermes/models')
    await expect(page).toHaveURL(/#\/hermes\/models/)
    await expect(page.getByRole('heading', { name: 'Models', exact: true })).toBeVisible()

    // Admin CANNOT access profiles (super-admin only) — should redirect to chat
    await page.goto('/#/hermes/profiles')
    await expect(page).toHaveURL(/#\/hermes\/chat/)

    expect(api.unexpectedRequests).toEqual([])
  })

  test('admin sees terminal tab in drawer panel', async ({ page }) => {
    await authenticate(page, TEST_ADMIN_ACCESS_KEY, 'research')
    const api = await mockHermesApi(page, { initialProfileName: 'research', userRole: 'admin' })
    await mockChatSocket(page)

    await page.goto('/#/hermes/chat')

    // Open drawer panel by clicking the drawer button
    await page.locator('.drawer-button').first().click()

    // Wait for drawer panel to show (it transitions with CSS)
    await expect(page.locator('.drawer-panel.show')).toBeVisible()

    // Both Workspace and Terminal tabs should be visible for admin
    await expect(page.locator('.drawer-panel .tab-button').getByText('Workspace').first()).toBeVisible()
    await expect(page.locator('.drawer-panel .tab-button').getByText('Terminal').first()).toBeVisible()

    expect(api.unexpectedRequests).toEqual([])
  })
})
