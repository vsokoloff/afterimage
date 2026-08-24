import {
  activitySeed,
  agents as agentFixtures,
  hospitalDepartments,
  suggestAgents,
} from './data/agents.js'

const content = document.querySelector('#content')
const crumb = document.querySelector('#crumb')
const bootError = document.querySelector('#boot-error')
const nav = document.querySelector('#nav')

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const wait = (ms) => (reduced ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)))

/** @type {typeof agentFixtures} */
let agents = structuredClone(agentFixtures)
/** @type {typeof activitySeed} */
let activity = structuredClone(activitySeed)
/** @type {Record<string, any>} */
const visitCache = {}
/** @type {Record<string, HospitalState>} */
const hospitalState = {}

/**
 * @typedef {{
 *   step: 'tests' | 'diagnosis' | 'root' | 'treatment' | 'recheck' | 'cleared'
 *   tests: Array<{ id: string, name: string, result: 'pending' | 'clear' | 'abnormal' | 'stub', detail: string, real: boolean }>
 *   testsRunning: boolean
 *   treatmentSimulated: boolean
 *   recheckDone: boolean
 * }} HospitalState
 */

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function parseRoute() {
  const raw = (location.hash || '#/agents').replace(/^#/, '')
  const parts = raw.split('/').filter(Boolean)
  const page = parts[0] || 'agents'

  if (page === 'agents' && parts[1] && parts[2] === 'hospital') {
    return { page: 'agent-hospital', agentId: parts[1] }
  }
  if (page === 'agents' && parts[1]) {
    return { page: 'agent', agentId: parts[1] }
  }
  if (page === 'hospital') return { page: 'hospital' }
  if (page === 'activity') return { page: 'activity' }
  if (page === 'memory') return { page: 'memory' }
  return { page: 'agents' }
}

function setActiveNav(route) {
  const key =
    route.page === 'agent' || route.page === 'agent-hospital' || route.page === 'agents'
      ? route.page === 'agent-hospital'
        ? 'hospital'
        : 'agents'
      : route.page

  nav.querySelectorAll('.nav-item').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === key)
  })
}

function getAgent(id) {
  return agents.find((a) => a.id === id) ?? null
}

function statusBadge(status) {
  const label =
    {
      healthy: 'Healthy',
      degraded: 'Degraded',
      critical: 'Unhealthy',
      in_hospital: 'In hospital',
      cleared: 'Cleared',
    }[status] ?? status
  return el('span', `badge badge--${status}`, label)
}

function healthClass(score) {
  if (score < 40) return 'is-low'
  if (score < 70) return 'is-mid'
  return ''
}

