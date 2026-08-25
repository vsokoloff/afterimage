import type { AgentEvent, AgentRun } from '../events.ts'
import type { Incident } from '../incident.ts'
import { getRun, listIncidents, listRuns, type AfterimageStore } from '../store.ts'
import { loadRepoAgents } from '../workspace/store.ts'
import { resolveAgentCatalog, resolveAgentRuntime } from './catalog.ts'
import { canonicalDashboardAgentId } from './identity.ts'

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

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

/** Display-only activity labels derived from real events (kid-friendly tone). */
function summarizeEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'prompt': {
      const text = truncate(event.text, 100)
      return event.role === 'user' || !event.role ? `Got a job: ${text}` : `Got instructions: ${text}`
    }
    case 'model_response': {
      const text = truncate(event.reasonSummary || event.text, 100)
      return text ? `Thought about it: ${text}` : 'Thought about what to do'
    }
    case 'tool_call': {
      const name = event.toolName.toLowerCase()
      const args = event.arguments as { path?: string; file_path?: string } | undefined
      const path = args?.path ?? args?.file_path
      if (name === 'read' || name === 'readfile') {
        return path ? `Opened ${basename(path)}` : 'Opened a file'
      }
      if (name === 'write' || name === 'writefile' || name === 'strreplace') {
        return path ? `Changed ${basename(path)}` : 'Changed a file'
      }
      if (name === 'shell') return 'Ran a command'
      return `Used ${event.toolName}`
    }
    case 'tool_result': {
      const name = event.toolName.toLowerCase()
      if (name === 'shell') return event.ok ? 'Finished a command' : 'A command did not work'
      return event.ok ? `Finished using ${event.toolName}` : `${event.toolName} did not work`
    }
    case 'file_write':
      return `Changed ${basename(event.path)}`
    case 'test_result':
      return event.passed ? 'The check passed' : 'The check failed'
    case 'error':
      return truncate(event.message, 120)
    case 'process_start': {
      const cmd = event.command.join(' ')
      if (/\b(test|vitest|jest|pytest)\b/i.test(cmd)) return 'Checked if the change worked'
      return cmd ? truncate(`Started work: ${cmd}`, 100) : 'Started work'
    }
    case 'process_output':
      return event.stream === 'stderr'
        ? truncate(`Got a warning: ${event.text}`, 100)
        : truncate(`Saw output: ${event.text}`, 100)
    case 'process_end':
      return event.exitCode === 0 ? 'Finished this work' : 'This work did not finish cleanly'
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

async function loadAgentBuckets(store: AfterimageStore): Promise<Map<string, AgentBucket>> {
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
    const agentId = canonicalDashboardAgentId(run.agentId ?? 'unknown')
    touch(agentId).runs.push(run)
  }

  for (const incident of incidents) {
    let agentId = incident.agentId
    if (!agentId && incident.runId) {
      const run = runs.find((item) => item.id === incident.runId)
      agentId = run?.agentId
    }
    if (!agentId) continue
    touch(canonicalDashboardAgentId(agentId)).incidents.push(incident)
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

function idleConfiguredSummary(
  agentId: string,
  repoAgents: Awaited<ReturnType<typeof loadRepoAgents>>,
): AgentSummary {
  const catalog = resolveAgentCatalog(agentId, repoAgents)
  return {
    id: agentId,
    name: catalog.name,
    characterId: catalog.characterId,
    role: catalog.role,
    runtime: resolveAgentRuntime(agentId),
    status: 'idle',
    currentActivity: null,
    currentRunId: null,
    currentRunStartedAt: null,
    currentRunDurationMs: null,
    openIncidentCount: 0,
    primaryOpenIncidentId: null,
    lastSeenAt: new Date(0).toISOString(),
    runCount: 0,
  }
}

export async function fetchAgents(store: AfterimageStore): Promise<AgentsListResponse> {
  const repoAgents = await loadRepoAgents(store)
  const buckets = await loadAgentBuckets(store)
  const agents = [...buckets.values()].map((bucket) => buildAgentSummary(bucket, repoAgents))

  // Configured roster agents (Uma, Gitty, …) appear even before their first run.
  for (const agentId of Object.keys(repoAgents.agents)) {
    const id = canonicalDashboardAgentId(agentId)
    if (buckets.has(id)) continue
    if (agents.some((agent) => agent.id === id)) continue
    agents.push(idleConfiguredSummary(id, repoAgents))
  }

  agents.sort((a, b) => {
    if (a.lastSeenAt !== b.lastSeenAt) return b.lastSeenAt.localeCompare(a.lastSeenAt)
    return a.name.localeCompare(b.name)
  })

  return { agents }
}

export async function fetchAgentProfile(
  store: AfterimageStore,
  agentId: string,
): Promise<AgentProfileResponse | null> {
  const buckets = await loadAgentBuckets(store)
  const repoAgents = await loadRepoAgents(store)
  const id = canonicalDashboardAgentId(agentId)
  const bucket = buckets.get(id)
  if (!bucket) {
    if (!repoAgents.agents[id] && !repoAgents.agents[agentId]) return null
    const agent = idleConfiguredSummary(id, repoAgents)
    return {
      agent,
      currentRun: null,
      recentRuns: [],
      recentEvents: [],
      openIncidents: [],
      pastIncidents: [],
    }
  }

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
  store: AfterimageStore,
  limit = 100,
): Promise<ActivityListResponse> {
  const runs = await listRuns(store)
  const activity: ActivityItem[] = []

  for (const run of runs) {
    const loaded = run.events.length ? run : ((await getRun(store, run.id)) ?? run)
    const agentId = canonicalDashboardAgentId(loaded.agentId ?? 'unknown')
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
