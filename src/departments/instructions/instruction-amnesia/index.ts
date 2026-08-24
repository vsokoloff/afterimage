import type { DiseasePlugin } from '../../types.ts'
import { detectInstructionAmnesia } from './detect.ts'
import { diagnose } from './diagnose.ts'
import { recommendFix } from './recommend.ts'
import { verify } from './verify.ts'

export {
  detectInstructionAmnesia,
  detectInstructionAmnesiaFromEvents,
  extractConstraintsFromText,
  formatInstructionAmnesiaEvidence,
} from './detect.ts'
export { diagnose } from './diagnose.ts'
export { recommendFix } from './recommend.ts'
export { verify } from './verify.ts'

export const instructionAmnesia: DiseasePlugin = {
  id: 'instruction-amnesia',
  department: 'instructions',
  name: 'Instruction amnesia',
  description:
    'Detects when a later agent action contradicts a previously established local instruction.',
  status: 'shipped',
  detect: detectInstructionAmnesia,
  diagnose,
  recommendFix,
  verify,
}
