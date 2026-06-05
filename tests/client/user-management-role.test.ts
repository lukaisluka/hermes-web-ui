// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const fetchManagedUsers = vi.hoisted(() => vi.fn())

vi.mock('@/api/auth', () => ({
  fetchManagedUsers,
  createManagedUser: vi.fn(),
  updateManagedUser: vi.fn(),
  deleteManagedUser: vi.fn(),
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

import UserManagementSettings from '@/components/hermes/settings/UserManagementSettings.vue'

describe('user management roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchManagedUsers.mockResolvedValue({ users: [], profiles: ['research'] })
  })

  it('defaults new accounts to user and includes all three roles', async () => {
    const wrapper = mount(UserManagementSettings, {
      global: {
        stubs: {
          NButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          NDataTable: true,
          NModal: { template: '<div><slot /><slot name="action" /></div>' },
          NForm: { template: '<form><slot /></form>' },
          NFormItem: { template: '<label><slot /></label>' },
          NInput: true,
          NPopconfirm: true,
          NSpace: { template: '<div><slot /></div>' },
          NTag: { template: '<span><slot /></span>' },
          NSelect: {
            props: ['value', 'options'],
            template: '<div class="select-stub" :data-value="value"><span v-for="option in options">{{ option.label }}</span></div>',
          },
        },
      },
    })
    await Promise.resolve()

    expect((wrapper.vm as any).form.role).toBe('user')
    expect((wrapper.vm as any).roleOptions).toEqual([
      { label: 'users.roles.user', value: 'user' },
      { label: 'users.roles.admin', value: 'admin' },
      { label: 'users.roles.superAdmin', value: 'super_admin' },
    ])
  })
})
