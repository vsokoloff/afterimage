/**
 * Local agent fixtures for the Lucid command center.
 * Auth Agent hospital path is grounded in GET /api/visit (real detector).
 * Other agents and non-looping health checks are mock / stub.
 */

/** @typedef {'healthy' | 'degraded' | 'critical' | 'in_hospital' | 'cleared'} AgentStatus */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   role: string
 *   skills: string[]
 *   status: AgentStatus
 *   healthScore: number
 *   currentActivity: string
 *   hospitalEligible: boolean
 *   usesRealVisit: boolean
 *   healthByDepartment: Array<{
 *     id: string
 *     name: string
 *     status: 'ok' | 'abnormal' | 'stub'
 *     note: string
 *     real: boolean
 *   }>
 *   memory: {
 *     learned: string[]
 *     failures: string[]
 *     successes: string[]
 *   }
 * }} Agent
 */

/** @type {Agent[]} */
export const agents = [
  {
    id: 'auth',
    name: 'Auth Agent',
    role: 'Authentication & session coding agent',
    skills: ['auth flows', 'session tokens', 'pytest', 'file edits'],
    status: 'critical',
    healthScore: 28,
    currentActivity: 'Stuck rewriting auth.py — alternating fallbacks',
    hospitalEligible: true,
    usesRealVisit: true,
    healthByDepartment: [
      {
        id: 'looping',
        name: 'Looping',
        status: 'abnormal',
        note: 'repeated-file-state on auth.py (real detector)',
        real: true,
      },
      {
        id: 'memory',
        name: 'Memory',
        status: 'stub',
        note: 'Mock — department not shipped',
        real: false,
      },
      {
        id: 'instructions',
        name: 'Instructions',
        status: 'stub',
        note: 'Mock — will surface as root cause via case notes',
        real: false,
      },
      {
        id: 'tools',
        name: 'Tools',
        status: 'stub',
        note: 'Mock — department not shipped',
        real: false,
      },
      {
        id: 'cost',
        name: 'Cost',
        status: 'stub',
        note: 'Mock — department not shipped',
        real: false,
      },
    ],
    memory: {
      learned: [],
      failures: [
        'Reverted auth.py to a prior hash after conflicting test feedback',
        'Treated backwards-compat and deprecation removal as equal priority',
      ],
      successes: ['Isolated get_user path before the loop began'],
    },
  },
  {
    id: 'appy',
    name: 'Appy',
    role: 'Application scaffold & product wiring',
    skills: ['routing', 'API glue', 'feature flags'],
    status: 'healthy',
    healthScore: 92,
    currentActivity: 'Wiring settings page to local config',
    hospitalEligible: false,
    usesRealVisit: false,
    healthByDepartment: mockHealthyDepartments(),
    memory: {
      learned: ['Prefer local config over env for demo toggles'],
      failures: [],
      successes: ['Shipped settings page without regressing auth'],
    },
  },
  {
    id: 'test',
    name: 'Test Agent',
    role: 'Test authoring & regression hunter',
    skills: ['node:test', 'fixtures', 'assertions'],
    status: 'healthy',
    healthScore: 88,
    currentActivity: 'Watching detect-loop coverage',
    hospitalEligible: false,
    usesRealVisit: false,
    healthByDepartment: mockHealthyDepartments(),
    memory: {
      learned: ['Assert shortHash equality on A→B→A, not full content'],
      failures: [],
      successes: ['Locked visit API contract in tests'],
    },
  },
  {
    id: 'research',
    name: 'Research Agent',
    role: 'Docs & prior-art scout',
    skills: ['web search', 'summaries', 'citations'],
    status: 'degraded',
    healthScore: 61,
    currentActivity: 'Re-reading the same Looping notes (mock)',
    hospitalEligible: true,
    usesRealVisit: false,
    healthByDepartment: [
      ...mockHealthyDepartments().map((d) =>
        d.id === 'memory'
          ? {
              ...d,
              status: 'abnormal',
              note: 'Mock — repeated research pattern (not real)',
              real: false,
            }
          : d,
      ),
    ],
    memory: {
      learned: [],
      failures: ['Re-summarized looping department docs twice (mock)'],
      successes: ['Found SHA-256 file-state prior art'],
    },
  },
  {
    id: 'frontend',
    name: 'Frontend Agent',
    role: 'UI / dashboard builder',
    skills: ['SPA shell', 'CSS', 'a11y'],
    status: 'healthy',
    healthScore: 95,
    currentActivity: 'Idle — last shipped command center chrome',
    hospitalEligible: false,
    usesRealVisit: false,
    healthByDepartment: mockHealthyDepartments(),
    memory: {
      learned: ['Hospital language only in labels; chrome stays developer-tool'],
      failures: [],
      successes: ['Sidebar + Agents default route'],
    },
  },
  {
    id: 'data',
    name: 'Data Agent',
    role: 'Schemas, fixtures, trace shaping',
    skills: ['fixtures', 'JSON APIs', 'hashes'],
    status: 'healthy',
    healthScore: 90,
    currentActivity: 'Serving Auth visit fixture',
    hospitalEligible: false,
    usesRealVisit: false,
    healthByDepartment: mockHealthyDepartments(),
    memory: {
      learned: ['Root cause stays in case notes, not UI inference'],
      failures: [],
      successes: ['authWriterCase recheck has no loop'],
    },
  },
  {
    id: 'ops',
    name: 'Ops Agent',
    role: 'Local runtime & process health',
    skills: ['ports', 'process watch', 'logs'],
    status: 'healthy',
    healthScore: 97,
    currentActivity: 'Lucid server on :3000',
    hospitalEligible: false,
    usesRealVisit: false,
    healthByDepartment: mockHealthyDepartments(),
    memory: {
      learned: ['EADDRINUSE → open existing dashboard'],
      failures: [],
      successes: ['Bound 127.0.0.1 only'],
    },
  },
]

