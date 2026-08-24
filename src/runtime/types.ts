import type { LucidObserver } from '../observer.ts'
import type { AgentRun } from '../events.ts'
import type { LucidStore } from '../store.ts'

/** Options shared by all runtime adapters that wrap an external process or agent. */
export type RuntimeObserveOptions = {
  store: LucidStore
  /** argv for the wrapped command (after `lucid run --`). */
  command: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  agentId?: string
}

export type RuntimeObserveResult = {
  run: AgentRun
  exitCode: number | null
  signal: NodeJS.Signals | null
  incidentsOpened: number
}

/**
 * Runtime adapter — observes an external execution and emits AgentEvents.
 * Process adapter today; Cursor/Codex adapters can emit tool/model events later.
 */
export type RuntimeAdapter = {
  readonly name: string
  observe(options: RuntimeObserveOptions): Promise<RuntimeObserveResult>
}

export type ProcessSpawnFn = (
  command: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; shell: boolean },
) => import('node:child_process').ChildProcess

export type ProcessRuntimeOptions = RuntimeObserveOptions & {
  spawn?: ProcessSpawnFn
  createObserver?: (store: LucidStore) => LucidObserver
}
