import { join, resolve } from 'path'
import { homedir } from 'os'

/**
 * Poiera environment variables.
 *
 * Server/listen:
 * - PORT: Poiera listen port. Default: 8648.
 * - BIND_HOST: Poiera bind host. Default: 0.0.0.0.
 * - CORS_ORIGINS: Koa CORS origin setting. Default: *.
 *
 * Poiera storage:
 * - POIERA_HOME: Poiera data home for auth token, credentials, logs, DB, and default uploads.
 * - POIERA_STATE_DIR: Alias for POIERA_HOME.
 *   Default: join(homedir(), '.poiera').
 * - UPLOAD_DIR: Upload directory override. Default: join(POIERA_HOME, 'upload').
 * - dataDir: Development-only internal Poiera runtime data directory.
 *
 * Auth:
 * - AUTH_TOKEN: Explicit bearer token. If unset, Poiera stores an auto-generated token under POIERA_HOME.
 *
 * Runtime behavior:
 * - PROFILE: Initial Hermes profile name. Default: default.
 * - GATEWAY_HOST: Default gateway host written into profile config. Default: 127.0.0.1.
 * - POIERA_STOP_GATEWAYS_ON_SHUTDOWN: Whether Poiera shutdown also stops gateways.
 * - WORKSPACE_BASE: Base directory for workspace browsing. Default: /opt/data/workspace.
 *
 * Limits/logging:
 * - MAX_DOWNLOAD_SIZE: Max file download size. Default: 200MB.
 * - MAX_EDIT_SIZE: Max editable file size. Default: 10MB.
 * - LOG_LEVEL: Server log level. Default: info.
 * - BRIDGE_LOG_LEVEL: Bridge log level. Default: LOG_LEVEL or info.
 */

export function getListenHost(env: Record<string, string | undefined> = process.env): string {
  const host = env.BIND_HOST?.trim()
  return host || '0.0.0.0'
}

export function getWebUiHome(env: Record<string, string | undefined> = process.env): string {
  const appHome = env.POIERA_HOME?.trim() || env.POIERA_STATE_DIR?.trim()
  return appHome ? resolve(appHome) : join(homedir(), '.poiera')
}

export function shouldCreateWebUiDataDir(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production'
}

export function isTerminalEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.POIERA_ENABLE_TERMINAL?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

const appHome = getWebUiHome()

export const config = {
  port: parseInt(process.env.PORT || '8648', 10),
  // Default to IPv4 for stable WSL/Windows browser access. Use BIND_HOST=:: explicitly for IPv6.
  host: getListenHost(),
  appHome,
  uploadDir: process.env.UPLOAD_DIR || join(appHome, 'upload'),
  dataDir: resolve(__dirname, '..', 'data'),
  corsOrigins: process.env.CORS_ORIGINS || '*',
  terminalEnabled: isTerminalEnabled(),
}
