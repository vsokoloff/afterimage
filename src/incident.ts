/**
 * A hospital-facing incident derived from (or linked to) an agent run.
 * Persisted under `.lucid/incidents/` — separate from VisitCase fixtures.
 */
import type { StructuredTreatment } from './treatment/types.ts'

export type IncidentStatus = 'open' | 'in_hospital' | 'cleared' | 'closed'

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
  createdAt: string
  updatedAt: string
}
