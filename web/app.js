import { agentCharacter, moodForStatus } from './characters.js'

const content = document.querySelector('#content')
const crumb = document.querySelector('#crumb')
const bootError = document.querySelector('#boot-error')
const nav = document.querySelector('#nav')

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

  if (page === 'agents' && parts[1]) {
    return { page: 'agent', agentId: decodeURIComponent(parts[1]) }
  }
  if (page === 'incidents' && parts[1]) {
    return { page: 'incident', incidentId: parts[1] }
  }
  if (page === 'activity') return { page: 'activity' }
  if (page === 'incidents') return { page: 'incidents' }
  if (page === 'hospital') return { page: 'hospital' }
  if (page === 'memory') return { page: 'memory' }
  return { page: 'agents' }
}

function setActiveNav(route) {
  const key =
    route.page === 'agent'
      ? 'agents'
      : route.page === 'incident'
        ? 'hospital'
        : route.page
  nav.querySelectorAll('.nav-item').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === key)
  })
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

function formatDuration(ms) {
  if (ms == null) return '—'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return response.json()
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

function section(title, body) {
  const wrap = el('section', 'record-section')
  wrap.append(el('h2', 'record-section-title', title))
  if (typeof body === 'string') {
    wrap.append(el('p', 'record-copy', body))
  } else {
    wrap.append(body)
  }
  return wrap
}

function emptyState(message) {
  return el('p', 'empty', message)
}

function agentStatusBadge(status) {
  const label =
    {
      working: 'Working',
      idle: 'Idle',
      unhealthy: 'Unhealthy',
      stopped: 'Stopped',
    }[status] ?? status
  const cls =
    {
      working: 'badge badge--working',
      idle: 'badge badge--idle',
      unhealthy: 'badge badge--critical',
      stopped: 'badge badge--stopped',
    }[status] ?? 'badge'
  return el('span', cls, label)
}

function incidentStatusBadge(status, severity) {
  const label =
    {
      open: 'Open',
      in_hospital: 'In hospital',
      cleared: 'Cleared',
      closed: 'Closed',
    }[status] ?? status
  const cls =
    severity === 'critical'
      ? 'badge badge--critical'
      : status === 'cleared' || status === 'closed'
        ? 'badge badge--cleared'
        : 'badge badge--open'
  return el('span', cls, label)
}

function mascotForAgent(agent, size = 'md') {
  const mood = moodForStatus(agent.status === 'unhealthy' ? 'critical' : 'cheerful')
  const characterId = agent.characterId ?? 'ops'
  return agentCharacter(characterId, { size, mood, title: agent.name })
}

function agentLink(agentId, label) {
  const link = el('a', 'link-agent', label)
  link.href = `#/agents/${encodeURIComponent(agentId)}`
  return link
}

/* ─── Agents ─── */

function renderAgentCard(agent) {
  const card = el('button', 'agent-card', '')
  card.type = 'button'
  card.addEventListener('click', () => {
    location.hash = `#/agents/${encodeURIComponent(agent.id)}`
  })

  const top = el('div', 'agent-card-top')
  const identity = el('div', 'agent-card-identity')
  identity.append(mascotForAgent(agent, 'sm'))
  const copy = document.createElement('div')
  copy.append(el('h2', '', agent.name), el('p', 'role', agent.role ?? agent.runtime))
  identity.append(copy)
  top.append(identity, agentStatusBadge(agent.status))
  card.append(top)

  if (agent.currentActivity) {
    card.append(el('p', 'activity-line', agent.currentActivity))
  } else if (agent.status === 'idle') {
    card.append(el('p', 'activity-line muted', 'No active task'))
  } else if (agent.status === 'stopped') {
    card.append(el('p', 'activity-line muted', 'Last run stopped'))
  }

  const meta = el('div', 'meta-row')
  meta.append(el('span', 'chip', agent.runtime))
  if (agent.currentRunDurationMs != null) {
    meta.append(el('span', 'chip', formatDuration(agent.currentRunDurationMs)))
  }
  if (agent.openIncidentCount > 0) {
    meta.append(el('span', 'chip chip--fault', `${agent.openIncidentCount} incident`))
  }
  card.append(meta)

  const actions = el('div', 'card-actions')
  actions.append(el('span', 'btn btn-ghost', 'Open profile'))
  card.append(actions)
  return card
}

async function renderAgentsPage() {
  crumb.textContent = 'Agents'
  content.replaceChildren(el('p', 'activity-line', 'Loading agents…'))

  const data = await fetchJson('/api/agents')
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Agents'),
    el(
      'p',
      '',
      'Manage connected agents from persisted runs. Status and activity are derived from real observation — never invented.',
    ),
  )
  content.append(head)

  if (!data.agents.length) {
    content.append(
      emptyState(
        'No agents observed yet. Run a command with Lucid (`npm run lucid -- run -- …`) or attach a Codex stream.',
      ),
    )
    return
  }

  const toolbar = el('div', 'toolbar')
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = 'Search agents…'
  search.setAttribute('aria-label', 'Search agents')
  toolbar.append(search)
  content.append(toolbar)

  const grid = el('div', 'agent-grid')
  const paint = () => {
    const q = search.value.trim().toLowerCase()
    grid.replaceChildren()
    const list = data.agents.filter((agent) => {
      if (!q) return true
      return (
        agent.name.toLowerCase().includes(q) ||
        agent.id.toLowerCase().includes(q) ||
        (agent.role ?? '').toLowerCase().includes(q) ||
        agent.runtime.toLowerCase().includes(q)
      )
    })
    for (const agent of list) {
      grid.append(renderAgentCard(agent))
    }
    if (!list.length) grid.append(emptyState('No agents match.'))
  }
  search.addEventListener('input', paint)
  paint()
  content.append(grid)
}

