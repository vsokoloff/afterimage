# Afterimage (Lucid)

**Local-first agent command center** with a **Hospital** for failure patterns.

`lucid open` → local dashboard. No accounts, no SaaS login.

Hospital language is only in feature labels. The chrome is a developer tool (Linear/Sentry-style), not a medical website.

> **Today’s ship:** Looping → repeated file state — detect → diagnose → prescribe → recheck. Auth Agent’s Hospital path is grounded in the real detector via `GET /api/visit`. Other agents and departments are clearly labeled mock/stub.

## Mental model

```text
Command center (Agents / Activity / Memory)
        └── Hospital (per-agent diagnostics)
                OBSERVE → TEST → ABNORMALITY → EVIDENCE → DIAGNOSIS → TREATMENT → RECHECK
```

- **Agents** — route work, inspect health, open profiles
- **Hospital** — progressive department tests; real looping evidence for Auth Agent
- **`lucid fix`** — CLI prints treatment; the UI does **not** fake a web patch

## Demo path

1. `npm run demo` or `npm run web` → open dashboard  
2. **Agents** → **Auth Agent** (unhealthy) → **View**  
3. **Send to Hospital** → **Run diagnostics**  
4. See A→B→A hashes → root cause (case notes) → treatment  
5. Copy/run `npm run lucid -- fix` → **Mark treatment applied (simulate)**  
6. **Recheck** → pass → **Clear & return** → health up + memory learned  

## Run

Node 20+.

```sh
npm install
npm test
npm run web           # command center UI
npm run demo          # terminal trace + open UI
npm run lucid -- departments
npm run lucid -- doctor
npm run lucid -- inspect
npm run lucid -- fix
npm run lucid -- recheck
```

Dashboard: [http://127.0.0.1:3000](http://127.0.0.1:3000)

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

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Layout

```text
src/
  departments/                 Hospital plugin system
    looping/repeated-file-state/
  case.ts                      Auth Agent fixture
  visit.ts                     /api/visit payload
  cli.ts                       lucid doctor / fix / …
  demo.ts / server.ts
web/
  index.html / app.js / styles.css
  data/agents.js               Command-center fixtures
```

## Repo

https://github.com/vsokoloff/afterimage
