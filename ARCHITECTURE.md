# Afterimage architecture

Afterimage is a **local hospital for agents**: a runtime that sits beside an agent, watches behavior, and runs diagnostic diseases when something looks wrong.

The website is only the **medical record** for an incident. The product lives in the terminal and attach path.

## Local-first

- Runs on your machine.
- BYO model / API key when (later) an LLM is used for narrative assist — core detectors are deterministic.
- Open source; contribute a disease, not a SaaS feature.
- Attach once; stay quiet while the agent is healthy.

## Hospital = departments (plugins)

Each **department** owns a family of failure modes. Each **disease** is a plugin with the same pipeline:

```text
OBSERVE → TEST → ABNORMALITY → EVIDENCE → DIAGNOSIS → TREATMENT → RECHECK
```

Contributor shape:

```ts
detect(trace)           // TEST → ABNORMALITY | null
diagnose(trace)         // EVIDENCE + DIAGNOSIS (+ optional case notes)
recommendFix(diagnosis) // TREATMENT plan (instructions / memory / tools / …)
verify(before, after)   // RECHECK
```

### Departments

| ID | Name | Diseases (today) |
|---|---|---|
| `looping` | Looping | `repeated-file-state` **shipped**; `repeated-tool-calls`, `oscillation`, `undo-redo` stub |
| `memory` | Memory | forgotten-failures, repeated-research, constraint-forgetting — stub |
| `instructions` | Instructions | conflicting-goals, ambiguous-priority — stub |
| `tools` | Tools | bad-schemas, wrong-tool, ignoring-output — stub |
| `cost` | Cost / Efficiency | token-explosion, rereading-files, excessive-retries — stub |

### Layout

```text
src/departments/
  types.ts                         DiseasePlugin contract
  index.ts                         Registry + listDepartments()
  looping/
    index.ts
    repeated-file-state/
      detect.ts                    SHA-256 complete-file-state loop
      diagnose.ts
      recommend.ts                 Prescribe treatment (not “fix my app code”)
      verify.ts
      index.ts
  # future: memory/, instructions/, tools/, cost/
```

## What “fix” means

**Treatment** = apply the change associated with the diagnosis:

- instruction hierarchy / priority
- memory or scratchpad policy
- retry / stop strategy
- tool schema or selection policy
- efficiency caps

It does **not** mean “open a chat and ask a model to rewrite the user’s repository.”

Unsafe or high-impact treatments **require review**. Auto-apply is opt-in and blocked by default (`safeToAutoApply: false`).

## Incident / medical record

One incident (the Auth Writer fixture today) has:

| Field | Source |
|---|---|
| Patient / complaint | Case |
| Trace (file edits) | Observation |
| Abnormality | `detect()` |
| Evidence | Derived from abnormality |
| Root cause | Case notes for known patterns (or later: department heuristics) |
| Treatment | `recommendFix()` |
| Recheck | `verify(before, after)` |

`GET /api/visit` returns this record for the dashboard. The UI does not invent diagnosis.

## Shipped path (hackathon scope)

**Looping → repeated-file-state** only:

1. Hash full file contents after each successful write (SHA-256).
2. If file `F` returns to a prior hash → abnormality.
3. Fixture root cause: conflicting instructions.
4. Prescribed treatment: resolve instruction conflict (report conflict instead of reverting).
5. Recheck fixture has no loop → discharge.

## CLI surface (ambitious; partially stubbed)

| Command | Today |
|---|---|
| `lucid init` / `attach` | Stub messages |
| `lucid status` | Fixture status |
| `lucid doctor` | Run primary disease on fixture |
| `lucid inspect` | Evidence + diagnosis |
| `lucid fix` | Print treatment; no auto-apply |
| `lucid recheck` | Verify post-treatment fixture |
| `lucid departments` | List registry |

Not a published global npm package yet — use `npm run lucid -- <cmd>`.

## Adding a disease

1. Create `src/departments/<dept>/<disease>/` with `detect`, `diagnose`, `recommend`, `verify`.
2. Export a `DiseasePlugin` with `status: 'shipped'` when end-to-end.
3. Register it in the department’s `index.ts` and the hospital registry.
4. Add tests; keep the Auth Writer visit working unless you intentionally replace the fixture.
