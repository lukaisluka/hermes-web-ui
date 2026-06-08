import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'

const mockGetSkillUsageStatsFromDb = vi.hoisted(() => vi.fn())
const mockGetActiveProfileName = vi.hoisted(() => vi.fn())
const mockGetProfileDir = vi.hoisted(() => vi.fn())
const mockUpdateConfigYamlForProfile = vi.hoisted(() => vi.fn())
const mockReadConfigYamlForProfile = vi.hoisted(() => vi.fn())
const mockSafeReadFile = vi.hoisted(() => vi.fn())
const mockExtractDescription = vi.hoisted(() => vi.fn())
const mockListFilesRecursive = vi.hoisted(() => vi.fn())
const mockListUserProfiles = vi.hoisted(() => vi.fn())

vi.mock('../../packages/server/src/db/hermes/sessions-db', () => ({
  getSkillUsageStatsFromDb: mockGetSkillUsageStatsFromDb,
}))

vi.mock('../../packages/server/src/services/hermes/hermes-profile', () => ({
  getActiveProfileName: mockGetActiveProfileName,
  getProfileDir: mockGetProfileDir,
}))

vi.mock('../../packages/server/src/db/hermes/users-store', () => ({
  listUserProfiles: mockListUserProfiles,
}))

vi.mock('../../packages/server/src/middleware/user-auth', () => ({
  isRegularUser: (user: any) => user?.role === 'user',
}))

vi.mock('../../packages/server/src/services/config-helpers', () => ({
  readConfigYamlForProfile: mockReadConfigYamlForProfile,
  updateConfigYamlForProfile: mockUpdateConfigYamlForProfile,
  safeReadFile: mockSafeReadFile,
  extractDescription: mockExtractDescription,
  listFilesRecursive: mockListFilesRecursive,
}))

async function loadController() {
  vi.resetModules()
  return import('../../packages/server/src/controllers/hermes/skills')
}

