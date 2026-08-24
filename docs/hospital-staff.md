# Lucid Hospital staff

Lucid has **two completely different kinds of agents**.

## Workspace agents (patients)

- Live in your repo: `.lucid/agents.json` + observed runs
- Examples: Uma, Gitty, Auth, Appy
- You manage them; they do **not** ship as part of Lucid Hospital
- Shown on **Your agents**

## Hospital staff (built into Lucid)

- Live in the Lucid package: `src/hospital/staff/`
- Permanent intake / lab / doctors / treatment / recheck roles
- Shown on **Hospital → Lucid Hospital staff**
- Never configured via `.lucid/agents.json`

```text
Your agent gets sick
        ↓
Check into Lucid (incident)
        ↓
Intake Doctor
        ↓
Diagnostics Lab
        ↓
Chief Doctor diagnoses
        ↓
Assigned to specialist
        ↓
Treatment Agent (lucid fix)
        ↓
Recheck Nurse (lucid recheck)
        ↓
Agent returns to work
```

| Staff | Maps to today |
|-------|----------------|
| Intake Doctor | Observer opens incident / chart |
| Diagnostics Lab | `disease.detect` + evidence |
| Chief Doctor | Root-cause diagnosis |
| Loop / Memory / Instruction / Tool / Efficiency Doctors | Department plugins |
| Treatment Agent | `lucid fix` |
| Recheck Nurse | `lucid recheck` |

Specialists with only stub diseases show as **Not on duty yet**. Loop Doctor is **on duty** because `repeated-file-state` is shipped.

Each staff member has a Uma sticker mascot (`characterId`) shown on the Hospital roster and on patient care charts.

## Contribute

1. **New lab test / disease** — add `src/departments/<dept>/<disease>/` with detect → diagnose → recommend → verify, register it, set `status: 'shipped'` when ready.
2. **New specialist** — add a department (or ship diseases under an existing stub dept). The staff catalog marks that specialist `on_duty` when any disease in the department is shipped.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the plugin layout.
