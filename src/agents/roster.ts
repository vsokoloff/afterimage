import type { AgentEvent, AgentRun } from '../events.ts'
import type { Incident } from '../incident.ts'
import { getRun, listIncidents, listRuns, type LucidStore } from '../store.ts'
import { loadRepoAgents } from '../workspace/store.ts'
import { resolveAgentCatalog, resolveAgentRuntime } from './catalog.ts'

export type AgentOperationalStatus = 'working' | 'idle' | 'unhealthy' | 'stopped'

export type AgentSummary = {
  id: string
  name: string
  characterId: string | null
  role: string | null
  runtime: string
  status: AgentOperationalStatus
  currentActivity: string | null
  currentRunId: string | null
  currentRunStartedAt: string | null
  currentRunDurationMs: number | null
  openIncidentCount: number
  primaryOpenIncidentId: string | null
  lastSeenAt: string
  runCount: number
}

export type ActivityItem = {
  id: string
  at: string
  agentId: string
  runId: string
  type: AgentEvent['type']
  summary: string
}

export type AgentsListResponse = {
  agents: AgentSummary[]
}

export type AgentProfileResponse = {
  agent: AgentSummary
  currentRun: AgentRun | null
  recentRuns: AgentRun[]
  recentEvents: Array<AgentEvent & { runId: string }>
  openIncidents: Incident[]
  pastIncidents: Incident[]
}

export type ActivityListResponse = {
  activity: ActivityItem[]
}

function isOpenIncident(incident: Incident): boolean {
  return incident.status === 'open' || incident.status === 'in_hospital'
}

function summarizeEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'prompt':
      return `${event.role ?? 'prompt'}: ${truncate(event.text, 120)}`
    case 'model_response':
      return truncate(event.reasonSummary || event.text, 120) || 'Model response'
    case 'tool_call':
      return `Tool call ${event.toolName}`
    case 'tool_result':
      return `Tool ${event.toolName} ${event.ok ? 'ok' : 'failed'}`
    case 'file_write':
      return `Wrote ${event.path}`
    case 'test_result':
      return `${event.name ?? 'test'} ${event.passed ? 'passed' : 'failed'}`
    case 'error':
      return event.message
    case 'process_start':
      return `Running ${event.command.join(' ')}`
    case 'process_output':
      return `${event.stream}: ${truncate(event.text, 80)}`
    case 'process_end':
      return `Process exited ${event.exitCode ?? event.signal ?? '—'}`
    default: {
      const unknown = event as AgentEvent
      return unknown.type
    }
  }
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function inferCurrentActivity(run: AgentRun): string | null {
  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const event = run.events[index]!
    if (event.type === 'process_end') continue
    const summary = summarizeEvent(event)
    if (summary) return summary
  }
  return null
}

function deriveOperationalStatus(
  activeRun: AgentRun | null,
  openIncidents: Incident[],
  lastRun: AgentRun | null,
): AgentOperationalStatus {
  if (openIncidents.length > 0) return 'unhealthy'
  if (activeRun) return 'working'
  if (lastRun?.status === 'cancelled') return 'stopped'
  if (lastRun?.status === 'failed') return 'stopped'
  if (lastRun) return 'idle'
  return 'idle'
}

