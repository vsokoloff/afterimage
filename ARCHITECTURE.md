# Afterimage architecture

Afterimage (product surface: **Lucid**) is a **local incidents + Hospital** tool for agent failure patterns.

The website starts on **open incidents** and opens Hospital diagnostics directly. Detection and treatment live in the terminal / department plugins.

## Patients vs hospital staff

Lucid has two agent kinds — do not mix them:

| Kind | Where | Examples | UI |
|------|-------|----------|-----|
| **Workspace agents (patients)** | Repo `.lucid/` + runs | Uma, Gitty, Auth | Your agents |
| **Hospital staff** | Lucid package `src/hospital/staff/` | Intake, Lab, Chief, Loop Doctor, Recheck Nurse | Hospital staff roster |

Staff diagnose and treat patients. Patients never appear in the staff list; staff never appear in Your agents. Details: [docs/hospital-staff.md](docs/hospital-staff.md).

## Always observe dashboard agents

Every agent on the Agents roster is a patient Lucid is watching. When they act through Lucid (Gitty push, Uma remember/show/forget, `lucid run`, Codex/OTEL adapters), work opens a real observed run so `lastSeenAt`, Activity, and Hospital stay honest. Shared helper: `withObservedAgentWork`. Legacy `subprocess` run ids roll up to **Gitty** on the roster.

## Local-first

- Runs on your machine (`127.0.0.1`).
- No accounts / SaaS / login.
- BYO model / API key when (later) an LLM is used for narrative assist — core detectors are deterministic.
- Open source; contribute a disease, not a SaaS feature.

## UI shell

SPA with sidebar:

```text
Lucid
Incidents (default) · Agents · Activity · Memory
———
System: ✓ Lucid running
```

- **Incidents** — open failures first; click opens Hospital diagnostics (no Agents → View → Send gate)
- **Hospital visit** — progressive tests → diagnosis → root cause → treatment + `lucid fix` CLI → recheck → cleared → back to Incidents
- **Agents** — optional roster / routing (secondary)
- **Activity** — chronological feed
- **Memory** — cross-agent learned lessons

Fixtures: `web/data/agents.js`. Auth Agent hospital loads **real** hashes/evidence from `GET /api/visit`. Other agents are mock. Stub departments are labeled **Mock** in the UI.

`lucid fix` is CLI-oriented: the UI shows the terminal command and a **simulate applied** demo control — it does not pretend to patch agent code in the browser.

## Hospital = departments (plugins)

Each **department** owns a family of failure modes. Each **disease** is a plugin:

```text
OBSERVE → TEST → ABNORMALITY → EVIDENCE → DIAGNOSIS → TREATMENT → RECHECK
```

```ts
detect(trace)           // TEST → ABNORMALITY | null
diagnose(trace)         // EVIDENCE + DIAGNOSIS (+ optional case notes)
recommendFix(diagnosis) // TREATMENT plan (instructions / memory / tools / …)
verify(before, after)   // RECHECK
```

### Departments

| ID | Name | Diseases (today) |
|---|---|---|
| `looping` | Looping | `repeated-file-state` **shipped**; others stub |
| `memory` | Memory | stub |
| `instructions` | Instructions | stub |
| `tools` | Tools | stub |
| `cost` | Cost / Efficiency | stub |

### Layout

```text
src/departments/
  types.ts
  index.ts
  looping/
    repeated-file-state/
      detect.ts | diagnose.ts | recommend.ts | verify.ts
```

## What “fix” means

**Treatment** = apply the change associated with the diagnosis (instructions, memory policy, retry strategy, tools, …).

It does **not** mean “open a chat and ask a model to rewrite the user’s repository.”

Unsafe treatments require review. Auto-apply is blocked by default (`safeToAutoApply: false`).

## Incident / medical record

Auth Agent incident fields:

| Field | Source |
|---|---|
| Patient / complaint | Case |
| Trace (file edits) | Observation |
| Abnormality | `detect()` |
| Evidence | Derived from abnormality |
| Root cause | Case notes (not frontend inference) |
| Treatment | `recommendFix()` |
| Recheck | `verify(before, after)` |

`GET /api/visit` returns this record. The UI does not invent diagnosis.

## Observation / ingestion

Lucid’s durable contract is **`AgentEvent`**. Host adapters (process, Codex, future Cursor/Claude) and the **OpenTelemetry GenAI** path all normalize to `RecordableEvent` → `LucidObserver`. Detectors never import adapters.

See [docs/ingestion.md](docs/ingestion.md) for adapter tiers, GenAI attribute mapping, and `lucid otel` (OTLP/HTTP `:4318`).

## Shipped path

**Looping → repeated-file-state**:

1. Hash full file contents after each successful write (SHA-256).
2. Persist **hash + metadata** under `.lucid/` by default (not full source). Opt in with `LUCID_STORE_FILE_CONTENT=1` / `retainFileContent: true`.
3. If file `F` returns to a prior hash → abnormality.
4. Fixture root cause: conflicting instructions.
5. Prescribed treatment: resolve instruction conflict (report conflict instead of reverting).
6. Recheck fixture has no loop → clear.

## CLI

| Command | Today |
|---|---|
| `lucid init` / `attach` | Stub |
| `lucid otel` | Local OTLP/HTTP GenAI traces → AgentEvent |
| `lucid status` | Fixture status |
| `lucid doctor` | Run primary disease on fixture |
| `lucid inspect` | Evidence + diagnosis |
| `lucid fix` | Print treatment; no auto-apply |
| `lucid recheck` | Verify post-treatment fixture |
| `lucid departments` | List registry |

Use `npm run lucid -- <cmd>` (not a published global package yet).

## Adding a disease

1. Create `src/departments/<dept>/<disease>/` with detect / diagnose / recommend / verify.
2. Export `DiseasePlugin` with `status: 'shipped'` when end-to-end.
3. Register in the department index + hospital registry.
4. Add tests; keep Auth Agent visit working unless intentionally replaced.
5. Shipping a disease in a department automatically marks that department’s **specialist doctor** as on duty in the Hospital staff roster.
