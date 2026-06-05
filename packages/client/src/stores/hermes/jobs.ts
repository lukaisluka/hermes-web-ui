import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as jobsApi from '@/api/hermes/jobs'
import type { Job, CreateJobRequest, UpdateJobRequest } from '@/api/hermes/jobs'

function matchJob(job: Job, id: string, profile?: string): boolean {
  return (job.job_id === id || job.id === id) && (!profile || job.profile === profile)
}

export const useJobsStore = defineStore('jobs', () => {
  const jobs = ref<Job[]>([])
  const loading = ref(false)

  async function fetchJobs() {
    loading.value = true
    try {
      jobs.value = await jobsApi.listJobs()
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    } finally {
      loading.value = false
    }
  }

  async function createJob(data: CreateJobRequest): Promise<Job> {
    const job = await jobsApi.createJob(data)
    jobs.value.unshift(job)
    return job
  }

  async function updateJob(jobId: string, data: UpdateJobRequest, profile?: string): Promise<Job> {
    const job = await jobsApi.updateJob(jobId, data, profile)
    const idx = jobs.value.findIndex(j => matchJob(j, jobId, profile))
    if (idx !== -1) jobs.value[idx] = job
    return job
  }

  async function deleteJob(jobId: string, profile?: string) {
    await jobsApi.deleteJob(jobId, profile)
    jobs.value = jobs.value.filter(j => !matchJob(j, jobId, profile))
  }

  async function pauseJob(jobId: string, profile?: string) {
    const job = await jobsApi.pauseJob(jobId, profile)
    const idx = jobs.value.findIndex(j => matchJob(j, jobId, profile))
    if (idx !== -1) jobs.value[idx] = job
  }

  async function resumeJob(jobId: string, profile?: string) {
    const job = await jobsApi.resumeJob(jobId, profile)
    const idx = jobs.value.findIndex(j => matchJob(j, jobId, profile))
    if (idx !== -1) jobs.value[idx] = job
  }

  async function runJob(jobId: string, profile?: string) {
    const job = await jobsApi.runJob(jobId, profile)
    const idx = jobs.value.findIndex(j => matchJob(j, jobId, profile))
    if (idx !== -1) jobs.value[idx] = job
  }

  return {
    jobs,
    loading,
    fetchJobs,
    createJob,
    updateJob,
    deleteJob,
    pauseJob,
    resumeJob,
    runJob,
  }
})
