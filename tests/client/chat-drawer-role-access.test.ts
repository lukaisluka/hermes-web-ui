// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/api/client', () => ({
  isStoredProfileAdmin: () => false,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/hermes/chat/TerminalPanel.vue', () => ({
  default: { template: '<div data-testid="terminal-panel" />' },
}))

vi.mock('@/components/hermes/chat/FilesPanel.vue', () => ({
  default: { template: '<div data-testid="files-panel" />' },
}))

import DrawerPanel from '@/components/hermes/chat/DrawerPanel.vue'

describe('chat drawer role access', () => {
  it('keeps files available while hiding the embedded terminal for regular users', () => {
    const wrapper = mount(DrawerPanel, {
      props: { show: true, activeTab: 'terminal' },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    })

    expect(wrapper.text()).toContain('drawer.files')
    expect(wrapper.text()).not.toContain('drawer.terminal')
    expect(wrapper.find('[data-testid="files-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="terminal-panel"]').exists()).toBe(false)
  })
})
