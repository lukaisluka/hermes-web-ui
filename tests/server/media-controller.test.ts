import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  isRegularUser: (user: any) => user?.role === 'user',
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}))

const originalWebUiHome = process.env.POIERA_HOME
const originalWebuiStateDir = process.env.POIERA_STATE_DIR

afterEach(() => {
  vi.resetModules()
  if (originalWebUiHome === undefined) delete process.env.POIERA_HOME
  else process.env.POIERA_HOME = originalWebUiHome
  if (originalWebuiStateDir === undefined) delete process.env.POIERA_STATE_DIR
  else process.env.POIERA_STATE_DIR = originalWebuiStateDir
})

describe('media controller', () => {
  it('uses Poiera media directory as the default generated video output path', async () => {
    process.env.POIERA_HOME = '/tmp/poiera-test-home'
    const { defaultMediaOutputPath } = await import('../../packages/server/src/controllers/hermes/media')

    expect(defaultMediaOutputPath('req_123')).toBe(join('/tmp/poiera-test-home', 'media', 'req_123.mp4'))
    expect(defaultMediaOutputPath('bad/request:id')).toBe(join('/tmp/poiera-test-home', 'media', 'bad_request_id.mp4'))
  })

  it('limits regular-user media paths to the selected profile', async () => {
    const { validateRegularUserMediaPath } = await import('../../packages/server/src/controllers/hermes/media')
    const { getProfileDir } = await import('../../packages/server/src/services/hermes/hermes-profile')
    const profilePath = join(getProfileDir('research'), 'images', 'source.png')
    const ctx = { state: { user: { role: 'user' } } } as any

    expect(validateRegularUserMediaPath(ctx, 'research', profilePath)).toBe(profilePath)
    expect(() => validateRegularUserMediaPath(ctx, 'research', '/tmp/private.png')).toThrow('not available')
    expect(() => validateRegularUserMediaPath(ctx, 'research', join(getProfileDir('research'), 'auth.json'))).toThrow('not available')
  })
})