function pushActivity(text, agentId = null, kind = 'hospital') {
  activity = [
    {
      id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      at: new Date().toISOString(),
      kind,
      agentId,
      text,
    },
    ...activity,
  ]
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

async function loadVisit(agentId) {
  if (visitCache[agentId]) return visitCache[agentId]
  const response = await fetch('/api/visit')
  if (!response.ok) throw new Error(`Visit failed (${response.status})`)
  const data = await response.json()
  visitCache[agentId] = data
  return data
}

function ensureHospitalState(agent) {
  if (hospitalState[agent.id]) return hospitalState[agent.id]
  hospitalState[agent.id] = {
    step: 'tests',
    tests: hospitalDepartments.map((d) => ({
      id: d.id,
      name: d.name,
      result: 'pending',
      detail: d.real ? 'Waiting to run real detector…' : 'Mock department — not shipped',
      real: d.real,
    })),
    testsRunning: false,
    treatmentSimulated: false,
    recheckDone: false,
  }
  return hospitalState[agent.id]
}

function renderHashChain(edits) {
  const wrap = el('div', 'hash-chain')
  edits.forEach((edit, index) => {
    if (index > 0) wrap.append(el('span', 'hash-arrow', '→'))
    const chip = el(
      'span',
      `hash-chip${edit.evidenceRole === 'repeated' || edit.evidenceRole === 'first-seen' ? ' is-repeat' : ''}`,
      edit.shortHash,
    )
    wrap.append(chip)
  })
  return wrap
}

function renderTurns(edits) {
  const list = el('ol', 'turns')
  for (const edit of edits) {
    const item = el('li', `turn${edit.evidenceRole === 'repeated' ? ' is-repeat' : ''}`)
    const top = el('div', 'turn-top')
    top.append(el('span', '', `Turn ${edit.turn}`), el('code', '', edit.file))
    item.append(top, el('p', 'intent', edit.intent), el('code', 'hash', edit.shortHash))
    if (edit.evidenceRole === 'repeated') {
      item.append(el('p', 'activity-line', 'State seen before'))
    }
    if (edit.feedback) {
      const fb = el('div', 'feedback')
      fb.append(el('strong', '', `${edit.feedback.kind}: `), document.createTextNode(edit.feedback.text))
      item.append(fb)
    }
    list.append(item)
  }
  return list
}

function facts(rows) {
  const dl = el('dl', 'facts')
  for (const [label, value] of rows) {
    const row = document.createElement('div')
    row.append(el('dt', '', label), el('dd', '', value))
    dl.append(row)
  }
  return dl
}

/* ─── Pages ─── */

function renderAgentsPage() {
  crumb.textContent = 'Agents'
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Agents'),
    el('p', '', 'Local command center. Route work, inspect health, send broken agents to Hospital.'),
  )

  const routeBox = el('div', 'route-box')
  const label = el('label', '', 'What needs to get done?')
  label.htmlFor = 'task-input'
  const row = el('div', 'route-row')
  const input = document.createElement('input')
  input.id = 'task-input'
  input.type = 'text'
  input.placeholder = 'e.g. fix auth loop, write tests, research looping…'
  const routeBtn = el('button', 'btn btn-primary', 'Route')
  routeBtn.type = 'button'
  row.append(input, routeBtn)
  const suggestions = el('ul', 'suggestions')
  routeBox.append(label, row, suggestions)

  const applySuggestions = () => {
    suggestions.replaceChildren()
    for (const agent of suggestAgents(input.value)) {
      const li = el('li', '')
      const link = el('a', 'suggestion', '')
      link.href = `#/agents/${agent.id}`
      link.append(el('strong', '', agent.name), document.createTextNode(agent.role))
      li.append(link)
      suggestions.append(li)
    }
  }

  routeBtn.addEventListener('click', applySuggestions)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') applySuggestions()
  })

  const toolbar = el('div', 'toolbar')
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = 'Search agents…'
  search.setAttribute('aria-label', 'Search agents')
  toolbar.append(search)

  const grid = el('div', 'agent-grid')

  const paintCards = () => {
    const q = search.value.trim().toLowerCase()
    grid.replaceChildren()
    const list = agents.filter((a) => {
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.skills.some((s) => s.toLowerCase().includes(q))
      )
    })
    for (const agent of list) {
      grid.append(agentCard(agent))
    }
    if (!list.length) grid.append(el('p', 'empty', 'No agents match.'))
  }

  search.addEventListener('input', paintCards)
  paintCards()

  content.append(head, routeBox, toolbar, grid)
}

function agentCard(agent) {
  const card = el('button', 'agent-card', '')
  card.type = 'button'
  card.addEventListener('click', () => {
    location.hash = `#/agents/${agent.id}`
  })

  const top = el('div', 'agent-card-top')
  top.append(el('h2', '', agent.name), statusBadge(agent.status))
  card.append(top, el('p', 'role', agent.role))

  const skills = el('div', 'meta-row')
  agent.skills.slice(0, 3).forEach((skill) => skills.append(el('span', 'chip', skill)))
  card.append(skills)

  card.append(el('p', 'activity-line', agent.currentActivity))

  const meter = el('div', 'health-meter')
  const bar = el('div', `health-bar ${healthClass(agent.healthScore)}`, '')
  const fill = document.createElement('span')
  fill.style.width = `${agent.healthScore}%`
  bar.append(fill)
  meter.append(bar, el('span', 'health-score', `${agent.healthScore}%`))
  card.append(meter)

  const actions = el('div', 'card-actions')
  const view = el('span', 'btn btn-ghost', 'View')
  actions.append(view)
  card.append(actions)
  return card
}

