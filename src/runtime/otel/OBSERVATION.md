# OpenTelemetry GenAI → Afterimage observation

Afterimage's **universal** runtime adapter accepts OTLP/HTTP GenAI traces and maps them to the same `RecordableEvent → AfterimageObserver → AgentEvent` path as process and Codex adapters. Detectors never import OTEL types.

Implementation: `src/runtime/otel/`.

Canonical GenAI conventions: [semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai). Conventions remain Development; Afterimage coalesces legacy attribute names.

## What the adapter observes

| GenAI / OTEL source | Afterimage `AgentEvent` | Notes |
|---|---|---|
| `invoke_agent` / `invoke_workflow` / `create_agent` | run boundary + optional `prompt` | Prompt only when `gen_ai.input.messages` or `gen_ai.system_instructions` present |
| `chat` / `generate_content` / `text_completion` | `model_response` | Model, provider, tokens, `responseId`, `finishReasons`; text from opted-in output messages |
| `execute_tool` | `tool_call` + `tool_result` | `gen_ai.tool.name`, `gen_ai.tool.call.id`, args/result when present |
| File-like tool (`Write`, `write_file`, …) with path+content | also `file_write` | Hash from content; required for loop detection |
| Span status ERROR | `error` | Plus tool/model failure paths |
| Parent `spanId` | `causal.causedByEventIds` | When parent span already mapped |

## Attribute coalesce (never sum duplicates)

| Prefer | Fallback |
|---|---|
| `gen_ai.provider.name` | `gen_ai.system` |
| `gen_ai.usage.input_tokens` | `gen_ai.usage.prompt_tokens` |
| `gen_ai.usage.output_tokens` | `gen_ai.usage.completion_tokens` |

## Correlation

Default: **one OTEL `trace_id` = one Afterimage `AgentRun`**. Optional: group by `gen_ai.conversation.id` (`--group-by conversation`).

`gen_ai.agent.id` / `gen_ai.agent.name` → `AgentRun.agentId` when starting the run.

## What it cannot observe

| Gap | Why |
|---|---|
| **OTLP/gRPC `:4317`** | v1 is HTTP JSON on `:4318` only — use a Collector to convert |
| **OTLP protobuf** | Returns 415; send `application/json` |
| **Metrics / logs** | Not AgentEvent sources in v1 |
| **`embeddings` / `retrieval`** | Ignored |
| **Full file state without content attrs** | Loop detector needs path + content (or hash input) on the tool span |
| **IDE-only Cursor chat** | Use a Cursor host adapter when available; OTEL only sees what frameworks export |
| **Stable content without capture opt-in** | Empty `model_response.text` / omitted tool args when exporters redact content |

## Usage

```sh
npm run afterimage -- otel
# OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
# POST /v1/traces  (application/json)
```

```typescript
import { otelSpansToRecordableEvents, startOtlpHttpServer } from './runtime/otel/index.ts'
```

## Detector independence

Shipped detectors read `AgentRun.events` only. Whether events came from process, Codex, OTEL, or tests is invisible to `detect()` / `diagnose()` / `verify()`.