async function renderAgentProfile(agentId) {
  crumb.textContent = 'Agents / …'
  content.replaceChildren(el('p', 'activity-line', 'Loading agent…'))

  const profile = await fetchJson(`/api/agents/${encodeURIComponent(agentId)}`)
  const { agent, currentRun, recentRuns, recentEvents, openIncidents, pastIncidents } = profile

  content.replaceChildren()
  crumb.textContent = `Agents / ${agent.name}`

  const layout = el('div', 'profile')
  const hero = el('div', 'profile-hero')
  const heroMain = el('div', 'profile-hero-main')
  heroMain.append(mascotForAgent(agent, 'lg'))
  const heroCopy = document.createElement('div')
  heroCopy.append(
    el('h1', '', agent.name),
    el('p', 'role', agent.role ?? 'Observed agent'),
    el('p', 'activity-line', `${agent.runtime} · ${agent.runCount} run${agent.runCount === 1 ? '' : 's'}`),
  )
  const badges = el('div', 'meta-row')
  badges.append(agentStatusBadge(agent.status))
  if (agent.openIncidentCount > 0) {
    badges.append(el('span', 'chip chip--fault', `${agent.openIncidentCount} open incident`))
  }
  heroCopy.append(badges)
  heroMain.append(heroCopy)
  hero.append(heroMain)

  const actions = el('div', 'actions')
  const back = el('button', 'btn', '← Agents')
  back.type = 'button'
  back.addEventListener('click', () => {
    location.hash = '#/agents'
  })
  actions.append(back)
  hero.append(actions)
  layout.append(hero)

  if (openIncidents.length > 0) {
    const alert = el('div', 'medical-banner')
    alert.append(
      el('p', 'medical-banner-title', 'Needs medical attention'),
      el(
        'p',
        'medical-banner-copy',
        `${openIncidents.length} unresolved incident${openIncidents.length === 1 ? '' : 's'} require Hospital diagnostics.`,
      ),
    )
    const hospitalBtn = el('button', 'btn btn-primary', 'View in Hospital')
    hospitalBtn.type = 'button'
    hospitalBtn.addEventListener('click', () => {
      location.hash = `#/incidents/${openIncidents[0].id}`
    })
    alert.append(hospitalBtn)
    layout.append(alert)
  }

  layout.append(
    section(
      'Current status',
      facts([
        ['Status', agent.status],
        ['Runtime', agent.runtime],
        ['Current activity', agent.currentActivity ?? '—'],
        ['Run duration', agent.currentRunDurationMs != null ? formatDuration(agent.currentRunDurationMs) : '—'],
        ['Last seen', formatTime(agent.lastSeenAt)],
      ]),
    ),
  )

  layout.append(
    section(
      'Current task',
      currentRun
        ? facts([
            ['Run', currentRun.id],
            ['Run status', currentRun.status],
            ['Started', formatTime(currentRun.startedAt)],
            ['Events', String(currentRun.events.length)],
            [
              'Latest prompt',
              [...currentRun.events].reverse().find((event) => event.type === 'prompt')?.text ?? '—',
            ],
          ])
        : emptyState('No active run.'),
    ),
  )

  layout.append(
    section(
      'Recent runs',
      recentRuns.length
        ? (() => {
            const list = el('ul', 'run-list')
            for (const run of recentRuns) {
              const item = el('li', 'run-list-item')
              item.append(
                el('code', 'mono', run.id),
                el('span', 'incident-meta', `${run.status} · ${formatTime(run.startedAt)}`),
              )
              list.append(item)
            }
            return list
          })()
        : emptyState('No runs recorded.'),
    ),
  )

  layout.append(
    section(
      'Recent activity',
      recentEvents.length
        ? (() => {
            const list = el('ul', 'activity-feed')
            for (const event of recentEvents.slice(0, 20)) {
              const item = el('li', 'activity-item')
              item.append(
                el('span', 'activity-time', formatTime(event.timestamp)),
                el('code', 'mono', event.type),
                el('span', '', summarizeEvent(event)),
              )
              list.append(item)
            }
            return list
          })()
        : emptyState('No events yet.'),
    ),
  )

  layout.append(
    section(
      'Open incidents',
      openIncidents.length
        ? (() => {
            const list = el('div', 'incident-list')
            for (const incident of openIncidents) {
              list.append(renderIncidentCard({ ...incident, severity: 'critical' }))
            }
            return list
          })()
        : emptyState('No open incidents.'),
    ),
  )

  layout.append(
    section(
      'Past incidents',
      pastIncidents.length
        ? (() => {
            const list = el('div', 'incident-list')
            for (const incident of pastIncidents.slice(0, 10)) {
              list.append(renderIncidentCard({ ...incident, severity: 'unknown' }))
            }
            return list
          })()
        : emptyState('No cleared incidents yet.'),
    ),
  )

  content.append(layout)
}

