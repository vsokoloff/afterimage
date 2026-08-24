import { agentCharacter, moodForStatus } from './characters.js'
import {
  describeEvent,
  firstName,
  helpLine,
  relativeWorked,
  speechBubble,
  statusBadgeClass,
  statusEmoji,
  statusLabel,
  symptomLine,
  whyLine,
} from './plain-english.js'

const content = document.querySelector('#content')
const crumb = document.querySelector('#crumb')
const workspaceLabel = document.querySelector('#workspace-label')
const bootError = document.querySelector('#boot-error')
const nav = document.querySelector('#nav')

let cachedWorkspace = null
/** @type {Map<string, string>} */
const agentNameCache = new Map()

async function loadWorkspace() {
  if (cachedWorkspace) return cachedWorkspace
  cachedWorkspace = await fetchJson('/api/workspace')
  return cachedWorkspace
}

function renderWorkspaceBanner(workspace) {
  if (workspaceLabel) {
    workspaceLabel.textContent = `Workspace: ${workspace.label}`
    workspaceLabel.title = workspace.root
  }
  document.title = `Lucid — ${workspace.label}`
}

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

function storySection(title, body) {
  const wrap = el('section', 'story-section')
  wrap.append(el('h2', 'story-section-title', title))
  if (typeof body === 'string') {
    wrap.append(el('p', 'story-copy', body))
  } else {
    wrap.append(body)
  }
  return wrap
}

function techDetails(summary, body) {
  const details = document.createElement('details')
  details.className = 'tech-details'
  const sum = el('summary', '', summary)
  details.append(sum)
  if (typeof body === 'string') {
    details.append(el('p', 'record-copy', body))
  } else {
    details.append(body)
  }
  return details
}

function emptyState(message) {
  return el('p', 'empty', message)
}

function agentStatusBadge(status) {
  const badge = el('span', statusBadgeClass(status), `${statusEmoji(status)} ${statusLabel(status)}`)
  return badge
}

