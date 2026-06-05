// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'

const settingsStore = vi.hoisted(() => ({
  loading: false,
  saving: false,
  fetchSettings: vi.fn(),
}))
const profilesStore = vi.hoisted(() => ({
  activeProfileName: 'research',
  profiles: [{ name: 'research' }],
  fetchProfiles: vi.fn(),
}))

vi.mock('@/stores/hermes/settings', () => ({
  useSettingsStore: () => settingsStore,
}))

vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => profilesStore,
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-router')>(),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import SettingsView from '@/views/hermes/SettingsView.vue'

function setRole(role: string) {
  const payload = btoa(JSON.stringify({ role }))
  localStorage.setItem('hermes_api_key', `header.${payload}.signature`)
}

describe('settings role access', () => {
  beforeEach(() => {
    localStorage.clear()
    setRole('user')
    vi.clearAllMocks()
  })

  it('renders only Account and avoids loading protected config for regular users', async () => {
    const wrapper = shallowMount(SettingsView, {
      global: {
        stubs: {
          NTabs: { template: '<div><slot /></div>' },
          NSpin: { template: '<div><slot /></div>' },
          NTabPane: {
            name: 'NTabPane',
            props: ['name'],
            template: '<section><slot /></section>',
          },
        },
      },
    })
    await Promise.resolve()

    expect([...(wrapper.vm as any).validTabs]).toEqual(['account'])
    expect(settingsStore.fetchSettings).not.toHaveBeenCalled()
  })
})
