import { getShippedDiseases } from './departments/index.ts'
import type { Abnormality, DiseasePlugin } from './departments/types.ts'
import type { AgentEvent, AgentRun, AgentRunStatus } from './events.ts'
import { newId } from './ids.ts'
import type { Incident } from './incident.ts'
import {
  appendEvent,
  createIncident,
  createRun,
  type CreateRunInput,
  type LucidStore,
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
  store: LucidStore
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
  if (abnormality.kind === 'repeated-file-state') {
    const signal = abnormality.signal
    return [
      disease.department,
      disease.id,
      signal.file,
      signal.hash,
      signal.firstSeenEventId,
      signal.repeatedEventId,
    ].join(':')
  }
  return `${disease.department}:${disease.id}:${JSON.stringify(abnormality)}`
}

function incidentTitle(disease: DiseasePlugin, abnormality: Abnormality): string {
  if (abnormality.kind === 'repeated-file-state') {
    return `${disease.name}: ${abnormality.signal.file} returned to a prior content hash`
  }
  return `${disease.name}: abnormality detected`
}

/**
 * Runtime observer: persist events, run shipped detectors, open incidents.
 * Independent of Codex/Cursor — call startRun → record → finishRun from any host.
 */
export class LucidObserver {
  readonly store: LucidStore
  private readonly diseases: DiseasePlugin[]
  private active: AgentRun | null = null
  private nextSequence = 1
  /** Abnormalities already turned into incidents for the active run. */
  private seenKeys = new Set<string>()

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

    const detections: IncidentDetected[] = []
    for (const disease of this.diseases) {
      const abnormality = disease.detect({ run: runSnapshot })
      if (!abnormality) continue

      const key = abnormalityKey(disease, abnormality)
      if (this.seenKeys.has(key)) continue

      const diagnosis = disease.diagnose({ run: runSnapshot })
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
    return finished
  }
}

export function createObserver(options: ObserverOptions): LucidObserver {
  return new LucidObserver(options)
}
