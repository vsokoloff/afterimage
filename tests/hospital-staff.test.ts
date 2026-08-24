import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  listHospitalStaff,
  staffForDepartment,
  buildLabTests,
  projectHospitalCare,
  specialistForTreatmentTarget,
} from '../src/hospital/index.ts'

describe('hospital staff catalog', () => {
  it('lists built-in staff with Loop on duty and other specialists stub', () => {
    const staff = listHospitalStaff()
    const ids = staff.map((member) => member.id)

    assert.ok(ids.includes('intake'))
    assert.ok(ids.includes('lab'))
    assert.ok(ids.includes('chief'))
    assert.ok(ids.includes('treatment'))
    assert.ok(ids.includes('recheck'))
    assert.ok(ids.includes('specialist-looping'))
    assert.ok(ids.includes('specialist-memory'))

    assert.equal(staffForDepartment('looping')?.status, 'on_duty')
    assert.equal(staffForDepartment('memory')?.status, 'stub')
    assert.equal(staffForDepartment('instructions')?.status, 'stub')
    assert.equal(staffForDepartment('tools')?.status, 'stub')
    assert.equal(staffForDepartment('cost')?.status, 'stub')

    assert.ok(staff.every((member) => member.name !== 'Uma' && member.name !== 'Gitty'))
  })

  it('projects care team to Loop Doctor for looping incidents', () => {
    const projection = projectHospitalCare({
      incidentDepartment: 'looping',
      diagnosisStatus: 'critical',
      rootCauseDiagnosis: {
        rootCauseType: 'conflicting_instructions',
        title: 'Conflicting instructions',
        explanation: 'Two rules fight.',
        confidence: 0.9,
        evidenceEventIds: ['a', 'b'],
        affectedComponent: 'instructions',
      },
      treatment: null,
    })

    assert.equal(projection.careTeam.specialist?.id, 'specialist-looping')
    assert.match(projection.careTeam.assignedSummary, /Chief Doctor → Loop Doctor/)
    assert.equal(projection.careTeam.treatmentOwner?.id, 'specialist-instructions')

    const looping = projection.tests.find((test) => test.departmentId === 'looping')
    const memory = projection.tests.find((test) => test.departmentId === 'memory')
    assert.equal(looping?.result, 'warn')
    assert.equal(memory?.result, 'skip')
  })

  it('maps treatment targets to specialists', () => {
    assert.equal(specialistForTreatmentTarget('instructions')?.id, 'specialist-instructions')
    assert.equal(specialistForTreatmentTarget('memory_policy')?.id, 'specialist-memory')
    assert.equal(specialistForTreatmentTarget('tool_configuration')?.id, 'specialist-tools')
    assert.equal(specialistForTreatmentTarget('retry_policy')?.id, 'specialist-cost')
    assert.equal(specialistForTreatmentTarget('evaluator_test')?.id, 'specialist-looping')
  })

  it('marks stub department labs as skip', () => {
    const tests = buildLabTests({
      incidentDepartment: 'looping',
      diagnosisStatus: 'critical',
    })
    assert.ok(tests.some((test) => test.result === 'skip'))
    assert.ok(tests.some((test) => test.departmentId === 'looping' && test.result === 'warn'))
  })
})
