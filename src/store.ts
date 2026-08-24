import { mkdir, readFile, readdir, writeFile, appendFile, access } from 'node:fs/promises'
import path from 'node:path'
import { constants as fsConstants } from 'node:fs'

import type { AgentEvent, AgentRun, AgentRunStatus } from './events.ts'
import { newId } from './ids.ts'
import type { Incident, IncidentStatus } from './incident.ts'
import type { StructuredTreatment } from './treatment/types.ts'
import type { TreatmentApplicationRecord } from './treatment/adapters/types.ts'

export type LucidStore = {
  /** Absolute path to the `.lucid` directory. */
  root: string
}

export type OpenStoreOptions = {
  /** Project directory that should contain `.lucid/` (default: process.cwd()). */
  projectRoot?: string
  /** Absolute `.lucid` path — overrides projectRoot. Useful in tests. */
  storeRoot?: string
}

type RunRecord = Omit<AgentRun, 'events'>

function runsDir(store: LucidStore): string {
  return path.join(store.root, 'runs')
}

function incidentsDir(store: LucidStore): string {
  return path.join(store.root, 'incidents')
}

function runMetaPath(store: LucidStore, runId: string): string {
  return path.join(runsDir(store), `${runId}.json`)
}

function runEventsPath(store: LucidStore, runId: string): string {
  return path.join(runsDir(store), `${runId}.events.jsonl`)
}

