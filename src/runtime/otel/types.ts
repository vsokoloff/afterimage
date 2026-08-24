/**
 * Minimal GenAI span shapes Lucid accepts after OTLP decode.
 * Attributes are a flat string-keyed map (OTLP AnyValue already unwrapped).
 */

export type OtelAttributeValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[]
  | null
  | undefined

export type OtelAttributes = Record<string, OtelAttributeValue>

/** Span status codes aligned with OTLP (UNSET=0, OK=1, ERROR=2). */
export type OtelSpanStatusCode = 0 | 1 | 2 | 'UNSET' | 'OK' | 'ERROR'

export type OtelSpanStatus = {
  code?: OtelSpanStatusCode
  message?: string
}

export type LucidOtelSpan = {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind?: number | string
  startTimeUnixNano?: string | number
  endTimeUnixNano?: string | number
  attributes?: OtelAttributes
  status?: OtelSpanStatus
}

export type LucidOtelResource = {
  attributes?: OtelAttributes
}

export type LucidOtelScopeSpans = {
  spans?: LucidOtelSpan[]
}

export type LucidOtelResourceSpans = {
  resource?: LucidOtelResource
  scopeSpans?: LucidOtelScopeSpans[]
}

/** Decoded OTLP ExportTraceServiceRequest (JSON). */
export type OtlpExportTraceServiceRequest = {
  resourceSpans?: LucidOtelResourceSpans[]
}

export type GenAiOperationName =
  | 'chat'
  | 'generate_content'
  | 'text_completion'
  | 'embeddings'
  | 'execute_tool'
  | 'create_agent'
  | 'invoke_agent'
  | 'invoke_workflow'
  | 'plan'
  | 'retrieval'
  | string

export type NormalizeOtelOptions = {
  /**
   * How to group spans into Lucid runs when used by the receiver.
   * Normalizer itself returns events; correlation keys are attached via options callbacks.
   */
  groupBy?: 'trace' | 'conversation'
}

export type OtelNormalizeContext = {
  /** Maps OTEL spanId → Lucid event id after record (filled by ingest layer). */
  spanEventIds?: Map<string, string>
  /** Last prompt / model event ids for causal hints within a batch. */
  lastPromptEventId?: string
  lastModelResponseEventId?: string
}
