import type { DiseasePlugin } from '../../types.ts'
import { detectScopeExplosion } from './detect.ts'
import { diagnose } from './diagnose.ts'
import { recommendFix } from './recommend.ts'
import { verify } from './verify.ts'

export {
  detectScopeExplosion,
  detectScopeExplosionFromWrites,
  fileWritesFromTrace,
  formatScopeExplosionEvidence,
  extractPromptPaths,
  topLevelDir,
  MULTI_DIR_MIN_FILES,
  MULTI_DIR_MIN_DIRS,
  HIGH_FILE_COUNT,
  PROMPT_SCOPE_MAX_MENTIONED,
  PROMPT_SCOPE_MIN_FILES,
} from './detect.ts'
export { diagnose } from './diagnose.ts'
export { recommendFix } from './recommend.ts'
export { verify } from './verify.ts'

/** Scope Department → scope explosion (shipped end-to-end). */
export const scopeExplosion: DiseasePlugin = {
  id: 'scope-explosion',
  department: 'scope',
  name: 'Scope explosion',
  description:
    'Detects when a localized task causes unusually broad changes across many files or directories.',
  status: 'shipped',
  detect: detectScopeExplosion,
  diagnose,
  recommendFix,
  verify,
}
