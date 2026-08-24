import type { Abnormality } from '../departments/types.ts'
import { extractDiagnosticWindow, type DiagnosticWindow } from '../diagnostic-window.ts'
import type { AgentEvent, AgentRun } from '../events.ts'
import type { RootCauseModelProvider } from './model-provider.ts'
import { createMockRootCauseProvider } from './providers/mock-provider.ts'
import { validateRootCauseDiagnosis } from './validate.ts'
import type { RootCauseDiagnosis } from './types.ts'

export type RootCauseDiagnosisInput = {
  run: AgentRun
  abnormality: Abnormality
  triggeringEventId: string
  deterministicEvidence: string
  provider?: RootCauseModelProvider
}

export type RootCauseDiagnosisResult = {
  diagnosis: RootCauseDiagnosis
  diagnosticWindow: DiagnosticWindow
  evidenceEvents: AgentEvent[]
}

let defaultProvider: RootCauseModelProvider | null = null

export function setDefaultRootCauseProvider(provider: RootCauseModelProvider | null): void {
  defaultProvider = provider
}

export function getDefaultRootCauseProvider(): RootCauseModelProvider {
  return defaultProvider ?? createMockRootCauseProvider()
}

/**
 * Analyze a repeated-file-state incident using only the bounded diagnostic window.
 * Detection remains separate and deterministic; this layer may use an LLM provider.
 */
export async function diagnoseRepeatedFileStateRootCause(
  input: RootCauseDiagnosisInput,
): Promise<RootCauseDiagnosisResult> {
  if (input.abnormality.kind !== 'repeated-file-state') {
    throw new Error('Root-cause diagnosis supports repeated-file-state incidents only.')
  }

  const window = extractDiagnosticWindow({
    run: input.run,
    triggeringEventId: input.triggeringEventId,
    abnormality: input.abnormality,
  })

  const provider = input.provider ?? getDefaultRootCauseProvider()
  const raw = await provider.analyze({
    window,
    loopFile: input.abnormality.signal.file,
    deterministicEvidence: input.deterministicEvidence,
  })

  const allowedEventIds = new Set(window.events.map((event) => event.id))
  const diagnosis = validateRootCauseDiagnosis(raw, allowedEventIds)
  const byId = new Map(input.run.events.map((event) => [event.id, event]))
  const evidenceEvents = diagnosis.evidenceEventIds
    .map((id) => byId.get(id))
    .filter((event): event is AgentEvent => event !== undefined)

  return {
    diagnosis,
    diagnosticWindow: window,
    evidenceEvents,
  }
}
