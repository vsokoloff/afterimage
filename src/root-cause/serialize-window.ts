import type { AgentEvent } from '../events.ts'
import type { RootCauseModelInput } from './model-provider.ts'

function eventSummary(event: AgentEvent): string {
  switch (event.type) {
    case 'prompt':
      return `role=${event.role ?? 'unknown'} text=${JSON.stringify(event.text)}`
    case 'model_response':
      return `model=${event.model ?? 'unknown'} text=${JSON.stringify(event.text)} reason=${JSON.stringify(event.reasonSummary ?? '')}`
    case 'tool_call':
      return `tool=${event.toolName} callId=${event.callId ?? ''} args=${JSON.stringify(event.arguments ?? null)}`
    case 'tool_result':
      return `tool=${event.toolName} ok=${event.ok} output=${JSON.stringify(event.output ?? null)}`
    case 'file_write':
      return `path=${event.path} hash=${event.hash.slice(0, 12)} ok=${event.ok !== false}`
    case 'test_result':
      return `name=${event.name ?? ''} passed=${event.passed} output=${JSON.stringify(event.output ?? '')}`
    case 'error':
      return `code=${event.code ?? ''} message=${JSON.stringify(event.message)}`
    case 'process_output':
      return `stream=${event.stream} text=${JSON.stringify(event.text.slice(0, 200))}`
    default:
      return `type=${event.type}`
  }
}

/**
 * Deterministic, bounded serialization of the diagnostic window for model input.
 * Only events inside the window are included.
 */
export function serializeDiagnosticWindowForModel(input: RootCauseModelInput): string {
  const lines: string[] = [
    `trigger_event_id: ${input.window.triggeringEventId}`,
    `trigger_sequence: ${input.window.triggeringSequence}`,
    `loop_file: ${input.loopFile}`,
    `detector_evidence: ${input.deterministicEvidence}`,
    'events:',
  ]

  for (const event of input.window.events) {
    lines.push(
      `- id=${event.id} seq=${event.sequence} type=${event.type} ${eventSummary(event)}`,
    )
  }

  return lines.join('\n')
}