/* ─── Activity ─── */

async function renderActivityPage() {
  crumb.textContent = 'Activity'
  content.replaceChildren(el('p', 'activity-line', 'Loading activity…'))

  const data = await fetchJson('/api/activity')
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Activity'),
    el('p', '', 'Recent events from persisted agent runs — newest first.'),
  )
  content.append(head)

  if (!data.activity.length) {
    content.append(emptyState('No activity recorded yet.'))
    return
  }

  const list = el('ul', 'activity-feed')
  for (const item of data.activity) {
    const row = el('li', 'activity-item')
    row.append(
      el('span', 'activity-time', formatTime(item.at)),
      agentLink(item.agentId, item.agentId),
      el('code', 'mono', item.type),
      el('span', '', item.summary),
    )
    list.append(row)
  }
  content.append(list)
}

/* ─── Hospital landing ─── */

async function renderHospitalPage() {
  crumb.textContent = 'Hospital'
  content.replaceChildren(el('p', 'activity-line', 'Loading hospital queue…'))

  const data = await fetchJson('/api/incidents')
  content.replaceChildren()

  const head = el('div', 'page-head hospital-head')
  const title = el('div', 'hospital-title')
  title.append(
    el('h1', '', 'Hospital'),
    el(
      'p',
      '',
      'Diagnostic records for agents with open failures. Manager view stays on Agents; this is where you inspect and treat.',
    ),
  )
  head.append(title)
  content.append(head)

  const open = data.incidents.filter((incident) =>
    ['open', 'in_hospital'].includes(incident.status),
  )

  if (!open.length) {
    content.append(emptyState('No patients in Hospital — no open incidents.'))
    return
  }

  const list = el('div', 'incident-list')
  list.append(el('h2', 'incident-group-title', 'Needs attention'))
  for (const incident of open) {
    list.append(renderIncidentCard(incident))
  }
  content.append(list)
}