function incidentStatusBadge(status, severity) {
  const label =
    {
      open: 'Needs help',
      in_hospital: 'In Hospital',
      cleared: 'All better',
      closed: 'Closed',
    }[status] ?? status
  const cls =
    severity === 'critical' || status === 'open' || status === 'in_hospital'
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

function speechEl(text) {
  const bubble = el('blockquote', 'speech-bubble', text)
  return bubble
}

function cacheAgentNames(agents) {
  for (const agent of agents) {
    agentNameCache.set(agent.id, agent.name)
  }
}

function displayAgentName(agentId) {
  return agentNameCache.get(agentId) ?? agentId
}

function runTitle(run) {
  const prompt = [...(run.events ?? [])]
    .reverse()
    .find((event) => event.type === 'prompt' && (event.role === 'user' || !event.role))
  if (prompt?.text) {
    const t = prompt.text.trim()
    return t.length > 72 ? `${t.slice(0, 71)}…` : t
  }
  if (run.status === 'running') return 'Working now'
  if (run.status === 'failed') return 'Work that needed help'
  if (run.status === 'cancelled') return 'Work that stopped'
  return 'Finished some work'
}

/* ─── Your agents ─── */

function renderAgentCard(agent) {
  const card = el('button', 'agent-card agent-card--story', '')
  card.type = 'button'
  card.addEventListener('click', () => {
    location.hash = `#/agents/${encodeURIComponent(agent.id)}`
  })

  const portrait = el('div', 'agent-card-portrait')
  portrait.append(mascotForAgent(agent, 'md'))
  card.append(portrait)

  card.append(el('h2', 'agent-card-name', agent.name))
  if (agent.role) {
    card.append(el('p', 'role', agent.role))
  }

  card.append(speechEl(speechBubble(agent)))

  const statusRow = el('div', 'agent-card-status')
  statusRow.append(agentStatusBadge(agent.status))
  const when = relativeWorked(agent)
  if (when) {
    statusRow.append(el('span', 'agent-card-when', when))
  }
  card.append(statusRow)

  const actions = el('div', 'card-actions')
  actions.append(el('span', 'btn btn-ghost', `Open ${firstName(agent)}`))
  card.append(actions)
  return card
}

function todoTasksForAgent(agent, openIncidents, recentEvents) {
  /** @type {Array<{ pill: string, pillClass: string, text: string, done: boolean }>} */
  const tasks = []

  if (openIncidents.length > 0) {
    const incident = openIncidents[0]
    tasks.push({
      pill: 'Help',
      pillClass: 'todo-pill--fault',
      text: symptomLine(incident, firstName(agent)),
      done: false,
    })
  }

  if (agent.status === 'working') {
    tasks.push({
      pill: 'Now',
      pillClass: 'todo-pill--lime',
      text: agent.currentActivity || speechBubble(agent, recentEvents),
      done: false,
    })
  } else if (agent.status === 'idle' || agent.status === 'stopped') {
    tasks.push({
      pill: 'Daily',
      pillClass: 'todo-pill--navy',
      text:
        agent.status === 'stopped'
          ? `${firstName(agent)} stopped — check in when you’re ready.`
          : `${firstName(agent)} is resting until the next job.`,
      done: true,
    })
  }

  if (agent.role) {
    tasks.push({
      pill: 'Job',
      pillClass: 'todo-pill--pink',
      text: agent.role,
      done: agent.status !== 'working',
    })
  }

  if (!tasks.length) {
    tasks.push({
      pill: 'Daily',
      pillClass: 'todo-pill--navy',
      text: 'Nothing on the list yet.',
      done: true,
    })
  }

  return tasks.slice(0, 4)
}

function renderTodoRow(task) {
  const row = el('li', 'todo-row')
  row.append(
    el('span', `todo-pill ${task.pillClass}`, task.pill),
    el('p', 'todo-text', task.text),
    el('span', `todo-check${task.done ? ' is-done' : ''}`, ''),
  )
  return row
}

function renderMessagesBlock(agent, recentEvents) {
  const block = el('section', 'messages-block')
  block.append(el('h2', 'messages-title', 'Messages'))
  const list = el('ul', 'messages-list')

  const events = recentEvents.slice(0, 6)
  if (!events.length) {
    const item = el('li', 'messages-item')
    item.append(
      el('span', '', `No messages yet from ${firstName(agent)}.`),
      el('span', 'messages-time', '—'),
    )
    list.append(item)
  } else {
    for (const event of events) {
      const item = el('li', 'messages-item')
      item.append(
        el('span', '', describeEvent(event)),
        el('span', 'messages-time', formatTime(event.timestamp)),
      )
      list.append(item)
    }
  }

  block.append(list)
  return block
}

async function renderAgentsPage() {
  crumb.textContent = 'Your agents'
  content.replaceChildren(el('p', 'activity-line', 'Loading your agents…'))

  const data = await fetchJson('/api/agents')
  cacheAgentNames(data.agents)
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Your agents'),
    el('p', '', 'Tap a cover to peek inside — who they are, what to do today, and their messages.'),
  )
  content.append(head)

  if (!data.agents.length) {
    content.append(
      emptyState(
        'No agents here yet. When someone works in this repo with Lucid watching, they’ll show up.',
      ),
    )
    return
  }

  const toolbar = el('div', 'toolbar')
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = 'Find an agent…'
  search.setAttribute('aria-label', 'Find an agent')
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
        (agent.role ?? '').toLowerCase().includes(q)
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
  crumb.textContent = 'Your agents / …'
  content.replaceChildren(el('p', 'activity-line', 'Loading…'))

  const profile = await fetchJson(`/api/agents/${encodeURIComponent(agentId)}`)
  const { agent, currentRun, recentRuns, recentEvents, openIncidents, pastIncidents } = profile
  agentNameCache.set(agent.id, agent.name)

  content.replaceChildren()
  crumb.textContent = `Your agents / ${agent.name}`

  const layout = el('div', 'profile profile--story profile--uma')

  const back = el('button', 'btn', '← Your agents')
  back.type = 'button'
  back.addEventListener('click', () => {
    location.hash = '#/agents'
  })
  layout.append(back)

  const hello = el('div', 'profile-hello-wrap')
  hello.append(el('h1', 'profile-hello', `Hello, ${firstName(agent)}!`))
  if (agent.role) hello.append(el('p', 'profile-hello-sub', agent.role))
  hello.append(agentStatusBadge(agent.status))
  layout.append(hello)

  const cover = el('div', 'profile-cover')
  cover.append(mascotForAgent(agent, 'lg'))
  cover.append(speechEl(speechBubble(agent, recentEvents)))
  layout.append(cover)

  const needsHelp = agent.status === 'unhealthy' || openIncidents.length > 0
  if (needsHelp) {
    const alert = el('div', 'medical-banner')
    const incident = openIncidents[0]
    alert.append(
      el('p', 'medical-banner-title', `${statusEmoji('unhealthy')} Needs help`),
      el(
        'p',
        'medical-banner-copy',
        incident
          ? symptomLine(incident, firstName(agent))
          : `${firstName(agent)} needs help.`,
      ),
    )
    if (incident) {
      const hospitalBtn = el(
        'button',
        'btn btn-primary',
        `Take ${firstName(agent)} to Hospital`,
      )
      hospitalBtn.type = 'button'
      hospitalBtn.addEventListener('click', () => {
        location.hash = `#/incidents/${incident.id}`
      })
      alert.append(hospitalBtn)
    }
    layout.append(alert)
  }

  const todo = el('section', 'todo-block')
  todo.append(el('h2', 'todo-title', 'To do today'))
  const todoList = el('ul', 'todo-list')
  for (const task of todoTasksForAgent(agent, openIncidents, recentEvents)) {
    todoList.append(renderTodoRow(task))
  }
  todo.append(todoList)
  layout.append(todo)

  layout.append(renderMessagesBlock(agent, recentEvents))

  const techBody = document.createElement('div')
  techBody.append(
    facts([
      ['Agent id', agent.id],
      ['Runtime', agent.runtime],
      ['Status (raw)', agent.status],
      ['Current run', agent.currentRunId ?? '—'],
      ['Run count', String(agent.runCount)],
      ['Last seen', formatTime(agent.lastSeenAt)],
      ['Open incidents', String(openIncidents.length)],
      ['Past incidents', String(pastIncidents.length)],
    ]),
  )

  if (currentRun) {
    techBody.append(el('h3', 'record-section-title', 'Current run events (raw)'))
    const list = el('ul', 'evidence-event-list')
    for (const event of currentRun.events.slice(-15)) {
      list.append(
        el(
          'li',
          'evidence-event-item',
          el('code', 'mono', `${event.type} · ${event.id} · seq ${event.sequence}`),
        ),
      )
    }
    techBody.append(list)
  }

  if (recentRuns.length) {
    techBody.append(el('h3', 'record-section-title', 'Run ids'))
    const list = el('ul', 'evidence-event-list')
    for (const run of recentRuns) {
      list.append(el('li', 'evidence-event-item', el('code', 'mono', `${run.id} · ${run.status}`)))
    }
    techBody.append(list)
  }

  if (openIncidents.length || pastIncidents.length) {
    techBody.append(el('h3', 'record-section-title', 'Incidents'))
    const list = el('ul', 'evidence-event-list')
    for (const incident of [...openIncidents, ...pastIncidents.slice(0, 5)]) {
      const link = el('a', 'link-agent', incident.id)
      link.href = `#/incidents/${incident.id}`
      const item = el('li', 'evidence-event-item')
      item.append(link, document.createTextNode(` · ${incident.status}`))
      list.append(item)
    }
    techBody.append(list)
  }

  layout.append(techDetails('Technical details', techBody))
  content.append(layout)
}

