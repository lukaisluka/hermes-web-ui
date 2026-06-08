// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import JobCard from '@/components/hermes/jobs/JobCard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('naive-ui', () => ({
  NButton: { template: '<button><slot /></button>' },
  NTooltip: { template: '<div><slot name="trigger" /><slot /></div>' },
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function job(canManage: boolean) {
  return {
    job_id: 'job-1',
    id: 'job-1',
    name: 'Shared job',
    prompt: '',
    skills: [],
    skill: null,
    model: null,
    provider: null,
    base_url: null,
    script: null,
    schedule: 'every 1h',
    schedule_display: 'every 1h',
    repeat: { times: null, completed: 0 },
    enabled: true,
    state: 'scheduled',
    paused_at: null,
    paused_reason: null,
    created_at: '',
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    deliver: 'local',
    origin: null,
    last_delivery_error: null,
    can_manage: canManage,
  }
}

describe('JobCard ownership controls', () => {
  it('hides management actions when the current user cannot manage the job', () => {
    setActivePinia(createPinia())
    const wrapper = mount(JobCard, { props: { job: job(false) } })

    expect(wrapper.text()).toContain('Shared job')
    expect(wrapper.find('.card-actions').exists()).toBe(false)
  })

  it('shows management actions to the job owner or profile admin', () => {
    setActivePinia(createPinia())
    const wrapper = mount(JobCard, { props: { job: job(true) } })

    expect(wrapper.find('.card-actions').exists()).toBe(true)
  })
})