/* ─── Memory ─── */

function renderMemoryPage() {
  crumb.textContent = 'Memory'
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Memory'),
    el('p', '', 'Agent memory is not persisted in Lucid yet.'),
  )
  content.append(head)
  content.append(
    emptyState(
      'Memory department is unavailable — no real memory store is connected. Lucid will not show invented learned/failure lists.',
    ),
  )
}

/* ─── Incidents (shared list + hospital record) ─── */

function renderIncidentCard(incident) {
  const card = el('button', 'incident-card', '')
  card.type = 'button'
  card.addEventListener('click', () => {
    location.hash = `#/incidents/${incident.id}`
  })

  const top = el('div', 'incident-card-top')
  const copy = document.createElement('div')
  copy.append(
    el('h2', '', incident.title),
    el('p', 'incident-meta', `${incident.department ?? '—'} / ${incident.disease ?? '—'}`),
  )
  top.append(copy, incidentStatusBadge(incident.status, incident.severity))
  card.append(top)

  if (incident.symptom) {
    card.append(el('p', 'incident-symptom', incident.symptom))
  }

  const foot = el('div', 'incident-card-foot')
  foot.append(
    el('span', 'incident-meta', formatTime(incident.updatedAt)),
    el('span', 'btn btn-ghost', 'Open record'),
  )
  card.append(foot)
  return card
}

async function renderIncidentsPage() {
  crumb.textContent = 'Incidents'
  content.replaceChildren(el('p', 'activity-line', 'Loading incidents…'))

  const data = await fetchJson('/api/incidents')
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Incidents'),
    el('p', '', 'All incidents from local agent runs — open and recently cleared.'),
  )
  content.append(head)

  if (!data.incidents.length) {
    content.append(
      emptyState('No incidents yet. Run an agent with the Lucid observer to record file-write events.'),
    )
    return
  }

  const open = data.incidents.filter((i) => ['open', 'in_hospital'].includes(i.status))
  const cleared = data.incidents.filter((i) => ['cleared', 'closed'].includes(i.status))

  const list = el('div', 'incident-list')

  list.append(el('h2', 'incident-group-title', 'Open incidents'))
  if (open.length) {
    for (const incident of open) {
      list.append(renderIncidentCard(incident))
    }
  } else {
    list.append(emptyState('No open incidents.'))
  }

  if (cleared.length) {
    list.append(el('h2', 'incident-group-title', 'Recently cleared'))
    for (const incident of cleared) {
      list.append(renderIncidentCard(incident))
    }
  }

  content.append(list)
}

function summarizeEvent(event) {
  switch (event.type) {
    case 'prompt':
      return `${event.role ?? 'prompt'}: ${event.text}`
    case 'model_response':
      return event.reasonSummary || event.text
    case 'tool_result':
      return `${event.toolName} ok=${event.ok}`
    case 'file_write':
      return `${event.path} hash=${event.hash.slice(0, 12)}`
    case 'error':
      return event.message
    default:
      return event.type
  }
}

function renderHashChain(chain) {
  const wrap = el('div', 'hash-chain')
  chain.forEach((step, index) => {
    if (index > 0) wrap.append(el('span', 'hash-arrow', '→'))
    const chip = el(
      'span',
      `hash-chip${step.role === 'repeated' || step.role === 'first-seen' ? ' is-repeat' : ''}`,
      step.shortHash,
    )
    chip.title = `seq ${step.sequence} · ${step.path} · ${step.role}`
    wrap.append(chip)
  })
  return wrap
}

