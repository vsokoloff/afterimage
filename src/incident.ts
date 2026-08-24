/**
 * A hospital-facing incident derived from (or linked to) an agent run.
 * Persisted under `.lucid/incidents/` — separate from VisitCase fixtures.
 */
import type { StructuredTreatment } from './treatment/types.ts'
import type { TreatmentApplicationRecord } from './treatment/adapters/types.ts'

export type IncidentStatus = 'open' | 'in_hospital' | 'cleared' | 'closed'

/** Persisted outcome of a `lucid recheck` verification run. */
export type RecheckRecord = {
  runId: string
  passed: boolean
  evidence: string
  verifiedAt: string
  reproductionCommand?: string[]
  reproductionCwd?: string
}

export type Incident = {
  id: string
  /** Optional link to the AgentRun that produced this incident. */
  runId?: string
  agentId?: string
  title: string
  symptom?: string
  status: IncidentStatus
  department?: string
  disease?: string
  /** Structured treatment persisted after root-cause diagnosis. */
  treatment?: StructuredTreatment
  /** Last applied treatment artifact (Lucid agent config — not app code). */
  treatmentApplication?: TreatmentApplicationRecord
  /** Latest linked recheck run and verification outcome. */
  lastRecheck?: RecheckRecord
  /** All recheck attempts, oldest first. */
  recheckHistory?: RecheckRecord[]
  createdAt: string
  updatedAt: string
}
