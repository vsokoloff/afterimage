/**
 * Minimal mirror of `@cursor/sdk` stream types (`SDKMessage`, `RunResult`).
 * Afterimage does not depend on `@cursor/sdk` — these shapes match the public docs
 * so recorded fixtures and live streams share one normalization path.
 *
 * @see https://cursor.com/docs/sdk/typescript#stream-events
 */

export type CodexTextBlock = {
  type: 'text'
  text: string
}

export type CodexToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export type CodexModelSelection = {
  id: string
  provider?: string
}

export type CodexSystemMessage = {
  type: 'system'
  subtype?: 'init'
  agent_id: string
  run_id: string
  model?: CodexModelSelection
  tools?: string[]
}

export type CodexUserMessage = {
  type: 'user'
  agent_id: string
  run_id: string
  message: { role: 'user'; content: CodexTextBlock[] }
}

export type CodexAssistantMessage = {
  type: 'assistant'
  agent_id: string
  run_id: string
  message: {
    role: 'assistant'
    content: Array<CodexTextBlock | CodexToolUseBlock>
  }
}

export type CodexThinkingMessage = {
  type: 'thinking'
  agent_id: string
  run_id: string
  text: string
  thinking_duration_ms?: number
}

export type CodexToolCallMessage = {
  type: 'tool_call'
  agent_id: string
  run_id: string
  call_id: string
  name: string
  status: 'running' | 'completed' | 'error'
  args?: unknown
  result?: unknown
  truncated?: { args?: boolean; result?: boolean }
}

export type CodexStatusMessage = {
  type: 'status'
  agent_id: string
  run_id: string
  status: 'CREATING' | 'RUNNING' | 'FINISHED' | 'ERROR' | 'CANCELLED' | 'EXPIRED'
  message?: string
}

export type CodexTaskMessage = {
  type: 'task'
  agent_id: string
  run_id: string
  status?: string
  text?: string
}

export type CodexRequestMessage = {
  type: 'request'
  agent_id: string
  run_id: string
  request_id: string
}

export type CodexUsageMessage = {
  type: 'usage'
  agent_id: string
  run_id: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
  }
}

/** Normalized Codex stream event (`run.stream()`). */
export type CodexSDKMessage =
  | CodexSystemMessage
  | CodexUserMessage
  | CodexAssistantMessage
  | CodexThinkingMessage
  | CodexToolCallMessage
  | CodexStatusMessage
  | CodexTaskMessage
  | CodexRequestMessage
  | CodexUsageMessage

export type CodexRunError = {
  message: string
  code?: string
}

/** Terminal result from `run.wait()`. */
export type CodexRunResult = {
  id: string
  requestId?: string
  status: 'finished' | 'error' | 'cancelled'
  result?: string
  error?: CodexRunError
  model?: CodexModelSelection
  durationMs?: number
}
