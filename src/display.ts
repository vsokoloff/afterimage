import type { FileWriteEvent } from './events.ts'
import { shortDigest } from './departments/looping/repeated-file-state/detect.ts'
import type { LoopSignal } from './types.ts'
import { formatRepeatedFileStateEvidence } from './departments/looping/repeated-file-state/detect.ts'

export function printTrace(writes: FileWriteEvent[], signal: LoopSignal | null): void {
  const ordered = [...writes].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence
    return left.id.localeCompare(right.id)
  })

  console.log('AFTERIMAGE / Looping · repeated-file-state')
  for (const write of ordered) {
    console.log(`seq ${write.sequence}  ${write.path}  ${shortDigest(write.hash)}`)
  }
  console.log()

  if (!signal) {
    console.log('No repeated file state detected.')
    return
  }

  console.log('ABNORMALITY: repeated file state')
  console.log(
    `${signal.file} returned to its seq-${signal.firstSeenTurn} state at seq ${signal.repeatedAtTurn}.`,
  )
  console.log(`Evidence: ${formatRepeatedFileStateEvidence(signal)}`)
}
