/**
 * Cursor Desktop hook payload shapes (stdin JSON).
 * Fields vary by event; adapters treat unknown extras as optional.
 */

export type CursorHookEventName =
  | 'sessionStart'
  | 'sessionEnd'
  | 'beforeSubmitPrompt'
  | 'afterFileEdit'
  | 'preToolUse'
  | 'postToolUse'
  | 'postToolUseFailure'
  | 'stop'
  | 'beforeShellExecution'
  | 'afterShellExecution'
  | string

export type CursorHookPayload = {
  hook_event_name?: CursorHookEventName
  conversation_id?: string
  generation_id?: string
  workspace_roots?: string[]
  /** beforeSubmitPrompt */
  prompt?: string
  /** afterFileEdit */
  file_path?: string
  edits?: Array<{ old_string?: string; new_string?: string }>
  /** tool hooks */
  tool_name?: string
  tool_input?: unknown
  tool_output?: unknown
  cwd?: string
  command?: string
  status?: string
  [key: string]: unknown
}

export type CursorSessionState = {
  conversationId: string
  runId: string
  startedAt: string
  agentId: string
}
