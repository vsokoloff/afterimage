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
  const raw = (location.hash || '#/incidents').replace(/^#/, '')
  const parts = raw.split('/').filter(Boolean)
  if (parts[0] === 'incidents' && parts[1]) {
    return { page: 'incident', incidentId: parts[1] }
  }
  return { page: 'incidents' }
}

function setActiveNav(route) {
  nav.querySelectorAll('.nav-item').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === 'incidents')
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

function statusBadge(status, severity) {
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
  top.append(copy, statusBadge(incident.status, incident.severity))
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
    el('p', '', 'Open loops and recently cleared cases from local agent runs.'),
  )
  content.append(head)

  const open = data.incidents.filter((i) => ['open', 'in_hospital'].includes(i.status))
  const cleared = data.incidents.filter((i) => ['cleared', 'closed'].includes(i.status))

  if (!data.incidents.length) {
    content.append(
      emptyState('No incidents yet. Run an agent with the Lucid observer to record file-write events.'),
    )
    return
  }

  const list = el('div', 'incident-list')

  if (open.length) {
    list.append(el('h2', 'incident-group-title', 'Open incidents'))
    for (const incident of open) {
      list.append(renderIncidentCard(incident))
    }
  } else {
    list.append(el('h2', 'incident-group-title', 'Open incidents'))
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

function summarizeEvent(event) {
  switch (event.type) {
    case 'prompt':
      return `${event.role ?? 'prompt'}: ${event.text}`
    case 'model_response':
      return event.reasonSummary || event.text
    case 'tool_result':
      return `${event.toolName} ok=${event.ok} ${JSON.stringify(event.output ?? '')}`
    case 'test_result':
      return `${event.name ?? 'test'} passed=${event.passed} ${event.output ?? ''}`
    case 'error':
      return event.message
    case 'file_write':
      return `${event.path} hash=${event.hash.slice(0, 12)}`
    default:
      return event.type
  }
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
  crumb.textContent = 'Incidents / …'
  content.replaceChildren(el('p', 'activity-line', 'Loading incident…'))

  const detail = await fetchJson(`/api/incidents/${encodeURIComponent(incidentId)}`)
  content.replaceChildren()

  const { incident, run, diagnosis, rootCauseDiagnosis, rootCauseEvidenceEvents, treatment, recheck, hashChain, fileStates, evidence } =
    detail

  crumb.textContent = `Incidents / ${incident.title}`

  const head = el('div', 'page-head incident-head')
  const titleRow = el('div', 'incident-head-row')
  titleRow.append(
    (() => {
      const copy = document.createElement('div')
      copy.append(
        el('h1', '', incident.title),
        el(
          'p',
          '',
          `${detail.detector?.department ?? '—'} / ${detail.detector?.disease ?? '—'} · severity ${detail.severity}`,
        ),
      )
      return copy
    })(),
    statusBadge(incident.status, detail.severity),
  )
  head.append(titleRow)

  const back = el('button', 'btn', '← Incidents')
  back.type = 'button'
  back.addEventListener('click', () => {
    location.hash = '#/incidents'
  })
  head.append(back)
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
    if (route.page === 'incident') {
      await renderIncidentDetail(route.incidentId)
    } else {
      await renderIncidentsPage()
    }
    bootError.hidden = true
  } catch (error) {
    console.error(error)
    bootError.hidden = false
    content.replaceChildren(
      emptyState('Could not load from /api/incidents. Is npm run web running?'),
    )
  }
}

window.addEventListener('hashchange', () => void render())
void render()
