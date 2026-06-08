import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSuperAdminMock = vi.fn(async (_ctx: any, next: any) => { await next() })
const requireProfileAdminMock = vi.fn(async (_ctx: any, next: any) => { await next() })
const requireTargetProfileAdminMock = vi.fn(async (_ctx: any, next: any) => { await next() })

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  requireSuperAdmin: requireSuperAdminMock,
  requireProfileAdmin: requireProfileAdminMock,
  requireTargetProfileAdmin: requireTargetProfileAdminMock,
}))

vi.mock('../../packages/server/src/controllers/auth', () => ({
  authStatus: vi.fn(),
  login: vi.fn(),
  setupPassword: vi.fn(),
  currentUser: vi.fn(),
  changePassword: vi.fn(),
  changeUsername: vi.fn(),
  getMyAvatar: vi.fn(),
  updateMyAvatar: vi.fn(),
  removePassword: vi.fn(),
  listManagedUsers: vi.fn(),
  createManagedUser: vi.fn(),
  updateManagedUser: vi.fn(),
  deleteManagedUser: vi.fn(),
  listLockedIps: vi.fn(),
  unlockIpHandler: vi.fn(),
}))

vi.mock('../../packages/server/src/controllers/hermes/profiles', () => ({
  list: vi.fn(),
  create: vi.fn(),
  runtimeStatuses: vi.fn(),
  runtimeStatus: vi.fn(),
  restartProfileRuntime: vi.fn(),
  restartGatewayForProfile: vi.fn(),
  updateAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  switchProfile: vi.fn(),
  exportProfile: vi.fn(),
  importProfile: vi.fn(),
}))

function middlewareFor(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (entry: any) => entry.path === path && entry.methods?.includes(method),
  )
  expect(layer, `${method} ${path} should exist`).toBeDefined()
  return layer.stack.slice(0, -1)
}

describe('core RBAC route wiring', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('reserves global identity and security operations for super admins', async () => {
    const { authProtectedRoutes } = await import('../../packages/server/src/routes/auth')

    expect(middlewareFor(authProtectedRoutes, 'POST', '/api/auth/change-username')).toContain(requireSuperAdminMock)
    expect(middlewareFor(authProtectedRoutes, 'GET', '/api/auth/locked-ips')).toContain(requireSuperAdminMock)
    expect(middlewareFor(authProtectedRoutes, 'DELETE', '/api/auth/locked-ips')).toContain(requireSuperAdminMock)
  })

  it('reserves profile lifecycle operations for super admins', async () => {
    const { profileRoutes } = await import('../../packages/server/src/routes/hermes/profiles')

    for (const [method, path] of [
      ['POST', '/api/hermes/profiles'],
      ['DELETE', '/api/hermes/profiles/:name'],
      ['POST', '/api/hermes/profiles/:name/rename'],
      ['POST', '/api/hermes/profiles/import'],
      ['PUT', '/api/hermes/profiles/active'],
    ]) {
      expect(middlewareFor(profileRoutes, method, path)).toContain(requireSuperAdminMock)
    }
  })

  it('keeps assigned-profile operations available to profile admins', async () => {
    const { profileRoutes } = await import('../../packages/server/src/routes/hermes/profiles')

    for (const [method, path] of [
      ['GET', '/api/hermes/profiles/runtime-statuses'],
      ['GET', '/api/hermes/profiles/:name/runtime-status'],
      ['POST', '/api/hermes/profiles/:name/restart'],
      ['POST', '/api/hermes/profiles/:name/gateway/restart'],
      ['PUT', '/api/hermes/profiles/:name/avatar'],
      ['DELETE', '/api/hermes/profiles/:name/avatar'],
      ['GET', '/api/hermes/profiles/:name'],
      ['POST', '/api/hermes/profiles/:name/export'],
    ]) {
      expect(middlewareFor(profileRoutes, method, path)).toContain(
        path.includes(':name') ? requireTargetProfileAdminMock : requireProfileAdminMock,
      )
    }
  })
})
