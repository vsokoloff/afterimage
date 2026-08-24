import { shortHash } from './departments/looping/repeated-file-state/detect.ts'
import type { FileEdit, LoopSignal } from './types.ts'

export function printTrace(edits: FileEdit[], signal: LoopSignal | null): void {
  const ordered = [...edits].sort((left, right) => left.turn - right.turn)

  console.log('AFTERIMAGE / Looping · repeated-file-state')
  for (const edit of ordered) {
    console.log(`turn ${edit.turn}  ${edit.file}  ${shortHash(edit.content)}`)
  }
  console.log()

  if (!signal) {
    console.log('No repeated file state detected.')
    return
  }

  const evidence = ordered
    .filter(
      (edit) =>
        edit.file === signal.file &&
        edit.turn >= signal.firstSeenTurn &&
        edit.turn <= signal.repeatedAtTurn,
    )
    .map((edit) => shortHash(edit.content))
    .join(' → ')

  console.log('ABNORMALITY: repeated file state')
  console.log(
    `${signal.file} returned to its turn-${signal.firstSeenTurn} state at turn ${signal.repeatedAtTurn}.`,
  )
  console.log(`Evidence: ${evidence}`)
}
