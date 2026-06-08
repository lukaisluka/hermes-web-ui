// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const authMocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(async () => ({ username: 'han' })),
  fetchMyAvatar: vi.fn(async () => null),
  fetchLockedIps: vi.fn(async () => []),
}))

vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(),
  changeUsername: vi.fn(),
  fetchCurrentUser: authMocks.fetchCurrentUser,
  fetchLockedIps: authMocks.fetchLockedIps,
  unlockSpecificIp: vi.fn(),
  unlockAllIps: vi.fn(),
  fetchMyAvatar: authMocks.fetchMyAvatar,
  updateMyAvatar: vi.fn(),
  resetMyAvatar: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<any>('naive-ui')
  return {
    ...actual,
    useMessage: () => ({ success: vi.fn(), error: vi.fn() }),
  }
})

import AccountSettings from '@/components/hermes/settings/AccountSettings.vue'

function setRole(role: string) {
  const payload = btoa(JSON.stringify({ role }))
  localStorage.setItem('hermes_api_key', `header.${payload}.signature`)
}

describe('account settings role access', () => {
  beforeEach(() => {
    localStorage.clear()
    setRole('user')
    vi.clearAllMocks()
  })

  it('keeps password and avatar controls but hides username and locked IP management from regular users', async () => {
    const wrapper = mount(AccountSettings, {
      global: {
        stubs: {
          ProfileAvatar: true,
          NButton: { template: '<button><slot /></button>' },
          NModal: { template: '<div><slot /></div>' },
          NForm: { template: '<form><slot /></form>' },
          NFormItem: { template: '<div><slot /></div>' },
          NInput: true,
          NPopconfirm: { template: '<div><slot name="trigger" /><slot /></div>' },
        },
      },
    })
    await Promise.resolve()

    expect(wrapper.text()).toContain('login.changePassword')
    expect(wrapper.text()).not.toContain('login.changeUsername')
    expect(wrapper.text()).not.toContain('settings.lockedIps.title')
    expect(authMocks.fetchLockedIps).not.toHaveBeenCalled()
  })
})
