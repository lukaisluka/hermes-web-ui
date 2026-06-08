// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const openSessionSearchMock = vi.hoisted(() => vi.fn())
const replaceAppRouteMock = vi.hoisted(() => vi.fn())
const mockAppStore = vi.hoisted(() => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  connected: true,
  serverVersion: 'test',
  toggleSidebar: vi.fn(),
  toggleSidebarCollapsed: vi.fn(),
  closeSidebar: vi.fn(),
}))

vi.mock('@/composables/useSessionSearch', () => ({
  useSessionSearch: () => ({
    openSessionSearch: openSessionSearchMock,
  }),
}))

vi.mock('@/stores/hermes/app', () => ({
  useAppStore: () => mockAppStore,
}))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    replaceAppRoute: replaceAppRouteMock,
  }
})

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    useRoute: () => ({ name: 'hermes.chat' }),
    useRouter: () => ({ push: vi.fn(), hasRoute: () => true }),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
  createI18n: () => ({
    global: { locale: { value: 'en' }, setLocaleMessage: vi.fn() },
  }),
}))

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({ isDark: false }),
}))

vi.mock('/logo.png', () => ({
  default: 'logo.png',
}))

vi.mock('@/components/layout/ProfileSelector.vue', () => ({
  default: { name: 'ProfileSelector', template: '<div />' },
}))

vi.mock('@/components/layout/ModelSelector.vue', () => ({
  default: { name: 'ModelSelector', template: '<div />' },
}))

vi.mock('@/components/layout/LanguageSwitch.vue', () => ({
  default: { name: 'LanguageSwitch', template: '<div />' },
}))

vi.mock('@/components/layout/ThemeSwitch.vue', () => ({
  default: { name: 'ThemeSwitch', template: '<div />' },
}))

vi.mock('@/components/common/RouteLinkItem.vue', () => ({
  default: {
    name: 'RouteLinkItem',
    props: ['to', 'active'],
    template: '<a class="route-link-item" :class="{ active }" href="#"><slot /></a>',
  },
}))

vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<any>('naive-ui')
  return {
    ...actual,
    useMessage: () => ({
      success: vi.fn(),
      error: vi.fn(),
    }),
    NSelect: {
      template: '<div />',
    },
  }
})

import AppSidebar from '@/components/layout/AppSidebar.vue'

describe('AppSidebar search entry', () => {
  beforeEach(() => {
    localStorage.clear()
    openSessionSearchMock.mockClear()
    mockAppStore.serverVersion = 'test'
    mockAppStore.latestVersion = ''
    mockAppStore.sidebarCollapsed = false
    replaceAppRouteMock.mockClear()
  })

  function setRole(role: string) {
    const payload = btoa(JSON.stringify({ role }))
    localStorage.setItem('hermes_api_key', `header.${payload}.signature`)
  }

  it('opens the session search modal from the sidebar button', async () => {
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          ProfileSelector: true,
          ModelSelector: true,
          LanguageSwitch: true,
          ThemeSwitch: true,
        },
      },
    })

    const buttons = wrapper.findAll('button')
    const searchButton = buttons.find(node => node.text().includes('sidebar.search'))
    expect(searchButton).toBeTruthy()

    await searchButton!.trigger('click')
    expect(openSessionSearchMock).toHaveBeenCalledTimes(1)
  })

  it('uses short group labels and keeps group folding active when collapsed', async () => {
    mockAppStore.sidebarCollapsed = true
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          ProfileSelector: true,
          ModelSelector: true,
          LanguageSwitch: true,
          ThemeSwitch: true,
        },
      },
    })

    expect(wrapper.classes()).toContain('collapsed')
    expect(wrapper.findAll('.nav-group-label span').map(node => node.text())).toEqual([
      'sidebar.groupConversationShort',
      'sidebar.groupAgentShort',
      'sidebar.groupMonitoringShort',
      'sidebar.groupToolsShort',
      'sidebar.groupSystemShort',
    ])

    const agentGroup = wrapper.findAll('.nav-group')[1]
    expect(agentGroup.find('.nav-group-items').attributes('style')).toBeUndefined()

    await agentGroup.find('.nav-group-label').trigger('click')
    expect(agentGroup.find('.nav-group-items').attributes('style')).toContain('display: none')
  })

  it('shows only collaboration navigation to regular users', () => {
    setRole('user')
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          ProfileSelector: true,
          ModelSelector: true,
          LanguageSwitch: true,
          ThemeSwitch: true,
        },
      },
    })

    const itemLabels = wrapper.findAll('.nav-item').map(node => node.text())
    for (const allowed of [
      'sidebar.chat',
      'sidebar.groupChat',
      'sidebar.jobs',
      'sidebar.kanban',
      'sidebar.files',
      'sidebar.usage',
      'sidebar.skillsUsage',
      'sidebar.skills',
      'sidebar.mcp',
      'sidebar.settings',
    ]) {
      expect(itemLabels.some(label => label.startsWith(allowed))).toBe(true)
    }
    for (const forbidden of [
      'sidebar.plugins',
      'sidebar.memory',
      'sidebar.models',
      'sidebar.logs',
      'sidebar.performance',
    ]) {
      expect(itemLabels).not.toContain(forbidden)
    }
  })

  it('fully reloads the app when logging out to clear account-scoped state', async () => {
    localStorage.setItem('hermes_api_key', 'test-token')
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          ProfileSelector: true,
          ModelSelector: true,
          LanguageSwitch: true,
          ThemeSwitch: true,
        },
      },
    })

    await wrapper.find('.logout-item').trigger('click')

    expect(localStorage.getItem('hermes_api_key')).toBeNull()
    expect(replaceAppRouteMock).toHaveBeenCalledWith('/')
  })
})
