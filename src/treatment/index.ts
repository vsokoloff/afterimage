export {
  recommendTreatmentFromDiagnosis,
  treatmentRiskForRootCause,
} from './recommend.ts'
export { parseFixArgv, type ParsedFixArgv } from './parse-fix-argv.ts'
export { runFixCommand, type RunFixCommandOptions, type RunFixCommandResult } from './fix.ts'
export { getTreatmentAdapter, listTreatmentAdapters } from './adapters/registry.ts'
export type {
  TreatmentAdapter,
  TreatmentAdapterContext,
  TreatmentApplicationRecord,
  TreatmentApplyResult,
  TreatmentPreview,
  TreatmentRollbackContext,
} from './adapters/types.ts'
export {
  rootCauseToTreatmentTarget,
  TREATMENT_TARGETS,
  type StructuredTreatment,
  type TreatmentRiskLevel,
  type TreatmentTarget,
} from './types.ts'
