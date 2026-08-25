import { getShippedDiseases } from './departments/index.ts'
import type { Abnormality, DiseasePlugin, ProjectInstruction } from './departments/types.ts'
import type { AgentEvent, AgentRun, AgentRunStatus } from './events.ts'
import { newId } from './ids.ts'
import type { Incident } from './incident.ts'
import { loadProjectInstructions } from './instructions/store.ts'
import {
  appendEvent,
  createIncident,
  createRun,
  type CreateRunInput,
  type AfterimageStore,
  updateRun,
} from './store.ts'

/** Structured result emitted when a shipped detector finds a new abnormality. */
export type IncidentDetected = {
  type: 'incident_detected'
  runId: string
  incident: Incident
  department: string
  disease: string
  abnormality: Abnormality
  evidence: string
  triggeringEventId: string
}

export type RecordResult = {
  event: AgentEvent
  run: AgentRun
  /** New incidents created from this event (empty if none or already seen). */
  detections: IncidentDetected[]
}

export type FinishRunStatus = Exclude<AgentRunStatus, 'running'>

export type ObserverOptions = {
  store: AfterimageStore
  /** Defaults to all shipped disease plugins. */
  diseases?: DiseasePlugin[]
}

/** Incoming event — omit id/runId/timestamp/sequence to let the observer fill them. */
export type RecordableEvent = {
  [Type in AgentEvent['type']]: Omit<
    Extract<AgentEvent, { type: Type }>,
    'id' | 'runId' | 'timestamp' | 'sequence'
  > &
    Partial<Pick<AgentEvent, 'id' | 'runId' | 'timestamp' | 'sequence'>>
}[AgentEvent['type']]


function abnormalityKey(disease: DiseasePlugin, abnormality: Abnormality): string {
  const prefix = `${disease.department}:${disease.id}`
  switch (abnormality.kind) {
    case 'repeated-file-state': {
      const signal = abnormality.signal
      return [
        prefix,
        signal.file,
        signal.hash,
        signal.firstSeenEventId,
        signal.repeatedEventId,
      ].join(':')
    }
    case 'scope-explosion': {
      const signal = abnormality.signal
      return [
        prefix,
        signal.reason,
        String(signal.fileCount),
        signal.paths.join(','),
        signal.triggeringEventId,
      ].join(':')
    }
    case 'prior-fix-regressed': {
      const signal = abnormality.signal
      return [
        prefix,
        signal.testName,
        signal.firstPassEventId,
        signal.laterFailEventId,
      ].join(':')
    }
    case 'instruction-amnesia': {
      const signal = abnormality.signal
      return [
        prefix,
        signal.constraintId,
        signal.violatingEventId,
      ].join(':')
    }
    case 'redundant-rewrite': {
      const signal = abnormality.signal
      return [
        prefix,
        signal.matchKind,
        signal.hash,
        signal.firstEventId,
        signal.duplicateEventId,
      ].join(':')
    }
    default:
      return `${prefix}:${JSON.stringify(abnormality)}`
  }
}

function incidentTitle(disease: DiseasePlugin, abnormality: Abnormality): string {
  switch (abnormality.kind) {
    case 'repeated-file-state':
      return `${disease.name}: ${abnormality.signal.file} returned to a prior content hash`
    case 'scope-explosion':
      return `${disease.name}: ${abnormality.signal.fileCount} files across ${abnormality.signal.topLevelDirs.length} directories`
    case 'prior-fix-regressed':
      return `${disease.name}: ${abnormality.signal.testName} failed after previously passing`
    case 'instruction-amnesia':
      return `${disease.name}: violated “${abnormality.signal.constraintText}”`
    case 'redundant-rewrite':
      return `${disease.name}: ${abnormality.signal.duplicatePath} duplicates ${abnormality.signal.firstPath}`
    default:
      return `${disease.name}: abnormality detected`
  }
}

/**
 * Runtime observer: persist events, run shipped detectors, open incidents.
 * Independent of Codex/Cursor — call startRun → record → finishRun from any host.
 */
export class AfterimageObserver {
  readonly store: AfterimageStore
  private readonly diseases: DiseasePlugin[]
  private active: AgentRun | null = null
  private nextSequence = 1
  /** Abnormalities already turned into incidents for the active run. */
  private seenKeys = new Set<string>()
  /** Local project instructions loaded at run start for instruction-amnesia. */
  private projectInstructions: ProjectInstruction[] = []

