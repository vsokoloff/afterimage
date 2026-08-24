import type { LucidObserver, IncidentDetected } from '../observer.ts'
import type { AgentRun } from '../events.ts'
import type { LucidStore } from '../store.ts'
import type { AlertWriter } from './incident-alert.ts'
import type { RunIncidentPolicy } from './policy.ts'

/**
 * Options for agent-runtime adapters (Codex SDK, future Cursor host hooks).
 * Unlike `RuntimeObserveOptions`, these wrap an in-process agent stream — not argv.
 */
export type AgentRuntimeObserveOptions = {
  store: LucidStore
  /** User task / prompt that started the agent run. */
  task: string
  cwd?: string
  model?: string
  lucidAgentId?: string
  /** Host runtime identifiers (Codex agent_id / run_id). */
  codexAgentId?: string
  codexRunId?: string
  /**
   * Persist full file bodies on `file_write` events.
   * Defaults to `LUCID_STORE_FILE_CONTENT` (off unless set).
   */
  retainFileContent?: boolean
  incidentPolicy?: RunIncidentPolicy
  webBaseUrl?: string
  onIncidentDetected?: (detection: IncidentDetected) => void
  alertWriter?: AlertWriter
  createObserver?: (store: LucidStore) => LucidObserver
}

export type AgentRuntimeObserveResult = {
  run: AgentRun
  incidentsOpened: number
  detections: IncidentDetected[]
  /** Host run id when the adapter knows it (Codex run_id). */
  runtimeRunId?: string
  runtimeStatus?: string
}

/**
 * Agent-runtime adapter — maps a host SDK stream into Lucid AgentEvents.
 * Detectors consume AgentEvent only; they never import adapter code.
 */
export type AgentRuntimeAdapter = {
  readonly name: string
  observe(options: AgentRuntimeObserveOptions): Promise<AgentRuntimeObserveResult>
}
