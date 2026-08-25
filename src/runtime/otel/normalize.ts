import { mergeCausalContext, sha256Hex } from '../../events.ts'
import type { RecordableEvent } from '../../observer.ts'
import {
  attrString,
  attrStringArray,
  coalesceAgentId,
  coalesceConversationId,
  coalesceErrorType,
  coalesceInputTokens,
  coalesceModel,
  coalesceOperationName,
  coalesceOutputTokens,
  coalesceProvider,
  coalesceToolCallId,
  coalesceToolName,
  parseJsonAttr,
} from './coalesce.ts'
import type {
  LucidOtelSpan,
  OtelAttributes,
  OtelSpanStatus,
  OtlpExportTraceServiceRequest,
} from './types.ts'

const MODEL_OPS = new Set(['chat', 'generate_content', 'text_completion'])
const AGENT_OPS = new Set(['invoke_agent', 'invoke_workflow', 'create_agent'])
const FILE_WRITE_TOOL_NAMES = new Set([
  'write',
  'write_file',
  'writefile',
  'strreplace',
  'apply_patch',
  'create_file',
  'edit_file',
])

export type OtelSpanBatch = {
  spans: LucidOtelSpan[]
  /** Resource-level attributes merged under each span when missing. */
  resourceAttributes?: OtelAttributes
}

export type OtelNormalizeResult = {
  events: RecordableEvent[]
  /** Suggested Afterimage agent id from GenAI agent/conversation attrs. */
  agentId?: string
  conversationId?: string
  traceId?: string
  /** True when a root agent/workflow span ended (for receiver finishRun). */
  rootAgentSpanEnded: boolean
  /** True when any mapped span had ERROR status. */
  hadError: boolean
}

function isErrorStatus(status: OtelSpanStatus | undefined): boolean {
  if (!status?.code) return false
  return status.code === 2 || status.code === 'ERROR'
}

function nanoToIso(nano: string | number | undefined): string | undefined {
  if (nano === undefined) return undefined
  const asBig = typeof nano === 'bigint' ? nano : BigInt(String(nano))
  if (asBig <= 0n) return undefined
  const ms = Number(asBig / 1_000_000n)
  if (!Number.isFinite(ms)) return undefined
  return new Date(ms).toISOString()
}

function mergeAttrs(
  resource: OtelAttributes | undefined,
  span: OtelAttributes | undefined,
): OtelAttributes {
  return { ...(resource ?? {}), ...(span ?? {}) }
}

function textFromMessages(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) {
    if (typeof value === 'object' && value !== null && 'content' in value) {
      return textFromMessages((value as { content: unknown }).content)
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  const parts: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      parts.push(item)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const content = record.content ?? record.text ?? record.parts
    if (typeof content === 'string') {
      parts.push(content)
      continue
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') parts.push(part)
        else if (part && typeof part === 'object' && 'text' in part) {
          parts.push(String((part as { text: unknown }).text ?? ''))
        }
      }
      continue
    }
    if (typeof record.role === 'string' && typeof record.content === 'string') {
      parts.push(record.content)
    }
  }
  return parts.filter(Boolean).join('\n')
}

function looksLikeFileWriteTool(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (FILE_WRITE_TOOL_NAMES.has(normalized)) return true
  return (
    normalized.includes('write_file') ||
    normalized === 'write' ||
    normalized.endsWith('.write')
  )
}

function pickPathAndContent(args: unknown): {
  path?: string
  content?: string
} {
  if (!args || typeof args !== 'object') return {}
  const record = args as Record<string, unknown>
  const pathKeys = ['path', 'file', 'file_path', 'filepath', 'filename', 'target']
  const contentKeys = ['content', 'contents', 'text', 'body', 'new_string', 'newString']

  let path: string | undefined
  let content: string | undefined
  for (const key of pathKeys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) {
      path = value
      break
    }
  }
  for (const key of contentKeys) {
    const value = record[key]
    if (typeof value === 'string') {
      content = value
      break
    }
  }
  return { path, content }
}

function spanSortKey(span: LucidOtelSpan): bigint {
  try {
    return BigInt(String(span.startTimeUnixNano ?? 0))
  } catch {
    return 0n
  }
}

/**
 * Flatten an OTLP ExportTraceServiceRequest into Afterimage spans with merged resource attrs.
 */