  constructor(options: ObserverOptions) {
    this.store = options.store
    this.diseases = options.diseases ?? getShippedDiseases()
  }

  get run(): AgentRun | null {
    return this.active ? { ...this.active, events: [...this.active.events] } : null
  }

  async startRun(input: CreateRunInput = {}): Promise<AgentRun> {
    const run = await createRun(this.store, {
      ...input,
      status: input.status ?? 'running',
    })
    this.active = run
    this.nextSequence = 1
    this.seenKeys = new Set()
    this.projectInstructions = await loadProjectInstructions(this.store)
    return this.run!
  }

  /**
   * Resume an existing running AgentRun (e.g. Cursor hooks across process invocations).
   * Rebuilds nextSequence from persisted events. Does not re-open prior incidents
   * for the same abnormality keys already stored on this run.
   */
  async resumeRun(run: AgentRun): Promise<AgentRun> {
    if (run.status !== 'running') {
      throw new Error(`Cannot resume run ${run.id} with status ${run.status}`)
    }
    this.active = { ...run, events: [...run.events] }
    this.nextSequence =
      run.events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1
    this.seenKeys = new Set()
    this.projectInstructions = await loadProjectInstructions(this.store)

    // Seed seen keys from current detector output so we don't reopen the same incident.
    for (const disease of this.diseases) {
      const abnormality = disease.detect({
        run: this.active,
        projectInstructions: this.projectInstructions,
      })
      if (!abnormality) continue
      this.seenKeys.add(abnormalityKey(disease, abnormality))
    }

    return this.run!
  }

  /**
   * Persist one event, re-run shipped detectors on the current run snapshot,
   * and create/emit incidents for newly appeared abnormalities.
   */
  async record(event: RecordableEvent): Promise<RecordResult> {
    if (!this.active) {
      throw new Error('No active run — call startRun() before record()')
    }

    const sequence = event.sequence ?? this.nextSequence
    const prepared = {
      ...event,
      id: event.id || newId('evt'),
      runId: event.runId ?? this.active.id,
      timestamp: event.timestamp || new Date().toISOString(),
      sequence,
    } as AgentEvent

    if (prepared.runId !== this.active.id) {
      throw new Error(
        `Event runId ${prepared.runId} does not match active run ${this.active.id}`,
      )
    }

    const stored = await appendEvent(this.store, prepared)
    this.active.events.push(stored)
    this.nextSequence = Math.max(this.nextSequence, stored.sequence + 1)

    const runSnapshot: AgentRun = {
      ...this.active,
      events: [...this.active.events],
    }

    const trace = {
      run: runSnapshot,
      projectInstructions: this.projectInstructions,
    }

    const detections: IncidentDetected[] = []
    for (const disease of this.diseases) {
      const abnormality = disease.detect(trace)
      if (!abnormality) continue

      const key = abnormalityKey(disease, abnormality)
      if (this.seenKeys.has(key)) continue

      const diagnosis = disease.diagnose(trace)
      const evidence = diagnosis.evidence
      const incident = await createIncident(this.store, {
        runId: runSnapshot.id,
        agentId: runSnapshot.agentId,
        title: incidentTitle(disease, abnormality),
        symptom: evidence,
        status: 'open',
        department: disease.department,
        disease: disease.id,
      })

      this.seenKeys.add(key)
      detections.push({
        type: 'incident_detected',
        runId: runSnapshot.id,
        incident,
        department: disease.department,
        disease: disease.id,
        abnormality,
        evidence,
        triggeringEventId: stored.id,
      })
    }

    return {
      event: stored,
      run: runSnapshot,
      detections,
    }
  }

  async finishRun(status: FinishRunStatus = 'completed'): Promise<AgentRun> {
    if (!this.active) {
      throw new Error('No active run — call startRun() before finishRun()')
    }

    const finished = await updateRun(this.store, this.active.id, {
      status,
      endedAt: new Date().toISOString(),
    })
    this.active = null
    this.nextSequence = 1
    this.seenKeys = new Set()
    this.projectInstructions = []
    return finished
  }
}

export function createObserver(options: ObserverOptions): AfterimageObserver {
  return new AfterimageObserver(options)
}

/** @deprecated Use AfterimageObserver */
export { AfterimageObserver as LucidObserver }
