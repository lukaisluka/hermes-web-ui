import { request } from '../client'

export interface RunEntry {
  jobId: string
  fileName: string
  runTime: string
  size: number
}

export interface RunDetail {
  jobId: string
  fileName: string
  runTime: string
  content: string
}

export async function listCronRuns(jobId?: string, profile?: string): Promise<RunEntry[]> {
  const params = new URLSearchParams()
  if (jobId) params.set('jobId', jobId)
  if (profile) params.set('profile', profile)
  const qs = params.toString()
  const res = await request<{ runs: RunEntry[] }>(`/api/cron-history${qs ? `?${qs}` : ''}`)
  return res.runs
}

export async function readCronRun(jobId: string, fileName: string, profile?: string): Promise<RunDetail> {
  const query = profile ? `?profile=${encodeURIComponent(profile)}` : ''
  return request<RunDetail>(`/api/cron-history/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}${query}`)
}