export function flattenOtlpTraceRequest(
  request: OtlpExportTraceServiceRequest,
): OtelSpanBatch[] {
  const batches: OtelSpanBatch[] = []
  for (const resourceSpan of request.resourceSpans ?? []) {
    const resourceAttributes = resourceSpan.resource?.attributes
    const spans: LucidOtelSpan[] = []
    for (const scope of resourceSpan.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        spans.push(span)
      }
    }
    if (spans.length > 0) {
      batches.push({ spans, resourceAttributes })
    }
  }
  return batches
}

/**
 * Map GenAI spans → RecordableEvent[] (observer fills id/runId/sequence).
 * Ignores embeddings and unknown non-agent ops without gen_ai.operation.name.
 */
export function otelSpansToRecordableEvents(
  spans: LucidOtelSpan[],
  options: { resourceAttributes?: OtelAttributes } = {},
): OtelNormalizeResult {
  const sorted = [...spans].sort((a, b) => {
    const delta = spanSortKey(a) - spanSortKey(b)
    if (delta < 0n) return -1
    if (delta > 0n) return 1
    return a.spanId.localeCompare(b.spanId)
  })

  const events: RecordableEvent[] = []
  const spanIdToEventIds = new Map<string, string[]>()
  let agentId: string | undefined
  let conversationId: string | undefined
  let traceId: string | undefined
  let rootAgentSpanEnded = false
  let hadError = false
  let eventCounter = 0

  const provisionalId = (spanId: string, suffix: string): string => {
    eventCounter += 1
    return `otel:${spanId}:${suffix}:${eventCounter}`
  }

  const remember = (spanId: string, eventId: string) => {
    const list = spanIdToEventIds.get(spanId) ?? []
    list.push(eventId)
    spanIdToEventIds.set(spanId, list)
  }

  const parentCausal = (parentSpanId: string | undefined) => {
    if (!parentSpanId) return undefined
    const parentIds = spanIdToEventIds.get(parentSpanId)
    if (!parentIds || parentIds.length === 0) return undefined
    return mergeCausalContext(undefined, {
      causedByEventIds: [parentIds[parentIds.length - 1]!],
    })
  }

  for (const span of sorted) {
    traceId = traceId ?? span.traceId
    const attrs = mergeAttrs(options.resourceAttributes, span.attributes)
    const operation = coalesceOperationName(attrs)
    const timestamp = nanoToIso(span.startTimeUnixNano) ?? nanoToIso(span.endTimeUnixNano)
    const err = isErrorStatus(span.status)
    if (err) hadError = true

    const nextAgent = coalesceAgentId(attrs)
    if (nextAgent) agentId = agentId ?? nextAgent
    const nextConversation = coalesceConversationId(attrs)
    if (nextConversation) conversationId = conversationId ?? nextConversation

    if (!operation) {
      if (err) {
        const id = provisionalId(span.spanId, 'error')
        events.push({
          type: 'error',
          id,
          timestamp,
          message: span.status?.message || coalesceErrorType(attrs) || span.name || 'span error',
          code: coalesceErrorType(attrs),
          causal: parentCausal(span.parentSpanId),
        })
        remember(span.spanId, id)
      }
      continue
    }

    if (operation === 'embeddings' || operation === 'retrieval') {
      continue
    }

    if (AGENT_OPS.has(operation)) {
      const inputMessages = parseJsonAttr(attrs['gen_ai.input.messages'])
      const systemInstructions = parseJsonAttr(attrs['gen_ai.system_instructions'])
      const promptText =
        textFromMessages(inputMessages) || textFromMessages(systemInstructions)
      if (promptText) {
        const id = provisionalId(span.spanId, 'prompt')
        events.push({
          type: 'prompt',
          id,
          timestamp,
          role: systemInstructions ? 'system' : 'user',
          text: promptText,
          causal: parentCausal(span.parentSpanId),
        })
        remember(span.spanId, id)
      }
      // Boundary-only spans (no content) do not emit events; children link to grandparents.
      if (span.endTimeUnixNano !== undefined) rootAgentSpanEnded = true
      if (err) {
        const id = provisionalId(span.spanId, 'error')
        events.push({
          type: 'error',
          id,
          timestamp: nanoToIso(span.endTimeUnixNano) ?? timestamp,
          message: span.status?.message || `${operation} failed`,
          code: coalesceErrorType(attrs),
          causal: parentCausal(span.parentSpanId),
        })
        remember(span.spanId, id)
      }
      continue
    }

    if (MODEL_OPS.has(operation)) {
      const outputMessages = parseJsonAttr(attrs['gen_ai.output.messages'])
      const text = textFromMessages(outputMessages)
      const id = provisionalId(span.spanId, 'model')
      events.push({
        type: 'model_response',
        id,
        timestamp,
        model: coalesceModel(attrs),
        text,
        provider: coalesceProvider(attrs),
        inputTokens: coalesceInputTokens(attrs),
        outputTokens: coalesceOutputTokens(attrs),
        responseId: attrString(attrs, 'gen_ai.response.id'),
        finishReasons: attrStringArray(attrs, 'gen_ai.response.finish_reasons'),
        causal: parentCausal(span.parentSpanId),
      })
      remember(span.spanId, id)
      if (err) {
        const errId = provisionalId(span.spanId, 'error')
        events.push({
          type: 'error',
          id: errId,
          timestamp: nanoToIso(span.endTimeUnixNano) ?? timestamp,
          message: span.status?.message || `${operation} error`,
          code: coalesceErrorType(attrs),
          causal: mergeCausalContext(undefined, { causedByEventIds: [id] }),
        })
        remember(span.spanId, errId)
      }
      continue
    }

    if (operation === 'execute_tool') {
      const toolName = coalesceToolName(attrs) || span.name.replace(/^execute_tool\s+/i, '') || 'tool'
      const callId = coalesceToolCallId(attrs) || span.spanId
      const argsRaw = parseJsonAttr(attrs['gen_ai.tool.call.arguments'])
      const resultRaw = parseJsonAttr(attrs['gen_ai.tool.call.result'])
      const callEventId = provisionalId(span.spanId, 'tool_call')
      events.push({
        type: 'tool_call',
        id: callEventId,
        timestamp,
        toolName,
        callId,
        arguments: argsRaw,
        causal: parentCausal(span.parentSpanId),
      })
      remember(span.spanId, callEventId)

      const resultOk = !err
      const resultEventId = provisionalId(span.spanId, 'tool_result')
      events.push({
        type: 'tool_result',
        id: resultEventId,
        timestamp: nanoToIso(span.endTimeUnixNano) ?? timestamp,
        toolName,
        callId,
        ok: resultOk,
        output: resultRaw,
        causal: mergeCausalContext(parentCausal(span.parentSpanId), {
          causedByEventIds: [callEventId],
        }),
      })
      remember(span.spanId, resultEventId)

      if (looksLikeFileWriteTool(toolName)) {
        const fromArgs = pickPathAndContent(argsRaw)
        const fromResult = pickPathAndContent(resultRaw)
        const path = fromArgs.path ?? fromResult.path
        const content = fromArgs.content ?? fromResult.content
        if (path && content !== undefined) {
          const writeId = provisionalId(span.spanId, 'file_write')
          events.push({
            type: 'file_write',
            id: writeId,
            timestamp: nanoToIso(span.endTimeUnixNano) ?? timestamp,
            path,
            content,
            hash: sha256Hex(content),
            ok: resultOk,
            causal: mergeCausalContext(undefined, {
              causedByEventIds: [resultEventId],
            }),
          })
          remember(span.spanId, writeId)
        }
      }

      if (err) {
        const errId = provisionalId(span.spanId, 'error')
        events.push({
          type: 'error',
          id: errId,
          timestamp: nanoToIso(span.endTimeUnixNano) ?? timestamp,
          message: span.status?.message || `tool ${toolName} failed`,
          code: coalesceErrorType(attrs),
          causal: mergeCausalContext(undefined, { causedByEventIds: [callEventId] }),
        })
        remember(span.spanId, errId)
      }
      continue
    }

    // plan and other ops: metadata-only skip unless error
    if (err) {
      const id = provisionalId(span.spanId, 'error')
      events.push({
        type: 'error',
        id,
        timestamp,
        message: span.status?.message || `${operation} error`,
        code: coalesceErrorType(attrs),
        causal: parentCausal(span.parentSpanId),
      })
      remember(span.spanId, id)
    }
  }

  // Observer prefers to assign ids when omitted; we keep provisional ids so
  // causal.causedByEventIds resolve when the ingest layer records in order.

  return {
    events,
    agentId,
    conversationId,
    traceId,
    rootAgentSpanEnded,
    hadError,
  }
}

export function otlpRequestToRecordableEvents(
  request: OtlpExportTraceServiceRequest,
): OtelNormalizeResult {
  const batches = flattenOtlpTraceRequest(request)
  const allSpans: LucidOtelSpan[] = []
  let resourceAttributes: OtelAttributes | undefined
  for (const batch of batches) {
    resourceAttributes = resourceAttributes ?? batch.resourceAttributes
    allSpans.push(...batch.spans)
  }
  return otelSpansToRecordableEvents(allSpans, { resourceAttributes })
}