function renderRootCause(rootCauseDiagnosis, rootCauseEvidenceEvents) {
  if (!rootCauseDiagnosis) {
    return emptyState('Root cause not analyzed for this incident.')
  }

  const body = document.createElement('div')
  body.append(
    facts([
      ['Type', rootCauseDiagnosis.rootCauseType],
      ['Title', rootCauseDiagnosis.title],
      ['Confidence', `${Math.round(rootCauseDiagnosis.confidence * 100)}%`],
      ['Affected component', rootCauseDiagnosis.affectedComponent],
    ]),
    el('p', 'record-copy', rootCauseDiagnosis.explanation),
  )

  if (rootCauseDiagnosis.evidenceEventIds.length) {
    const evidenceWrap = el('div', 'root-cause-evidence')
    evidenceWrap.append(el('h3', 'record-section-title', 'Cited evidence'))
    const list = el('ul', 'evidence-event-list')
    for (const eventId of rootCauseDiagnosis.evidenceEventIds) {
      const event = rootCauseEvidenceEvents.find((item) => item.id === eventId)
      const item = el('li', 'evidence-event-item')
      if (!event) {
        item.textContent = `${eventId} (not loaded)`
      } else {
        item.append(
          el('code', 'mono', `${event.id} · seq ${event.sequence} · ${event.type}`),
          el('span', 'evidence-event-copy', summarizeEvent(event)),
        )
      }
      list.append(item)
    }
    evidenceWrap.append(list)
    body.append(evidenceWrap)
  }

  return body
}

function renderTreatment(treatment) {
  if (!treatment) {
    return emptyState('No treatment prescribed.')
  }
  const body = document.createElement('div')
  body.append(
    facts([
      ['Target', treatment.target],
      ['Target component', treatment.targetComponent],
      ['Risk level', treatment.riskLevel],
      ['Review required', treatment.requiresReview ? 'Yes' : 'No'],
      ['Safe to auto-apply', treatment.safeToAutoApply ? 'Yes' : 'No'],
      ['Root cause type', treatment.rootCauseType],
    ]),
    el('p', 'record-copy', treatment.currentProblematicState),
    facts([
      ['Proposed change', treatment.proposedChange],
      ['Rationale', treatment.rationale],
      ['Rollback strategy', treatment.rollbackStrategy],
    ]),
  )

  if (treatment.evidenceEventIds?.length) {
    const evidenceWrap = el('div', 'root-cause-evidence')
    evidenceWrap.append(el('h3', 'record-section-title', 'Diagnosis evidence'))
    const list = el('ul', 'evidence-event-list')
    for (const eventId of treatment.evidenceEventIds) {
      list.append(el('li', 'evidence-event-item', el('code', 'mono', eventId)))
    }
    evidenceWrap.append(list)
    body.append(evidenceWrap)
  }

  const cli = el('pre', 'cli-block')
  cli.append(
    el('span', 'prompt', '$ '),
    el('span', 'cmd', 'npm run lucid -- fix'),
    document.createTextNode('\n'),
    el('span', 'prompt', '# review treatment in terminal — auto-apply disabled'),
  )
  body.append(cli)
  return body
}

