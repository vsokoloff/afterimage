/** How afterimage run reacts when a critical incident is detected mid-run. */
export type RunIncidentPolicy = 'observe' | 'terminate-on-critical'

export const DEFAULT_RUN_INCIDENT_POLICY: RunIncidentPolicy = 'observe'

export const DEFAULT_WEB_BASE_URL = 'http://127.0.0.1:3000'

export function parseRunIncidentPolicy(value: string): RunIncidentPolicy | null {
  if (value === 'observe' || value === 'terminate-on-critical') return value
  return null
}

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

export function resolveRunIncidentPolicy(explicit?: RunIncidentPolicy): RunIncidentPolicy {
  if (explicit) return explicit
  const fromEnv = envFirst('AFTERIMAGE_RUN_POLICY', 'LUCID_RUN_POLICY')
  if (fromEnv) {
    const parsed = parseRunIncidentPolicy(fromEnv)
    if (parsed) return parsed
  }
  return DEFAULT_RUN_INCIDENT_POLICY
}

export function resolveWebBaseUrl(explicit?: string): string {
  const raw =
    explicit ??
    envFirst('AFTERIMAGE_WEB_URL', 'LUCID_WEB_URL') ??
    DEFAULT_WEB_BASE_URL
  return raw.replace(/\/$/, '')
}
