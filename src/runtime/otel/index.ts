export type {
  GenAiOperationName,
  LucidOtelResource,
  LucidOtelResourceSpans,
  LucidOtelScopeSpans,
  LucidOtelSpan,
  NormalizeOtelOptions,
  OtelAttributeValue,
  OtelAttributes,
  OtelNormalizeContext,
  OtelSpanStatus,
  OtelSpanStatusCode,
  OtlpExportTraceServiceRequest,
} from './types.ts'

export {
  attrNumber,
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

export { decodeOtlpJsonTraceRequest } from './decode.ts'

export {
  flattenOtlpTraceRequest,
  otelSpansToRecordableEvents,
  otlpRequestToRecordableEvents,
  type OtelNormalizeResult,
  type OtelSpanBatch,
} from './normalize.ts'

export {
  startOtlpHttpServer,
  type OtelGroupBy,
  type OtlpHttpServer,
  type OtlpHttpServerOptions,
} from './otlp-http.ts'

export { parseOtelArgv, type ParsedOtelArgv } from './parse.ts'
