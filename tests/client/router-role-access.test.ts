// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/views/hermes/ChatView.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('@/views/hermes/FilesView.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('@/views/hermes/McpManagerView.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('@/views/hermes/SkillsView.vue', () => ({
  default: { template: '<div />' },
}))

import router from '@/router'

function setRole(role: string) {
  const payload = btoa(JSON.stringify({ role }))
  localStorage.setItem('hermes_api_key', `header.${payload}.signature`)
}

describe('router role access', () => {
  beforeEach(async () => {
    localStorage.clear()
    setRole('user')
    Object.defineProperty(document, 'queryCommandSupported', {
      configurable: true,
      value: () => false,
    })
    await router.replace('/poiera/chat')
  })

  it('redirects regular users away from management pages while allowing collaboration pages', async () => {
    await router.push('/poiera/models')
    expect(router.currentRoute.value.name).toBe('poiera.chat')

    await router.push('/poiera/terminal')
    expect(router.currentRoute.value.name).toBe('poiera.chat')

    await router.push('/poiera/files')
    expect(router.currentRoute.value.name).toBe('poiera.files')

    await router.push('/poiera/mcp')
    expect(router.currentRoute.value.name).toBe('poiera.mcp')

    await router.push('/poiera/skills')
    expect(router.currentRoute.value.name).toBe('poiera.skills')
  })

  it('allows profile admins to open MCP management', async () => {
    setRole('admin')

    await router.push('/poiera/mcp')

    expect(router.currentRoute.value.name).toBe('poiera.mcp')
  })
})
