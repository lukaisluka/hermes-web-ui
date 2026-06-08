import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  run: vi.fn(),
  listJobs: vi.fn(),
  execHermes: vi.fn(),
}))

vi.mock('../../packages/server/src/db', () => ({
  getDb: () => ({
    prepare: () => ({ run: state.run }),
  }),
}))

vi.mock('../../packages/server/src/db/hermes/job-ownership-store', () => ({
  listJobOwnersForUserProfiles: state.listJobs,
}))

vi.mock('../../packages/server/src/services/hermes/hermes-path', () => ({
  getHermesBin: () => '/fake/hermes',
}))

vi.mock('../../packages/server/src/services/hermes/hermes-profile', () => ({
  getProfileDir: (profile: string) => `/profiles/${profile}`,
}))

vi.mock('../../packages/server/src/services/hermes/hermes-process', () => ({
  execHermesWithBin: state.execHermes,
}))

vi.mock('../../packages/server/src/services/logger', () => ({
  logger: { warn: vi.fn() },
}))

import { reconcileRevokedProfileOwnership } from '../../packages/server/src/services/hermes/resource-ownership-reconciliation'

describe('resource ownership reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.run.mockReturnValue({ changes: 2 })
    state.listJobs.mockReturnValue([
      { profile: 'research', job_id: 'job-1', owner_user_id: 7 },
      { profile: 'travel', job_id: 'job-2', owner_user_id: 7 },
    ])
    state.execHermes.mockResolvedValue(undefined)
  })

  it('makes revoked group-chat rooms ownerless and pauses owned jobs', async () => {
    const result = await reconcileRevokedProfileOwnership(7, ['research', 'travel'])

    expect(state.run).toHaveBeenCalledWith(7, 'research', 'travel')
    expect(state.execHermes).toHaveBeenCalledWith(
      '/fake/hermes',
      ['cron', 'pause', 'job-1'],
      expect.objectContaining({ env: expect.objectContaining({ HERMES_HOME: '/profiles/research' }) }),
    )
    expect(result).toEqual({ ownerlessRooms: 2, pausedJobs: 2, failedJobs: [] })
  })

  it('continues reconciling other jobs when one pause fails', async () => {
    state.execHermes.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)

    const result = await reconcileRevokedProfileOwnership(7, ['research', 'travel'])

    expect(result).toEqual({
      ownerlessRooms: 2,
      pausedJobs: 1,
      failedJobs: ['research:job-1'],
    })
  })
})
