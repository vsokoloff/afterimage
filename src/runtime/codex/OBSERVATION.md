# Codex SDK runtime observation

Lucid’s first **agent-runtime adapter** targets the [Codex SDK](https://cursor.com/docs/sdk/typescript) (`@cursor/sdk`) — programmatic local/cloud agents with a normalized `run.stream()` event log.

Implementation lives under `src/runtime/codex/`. It feeds the same `LucidObserver → AgentEvent → detectors` path as `lucid run`; detectors never import Codex types.

## What the adapter observes

| Codex source | Lucid `AgentEvent` | Notes |
|---|---|---|
| `task` / `user` prompt | `prompt` (`role: user`) | Task recorded once; stream `user` echo deduped when text matches |
| `system` init | `prompt` (`role: system`) | Model id + tool list when present |
| `assistant` text blocks | `model_response` | ToolUse blocks skipped (see `tool_call` stream) |
| `thinking` | `model_response` | Text in `reasonSummary`; causal link to last user prompt when known |
| `tool_call` running | `tool_call` | Stable envelope: `call_id`, `name`, `args` |
| `tool_call` completed/error | `tool_result` | `ok` from status; `output` = Codex `result` |
| `Write` tool (completed) | `file_write` | Parses `path` + `contents`/`content` from `args` |
| `StrReplace` / `apply_patch` (completed) | `file_write` | Uses patch fragment as `contentHashInput` — **not** guaranteed full file state |
| `Shell` tool (completed) | `tool_call` + `tool_result` + `process_start` + `process_end` | Command parsed from args; exit code from result when present |
| `Shell` running tests (`npm test`, `vitest`, …) | `test_result` | Emitted when command looks like a test runner and exit code is known |
| `status: ERROR` | `error` | Cloud/local terminal failure signal |
| `tool_call: error` | `error` | Per-tool failure |
| `run.wait()` error result | `error` | Run executed but failed |
| `run.wait()` final text | `model_response` | When `result.result` is non-empty |

## What it cannot observe

| Gap | Why |
|---|---|
| **IDE-only Cursor chat** | This adapter consumes Codex SDK `SDKMessage` streams, not Cursor Desktop transcript hooks |
| **Token-level deltas** | `InteractionUpdate` / `onDelta` streams are not normalized (only `run.stream()` messages) |
| **`task` / `request` / `usage` messages** | Ignored — no Lucid event mapping yet |
| **Full file state from StrReplace** | Codex exposes patch fragments; loop detection may miss or mis-hash unless `Write` sends full contents |
| **Shell stdout/stderr chunks** | Only start/end (+ optional test_result); no `process_output` streaming |
| **Subprocess PID / signals** | Shell normalization omits `pid`; signals not exposed by SDK tool results |
| **Tool `args` / `result` schema** | Codex documents these as unstable `unknown` — parsers are defensive and may miss fields |
| **Auto-review / hook decisions** | Approval gates and hook blocks are not in the public stream |
| **Cloud git/PR metadata** | `RunResult.git` is not copied into events (available on host result only) |
| **Multi-turn conversation prior to attach** | Only the streamed run is observed; resume history before attach is host-managed |

## Usage (recorded or live stream)

```typescript
import { observeCodexRun } from './runtime/codex/index.ts'
import { openStore } from './store.ts'

// Live: for await (const event of run.stream()) { ... } — pass collected messages:
const result = await observeCodexRun({
  store: await openStore(),
  task: 'Fix auth.py without looping',
  cwd: process.cwd(),
  codexAgentId: 'bc-agent-1',
  codexRunId: 'run-1',
  messages: recordedSdkMessages,
  result: await run.wait(),
})
```

## Detector independence

Shipped detectors read `AgentRun.events` (`file_write`, etc.) only. Whether those events were produced by:

- the process adapter + filesystem watcher,
- this Codex adapter,
- or `observer.record()` in tests,

is invisible to `detect()` / `diagnose()` / `verify()`.
