import { mergeCausalContext, sha256Hex } from '../../events.ts'
import type { AfterimageObserver, RecordableEvent, RecordResult } from '../../observer.ts'
import { retainFileContentFromEnv, stripFileWriteBodies } from '../../privacy.ts'
import type {
  CodexAssistantMessage,
  CodexRunResult,
  CodexSDKMessage,
  CodexSystemMessage,
  CodexThinkingMessage,
  CodexToolCallMessage,
  CodexUserMessage,
} from './types.ts'

export type CodexNormalizeContext = {
  /** afterimage run id — filled on each emitted RecordableEvent by the observer. */
  runId?: string
  /** User task recorded before the stream (may duplicate stream `user` echo). */
  taskText?: string
  model?: string
  cwd?: string
  /** Maps Codex tool call_id → Afterimage tool_call event id for causal links. */
  toolCallEventIds?: Map<string, string>
  /** Last user prompt event id on this run. */
  lastUserPromptEventId?: string
  /** Last model_response event id. */
  lastModelResponseEventId?: string
}

export type CodexNormalizeResult = {
  events: RecordableEvent[]
  context: CodexNormalizeContext
}

function textFromBlocks(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text!)
    .join('')
}

function pickString(record: unknown, keys: string[]): string | undefined {
  if (!record || typeof record !== 'object') return undefined
  for (const key of keys) {
    const value = (record as Record<string, unknown>)[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

function pickNumber(record: unknown, keys: string[]): number | undefined {
  if (!record || typeof record !== 'object') return undefined
  for (const key of keys) {
    const value = (record as Record<string, unknown>)[key]
    if (typeof value === 'number') return value
  }
  return undefined
}

function parseCommandFromShellArgs(args: unknown): string[] | null {
  const command = pickString(args, ['command'])
  if (command) return command.split(/\s+/).filter(Boolean)

  if (Array.isArray(args)) {
    return args.map(String).filter(Boolean)
  }

  if (args && typeof args === 'object') {
    const argv = (args as Record<string, unknown>).argv
    if (Array.isArray(argv)) return argv.map(String)
  }

  return null
}

function parseShellExitCode(result: unknown): number | null {
  const code = pickNumber(result, ['exitCode', 'exit_code', 'code'])
  return code ?? null
}

function looksLikeTestCommand(command: string[]): boolean {
  const joined = command.join(' ').toLowerCase()
  return (
    /\b(npm|pnpm|yarn|bun)\s+(test|run\s+test)\b/.test(joined) ||
    /\b(vitest|jest|pytest|cargo test|go test)\b/.test(joined) ||
    /\bnode --test\b/.test(joined)
  )
}

function fileWriteFromWriteTool(
  args: unknown,
  ok: boolean,
): Omit<Extract<RecordableEvent, { type: 'file_write' }>, 'id' | 'runId' | 'timestamp' | 'sequence'> | null {
  const path = pickString(args, ['path', 'file_path', 'filePath', 'relativePath'])
  const content = pickString(args, ['contents', 'content', 'body'])
  if (!path || content === undefined) return null

  return {
    type: 'file_write',
    path,
    content,
    hash: sha256Hex(content),
    byteLength: Buffer.byteLength(content, 'utf8'),
    ok,
  }
}

function fileWriteFromStrReplaceTool(
  args: unknown,
  ok: boolean,
): Omit<Extract<RecordableEvent, { type: 'file_write' }>, 'id' | 'runId' | 'timestamp' | 'sequence'> | null {
  const path = pickString(args, ['path', 'file_path', 'filePath'])
  const newString = pickString(args, ['new_string', 'newString', 'replace_string'])
  if (!path || newString === undefined) return null

  // StrReplace exposes a patch fragment, not guaranteed full file state.
  return {
    type: 'file_write',
    path,
    contentHashInput: newString,
    hash: sha256Hex(newString),
    byteLength: Buffer.byteLength(newString, 'utf8'),
    ok,
  }
}

function fileWriteFromTool(name: string, args: unknown, ok: boolean): RecordableEvent | null {
  const lower = name.toLowerCase()
  if (lower === 'write' || lower === 'writefile') {
    const draft = fileWriteFromWriteTool(args, ok)
    return draft ? (draft as RecordableEvent) : null
  }
  if (lower === 'strreplace' || lower === 'search_replace' || lower === 'apply_patch') {
    const draft = fileWriteFromStrReplaceTool(args, ok)
    return draft ? (draft as RecordableEvent) : null
  }
  return null
}

function normalizeSystem(message: CodexSystemMessage, ctx: CodexNormalizeContext): CodexNormalizeResult {
  const parts: string[] = []
  if (message.subtype === 'init') parts.push('Codex run initialized.')
  if (message.model?.id) {
    ctx.model = message.model.id
    parts.push(`model: ${message.model.id}`)
  }
  if (message.tools?.length) parts.push(`tools: ${message.tools.join(', ')}`)

  if (parts.length === 0) return { events: [], context: ctx }

  return {
    events: [
      {
        type: 'prompt',
        role: 'system',
        text: parts.join('\n'),
      },
    ],
    context: ctx,
  }
}

function normalizeUser(message: CodexUserMessage, ctx: CodexNormalizeContext): CodexNormalizeResult {
  const text = textFromBlocks(message.message.content)
  if (ctx.taskText && text.trim() === ctx.taskText.trim()) {
    return { events: [], context: ctx }
  }

  const event: RecordableEvent = {
    type: 'prompt',
    role: 'user',
    text,
  }
  return { events: [event], context: ctx }
}

function normalizeThinking(message: CodexThinkingMessage, ctx: CodexNormalizeContext): CodexNormalizeResult {
  return {
    events: [
      {
        type: 'model_response',
        model: ctx.model,
        text: '',
        reasonSummary: message.text,
        causal: ctx.lastUserPromptEventId
          ? { userInstructionEventId: ctx.lastUserPromptEventId }
          : undefined,
      },
    ],
    context: ctx,
  }
}

function normalizeAssistant(message: CodexAssistantMessage, ctx: CodexNormalizeContext): CodexNormalizeResult {
  const events: RecordableEvent[] = []
  const text = textFromBlocks(message.message.content)

  if (text.length > 0) {
    events.push({
      type: 'model_response',
      model: ctx.model,
      text,
      causal: ctx.lastUserPromptEventId
        ? { userInstructionEventId: ctx.lastUserPromptEventId }
        : undefined,
    })
  }

  // ToolUseBlock duplicates dedicated tool_call stream events — skip to avoid double recording.
  return { events, context: ctx }
}

function normalizeToolCall(message: CodexToolCallMessage, ctx: CodexNormalizeContext): CodexNormalizeResult {
  const events: RecordableEvent[] = []
  const toolCallEventIds = ctx.toolCallEventIds ?? new Map<string, string>()

  if (message.status === 'running') {
    events.push({
      type: 'tool_call',
      toolName: message.name,
      callId: message.call_id,
      arguments: message.args,
      causal: mergeCausalContext(
        ctx.lastUserPromptEventId
          ? { userInstructionEventId: ctx.lastUserPromptEventId }
          : undefined,
        ctx.lastModelResponseEventId
          ? { modelDecisionEventId: ctx.lastModelResponseEventId, causedByEventIds: [ctx.lastModelResponseEventId] }
          : undefined,
      ),
    })
    return { events, context: { ...ctx, toolCallEventIds } }
  }

  const ok = message.status === 'completed'
  events.push({
    type: 'tool_result',
    toolName: message.name,
    callId: message.call_id,
    ok,
    output: message.result,
    causal: toolCallEventIds.has(message.call_id)
      ? { causedByEventIds: [toolCallEventIds.get(message.call_id)!] }
      : undefined,
  })

  const fileWrite = fileWriteFromTool(message.name, message.args, ok)
  if (fileWrite) {
    events.push({
      ...fileWrite,
      causal: mergeCausalContext(
        toolCallEventIds.has(message.call_id)
          ? { causedByEventIds: [toolCallEventIds.get(message.call_id)!] }
          : undefined,
        ctx.lastModelResponseEventId
          ? { modelDecisionEventId: ctx.lastModelResponseEventId }
          : undefined,
      ),
    })
  }

  const shellName = message.name.toLowerCase()
  if (shellName === 'shell' && message.status === 'completed') {
    const command = parseCommandFromShellArgs(message.args)
    if (command?.length) {
      events.push({
        type: 'process_start',
        command,
        cwd: ctx.cwd ?? process.cwd(),
      })

      const exitCode = parseShellExitCode(message.result)
      events.push({
        type: 'process_end',
        exitCode,
        signal: null,
      })

      if (looksLikeTestCommand(command)) {
        events.push({
          type: 'test_result',
          name: command.join(' '),
          passed: exitCode === 0,
          output: typeof message.result === 'string' ? message.result : JSON.stringify(message.result ?? ''),
        })
      }
    }
  }

  if (message.status === 'error') {
    events.push({
      type: 'error',
      message: `Tool ${message.name} failed`,
      code: 'codex_tool_error',
    })
  }

  return { events, context: ctx }
}

function normalizeStatus(message: Extract<CodexSDKMessage, { type: 'status' }>): CodexNormalizeResult {
  if (message.status !== 'ERROR') return { events: [], context: {} }
  return {
    events: [
      {
        type: 'error',
        message: message.message ?? `Codex run status: ${message.status}`,
        code: message.status,
      },
    ],
    context: {},
  }
}

/** Map one Codex SDK stream message to zero or more Afterimage RecordableEvents. */
export function codexMessageToRecordableEvents(
  message: CodexSDKMessage,
  context: CodexNormalizeContext = {},
): CodexNormalizeResult {
  switch (message.type) {
    case 'system':
      return normalizeSystem(message, context)
    case 'user':
      return normalizeUser(message, context)
    case 'assistant':
      return normalizeAssistant(message, context)
    case 'thinking':
      return normalizeThinking(message, context)
    case 'tool_call':
      return normalizeToolCall(message, context)
    case 'status':
      return normalizeStatus(message)
    case 'task':
    case 'request':
    case 'usage':
      return { events: [], context }
    default:
      return { events: [], context }
  }
}

/** Apply post-stream terminal result (`run.wait()`). */
export function codexRunResultToRecordableEvents(result: CodexRunResult): RecordableEvent[] {
  const events: RecordableEvent[] = []
  if (result.status === 'error' && result.error) {
    events.push({
      type: 'error',
      message: result.error.message,
      code: result.error.code ?? 'codex_run_error',
    })
  }
  if (result.result && result.result.trim().length > 0) {
    events.push({
      type: 'model_response',
      model: result.model?.id,
      text: result.result,
    })
  }
  return events
}

/** Ensure file_write drafts include a SHA-256 hash before observer.record(). */
export function finalizeFileWriteDraft(
  event: RecordableEvent,
  retainFileContent = false,
): RecordableEvent {
  if (event.type !== 'file_write') return event

  let prepared: RecordableEvent = event
  if (!event.hash) {
    const hashSource = event.content ?? event.contentHashInput
    if (hashSource === undefined) {
      throw new Error(`file_write for ${event.path} missing content or contentHashInput`)
    }
    prepared = {
      ...event,
      hash: sha256Hex(hashSource),
      byteLength: event.byteLength ?? Buffer.byteLength(hashSource, 'utf8'),
    }
  }

  return stripFileWriteBodies(prepared, retainFileContent)
}

export async function recordNormalizedEvents(
  observer: AfterimageObserver,
  events: RecordableEvent[],
  context: CodexNormalizeContext,
  retainFileContent?: boolean,
): Promise<{ results: RecordResult[]; context: CodexNormalizeContext }> {
  const results: RecordResult[] = []
  let ctx = { ...context, toolCallEventIds: context.toolCallEventIds ?? new Map<string, string>() }
  const retain = retainFileContent ?? retainFileContentFromEnv()

  for (const draft of events) {
    const prepared = finalizeFileWriteDraft(draft, retain)

    const recorded = await observer.record(prepared)
    results.push(recorded)

    if (recorded.event.type === 'prompt' && recorded.event.role === 'user') {
      ctx = { ...ctx, lastUserPromptEventId: recorded.event.id }
    }
    if (recorded.event.type === 'model_response') {
      ctx = { ...ctx, lastModelResponseEventId: recorded.event.id }
    }
    if (recorded.event.type === 'tool_call' && recorded.event.callId) {
      ctx.toolCallEventIds!.set(recorded.event.callId, recorded.event.id)
    }
  }

  return { results, context: ctx }
}
