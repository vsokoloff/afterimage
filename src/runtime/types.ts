import type { LucidObserver, IncidentDetected } from '../observer.ts'
import type { AgentRun } from '../events.ts'
import type { LucidStore } from '../store.ts'
import type { AlertWriter } from './incident-alert.ts'
import type { WatchFn } from './filesystem-watcher.ts'
import type { RunIncidentPolicy } from './policy.ts'

/** Options shared by all runtime adapters that wrap an external process or agent. */
export type RuntimeObserveOptions = {
  store: LucidStore
  /** argv for the wrapped command (after `afterimage run --`). */
  command: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  agentId?: string
  /** Watch workspace for file writes while the process runs (process adapter). */
  watchFilesystem?: boolean
  filesystemDebounceMs?: number
  watchFn?: WatchFn
  /**
   * Persist full file bodies on `file_write` events.
   * Defaults to `LUCID_STORE_FILE_CONTENT` (off unless set).
   */
  retainFileContent?: boolean
  /** Default observe — log alert and continue the wrapped process. */
  incidentPolicy?: RunIncidentPolicy
  /** Base URL for local incident links (default http://127.0.0.1:3000). */
  webBaseUrl?: string
  onIncidentDetected?: (detection: IncidentDetected) => void
  alertWriter?: AlertWriter
}

export type RuntimeObserveResult = {
  run: AgentRun
  exitCode: number | null
  signal: NodeJS.Signals | null
  incidentsOpened: number
  detections: IncidentDetected[]
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