/* ─── Activity ─── */

async function renderActivityPage() {
  crumb.textContent = 'Activity'
  content.replaceChildren(el('p', 'activity-line', 'Loading…'))

  const [activityData, agentsData] = await Promise.all([
    fetchJson('/api/activity'),
    fetchJson('/api/agents'),
  ])
  cacheAgentNames(agentsData.agents)
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Activity'),
    el('p', '', 'What your agents have been doing — newest first.'),
  )
  content.append(head)

  if (!activityData.activity.length) {
    content.append(emptyState('No activity yet.'))
    return
  }

  const list = el('ul', 'activity-feed activity-feed--plain')
  for (const item of activityData.activity) {
    const row = el('li', 'activity-item')
    const name = displayAgentName(item.agentId)
    row.append(
      el('span', 'activity-time', formatTime(item.at)),
      agentLink(item.agentId, name),
      el('span', '', item.summary || describeEvent({ type: item.type })),
    )
    list.append(row)
  }
  content.append(list)
}

function agentLink(agentId, label) {
  const link = el('a', 'link-agent', label)
  link.href = `#/agents/${encodeURIComponent(agentId)}`
  return link
}

/* ─── Hospital ─── */

async function renderHospitalPage() {
  crumb.textContent = 'Hospital'
  content.replaceChildren(el('p', 'activity-line', 'Loading…'))

  const [incidentsData, agentsData] = await Promise.all([
    fetchJson('/api/incidents'),
    fetchJson('/api/agents'),
  ])
  cacheAgentNames(agentsData.agents)
  content.replaceChildren()

  const head = el('div', 'page-head hospital-head')
  head.append(
    el('h1', '', 'Hospital'),
    el('p', '', 'Who needs help right now — and how we can help them.'),
  )
  content.append(head)

  const open = incidentsData.incidents.filter((incident) =>
    ['open', 'in_hospital'].includes(incident.status),
  )

  if (!open.length) {
    content.append(emptyState('Nobody needs help right now. Nice!'))
    return
  }

  const list = el('div', 'incident-list')
  list.append(el('h2', 'incident-group-title', 'Who needs help?'))
  for (const incident of open) {
    list.append(renderHelpCard(incident, agentsData.agents))
  }
  content.append(list)
}

