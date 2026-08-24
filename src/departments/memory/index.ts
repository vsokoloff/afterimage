import type { DiseasePlugin } from '../types.ts'
import { priorFixRegressed } from './prior-fix-regressed/index.ts'

export { priorFixRegressed } from './prior-fix-regressed/index.ts'
export {
  detectPriorFixRegressed,
  detectPriorFixRegressedFromEvents,
  formatPriorFixRegressedEvidence,
} from './prior-fix-regressed/index.ts'

function stubDisease(meta: {
  id: string
  name: string
  description: string
}): DiseasePlugin {
  return {
    ...meta,
    department: 'memory',
    status: 'stub',
    detect: () => null,
    diagnose: () => ({
      department: 'memory',
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

const memoryStubs: DiseasePlugin[] = [
  stubDisease({
    id: 'forgotten-failures',
    name: 'Forgotten failures',
    description: 'Agent retries approaches that already failed in this session.',
  }),
  stubDisease({
    id: 'repeated-research',
    name: 'Repeated research',
    description: 'Agent re-discovers the same facts without retaining them.',
  }),
  stubDisease({
    id: 'constraint-forgetting',
    name: 'Constraint forgetting',
    description: 'Agent drops stated constraints after a few turns.',
  }),
]

export const memoryDiseases: DiseasePlugin[] = [priorFixRegressed, ...memoryStubs]
