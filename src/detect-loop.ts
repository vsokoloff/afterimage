/**
 * Back-compat surface for the SHA-256 loop detector.
 * Implementation lives in departments/looping/repeated-file-state.
 */
export {
  detectLoopFromFileWrites,
  detectRepeatedFileState,
  formatRepeatedFileStateEvidence,
  hashContent,
  shortDigest,
  shortHash,
} from './departments/looping/repeated-file-state/detect.ts'