function mockHealthyDepartments() {
  return [
    { id: 'looping', name: 'Looping', status: 'ok', note: 'Mock clear', real: false },
    { id: 'memory', name: 'Memory', status: 'stub', note: 'Mock — not shipped', real: false },
    { id: 'instructions', name: 'Instructions', status: 'stub', note: 'Mock — not shipped', real: false },
    { id: 'tools', name: 'Tools', status: 'stub', note: 'Mock — not shipped', real: false },
    { id: 'cost', name: 'Cost', status: 'stub', note: 'Mock — not shipped', real: false },
  ]
}

/** Deterministic task → agent suggestions for the routing box. */
export function suggestAgents(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const rules = [
    { re: /auth|login|session|oauth|token/, ids: ['auth', 'test'] },
    { re: /test|spec|assert|coverage/, ids: ['test', 'data'] },
    { re: /ui|css|dashboard|frontend|page/, ids: ['frontend', 'appy'] },
    { re: /research|docs|prior|paper/, ids: ['research', 'data'] },
    { re: /data|fixture|schema|hash/, ids: ['data', 'test'] },
    { re: /ops|port|server|runtime|deploy/, ids: ['ops', 'appy'] },
    { re: /app|feature|wire|scaffold/, ids: ['appy', 'frontend'] },
    { re: /loop|hospital|fix|diagnose/, ids: ['auth', 'ops'] },
  ]

  for (const rule of rules) {
    if (rule.re.test(q)) {
      return rule.ids.map((id) => agents.find((a) => a.id === id)).filter(Boolean)
    }
  }

  return [agents.find((a) => a.id === 'appy'), agents.find((a) => a.id === 'research')].filter(
    Boolean,
  )
}

/** Seed activity feed (mutated at runtime when hospital events fire). */
export const activitySeed = [
  {
    id: 'a1',
    at: '2026-08-23T20:12:00Z',
    kind: 'system',
    text: 'Lucid local runtime started',
  },
  {
    id: 'a2',
    at: '2026-08-23T20:14:00Z',
    kind: 'agent',
    agentId: 'ops',
    text: 'Ops Agent bound dashboard on 127.0.0.1:3000',
  },
  {
    id: 'a3',
    at: '2026-08-23T20:18:00Z',
    kind: 'agent',
    agentId: 'auth',
    text: 'Auth Agent health dropped — looping signal pending hospital',
  },
  {
    id: 'a4',
    at: '2026-08-23T20:22:00Z',
    kind: 'agent',
    agentId: 'test',
    text: 'Test Agent confirmed detect-loop fixtures green',
  },
  {
    id: 'a5',
    at: '2026-08-23T20:28:00Z',
    kind: 'agent',
    agentId: 'research',
    text: 'Research Agent (mock) re-opened Looping department notes',
  },
]

export const hospitalDepartments = [
  {
    id: 'looping',
    name: 'Looping',
    real: true,
    disease: 'repeated-file-state',
  },
  {
    id: 'memory',
    name: 'Memory',
    real: false,
    disease: 'forgotten-failures',
  },
  {
    id: 'instructions',
    name: 'Instructions',
    real: false,
    disease: 'conflicting-goals',
  },
  {
    id: 'tools',
    name: 'Tools',
    real: false,
    disease: 'wrong-tool',
  },
  {
    id: 'cost',
    name: 'Cost',
    real: false,
    disease: 'excessive-retries',
  },
]
