const admitButton = document.querySelector('#admit-button')
const recheckButton = document.querySelector('#recheck-button')
const status = document.querySelector('#status')
const errorNotice = document.querySelector('#error-notice')
const turnList = document.querySelector('#turn-list')
const hashChain = document.querySelector('#hash-chain')
const diagnoseBlock = document.querySelector('#diagnose-block')
const causeBlock = document.querySelector('#cause-block')
const treatBlock = document.querySelector('#treat-block')
const recheckList = document.querySelector('#recheck-list')
const recheckClear = document.querySelector('#recheck-clear')
const dischargeBlock = document.querySelector('#discharge-block')
const dischargeSummary = document.querySelector('#discharge-summary')

let visit = null
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const wait = (ms) => (reduced ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms)))

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const show = (id) => {
  document.querySelectorAll('.stage').forEach((stage) => {
    stage.hidden = stage.id !== id
  })
}

const text = (selector, value) => {
  document.querySelector(selector).textContent = value ?? ''
}

const fact = (list, label, value) => {
  const row = document.createElement('div')
  row.append(el('dt', '', label), el('dd', '', value))
  list.append(row)
}

const renderPatient = (patient) => {
  text('#patient-name', patient.name)
  text('#patient-role', patient.role)
  text('#patient-file', patient.file)
  text('#patient-complaint', patient.complaint)
}

const renderTurn = (list, edit) => {
  const item = el('li', `turn${edit.evidenceRole === 'repeated' ? ' is-repeat' : ''}`)
  const top = el('div', 'turn-top')
  top.append(el('span', '', `Turn ${edit.turn}`), el('code', '', edit.file))
  item.append(top, el('p', 'intent', edit.intent), el('code', 'hash', edit.shortHash))
  if (edit.evidenceRole === 'repeated') item.append(el('p', 'seen', 'State seen before'))
  list.append(item)

  if (edit.feedback) {
    const note = el('li', 'feedback')
    note.append(el('span', '', edit.feedback.kind), el('p', '', edit.feedback.text))
    list.append(note)
  }
}

const renderChain = (edits) => {
  hashChain.replaceChildren()
  edits.forEach((edit, index) => {
    if (index > 0) hashChain.append(el('span', 'arrow', '→'))
    const chip = el('span', 'chip', edit.shortHash)
    chip.classList.add(
      edit.evidenceRole === 'first-seen' || edit.evidenceRole === 'repeated' ? 'chip-repeat' : 'chip-mid',
    )
    hashChain.append(chip)
  })
  hashChain.hidden = false
}

const play = async (list, edits) => {
  list.replaceChildren()
  for (const edit of edits) {
    renderTurn(list, edit)
    await wait(460)
  }
}

const renderCause = (cause) => {
  text('#cause-title', cause.title)
  text('#cause-summary', cause.summary)
  const list = document.querySelector('#cause-instructions')
  list.replaceChildren()
  cause.instructions.forEach((item) => fact(list, item.label, item.text))
}

const renderTreatment = (treatment) => {
  text(
    '#treat-applied',
    treatment.applied
      ? 'Afterimage applied this treatment to the agent.'
      : 'Prescribed treatment (review required). Not auto-applied — this is an instruction change, not a code rewrite.',
  )
  text('#treat-target', treatment.target)
  text('#treat-change', treatment.recommendedChange)
  text('#treat-current', treatment.currentBehavior)
  text('#treat-instruction', treatment.recommendedInstruction)
  text('#treat-why', treatment.why)
}

const renderDischarge = (data) => {
  dischargeSummary.replaceChildren()
  fact(dischargeSummary, 'Diagnosis', data.symptom)
  fact(dischargeSummary, 'Root cause', data.rootCause.title)
  fact(dischargeSummary, 'Treatment target', data.treatment.target)
  fact(dischargeSummary, 'Recommended change', data.treatment.summaryChange)
  fact(dischargeSummary, 'Outcome', 'Passed recheck')
}

const loadVisit = async () => {
  const response = await fetch('/api/visit')
  if (!response.ok) throw new Error(`Visit failed with ${response.status}`)
  return response.json()
}

const admit = async () => {
  admitButton.disabled = true
  errorNotice.hidden = true
  status.textContent = 'Observing'
  show('stage-exam')
  diagnoseBlock.hidden = true
  causeBlock.hidden = true
  treatBlock.hidden = true
  hashChain.hidden = true
  turnList.replaceChildren()

  try {
    visit = await loadVisit()
    renderPatient(visit.patient)
    await play(turnList, visit.edits)
    renderChain(visit.edits)
    text('#symptom', visit.symptom)
    text('#evidence', visit.diagnosis.evidence)
    await wait(220)
    diagnoseBlock.hidden = false
    status.textContent = 'Loop detected'
    renderCause(visit.rootCause)
    causeBlock.hidden = false
    await wait(180)
    renderTreatment(visit.treatment)
    treatBlock.hidden = false
    status.textContent = 'Treatment ready'
    recheckButton.focus()
  } catch (error) {
    console.error(error)
    errorNotice.hidden = false
    status.textContent = 'Fault'
    show('stage-admit')
  } finally {
    admitButton.disabled = false
  }
}

const recheck = async () => {
  if (!visit) return
  recheckButton.disabled = true
  status.textContent = 'Rechecking'
  show('stage-outcome')
  recheckClear.hidden = true
  dischargeBlock.hidden = true
  recheckList.replaceChildren()
  await play(recheckList, visit.recheck)
  recheckClear.hidden = false
  renderDischarge(visit)
  await wait(180)
  dischargeBlock.hidden = false
  status.textContent = 'Discharged'
  recheckButton.disabled = false
}

admitButton.addEventListener('click', () => void admit())
recheckButton.addEventListener('click', () => void recheck())

void loadVisit()
  .then((data) => {
    visit = data
    renderPatient(data.patient)
  })
  .catch((error) => {
    console.error(error)
    errorNotice.hidden = false
  })
