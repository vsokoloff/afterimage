import type { DepartmentInfo, DiseasePlugin } from './types.ts'
import { loopingDiseases } from './looping/index.ts'

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

const memory = stubDepartment(
  'memory',
  'Memory',
  'Forgotten failures, repeated research, constraint forgetting.',
  [
    {
      id: 'forgotten-failures',
      name: 'Forgotten failures',
      description: 'Agent retries approaches that already failed in this session.',
    },
    {
      id: 'repeated-research',
      name: 'Repeated research',
      description: 'Agent re-discovers the same facts without retaining them.',
    },
    {
      id: 'constraint-forgetting',
      name: 'Constraint forgetting',
      description: 'Agent drops stated constraints after a few turns.',
    },
  ],
)

const instructions = stubDepartment(
  'instructions',
  'Instructions',
  'Conflicting goals, ambiguous priority, instruction thrash.',
  [
    {
      id: 'conflicting-goals',
      name: 'Conflicting goals',
      description: 'Two requirements cannot both be satisfied; agent oscillates.',
    },
    {
      id: 'ambiguous-priority',
      name: 'Ambiguous priority',
      description: 'No clear ranking among competing instructions.',
    },
  ],
)

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

const cost = stubDepartment(
  'cost',
  'Cost / Efficiency',
  'Token explosion, rereading files, excessive retries.',
  [
    {
      id: 'token-explosion',
      name: 'Token explosion',
      description: 'Context or output size grows without useful progress.',
    },
    {
      id: 'rereading-files',
      name: 'Rereading files',
      description: 'Agent repeatedly reads the same file without need.',
    },
    {
      id: 'excessive-retries',
      name: 'Excessive retries',
      description: 'Retry budget burns with no change in strategy.',
    },
  ],
)

const loopingInfo: DepartmentInfo = {
  id: 'looping',
  name: 'Looping',
  description: 'File-state loops, repeated tool calls, oscillation, undo/redo.',
  diseases: loopingDiseases.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    status: plugin.status,
    description: plugin.description,
  })),
}

const allPlugins: DiseasePlugin[] = [
  ...loopingDiseases,
  ...memory.plugins,
  ...instructions.plugins,
  ...tools.plugins,
  ...cost.plugins,
]

export const departments: DepartmentInfo[] = [
  loopingInfo,
  memory.info,
  instructions.info,
  tools.info,
  cost.info,
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

export type { Abnormality, AgentTrace, DepartmentInfo, DiagnosisResult, DiseasePlugin, IncidentContext, TreatmentPlan, VerificationResult } from './types.ts'
export { resolveTraceEdits, resolveTraceFileWrites } from './types.ts'
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
