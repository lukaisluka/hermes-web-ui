import { createRouter, createWebHashHistory } from 'vue-router'
import { hasApiKey, isStoredProfileAdmin, isStoredSuperAdmin } from '@/api/client'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/poiera/chat',
      name: 'poiera.chat',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/poiera/session/:sessionId',
      name: 'poiera.session',
      component: () => import('@/views/hermes/ChatView.vue'),
    },
    {
      path: '/poiera/history',
      name: 'poiera.history',
      component: () => import('@/views/hermes/HistoryView.vue'),
    },
    {
      path: '/poiera/history/session/:sessionId',
      name: 'poiera.historySession',
      component: () => import('@/views/hermes/HistoryView.vue'),
    },
    {
      path: '/poiera/jobs',
      name: 'poiera.jobs',
      component: () => import('@/views/hermes/JobsView.vue'),
    },
    {
      path: '/poiera/kanban',
      name: 'poiera.kanban',
      component: () => import('@/views/hermes/KanbanView.vue'),
    },
    {
      path: '/poiera/models',
      name: 'poiera.models',
      component: () => import('@/views/hermes/ModelsView.vue'),
      meta: { requiresProfileAdmin: true },
    },
    {
      path: '/poiera/profiles',
      name: 'poiera.profiles',
      component: () => import('@/views/hermes/ProfilesView.vue'),
      meta: { requiresSuperAdmin: true },
    },
    {
      path: '/poiera/logs',
      name: 'poiera.logs',
      component: () => import('@/views/hermes/LogsView.vue'),
      meta: { requiresProfileAdmin: true },
    },
    {
      path: '/poiera/usage',
      name: 'poiera.usage',
      component: () => import('@/views/hermes/UsageView.vue'),
    },
    {
      path: '/poiera/performance',
      name: 'poiera.performance',
      component: () => import('@/views/hermes/PerformanceView.vue'),
      meta: { requiresSuperAdmin: true },
    },
    {
      path: '/poiera/skills-usage',
      name: 'poiera.skillsUsage',
      component: () => import('@/views/hermes/SkillsUsageView.vue'),
    },
    {
      path: '/poiera/skills',
      name: 'poiera.skills',
      component: () => import('@/views/hermes/SkillsView.vue'),
    },
    {
      path: '/poiera/plugins',
      name: 'poiera.plugins',
      component: () => import('@/views/hermes/PluginsView.vue'),
      meta: { requiresProfileAdmin: true },
    },
    {
      path: '/poiera/memory',
      name: 'poiera.memory',
      component: () => import('@/views/hermes/MemoryView.vue'),
      meta: { requiresProfileAdmin: true },
    },
    {
      path: '/poiera/settings',
      name: 'poiera.settings',
      component: () => import('@/views/hermes/SettingsView.vue'),
    },
    {
      path: '/poiera/terminal',
      name: 'poiera.terminal',
      component: () => import('@/views/hermes/TerminalView.vue'),
      meta: { requiresProfileAdmin: true },
    },
    {
      path: '/poiera/group-chat',
      name: 'poiera.groupChat',
      component: () => import('@/views/hermes/GroupChatView.vue'),
    },
    {
      path: '/poiera/group-chat/room/:roomId',
      name: 'poiera.groupChatRoom',
      component: () => import('@/views/hermes/GroupChatView.vue'),
    },
    {
      path: '/poiera/files',
      name: 'poiera.files',
      component: () => import('@/views/hermes/FilesView.vue'),
    },
    {
      path: '/poiera/mcp',
      name: 'poiera.mcp',
      component: () => import('@/views/hermes/McpManagerView.vue'),
    },
    {
      path: '/poiera/audit',
      name: 'poiera.audit',
      component: () => import('@/views/hermes/AuditView.vue'),
      meta: { requiresProfileAdmin: true },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  // Public pages don't need auth
  if (to.meta.public) {
    // Already has key, skip login
    if (to.name === 'login' && hasApiKey()) {
      next({ path: '/poiera/chat' })
      return
    }
    next()
    return
  }

  // All other pages require token
  if (!hasApiKey()) {
    next({ name: 'login' })
    return
  }

  if (to.meta.requiresSuperAdmin && !isStoredSuperAdmin()) {
    next({ name: 'poiera.chat' })
    return
  }

  if (to.meta.requiresProfileAdmin && !isStoredProfileAdmin()) {
    next({ name: 'poiera.chat' })
    return
  }

  next()
})

export default router
