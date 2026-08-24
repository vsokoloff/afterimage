import type { AgentEvent, AgentRun } from '../../events.ts'
import type { Incident } from '../../incident.ts'
import type { RootCauseDiagnosis } from '../../root-cause/types.ts'
import type { LucidStore } from '../../store.ts'
import type { StructuredTreatment } from '../types.ts'

export type TreatmentPreview = {
  summary: string
  before: string
  after: string
}

export type TreatmentApplyResult = {
  applicationId: string
  artifactPath: string
  backupPath: string
}

export type TreatmentAdapterContext = {
  store: LucidStore
  incident: Incident
  treatment: StructuredTreatment
  rootCauseDiagnosis: RootCauseDiagnosis
  run: AgentRun | null
  evidenceEvents: AgentEvent[]
}

export type TreatmentRollbackContext = TreatmentAdapterContext & {
  application: TreatmentApplicationRecord
}

/** Persisted record of an applied treatment (stored on the incident). */
export type TreatmentApplicationRecord = {
  id: string
  target: StructuredTreatment['target']
  appliedAt: string
  artifactPath: string
  backupPath: string
  rolledBackAt?: string
}

export type TreatmentAdapter = {
  readonly target: StructuredTreatment['target']
  supports(treatment: StructuredTreatment): boolean
  preview(context: TreatmentAdapterContext): TreatmentPreview
  apply(context: TreatmentAdapterContext): Promise<TreatmentApplyResult>
  rollback(context: TreatmentRollbackContext): Promise<void>
}