function renderHelpCard(incident, agents) {
  const card = el('button', 'incident-card incident-card--help', '')
  card.type = 'button'
  card.addEventListener('click', () => {
    location.hash = `#/incidents/${incident.id}`
  })

  const agent = agents.find((a) => a.id === incident.agentId)
  const name = agent?.name ?? incident.agentId ?? 'An agent'

  const top = el('div', 'incident-card-top')
  const identity = el('div', 'agent-card-identity')
  if (agent) identity.append(mascotForAgent(agent, 'sm'))
  const copy = document.createElement('div')
  copy.append(el('h2', '', name), el('p', 'incident-symptom', symptomLine(incident, firstName({ name }))))
  identity.append(copy)
  top.append(identity, incidentStatusBadge(incident.status, incident.severity))
  card.append(top)

  const foot = el('div', 'incident-card-foot')
  foot.append(el('span', 'btn btn-ghost', 'See what’s wrong'))
  card.append(foot)
  return card
}

function renderMemoryPage() {
  crumb.textContent = 'Memory'
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Memory'),
    el('p', '', 'What your agents remember — Uma keeps UI design preferences here.'),
  )
  content.append(head)

  void (async () => {
    try {
      const data = await fetchJson('/api/memory')
      const agents = Array.isArray(data.agents) ? data.agents : []
      if (agents.length === 0) {
        content.append(
          emptyState('No agent memories yet.'),
        )
        return
      }

      const list = el('ul', 'memory-list')
      for (const agent of agents) {
        const item = el('li', 'memory-item')
        const top = el('div', 'dept-item-top')
        top.append(
          el('strong', 'dept-name', agent.name ?? agent.agentId),
          el('span', 'muted', agent.role ?? ''),
        )
        item.append(top)

        const entries = Array.isArray(agent.entries) ? agent.entries : []
        if (entries.length === 0) {
          item.append(
            el(
              'p',
              '',
              'No preferences yet. Tell Uma how you want a part of the UI to feel.',
            ),
          )
        } else {
          const notes = el('ul', 'memory-notes')
          for (const entry of entries) {
            const note = el('li', 'memory-note')
            note.append(
              el('strong', '', entry.about),
              document.createTextNode(` — ${entry.text}`),
            )
            notes.append(note)
          }
          item.append(notes)
        }
        list.append(item)
      }
      content.append(list)
    } catch (error) {
      content.append(emptyState(error instanceof Error ? error.message : String(error)))
    }
  })()
}

