<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NDataTable, NButton, NInput, NSelect, NDatePicker, NSpace, NTabPane, NTabs, NCard, NTag, NEmpty, NSpin, NAlert, NModal, NDescriptions, NDescriptionsItem, useMessage } from 'naive-ui'
import { queryAuditEvents, verifyAuditChain, getAuditExportUrl, type AuditEvent, type AuditQueryParams } from '@/api/audit'
import { isStoredSuperAdmin } from '@/api/client'

const { t } = useI18n()
const message = useMessage()

// ─── Tab state ──────────────────────────────────────────────────
const activeTab = ref('events')

// ─── Events query state ─────────────────────────────────────────
const loading = ref(false)
const events = ref<AuditEvent[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

// Filters
const filterAction = ref<string | null>(null)
const filterProfile = ref<string | null>(null)
const filterTargetType = ref<string | null>(null)
const filterDateRange = ref<[number, number] | null>(null)

// ─── Chain verify state ─────────────────────────────────────────
const chainLoading = ref(false)
const chainResult = ref<{ valid: boolean; brokenAt: number | null } | null>(null)

// ─── Event detail modal ─────────────────────────────────────────
const detailModal = ref(false)
const detailEvent = ref<AuditEvent | null>(null)

function showDetail(event: AuditEvent) {
  detailEvent.value = event
  detailModal.value = true
}

// ─── Action options (from observed data) ────────────────────────
const actionOptions = computed(() => {
  const actions = new Set<string>()
  events.value.forEach(e => actions.add(e.action))
  return Array.from(actions).sort().map(a => ({ label: a, value: a }))
})

const targetTypeOptions = computed(() => {
  const types = new Set<string>()
  events.value.forEach(e => { if (e.target_type) types.add(e.target_type) })
  return Array.from(types).sort().map(t => ({ label: t, value: t }))
})

// ─── Fetch events ───────────────────────────────────────────────
async function fetchEvents() {
  loading.value = true
  try {
    const params: AuditQueryParams = {
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    }
    if (filterAction.value) params.action = filterAction.value
    if (filterProfile.value) params.profile = filterProfile.value
    if (filterTargetType.value) params.targetType = filterTargetType.value
    if (filterDateRange.value) {
      params.fromTimestamp = filterDateRange.value[0]
      params.toTimestamp = filterDateRange.value[1]
    }
    const result = await queryAuditEvents(params)
    events.value = result.events
    total.value = result.total
  } catch (err: any) {
    message.error(err?.message || t('audit.fetchError'))
  } finally {
    loading.value = false
  }
}

// ─── Verify chain ───────────────────────────────────────────────
async function verifyChain() {
  chainLoading.value = true
  try {
    chainResult.value = await verifyAuditChain()
  } catch (err: any) {
    message.error(err?.message || t('audit.verifyError'))
  } finally {
    chainLoading.value = false
  }
}

// ─── Export ──────────────────────────────────────────────────────
function handleExport() {
  const params: Omit<AuditQueryParams, 'limit' | 'offset'> = {}
  if (filterAction.value) params.action = filterAction.value
  if (filterProfile.value) params.profile = filterProfile.value
  if (filterDateRange.value) {
    params.fromTimestamp = filterDateRange.value[0]
    params.toTimestamp = filterDateRange.value[1]
  }
  const url = getAuditExportUrl(params)
  const token = localStorage.getItem('apiKey')
  const a = document.createElement('a')
  a.href = url
  if (token) {
    // Use fetch + blob to include auth header
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `audit-export-${Date.now()}.json`
        link.click()
        URL.revokeObjectURL(blobUrl)
      })
      .catch(() => message.error(t('audit.exportError')))
  } else {
    a.click()
  }
}

// ─── Format helpers ─────────────────────────────────────────────
function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

function roleTagType(role: string): 'default' | 'info' | 'warning' | 'error' | 'success' {
  if (role === 'super_admin') return 'error'
  if (role === 'admin') return 'warning'
  return 'default'
}

