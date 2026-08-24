import type { DiseasePlugin } from '../types.ts'
import { redundantRewrite } from './redundant-rewrite/index.ts'

export { redundantRewrite } from './redundant-rewrite/index.ts'
export {
  detectRedundantRewrite,
  detectRedundantRewriteFromWrites,
  formatRedundantRewriteEvidence,
  normalizeWhitespace,
  structuralHash,
} from './redundant-rewrite/index.ts'

function stubDisease(meta: {
  id: string
  name: string
  description: string
}): DiseasePlugin {
  return {
    ...meta,
    department: 'cost',
    status: 'stub',
    detect: () => null,
    diagnose: () => ({
      department: 'cost',
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

const costStubs: DiseasePlugin[] = [
  stubDisease({
    id: 'token-explosion',
    name: 'Token explosion',
    description: 'Context or output size grows without useful progress.',
  }),
  stubDisease({
    id: 'rereading-files',
    name: 'Rereading files',
    description: 'Agent repeatedly reads the same file without need.',
  }),
  stubDisease({
    id: 'excessive-retries',
    name: 'Excessive retries',
    description: 'Retry budget burns with no change in strategy.',
  }),
]

export const costDiseases: DiseasePlugin[] = [redundantRewrite, ...costStubs]
