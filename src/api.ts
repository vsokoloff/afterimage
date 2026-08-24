import { getDisease } from './departments/index.ts'
import type { Abnormality } from './departments/types.ts'
import type { AgentEvent, AgentRun, FileWriteEvent } from './events.ts'
import type { Incident, IncidentStatus } from './incident.ts'
import {
  getIncident,
  getRun,
  listIncidents,
  listRuns,
  type LucidStore,
} from './store.ts'

export type RunsListResponse = {
  runs: AgentRun[]
}

export type RunDetailResponse = {
  run: AgentRun
}

export type IncidentSummary = Incident & {
  severity: 'critical' | 'clear' | 'unknown'
}

export type IncidentsListResponse = {
  incidents: IncidentSummary[]
}

export type FileStateRef = {
  eventId: string
  sequence: number
  path: string
  hash: string
  content?: string
  contentHashInput?: string
}

export type IncidentDetailResponse = {
  incident: Incident
  run: AgentRun | null
  detector: {
    department: string
    disease: string
  } | null
  severity: 'critical' | 'clear' | 'unknown'
  status: IncidentStatus
  evidence: string
  evidenceEvents: AgentEvent[]
  fileStates: {
    file: string
    hash: string
    firstSeen: FileStateRef
    repeated: FileStateRef
  } | null
}

function findEvent(run: AgentRun, eventId: string): AgentEvent | undefined {
  return run.events.find((event) => event.id === eventId)
}

function fileStateRef(event: FileWriteEvent): FileStateRef {
  return {
    eventId: event.id,
    sequence: event.sequence,
    path: event.path,
    hash: event.hash,
    content: event.content,
    contentHashInput: event.contentHashInput,
  }
}

function fileStatesFromAbnormality(
  run: AgentRun,
  abnormality: Abnormality,
): IncidentDetailResponse['fileStates'] {
  if (abnormality.kind !== 'repeated-file-state') return null

  const { signal } = abnormality
  const first = findEvent(run, signal.firstSeenEventId)
  const repeated = findEvent(run, signal.repeatedEventId)
  if (first?.type !== 'file_write' || repeated?.type !== 'file_write') return null

  return {
    file: signal.file,
    hash: signal.hash,
    firstSeen: fileStateRef(first),
    repeated: fileStateRef(repeated),
  }
}

function evidenceEventsFromAbnormality(run: AgentRun, abnormality: Abnormality): AgentEvent[] {
  if (abnormality.kind !== 'repeated-file-state') return []

  const ids = new Set([
    abnormality.signal.firstSeenEventId,
    abnormality.signal.repeatedEventId,
  ])
  return run.events.filter((event) => ids.has(event.id))
}

async function diagnoseIncident(
  incident: Incident,
  run: AgentRun | null,
): Promise<{
  severity: 'critical' | 'clear' | 'unknown'
  evidence: string
  abnormality: Abnormality | null
  evidenceEvents: AgentEvent[]
  fileStates: IncidentDetailResponse['fileStates']
}> {
  if (!run || !incident.department || !incident.disease) {
    return {
      severity: 'unknown',
      evidence: incident.symptom ?? '',
      abnormality: null,
      evidenceEvents: [],
      fileStates: null,
    }
  }

  const disease = getDisease(incident.department, incident.disease)
  if (!disease) {
    return {
      severity: 'unknown',
      evidence: incident.symptom ?? '',
      abnormality: null,
      evidenceEvents: [],
      fileStates: null,
    }
  }

  const diagnosis = disease.diagnose({ run })
  const abnormality = diagnosis.abnormality
  return {
    severity: diagnosis.status,
    evidence: diagnosis.evidence,
    abnormality,
    evidenceEvents: abnormality ? evidenceEventsFromAbnormality(run, abnormality) : [],
    fileStates: abnormality ? fileStatesFromAbnormality(run, abnormality) : null,
  }
}

export async function fetchRuns(store: LucidStore): Promise<RunsListResponse> {
  return { runs: await listRuns(store) }
}

export async function fetchRun(
  store: LucidStore,
  runId: string,
): Promise<RunDetailResponse | null> {
  const run = await getRun(store, runId)
  if (!run) return null
  return { run }
}

export async function fetchIncidents(store: LucidStore): Promise<IncidentsListResponse> {
  const incidents = await listIncidents(store)
  const summaries: IncidentSummary[] = []

  for (const incident of incidents) {
    const run = incident.runId ? await getRun(store, incident.runId) : null
    const { severity } = await diagnoseIncident(incident, run)
    summaries.push({ ...incident, severity })
  }

  return { incidents: summaries }
}

export async function fetchIncident(
  store: LucidStore,
  incidentId: string,
): Promise<IncidentDetailResponse | null> {
  const incident = await getIncident(store, incidentId)
  if (!incident) return null

  const run = incident.runId ? await getRun(store, incident.runId) : null
  const { severity, evidence, evidenceEvents, fileStates } = await diagnoseIncident(
    incident,
    run,
  )

  return {
    incident,
    run,
    detector:
      incident.department && incident.disease
        ? { department: incident.department, disease: incident.disease }
        : null,
    severity,
    status: incident.status,
    evidence,
    evidenceEvents,
    fileStates,
  }
}
