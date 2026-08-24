/**
 * A hospital-facing incident derived from (or linked to) an agent run.
 * Persisted under `.lucid/incidents/` — separate from VisitCase fixtures.
 */
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
  createdAt: string
  updatedAt: string
}