function renderIncidentCard(incident) {
  const card = el('button', 'incident-card', '')
  card.type = 'button'
  card.addEventListener('click', () => {
    location.hash = `#/incidents/${incident.id}`
  })

  const name = incident.agentId ? displayAgentName(incident.agentId) : 'An agent'
  const top = el('div', 'incident-card-top')
  const copy = document.createElement('div')
  copy.append(
    el('h2', '', name),
    el('p', 'incident-symptom', symptomLine(incident, firstName({ name }))),
  )
  top.append(copy, incidentStatusBadge(incident.status, incident.severity))
  card.append(top)

  const foot = el('div', 'incident-card-foot')
  foot.append(
    el('span', 'incident-meta', formatTime(incident.updatedAt)),
    el('span', 'btn btn-ghost', 'See what’s wrong'),
  )
  card.append(foot)
  return card
}

async function renderIncidentsPage() {
  crumb.textContent = 'Incidents'
  content.replaceChildren(el('p', 'activity-line', 'Loading…'))

  const [data, agentsData] = await Promise.all([
    fetchJson('/api/incidents'),
    fetchJson('/api/agents'),
  ])
  cacheAgentNames(agentsData.agents)
  content.replaceChildren()

  const head = el('div', 'page-head')
  head.append(
    el('h1', '', 'Incidents'),
    el('p', '', 'Times an agent needed help — open ones and ones that got better.'),
  )
  content.append(head)

  if (!data.incidents.length) {
    content.append(emptyState('No incidents yet. That’s a good thing!'))
    return
  }

  const open = data.incidents.filter((i) => ['open', 'in_hospital'].includes(i.status))
  const cleared = data.incidents.filter((i) => ['cleared', 'closed'].includes(i.status))

  const list = el('div', 'incident-list')
  list.append(el('h2', 'incident-group-title', 'Needs help'))
  if (open.length) {
    for (const incident of open) list.append(renderIncidentCard(incident))
  } else {
    list.append(emptyState('Nobody needs help right now.'))
  }

  if (cleared.length) {
    list.append(el('h2', 'incident-group-title', 'All better'))
    for (const incident of cleared) list.append(renderIncidentCard(incident))
  }

  content.append(list)
}

function renderHashChain(chain) {
  const wrap = el('div', 'hash-chain hash-chain--simple')
  chain.forEach((step, index) => {
    if (index > 0) wrap.append(el('span', 'hash-arrow', '→'))
    const label =
      step.role === 'first-seen' ? 'A' : step.role === 'repeated' ? 'A' : 'B'
    const chip = el(
      'span',
      `hash-chip${step.role === 'repeated' || step.role === 'first-seen' ? ' is-repeat' : ''}`,
      label,
    )
    chip.title = `${step.shortHash} · seq ${step.sequence} · ${step.path}`
    wrap.append(chip)
  })
  return wrap
}