function renderAgentProfile(agentId) {
  const agent = getAgent(agentId)
  if (!agent) {
    location.hash = '#/agents'
    return
  }

  crumb.textContent = `Agents / ${agent.name}`
  content.replaceChildren()

  const profile = el('div', 'profile')
  const hero = el('div', 'profile-hero')
  const left = document.createElement('div')
  left.append(el('h1', '', agent.name), el('p', 'role', agent.role))
  const badges = el('div', 'meta-row')
  badges.append(statusBadge(agent.status))
  if (agent.usesRealVisit) {
    badges.append(el('span', 'tag-real', 'Hospital: real visit API'))
  }
  left.append(badges)
  hero.append(left)

  const actions = el('div', 'actions')
  const back = el('button', 'btn', '← Agents')
  back.type = 'button'
  back.addEventListener('click', () => {
    location.hash = '#/agents'
  })
  actions.append(back)

  if (agent.hospitalEligible && agent.status !== 'cleared') {
    const send = el('button', 'btn btn-primary', 'Send to Hospital')
    send.type = 'button'
    send.addEventListener('click', () => {
      agent.status = 'in_hospital'
      agent.currentActivity = 'Admitted to Hospital for diagnostics'
      pushActivity(`${agent.name} sent to Hospital`, agent.id)
      location.hash = `#/agents/${agent.id}/hospital`
    })
    actions.append(send)
  } else if (agent.status === 'cleared') {
    const again = el('button', 'btn', 'Open Hospital record')
    again.type = 'button'
    again.addEventListener('click', () => {
      location.hash = `#/agents/${agent.id}/hospital`
    })
    actions.append(again)
  }
  hero.append(actions)
  profile.append(hero)

  const skillsSection = el('section', 'section')
  skillsSection.append(el('h2', '', 'Skills'))
  const skills = el('div', 'meta-row')
  agent.skills.forEach((s) => skills.append(el('span', 'chip', s)))
  skillsSection.append(skills)
  profile.append(skillsSection)

  const activitySection = el('section', 'section')
  activitySection.append(
    el('h2', '', 'Current activity'),
    el('p', '', agent.currentActivity),
  )
  const meter = el('div', 'health-meter')
  const bar = el('div', `health-bar ${healthClass(agent.healthScore)}`, '')
  const fill = document.createElement('span')
  fill.style.width = `${agent.healthScore}%`
  bar.append(fill)
  meter.append(bar, el('span', 'health-score', `Health ${agent.healthScore}%`))
  activitySection.append(meter)
  profile.append(activitySection)

  const healthSection = el('section', 'section')
  healthSection.append(el('h2', '', 'Health by department'))
  const deptList = el('ul', 'dept-list')
  for (const dept of agent.healthByDepartment) {
    const item = el('li', 'dept-item')
    const top = el('div', 'dept-item-top')
    top.append(el('span', 'dept-name', dept.name))
    top.append(
      el(
        'span',
        dept.real ? 'tag-real' : 'tag-mock',
        dept.real ? 'Real' : 'Mock',
      ),
    )
    item.append(top, el('p', 'dept-note', `${dept.status} — ${dept.note}`))
    deptList.append(item)
  }
  healthSection.append(deptList)
  profile.append(healthSection)

  const mem = el('section', 'section')
  mem.append(el('h2', '', 'Memory'))
  const grid = el('div', 'section-grid')
  grid.append(
    memoryBlock('Learned', agent.memory.learned),
    memoryBlock('Failures', agent.memory.failures),
    memoryBlock('Successes', agent.memory.successes),
  )
  mem.append(grid)
  profile.append(mem)

  content.append(profile)
}

function memoryBlock(title, items) {
  const box = el('div', 'section')
  box.append(el('h2', '', title))
  if (!items.length) {
    box.append(el('p', 'empty', 'None yet.'))
    return box
  }
  const list = el('ul', 'memory-list')
  for (const item of items) {
    const li = el('li', 'memory-item')
    li.append(el('p', '', item))
    list.append(li)
  }
  box.append(list)
  return box
}

