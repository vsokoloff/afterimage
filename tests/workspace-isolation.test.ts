import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import { fetchActivity, fetchAgents } from '../src/agents/index.ts'
import { createObserver } from '../src/observer.ts'
import { startServer } from '../src/server.ts'
import { openStore } from '../src/store.ts'
import { parseRemoteLabel, resolveProjectRoot, resolveWorkspace } from '../src/workspace/identity.ts'
import { initWorkspaceStore, writeRepoAgents } from '../src/workspace/store.ts'
import { fetchWorkspace } from '../src/workspace/index.ts'

const execFileAsync = promisify(execFile)

async function initGitRepo(dir: string, remoteUrl?: string) {
  await execFileAsync('git', ['init'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.email', 'lucid@test.local'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.name', 'Lucid Test'], { cwd: dir })
  await writeFile(path.join(dir, 'README.md'), '# test repo\n', 'utf8')
  await execFileAsync('git', ['add', 'README.md'], { cwd: dir })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: dir })
  if (remoteUrl) {
    await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: dir })
  }
}

async function observeAgent(store: Awaited<ReturnType<typeof openStore>>, agentId: string) {
  const observer = createObserver({ store })
  await observer.startRun({ agentId })
  await observer.record({ type: 'prompt', role: 'user', text: `task for ${agentId}` })
  await observer.finishRun('completed')
}

test('parseRemoteLabel extracts owner/repo from https and ssh remotes', () => {
  assert.equal(parseRemoteLabel('https://github.com/vsokoloff/agent-hospital.git'), 'vsokoloff/agent-hospital')
  assert.equal(parseRemoteLabel('git@github.com:acme/widget.git'), 'acme/widget')
})

test('resolveProjectRoot prefers git root over subdirectory cwd', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-git-root-'))
  try {
    await initGitRepo(root)
    const rootReal = await realpath(root)
    const nested = path.join(rootReal, 'packages', 'svc')
    await mkdir(nested, { recursive: true })
    assert.equal(await resolveProjectRoot(nested), rootReal)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Repo A events and agents do not appear in Repo B', async () => {
  const repoA = await mkdtemp(path.join(os.tmpdir(), 'lucid-repo-a-'))
  const repoB = await mkdtemp(path.join(os.tmpdir(), 'lucid-repo-b-'))
  try {
    await initGitRepo(repoA, 'https://github.com/test/repo-a.git')
    await initGitRepo(repoB, 'https://github.com/test/repo-b.git')

    const storeA = await openStore({ projectRoot: repoA })
    const storeB = await openStore({ projectRoot: repoB })

    assert.notEqual(storeA.workspace.id, storeB.workspace.id)
    assert.equal(storeA.workspace.label, 'test/repo-a')
    assert.equal(storeB.workspace.label, 'test/repo-b')

    await observeAgent(storeA, 'codex:alpha')

    const agentsA = await fetchAgents(storeA)
    const agentsB = await fetchAgents(storeB)
    assert.equal(agentsA.agents.length, 1)
    assert.equal(agentsA.agents[0]?.id, 'codex:alpha')
    assert.equal(agentsB.agents.length, 0)

    const activityA = await fetchActivity(storeA)
    const activityB = await fetchActivity(storeB)
    assert.ok(activityA.activity.length >= 1)
    assert.equal(activityB.activity.length, 0)
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
  }
})

test('agent appears from repo config before any run, and uses config name after runs', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'lucid-repo-config-'))
  try {
    await initGitRepo(repo)
    const store = await openStore({ projectRoot: repo })

    const empty = await fetchAgents(store)
    assert.equal(empty.agents.length, 0)

    await writeRepoAgents(store, {
      agents: {
        'my-bot': { name: 'My Repo Bot', characterId: 'test', role: 'Configured locally' },
      },
    })

    const configured = await fetchAgents(store)
    assert.equal(configured.agents.length, 1)
    assert.equal(configured.agents[0]?.name, 'My Repo Bot')
    assert.equal(configured.agents[0]?.runCount, 0)
    assert.equal(configured.agents[0]?.status, 'idle')

    await observeAgent(store, 'my-bot')

    const roster = await fetchAgents(store)
    assert.equal(roster.agents.length, 1)
    assert.equal(roster.agents[0]?.name, 'My Repo Bot')
    assert.equal(roster.agents[0]?.characterId, 'test')
    assert.equal(roster.agents[0]?.role, 'Configured locally')
    assert.ok((roster.agents[0]?.runCount ?? 0) >= 1)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('opening Lucid from each repo serves the correct workspace', async () => {
  const repoA = await mkdtemp(path.join(os.tmpdir(), 'lucid-open-a-'))
  const repoB = await mkdtemp(path.join(os.tmpdir(), 'lucid-open-b-'))
  try {
    await initGitRepo(repoA, 'https://github.com/acme/project-a.git')
    await initGitRepo(repoB, 'https://github.com/acme/project-b.git')

    const storeA = await openStore({ projectRoot: repoA })
    await observeAgent(storeA, 'subprocess')

    const { url: urlA, server: serverA } = await startServer({ port: 0, store: storeA })
    const bodyA = await (await fetch(`${urlA}/api/workspace`)).json()
    const agentsA = await (await fetch(`${urlA}/api/agents`)).json()
    assert.equal(bodyA.workspace.label, 'acme/project-a')
    assert.equal(agentsA.agents.length, 1)

    const storeB = await openStore({ projectRoot: repoB })
    const { url: urlB, server: serverB } = await startServer({ port: 0, store: storeB })
    const bodyB = await (await fetch(`${urlB}/api/workspace`)).json()
    const agentsB = await (await fetch(`${urlB}/api/agents`)).json()
    assert.equal(bodyB.workspace.label, 'acme/project-b')
    assert.equal(agentsB.agents.length, 0)

    await new Promise<void>((resolve, reject) => serverA.close((error) => (error ? reject(error) : resolve())))
    await new Promise<void>((resolve, reject) => serverB.close((error) => (error ? reject(error) : resolve())))
  } finally {
    await rm(repoA, { recursive: true, force: true })
    await rm(repoB, { recursive: true, force: true })
  }
})

test('resolveWorkspace falls back to folder name without git remote', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lucid-no-remote-'))
  try {
    const workspace = await resolveWorkspace(dir)
    assert.equal(workspace.label, path.basename(dir))
    assert.ok(workspace.id.startsWith('ws_'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('initWorkspaceStore creates repo-local lucid directories', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'lucid-init-'))
  try {
    const store = await openStore({ projectRoot: repo })
    await initWorkspaceStore(store)
    const loaded = await fetchWorkspace(store)
    assert.equal(loaded.workspace.root, repo)
    assert.ok(await fetchAgents(store))
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