function durationMsSince(iso: string, now = Date.now()): number {
  return Math.max(0, now - new Date(iso).getTime())
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export { formatDuration }

type AgentBucket = {
  agentId: string
  runs: AgentRun[]
  incidents: Incident[]
}

async function loadAgentBuckets(store: LucidStore): Promise<Map<string, AgentBucket>> {
  const runs = await listRuns(store)
  const incidents = await listIncidents(store)
  const buckets = new Map<string, AgentBucket>()

  const touch = (agentId: string): AgentBucket => {
    const existing = buckets.get(agentId)
    if (existing) return existing
    const created: AgentBucket = { agentId, runs: [], incidents: [] }
    buckets.set(agentId, created)
    return created
  }

  for (const run of runs) {
    const agentId = run.agentId ?? 'unknown'
    touch(agentId).runs.push(run)
  }

  for (const incident of incidents) {
    let agentId = incident.agentId
    if (!agentId && incident.runId) {
      const run = runs.find((item) => item.id === incident.runId)
      agentId = run?.agentId
    }
    if (!agentId) continue
    touch(agentId).incidents.push(incident)
  }

  for (const bucket of buckets.values()) {
    bucket.runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    bucket.incidents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  return buckets
}

function buildAgentSummary(
  bucket: AgentBucket,
  repoAgents: Awaited<ReturnType<typeof loadRepoAgents>>,
  now = Date.now(),
): AgentSummary {
  const catalog = resolveAgentCatalog(bucket.agentId, repoAgents)
  const activeRun = bucket.runs.find((run) => run.status === 'running') ?? null
  const lastRun = bucket.runs[0] ?? null
  const openIncidents = bucket.incidents.filter(isOpenIncident)
  const status = deriveOperationalStatus(activeRun, openIncidents, lastRun)
  const referenceRun = activeRun ?? lastRun
  const runtime = resolveAgentRuntime(bucket.agentId, referenceRun?.events)

  return {
    id: bucket.agentId,
    name: catalog.name,
    characterId: catalog.characterId,
    role: catalog.role,
    runtime,
    status,
    currentActivity: activeRun ? inferCurrentActivity(activeRun) : null,
    currentRunId: activeRun?.id ?? null,
    currentRunStartedAt: activeRun?.startedAt ?? null,
    currentRunDurationMs: activeRun ? durationMsSince(activeRun.startedAt, now) : null,
    openIncidentCount: openIncidents.length,
    primaryOpenIncidentId: openIncidents[0]?.id ?? null,
    lastSeenAt: lastRun?.endedAt ?? lastRun?.startedAt ?? new Date(0).toISOString(),
    runCount: bucket.runs.length,
  }
}

export async function fetchAgents(store: LucidStore): Promise<AgentsListResponse> {
  const repoAgents = await loadRepoAgents(store)
  const buckets = await loadAgentBuckets(store)
  const agents = [...buckets.values()]
    .map((bucket) => buildAgentSummary(bucket, repoAgents))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))

  return { agents }
}

export async function fetchAgentProfile(
  store: LucidStore,
  agentId: string,
): Promise<AgentProfileResponse | null> {
  const buckets = await loadAgentBuckets(store)
  const bucket = buckets.get(agentId)
  if (!bucket) return null

  const repoAgents = await loadRepoAgents(store)
  const agent = buildAgentSummary(bucket, repoAgents)
  const activeRun = bucket.runs.find((run) => run.status === 'running') ?? null
  const recentRuns = bucket.runs.slice(0, 10)

  const recentEvents: Array<AgentEvent & { runId: string }> = []
  for (const run of recentRuns) {
    const loaded = run.events.length ? run : ((await getRun(store, run.id)) ?? run)
    for (const event of loaded.events.slice(-30)) {
      recentEvents.push({ ...event, runId: loaded.id })
    }
  }
  recentEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const openIncidents = bucket.incidents.filter(isOpenIncident)
  const pastIncidents = bucket.incidents.filter((incident) => !isOpenIncident(incident))

  return {
    agent,
    currentRun: activeRun,
    recentRuns,
    recentEvents: recentEvents.slice(0, 40),
    openIncidents,
    pastIncidents,
  }
}

export async function fetchActivity(
  store: LucidStore,
  limit = 100,
): Promise<ActivityListResponse> {
  const runs = await listRuns(store)
  const activity: ActivityItem[] = []

  for (const run of runs) {
    const loaded = run.events.length ? run : ((await getRun(store, run.id)) ?? run)
    const agentId = loaded.agentId ?? 'unknown'
    for (const event of loaded.events) {
      activity.push({
        id: event.id,
        at: event.timestamp,
        agentId,
        runId: loaded.id,
        type: event.type,
        summary: summarizeEvent(event),
      })
    }
  }

  activity.sort((a, b) => b.at.localeCompare(a.at))
  return { activity: activity.slice(0, limit) }
}
