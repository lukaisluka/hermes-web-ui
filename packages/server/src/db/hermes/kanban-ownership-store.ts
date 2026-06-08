import { getDb } from '../index'
import { KANBAN_BOARD_SCOPES_TABLE, KANBAN_TASK_OWNERS_TABLE } from './schemas'

export interface KanbanBoardScope {
  board_slug: string
  profile: string
  creator_user_id: number
}

export interface KanbanTaskOwner {
  board_slug: string
  task_id: string
  creator_user_id: number
  dispatcher_user_id: number | null
}

function normalizedBoard(board: string): string {
  return board.trim() || 'default'
}

export function getKanbanBoardScope(board: string): KanbanBoardScope | null {
  const db = getDb()
  if (!db) return null
  return (db.prepare(
    `SELECT board_slug, profile, creator_user_id FROM ${KANBAN_BOARD_SCOPES_TABLE} WHERE board_slug = ?`,
  ).get(normalizedBoard(board)) as KanbanBoardScope | undefined) || null
}

export function setKanbanBoardScope(board: string, profile: string, creatorUserId: number, at = Date.now()): void {
  const db = getDb()
  if (!db || !Number.isInteger(creatorUserId) || creatorUserId <= 0) return
  db.prepare(
    `INSERT INTO ${KANBAN_BOARD_SCOPES_TABLE} (board_slug, profile, creator_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(board_slug) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at`,
  ).run(normalizedBoard(board), profile.trim() || 'default', creatorUserId, at, at)
}

export function getKanbanTaskOwner(board: string, taskId: string): KanbanTaskOwner | null {
  const db = getDb()
  if (!db || !taskId.trim()) return null
  return (db.prepare(
    `SELECT board_slug, task_id, creator_user_id, dispatcher_user_id
     FROM ${KANBAN_TASK_OWNERS_TABLE} WHERE board_slug = ? AND task_id = ?`,
  ).get(normalizedBoard(board), taskId.trim()) as KanbanTaskOwner | undefined) || null
}

export function setKanbanTaskCreator(board: string, taskId: string, creatorUserId: number, at = Date.now()): void {
  const db = getDb()
  if (!db || !taskId.trim() || !Number.isInteger(creatorUserId) || creatorUserId <= 0) return
  db.prepare(
    `INSERT INTO ${KANBAN_TASK_OWNERS_TABLE} (board_slug, task_id, creator_user_id, dispatcher_user_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT(board_slug, task_id) DO UPDATE SET creator_user_id = excluded.creator_user_id, updated_at = excluded.updated_at`,
  ).run(normalizedBoard(board), taskId.trim(), creatorUserId, at, at)
}

export function setKanbanTaskDispatcher(board: string, taskId: string, dispatcherUserId: number, at = Date.now()): void {
  const db = getDb()
  if (!db || !taskId.trim() || !Number.isInteger(dispatcherUserId) || dispatcherUserId <= 0) return
  db.prepare(
    `UPDATE ${KANBAN_TASK_OWNERS_TABLE} SET dispatcher_user_id = ?, updated_at = ?
     WHERE board_slug = ? AND task_id = ?`,
  ).run(dispatcherUserId, at, normalizedBoard(board), taskId.trim())
}
