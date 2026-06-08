# Poiera RBAC Target Specification

## Status

This document records the agreed long-term authorization model. It is the
product target, not a claim that every rule is implemented today.

## Trust Model

- `super_admin` is the global product and deployment administrator.
- `admin` is a trusted host operator whose authority is limited by assigned
  Profiles for normal product workflows.
- `user` is an untrusted collaboration user.
- Profile scoping prevents accidental cross-Profile access and separates
  business administration. It does not sandbox or defend against a malicious
  `admin`.
- An `admin` may configure arbitrary local MCP commands, external Skill
  directories, and Skill imports. These capabilities can access host resources.

## Global Role Rules

| Capability | `super_admin` | `admin` | `user` |
| --- | --- | --- | --- |
| Manage users, roles, status, passwords, and Profile assignments | All | No | No |
| Create, delete, import, or rename Profiles | Yes | No | No |
| Manage Profile configuration and resources | All | Assigned Profiles | No |
| Change Profile avatar and restart Profile runtime | All | Assigned Profiles | No |
| Restart global Gateway or manage global security/deployment | Yes | No | No |
| Change own avatar and password | Yes | Yes | Yes |
| Change username | Yes | No | No |

Every Profile-scoped request must revalidate database authorization. Cached JWT
claims and frontend visibility are not authorization boundaries.

## Profile Administration

An `admin` may manage all structured configuration for assigned Profiles,
including models, Providers, credentials, Skills, MCP, runtime configuration,
avatar, runtime restart, logs, diagnostics, and export.

Only `super_admin` may create, delete, import, or rename Profiles, restart a
global Gateway, manage users, manage locked IPs, or change global security and
deployment settings.

Raw `config.yaml` is never editable through Poiera. `super_admin` may read a
redacted representation. Structured writes must preserve unknown Hermes Agent
configuration fields.

## Skills And MCP

- Configuration and runtime state are Profile-scoped.
- `admin` may fully manage Skills and MCP for assigned Profiles.
- `user` may read enabled Skill descriptions and redacted Skills/MCP status for
  the active Profile, but may not read Skill source or mutate configuration.
- Existing credentials are always redacted. Administrators may replace or
  delete secrets but cannot retrieve plaintext.
- High-risk MCP connection changes automatically disable and disconnect the
  server. Display-only changes do not.
- New, updated, restored, copied, or rolled-back Skills default to disabled.
- Skill and MCP history retains the latest three versions by default, with a
  deployment-configurable limit.
- Deleted Skills and MCP configurations enter a 30-day recycle bin by default.
  Administrators may permanently delete after confirmation.
- Administrators may copy Skills or non-secret MCP configuration between
  Profiles they manage. MCP credentials never copy across Profiles.

## Chat And Agents

- A Profile may contain multiple administrator-managed Agent identities.
- `user` may use all enabled Agent identities in normal Chat and Group Chat.
- Normal Chat content is private to its owner.
- Administrators may only see another user's creator, timestamps, and token
  usage. They may not read, rename, export, or delete that conversation.
- Legacy ownerless sessions are visible as limited metadata only to
  `super_admin`, who may assign them to an authorized user without reading
  content first.
- Users may select and switch among models enabled for the active Profile.

## Group Chat

- A room belongs to exactly one Profile and may only use Agents from that
  Profile.
- Users see rooms they created or joined.
- Room owners manage configuration, Agents, members, and deletion.
- Assigned Profile administrators may manage room metadata, but must join the
  room before reading messages.
- Administrator join, removal, and exit produce visible system messages and
  audit events. Room owners may remove administrators.
- Members can read full history after joining.
- When an owner loses Profile access, the room becomes ownerless. Existing
  members may continue chatting, while management remains frozen until an
  administrator assigns a new eligible owner.

## Files, Jobs, And Kanban

- Non-sensitive Profile files are shared collaboration data.
- Sensitive files such as `.env` and `auth.json` are never readable or writable
  through the Web UI. `super_admin` may only view redacted status and metadata.
- Ordinary file versions are retained for 30 days by default and count toward a
  Profile quota managed by `super_admin`.
- Jobs are visible to Profile members. Only the creator and Profile
  administrators may manage them or read execution output.
- A Job whose owner loses Profile access is paused until an administrator
  transfers ownership.
- Kanban Boards are visible to Profile members. Users may create Boards.
- Users may edit tasks they created or are assigned, and may assign tasks to
  other Profile members.
- All Profile members may dispatch Agent work. Only the dispatcher, task
  creator, current assignee, and Profile administrators may terminate it.
- Kanban Agent execution logs are shared with all Profile members.

## Usage, Logs, Plugins, And Removed Features

- `user` may view Profile-level aggregate Usage and Skills Usage without user or
  session detail.
- `admin` may view assigned Profile logs, performance diagnostics, Plugin
  inventory, version compatibility, and redacted diagnostic packages.
- Plugins are read-only diagnostics. Poiera does not install, enable, disable,
  delete, or configure Plugins.
- Channels and Coding Agents are removed.
- Web Terminal is disabled by default and requires deployment capability plus
  `super_admin`.
- Version Preview and self-update are removed. New-version information is
  visible only to `super_admin`.

## Audit, Alerts, And Notifications

- Security-relevant and management mutations create audit events without
  plaintext credentials, Chat content, file content, or notification bodies.
- Audit logs retain 90 days by default and use a hash chain. `admin` may query
  and export assigned Profile events; `super_admin` may access all events.
- External audit checkpoints and alert Webhooks are optional. Delivery failure
  never blocks business operations.
- Only `super_admin` may view and acknowledge system alerts.
- Profile notifications retain 30 days by default. Administrators may send
  plain-text notifications to assigned Profile members, limited to ten per
  Profile per hour by default.

## Delivery Phases

1. Core RBAC: correct role and Profile authorization, backend `403` boundaries,
   safe navigation, Profile administration boundaries, and Chat ownership.
2. Resource ownership: Group Chat, Jobs, Kanban ownership and membership rules.
3. Audit, alerts, and notifications.
4. Version history, recycle bins, quotas, and diagnostic lifecycle.