async function renderIncidentDetail(incidentId) {
  crumb.textContent = 'Hospital / …'
  content.replaceChildren(el('p', 'activity-line', 'Loading incident…'))

  const detail = await fetchJson(`/api/incidents/${encodeURIComponent(incidentId)}`)
  content.replaceChildren()

  const { incident, run, diagnosis, rootCauseDiagnosis, rootCauseEvidenceEvents, treatment, recheck, hashChain, fileStates, evidence } =
    detail

  crumb.textContent = `Hospital / ${incident.title}`

  const head = el('div', 'page-head incident-head hospital-head')
  const title = el('div', 'hospital-title')
  title.append(
    el('h1', '', incident.title),
    el(
      'p',
      '',
      `${detail.detector?.department ?? '—'} / ${detail.detector?.disease ?? '—'} · severity ${detail.severity}`,
    ),
  )
  const titleRow = el('div', 'incident-head-row')
  titleRow.append(title, incidentStatusBadge(incident.status, detail.severity))
  head.append(titleRow)

  const actions = el('div', 'actions')
  const backIncidents = el('button', 'btn', '← Incidents')
  backIncidents.type = 'button'
  backIncidents.addEventListener('click', () => {
    location.hash = '#/incidents'
  })
  const backHospital = el('button', 'btn btn-ghost', 'Hospital queue')
  backHospital.type = 'button'
  backHospital.addEventListener('click', () => {
    location.hash = '#/hospital'
  })
  if (run?.agentId) {
    const agentBtn = el('button', 'btn btn-ghost', 'Agent profile')
    agentBtn.type = 'button'
    agentBtn.addEventListener('click', () => {
      location.hash = `#/agents/${encodeURIComponent(run.agentId)}`
    })
    actions.append(agentBtn)
  }
  actions.append(backHospital, backIncidents)
  head.append(actions)
  content.append(head)

  const layout = el('div', 'incident-detail')

  layout.append(
    section(
      'Status',
      facts([
        ['Incident', incident.id],
        ['Status', incident.status],
        ['Severity', detail.severity],
        ['Opened', formatTime(incident.createdAt)],
        ['Updated', formatTime(incident.updatedAt)],
      ]),
    ),
  )

  layout.append(
    section(
      'Run / task',
      run
        ? facts([
            ['Run', run.id],
            ['Agent', run.agentId ?? '—'],
            ['Run status', run.status],
            ['Started', formatTime(run.startedAt)],
            ['Events', String(run.events.length)],
          ])
        : emptyState('No linked run.'),
    ),
  )

  layout.append(
    section(
      'Affected file',
      fileStates
        ? facts([
            ['File', fileStates.file],
            ['Repeated hash', fileStates.hash.slice(0, 12) + '…'],
            ['First seen', `seq ${fileStates.firstSeen.sequence}`],
            ['Repeated at', `seq ${fileStates.repeated.sequence}`],
          ])
        : emptyState('No file-state loop identified.'),
    ),
  )

  layout.append(section('What happened', incident.title))

  layout.append(
    section(
      'Deterministic evidence',
      evidence ? el('p', 'record-copy mono', evidence) : emptyState('No evidence recorded.'),
    ),
  )

  layout.append(
    section(
      'A → B → A visualization',
      hashChain?.length
        ? (() => {
            const body = document.createElement('div')
            body.append(renderHashChain(hashChain))
            const legend = el('ul', 'chain-legend')
            for (const step of hashChain) {
              const item = el('li', '')
              item.append(
                el('code', '', step.shortHash),
                document.createTextNode(
                  ` seq ${step.sequence} · ${step.role}${step.role === 'repeated' ? ' (matches first)' : ''}`,
                ),
              )
              legend.append(item)
            }
            body.append(legend)
            return body
          })()
        : emptyState('Hash chain not available.'),
    ),
  )

  layout.append(
    section(
      'Diagnosis',
      diagnosis
        ? facts([
            ['Department', diagnosis.department],
            ['Disease', diagnosis.disease],
            ['Status', diagnosis.status],
            ['Symptom', diagnosis.symptom],
            ['Evidence', diagnosis.evidence],
          ])
        : emptyState('Diagnosis unavailable.'),
    ),
  )

  layout.append(section('Root cause', renderRootCause(rootCauseDiagnosis, rootCauseEvidenceEvents)))
  layout.append(section('Treatment', renderTreatment(treatment)))

  layout.append(
    section(
      'Recheck',
      facts([
        ['Available', recheck.available ? 'Yes' : 'No'],
        ['Passed', recheck.passed == null ? '—' : recheck.passed ? 'Yes' : 'No'],
        ['Evidence', recheck.evidence],
      ]),
    ),
  )

  content.append(layout)
}

async function render() {
  const route = parseRoute()
  setActiveNav(route)

  try {
    switch (route.page) {
      case 'agent':
        await renderAgentProfile(route.agentId)
        break
      case 'activity':
        await renderActivityPage()
        break
      case 'incidents':
        await renderIncidentsPage()
        break
      case 'incident':
        await renderIncidentDetail(route.incidentId)
        break
      case 'hospital':
        await renderHospitalPage()
        break
      case 'memory':
        renderMemoryPage()
        break
      default:
        await renderAgentsPage()
    }
    bootError.hidden = true
  } catch (error) {
    console.error(error)
    bootError.hidden = false
    content.replaceChildren(
      emptyState('Could not load from Lucid API. Is npm run web running?'),
    )
  }
}

window.addEventListener('hashchange', () => void render())
void render()
