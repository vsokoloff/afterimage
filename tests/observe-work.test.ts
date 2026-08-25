import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { withObservedAgentWork } from '../src/agents/observe-work.ts'
import { canonicalDashboardAgentId } from '../src/agents/identity.ts'
import { fetchAgents } from '../src/agents/roster.ts'
import { getRun, listRuns, openStore } from '../src/store.ts'
import { writeRepoAgents } from '../src/workspace/store.ts'

describe('observed agent work', () => {
  it('maps subprocess runs onto the gitty dashboard agent', () => {
    assert.equal(canonicalDashboardAgentId('subprocess'), 'gitty')
    assert.equal(canonicalDashboardAgentId('uma'), 'uma')
  })

  it('records a afterimage run so lastSeenAt updates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-observe-work-'))
    try {
      const store = await openStore({
        projectRoot: root,
        storeRoot: path.join(root, '.lucid'),
      })
      await writeRepoAgents(store, {
        agents: {
          gitty: {
            name: 'Gitty',
            characterId: 'kitty',
            role: 'PRs',
          },
        },
      })

      const { run } = await withObservedAgentWork({
        store,
        agentId: 'gitty',
        job: 'gitty push',
        work: async ({ record }) => {
          await record({
            type: 'tool_call',
            toolName: 'git',
            arguments: { argv: ['push'] },
          })
          await record({
            type: 'tool_result',
            toolName: 'git',
            ok: true,
            output: 'ok',
          })
          return 'done'
        },
      })

      assert.equal(run.agentId, 'gitty')
      assert.equal(run.status, 'completed')

      const roster = await fetchAgents(store)
      const gitty = roster.agents.find((agent) => agent.id === 'gitty')
      assert.ok(gitty)
      assert.ok(gitty.runCount >= 1)
      assert.ok(Date.now() - new Date(gitty.lastSeenAt).getTime() < 60_000)

      // Legacy subprocess runs roll into the same Gitty card.
      const observerRun = await withObservedAgentWork({
        store,
        agentId: 'subprocess',
        job: 'legacy run',
        work: async ({ record }) => {
          await record({ type: 'model_response', text: 'hi' })
          return true
        },
      })
      assert.equal(observerRun.run.agentId, 'subprocess')

      const merged = await fetchAgents(store)
      const gittyCards = merged.agents.filter((agent) => agent.id === 'gitty')
      assert.equal(gittyCards.length, 1)
      assert.ok((gittyCards[0]?.runCount ?? 0) >= 2)

      const runs = await listRuns(store)
      assert.ok(runs.length >= 2)
      const loaded = await getRun(store, run.id)
      assert.ok(loaded?.events.some((event) => event.type === 'prompt'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
