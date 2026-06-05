<script setup lang="ts">
import JobCard from './JobCard.vue'
import { useJobsStore } from '@/stores/hermes/jobs'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  selectedJobId: string | null
  selectedJobProfile?: string | null
}>()

const emit = defineEmits<{
  edit: [jobId: string, profile?: string]
  select: [jobId: string | null, profile?: string]
}>()

const { t } = useI18n()

const jobsStore = useJobsStore()

function handleSelect(jobId: string, profile?: string) {
  const selected = props.selectedJobId === jobId && props.selectedJobProfile === profile
  emit('select', selected ? null : jobId, selected ? undefined : profile)
}

function handleEdit(jobId: string, profile?: string) {
  emit('edit', jobId, profile)
}

function handleDeselect() {
  if (props.selectedJobId) {
    emit('select', null)
  }
}
</script>

<template>
  <div v-if="jobsStore.jobs.length === 0" class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="empty-icon">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <p>{{ t('jobs.noJobs') }}</p>
  </div>
  <div v-else class="jobs-grid">
    <JobCard
      v-for="job in jobsStore.jobs"
      :key="`${job.profile || 'default'}:${job.id}`"
      :job="job"
      :selected="selectedJobId === (job.job_id || job.id) && selectedJobProfile === job.profile"
      @edit="handleEdit"
      @select="handleSelect"
    />
  </div>
  <!-- Click outside cards to deselect -->
  <div
    v-if="selectedJobId"
    class="deselect-overlay"
    @click="handleDeselect"
  />
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: $text-muted;
  gap: 12px;

  .empty-icon {
    opacity: 0.3;
  }

  p {
    font-size: 14px;
  }
}

.jobs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
  gap: 14px;
}

.deselect-overlay {
  display: none;
}
</style>
