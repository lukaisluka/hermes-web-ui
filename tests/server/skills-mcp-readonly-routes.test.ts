import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireProfileAdminMock = vi.fn(async (_ctx: any, next: any) => { await next() })

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  requireProfileAdmin: requireProfileAdminMock,
}))

vi.mock('../../packages/server/src/controllers/hermes/skills', () => ({
  list: vi.fn(),
  usageStats: vi.fn(),
  listExternalDirs: vi.fn(),
  updateExternalDirs: vi.fn(),
  toggle: vi.fn(),
  pin_: vi.fn(),
  importSkill: vi.fn(),
  deleteSkill: vi.fn(),
  listFiles: vi.fn(),
  readFile_: vi.fn(),
}))

vi.mock('../../packages/server/src/controllers/hermes/mcp', () => ({
  listServers: vi.fn(),
  addServer: vi.fn(),
  updateServer: vi.fn(),
  removeServer: vi.fn(),
  testServer: vi.fn(),
  listTools: vi.fn(),
  reloadMcp: vi.fn(),
}))

function middlewareFor(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (entry: any) => entry.path === path && entry.methods?.includes(method),
  )
  expect(layer, `${method} ${path} should exist`).toBeDefined()
  return layer.stack.slice(0, -1)
}

describe('Skills and MCP read-only route wiring', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('allows authenticated users to list redacted Skills and MCP status', async () => {
    const { skillRoutes } = await import('../../packages/server/src/routes/hermes/skills')
    const { mcpRoutes } = await import('../../packages/server/src/routes/hermes/mcp')

    expect(middlewareFor(skillRoutes, 'GET', '/api/hermes/skills')).not.toContain(requireProfileAdminMock)
    expect(middlewareFor(mcpRoutes, 'GET', '/api/hermes/mcp/servers')).not.toContain(requireProfileAdminMock)
  })

  it('keeps Skills details, MCP tools, and every mutation profile-admin only', async () => {
    const { skillRoutes } = await import('../../packages/server/src/routes/hermes/skills')
    const { mcpRoutes } = await import('../../packages/server/src/routes/hermes/mcp')

    for (const [method, path] of [
      ['GET', '/api/hermes/skills/external-dirs'],
      ['PUT', '/api/hermes/skills/external-dirs'],
      ['PUT', '/api/hermes/skills/toggle'],
      ['PUT', '/api/hermes/skills/pin'],
      ['POST', '/api/hermes/skills/import'],
      ['DELETE', '/api/hermes/skills/:category/:skill'],
      ['GET', '/api/hermes/skills/:category/:skill/files'],
      ['GET', '/api/hermes/skills/{*path}'],
    ]) {
      expect(middlewareFor(skillRoutes, method, path)).toContain(requireProfileAdminMock)
    }

    for (const [method, path] of [
      ['POST', '/api/hermes/mcp/servers'],
      ['PATCH', '/api/hermes/mcp/servers/:name'],
      ['DELETE', '/api/hermes/mcp/servers/:name'],
      ['POST', '/api/hermes/mcp/servers/:name/test'],
      ['GET', '/api/hermes/mcp/tools'],
      ['POST', '/api/hermes/mcp/reload'],
    ]) {
      expect(middlewareFor(mcpRoutes, method, path)).toContain(requireProfileAdminMock)
    }
  })
})