function multipartBody(boundary: string, parts: Array<{ name: string; value: string; filename?: string; contentType?: string }>): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    const filename = part.filename ? `; filename="${part.filename}"` : ''
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"${filename}\r\n`))
    if (part.contentType) chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`))
    chunks.push(Buffer.from('\r\n'))
    chunks.push(Buffer.from(part.value))
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return Buffer.concat(chunks)
}

describe('skills controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveProfileName.mockReturnValue('default')
    mockGetProfileDir.mockImplementation((profile: string) => `/tmp/hermes-${profile}`)
    mockReadConfigYamlForProfile.mockResolvedValue({})
    mockSafeReadFile.mockImplementation(async (path: string) => {
      try {
        return await readFile(path, 'utf-8')
      } catch {
        return null
      }
    })
    mockExtractDescription.mockImplementation((content: string) => {
      return content.split('\n').find(line => line.trim() && !line.startsWith('#'))?.trim() || ''
    })
    mockListFilesRecursive.mockResolvedValue([])
    mockListUserProfiles.mockReturnValue([])
    mockUpdateConfigYamlForProfile.mockImplementation(async (_profile: string, updater: (config: Record<string, any>) => Record<string, any>) => updater({}))
    mockGetSkillUsageStatsFromDb.mockResolvedValue({
      period_days: 7,
      summary: {
        total_skill_loads: 0,
        total_skill_edits: 0,
        total_skill_actions: 0,
        distinct_skills_used: 0,
      },
      by_day: [],
      top_skills: [],
    })
  })

  it('loads skill usage from the request-scoped profile state database', async () => {
    const { usageStats } = await loadController()
    const ctx: any = { query: { days: '30' }, state: { profile: { name: 'research' } }, body: null }

    await usageStats(ctx)

    expect(mockGetSkillUsageStatsFromDb).toHaveBeenCalledWith(30, undefined, 'research')
    expect(ctx.body.period_days).toBe(7)
  })

  it('falls back to active profile when no request profile is set', async () => {
    mockGetActiveProfileName.mockReturnValue('travel')
    const { usageStats } = await loadController()
    const ctx: any = { query: {}, state: {}, body: null }

    await usageStats(ctx)

    expect(mockGetSkillUsageStatsFromDb).toHaveBeenCalledWith(7, undefined, 'travel')
  })

  it('aggregates skill usage across every profile authorized for regular users', async () => {
    mockListUserProfiles.mockReturnValue([{ profile_name: 'default' }, { profile_name: 'travel' }])
    mockGetSkillUsageStatsFromDb.mockImplementation(async (_days: number, _source: unknown, profile: string) => ({
      period_days: 7,
      summary: {
        total_skill_loads: profile === 'default' ? 1 : 2,
        total_skill_edits: profile === 'default' ? 0 : 1,
        total_skill_actions: profile === 'default' ? 1 : 3,
        distinct_skills_used: 1,
      },
      by_day: [],
      top_skills: [
        { skill: profile === 'default' ? 'read-file' : 'write-file', view_count: profile === 'default' ? 1 : 2, manage_count: profile === 'default' ? 0 : 1, total_count: profile === 'default' ? 1 : 3, percentage: 100, last_used_at: null },
      ],
    }))
    const { usageStats } = await loadController()
    const ctx: any = { query: {}, state: { user: { id: 7, role: 'user' } }, body: null }

    await usageStats(ctx)

    expect(mockGetSkillUsageStatsFromDb).toHaveBeenCalledWith(7, undefined, 'default')
    expect(mockGetSkillUsageStatsFromDb).toHaveBeenCalledWith(7, undefined, 'travel')
    expect(ctx.body.summary).toEqual({
      total_skill_loads: 3,
      total_skill_edits: 1,
      total_skill_actions: 4,
      distinct_skills_used: 2,
    })
  })

  it('rejects regular users reading skill usage for unauthorized profiles', async () => {
    mockListUserProfiles.mockReturnValue([{ profile_name: 'default' }])
    const { usageStats } = await loadController()
    const ctx: any = { query: { profile: 'secret' }, state: { user: { id: 7, role: 'user' } }, body: null }

    await usageStats(ctx)

    expect(ctx.status).toBe(403)
    expect(mockGetSkillUsageStatsFromDb).not.toHaveBeenCalled()
  })

  it('toggles skills in the request-scoped profile config', async () => {
    let updatedConfig: Record<string, any> | undefined
    mockUpdateConfigYamlForProfile.mockImplementation(async (_profile: string, updater: (config: Record<string, any>) => Record<string, any>) => {
      updatedConfig = await updater({ skills: { disabled: ['old-skill'] }, model: { default: 'glm-5.1' } })
      return undefined
    })
    const { toggle } = await loadController()
    const ctx: any = {
      request: { body: { name: 'new-skill', enabled: false } },
      state: { profile: { name: 'research' } },
      body: null,
    }

    await toggle(ctx)

    expect(mockUpdateConfigYamlForProfile).toHaveBeenCalledWith('research', expect.any(Function))
    expect(updatedConfig).toEqual({
      skills: { disabled: ['old-skill', 'new-skill'] },
      model: { default: 'glm-5.1' },
    })
    expect(ctx.body).toEqual({ success: true })
  })

  it('lists configured external skill directories with external source while keeping local skills first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hermes-web-ui-external-skills-'))
    const profileDir = join(root, 'profile')
    const localSkillDir = join(profileDir, 'skills', 'tools', 'dupe-skill')
    const externalDir = join(root, 'external-skills')
    const externalSkillDir = join(externalDir, 'tools', 'external-skill')
    const externalDupeDir = join(externalDir, 'tools', 'dupe-skill')

    await mkdir(localSkillDir, { recursive: true })
    await mkdir(externalSkillDir, { recursive: true })
    await mkdir(externalDupeDir, { recursive: true })
    await writeFile(join(localSkillDir, 'SKILL.md'), '# Local Dupe\nlocal copy\n', 'utf-8')
    await writeFile(join(externalSkillDir, 'SKILL.md'), '# External Skill\nexternal copy\n', 'utf-8')
    await writeFile(join(externalDupeDir, 'SKILL.md'), '# External Dupe\nexternal duplicate\n', 'utf-8')

    mockGetProfileDir.mockReturnValue(profileDir)
    mockReadConfigYamlForProfile.mockResolvedValue({
      skills: { external_dirs: [externalDir] },
    })

    try {
      const { list } = await loadController()
      const ctx: any = { state: { profile: { name: 'research' } }, body: null }

      await list(ctx)

      const tools = ctx.body.categories.find((category: any) => category.name === 'tools')
      expect(tools.skills).toEqual([
        expect.objectContaining({ name: 'dupe-skill', source: 'local', description: 'local copy' }),
        expect.objectContaining({ name: 'external-skill', source: 'external', description: 'external copy' }),
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns enabled skill names and descriptions only to regular users', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hermes-web-ui-readonly-skills-'))
    const profileDir = join(root, 'profile')
    const enabledSkillDir = join(profileDir, 'skills', 'tools', 'enabled-skill')
    const disabledSkillDir = join(profileDir, 'skills', 'tools', 'disabled-skill')
    const archivedSkillDir = join(profileDir, 'skills', '.archive', 'archived-skill')

    await mkdir(enabledSkillDir, { recursive: true })
    await mkdir(disabledSkillDir, { recursive: true })
    await mkdir(archivedSkillDir, { recursive: true })
    await writeFile(join(enabledSkillDir, 'SKILL.md'), '# Enabled\nsafe description\n', 'utf-8')
    await writeFile(join(disabledSkillDir, 'SKILL.md'), '# Disabled\nhidden description\n', 'utf-8')
    await writeFile(join(archivedSkillDir, 'SKILL.md'), '# Archived\nhidden archive\n', 'utf-8')

    mockGetProfileDir.mockReturnValue(profileDir)
    mockReadConfigYamlForProfile.mockResolvedValue({
      skills: { disabled: ['disabled-skill'] },
    })

    try {
      const { list } = await loadController()
      const ctx: any = {
        state: {
          profile: { name: 'research' },
          user: { id: 7, role: 'user' },
        },
        body: null,
      }

      await list(ctx)

      expect(ctx.body).toEqual({
        categories: [{
          name: 'tools',
          description: expect.any(String),
          skills: [{
            name: 'enabled-skill',
            description: 'safe description',
            enabled: true,
          }],
        }],
        archived: [],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('updates external skill directories in the request-scoped profile config', async () => {
    let updatedConfig: Record<string, any> | undefined
    mockUpdateConfigYamlForProfile.mockImplementation(async (_profile: string, updater: (config: Record<string, any>) => Record<string, any>) => {
      updatedConfig = await updater({ skills: { disabled: ['old-skill'] }, model: { default: 'glm-5.1' } })
      return undefined
    })
    const { updateExternalDirs } = await loadController()
    const ctx: any = {
      request: { body: { dirs: [' ~/research-skills ', '', '~/research-skills', '$HOME/shared-skills'] } },
      state: { profile: { name: 'research' } },
      body: null,
    }

    await updateExternalDirs(ctx)

    expect(mockUpdateConfigYamlForProfile).toHaveBeenCalledWith('research', expect.any(Function))
    expect(updatedConfig).toEqual({
      skills: { disabled: ['old-skill'], external_dirs: ['~/research-skills', '$HOME/shared-skills'] },
      model: { default: 'glm-5.1' },
    })
    expect(ctx.body).toEqual({ success: true, dirs: ['~/research-skills', '$HOME/shared-skills'] })
  })

  it('imports skills into the request-scoped profile directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hermes-web-ui-import-profile-'))
    const defaultProfileDir = join(root, 'default')
    const researchProfileDir = join(root, 'research')
    mockGetProfileDir.mockImplementation((profile: string) => profile === 'research' ? researchProfileDir : defaultProfileDir)

    const boundary = '----hermes-skill-import-test'
    const ctx: any = {
      get: vi.fn((header: string) => header.toLowerCase() === 'content-type' ? `multipart/form-data; boundary=${boundary}` : ''),
      req: Readable.from([multipartBody(boundary, [
        { name: 'file', filename: 'demo-skill/SKILL.md', contentType: 'text/markdown', value: '# Demo Skill\nresearch copy\n' },
      ])]),
      state: { profile: { name: 'research' } },
      body: null,
    }

    try {
      const { importSkill } = await loadController()

      await importSkill(ctx)

      await expect(readFile(join(researchProfileDir, 'skills', 'demo-skill', 'SKILL.md'), 'utf-8')).resolves.toBe('# Demo Skill\nresearch copy\n')
      await expect(readFile(join(defaultProfileDir, 'skills', 'demo-skill', 'SKILL.md'), 'utf-8')).rejects.toThrow()
      expect(ctx.body).toEqual({ success: true, name: 'demo-skill' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('deletes local skills only from the request-scoped profile directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hermes-web-ui-delete-profile-'))
    const defaultProfileDir = join(root, 'default')
    const researchProfileDir = join(root, 'research')
    const defaultSkillDir = join(defaultProfileDir, 'skills', 'tools', 'dupe-skill')
    const researchSkillDir = join(researchProfileDir, 'skills', 'tools', 'dupe-skill')
    await mkdir(defaultSkillDir, { recursive: true })
    await mkdir(researchSkillDir, { recursive: true })
    await writeFile(join(defaultSkillDir, 'SKILL.md'), '# Default Copy\n', 'utf-8')
    await writeFile(join(researchSkillDir, 'SKILL.md'), '# Research Copy\n', 'utf-8')
    mockGetProfileDir.mockImplementation((profile: string) => profile === 'research' ? researchProfileDir : defaultProfileDir)

    const ctx: any = {
      params: { category: 'tools', skill: 'dupe-skill' },
      state: { profile: { name: 'research' } },
      body: null,
    }

    try {
      const { deleteSkill } = await loadController()

      await deleteSkill(ctx)

      await expect(readFile(join(defaultSkillDir, 'SKILL.md'), 'utf-8')).resolves.toBe('# Default Copy\n')
      await expect(readFile(join(researchSkillDir, 'SKILL.md'), 'utf-8')).rejects.toThrow()
      expect(ctx.body).toEqual({ success: true })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
