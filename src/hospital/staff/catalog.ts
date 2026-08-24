import { listDepartments } from '../../departments/index.ts'

/** Pipeline stage for Lucid Hospital staff. */
export type HospitalStaffStage =
  | 'intake'
  | 'lab'
  | 'chief'
  | 'specialist'
  | 'treatment'
  | 'recheck'

export type HospitalStaffStatus = 'on_duty' | 'stub'

export type HospitalStaffMember = {
  id: string
  name: string
  title: string
  duty: string
  stage: HospitalStaffStage
  /** Set for specialist doctors — matches department plugin id. */
  departmentId: string | null
  status: HospitalStaffStatus
}

const CORE_STAFF: Omit<HospitalStaffMember, 'status'>[] = [
  {
    id: 'intake',
    name: 'Intake Doctor',
    title: 'Intake',
    duty: 'Receives the sick agent and decides which diagnostic tests to run',
    stage: 'intake',
    departmentId: null,
  },
  {
    id: 'lab',
    name: 'Diagnostics Lab',
    title: 'Lab',
    duty: 'Runs health tests for known failure patterns',
    stage: 'lab',
    departmentId: null,
  },
  {
    id: 'chief',
    name: 'Chief Doctor',
    title: 'Chief',
    duty: 'Diagnoses agent failures from lab results',
    stage: 'chief',
    departmentId: null,
  },
  {
    id: 'treatment',
    name: 'Treatment Agent',
    title: 'Treatment',
    duty: 'Applies the approved fix when you run lucid fix',
    stage: 'treatment',
    departmentId: null,
  },
  {
    id: 'recheck',
    name: 'Recheck Nurse',
    title: 'Recheck',
    duty: 'Reruns tests after treatment and clears healthy agents',
    stage: 'recheck',
    departmentId: null,
  },
]

const SPECIALIST_DEFS: Array<{
  id: string
  name: string
  title: string
  duty: string
  departmentId: string
}> = [
  {
    id: 'specialist-memory',
    name: 'Memory Doctor',
    title: 'Memory',
    duty: 'Treats memory and retrieval problems',
    departmentId: 'memory',
  },
  {
    id: 'specialist-instructions',
    name: 'Instruction Doctor',
    title: 'Instructions',
    duty: 'Treats prompt and instruction conflicts',
    departmentId: 'instructions',
  },
  {
    id: 'specialist-looping',
    name: 'Loop Doctor',
    title: 'Looping',
    duty: 'Treats repeated-behavior loops',
    departmentId: 'looping',
  },
  {
    id: 'specialist-tools',
    name: 'Tool Doctor',
    title: 'Tools',
    duty: 'Treats tool-use failures',
    departmentId: 'tools',
  },
  {
    id: 'specialist-cost',
    name: 'Efficiency Doctor',
    title: 'Efficiency',
    duty: 'Treats token and retry waste',
    departmentId: 'cost',
  },
]

function departmentHasShippedDisease(departmentId: string): boolean {
  const dept = listDepartments().find((item) => item.id === departmentId)
  return Boolean(dept?.diseases.some((disease) => disease.status === 'shipped'))
}

function withStatus(
  member: Omit<HospitalStaffMember, 'status'>,
  status: HospitalStaffStatus,
): HospitalStaffMember {
  return { ...member, status }
}

/** Built-in Lucid Hospital staff — never loaded from `.lucid/agents.json`. */
export function listHospitalStaff(): HospitalStaffMember[] {
  const core = CORE_STAFF.map((member) => withStatus(member, 'on_duty'))
  const specialists = SPECIALIST_DEFS.map((def) =>
    withStatus(
      {
        id: def.id,
        name: def.name,
        title: def.title,
        duty: def.duty,
        stage: 'specialist',
        departmentId: def.departmentId,
      },
      departmentHasShippedDisease(def.departmentId) ? 'on_duty' : 'stub',
    ),
  )

  // Intake → Lab → Chief → specialists → Treatment → Recheck
  return [
    core.find((m) => m.id === 'intake')!,
    core.find((m) => m.id === 'lab')!,
    core.find((m) => m.id === 'chief')!,
    ...specialists,
    core.find((m) => m.id === 'treatment')!,
    core.find((m) => m.id === 'recheck')!,
  ]
}

export function getStaff(id: string): HospitalStaffMember | null {
  return listHospitalStaff().find((member) => member.id === id) ?? null
}

export function staffForDepartment(departmentId: string): HospitalStaffMember | null {
  return (
    listHospitalStaff().find(
      (member) => member.stage === 'specialist' && member.departmentId === departmentId,
    ) ?? null
  )
}
