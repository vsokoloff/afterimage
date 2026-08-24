import type { DepartmentInfo, DiseasePlugin } from './types.ts'
import { costDiseases } from './cost/index.ts'
import { instructionsDiseases } from './instructions/index.ts'
import { loopingDiseases } from './looping/index.ts'
import { memoryDiseases } from './memory/index.ts'
import { scopeDiseases } from './scope/index.ts'

function stubDepartment(
  id: string,
  name: string,
  description: string,
  diseases: Array<{ id: string; name: string; description: string }>,
): { info: DepartmentInfo; plugins: DiseasePlugin[] } {
  const plugins: DiseasePlugin[] = diseases.map((disease) => ({
    id: disease.id,
    department: id,
    name: disease.name,
    description: disease.description,
    status: 'stub',
    detect: () => null,
    diagnose: () => ({
      department: id,
      disease: disease.id,
      status: 'clear',
      abnormality: null,
      evidence: `${disease.name} (${name}) is not implemented yet.`,
      symptom: 'Not implemented',
      rootCause: null,
    }),
    recommendFix: () => null,
    verify: () => ({
      passed: true,
      evidence: 'Stub disease — nothing to verify.',
      abnormality: null,
    }),
  }))

  return {
    info: {
      id,
      name,
      description,
      diseases: plugins.map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        status: plugin.status,
        description: plugin.description,
      })),
    },
    plugins,
  }
}

const tools = stubDepartment(
  'tools',
  'Tools',
  'Bad schemas, wrong tool selection, ignoring tool output.',
  [
    {
      id: 'bad-schemas',
      name: 'Bad schemas',
      description: 'Tool definitions confuse the model into invalid calls.',
    },
    {
      id: 'wrong-tool',
      name: 'Wrong tool selection',
      description: 'Agent picks an inappropriate tool for the task.',
    },
    {
      id: 'ignoring-output',
      name: 'Ignoring tool output',
      description: 'Agent continues as if tool results were never read.',
    },
  ],
)

function departmentInfo(
  id: string,
  name: string,
  description: string,
  plugins: DiseasePlugin[],
): DepartmentInfo {
  return {
    id,
    name,
    description,
    diseases: plugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      status: plugin.status,
      description: plugin.description,
    })),
  }
}

const loopingInfo = departmentInfo(
  'looping',
  'Looping',
  'File-state loops, repeated tool calls, oscillation, undo/redo.',
  loopingDiseases,
)

const memoryInfo = departmentInfo(
  'memory',
  'Memory',
  'Forgotten failures, repeated research, constraint forgetting, prior-fix regression.',
  memoryDiseases,
)

const instructionsInfo = departmentInfo(
  'instructions',
  'Instructions',
  'Conflicting goals, ambiguous priority, instruction amnesia.',
  instructionsDiseases,
)

const scopeInfo = departmentInfo(
  'scope',
  'Scope',
  'Change blast radius and localized-task overreach.',
  scopeDiseases,
)

const costInfo = departmentInfo(
  'cost',
  'Cost / Efficiency',
  'Token explosion, rereading files, excessive retries, redundant rewrites.',
  costDiseases,
)

const allPlugins: DiseasePlugin[] = [
  ...loopingDiseases,
  ...memoryDiseases,
  ...instructionsDiseases,
  ...scopeDiseases,
  ...tools.plugins,
  ...costDiseases,
]

export const departments: DepartmentInfo[] = [
  loopingInfo,
  memoryInfo,
  instructionsInfo,
  scopeInfo,
  tools.info,
  costInfo,
]

export function listDepartments(): DepartmentInfo[] {
  return departments
}

export function getDisease(departmentId: string, diseaseId: string): DiseasePlugin | null {
  return (
    allPlugins.find(
      (plugin) => plugin.department === departmentId && plugin.id === diseaseId,
    ) ?? null
  )
}

export function getShippedDiseases(): DiseasePlugin[] {
  return allPlugins.filter((plugin) => plugin.status === 'shipped')
}

/** Default shipped disease for today’s hospital: Looping → repeated-file-state. */
export function getPrimaryDisease(): DiseasePlugin {
  const disease = getDisease('looping', 'repeated-file-state')
  if (!disease) throw new Error('Primary disease repeated-file-state is missing.')
  return disease
}

export type {
  Abnormality,
  AgentTrace,
  DepartmentInfo,
  DiagnosisResult,
  DiseasePlugin,
  IncidentContext,
  ProjectInstruction,
  TreatmentPlan,
  VerificationResult,
} from './types.ts'
export { resolveTraceEdits, resolveTraceEvents, resolveTraceFileWrites } from './types.ts'
export { repeatedFileState } from './looping/index.ts'
export {
  detectLoopFromFileWrites,
  detectRepeatedFileState,
  fileWritesFromTrace,
  formatRepeatedFileStateEvidence,
  hashContent,
  shortDigest,
  shortHash,
} from './looping/index.ts'
export { scopeExplosion } from './scope/index.ts'
export { priorFixRegressed } from './memory/index.ts'
export { instructionAmnesia } from './instructions/index.ts'
export { redundantRewrite } from './cost/index.ts'
