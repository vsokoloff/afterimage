import type { DiseasePlugin } from '../../types.ts'
import { detectRepeatedFileState } from './detect.ts'
import { diagnose } from './diagnose.ts'
import { recommendFix } from './recommend.ts'
import { verify } from './verify.ts'

export { detectLoop, detectLoopFromFileWrites, detectRepeatedFileState, hashContent, shortHash } from './detect.ts'
export { diagnose } from './diagnose.ts'
export { recommendFix } from './recommend.ts'
export { verify } from './verify.ts'

/** Looping Department → repeated file state (shipped end-to-end). */
export const repeatedFileState: DiseasePlugin = {
  id: 'repeated-file-state',
  department: 'looping',
  name: 'Repeated file state',
  description:
    'Detects when a file returns to a complete content hash it already had (A → B → A).',
  status: 'shipped',
  detect: detectRepeatedFileState,
  diagnose,
  recommendFix,
  verify,
}
