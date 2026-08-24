import { listDepartments } from '../../departments/index.ts'
import type { RootCauseDiagnosis } from '../../root-cause/types.ts'
import type { StructuredTreatment } from '../../treatment/types.ts'
import { rootCauseToTreatmentTarget } from '../../treatment/types.ts'
import {
  getStaff,
  listHospitalStaff,
  staffForDepartment,
  type HospitalStaffMember,
} from './catalog.ts'

export type LabTestResult = 'pass' | 'fail' | 'warn' | 'skip'

export type HospitalLabTest = {
  id: string
  label: string
  result: LabTestResult
  departmentId: string
}

export type HospitalCareTeam = {
  intake: HospitalStaffMember
  lab: HospitalStaffMember
  chief: HospitalStaffMember
  specialist: HospitalStaffMember | null
  treatmentOwner: HospitalStaffMember | null
  treatment: HospitalStaffMember
  recheck: HospitalStaffMember
  /** Display path e.g. "Chief Doctor → Loop Doctor". */
  assignedSummary: string
}

export type HospitalCareProjection = {
  careTeam: HospitalCareTeam
  tests: HospitalLabTest[]
}

function requireStaff(id: string): HospitalStaffMember {
  const member = getStaff(id)
  if (!member) throw new Error(`Hospital staff missing: ${id}`)
  return member
}

/** Map treatment surface → specialist who owns that class of fix. */
export function specialistForTreatmentTarget(
  target: StructuredTreatment['target'] | null | undefined,
): HospitalStaffMember | null {
  if (!target) return null
  switch (target) {
    case 'instructions':
      return staffForDepartment('instructions')
    case 'memory_policy':
      return staffForDepartment('memory')
    case 'tool_configuration':
      return staffForDepartment('tools')
    case 'retry_policy':
      return staffForDepartment('cost')
    case 'evaluator_test':
      return staffForDepartment('looping')
    default:
      return null
  }
}

export function buildLabTests(input: {
  incidentDepartment: string | null | undefined
  diagnosisStatus: 'critical' | 'clear' | 'unknown' | null
}): HospitalLabTest[] {
  const activeDept = input.incidentDepartment ?? null
  const critical = input.diagnosisStatus === 'critical'

  return listDepartments().map((dept) => {
    const shipped = dept.diseases.some((d) => d.status === 'shipped')
    if (!shipped) {
      return {
        id: `test-${dept.id}`,
        label: dept.name,
        result: 'skip' as const,
        departmentId: dept.id,
      }
    }

    if (activeDept === dept.id && critical) {
      return {
        id: `test-${dept.id}`,
        label: dept.name,
        result: 'warn' as const,
        departmentId: dept.id,
      }
    }

    if (activeDept && activeDept !== dept.id) {
      // Other shipped labs not implicated — treated as clear for this chart.
      return {
        id: `test-${dept.id}`,
        label: dept.name,
        result: 'pass' as const,
        departmentId: dept.id,
      }
    }

    if (activeDept === dept.id && !critical) {
      return {
        id: `test-${dept.id}`,
        label: dept.name,
        result: 'pass' as const,
        departmentId: dept.id,
      }
    }

    // No detector metadata yet — still show shipped labs as runnable.
    return {
      id: `test-${dept.id}`,
      label: dept.name,
      result: 'pass' as const,
      departmentId: dept.id,
    }
  })
}

export function buildCareTeam(input: {
  incidentDepartment: string | null | undefined
  rootCauseDiagnosis: RootCauseDiagnosis | null
  treatment: StructuredTreatment | null
}): HospitalCareTeam {
  const intake = requireStaff('intake')
  const lab = requireStaff('lab')
  const chief = requireStaff('chief')
  const treatment = requireStaff('treatment')
  const recheck = requireStaff('recheck')

  const specialist = input.incidentDepartment
    ? staffForDepartment(input.incidentDepartment)
    : null

  const target =
    input.treatment?.target ??
    (input.rootCauseDiagnosis
      ? rootCauseToTreatmentTarget(input.rootCauseDiagnosis.rootCauseType)
      : null)
  const treatmentOwner = specialistForTreatmentTarget(target) ?? specialist

  const assignedSummary = specialist
    ? `${chief.name} → ${specialist.name}`
    : chief.name

  return {
    intake,
    lab,
    chief,
    specialist,
    treatmentOwner,
    treatment,
    recheck,
    assignedSummary,
  }
}

export function projectHospitalCare(input: {
  incidentDepartment: string | null | undefined
  diagnosisStatus: 'critical' | 'clear' | 'unknown' | null
  rootCauseDiagnosis: RootCauseDiagnosis | null
  treatment: StructuredTreatment | null
}): HospitalCareProjection {
  return {
    careTeam: buildCareTeam(input),
    tests: buildLabTests({
      incidentDepartment: input.incidentDepartment,
      diagnosisStatus: input.diagnosisStatus,
    }),
  }
}

export function listStaffForApi(): HospitalStaffMember[] {
  return listHospitalStaff()
}
