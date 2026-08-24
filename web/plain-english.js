/**
 * Presentation-only plain-English helpers.
 * Never invent activity — only translate real agent / incident / event fields.
 */

export function statusLabel(status) {
  return (
    {
      working: 'Working',
      idle: 'Resting',
      unhealthy: 'Needs help',
      stopped: 'Stopped',
    }[status] ?? status
  )
}

export function statusEmoji(status) {
  return (
    {
      working: '🟢',
      idle: '😴',
      unhealthy: '🔴',
      stopped: '⚫',
    }[status] ?? '·'
  )
}

export function statusBadgeClass(status) {
  return (
    {
      working: 'badge badge--working',
      idle: 'badge badge--idle',
      unhealthy: 'badge badge--critical',
      stopped: 'badge badge--stopped',
    }[status] ?? 'badge'
  )
}

function truncate(text, max) {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function basename(filePath) {
  if (!filePath) return 'a file'
  const parts = String(filePath).split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

function softSentence(text) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  const stripped = t.replace(/^(i(?:'| a)?m\s+)/i, '').trim()
  return stripped
}

/** Frame real prompt/activity as a first-person speech bubble. Never invents work. */
export function speechBubble(agent, events) {
  const list = Array.isArray(events) ? events : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i]
    if (event?.type === 'prompt' && (event.role === 'user' || !event.role)) {
      const body = softSentence(event.text)
      if (body) return `I'm ${body.charAt(0).toLowerCase()}${body.slice(1)}`
    }
  }

  if (agent?.currentActivity) {
    const activity = softSentence(agent.currentActivity)
    if (/^i['']?m\s/i.test(agent.currentActivity.trim())) {
      return truncate(agent.currentActivity.trim(), 160)
    }
    if (activity) return truncate(`I'm working on: ${activity}`, 160)
  }

  if (agent?.status === 'working') return "I'm busy with my current work."
  if (agent?.status === 'unhealthy') return "I'm stuck and need help."
  if (agent?.status === 'stopped') return 'I stopped working.'
  return "I'm resting."
}

/** Map a real AgentEvent into a kid-friendly activity line. */
export function describeEvent(event) {
  if (!event || !event.type) return 'Did some work'

  switch (event.type) {
    case 'prompt':
      return truncate(
        event.role === 'user' || !event.role
          ? `Got a job: ${softSentence(event.text)}`
          : `Got instructions: ${softSentence(event.text)}`,
        120,
      )
    case 'model_response': {
      const text = softSentence(event.reasonSummary || event.text)
      return text ? truncate(`Thought about it: ${text}`, 120) : 'Thought about what to do'
    }
    case 'tool_call': {
      const name = (event.toolName || 'tool').toLowerCase()
      if (name === 'read' || name === 'readfile') {
        const path = event.arguments?.path || event.arguments?.file_path
        return path ? `Opened ${basename(path)}` : 'Opened a file'
      }
      if (name === 'write' || name === 'writefile' || name === 'strreplace') {
        const path = event.arguments?.path || event.arguments?.file_path
        return path ? `Changed ${basename(path)}` : 'Changed a file'
      }
      if (name === 'shell') return 'Ran a command'
      return `Used ${event.toolName}`
    }
    case 'tool_result': {
      const name = (event.toolName || 'tool').toLowerCase()
      if (name === 'shell') {
        return event.ok ? 'Finished a command' : 'A command did not work'
      }
      return event.ok ? `Finished using ${event.toolName}` : `${event.toolName} did not work`
    }
    case 'file_write':
      return `Changed ${basename(event.path)}`
    case 'test_result':
      return event.passed ? 'The check passed' : 'The check failed'
    case 'error':
      return truncate(event.message || 'Something went wrong', 120)
    case 'process_start': {
      const cmd = Array.isArray(event.command) ? event.command.join(' ') : ''
      if (/\b(test|vitest|jest|pytest)\b/i.test(cmd)) return 'Checked if the change worked'
      return cmd ? truncate(`Started work: ${cmd}`, 100) : 'Started work'
    }
    case 'process_output':
      return event.stream === 'stderr'
        ? truncate(`Got a warning: ${event.text}`, 100)
        : truncate(`Saw output: ${event.text}`, 100)
    case 'process_end':
      return event.exitCode === 0 ? 'Finished this work' : 'This work did not finish cleanly'
    default:
      return 'Did some work'
  }
}

export function pronounForName(name) {
  const n = String(name || '').toLowerCase()
  if (/\b(appy|she|her)\b/.test(n) || n.endsWith('a') || n.endsWith('y')) {
    // Prefer "their" for unknown — only use she for clearly feminine mascot names
  }
  if (n === 'appy') return { subject: 'she', possessive: 'her', object: 'her' }
  return { subject: 'they', possessive: 'their', object: 'them' }
}

export function symptomLine(incident, agentName = 'This agent') {
  const disease = incident?.disease || ''
  const name = agentName || 'This agent'
  const p = pronounForName(name)

  if (disease === 'repeated-file-state') {
    return `${name} keeps undoing ${p.possessive} own work.`
  }

  const raw = incident?.symptom || incident?.title
  if (raw) return cleanJargon(raw, name)
  return `${name} needs help.`
}

function cleanJargon(text, agentName) {
  let t = String(text)
  t = t.replace(/repeated-file-state/gi, 'keeps undoing its own work')
  t = t.replace(/conflicting_instructions/gi, 'two rules say opposite things')
  t = t.replace(/file-state loop/gi, 'undoing its own work')
  if (agentName && !t.includes(agentName)) {
    // leave as-is
  }
  return truncate(t, 160)
}

export function whyLine(rootCauseDiagnosis, agentName = 'This agent') {
  if (!rootCauseDiagnosis) {
    return `We are still figuring out why ${agentName} got stuck.`
  }

  const type = rootCauseDiagnosis.rootCauseType
  const name = agentName

  const mapped = {
    conflicting_instructions: `Two rules are telling ${name} to do opposite things.`,
    repeated_tool_failure: `${name} tried the same tool again and again, and it kept failing.`,
    test_feedback_oscillation: `Tests keep sending ${name} back and forth.`,
    lost_context: `${name} forgot important context mid-work.`,
    retry_strategy_failure: `${name}'s retry plan is not helping.`,
    unknown: rootCauseDiagnosis.explanation
      ? truncate(rootCauseDiagnosis.explanation, 160)
      : `We are still figuring out why ${name} got stuck.`,
  }

  return mapped[type] || truncate(rootCauseDiagnosis.explanation || rootCauseDiagnosis.title, 160)
}

export function helpLine(treatment, agentName = 'This agent') {
  if (!treatment) {
    return `Look closely at what ${agentName} tried, then decide what to change.`
  }

  const target = treatment.target
  const mapped = {
    instructions: `Tell ${agentName} which rule to follow.`,
    memory: `Help ${agentName} remember what already failed.`,
    tools: `Change which tools ${agentName} is allowed to use.`,
    retry_strategy: `Change how ${agentName} retries when something fails.`,
    cost: `Stop ${agentName} from trying too many expensive steps.`,
  }

  if (mapped[target]) return mapped[target]
  if (treatment.proposedChange) return truncate(treatment.proposedChange, 160)
  return `Help ${agentName} with a careful change.`
}

function formatDurationWords(ms) {
  if (ms == null || Number.isNaN(ms)) return null
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return seconds <= 1 ? '1 second' : `${seconds} seconds`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem === 0) return hours === 1 ? '1 hour' : `${hours} hours`
  return `${hours}h ${rem}m`
}

/** “Working for 8 minutes” or “Last worked 12 minutes ago”. */
export function relativeWorked(agent) {
  if (agent?.status === 'working' && agent.currentRunDurationMs != null) {
    const words = formatDurationWords(agent.currentRunDurationMs)
    return words ? `for ${words}` : 'right now'
  }

  if (agent?.lastSeenAt) {
    const ago = Date.now() - new Date(agent.lastSeenAt).getTime()
    const words = formatDurationWords(Math.max(0, ago))
    if (words) return `Last worked ${words} ago`
  }

  return null
}

export function howImDoingLine(agent, openIncidents = []) {
  if (agent?.status === 'unhealthy' || openIncidents.length > 0) {
    const incident = openIncidents[0]
    return {
      tone: 'help',
      title: 'Needs help',
      detail: incident ? symptomLine(incident, agent.name) : `${agent.name} needs help.`,
    }
  }
  if (agent?.status === 'stopped') {
    return { tone: 'stopped', title: 'Stopped', detail: `${agent.name} is not working right now.` }
  }
  if (agent?.status === 'working') {
    return { tone: 'ok', title: 'Everything looks good', detail: `${agent.name} is busy and okay.` }
  }
  return { tone: 'ok', title: 'Everything looks good', detail: `${agent.name} is resting.` }
}

export function firstName(agent) {
  if (!agent?.name) return 'this agent'
  return agent.name.split(/\s+/)[0]
}
