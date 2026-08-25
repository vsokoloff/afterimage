/**
 * Minimal GenAI span shapes Afterimage accepts after OTLP decode.
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

export type AfterimageOtelSpan = {
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

export type AfterimageOtelResource = {
  attributes?: OtelAttributes
}

export type AfterimageOtelScopeSpans = {
  spans?: AfterimageOtelSpan[]
}

export type AfterimageOtelResourceSpans = {
  resource?: AfterimageOtelResource
  scopeSpans?: AfterimageOtelScopeSpans[]
}

/** @deprecated Use AfterimageOtelSpan */
export type LucidOtelSpan = AfterimageOtelSpan
/** @deprecated Use AfterimageOtelResource */
export type LucidOtelResource = AfterimageOtelResource
/** @deprecated Use AfterimageOtelScopeSpans */
export type LucidOtelScopeSpans = AfterimageOtelScopeSpans
/** @deprecated Use AfterimageOtelResourceSpans */
export type LucidOtelResourceSpans = AfterimageOtelResourceSpans

/** Decoded OTLP ExportTraceServiceRequest (JSON). */
export type OtlpExportTraceServiceRequest = {
  resourceSpans?: AfterimageOtelResourceSpans[]
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
   * How to group spans into afterimage runs when used by the receiver.
   * Normalizer itself returns events; correlation keys are attached via options callbacks.
   */
  groupBy?: 'trace' | 'conversation'
}

export type OtelNormalizeContext = {
  /** Maps OTEL spanId → Afterimage event id after record (filled by ingest layer). */
  spanEventIds?: Map<string, string>
  /** Last prompt / model event ids for causal hints within a batch. */
  lastPromptEventId?: string
  lastModelResponseEventId?: string
}
