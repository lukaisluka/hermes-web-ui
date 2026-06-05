// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const fetchRuntimeStatuses = vi.hoisted(() => vi.fn())
const profilesStore = vi.hoisted(() => ({
  activeProfileName: 'research',
  profiles: [
    { name: 'research', avatar: null },
    { name: 'travel', avatar: null },
  ],
  fetchProfiles: vi.fn(),
  switchProfile: vi.fn(async () => true),
  updateAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}))

vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => profilesStore,
}))

vi.mock('@/api/hermes/profiles', () => ({
  fetchProfileRuntimeStatusesWithMeta: fetchRuntimeStatuses,
  restartProfileGateway: vi.fn(),
  restartProfileRuntime: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<any>('naive-ui')
  return {
    ...actual,
    useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
  }
})

import ProfileSelector from '@/components/layout/ProfileSelector.vue'

function setRole(role: string) {
  const payload = btoa(JSON.stringify({ role }))
  localStorage.setItem('hermes_api_key', `header.${payload}.signature`)
}

describe('profile selector role access', () => {
  beforeEach(() => {
    localStorage.clear()
    setRole('user')
    vi.clearAllMocks()
  })

  it('keeps switching available without loading or showing profile management controls', async () => {
    const wrapper = mount(ProfileSelector, {
      global: {
        stubs: {
          ProfileAvatarView: true,
          NModal: { template: '<div><slot name="header" /><slot /></div>' },
          NSpin: { template: '<div><slot /></div>' },
          NButton: { template: '<button><slot /></button>' },
        },
      },
    })

    ;(wrapper.vm as any).showProfileModal = true
    await nextTick()

    expect(fetchRuntimeStatuses).not.toHaveBeenCalled()
    expect((wrapper.vm as any).canManageProfiles).toBe(false)
    expect(document.body.textContent).toContain('profiles.runtime.switchProfile')
    expect(document.body.textContent).not.toContain('profiles.runtime.restartGateway')
    expect(document.body.textContent).not.toContain('profiles.runtime.restartProfile')
    expect(document.body.textContent).not.toContain('profiles.avatar.customize')
  })
})
