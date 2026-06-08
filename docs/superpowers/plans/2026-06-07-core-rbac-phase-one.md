# Core RBAC Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the highest-risk role boundaries while preserving existing Profile-scoped administrator workflows.

**Architecture:** Keep authorization in route middleware and the existing Profile resolver. Use `requireSuperAdmin` for global identity, security, and Profile lifecycle operations; use `requireProfileAdmin` for operations an assigned Profile administrator may perform. Frontend routing mirrors the backend boundary but is not treated as security enforcement.

**Tech Stack:** TypeScript, Koa, Vue 3, Vue Router, Vitest.

---

### Task 1: Lock Global And Profile Lifecycle Operations

**Files:**
- Modify: `packages/server/src/routes/auth.ts`
- Modify: `packages/server/src/routes/hermes/profiles.ts`
- Test: `tests/server/core-rbac-routes.test.ts`

- [ ] Add failing route-wiring tests proving locked IP management and Profile
  create/delete/import/rename require `requireSuperAdmin`.
- [ ] Add tests proving Profile runtime status, restart, avatar, detail, and
  export retain `requireProfileAdmin`.
- [ ] Run `npm run test -- tests/server/core-rbac-routes.test.ts` and confirm
  the new assertions fail.
- [ ] Update route middleware to match the target matrix.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Restrict Username Changes

**Files:**
- Modify: `packages/server/src/routes/auth.ts`
- Modify: `packages/client/src/components/hermes/settings/AccountSettings.vue`
- Test: `tests/server/core-rbac-routes.test.ts`
- Test: `tests/client/account-settings-role-access.test.ts`

- [ ] Add failing server and client tests proving only `super_admin` can use the
  username change flow.
- [ ] Run the focused tests and confirm they fail for the expected reason.
- [ ] Add `requireSuperAdmin` to the endpoint and hide the self-service username
  action from non-super-admin roles.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Allow Assigned Administrators To Open MCP Management

**Files:**
- Modify: `packages/client/src/router/index.ts`
- Test: `tests/client/router-role-access.test.ts`

- [ ] Add a failing router test proving `admin` may enter MCP management while
  `user` is redirected.
- [ ] Run the focused test and confirm it fails.
- [ ] Change MCP route metadata from `requiresSuperAdmin` to
  `requiresProfileAdmin`.
- [ ] Re-run the focused test and confirm it passes.

### Task 4: Validate Phase One

**Files:**
- Verify: all files changed above

- [ ] Run focused server and client RBAC tests.
- [ ] Run `npm run harness:check`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.

## Explicit Follow-Ups

- Add redacted read-only Skills/MCP DTOs and pages for `user`.
- Add resource ownership rules for Group Chat, Jobs, and Kanban.
- Remove Channels, Coding Agents, Version Preview, self-update, and Comic theme
  in separately scoped changes.
- Add audit, notification, version history, recycle bin, and quota subsystems
  in their own phases.

