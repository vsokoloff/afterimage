import type { DiseasePlugin } from '../../types.ts'
import { detectRedundantRewrite } from './detect.ts'
import { diagnose } from './diagnose.ts'
import { recommendFix } from './recommend.ts'
import { verify } from './verify.ts'

export {
  detectRedundantRewrite,
  detectRedundantRewriteFromWrites,
  formatRedundantRewriteEvidence,
  normalizeWhitespace,
  structuralHash,
} from './detect.ts'
export { diagnose } from './diagnose.ts'
export { recommendFix } from './recommend.ts'
export { verify } from './verify.ts'

export const redundantRewrite: DiseasePlugin = {
  id: 'redundant-rewrite',
  department: 'cost',
  name: 'Redundant rewrite',
  description:
    'Detects when an agent creates code that already exists or is structurally identical to existing code.',
  status: 'shipped',
  detect: detectRedundantRewrite,
  diagnose,
  recommendFix,
  verify,
}
