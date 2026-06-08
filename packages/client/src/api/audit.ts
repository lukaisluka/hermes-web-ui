import { request } from './client'

export interface AuditEvent {
  id: number
  timestamp: number
  action: string
  actor_id: number
  actor_username: string
  actor_role: string
  profile: string
  target_type: string
  target_id: string
  description: string
  meta: string | null
  prev_hash: string
  row_hash: string
}

export interface AuditQueryResult {
  events: AuditEvent[]
  total: number
}

export interface ChainVerificationResult {
  valid: boolean
  brokenAt: number | null
}

export interface AuditQueryParams {
  profile?: string
  action?: string
  actorId?: number
  targetType?: string
  targetId?: string
  fromTimestamp?: number
  toTimestamp?: number
  limit?: number
  offset?: number
}

export function queryAuditEvents(params: AuditQueryParams = {}): Promise<AuditQueryResult> {
  const query = new URLSearchParams()
  if (params.profile) query.set('profile', params.profile)
  if (params.action) query.set('action', params.action)
  if (params.actorId) query.set('actorId', String(params.actorId))
  if (params.targetType) query.set('targetType', params.targetType)
  if (params.targetId) query.set('targetId', params.targetId)
  if (params.fromTimestamp) query.set('fromTimestamp', String(params.fromTimestamp))
  if (params.toTimestamp) query.set('toTimestamp', String(params.toTimestamp))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  const qs = query.toString()
  return request<AuditQueryResult>(`/api/audit/events${qs ? `?${qs}` : ''}`)
}

export function verifyAuditChain(): Promise<ChainVerificationResult> {
  return request<ChainVerificationResult>('/api/audit/chain/verify')
}

export function getAuditExportUrl(params: Omit<AuditQueryParams, 'limit' | 'offset'> = {}): string {
  const query = new URLSearchParams()
  if (params.profile) query.set('profile', params.profile)
  if (params.action) query.set('action', params.action)
  if (params.fromTimestamp) query.set('fromTimestamp', String(params.fromTimestamp))
  if (params.toTimestamp) query.set('toTimestamp', String(params.toTimestamp))
  const qs = query.toString()
  return `/api/audit/events/export${qs ? `?${qs}` : ''}`
}
