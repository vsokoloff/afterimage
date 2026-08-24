import type { AgentEvent, TestResultEvent } from '../../../events.ts'
import type {
  AgentTrace,
  PriorFixRegressedAbnormality,
  PriorFixRegressedSignal,
} from '../../types.ts'
import { resolveTraceEvents } from '../../types.ts'

function testResults(events: AgentEvent[]): TestResultEvent[] {
  return events
    .filter((event): event is TestResultEvent => event.type === 'test_result')
    .sort((left, right) => {
      if (left.sequence !== right.sequence) return left.sequence - right.sequence
      return left.id.localeCompare(right.id)
    })
}

export function formatPriorFixRegressedEvidence(signal: PriorFixRegressedSignal): string {
  return [
    'prior-fix-regressed',
    `test=${signal.testName}`,
    `firstPassEvent=${signal.firstPassEventId}@seq=${signal.firstPassSequence}`,
    `laterFailEvent=${signal.laterFailEventId}@seq=${signal.laterFailSequence}`,
  ].join(' ')
}

/**
 * Within-run regression: same named test was passing, then later fails.
 */
export function detectPriorFixRegressedFromEvents(
  events: AgentEvent[],
): PriorFixRegressedSignal | null {
  const results = testResults(events)
  /** test name → first passing event */
  const firstPassByName = new Map<string, TestResultEvent>()

  for (const result of results) {
    const name = result.name?.trim() || 'unnamed-test'
    if (result.passed) {
      if (!firstPassByName.has(name)) {
        firstPassByName.set(name, result)
      }
      continue
    }

    const priorPass = firstPassByName.get(name)
    if (priorPass) {
      return {
        testName: name,
        firstPassEventId: priorPass.id,
        firstPassSequence: priorPass.sequence,
        laterFailEventId: result.id,
        laterFailSequence: result.sequence,
      }
    }
  }

  return null
}

export function detectPriorFixRegressed(
  trace: AgentTrace,
): PriorFixRegressedAbnormality | null {
  const signal = detectPriorFixRegressedFromEvents(resolveTraceEvents(trace))
  if (!signal) return null
  return { kind: 'prior-fix-regressed', signal }
}
