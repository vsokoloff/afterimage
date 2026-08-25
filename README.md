# Afterimage

**A local med center for coding-agent failures.**

Afterimage watches what your agent actually does (file writes, prompts, tools, tests), detects known “diseases,” and shows evidence you can trust — without sending your code to a SaaS.

No accounts. No cloud login. Data stays in your repo under `.afterimage/` (legacy `.lucid/` still works).

Hospital language lives in the product (departments, diseases, Kitty). The name is **Afterimage**: the ghost of what the agent already did.

If you saw this on LinkedIn: clone it, try it on a throwaway project, then **add the weird edge case you hit**. That’s the point.

## What it detects today (shipped)

| Disease | Department | Signal (deterministic) |
|---|---|---|
| `repeated-file-state` | Looping | Same file returns to a prior content hash (A → B → A) |
| `scope-explosion` | Scope | Localized task blows out across many files/dirs |
| `prior-fix-regressed` | Memory | A named test was passing, then fails later in the run |
| `instruction-amnesia` | Instructions | Agent violates “only edit X” / “do not touch Y” / “do not use Z” |
| `redundant-rewrite` | Cost | New file duplicates another path’s exact (or structural) content |

Detection does **not** need an API key. Optional LLM narrative can come later; the abnormality itself is rule-based.

## 10-minute try (new machine)

**Needs:** Node 20+, Git, and (for Cursor integration) [Cursor](https://cursor.com).

```sh
git clone https://github.com/vsokoloff/afterimage.git
cd afterimage
npm install
npm test                 # should be green
npm run build
```

### A) Fixture demo (no Cursor required)

```sh
npm run demo             # terminal + local UI
# or
npm run web              # http://127.0.0.1:3000
npm run afterimage -- doctor
npm run afterimage -- departments
```

### B) Watch a real project with Cursor (recommended)

```sh
npm link                 # optional — exposes `afterimage` (and legacy `lucid` alias)

cd /path/to/some-other-project
afterimage init          # creates .afterimage/
afterimage attach cursor # installs .cursor/hooks* — keep prompting normally
afterimage open          # dashboard at http://127.0.0.1:3000
```

Without `npm link`:

```sh
npm --prefix /path/to/afterimage run afterimage -- init
npm --prefix /path/to/afterimage run afterimage -- attach cursor
npm --prefix /path/to/afterimage run afterimage -- open
```

Then in **Cursor**, open that project and use Agent as usual. Reload the window once if hooks don’t appear.

**Smoke prompt** (forces a loop):

```text
Create loop-demo.txt with content A.
Change it to B.
Change it back to exactly A.
Stop.
```

You should see **Kitty** meow (Hooks output / optional macOS notification), an incident under `.afterimage/incidents/`, and the case in the dashboard.

> Run `attach cursor` on **each machine** after `npm run build`. The hook points at that machine’s `afterimage/dist` path.

## Updating

```sh
cd afterimage
git pull
npm install
npm run build
# if Cursor hooks changed:
afterimage attach cursor
```

Next step for easier updates: publish to npm so it’s `npm update -g afterimage`. Still local. Still yours. No cloud API for your code.

## Mental model

```text
OBSERVE → DETECT → EVIDENCE → DIAGNOSE → RECOMMEND → RECHECK
```

Each disease is a small plugin:

```ts
detect(trace)           // abnormality | null   (deterministic)
diagnose(trace)         // evidence + diagnosis
recommendFix(diagnosis) // treatment plan (review required by default)
verify(before, after)   // recheck
```

## Privacy

By default Afterimage stores **hashes + metadata** under `.afterimage/`, not full file bodies.

```sh
AFTERIMAGE_STORE_FILE_CONTENT=1 afterimage run -- …   # opt in to retain bodies
# legacy: LUCID_STORE_FILE_CONTENT still accepted
```

Nothing is uploaded. The dashboard binds to `127.0.0.1`.

## Add your own edge case (contribute a disease)

We want failure modes from real agent runs. If your agent did something dumb that Afterimage missed, turn it into a detector.

### 1. Pick a department (or add one)

Existing: `looping`, `memory`, `instructions`, `scope`, `tools`, `cost`.

### 2. Scaffold

```text
src/departments/<dept>/<your-disease>/
  detect.ts
  diagnose.ts
  recommend.ts
  verify.ts
  index.ts       # export DiseasePlugin with status: 'shipped' | 'stub'
```

Mirror [`src/departments/looping/repeated-file-state/`](src/departments/looping/repeated-file-state/) or [`src/departments/scope/scope-explosion/`](src/departments/scope/scope-explosion/).

### 3. Rules for a good PR

- **Tests first** — positive case, negative case, and one “don’t confuse with another disease” case
- **Deterministic detect** — no API key required to decide the abnormality
- **Stable evidence string** — machine-readable, no locale fluff
- **Local-only** — no SaaS calls in the detector path
- Keep existing shipped disease tests green (`npm test`)
- Register the plugin in the department `index.ts` / [`src/departments/index.ts`](src/departments/index.ts)

### 4. Idea starters

- Agent re-reads the same file 20× with no edit
- Oscillation between two approaches without progress
- Cross-run regressions (prior green on an earlier run)
- Semantic near-duplicates (after exact/structural)

Open an issue with a short repro (“agent did X, expected Afterimage to flag Y”) if you’re not ready to code. Edge cases are contributed via **GitHub PR/issue** — not an upload API. Your `.afterimage/` data never leaves your machine.

## CLI cheat sheet

```sh
npm run afterimage -- init
npm run afterimage -- attach cursor
npm run afterimage -- open
npm run afterimage -- departments
npm run afterimage -- doctor
npm run afterimage -- inspect
npm run afterimage -- run -- <command>
npm run afterimage -- otel
npm run afterimage -- fix <incident-id>
npm run afterimage -- recheck <incident-id>
```

(`lucid` remains a temporary alias for the same CLI.)

## Observation sources

| Source | Status | How |
|---|---|---|
| **Cursor Desktop hooks** | Shipped | `afterimage attach cursor` |
| Process + filesystem | Shipped | `afterimage run -- …` |
| Codex SDK stream | Shipped | adapter under `src/runtime/codex/` |
| OpenTelemetry GenAI | Shipped | `afterimage otel` → `:4318` |

Details: [docs/ingestion.md](./docs/ingestion.md). Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Layout

```text
src/
  departments/           # disease plugins (contribute here)
  runtime/cursor/        # Cursor hooks bridge + Kitty alerts
  runtime/codex/         # Codex adapter
  runtime/otel/          # OTLP GenAI ingest
  observer.ts            # persist events → run detectors → open incidents
  events.ts              # AgentEvent contract
web/                     # local Incidents / Hospital UI
tests/
```

## License / vibe

Local-first, open contribution, hospital metaphor for agent failures — not a medical product and not a hosted platform.

PRs that add a real edge case with tests beat PRs that only polish copy.
