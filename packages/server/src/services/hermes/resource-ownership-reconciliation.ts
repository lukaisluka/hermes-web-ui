import { getDb } from '../../db'
import { listJobOwnersForUserProfiles } from '../../db/hermes/job-ownership-store'
import { getHermesBin } from './hermes-path'
import { getProfileDir } from './hermes-profile'
import { execHermesWithBin } from './hermes-process'
import { logger } from '../logger'

export interface OwnershipReconciliationResult {
  ownerlessRooms: number
  pausedJobs: number
  failedJobs: string[]
}

export async function reconcileRevokedProfileOwnership(
  userId: number,
  revokedProfiles: string[],
): Promise<OwnershipReconciliationResult> {
  const profiles = [...new Set(revokedProfiles.map(profile => profile.trim()).filter(Boolean))]
  if (!Number.isInteger(userId) || userId <= 0 || !profiles.length) {
    return { ownerlessRooms: 0, pausedJobs: 0, failedJobs: [] }
  }

  const db = getDb()
  let ownerlessRooms = 0
  if (db) {
    const placeholders = profiles.map(() => '?').join(', ')
    const result = db.prepare(
      `UPDATE gc_rooms SET ownerUserId = NULL WHERE ownerUserId = ? AND profile IN (${placeholders})`,
    ).run(userId, ...profiles)
    ownerlessRooms = Number(result.changes || 0)
  }

  let pausedJobs = 0
  const failedJobs: string[] = []
  for (const owner of listJobOwnersForUserProfiles(userId, profiles)) {
    try {
      await execHermesWithBin(getHermesBin(), ['cron', 'pause', owner.job_id], {
        cwd: process.cwd(),
        env: { ...process.env, HERMES_HOME: getProfileDir(owner.profile) },
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      pausedJobs += 1
    } catch (error) {
      failedJobs.push(`${owner.profile}:${owner.job_id}`)
      logger.warn(error, 'Failed to pause job after owner lost profile access profile=%s job=%s user=%d',
        owner.profile, owner.job_id, userId)
    }
  }

  return { ownerlessRooms, pausedJobs, failedJobs }
}
