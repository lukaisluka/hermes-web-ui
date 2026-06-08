/**
 * Centralized schema definitions for all Hermes SQLite tables.
 * All table schemas are defined here for unified management and migration.
 */

// ============================================================================
// Usage Store (usage-store.ts)
// ============================================================================

export const USAGE_TABLE = 'session_usage'

export const USAGE_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  session_id: 'TEXT NOT NULL',
  input_tokens: 'INTEGER NOT NULL DEFAULT 0',
  output_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_read_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_write_tokens: 'INTEGER NOT NULL DEFAULT 0',
  reasoning_tokens: 'INTEGER NOT NULL DEFAULT 0',
  model: "TEXT NOT NULL DEFAULT ''",
  profile: "TEXT NOT NULL DEFAULT 'default'",
  created_at: 'INTEGER NOT NULL DEFAULT 0',
}

// ============================================================================
// Session Store (session-store.ts)
// ============================================================================

export const SESSIONS_TABLE = 'sessions'

export const SESSIONS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  profile: 'TEXT NOT NULL DEFAULT \'default\'',
  source: 'TEXT NOT NULL DEFAULT \'api_server\'',
  user_id: 'TEXT',
  model: 'TEXT NOT NULL DEFAULT \'\'',
  provider: 'TEXT NOT NULL DEFAULT \'\'',
  title: 'TEXT',
  started_at: 'INTEGER NOT NULL',
  ended_at: 'INTEGER',
  end_reason: 'TEXT',
  message_count: 'INTEGER NOT NULL DEFAULT 0',
  tool_call_count: 'INTEGER NOT NULL DEFAULT 0',
  input_tokens: 'INTEGER NOT NULL DEFAULT 0',
  output_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_read_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_write_tokens: 'INTEGER NOT NULL DEFAULT 0',
  reasoning_tokens: 'INTEGER NOT NULL DEFAULT 0',
  billing_provider: 'TEXT',
  estimated_cost_usd: 'REAL NOT NULL DEFAULT 0',
  actual_cost_usd: 'REAL',
  cost_status: 'TEXT NOT NULL DEFAULT \'\'',
  preview: 'TEXT NOT NULL DEFAULT \'\'',
  last_active: 'INTEGER NOT NULL',
  workspace: 'TEXT',
}

export const MESSAGES_TABLE = 'messages'

export const MESSAGES_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  session_id: 'TEXT NOT NULL',
  role: 'TEXT NOT NULL',
  content: 'TEXT NOT NULL DEFAULT \'\'',
  tool_call_id: 'TEXT',
  tool_calls: 'TEXT',
  tool_name: 'TEXT',
  timestamp: 'INTEGER NOT NULL',
  token_count: 'INTEGER',
  finish_reason: 'TEXT',
  reasoning: 'TEXT',
  reasoning_details: 'TEXT',
  reasoning_content: 'TEXT',
}

export const MESSAGES_INDEX = 'CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)'

// ============================================================================
// Compression Snapshot (compression-snapshot.ts)
// ============================================================================

export const COMPRESSION_SNAPSHOT_TABLE = 'chat_compression_snapshots'

export const COMPRESSION_SNAPSHOT_SCHEMA: Record<string, string> = {
  session_id: 'TEXT PRIMARY KEY',
  summary: 'TEXT NOT NULL DEFAULT \'\'',
  last_message_index: 'INTEGER NOT NULL DEFAULT 0',
  message_count_at_time: 'INTEGER NOT NULL DEFAULT 0',
  updated_at: 'INTEGER NOT NULL',
}

// ============================================================================
// Model Context (model-context.ts)
// ============================================================================

export const MODEL_CONTEXT_TABLE = 'model_context'

export const MODEL_CONTEXT_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  provider: 'TEXT NOT NULL',
  model: 'TEXT NOT NULL',
  context_limit: 'INTEGER NOT NULL',
}

export const MODEL_CONTEXT_INDEX = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_model_context_provider_model ON model_context(provider, model)'

// ============================================================================
// Users and Profile Access
// ============================================================================

export const USERS_TABLE = 'users'

export const USERS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  username: 'TEXT NOT NULL UNIQUE',
  password_hash: 'TEXT NOT NULL',
  role: "TEXT NOT NULL DEFAULT 'user'",
  status: "TEXT NOT NULL DEFAULT 'active'",
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
  last_login_at: 'INTEGER',
  avatar: "TEXT NOT NULL DEFAULT ''",
}

export const USER_PROFILES_TABLE = 'user_profiles'

