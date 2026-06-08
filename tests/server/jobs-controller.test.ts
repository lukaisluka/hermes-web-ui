import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  profileDir: '',
  profileDirs: {} as Record<string, string>,
  execFile: vi.fn(),
  listUserProfiles: vi.fn(),
  findUserById: vi.fn(),
  userCanAccessProfile: vi.fn(),
  getJobOwnerId: vi.fn(),
  setJobOwner: vi.fn(),
  deleteJobOwner: vi.fn(),
}))

vi.mock('../../packages/server/src/services/hermes/hermes-profile', () => ({
  getActiveProfileName: () => 'default',
  getProfileDir: (profile: string) => testState.profileDirs[profile] || testState.profileDir || '/fake/home/.hermes',
}))

vi.mock('../../packages/server/src/db/hermes/users-store', () => ({
  listUserProfiles: testState.listUserProfiles,
  findUserById: testState.findUserById,
  userCanAccessProfile: testState.userCanAccessProfile,
}))

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  isRegularUser: (user: any) => user?.role === 'user',
  isProfileAdmin: (user: any) => user?.role === 'admin' || user?.role === 'super_admin',
}))

vi.mock('../../packages/server/src/db/hermes/job-ownership-store', () => ({
  getJobOwnerId: testState.getJobOwnerId,
  setJobOwner: testState.setJobOwner,
  deleteJobOwner: testState.deleteJobOwner,
}))

vi.mock('../../packages/server/src/services/hermes/hermes-path', () => ({
  getHermesBin: () => '/fake/bin/hermes',
}))

