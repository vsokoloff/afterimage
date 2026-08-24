# Afterimage (Lucid)

**Local-first Lucid** — start from **open incidents**, diagnose in **Hospital**.

`lucid open` → local dashboard. No accounts, no SaaS login.

Hospital language is only in feature labels. The chrome is a developer tool (Linear/Sentry-style), not a medical website.

> **Today’s ship:** Looping → repeated file state — detect → diagnose → prescribe → recheck. Auth Agent’s Hospital path is grounded in the real detector via `GET /api/visit`. Other agents and departments are clearly labeled mock/stub.

## Mental model

```text
Incidents (default) → Hospital diagnostics
        └── Agents / Activity / Memory (secondary)
                OBSERVE → TEST → ABNORMALITY → EVIDENCE → DIAGNOSIS → TREATMENT → RECHECK
```

- **Incidents** — open failures; open one to run diagnostics
- **Hospital** — progressive department tests; real looping evidence for Auth Agent
- **Agents** — optional roster / routing (not the front door)
- **`lucid fix`** — CLI prints treatment; the UI does **not** fake a web patch

## Demo path

1. `npm run demo` or `npm run web` → open dashboard  
2. **Incidents** → **Auth Agent** (open failure) → **Open diagnostics**  
3. **Run diagnostics** → A→B→A hashes → root cause → treatment  
4. Copy/run `npm run lucid -- fix` → **Mark treatment applied (simulate)**  
5. **Recheck** → pass → **Clear & return** → **Back to Incidents**

## Run

Node 20+.

```sh
npm install
npm test
npm run web           # Lucid UI (starts on Incidents)
npm run demo          # terminal trace + open UI
npm run lucid -- departments
npm run lucid -- doctor
npm run lucid -- inspect
npm run lucid -- fix
npm run lucid -- recheck
```

Dashboard: [http://127.0.0.1:3000](http://127.0.0.1:3000)

### Privacy defaults

Lucid persists run events under `.lucid/` as **hashes + metadata by default** — not full file source. Loop detection only needs SHA-256 digests.

To retain full file bodies on `file_write` events (debugging):

```sh
LUCID_STORE_FILE_CONTENT=1 npm run lucid -- run -- …your command…
```

Or open the store / observe APIs with `retainFileContent: true`.

### Real vs mock

| Piece | Status |
|---|---|
| Looping / repeated-file-state detector | **Real** |
| `GET /api/visit` (Auth Agent hospital) | **Real** |
| Root cause + treatment text | **Case fixture** (not UI invention) |
| `lucid fix` | **Real CLI print**; no auto-apply |
| Other agents (Appy, Test, …) | **Mock** |
| Memory / Instructions / Tools / Cost depts | **Stub / mock** (labeled in UI) |
| “Mark treatment applied” | **Demo simulate** only |

## Departments

| Department | Focus | Status |
|---|---|---|
| **Looping** | File-state loops, … | **repeated-file-state shipped** |
| Memory | Forgotten failures, … | Stub |
| Instructions | Conflicting goals, … | Stub |
| Tools | Bad schemas, … | Stub |
| Cost / Efficiency | Token explosion, … | Stub |

See [ARCHITECTURE.md](./ARCHITECTURE.md). Observation contract and OTEL path: [docs/ingestion.md](./docs/ingestion.md).

## Observation

Host adapters (process, Codex) and **OpenTelemetry GenAI** all feed `AgentEvent` via `LucidObserver`. Frameworks that already emit GenAI spans can point OTLP/HTTP at Lucid instead of needing a per-SDK adapter:

```sh
npm run lucid -- otel          # listen 127.0.0.1:4318 /v1/traces
```

## Layout

```text
src/
  departments/                 Hospital plugin system
    looping/repeated-file-state/
  events.ts                    AgentEvent contract
  runtime/                     process, Codex, OTEL adapters
  case.ts                      Auth Agent fixture
  visit.ts                     GET /api/visit builder
  server.ts                    Static UI + visit API
docs/
  ingestion.md                 Ingestion standard (adapters + OTEL)
web/
  index.html                   Shell (Incidents-first nav)
  app.js                       SPA routes + Hospital UX
  data/agents.js               Agent / incident fixtures
```
