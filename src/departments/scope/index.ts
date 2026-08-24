import type { DiseasePlugin } from '../types.ts'
import { scopeExplosion } from './scope-explosion/index.ts'

export { scopeExplosion } from './scope-explosion/index.ts'
export {
  detectScopeExplosion,
  detectScopeExplosionFromWrites,
  fileWritesFromTrace,
  formatScopeExplosionEvidence,
  extractPromptPaths,
  topLevelDir,
} from './scope-explosion/index.ts'

export const scopeDiseases: DiseasePlugin[] = [scopeExplosion]
