# Afterimage

Afterimage watches the complete file state after each successful agent write. When one file returns to a state it already tried, Afterimage reports the loop, the root cause supplied with the case, and a recommended change to the agent’s instructions.

This is a clean rebuild of the Lucid loop idea: one detector, one demo case, one visit.

## Story

Admit **Auth Writer** → observe `A → B → A` on `auth.py` → diagnosis → conflicting instructions → recommended treatment → recheck with new states → discharged.

The detector only decides whether a loop happened. Root cause and treatment come from case data, not from frontend inference.

## Run

Node 20 or later.

```sh
npm install
npm test
npm run demo
```

The demo prints the terminal trace, then opens [http://127.0.0.1:3000](http://127.0.0.1:3000).

```sh
npm run web
```

serves the visit only.

## Layout

```text
src/types.ts         Shared contracts
src/detect-loop.ts   SHA-256 loop detector
src/case.ts          Auth Writer case (attempts, cause, treatment, recheck)
src/visit.ts         Combines detector output with case data
src/server.ts        Website + GET /api/visit
web/                 Visit UI
```