vi.mock('child_process', () => ({
  execFile: testState.execFile,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { list, transferOwner, update } from '../../packages/server/src/controllers/hermes/jobs'

function createMockCtx(overrides: Record<string, any> = {}) {
  const ctx: any = {
    req: { method: 'PATCH' },
    request: { body: { name: 'renamed' } },
    params: { id: 'abc123abc123' },
    query: {},
    search: '',
    headers: {},
    status: 200,
    set: vi.fn(),
    body: null,
    ...overrides,
  }
  ctx.get = (name: string) => {
    const match = Object.entries(ctx.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
    const value = match?.[1]
    return Array.isArray(value) ? value[0] : value || ''
  }
  return ctx
}

describe('Hermes jobs controller', () => {
  let tempDir = ''

  beforeEach(() => {
    vi.clearAllMocks()
    tempDir = mkdtempSync(join(tmpdir(), 'hermes-web-ui-jobs-test-'))
    testState.profileDir = tempDir
    testState.profileDirs = {}
    testState.listUserProfiles.mockReturnValue([])
    testState.findUserById.mockReturnValue(null)
    testState.userCanAccessProfile.mockReturnValue(false)
    testState.getJobOwnerId.mockReturnValue(null)
    testState.execFile.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, { stdout: '', stderr: '' })
    })
  })

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
    testState.profileDir = ''
    testState.profileDirs = {}
  })

  it('returns 404 before editing when the local cron job does not exist', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ error: 'Prompt must be ≤ 5000 characters' }),
    })

    const ctx = createMockCtx()
    await update(ctx)

    expect(ctx.status).toBe(404)
    expect(ctx.body).toEqual({ error: { message: 'Job not found' } })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not call the removed gateway proxy path for missing jobs', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const ctx = createMockCtx()
    await update(ctx)

    expect(ctx.status).toBe(404)
    expect(ctx.body).toEqual({ error: { message: 'Job not found' } })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('clears repeat by passing repeat 0 to Hermes CLI', async () => {
    const cronDir = join(tempDir, 'cron')
    mkdirSync(cronDir, { recursive: true })
    writeFileSync(join(cronDir, 'jobs.json'), JSON.stringify({
      jobs: [{
        job_id: 'abc123abc123',
        id: 'abc123abc123',
        name: 'daily',
        schedule: { kind: 'cron', expr: '0 9 * * *', display: '0 9 * * *' },
        schedule_display: '0 9 * * *',
        prompt: 'run daily',
        repeat: { times: 3, completed: 1 },
      }],
    }))

    const ctx = createMockCtx({
      request: { body: { repeat: null } },
    })
    await update(ctx)

    expect(ctx.status).toBe(200)
    expect(testState.execFile).toHaveBeenCalledWith(
      '/fake/bin/hermes',
      ['cron', 'edit', 'abc123abc123', '--repeat', '0'],
      expect.objectContaining({
        env: expect.objectContaining({ HERMES_HOME: tempDir }),
        windowsHide: true,
      }),
      expect.any(Function),
    )
    expect(ctx.body.job.profile).toBe('default')
  })

  it('aggregates regular-user job lists across authorized profiles and marks profile scope', async () => {
    const defaultDir = join(tempDir, 'default')
    const travelDir = join(tempDir, 'travel')
    mkdirSync(join(defaultDir, 'cron'), { recursive: true })
    mkdirSync(join(travelDir, 'cron'), { recursive: true })
    testState.profileDirs = { default: defaultDir, travel: travelDir }
    testState.listUserProfiles.mockReturnValue([{ profile_name: 'default' }, { profile_name: 'travel' }])
    writeFileSync(join(defaultDir, 'cron', 'jobs.json'), JSON.stringify({
      jobs: [{ job_id: 'job-default', name: 'Default job', enabled: true }],
    }))
    writeFileSync(join(travelDir, 'cron', 'jobs.json'), JSON.stringify({
      jobs: [{ job_id: 'job-travel', name: 'Travel job', enabled: true }],
    }))

    const ctx = createMockCtx({
      req: { method: 'GET' },
      query: {},
      state: { user: { id: 7, role: 'user' } },
      request: { body: {} },
    })
    await list(ctx)

    expect(ctx.body.jobs.map((job: any) => ({ id: job.id, profile: job.profile }))).toEqual([
      { id: 'job-default', profile: 'default' },
      { id: 'job-travel', profile: 'travel' },
    ])
  })

  it('allows regular users to manage only jobs they own', async () => {
    const cronDir = join(tempDir, 'cron')
    mkdirSync(cronDir, { recursive: true })
    writeFileSync(join(cronDir, 'jobs.json'), JSON.stringify({
      jobs: [{ job_id: 'abc123abc123', name: 'daily' }],
    }))

    testState.getJobOwnerId.mockReturnValue(8)
    const deniedCtx = createMockCtx({
      state: { user: { id: 7, role: 'user' }, profile: { name: 'default' } },
    })
    await update(deniedCtx)

    expect(deniedCtx.status).toBe(403)
    expect(testState.execFile).not.toHaveBeenCalled()

    testState.getJobOwnerId.mockReturnValue(7)
    const allowedCtx = createMockCtx({
      state: { user: { id: 7, role: 'user' }, profile: { name: 'default' } },
    })
    await update(allowedCtx)

    expect(allowedCtx.status).toBe(200)
    expect(testState.execFile).toHaveBeenCalled()
  })

  it('allows profile admins to manage ownerless jobs', async () => {
    const cronDir = join(tempDir, 'cron')
    mkdirSync(cronDir, { recursive: true })
    writeFileSync(join(cronDir, 'jobs.json'), JSON.stringify({
      jobs: [{ job_id: 'abc123abc123', name: 'daily' }],
    }))

    const ctx = createMockCtx({
      state: { user: { id: 3, role: 'admin' }, profile: { name: 'default' } },
    })
    await update(ctx)

    expect(ctx.status).toBe(200)
    expect(testState.execFile).toHaveBeenCalled()
  })

  it('allows profile admins to transfer a job to an active profile member', async () => {
    const cronDir = join(tempDir, 'cron')
    mkdirSync(cronDir, { recursive: true })
    writeFileSync(join(cronDir, 'jobs.json'), JSON.stringify({
      jobs: [{ job_id: 'abc123abc123', name: 'daily' }],
    }))
    testState.findUserById.mockReturnValue({ id: 7, role: 'user', status: 'active' })
    testState.userCanAccessProfile.mockReturnValue(true)

    const ctx = createMockCtx({
      state: { user: { id: 3, role: 'admin' }, profile: { name: 'default' } },
      request: { body: { user_id: 7 } },
    })
    await transferOwner(ctx)

    expect(testState.setJobOwner).toHaveBeenCalledWith('default', 'abc123abc123', 7)
    expect(ctx.body.job).toEqual(expect.objectContaining({ id: 'abc123abc123', profile: 'default' }))
  })
})
