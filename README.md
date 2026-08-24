# Afterimage

**An open-source hospital that runs alongside your agents.**

Afterimage watches how agents behave, runs diagnostic tests when something looks wrong, tells you which part of the agent is causing the problem, and can apply a targeted **treatment** — a change to instructions, memory policy, retry strategy, tools, and so on.

It is **not** “ask AI to fix my code.”

Local-first · open source · BYO model / API key. Install once, attach an agent, observe quietly when healthy.

> **Today’s ship:** one department, one disease — **Looping → repeated file state** — end to end (detect → diagnose → prescribe → recheck). Other departments are documented stubs.

Website = medical record for one incident. Product = terminal / runtime.

## Pitch

```text
OBSERVE → TEST → ABNORMALITY → EVIDENCE → DIAGNOSIS → TREATMENT → RECHECK
```

1. Watch file-state (and later: tools, memory, cost).
2. When a known failure pattern fires, show evidence.
3. Point at the component to change (instructions, tools, …).
4. Apply a supported treatment when safe; unsafe ones require review.
5. Recheck that the abnormality is gone.

## Departments

| Department | Focus | Status |
|---|---|---|
| **Looping** | File-state loops, repeated tools, oscillation, undo/redo | **repeated-file-state shipped**; others stubbed |
| Memory | Forgotten failures, repeated research, constraint forgetting | Stub |
| Instructions | Conflicting goals, ambiguous priority | Stub |
| Tools | Bad schemas, wrong tool, ignoring output | Stub |
| Cost / Efficiency | Token explosion, rereading, excessive retries | Stub |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the plugin shape and contributor layout.

## Demo story (shipped)

Admit **Auth Writer** → observe `A → B → A` on `auth.py` → Looping / repeated-file-state → conflicting instructions → prescribed instruction change → recheck with new states → discharged.

The detector only decides whether a loop happened. Root cause and treatment for this fixture come from case data, not from the UI inventing a story.

## Run

Node 20 or later.

```sh
npm install
npm test
npm run demo          # terminal trace + medical-record UI
npm run web           # visit UI only
npm run lucid -- departments
npm run lucid -- doctor
npm run lucid -- inspect
npm run lucid -- fix
npm run lucid -- recheck
```

Demo opens [http://127.0.0.1:3000](http://127.0.0.1:3000).

### CLI (local scripts — not a published global package yet)

```text
lucid init / attach     stubs
lucid status            fixture status
lucid doctor            run Looping → repeated-file-state
lucid inspect           evidence + diagnosis
lucid fix               prescribe treatment (review required)
lucid recheck           verify post-treatment trace
lucid departments       list departments / diseases
```

## Layout

```text
src/
  departments/                 Hospital plugin system
    looping/
      repeated-file-state/     SHA-256 detect + diagnose + treat + verify
    index.ts                   Registry (incl. stub departments)
  case.ts                      Auth Writer fixture
  visit.ts                     Medical-record API payload
  cli.ts                       Thin local CLI
  demo.ts / server.ts / web/   Demo + visit UI
ARCHITECTURE.md
```

## Repo

https://github.com/vsokoloff/afterimage