async function renderHospitalVisit(agentId) {
  const agent = getAgent(agentId)
  if (!agent) {
    location.hash = '#/agents'
    return
  }

  crumb.textContent = `Hospital / ${agent.name}`
  content.replaceChildren()
  const layout = el('div', 'hospital-layout')
  content.append(layout)

  const state = ensureHospitalState(agent)

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', `${agent.name} — Hospital`),
    el(
      'p',
      '',
      agent.usesRealVisit
        ? 'Diagnostics use the real Looping detector via /api/visit. Other departments are labeled mock.'
        : 'This agent uses mock hospital data only — no real detector backend.',
    ),
  )
  layout.append(head)

  const steps = el('ul', 'steps')
  const stepOrder = ['tests', 'diagnosis', 'root', 'treatment', 'recheck', 'cleared']
  const stepLabels = {
    tests: 'Tests',
    diagnosis: 'Diagnosis',
    root: 'Root cause',
    treatment: 'Treatment',
    recheck: 'Recheck',
    cleared: 'Cleared',
  }
  const currentIdx = stepOrder.indexOf(state.step)
  for (const [i, key] of stepOrder.entries()) {
    const pill = el(
      'li',
      `step-pill${i < currentIdx ? ' is-done' : ''}${i === currentIdx ? ' is-current' : ''}`,
      stepLabels[key],
    )
    steps.append(pill)
  }
  layout.append(steps)

  if (!agent.usesRealVisit) {
    layout.append(renderMockHospital(agent, state, layout))
    return
  }

  let visit
  try {
    visit = await loadVisit(agentId)
    bootError.hidden = true
  } catch (error) {
    console.error(error)
    bootError.hidden = false
    layout.append(el('p', 'empty', 'Could not load /api/visit.'))
    return
  }

  await renderAuthHospital(agent, state, visit, layout)
}

function renderMockHospital(agent, state, layout) {
  const panel = el('section', 'section')
  panel.append(
    el('h2', '', 'Mock admission'),
    el(
      'p',
      'panel-sub',
      `${agent.name} is eligible for Hospital UX, but there is no real detector for this agent yet.`,
    ),
    el('p', 'notice', 'Mock only — do not treat as a real diagnosis.'),
  )
  const back = el('button', 'btn', 'Return to agent')
  back.type = 'button'
  back.addEventListener('click', () => {
    location.hash = `#/agents/${agent.id}`
  })
  const actions = el('div', 'actions')
  actions.append(back)
  panel.append(actions)
  layout.append(panel)
  return panel
}

