import type { StructuredTreatment } from '../types.ts'
import { instructionsTreatmentAdapter } from './instructions-adapter.ts'
import type { TreatmentAdapter } from './types.ts'

const ADAPTERS: TreatmentAdapter[] = [instructionsTreatmentAdapter]

export function listTreatmentAdapters(): TreatmentAdapter[] {
  return [...ADAPTERS]
}

export function getTreatmentAdapter(treatment: StructuredTreatment): TreatmentAdapter | null {
  return ADAPTERS.find((adapter) => adapter.supports(treatment)) ?? null
}
