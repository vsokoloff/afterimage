# Afterimage ingestion standard

Afterimage's durable observation contract is **`AgentEvent`**, not any host SDK and not raw OpenTelemetry. Every source normalizes into `RecordableEvent` and feeds `LucidObserver`. Detectors read `AgentRun.events` only; they never import adapters.

## Canonical sink

```text
adapter / OTEL normalize
        │
        ▼
LucidObserver.startRun(input?)
        │
        ▼
observer.record(RecordableEvent)   // fills id / runId / timestamp / sequence
        │
        ▼
.jsonl store + shipped detectors → incidents
        │
        ▼
observer.finishRun(status)
```

Call `startRun` → `record` → `finishRun` from any host. Optional fields on `RecordableEvent` (`id`, `runId`, `timestamp`, `sequence`) may be omitted; the observer fills them.

## Adapter tiers

### First-party (host-specific)

| Adapter | Status | Role |
|---------|--------|------|
| **process** | Shipped | `afterimage run -- <cmd>` + filesystem watcher → process + `file_write` |
| **Codex SDK** | Shipped | `run.stream()` → prompts, model, tools, writes |
| **Cursor Desktop hooks** | Shipped | `afterimage attach cursor` → `.cursor/hooks` → AgentEvent |
| **Claude / Anthropic SDK** | Reserved | Anthropic Messages / tool use streams |
| **OpenAI Responses** | Reserved | Responses API function-call loops |

Keep these when Afterimage needs deeper fidelity than GenAI spans provide (full post-write file state, sandbox paths, host-only approvals).

### Universal (OpenTelemetry GenAI)

| Adapter | Status | Role |
|---------|--------|------|
| **OTEL GenAI** | Shipped (v1) | OTLP/HTTP traces with `gen_ai.*` → same `RecordableEvent` path |

Any framework that emits [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai) can feed Afterimage **without** a Afterimage-maintained LangChain / CrewAI / LlamaIndex SDK forever. Point the exporter (or a Collector) at Afterimage's local OTLP/HTTP receiver:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/json   # or http/protobuf via Collector → JSON
```

```sh
npm run afterimage -- otel [--port 4318] [--host 127.0.0.1]
```

gRPC `:4317` is out of scope for v1 — use a Collector to forward OTLP/HTTP to Afterimage.

## Non-goals

- Afterimage does **not** maintain per-framework SDKs for every agent library.
- OTLP **metrics** and **logs** are not AgentEvent sources in v1 (traces only).
- `embeddings` and other non-agent GenAI ops are ignored.
- Message / tool **content** is stored only when present on the span (OTEL content capture opt-in). Metadata-only spans still produce events with empty or omitted bodies.

## AgentEvent ↔ GenAI mapping (v1)

| Afterimage `AgentEvent.type` | GenAI signal |
|-------------------------|--------------|
| Run boundary (`startRun` / `finishRun`) | `invoke_agent` / `invoke_workflow` / `create_agent` (trace or conversation id) |
| `prompt` | Opted-in `gen_ai.input.messages` / `gen_ai.system_instructions` on agent/workflow spans |
| `model_response` | `chat` / `generate_content` / `text_completion` + `gen_ai.request.model`, usage, provider |
| `tool_call` / `tool_result` | `execute_tool` + `gen_ai.tool.name` / `gen_ai.tool.call.id` |
| `file_write` | `execute_tool` whose name/args look like a file write **and** path + content (or hash input) are present |
| `error` | Span status ERROR / `error.type` |

Legacy attribute names are coalesced before mapping (`gen_ai.provider.name` ?? `gen_ai.system`, `input_tokens` ?? `prompt_tokens`, etc.). See [`src/runtime/otel/OBSERVATION.md`](../src/runtime/otel/OBSERVATION.md).

## Privacy

- Prompt / completion / tool argument bodies follow OTEL: absent unless the exporter set content-capture attributes.
- `file_write` follows Afterimage store privacy (`LUCID_STORE_FILE_CONTENT`); hash + path remain the loop-detector contract.

## Correlation

Default: **one OTEL `trace_id` = one Afterimage `AgentRun`**. Optional grouping by `gen_ai.conversation.id` when configured on the receiver. Parent/child span ids become `causal.causedByEventIds` when both sides map to events.