async function renderAuthHospital(agent, state, visit, layout) {
  const panel = el('section', 'section')
  layout.append(panel)

  const paint = async () => {
    panel.replaceChildren()

    if (state.step === 'tests') {
      panel.append(
        el('p', 'panel-title', 'Department tests'),
        el('p', 'panel-sub', 'Progressive checks. Only Looping is a real shipped detector.'),
      )
      const stack = el('div', 'stack')
      for (const test of state.tests) {
        const row = el('div', 'test-row')
        row.append(el('div', 'test-name', test.name))
        row.append(el('div', 'test-detail', test.detail))
        const resultClass =
          test.result === 'abnormal'
            ? 'is-abnormal'
            : test.result === 'clear'
              ? 'is-clear'
              : test.result === 'stub'
                ? 'is-stub'
                : 'is-pending'
        row.append(el('div', `test-result ${resultClass}`, test.result))
        stack.append(row)
      }
      panel.append(stack)

      const actions = el('div', 'actions')
      if (!state.testsRunning && state.tests.every((t) => t.result === 'pending')) {
        const run = el('button', 'btn btn-primary', 'Run diagnostics')
        run.type = 'button'
        run.addEventListener('click', () => void runDiagnostics(agent, state, visit, paint))
        actions.append(run)
      } else if (!state.testsRunning && state.tests.some((t) => t.result !== 'pending')) {
        const next = el('button', 'btn btn-primary', 'Continue to diagnosis')
        next.type = 'button'
        next.addEventListener('click', () => {
          state.step = 'diagnosis'
          paintSteps()
          void paint()
        })
        actions.append(next)
      }
      panel.append(actions)
      return
    }

    if (state.step === 'diagnosis') {
      panel.append(
        el('p', 'panel-title', 'Diagnosis'),
        el('p', 'panel-sub', 'Symptom + A→B→A evidence from the Looping detector.'),
      )
      panel.append(
        facts([
          ['Symptom', visit.symptom],
          ['Department', `${visit.hospital.department} / ${visit.hospital.disease}`],
          ['Evidence', visit.diagnosis.evidence],
          ['File', visit.diagnosis.file ?? '—'],
          [
            'Loop',
            visit.diagnosis.firstSeenTurn != null
              ? `Turn ${visit.diagnosis.firstSeenTurn} → … → turn ${visit.diagnosis.repeatedAtTurn}`
              : '—',
          ],
        ]),
      )
      panel.append(renderHashChain(visit.edits))
      panel.append(renderTurns(visit.edits))
      const actions = el('div', 'actions')
      const next = el('button', 'btn btn-primary', 'View root cause')
      next.type = 'button'
      next.addEventListener('click', () => {
        state.step = 'root'
        paintSteps()
        void paint()
      })
      actions.append(next)
      panel.append(actions)
      return
    }

    if (state.step === 'root') {
      panel.append(
        el('p', 'panel-title', 'Root cause'),
        el(
          'p',
          'panel-sub',
          'From case / backend notes — not inferred by this UI.',
        ),
      )
      panel.append(
        facts([
          ['Title', visit.rootCause.title],
          ['Summary', visit.rootCause.summary],
          ...visit.rootCause.instructions.map((item) => [item.label, item.text]),
        ]),
      )
      panel.append(el('p', 'notice notice--info', 'Source: visit case data via /api/visit'))
      const actions = el('div', 'actions')
      const next = el('button', 'btn btn-primary', 'Open treatment')
      next.type = 'button'
      next.addEventListener('click', () => {
        state.step = 'treatment'
        paintSteps()
        void paint()
      })
      actions.append(next)
      panel.append(actions)
      return
    }

    if (state.step === 'treatment') {
      panel.append(
        el('p', 'panel-title', 'Treatment'),
        el(
          'p',
          'panel-sub',
          'Prescribed instruction change. Apply via CLI — this UI does not patch your agent.',
        ),
      )
      panel.append(
        facts([
          ['Target', visit.treatment.target],
          ['Recommended change', visit.treatment.recommendedChange],
          ['Current behavior', visit.treatment.currentBehavior],
          ['Recommended instruction', visit.treatment.recommendedInstruction],
          ['Why', visit.treatment.why],
          ['Auto-apply', visit.treatment.applied ? 'Applied' : 'Blocked — review required'],
        ]),
      )

      const cli = el('pre', 'cli-block')
      cli.append(
        el('span', 'prompt', '$ '),
        el('span', 'cmd', 'npm run lucid -- fix'),
        document.createTextNode('\n'),
        el('span', 'prompt', '# review required; no web auto-patch'),
      )
      panel.append(cli)
      panel.append(
        el(
          'p',
          'notice',
          'lucid fix prints the treatment in the terminal. There is no fake web Apply that patches code.',
        ),
      )

      const actions = el('div', 'actions')
      if (!state.treatmentSimulated) {
        const sim = el('button', 'btn btn-primary', 'Mark treatment applied (simulate)')
        sim.type = 'button'
        sim.title = 'Demo only — simulates that you ran lucid fix / applied the instruction change'
        sim.addEventListener('click', () => {
          state.treatmentSimulated = true
          pushActivity(
            `${agent.name}: treatment marked applied (simulated after lucid fix)`,
            agent.id,
          )
          void paint()
        })
        actions.append(sim)
      } else {
        panel.append(
          el('p', 'notice notice--ok', 'Simulated: treatment applied. Ready for recheck.'),
        )
        const next = el('button', 'btn btn-primary', 'Run recheck')
        next.type = 'button'
        next.addEventListener('click', () => {
          state.step = 'recheck'
          paintSteps()
          void paint()
        })
        actions.append(next)
      }
      panel.append(actions)
      return
    }

    if (state.step === 'recheck') {
      panel.append(
        el('p', 'panel-title', 'Recheck'),
        el('p', 'panel-sub', 'Post-treatment trace from the visit fixture.'),
      )

      if (!state.recheckDone) {
        const listHost = el('div', '')
        panel.append(listHost)
        listHost.append(el('p', 'activity-line', 'Replaying recheck turns…'))
        await playRecheck(listHost, visit.recheck)
        state.recheckDone = true
      }

      panel.append(renderTurns(visit.recheck))
      panel.append(
        facts([
          ['Verification', visit.verification.passed ? 'Passed' : 'Failed'],
          ['Evidence', visit.verification.evidence],
        ]),
      )
      if (visit.verification.passed) {
        panel.append(el('p', 'notice notice--ok', 'Recheck passed. No repeated state detected.'))
      }

      const actions = el('div', 'actions')
      const next = el('button', 'btn btn-primary', 'Clear & return')
      next.type = 'button'
      next.addEventListener('click', () => {
        clearAgent(agent, visit)
        state.step = 'cleared'
        paintSteps()
        void paint()
      })
      actions.append(next)
      panel.append(actions)
      return
    }

    if (state.step === 'cleared') {
      panel.append(
        el('p', 'panel-title', 'Cleared'),
        el('p', 'panel-sub', `${agent.name} returned to the command center with restored health.`),
        el('p', 'notice notice--ok', 'Health restored. New lesson written to agent memory.'),
      )
      panel.append(
        facts([
          ['Health', `${agent.healthScore}%`],
          ['Status', agent.status],
          ['Learned', agent.memory.learned[agent.memory.learned.length - 1] ?? '—'],
        ]),
      )
      const actions = el('div', 'actions')
      const back = el('button', 'btn btn-primary', 'Return to agent')
      back.type = 'button'
      back.addEventListener('click', () => {
        location.hash = `#/agents/${agent.id}`
      })
      actions.append(back)
      panel.append(actions)
    }
  }

  const paintSteps = () => {
    const stepsEl = layout.querySelector('.steps')
    if (!stepsEl) return
    const stepOrder = ['tests', 'diagnosis', 'root', 'treatment', 'recheck', 'cleared']
    const currentIdx = stepOrder.indexOf(state.step)
    stepsEl.querySelectorAll('.step-pill').forEach((pill, i) => {
      pill.classList.toggle('is-done', i < currentIdx)
      pill.classList.toggle('is-current', i === currentIdx)
    })
  }

  await paint()
}

