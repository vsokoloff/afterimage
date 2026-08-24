import type { AgentEvent } from '../../events.ts'
import type { DiagnosticWindow } from '../../diagnostic-window.ts'
import type { RootCauseModelInput, RootCauseModelProvider } from '../model-provider.ts'
import type { RootCauseModelOutput } from '../types.ts'

function prompts(window: DiagnosticWindow) {
  return window.events.filter(
    (event): event is Extract<AgentEvent, { type: 'prompt' }> => event.type === 'prompt',
  )
}

function failedToolResults(window: DiagnosticWindow) {
  return window.events.filter(
    (event): event is Extract<AgentEvent, { type: 'tool_result' }> =>
      event.type === 'tool_result' && event.ok === false,
  )
}

function failedTests(window: DiagnosticWindow) {
  return window.events.filter(
    (event): event is Extract<AgentEvent, { type: 'test_result' }> =>
      event.type === 'test_result' && event.passed === false,
  )
}

function toolCalls(window: DiagnosticWindow) {
  return window.events.filter(
    (event): event is Extract<AgentEvent, { type: 'tool_call' }> => event.type === 'tool_call',
  )
}

function normalizePromptText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function conflictingPrompts(window: DiagnosticWindow) {
  const seen = new Map<string, Extract<AgentEvent, { type: 'prompt' }>>()
  const conflicts: Extract<AgentEvent, { type: 'prompt' }>[] = []

  for (const prompt of prompts(window)) {
    if (prompt.role !== 'user' && prompt.role !== 'developer' && prompt.role !== 'system') {
      continue
    }
    const normalized = normalizePromptText(prompt.text)
    if (normalized.length < 8) continue

    const existing = [...seen.values()].find(
      (other) => normalizePromptText(other.text) !== normalized,
    )
    if (existing) {
      if (!conflicts.find((item) => item.id === existing.id)) conflicts.push(existing)
      if (!conflicts.find((item) => item.id === prompt.id)) conflicts.push(prompt)
    } else {
      seen.set(normalized, prompt)
    }
  }

  return conflicts
}

function repeatedToolCalls(window: DiagnosticWindow) {
  const counts = new Map<string, Extract<AgentEvent, { type: 'tool_call' }>[]>()
  for (const call of toolCalls(window)) {
    const bucket = counts.get(call.toolName) ?? []
    bucket.push(call)
    counts.set(call.toolName, bucket)
  }
  for (const calls of counts.values()) {
    if (calls.length >= 3) return calls
  }
  return []
}

function lostContext(window: DiagnosticWindow): boolean {
  const trigger = window.events.find((event) => event.id === window.triggeringEventId)
  const userPrompt = prompts(window).find((event) => event.role === 'user')
  const modelBeforeRepeat = window.precedingContext.some((event) => event.type === 'model_response')
  if (!userPrompt) return false
  if (modelBeforeRepeat) return false
  if (trigger?.causal?.userInstructionEventId) return false
  return true
}

/**
 * Deterministic stand-in for an LLM — pattern-matches the bounded diagnostic window.
 * Used in tests and as the default offline provider.
 */
export function createMockRootCauseProvider(): RootCauseModelProvider {
  return {
    name: 'mock-deterministic',
    async analyze(input: RootCauseModelInput): Promise<RootCauseModelOutput> {
      const { window, loopFile } = input
      const affectedComponent = loopFile || 'unknown'

      const toolFailures = failedToolResults(window)
      if (toolFailures.length >= 2) {
        return {
          rootCauseType: 'repeated_tool_failure',
          title: 'Repeated tool failure',
          explanation:
            'Multiple tool executions failed before the file returned to a prior state, suggesting the agent retried without resolving the underlying tool error.',
          confidence: 0.84,
          affectedComponent,
          evidenceEventIds: toolFailures.slice(0, 2).map((event) => event.id),
        }
      }

      const tests = failedTests(window)
      if (tests.length >= 2 && window.fileWrites.length >= 3) {
        return {
          rootCauseType: 'test_feedback_oscillation',
          title: 'Test feedback oscillation',
          explanation:
            'Repeated failing test feedback appears to push the agent between incompatible file states.',
          confidence: 0.86,
          affectedComponent,
          evidenceEventIds: tests.slice(0, 2).map((event) => event.id),
        }
      }

      const conflicts = conflictingPrompts(window)
      if (conflicts.length >= 2) {
        return {
          rootCauseType: 'conflicting_instructions',
          title: 'Conflicting instructions',
          explanation:
            'The diagnostic window contains opposing user, developer, or system instructions that plausibly caused the agent to undo its own edits.',
          confidence: 0.88,
          affectedComponent,
          evidenceEventIds: conflicts.slice(0, 2).map((event) => event.id),
        }
      }

      const retries = repeatedToolCalls(window)
      if (retries.length >= 3) {
        return {
          rootCauseType: 'retry_strategy_failure',
          title: 'Retry strategy failure',
          explanation:
            'The agent repeated the same tool invocation multiple times without making durable progress.',
          confidence: 0.8,
          affectedComponent,
          evidenceEventIds: retries.slice(0, 3).map((event) => event.id),
        }
      }

      if (lostContext(window)) {
        const userPrompt = prompts(window).find((event) => event.role === 'user')
        return {
          rootCauseType: 'lost_context',
          title: 'Lost context',
          explanation:
            'A user instruction was present but the repeat write was not preceded by a model decision in the bounded window, suggesting context dropped before the revert.',
          confidence: 0.72,
          affectedComponent,
          evidenceEventIds: userPrompt ? [userPrompt.id] : [],
        }
      }

      return {
        rootCauseType: 'unknown',
        title: 'Unknown root cause',
        explanation:
          'The diagnostic window did not match a known repeated-file-state root cause pattern.',
        confidence: 0.2,
        affectedComponent,
        evidenceEventIds: [],
      }
    },
  }
}