export const USER_PROFILES_SCHEMA: Record<string, string> = {
  user_id: 'INTEGER NOT NULL',
  profile_name: "TEXT NOT NULL DEFAULT 'default'",
  is_default: 'INTEGER NOT NULL DEFAULT 0',
  created_at: 'INTEGER NOT NULL',
}

export const USER_PROFILES_INDEXES = {
  idx_user_profiles_user: 'CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id)',
  idx_user_profiles_profile: 'CREATE INDEX IF NOT EXISTS idx_user_profiles_profile ON user_profiles(profile_name)',
  idx_user_profiles_default: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_default ON user_profiles(user_id) WHERE is_default = 1',
}

// ============================================================================
// Profile-scoped resource ownership
// ============================================================================

export const JOB_OWNERS_TABLE = 'job_owners'

export const JOB_OWNERS_SCHEMA: Record<string, string> = {
  profile: "TEXT NOT NULL DEFAULT 'default'",
  job_id: 'TEXT NOT NULL',
  owner_user_id: 'INTEGER NOT NULL',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

export const KANBAN_BOARD_SCOPES_TABLE = 'kanban_board_scopes'

export const KANBAN_BOARD_SCOPES_SCHEMA: Record<string, string> = {
  board_slug: 'TEXT PRIMARY KEY',
  profile: "TEXT NOT NULL DEFAULT 'default'",
  creator_user_id: 'INTEGER NOT NULL',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

export const KANBAN_TASK_OWNERS_TABLE = 'kanban_task_owners'

export const KANBAN_TASK_OWNERS_SCHEMA: Record<string, string> = {
  board_slug: "TEXT NOT NULL DEFAULT 'default'",
  task_id: 'TEXT NOT NULL',
  creator_user_id: 'INTEGER NOT NULL',
  dispatcher_user_id: 'INTEGER',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

// ============================================================================
// Audit Events (services/audit.ts)
// ============================================================================

export const AUDIT_EVENTS_TABLE = 'audit_events'

export const AUDIT_EVENTS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  timestamp: 'INTEGER NOT NULL',
  action: 'TEXT NOT NULL',           // e.g. 'user.create', 'profile.delete', 'mcp.update'
  actor_id: 'INTEGER NOT NULL',      // user.id of the actor
  actor_username: 'TEXT NOT NULL',   // username at time of action (denormalized for query convenience)
  actor_role: 'TEXT NOT NULL',       // role at time of action
  profile: "TEXT NOT NULL DEFAULT ''", // profile scope, empty for global actions
  target_type: "TEXT NOT NULL DEFAULT ''", // e.g. 'user', 'profile', 'skill', 'mcp_server', 'group_chat_room', 'job', 'kanban_board'
  target_id: "TEXT NOT NULL DEFAULT ''",   // identifier of the target resource
  description: "TEXT NOT NULL DEFAULT ''", // human-readable summary (no secrets/content)
  meta: 'TEXT',                      // JSON blob for structured details (no secrets/content)
  prev_hash: 'TEXT NOT NULL',        // SHA-256 hex of previous row's hash input
  row_hash: 'TEXT NOT NULL',         // SHA-256 hex of this row's hash input
}

export const AUDIT_EVENTS_INDEXES = {
  idx_audit_events_timestamp: 'CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp)',
  idx_audit_events_action: 'CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action)',
  idx_audit_events_actor: 'CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id)',
  idx_audit_events_profile: 'CREATE INDEX IF NOT EXISTS idx_audit_events_profile ON audit_events(profile)',
  idx_audit_events_target: 'CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_type, target_id)',
}

// ============================================================================
// Group Chat (services/hermes/group-chat/index.ts)
// ============================================================================

export const GC_ROOMS_TABLE = 'gc_rooms'

export const GC_ROOMS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  name: 'TEXT NOT NULL',
  profile: 'TEXT',
  ownerUserId: 'INTEGER',
  inviteCode: 'TEXT UNIQUE',
  triggerTokens: 'INTEGER NOT NULL DEFAULT 100000',
  maxHistoryTokens: 'INTEGER NOT NULL DEFAULT 32000',
  tailMessageCount: 'INTEGER NOT NULL DEFAULT 10',
  totalTokens: 'INTEGER NOT NULL DEFAULT 0',
  sessionSeed: "TEXT NOT NULL DEFAULT '0'",
}

export const GC_MESSAGES_TABLE = 'gc_messages'

export const GC_MESSAGES_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  senderId: 'TEXT NOT NULL',
  senderName: 'TEXT NOT NULL',
  content: 'TEXT NOT NULL',
  timestamp: 'INTEGER NOT NULL',
  role: "TEXT NOT NULL DEFAULT 'user'",
  tool_call_id: 'TEXT',
  tool_calls: 'TEXT',
  tool_name: 'TEXT',
  finish_reason: 'TEXT',
  reasoning: 'TEXT',
  reasoning_details: 'TEXT',
  reasoning_content: 'TEXT',
}

