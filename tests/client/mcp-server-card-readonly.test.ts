// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import McpServerCard from '@/components/hermes/mcp/McpServerCard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('McpServerCard read-only mode', () => {
  it('shows status without management controls', () => {
    const wrapper = mount(McpServerCard, {
      props: {
        readOnly: true,
        server: {
          name: 'github',
          transport: 'stdio',
          connected: true,
          tools: 12,
          tools_registered: 8,
          tool_names: [],
          tool_names_registered: [],
          tool_details: [],
          raw_config: { enabled: true },
        },
        toolsByServer: {},
      },
      global: {
        stubs: {
          NButton: { template: '<button><slot /></button>' },
          NSwitch: { template: '<button class="switch" />' },
          NPopconfirm: { template: '<div><slot name="trigger" /><slot /></div>' },
        },
      },
    })

    expect(wrapper.text()).toContain('github')
    expect(wrapper.text()).toContain('8/12')
    expect(wrapper.find('.card-footer').exists()).toBe(false)
  })
})
