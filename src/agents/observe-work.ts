import {
  createObserver,
  type FinishRunStatus,
  type LucidObserver,
  type RecordableEvent,
  type RecordResult,
} from '../observer.ts'
import type { AgentRun } from '../events.ts'
import type { LucidStore } from '../store.ts'

export type ObservedAgentWorkContext = {
  observer: LucidObserver
  run: AgentRun
  record: (event: RecordableEvent) => Promise<RecordResult>
}

export type WithObservedAgentWorkOptions<T> = {
  store: LucidStore
  /** Dashboard agent id (e.g. gitty, uma). */
  agentId: string
  /**
   * Optional job label recorded as the opening user prompt so Activity
   * shows what the agent was asked to do.
   */
  job?: string
  work: (ctx: ObservedAgentWorkContext) => Promise<T>
  /** Defaults from exit: completed if work returns, failed if it throws. */
  finishStatus?: FinishRunStatus | ((result: T) => FinishRunStatus)
  createObserver?: (store: LucidStore) => LucidObserver
}

/**
 * Every dashboard agent action should run under Afterimage observation so
 * lastSeenAt / Activity / Hospital stay honest.
 */
export async function withObservedAgentWork<T>(
  options: WithObservedAgentWorkOptions<T>,
): Promise<{ result: T; run: AgentRun }> {
  const observer =
    options.createObserver?.(options.store) ?? createObserver({ store: options.store })

  const run = await observer.startRun({ agentId: options.agentId })

  const record = async (event: RecordableEvent) => observer.record(event)

  if (options.job?.trim()) {
    await record({
      type: 'prompt',
      role: 'user',
      text: options.job.trim(),
    })
  }

  try {
    const result = await options.work({ observer, run, record })
    const status =
      typeof options.finishStatus === 'function'
        ? options.finishStatus(result)
        : (options.finishStatus ?? 'completed')
    const finished = await observer.finishRun(status)
    return { result, run: finished }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await record({ type: 'error', message })
    } catch {
      /* ignore record failure during unwind */
    }
    const finished = await observer.finishRun('failed')
    if (error instanceof Error) {
      ;(error as Error & { run?: AgentRun }).run = finished
    }
    throw error
  }
}