async function runDiagnostics(agent, state, visit, paint) {
  state.testsRunning = true
  await paint()

  for (const test of state.tests) {
    await wait(380)
    if (test.id === 'looping') {
      test.result = visit.diagnosis.status === 'critical' ? 'abnormal' : 'clear'
      test.detail = visit.diagnosis.evidence
    } else {
      test.result = 'stub'
      test.detail = 'Mock — department not shipped (no real detector)'
    }
    await paint()
  }

  state.testsRunning = false
  pushActivity(`${agent.name}: department tests complete (looping real, others mock)`, agent.id)
  await paint()
}

async function playRecheck(host, edits) {
  host.replaceChildren()
  const list = el('ol', 'turns')
  host.append(list)
  for (const edit of edits) {
    const item = el('li', 'turn')
    const top = el('div', 'turn-top')
    top.append(el('span', '', `Turn ${edit.turn}`), el('code', '', edit.file))
    item.append(top, el('p', 'intent', edit.intent), el('code', 'hash', edit.shortHash))
    list.append(item)
    await wait(420)
  }
}

function clearAgent(agent, visit) {
  agent.status = 'cleared'
  agent.healthScore = 96
  agent.currentActivity = 'Back on auth.py with resolved instruction priority'
  agent.healthByDepartment = agent.healthByDepartment.map((d) =>
    d.id === 'looping'
      ? {
          ...d,
          status: 'ok',
          note: 'repeated-file-state clear after recheck (real)',
          real: true,
        }
      : d,
  )
  const lesson = `When instructions conflict (${visit.rootCause.title}), report the conflict instead of oscillating file state.`
  if (!agent.memory.learned.includes(lesson)) {
    agent.memory.learned = [lesson, ...agent.memory.learned]
  }
  agent.memory.successes = [
    'Passed Hospital recheck — no A→B→A on auth.py',
    ...agent.memory.successes,
  ]
  pushActivity(`${agent.name} cleared from Hospital — health restored`, agent.id)
}