export const GC_ROOM_AGENTS_TABLE = 'gc_room_agents'

export const GC_ROOM_AGENTS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  agentId: 'TEXT NOT NULL',
  profile: 'TEXT NOT NULL',
  name: 'TEXT NOT NULL',
  description: "TEXT NOT NULL DEFAULT ''",
  invited: 'INTEGER NOT NULL DEFAULT 0',
}

export const GC_CONTEXT_SNAPSHOTS_TABLE = 'gc_context_snapshots'

export const GC_CONTEXT_SNAPSHOTS_SCHEMA: Record<string, string> = {
  roomId: 'TEXT PRIMARY KEY',
  summary: 'TEXT NOT NULL DEFAULT \'\'',
  lastMessageId: 'TEXT NOT NULL',
  lastMessageTimestamp: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}

export const GC_ROOM_MEMBERS_TABLE = 'gc_room_members'

export const GC_ROOM_MEMBERS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  userId: 'TEXT NOT NULL',
  userName: 'TEXT NOT NULL',
  description: "TEXT NOT NULL DEFAULT ''",
  joinedAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
  avatar: "TEXT NOT NULL DEFAULT ''",
  authUserId: 'INTEGER',
}

export const GC_PENDING_SESSION_DELETES_TABLE = 'gc_pending_session_deletes'

export const GC_PENDING_SESSION_DELETES_SCHEMA: Record<string, string> = {
  session_id: 'TEXT PRIMARY KEY',
  profile_name: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'pending'",
  attempt_count: 'INTEGER NOT NULL DEFAULT 0',
  last_error: 'TEXT',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
  next_attempt_at: 'INTEGER NOT NULL DEFAULT 0',
}

export const GC_SESSION_PROFILES_TABLE = 'gc_session_profiles'

export const GC_SESSION_PROFILES_SCHEMA: Record<string, string> = {
  session_id: 'TEXT PRIMARY KEY',
  room_id: 'TEXT NOT NULL',
  agent_id: 'TEXT NOT NULL',
  profile_name: 'TEXT NOT NULL',
  created_at: 'INTEGER NOT NULL',
}

// ============================================================================
// Schema Sync Utilities
// ============================================================================

import { getDb, getStoragePath } from '../index'

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

/**
 * 检查表是否存在
 */
function tableExists(db: NonNullable<ReturnType<typeof getDb>>, tableName: string): boolean {
  const result = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName)
  return !!result
}

/**
 * 创建表（带完整 schema）
 */
function createTable(
  db: NonNullable<ReturnType<typeof getDb>>,
  tableName: string,
  schema: Record<string, string>,
  primaryKey?: string
): void {
  const colDefs = Object.entries(schema).map(([col, def]) => `${quoteIdentifier(col)} ${def}`)

  // 只在 schema 中没有主键时才添加复合主键
  const hasPrimaryKeyInSchema = Object.values(schema).some((def) =>
    def.toUpperCase().includes("PRIMARY KEY")
  )

  if (primaryKey && !hasPrimaryKeyInSchema) {
    colDefs.push(`PRIMARY KEY (${primaryKey})`)
  }

  db.exec(`CREATE TABLE ${quoteIdentifier(tableName)} (${colDefs.join(', ')})`)
}

function canAddColumnToExistingTable(schemaDef: string): boolean {
  const normalized = schemaDef.toUpperCase()
  if (normalized.includes('PRIMARY KEY')) return false
  if (normalized.includes('NOT NULL') && !normalized.includes('DEFAULT')) return false
  return true
}

