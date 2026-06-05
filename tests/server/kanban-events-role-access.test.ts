import { beforeEach, describe, expect, it, vi } from 'vitest'

const accessMocks = vi.hoisted(() => ({
  userCanAccessProfile: vi.fn(),
}))

vi.mock('../../packages/server/src/db/hermes/users-store', () => ({
  userCanAccessProfile: accessMocks.userCanAccessProfile,
}))

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  authenticateUserToken: vi.fn(),
  isAuthEnabled: vi.fn(),
  isRegularUser: (user: any) => user?.role === 'user',
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}))

import { resolveKanbanEventsProfile } from '../../packages/server/src/routes/hermes/kanban-events'

describe('Kanban event stream profile access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accessMocks.userCanAccessProfile.mockReturnValue(true)
  })

  it('uses an authorized fallback profile for regular users', () => {
    const profile = resolveKanbanEventsProfile({
      id: 7,
      username: 'han',
      role: 'user',
      profiles: ['research', 'travel'],
    }, '')

    expect(profile).toBe('research')
    expect(accessMocks.userCanAccessProfile).toHaveBeenCalledWith(7, 'research')
  })

  it('rejects missing or unauthorized regular-user profiles', () => {
    accessMocks.userCanAccessProfile.mockReturnValue(false)
    const user = { id: 7, username: 'han', role: 'user' as const, profiles: ['research'] }

    expect(() => resolveKanbanEventsProfile(user, '')).toThrow('No profiles are available')
    expect(() => resolveKanbanEventsProfile(user, 'private')).toThrow('not available')
  })
})
