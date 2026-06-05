import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  isRegularUser: (user: any) => user?.role === 'user',
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}))

const originalWebUiHome = process.env.HERMES_WEB_UI_HOME
const originalWebuiStateDir = process.env.HERMES_WEBUI_STATE_DIR

afterEach(() => {
  vi.resetModules()
  if (originalWebUiHome === undefined) delete process.env.HERMES_WEB_UI_HOME
  else process.env.HERMES_WEB_UI_HOME = originalWebUiHome
  if (originalWebuiStateDir === undefined) delete process.env.HERMES_WEBUI_STATE_DIR
  else process.env.HERMES_WEBUI_STATE_DIR = originalWebuiStateDir
})

describe('media controller', () => {
  it('uses Hermes Web UI media directory as the default generated video output path', async () => {
    process.env.HERMES_WEB_UI_HOME = '/tmp/hermes-web-ui-test-home'
    const { defaultImageOutputPath, defaultMediaOutputPath } = await import('../../packages/server/src/controllers/hermes/media')

    expect(defaultMediaOutputPath('req_123')).toBe(join('/tmp/hermes-web-ui-test-home', 'media', 'req_123.mp4'))
    expect(defaultMediaOutputPath('bad/request:id')).toBe(join('/tmp/hermes-web-ui-test-home', 'media', 'bad_request_id.mp4'))
    expect(defaultImageOutputPath('img_123')).toBe(join('/tmp/hermes-web-ui-test-home', 'media', 'img_123.png'))
    expect(defaultImageOutputPath('bad/request:id', 1)).toBe(join('/tmp/hermes-web-ui-test-home', 'media', 'bad_request_id-2.png'))
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
