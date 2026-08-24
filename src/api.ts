import { getDisease } from './departments/index.ts'
import { shortDigest } from './departments/looping/repeated-file-state/detect.ts'
import type { Abnormality, DiagnosisResult } from './departments/types.ts'
import type { AgentEvent, AgentRun, FileWriteEvent } from './events.ts'
import { successfulFileWriteEvents } from './events.ts'
import type { Incident, IncidentStatus } from './incident.ts'
import {
  diagnoseRepeatedFileStateRootCause,
  getDefaultRootCauseProvider,
  type RootCauseDiagnosis,
  type RootCauseModelProvider,
} from './root-cause/index.ts'
import {
  getIncident,
  getRun,
  listIncidents,
  listRuns,
  updateIncident,
  type LucidStore,
} from './store.ts'
import { recommendTreatmentFromDiagnosis, type StructuredTreatment } from './treatment/index.ts'
import { extractReproductionFromRun } from './recheck/reproduction.ts'
import type { RootCause } from './types.ts'

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

export type HashChainStep = {
  sequence: number
  eventId: string
  path: string
  shortHash: string
  role: 'first-seen' | 'intermediate' | 'repeated'
}

export type IncidentDiagnosis = {
  department: string
  disease: string
  status: 'critical' | 'clear'
  symptom: string
  evidence: string
}

export type IncidentRecheck = {
  available: boolean
  passed: boolean | null
  evidence: string
  runId?: string
  verifiedAt?: string
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
  hashChain: HashChainStep[]
  diagnosis: IncidentDiagnosis | null
  rootCause: RootCause | null
  rootCauseDiagnosis: RootCauseDiagnosis | null
  rootCauseEvidenceEvents: AgentEvent[]
  diagnosticWindowEvents: AgentEvent[]
  treatment: StructuredTreatment | null
  recheck: IncidentRecheck
}