function citedRuleTexts(rootCauseDiagnosis, rootCauseEvidenceEvents) {
  if (!rootCauseDiagnosis?.evidenceEventIds?.length) return []
  const rules = []
  for (const eventId of rootCauseDiagnosis.evidenceEventIds) {
    const event = rootCauseEvidenceEvents.find((item) => item.id === eventId)
    if (event?.type === 'prompt' && event.text) {
      rules.push(event.text.trim())
    }
  }
  return rules
}

async function renderIncidentDetail(incidentId) {
  crumb.textContent = 'Hospital / …'
  content.replaceChildren(el('p', 'activity-line', 'Loading…'))

  const detail = await fetchJson(`/api/incidents/${encodeURIComponent(incidentId)}`)
  content.replaceChildren()

  const {
    incident,
    run,
    diagnosis,
    rootCauseDiagnosis,
    rootCauseEvidenceEvents,
    treatment,
    recheck,
    hashChain,
    fileStates,
    evidence,
  } = detail

  const agentName =
    (run?.agentId && displayAgentName(run.agentId)) ||
    incident.agentId ||
    'This agent'
  const short = firstName({ name: agentName })

  crumb.textContent = `Hospital / ${short}`

  const head = el('div', 'page-head hospital-head')
  head.append(el('h1', '', `🏥 ${short} is in the Hospital`))
  head.append(incidentStatusBadge(incident.status, detail.severity))

  const actions = el('div', 'actions')
  const backHospital = el('button', 'btn', '← Who needs help')
  backHospital.type = 'button'
  backHospital.addEventListener('click', () => {
    location.hash = '#/hospital'
  })
  actions.append(backHospital)
  if (run?.agentId) {
    const agentBtn = el('button', 'btn btn-ghost', `Back to ${short}`)
    agentBtn.type = 'button'
    agentBtn.addEventListener('click', () => {
      location.hash = `#/agents/${encodeURIComponent(run.agentId)}`
    })
    actions.append(agentBtn)
  }
  head.append(actions)
  content.append(head)

  const layout = el('div', 'incident-detail incident-detail--story')

  const happened = document.createElement('div')
  happened.append(el('p', 'story-copy', symptomLine(incident, short)))
  if (hashChain?.length) {
    happened.append(el('p', 'story-meta', 'The same file went back to an old version:'))
    happened.append(renderHashChain(hashChain))
    happened.append(el('p', 'story-meta', 'A → B → A means they may be stuck in a loop.'))
  }
  layout.append(storySection('What happened?', happened))

  const whyBody = document.createElement('div')
  whyBody.append(el('p', 'story-copy', whyLine(rootCauseDiagnosis, short)))
  const rules = citedRuleTexts(rootCauseDiagnosis, rootCauseEvidenceEvents || [])
  if (rules.length) {
    const ruleList = el('ol', 'rule-list')
    rules.forEach((rule, index) => {
      const item = el('li', 'rule-item')
      item.append(el('strong', '', `Rule ${index + 1}: `), document.createTextNode(rule))
      ruleList.append(item)
    })
    whyBody.append(ruleList)
  }
  layout.append(storySection('Why?', whyBody))

  const helpBody = document.createElement('div')
  helpBody.append(el('p', 'story-copy', helpLine(treatment, short)))
  if (treatment) {
    const show = el('button', 'btn btn-primary', 'Show treatment')
    show.type = 'button'
    const treatmentBox = el('div', 'treatment-plain')
    treatmentBox.hidden = true
    treatmentBox.append(
      el('p', 'story-copy', treatment.proposedChange || treatment.rationale || ''),
      el('p', 'story-meta', 'In the terminal you can review carefully:'),
    )
    const cli = el('pre', 'cli-block')
    cli.append(
      el('span', 'prompt', '$ '),
      el('span', 'cmd', `npm run lucid -- fix ${incident.id}`),
    )
    treatmentBox.append(cli)
    show.addEventListener('click', () => {
      treatmentBox.hidden = !treatmentBox.hidden
      show.textContent = treatmentBox.hidden ? 'Show treatment' : 'Hide treatment'
    })
    helpBody.append(show, treatmentBox)
  }
  layout.append(storySection('How do we help?', helpBody))

  const tech = document.createElement('div')
  tech.append(
    facts([
      ['Incident id', incident.id],
      ['Status', incident.status],
      ['Severity', detail.severity],
      ['Department', diagnosis?.department ?? incident.department ?? '—'],
      ['Disease', diagnosis?.disease ?? incident.disease ?? '—'],
      ['Opened', formatTime(incident.createdAt)],
      ['Updated', formatTime(incident.updatedAt)],
      ['Run', run?.id ?? '—'],
      ['Agent id', run?.agentId ?? incident.agentId ?? '—'],
    ]),
  )

  if (fileStates) {
    tech.append(
      el('h3', 'record-section-title', 'File states'),
      facts([
        ['File', fileStates.file],
        ['Hash', fileStates.hash],
        ['First seen seq', String(fileStates.firstSeen.sequence)],
        ['Repeated seq', String(fileStates.repeated.sequence)],
      ]),
    )
  }

  if (evidence) {
    tech.append(el('h3', 'record-section-title', 'Deterministic evidence'), el('p', 'record-copy mono', evidence))
  }

  if (hashChain?.length) {
    tech.append(el('h3', 'record-section-title', 'Hash chain'))
    const legend = el('ul', 'chain-legend')
    for (const step of hashChain) {
      const item = el('li', '')
      item.append(
        el('code', '', step.shortHash),
        document.createTextNode(` seq ${step.sequence} · ${step.role} · ${step.eventId}`),
      )
      legend.append(item)
    }
    tech.append(legend)
  }

  if (rootCauseDiagnosis) {
    tech.append(
      el('h3', 'record-section-title', 'Root cause (raw)'),
      facts([
        ['Type', rootCauseDiagnosis.rootCauseType],
        ['Title', rootCauseDiagnosis.title],
        ['Confidence', `${Math.round(rootCauseDiagnosis.confidence * 100)}%`],
        ['Affected component', rootCauseDiagnosis.affectedComponent],
        ['Evidence event ids', rootCauseDiagnosis.evidenceEventIds.join(', ') || '—'],
      ]),
      el('p', 'record-copy', rootCauseDiagnosis.explanation),
    )
  }

  if (treatment) {
    tech.append(
      el('h3', 'record-section-title', 'Treatment (raw)'),
      facts([
        ['Target', treatment.target],
        ['Target component', treatment.targetComponent],
        ['Risk', treatment.riskLevel],
        ['Requires review', treatment.requiresReview ? 'yes' : 'no'],
        ['Safe to auto-apply', treatment.safeToAutoApply ? 'yes' : 'no'],
        ['Root cause type', treatment.rootCauseType],
        ['Rollback', treatment.rollbackStrategy],
      ]),
    )
  }

  if (recheck) {
    tech.append(
      el('h3', 'record-section-title', 'Recheck'),
      facts([
        ['Available', recheck.available ? 'yes' : 'no'],
        ['Passed', recheck.passed == null ? '—' : recheck.passed ? 'yes' : 'no'],
        ['Evidence', recheck.evidence],
        ['Run id', recheck.runId ?? '—'],
      ]),
    )
  }

  layout.append(techDetails('Technical details', tech))
  content.append(layout)
}

async function render() {
  const route = parseRoute()
  setActiveNav(route)

  try {
    const workspaceData = await loadWorkspace()
    renderWorkspaceBanner(workspaceData.workspace)

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
    content.replaceChildren(emptyState('Could not load Lucid. Is the server running?'))
  }
}

window.addEventListener('hashchange', () => void render())
void render()