function incidentPath(store: LucidStore, incidentId: string): string {
  return path.join(incidentsDir(store), `${incidentId}.json`)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function ensureDirs(store: LucidStore): Promise<void> {
  await mkdir(runsDir(store), { recursive: true })
  await mkdir(incidentsDir(store), { recursive: true })
}

async function readJson<T>(filePath: string): Promise<T | null> {
  if (!(await exists(filePath))) return null
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  if (!(await exists(filePath))) return []
  const raw = await readFile(filePath, 'utf8')
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.map((line) => JSON.parse(line) as T)
}

/** Open (and create) a local `.lucid` store under the project. */
export async function openStore(options: OpenStoreOptions = {}): Promise<LucidStore> {
  const root = options.storeRoot
    ? path.resolve(options.storeRoot)
    : path.resolve(options.projectRoot ?? process.cwd(), '.lucid')
  const store = { root }
  await ensureDirs(store)
  return store
}

export type CreateRunInput = {
  id?: string
  agentId?: string
  status?: AgentRunStatus
  startedAt?: string
  endedAt?: string
}

/** Create a new run and persist its metadata (events start empty). */
export async function createRun(
  store: LucidStore,
  input: CreateRunInput = {},
): Promise<AgentRun> {
  await ensureDirs(store)
  const run: RunRecord = {
    id: input.id ?? newId('run'),
    agentId: input.agentId,
    startedAt: input.startedAt ?? new Date().toISOString(),
    endedAt: input.endedAt,
    status: input.status ?? 'running',
  }

  if (await exists(runMetaPath(store, run.id))) {
    throw new Error(`Run already exists: ${run.id}`)
  }

  await writeJson(runMetaPath(store, run.id), run)
  await writeFile(runEventsPath(store, run.id), '', 'utf8')
  return { ...run, events: [] }
}

/**
 * Append one event to a run's JSONL log.
 * Event must reference an existing run via `runId`.
 */
export async function appendEvent(
  store: LucidStore,
  event: AgentEvent,
): Promise<AgentEvent> {
  await ensureDirs(store)
  const meta = await readJson<RunRecord>(runMetaPath(store, event.runId))
  if (!meta) {
    throw new Error(`Cannot append event: unknown run ${event.runId}`)
  }

  const stored: AgentEvent = {
    ...event,
    id: event.id || newId('evt'),
    timestamp: event.timestamp || new Date().toISOString(),
  }

  await appendFile(runEventsPath(store, event.runId), `${JSON.stringify(stored)}\n`, 'utf8')
  return stored
}

/** Load a run and all of its events from disk. */
export async function getRun(store: LucidStore, runId: string): Promise<AgentRun | null> {
  const meta = await readJson<RunRecord>(runMetaPath(store, runId))
  if (!meta) return null
  const events = await readJsonl<AgentEvent>(runEventsPath(store, runId))
  events.sort((a, b) => a.sequence - b.sequence)
  return { ...meta, events }
}

/** List all persisted runs (with events loaded). Newest startedAt first. */
export async function listRuns(store: LucidStore): Promise<AgentRun[]> {
  await ensureDirs(store)
  const files = await readdir(runsDir(store))
  const ids = files
    .filter((name) => name.endsWith('.json') && !name.endsWith('.events.jsonl'))
    .map((name) => name.slice(0, -'.json'.length))

  const runs: AgentRun[] = []
  for (const id of ids) {
    const run = await getRun(store, id)
    if (run) runs.push(run)
  }

  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export type CreateIncidentInput = {
  id?: string
  runId?: string
  agentId?: string
  title: string
  symptom?: string
  status?: IncidentStatus
  department?: string
  disease?: string
  treatment?: StructuredTreatment
  treatmentApplication?: TreatmentApplicationRecord
  createdAt?: string
}

/** Create and persist an incident record. */
export async function createIncident(
  store: LucidStore,
  input: CreateIncidentInput,
): Promise<Incident> {
  await ensureDirs(store)
  const now = input.createdAt ?? new Date().toISOString()
  const incident: Incident = {
    id: input.id ?? newId('inc'),
    runId: input.runId,
    agentId: input.agentId,
    title: input.title,
    symptom: input.symptom,
    status: input.status ?? 'open',
    department: input.department,
    disease: input.disease,
    treatment: input.treatment,
    treatmentApplication: input.treatmentApplication,
    createdAt: now,
    updatedAt: now,
  }

  if (await exists(incidentPath(store, incident.id))) {
    throw new Error(`Incident already exists: ${incident.id}`)
  }

  await writeJson(incidentPath(store, incident.id), incident)
  return incident
}

export async function getIncident(
  store: LucidStore,
  incidentId: string,
): Promise<Incident | null> {
  return readJson<Incident>(incidentPath(store, incidentId))
}

export type UpdateIncidentPatch = Partial<
  Pick<
    Incident,
    | 'runId'
    | 'agentId'
    | 'title'
    | 'symptom'
    | 'status'
    | 'department'
    | 'disease'
    | 'treatment'
    | 'treatmentApplication'
    | 'lastRecheck'
    | 'recheckHistory'
  >
>

/** Patch an incident and bump `updatedAt`. */
export async function updateIncident(
  store: LucidStore,
  incidentId: string,
  patch: UpdateIncidentPatch,
): Promise<Incident> {
  const current = await getIncident(store, incidentId)
  if (!current) {
    throw new Error(`Unknown incident: ${incidentId}`)
  }

  const next: Incident = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  }

  await writeJson(incidentPath(store, incidentId), next)
  return next
}

export type UpdateRunPatch = Partial<Pick<RunRecord, 'status' | 'endedAt' | 'agentId'>>

/** Update run metadata (status / endedAt) and return the full run with events. */
export async function updateRun(
  store: LucidStore,
  runId: string,
  patch: UpdateRunPatch,
): Promise<AgentRun> {
  const meta = await readJson<RunRecord>(runMetaPath(store, runId))
  if (!meta) {
    throw new Error(`Unknown run: ${runId}`)
  }
  const next: RunRecord = { ...meta, ...patch, id: meta.id }
  await writeJson(runMetaPath(store, runId), next)
  const run = await getRun(store, runId)
  if (!run) throw new Error(`Unknown run: ${runId}`)
  return run
}

/** List all persisted incidents. Newest createdAt first. */
export async function listIncidents(store: LucidStore): Promise<Incident[]> {
  await ensureDirs(store)
  const files = await readdir(incidentsDir(store))
  const incidents: Incident[] = []
  for (const name of files) {
    if (!name.endsWith('.json')) continue
    const incident = await readJson<Incident>(path.join(incidentsDir(store), name))
    if (incident) incidents.push(incident)
  }
  return incidents.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
