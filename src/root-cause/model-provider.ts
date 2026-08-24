import type { DiagnosticWindow } from '../diagnostic-window.ts'
import type { RootCauseModelOutput } from './types.ts'

export type RootCauseModelInput = {
  /** Bounded diagnostic window — the only trace material models may analyze. */
  window: DiagnosticWindow
  loopFile: string
  deterministicEvidence: string
}

/** Provider interface — swap mock, OpenAI, Anthropic, etc. without changing callers. */
export type RootCauseModelProvider = {
  readonly name: string
  analyze(input: RootCauseModelInput): Promise<RootCauseModelOutput>
}
