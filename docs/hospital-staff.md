# Afterimage Hospital staff

Afterimage has **two completely different kinds of agents**.

## Workspace agents (patients)

- Live in your repo: `.afterimage/agents.json` + observed runs
- Examples: Uma, Gitty, Auth, Appy
- You manage them; they do **not** ship as part of Afterimage Hospital
- Shown on **Your agents**

## Hospital staff (built into Afterimage)

- Live in the Afterimage package: `src/hospital/staff/`
- Permanent intake / lab / doctors / treatment / recheck roles
- Shown on **Hospital → Afterimage Hospital staff**
- Never configured via `.afterimage/agents.json`

```text
Your agent gets sick
        ↓
Check into Afterimage (incident)
        ↓
Intake Doctor
        ↓
Diagnostics Lab
        ↓
Chief Doctor diagnoses
        ↓
Assigned to specialist
        ↓
Treatment Agent (afterimage fix)
        ↓
Recheck Nurse (afterimage recheck)
        ↓
Agent returns to work
```

| Staff | Maps to today |
|-------|----------------|
| Intake Doctor | Observer opens incident / chart |
| Diagnostics Lab | `disease.detect` + evidence |
| Chief Doctor | Root-cause diagnosis |
| Loop / Memory / Instruction / Tool / Efficiency Doctors | Department plugins |
| Treatment Agent | `afterimage fix` |
| Recheck Nurse | `afterimage recheck` |

Specialists with only stub diseases show as **Not on duty yet**. Loop Doctor is **on duty** because `repeated-file-state` is shipped.

Each staff member has a Uma sticker mascot (`characterId`) shown on the Hospital roster and on patient care charts.

## Contribute

1. **New lab test / disease** — add `src/departments/<dept>/<disease>/` with detect → diagnose → recommend → verify, register it, set `status: 'shipped'` when ready.
2. **New specialist** — add a department (or ship diseases under an existing stub dept). The staff catalog marks that specialist `on_duty` when any disease in the department is shipped.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the plugin layout.
