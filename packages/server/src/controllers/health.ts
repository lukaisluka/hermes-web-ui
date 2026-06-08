import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as hermesCli from '../services/hermes/hermes-cli'
import { config } from '../config'

declare const __APP_VERSION__: string

type PackageInfo = {
  name: string
  version: string
}

function readPackageInfo(): PackageInfo | null {
  const candidatePaths = [
    // ts-node dev: packages/server/src/controllers -> repo root
    resolve(__dirname, '../../../../package.json'),
    // bundled server: dist/server -> repo root/package root
    resolve(__dirname, '../../package.json'),
    // fallback for dev/test processes started at the repo root
    resolve(process.cwd(), 'package.json'),
  ]

  for (const packagePath of candidatePaths) {
    if (!existsSync(packagePath)) continue

    try {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
      if (pkg?.name && pkg?.version) {
        return {
          name: String(pkg.name),
          version: String(pkg.version),
        }
      }
    } catch {
      // Try the next candidate path.
    }
  }

  return null
}

const PACKAGE_INFO = readPackageInfo()
const LOCAL_VERSION = typeof __APP_VERSION__ !== 'undefined'
  ? __APP_VERSION__
  : PACKAGE_INFO?.version || ''

let cachedLatestVersion = ''

/**
 * Whether the periodic npm-registry version check is disabled.
 *
 * Useful for managed deployments where the operator controls upgrades and the
 * periodic outbound HTTP request to the npm registry is unnecessary.
 *
 * Set POIERA_DISABLE_UPDATE_CHECK=true (or 1, on, yes) to disable.
 */
function isUpdateCheckDisabled(): boolean {
  const raw = (process.env.POIERA_DISABLE_UPDATE_CHECK || '').trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes'
}

export async function checkLatestVersion(): Promise<void> {
  if (isUpdateCheckDisabled()) return
  try {
    const packageName = PACKAGE_INFO?.name || 'poiera'
    const registryName = encodeURIComponent(packageName)
    const res = await fetch(`https://registry.npmjs.org/${registryName}/latest`, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json() as { version: string }
      cachedLatestVersion = data.version
      if (LOCAL_VERSION && cachedLatestVersion !== LOCAL_VERSION) {
        console.log(`Update available: ${LOCAL_VERSION} → ${cachedLatestVersion}`)
      }
    }
  } catch { /* ignore */ }
}

export function startVersionCheck(): void {
  if (isUpdateCheckDisabled()) return
  setTimeout(checkLatestVersion, 5000)
  setInterval(checkLatestVersion, 30 * 60 * 1000)
}

export async function healthCheck(ctx: any) {
  const raw = await hermesCli.getVersion()
  const hermesVersion = raw.split('\n')[0].replace('Hermes Agent ', '') || ''
  ctx.body = {
    status: 'ok',
    platform: 'hermes-agent',
    version: hermesVersion,
    gateway: 'running',
    webui_version: LOCAL_VERSION,
    webui_latest: isUpdateCheckDisabled() ? '' : cachedLatestVersion,
    webui_update_available: isUpdateCheckDisabled()
      ? false
      : Boolean(LOCAL_VERSION && cachedLatestVersion && cachedLatestVersion !== LOCAL_VERSION),
    node_version: process.versions.node,
    terminal_enabled: config.terminalEnabled,
  }
}
