import type {
  LucidOtelResourceSpans,
  LucidOtelSpan,
  OtelAttributeValue,
  OtelAttributes,
  OtlpExportTraceServiceRequest,
} from './types.ts'

type OtlpAnyValue = {
  stringValue?: string
  boolValue?: boolean
  intValue?: number | string
  doubleValue?: number
  arrayValue?: { values?: OtlpAnyValue[] }
  kvlistValue?: { values?: OtlpKeyValue[] }
}

type OtlpKeyValue = {
  key?: string
  value?: OtlpAnyValue
}

function unwrapAnyValue(value: OtlpAnyValue | undefined): OtelAttributeValue {
  if (!value || typeof value !== 'object') return undefined
  if (typeof value.stringValue === 'string') return value.stringValue
  if (typeof value.boolValue === 'boolean') return value.boolValue
  if (value.intValue !== undefined) {
    const n = typeof value.intValue === 'number' ? value.intValue : Number(value.intValue)
    return Number.isFinite(n) ? n : String(value.intValue)
  }
  if (typeof value.doubleValue === 'number') return value.doubleValue
  if (value.arrayValue?.values) {
    return value.arrayValue.values.map((item) => {
      const unwrapped = unwrapAnyValue(item)
      if (typeof unwrapped === 'string') return unwrapped
      if (typeof unwrapped === 'number') return unwrapped
      if (typeof unwrapped === 'boolean') return unwrapped
      return String(unwrapped ?? '')
    }) as string[] | number[] | boolean[]
  }
  if (value.kvlistValue?.values) {
    try {
      return JSON.stringify(attributesFromOtlpList(value.kvlistValue.values))
    } catch {
      return undefined
    }
  }
  return undefined
}

function attributesFromOtlpList(list: OtlpKeyValue[] | undefined): OtelAttributes {
  const out: OtelAttributes = {}
  if (!list) return out
  for (const item of list) {
    if (!item?.key) continue
    out[item.key] = unwrapAnyValue(item.value)
  }
  return out
}

function asAttributes(raw: unknown): OtelAttributes | undefined {
  if (!raw) return undefined
  if (Array.isArray(raw)) {
    return attributesFromOtlpList(raw as OtlpKeyValue[])
  }
  if (typeof raw === 'object') {
    return raw as OtelAttributes
  }
  return undefined
}

function decodeSpan(raw: Record<string, unknown>): LucidOtelSpan | null {
  const traceId = typeof raw.traceId === 'string' ? raw.traceId : undefined
  const spanId = typeof raw.spanId === 'string' ? raw.spanId : undefined
  if (!traceId || !spanId) return null

  const parentSpanId =
    typeof raw.parentSpanId === 'string' && raw.parentSpanId.length > 0
      ? raw.parentSpanId
      : undefined

  const statusRaw = raw.status
  let status: LucidOtelSpan['status']
  if (statusRaw && typeof statusRaw === 'object') {
    const record = statusRaw as Record<string, unknown>
    const code = record.code
    status = {
      code:
        code === 0 ||
        code === 1 ||
        code === 2 ||
        code === 'UNSET' ||
        code === 'OK' ||
        code === 'ERROR'
          ? code
          : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
    }
  }

  return {
    traceId,
    spanId,
    parentSpanId,
    name: typeof raw.name === 'string' ? raw.name : '',
    kind: raw.kind as number | string | undefined,
    startTimeUnixNano:
      typeof raw.startTimeUnixNano === 'string' || typeof raw.startTimeUnixNano === 'number'
        ? raw.startTimeUnixNano
        : undefined,
    endTimeUnixNano:
      typeof raw.endTimeUnixNano === 'string' || typeof raw.endTimeUnixNano === 'number'
        ? raw.endTimeUnixNano
        : undefined,
    attributes: asAttributes(raw.attributes),
    status,
  }
}

/**
 * Normalize an OTLP/HTTP JSON ExportTraceServiceRequest body into Afterimage shapes.
 * Accepts both OTLP KeyValue attribute arrays and already-flat attribute maps.
 */
export function decodeOtlpJsonTraceRequest(body: unknown): OtlpExportTraceServiceRequest {
  if (!body || typeof body !== 'object') {
    return { resourceSpans: [] }
  }

  const root = body as Record<string, unknown>
  const resourceSpansRaw = root.resourceSpans
  if (!Array.isArray(resourceSpansRaw)) {
    return { resourceSpans: [] }
  }

  const resourceSpans: LucidOtelResourceSpans[] = []
  for (const rs of resourceSpansRaw) {
    if (!rs || typeof rs !== 'object') continue
    const rsRecord = rs as Record<string, unknown>
    const resourceRaw = rsRecord.resource
    let resource: LucidOtelResourceSpans['resource']
    if (resourceRaw && typeof resourceRaw === 'object') {
      resource = {
        attributes: asAttributes((resourceRaw as Record<string, unknown>).attributes),
      }
    }

    const scopeSpansRaw = rsRecord.scopeSpans
    const scopeSpans: NonNullable<LucidOtelResourceSpans['scopeSpans']> = []
    if (Array.isArray(scopeSpansRaw)) {
      for (const scope of scopeSpansRaw) {
        if (!scope || typeof scope !== 'object') continue
        const spansRaw = (scope as Record<string, unknown>).spans
        const spans: LucidOtelSpan[] = []
        if (Array.isArray(spansRaw)) {
          for (const span of spansRaw) {
            if (!span || typeof span !== 'object') continue
            const decoded = decodeSpan(span as Record<string, unknown>)
            if (decoded) spans.push(decoded)
          }
        }
        scopeSpans.push({ spans })
      }
    }

    resourceSpans.push({ resource, scopeSpans })
  }

  return { resourceSpans }
}
