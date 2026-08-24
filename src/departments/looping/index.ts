import type { DiseasePlugin } from '../types.ts'
import { repeatedFileState } from './repeated-file-state/index.ts'

export { repeatedFileState } from './repeated-file-state/index.ts'
export {
  detectLoop,
  detectRepeatedFileState,
  hashContent,
  shortHash,
} from './repeated-file-state/detect.ts'

/** Planned Looping diseases (stubs — not shipped yet). */
const loopingStubs: DiseasePlugin[] = [
  stubDisease({
    id: 'repeated-tool-calls',
    name: 'Repeated tool calls',
    description: 'Same tool invoked with the same arguments in a tight cycle.',
  }),
  stubDisease({
    id: 'oscillation',
    name: 'Oscillation',
    description: 'Agent flips between two approaches without progress.',
  }),
  stubDisease({
    id: 'undo-redo',
    name: 'Undo / redo thrash',
    description: 'Agent repeatedly undoes and redoes the same change.',
  }),
]

function stubDisease(meta: {
  id: string
  name: string
  description: string
}): DiseasePlugin {
  return {
    ...meta,
    department: 'looping',
    status: 'stub',
    detect: () => null,
    diagnose: () => ({
      department: 'looping',
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

export const loopingDiseases: DiseasePlugin[] = [repeatedFileState, ...loopingStubs]