function renderHospitalOverview() {
  crumb.textContent = 'Hospital'
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Hospital'),
    el('p', '', 'Agents that need attention, and those recently treated.'),
  )

  const needs = agents.filter((a) =>
    ['critical', 'degraded', 'in_hospital'].includes(a.status),
  )
  const treated = agents.filter((a) => a.status === 'cleared')

  const grid = el('div', 'split-two')
  grid.append(
    overviewColumn('Needs attention', needs, 'Everyone looks fine.'),
    overviewColumn('Recently treated', treated, 'No discharges yet.'),
  )
  content.append(head, grid)
}

function overviewColumn(title, list, emptyText) {
  const section = el('section', 'section')
  section.append(el('h2', '', title))
  if (!list.length) {
    section.append(el('p', 'empty', emptyText))
    return section
  }
  const items = el('ul', 'dept-list')
  for (const agent of list) {
    const li = el('li', 'dept-item')
    const top = el('div', 'dept-item-top')
    const link = el('a', 'dept-name', agent.name)
    link.href =
      agent.status === 'in_hospital' || agent.status === 'cleared'
        ? `#/agents/${agent.id}/hospital`
        : `#/agents/${agent.id}`
    top.append(link, statusBadge(agent.status))
    li.append(top, el('p', 'dept-note', agent.currentActivity))
    items.append(li)
  }
  section.append(items)
  return section
}

function renderActivity() {
  crumb.textContent = 'Activity'
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(el('h1', '', 'Activity'), el('p', '', 'Chronological local feed.'))

  const feed = el('ul', 'feed')
  for (const item of activity) {
    const li = el('li', 'feed-item')
    const top = el('div', 'feed-top')
    top.append(
      el('span', 'feed-title', item.agentId ? getAgent(item.agentId)?.name ?? item.kind : item.kind),
      el('span', 'feed-time', formatTime(item.at)),
    )
    li.append(top, el('p', 'feed-text', item.text))
    feed.append(li)
  }
  content.append(head, feed)
}

function renderMemory() {
  crumb.textContent = 'Memory'
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Memory'),
    el('p', '', 'Searchable lessons across agents.'),
  )

  const toolbar = el('div', 'toolbar')
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = 'Search learned / failures / successes…'
  search.setAttribute('aria-label', 'Search memory')
  toolbar.append(search)

  const list = el('ul', 'memory-list')

  const paint = () => {
    const q = search.value.trim().toLowerCase()
    list.replaceChildren()
    const rows = []
    for (const agent of agents) {
      for (const kind of ['learned', 'failures', 'successes']) {
        for (const text of agent.memory[kind]) {
          if (q && !text.toLowerCase().includes(q) && !agent.name.toLowerCase().includes(q)) {
            continue
          }
          rows.push({ agent, kind, text })
        }
      }
    }
    if (!rows.length) {
      const empty = el('li', 'memory-item')
      empty.append(el('p', 'empty', 'No memories match.'))
      list.append(empty)
      return
    }
    for (const row of rows) {
      const li = el('li', 'memory-item')
      const top = el('div', 'dept-item-top')
      const link = el('a', 'dept-name', row.agent.name)
      link.href = `#/agents/${row.agent.id}`
      top.append(link, el('span', 'chip', row.kind))
      li.append(top, el('p', '', row.text))
      list.append(li)
    }
  }

  search.addEventListener('input', paint)
  paint()
  content.append(head, toolbar, list)
}

async function render() {
  const route = parseRoute()
  setActiveNav(route)

  try {
    if (route.page === 'agents') renderAgentsPage()
    else if (route.page === 'agent') renderAgentProfile(route.agentId)
    else if (route.page === 'agent-hospital') await renderHospitalVisit(route.agentId)
    else if (route.page === 'hospital') renderHospitalOverview()
    else if (route.page === 'activity') renderActivity()
    else if (route.page === 'memory') renderMemory()
    else renderAgentsPage()
    bootError.hidden = true
  } catch (error) {
    console.error(error)
    bootError.hidden = false
  }
}

window.addEventListener('hashchange', () => void render())
void render()