export type ApiContext = {
  rootCauseProvider?: RootCauseModelProvider
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

function buildHashChain(
  run: AgentRun,
  fileStates: NonNullable<IncidentDetailResponse['fileStates']>,
): HashChainStep[] {
  const writes = successfulFileWriteEvents(run.events).filter(
    (write) =>
      write.path === fileStates.file &&
      write.sequence >= fileStates.firstSeen.sequence &&
      write.sequence <= fileStates.repeated.sequence,
  )

  return writes.map((write) => ({
    sequence: write.sequence,
    eventId: write.id,
    path: write.path,
    shortHash: shortDigest(write.hash),
    role:
      write.id === fileStates.firstSeen.eventId
        ? 'first-seen'
        : write.id === fileStates.repeated.eventId
          ? 'repeated'
          : 'intermediate',
  }))
}

function buildRecheck(
  incident: Incident,
  disease: ReturnType<typeof getDisease>,
  run: AgentRun | null,
  diagnosis: DiagnosisResult | null,
): IncidentRecheck {
  if (incident.lastRecheck) {
    return {
      available: true,
      passed: incident.lastRecheck.passed,
      evidence: incident.lastRecheck.evidence,
      runId: incident.lastRecheck.runId,
      verifiedAt: incident.lastRecheck.verifiedAt,
    }
  }

  if (!disease || !run || !diagnosis?.abnormality) {
    return {
      available: false,
      passed: null,
      evidence: 'No post-treatment recheck recorded yet.',
    }
  }

  const reproduction = extractReproductionFromRun(run)
  return {
    available: Boolean(reproduction),
    passed: null,
    evidence: reproduction
      ? 'No recheck run recorded yet. Run `lucid recheck <incident-id>`.'
      : 'Recheck needs a reproduction command from the original run (process_start).',
  }
}

async function enrichIncident(
  incident: Incident,
  run: AgentRun | null,
  store: LucidStore,
  context: ApiContext = {},
): Promise<{
  incident: Incident
  severity: 'critical' | 'clear' | 'unknown'
  evidence: string
  evidenceEvents: AgentEvent[]
  fileStates: IncidentDetailResponse['fileStates']
  hashChain: HashChainStep[]
  diagnosis: IncidentDiagnosis | null
  rootCause: RootCause | null
  rootCauseDiagnosis: RootCauseDiagnosis | null
  rootCauseEvidenceEvents: AgentEvent[]
  diagnosticWindowEvents: AgentEvent[]
  treatment: StructuredTreatment | null
  recheck: IncidentRecheck
}> {
  if (!run || !incident.department || !incident.disease) {
    return {
      incident,
      severity: 'unknown',
      evidence: incident.symptom ?? '',
      evidenceEvents: [],
      fileStates: null,
      hashChain: [],
      diagnosis: null,
      rootCause: null,
      rootCauseDiagnosis: null,
      rootCauseEvidenceEvents: [],
      diagnosticWindowEvents: [],
      treatment: null,
      recheck: {
        available: false,
        passed: null,
        evidence: 'No linked run or detector metadata.',
      },
    }
  }

  const disease = getDisease(incident.department, incident.disease)
  if (!disease) {
    return {
      incident,
      severity: 'unknown',
      evidence: incident.symptom ?? '',
      evidenceEvents: [],
      fileStates: null,
      hashChain: [],
      diagnosis: null,
      rootCause: null,
      rootCauseDiagnosis: null,
      rootCauseEvidenceEvents: [],
      diagnosticWindowEvents: [],
      treatment: null,
      recheck: {
        available: false,
        passed: null,
        evidence: 'Unknown detector plugin.',
      },
    }
  }

  const diagnosis = disease.diagnose({ run })
  const abnormality = diagnosis.abnormality
  const fileStates = abnormality ? fileStatesFromAbnormality(run, abnormality) : null

  let rootCauseDiagnosis: RootCauseDiagnosis | null = null
  let rootCauseEvidenceEvents: AgentEvent[] = []
  let diagnosticWindowEvents: AgentEvent[] = []
  let treatment: StructuredTreatment | null = incident.treatment ?? null
  let currentIncident = incident

  if (abnormality?.kind === 'repeated-file-state') {
    const provider = context.rootCauseProvider ?? getDefaultRootCauseProvider()
    const rootCauseResult = await diagnoseRepeatedFileStateRootCause({
      run,
      abnormality,
      triggeringEventId: abnormality.signal.repeatedEventId,
      deterministicEvidence: diagnosis.evidence,
      provider,
    })
    rootCauseDiagnosis = rootCauseResult.diagnosis
    rootCauseEvidenceEvents = rootCauseResult.evidenceEvents
    diagnosticWindowEvents = rootCauseResult.diagnosticWindow.events

    if (!treatment && rootCauseDiagnosis.rootCauseType !== 'unknown') {
      const recommended = recommendTreatmentFromDiagnosis(
        rootCauseDiagnosis,
        abnormality.signal.file,
      )
      if (recommended) {
        currentIncident = await updateIncident(store, incident.id, { treatment: recommended })
        treatment = recommended
      }
    }
  }

  return {
    incident: currentIncident,
    severity: diagnosis.status,
    evidence: diagnosis.evidence,
    evidenceEvents: abnormality ? evidenceEventsFromAbnormality(run, abnormality) : [],
    fileStates,
    hashChain: fileStates ? buildHashChain(run, fileStates) : [],
    diagnosis: {
      department: diagnosis.department,
      disease: diagnosis.disease,
      status: diagnosis.status,
      symptom: diagnosis.symptom,
      evidence: diagnosis.evidence,
    },
    rootCause: diagnosis.rootCause,
    rootCauseDiagnosis,
    rootCauseEvidenceEvents,
    diagnosticWindowEvents,
    treatment,
    recheck: buildRecheck(currentIncident, disease, run, diagnosis),
  }
}

async function diagnoseIncident(
  incident: Incident,
  run: AgentRun | null,
  store: LucidStore,
  context: ApiContext = {},
): Promise<{ severity: 'critical' | 'clear' | 'unknown' }> {
  const enriched = await enrichIncident(incident, run, store, context)
  return { severity: enriched.severity }
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
    const { severity } = await diagnoseIncident(incident, run, store)
    summaries.push({ ...incident, severity })
  }

  return { incidents: summaries }
}

export async function fetchIncident(
  store: LucidStore,
  incidentId: string,
  context: ApiContext = {},
): Promise<IncidentDetailResponse | null> {
  const incident = await getIncident(store, incidentId)
  if (!incident) return null

  const run = incident.runId ? await getRun(store, incident.runId) : null
  const enriched = await enrichIncident(incident, run, store, context)

  return {
    incident: enriched.incident,
    run,
    detector:
      incident.department && incident.disease
        ? { department: incident.department, disease: incident.disease }
        : null,
    severity: enriched.severity,
    status: incident.status,
    evidence: enriched.evidence,
    evidenceEvents: enriched.evidenceEvents,
    fileStates: enriched.fileStates,
    hashChain: enriched.hashChain,
    diagnosis: enriched.diagnosis,
    rootCause: enriched.rootCause,
    rootCauseDiagnosis: enriched.rootCauseDiagnosis,
    rootCauseEvidenceEvents: enriched.rootCauseEvidenceEvents,
    diagnosticWindowEvents: enriched.diagnosticWindowEvents,
    treatment: enriched.treatment,
    recheck: enriched.recheck,
  }
}
