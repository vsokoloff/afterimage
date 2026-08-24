import type { DiseasePlugin } from '../types.ts'
import { instructionAmnesia } from './instruction-amnesia/index.ts'

export { instructionAmnesia } from './instruction-amnesia/index.ts'
export {
  detectInstructionAmnesia,
  detectInstructionAmnesiaFromEvents,
  extractConstraintsFromText,
  formatInstructionAmnesiaEvidence,
} from './instruction-amnesia/index.ts'

function stubDisease(meta: {
  id: string
  name: string
  description: string
}): DiseasePlugin {
  return {
    ...meta,
    department: 'instructions',
    status: 'stub',
    detect: () => null,
    diagnose: () => ({
      department: 'instructions',
      disease: meta.id,
      status: 'clear',
      abnormality: null,
      evidence: `${meta.name} is not implemented yet.`,
      symptom: 'Not implemented',
      rootCause: null,
    }),
    recommendFix: () => null,
    verify: () => ({
      passed: true,
      evidence: 'Stub disease — nothing to verify.',
      abnormality: null,
    }),
  }
}

const instructionStubs: DiseasePlugin[] = [
  stubDisease({
    id: 'conflicting-goals',
    name: 'Conflicting goals',
    description: 'Two requirements cannot both be satisfied; agent oscillates.',
  }),
  stubDisease({
    id: 'ambiguous-priority',
    name: 'Ambiguous priority',
    description: 'No clear ranking among competing instructions.',
  }),
]

export const instructionsDiseases: DiseasePlugin[] = [
  instructionAmnesia,
  ...instructionStubs,
]
