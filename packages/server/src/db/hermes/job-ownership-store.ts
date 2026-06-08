import { getDb } from '../index'
import { JOB_OWNERS_TABLE } from './schemas'

export interface JobOwnerRecord {
  profile: string
  job_id: string
  owner_user_id: number
  created_at: number
  updated_at: number
}

function normalizedProfile(profile: string): string {
  return profile.trim() || 'default'
}

export function getJobOwnerId(profile: string, jobId: string): number | null {
  const db = getDb()
  if (!db || !jobId.trim()) return null
  const row = db.prepare(
    `SELECT owner_user_id FROM ${JOB_OWNERS_TABLE} WHERE profile = ? AND job_id = ?`,
  ).get(normalizedProfile(profile), jobId.trim()) as { owner_user_id?: number } | undefined
  return Number.isInteger(row?.owner_user_id) ? Number(row?.owner_user_id) : null
}

export function listJobOwnersForUserProfiles(ownerUserId: number, profiles: string[]): JobOwnerRecord[] {
  const db = getDb()
  const uniqueProfiles = [...new Set(profiles.map(normalizedProfile).filter(Boolean))]
  if (!db || !Number.isInteger(ownerUserId) || ownerUserId <= 0 || !uniqueProfiles.length) return []
  const placeholders = uniqueProfiles.map(() => '?').join(', ')
  return db.prepare(
    `SELECT profile, job_id, owner_user_id, created_at, updated_at
     FROM ${JOB_OWNERS_TABLE}
     WHERE owner_user_id = ? AND profile IN (${placeholders})`,
  ).all(ownerUserId, ...uniqueProfiles) as unknown as JobOwnerRecord[]
}

export function setJobOwner(profile: string, jobId: string, ownerUserId: number, at = Date.now()): void {
  const db = getDb()
  if (!db || !jobId.trim() || !Number.isInteger(ownerUserId) || ownerUserId <= 0) return
  db.prepare(
    `INSERT INTO ${JOB_OWNERS_TABLE} (profile, job_id, owner_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(profile, job_id) DO UPDATE SET owner_user_id = excluded.owner_user_id, updated_at = excluded.updated_at`,
  ).run(normalizedProfile(profile), jobId.trim(), ownerUserId, at, at)
}

export function deleteJobOwner(profile: string, jobId: string): void {
  const db = getDb()
  if (!db || !jobId.trim()) return
  db.prepare(`DELETE FROM ${JOB_OWNERS_TABLE} WHERE profile = ? AND job_id = ?`)
    .run(normalizedProfile(profile), jobId.trim())
}
