import type { DiseasePlugin } from '../../types.ts'
import { detectPriorFixRegressed } from './detect.ts'
import { diagnose } from './diagnose.ts'
import { recommendFix } from './recommend.ts'
import { verify } from './verify.ts'

export {
  detectPriorFixRegressed,
  detectPriorFixRegressedFromEvents,
  formatPriorFixRegressedEvidence,
} from './detect.ts'
export { diagnose } from './diagnose.ts'
export { recommendFix } from './recommend.ts'
export { verify } from './verify.ts'

export const priorFixRegressed: DiseasePlugin = {
  id: 'prior-fix-regressed',
  department: 'memory',
  name: 'Prior fix regressed',
  description:
    'Detects when a previously passing test becomes failing again after later agent changes.',
  status: 'shipped',
  detect: detectPriorFixRegressed,
  diagnose,
  recommendFix,
  verify,
}