// ─── Table columns ──────────────────────────────────────────────
const columns = computed(() => [
  { title: t('audit.time'), key: 'timestamp', width: 170, render: (row: AuditEvent) => formatTime(row.timestamp) },
  { title: t('audit.action'), key: 'action', width: 180, ellipsis: { tooltip: true } },
  { title: t('audit.actor'), key: 'actor_username', width: 120, render: (row: AuditEvent) => `${row.actor_username}` },
  { title: t('audit.role'), key: 'actor_role', width: 110, render: (row: AuditEvent) => h(NTag, { size: 'small', type: roleTagType(row.actor_role) }, { default: () => row.actor_role }) },
  { title: t('audit.profile'), key: 'profile', width: 100, ellipsis: { tooltip: true }, render: (row: AuditEvent) => row.profile || '—' },
  { title: t('audit.target'), key: 'target', width: 150, render: (row: AuditEvent) => row.target_type ? `${row.target_type}${row.target_id ? `#${row.target_id}` : ''}` : '—' },
  { title: t('audit.description'), key: 'description', ellipsis: { tooltip: true } },
  { title: '', key: 'actions', width: 60, render: (row: AuditEvent) => h(NButton, { size: 'tiny', quaternary: true, onClick: () => showDetail(row) }, { default: () => t('audit.detail') }) },
])

import { h } from 'vue'

// ─── Lifecycle ──────────────────────────────────────────────────
onMounted(fetchEvents)

// Refetch when page or filters change
watch([page, pageSize], fetchEvents)

function applyFilters() {
  page.value = 1
  fetchEvents()
}

function resetFilters() {
  filterAction.value = null
  filterProfile.value = null
  filterTargetType.value = null
  filterDateRange.value = null
  page.value = 1
  fetchEvents()
}

const isSuperAdmin = computed(() => isStoredSuperAdmin())
</script>

<template>
  <div class="audit-view">
    <h2 class="page-title">{{ t('audit.title') }}</h2>

    <NTabs v-model:value="activeTab" type="line">
      <!-- Events Tab -->
      <NTabPane name="events" :tab="t('audit.eventsTab')">
        <NCard size="small" class="filter-card">
          <NSpace align="center" :wrap="true">
            <NSelect v-model:value="filterAction" :options="actionOptions" :placeholder="t('audit.filterAction')" clearable style="width: 180px" />
            <NInput v-model:value="filterProfile" :placeholder="t('audit.filterProfile')" clearable style="width: 140px" />
            <NSelect v-model:value="filterTargetType" :options="targetTypeOptions" :placeholder="t('audit.filterTargetType')" clearable style="width: 160px" />
            <NDatePicker v-model:value="filterDateRange" type="daterange" clearable :placeholder="t('audit.filterDateRange')" style="width: 280px" />
            <NButton type="primary" size="small" @click="applyFilters">{{ t('audit.apply') }}</NButton>
            <NButton size="small" @click="resetFilters">{{ t('audit.reset') }}</NButton>
          </NSpace>
        </NCard>

        <NSpin :show="loading">
          <NEmpty v-if="!loading && events.length === 0" :description="t('audit.noEvents')" />
          <NDataTable
            v-else
            :columns="columns"
            :data="events"
            :row-key="(row: AuditEvent) => row.id"
            :pagination="{ page, pageSize, itemCount: total, showSizePicker: true, pageSizes: [10, 20, 50] }"
            :bordered="false"
            size="small"
            @update:page="(p: number) => page = p"
            @update:page-size="(s: number) => { pageSize = s; page = 1 }"
          />
        </NSpin>
      </NTabPane>

      <!-- Integrity Tab (super_admin only) -->
      <NTabPane v-if="isSuperAdmin" name="integrity" :tab="t('audit.integrityTab')">
        <NCard size="small">
          <NSpace vertical>
            <p>{{ t('audit.integrityDesc') }}</p>
            <NSpace>
              <NButton type="primary" :loading="chainLoading" @click="verifyChain">
                {{ t('audit.verifyChain') }}
              </NButton>
              <NButton @click="handleExport">
                {{ t('audit.export') }}
              </NButton>
            </NSpace>

            <NAlert v-if="chainResult" :type="chainResult.valid ? 'success' : 'error'" :title="chainResult.valid ? t('audit.chainValid') : t('audit.chainBroken')">
              <template v-if="!chainResult.valid">
                {{ t('audit.brokenAt', { id: chainResult.brokenAt }) }}
              </template>
            </NAlert>
          </NSpace>
        </NCard>
      </NTabPane>
    </NTabs>

    <!-- Event Detail Modal -->
    <NModal v-model:show="detailModal" preset="card" :title="t('audit.eventDetail')" style="max-width: 600px">
      <NDescriptions v-if="detailEvent" bordered size="small" :column="1" label-placement="left">
        <NDescriptionsItem :label="t('audit.time')">{{ formatTime(detailEvent.timestamp) }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('audit.action')">{{ detailEvent.action }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('audit.actor')">{{ detailEvent.actor_username }} ({{ detailEvent.actor_role }})</NDescriptionsItem>
        <NDescriptionsItem :label="t('audit.profile')">{{ detailEvent.profile || '—' }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('audit.target')">{{ detailEvent.target_type ? `${detailEvent.target_type}#${detailEvent.target_id}` : '—' }}</NDescriptionsItem>
        <NDescriptionsItem :label="t('audit.description')">{{ detailEvent.description || '—' }}</NDescriptionsItem>
        <NDescriptionsItem v-if="detailEvent.meta" :label="t('audit.meta')">
          <pre class="meta-json">{{ JSON.stringify(JSON.parse(detailEvent.meta), null, 2) }}</pre>
        </NDescriptionsItem>
      </NDescriptions>
    </NModal>
  </div>
</template>

<style scoped>
.audit-view {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-title {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 600;
}

.filter-card {
  margin-bottom: 12px;
}

.meta-json {
  margin: 0;
  padding: 8px;
  background: var(--n-color-embedded);
  border-radius: 4px;
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