function addMissingSafeColumns(
  db: NonNullable<ReturnType<typeof getDb>>,
  tableName: string,
  schema: Record<string, string>,
): void {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>
  const existingColumns = new Set(columns.map(col => col.name))

  for (const [columnName, columnDef] of Object.entries(schema)) {
    if (existingColumns.has(columnName)) continue
    if (!canAddColumnToExistingTable(columnDef)) {
      console.warn(`[Schema] ${tableName}.${columnName} cannot be added safely to existing table; skipping`)
      continue
    }
    db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnDef}`)
  }
}

/**
 * 主同步函数
 * - 表不存在：创建
 * - 表存在：只追加安全的新列，不删除、不重建、不修改主键/类型
 */
export function syncTable(
  tableName: string,
  schema: Record<string, string>,
  options?: {
    primaryKey?: string  // 主键定义，如 "roomId, agentId" 或 "id"
    indexes?: Record<string, string>  // 索引定义
  }
): void {
  const db = getDb()
  if (!db) return

  // 1. 表不存在 → 直接创建
  if (!tableExists(db, tableName)) {
    createTable(db, tableName, schema, options?.primaryKey)

    // 创建索引
    if (options?.indexes) {
      for (const indexSQL of Object.values(options.indexes)) {
        db.exec(indexSQL)
      }
    }
    return
  }

  addMissingSafeColumns(db, tableName, schema)
}

// ============================================================================
// Unified Initializer
// ============================================================================

/**
 * Initialize missing Hermes SQLite tables with proper schemas.
 * Existing tables only receive safe additive columns.
 * Call this once at application bootstrap.
 */
export function initAllHermesTables(): void {
  const db = getDb()
  if (!db) return

  try {
    // Usage store
    syncTable(USAGE_TABLE, USAGE_SCHEMA, { primaryKey: 'id' })

    // Session store
    syncTable(SESSIONS_TABLE, SESSIONS_SCHEMA)
    syncTable(MESSAGES_TABLE, MESSAGES_SCHEMA)
    db.exec(MESSAGES_INDEX)

    // Compression snapshot
    syncTable(COMPRESSION_SNAPSHOT_TABLE, COMPRESSION_SNAPSHOT_SCHEMA)

    // Model context
    syncTable(MODEL_CONTEXT_TABLE, MODEL_CONTEXT_SCHEMA, {
      indexes: {
        idx_model_context_provider_model: MODEL_CONTEXT_INDEX,
      }
    })

    // Users and profile access
    syncTable(USERS_TABLE, USERS_SCHEMA)
    syncTable(USER_PROFILES_TABLE, USER_PROFILES_SCHEMA, {
      primaryKey: 'user_id, profile_name',
      indexes: USER_PROFILES_INDEXES,
    })
    syncTable(JOB_OWNERS_TABLE, JOB_OWNERS_SCHEMA, {
      primaryKey: 'profile, job_id',
      indexes: {
        idx_job_owners_owner: 'CREATE INDEX idx_job_owners_owner ON job_owners(owner_user_id)',
      },
    })
    syncTable(KANBAN_BOARD_SCOPES_TABLE, KANBAN_BOARD_SCOPES_SCHEMA)
    syncTable(KANBAN_TASK_OWNERS_TABLE, KANBAN_TASK_OWNERS_SCHEMA, {
      primaryKey: 'board_slug, task_id',
      indexes: {
        idx_kanban_task_owners_creator: `CREATE INDEX IF NOT EXISTS idx_kanban_task_owners_creator ON ${KANBAN_TASK_OWNERS_TABLE}(creator_user_id)`,
        idx_kanban_task_owners_dispatcher: `CREATE INDEX IF NOT EXISTS idx_kanban_task_owners_dispatcher ON ${KANBAN_TASK_OWNERS_TABLE}(dispatcher_user_id)`,
      },
    })

    // Audit events
    syncTable(AUDIT_EVENTS_TABLE, AUDIT_EVENTS_SCHEMA, {
      indexes: AUDIT_EVENTS_INDEXES,
    })

    // Group chat - basic tables
    syncTable(GC_ROOMS_TABLE, GC_ROOMS_SCHEMA)
    syncTable(GC_MESSAGES_TABLE, GC_MESSAGES_SCHEMA)
    syncTable(GC_CONTEXT_SNAPSHOTS_TABLE, GC_CONTEXT_SNAPSHOTS_SCHEMA)
    syncTable(GC_PENDING_SESSION_DELETES_TABLE, GC_PENDING_SESSION_DELETES_SCHEMA)
    syncTable(GC_SESSION_PROFILES_TABLE, GC_SESSION_PROFILES_SCHEMA)

    // Group chat - single-column primary key tables (PRIMARY KEY in column definition)
    syncTable(GC_ROOM_AGENTS_TABLE, GC_ROOM_AGENTS_SCHEMA, {
      indexes: {
        idx_gc_room_agents_profile: 'CREATE INDEX idx_gc_room_agents_profile ON gc_room_agents(profile)',
      }
    })

    syncTable(GC_ROOM_MEMBERS_TABLE, GC_ROOM_MEMBERS_SCHEMA, {
      indexes: {
        idx_gc_room_members_user: 'CREATE INDEX idx_gc_room_members_user ON gc_room_members(userId)',
      }
    })
  } catch (e) {
    console.error('Error initializing Hermes SQLite tables:', e)
    console.error(`[Schema] Database initialization failed. Existing database was left untouched: ${getStoragePath()}`)
    throw e
  }
}
