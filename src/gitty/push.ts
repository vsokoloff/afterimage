import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { RecordableEvent } from '../observer.ts'
import type { LucidStore } from '../store.ts'
import { withObservedAgentWork } from '../agents/observe-work.ts'
import { rememberGittyPush, type GittyHabits } from './memory.ts'

const execFileAsync = promisify(execFile)

const SECRET_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  'credentials.json',
  'secrets.json',
])

export type RunGittyPushOptions = {
  store: LucidStore
  cwd?: string
  /** Override auto-drafted commit message. */
  message?: string | null
  dryRun?: boolean
}

export type RunGittyPushResult = {
  exitCode: number
  habits: GittyHabits
  committed: boolean
  pushed: boolean
  commitMessage: string | null
  commitSha: string | null
  branch: string | null
  prUrl: string | null
  explanation: string
  skippedSecrets: string[]
}

async function git(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), code: 0 }
  } catch (error) {
    const err = error as {
      code?: number
      stdout?: string
      stderr?: string
      message?: string
    }
    return {
      stdout: (err.stdout ?? '').toString().trimEnd(),
      stderr: (err.stderr ?? err.message ?? '').toString().trimEnd(),
      code: typeof err.code === 'number' ? err.code : 1,
    }
  }
}

async function gh(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('gh', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), code: 0 }
  } catch (error) {
    const err = error as {
      code?: number
      stdout?: string
      stderr?: string
      message?: string
    }
    return {
      stdout: (err.stdout ?? '').toString().trimEnd(),
      stderr: (err.stderr ?? err.message ?? '').toString().trimEnd(),
      code: typeof err.code === 'number' ? err.code : 1,
    }
  }
}

function basenameOf(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] ?? filePath
}

function isSecretPath(filePath: string): boolean {
  const base = basenameOf(filePath)
  if (SECRET_BASENAMES.has(base)) return true
  if (base.startsWith('.env.')) return true
  return false
}

function parseNameStatus(porcelain: string): string[] {
  if (!porcelain.trim()) return []
  return porcelain
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      // porcelain v1: XY PATH or XY ORIG -> PATH
      const rest = line.slice(3)
      if (rest.includes(' -> ')) return rest.split(' -> ').at(-1)!.trim()
      return rest.trim()
    })
}

export function draftCommitMessage(input: {
  status: string
  diffStat: string
  recentLog: string
}): string {
  const paths = parseNameStatus(input.status)
  const hasKitty = paths.some((p) => p.includes('characters.js'))
  const hasCatalog = paths.some((p) => p.includes('catalog.ts'))
  const hasGitty = paths.some((p) => p.includes('gitty') || p.includes('cli.ts'))

  if (hasGitty && (hasKitty || hasCatalog)) {
    return 'Teach Gitty to own git push, commit, and PR care with a kitty mascot.'
  }
  if (hasGitty) {
    return 'Add Gitty push: commit, explain, push, and take care of PRs.'
  }
  if (hasKitty || hasCatalog) {
    return 'Introduce Gitty the kitty as the PR-care agent mascot.'
  }

  const first = paths[0]
  if (first) {
    const short = first.replace(/^.*\//, '')
    return `Update ${short} and related project files.`
  }
  return 'Apply pending workspace changes.'
}

function explainChanges(input: {
  paths: string[]
  commitMessage: string
  branch: string
  pushed: boolean
  prUrl: string | null
}): string {
  const lines = [
    `Gitty committed: ${input.commitMessage}`,
    `Branch: ${input.branch}`,
    `Files (${input.paths.length}): ${input.paths.slice(0, 12).join(', ')}${
      input.paths.length > 12 ? ', …' : ''
    }`,
  ]
  if (input.pushed) lines.push('Pushed to remote.')
  if (input.prUrl) lines.push(`PR: ${input.prUrl}`)
  else if (input.branch === 'main' || input.branch === 'master') {
    lines.push('On default branch — no PR needed.')
  }
  return lines.join('\n')
}

async function ensurePr(cwd: string, branch: string): Promise<string | null> {
  if (branch === 'main' || branch === 'master') return null

  const existing = await gh(cwd, [
    'pr',
    'list',
    '--head',
    branch,
    '--json',
    'url',
    '--jq',
    '.[0].url',
  ])
  if (existing.code === 0 && existing.stdout.trim()) {
    return existing.stdout.trim()
  }

  const created = await gh(cwd, [
    'pr',
    'create',
    '--fill',
    '--head',
    branch,
  ])
  if (created.code === 0 && created.stdout.trim()) {
    const url = created.stdout
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('http'))
    return url ?? created.stdout.trim()
  }

  // Soft-fail PR care — push may still have succeeded.
  return null
}

/**
 * Gitty push: always commit (if needed) → explain → push → take care of PRs.
 * Remembers that habit under `.lucid/gitty.json`.
 * Always runs under Lucid observation as agent `gitty`.
 */
export async function runGittyPush(
  options: RunGittyPushOptions,
): Promise<RunGittyPushResult> {
  const { result } = await withObservedAgentWork({
    store: options.store,
    agentId: 'gitty',
    job: options.dryRun ? 'gitty push --dry-run' : 'gitty push',
    finishStatus: (outcome: RunGittyPushResult) =>
      outcome.exitCode === 0 ? 'completed' : 'failed',
    work: async ({ record }) => runGittyPushBody(options, record),
  })
  return result
}

async function runGittyPushBody(
  options: RunGittyPushOptions,
  record: (event: RecordableEvent) => Promise<unknown>,
): Promise<RunGittyPushResult> {
  const cwd = options.cwd ?? process.cwd()
  const habits = await rememberGittyPush(options.store)

  const branchRes = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branchRes.code !== 0) {
    await record({
      type: 'error',
      message: branchRes.stderr || branchRes.stdout || 'Not a git repo',
    })
    return {
      exitCode: 1,
      habits,
      committed: false,
      pushed: false,
      commitMessage: null,
      commitSha: null,
      branch: null,
      prUrl: null,
      explanation: `Not a git repo: ${branchRes.stderr || branchRes.stdout}`,
      skippedSecrets: [],
    }
  }
  const branch = branchRes.stdout.trim()

  const statusRes = await git(cwd, ['status', '--porcelain'])
  const paths = parseNameStatus(statusRes.stdout)
  const skippedSecrets = paths.filter(isSecretPath)
  const toStage = paths.filter((p) => !isSecretPath(p))

  const aheadRes = await git(cwd, ['rev-list', '--count', '@{u}..HEAD'])
  const ahead =
    aheadRes.code === 0 ? Number.parseInt(aheadRes.stdout.trim() || '0', 10) : 0
  const hasUpstream = aheadRes.code === 0

  if (toStage.length === 0 && ahead === 0 && hasUpstream) {
    const explanation = skippedSecrets.length
      ? `Nothing safe to commit (skipped secrets: ${skippedSecrets.join(', ')}). Already up to date with remote.`
      : 'Working tree clean and already up to date with remote. Gitty has nothing to push.'
    await record({
      type: 'model_response',
      text: explanation,
      reasonSummary: 'Nothing to push',
    })
    return {
      exitCode: 0,
      habits,
      committed: false,
      pushed: false,
      commitMessage: null,
      commitSha: null,
      branch,
      prUrl: null,
      explanation,
      skippedSecrets,
    }
  }

  const diffStat = (await git(cwd, ['diff', '--stat'])).stdout
  const recentLog = (await git(cwd, ['log', '-5', '--pretty=format:%s'])).stdout
  const commitMessage =
    options.message?.trim() ||
    draftCommitMessage({
      status: statusRes.stdout,
      diffStat,
      recentLog,
    })

  if (options.dryRun) {
    const explanation = [
      'Dry run — Gitty would:',
      `  1. Commit: ${commitMessage}`,
      `  2. Stage ${toStage.length} file(s)${
        skippedSecrets.length ? ` (skip secrets: ${skippedSecrets.join(', ')})` : ''
      }`,
      '  3. Push to remote',
      '  4. Take care of any PRs',
      '',
      habits.push.note,
    ].join('\n')
    await record({
      type: 'model_response',
      text: explanation,
      reasonSummary: 'Dry run',
    })
    return {
      exitCode: 0,
      habits,
      committed: false,
      pushed: false,
      commitMessage,
      commitSha: null,
      branch,
      prUrl: null,
      explanation,
      skippedSecrets,
    }
  }

  let committed = false
  let commitSha: string | null = null

  if (toStage.length > 0) {
    await record({
      type: 'tool_call',
      toolName: 'git',
      arguments: { argv: ['add', '--', ...toStage] },
    })
    const add = await git(cwd, ['add', '--', ...toStage])
    await record({
      type: 'tool_result',
      toolName: 'git',
      ok: add.code === 0,
      output: add.stdout || add.stderr,
    })
    if (add.code !== 0) {
      return {
        exitCode: 1,
        habits,
        committed: false,
        pushed: false,
        commitMessage,
        commitSha: null,
        branch,
        prUrl: null,
        explanation: `git add failed: ${add.stderr || add.stdout}`,
        skippedSecrets,
      }
    }

    await record({
      type: 'tool_call',
      toolName: 'git',
      arguments: { argv: ['commit', '-m', commitMessage] },
    })
    const commit = await git(cwd, ['commit', '-m', commitMessage])
    await record({
      type: 'tool_result',
      toolName: 'git',
      ok: commit.code === 0,
      output: commit.stdout || commit.stderr,
    })
    if (commit.code !== 0) {
      return {
        exitCode: 1,
        habits,
        committed: false,
        pushed: false,
        commitMessage,
        commitSha: null,
        branch,
        prUrl: null,
        explanation: `git commit failed: ${commit.stderr || commit.stdout}`,
        skippedSecrets,
      }
    }
    committed = true
    const sha = await git(cwd, ['rev-parse', 'HEAD'])
    commitSha = sha.code === 0 ? sha.stdout.trim() : null
  }

  const pushArgs = hasUpstream ? ['push'] : ['push', '-u', 'origin', 'HEAD']
  await record({
    type: 'tool_call',
    toolName: 'git',
    arguments: { argv: pushArgs },
  })
  const push = await git(cwd, pushArgs)
  await record({
    type: 'tool_result',
    toolName: 'git',
    ok: push.code === 0,
    output: push.stdout || push.stderr,
  })
  if (push.code !== 0) {
    return {
      exitCode: 1,
      habits,
      committed,
      pushed: false,
      commitMessage: committed ? commitMessage : null,
      commitSha,
      branch,
      prUrl: null,
      explanation: [
        committed ? `Committed: ${commitMessage}` : 'No new commit.',
        `git push failed: ${push.stderr || push.stdout}`,
      ].join('\n'),
      skippedSecrets,
    }
  }

  const prUrl = await ensurePr(cwd, branch)
  if (prUrl) {
    await record({
      type: 'tool_result',
      toolName: 'gh',
      ok: true,
      output: prUrl,
    })
  }

  const explanation = explainChanges({
    paths: toStage.length > 0 ? toStage : ['(push only — prior local commits)'],
    commitMessage: committed ? commitMessage : '(no new commit)',
    branch,
    pushed: true,
    prUrl,
  })

  await record({
    type: 'model_response',
    text: explanation,
    reasonSummary: committed ? commitMessage : 'Pushed existing commits',
  })

  return {
    exitCode: 0,
    habits,
    committed,
    pushed: true,
    commitMessage: committed ? commitMessage : null,
    commitSha,
    branch,
    prUrl,
    explanation,
    skippedSecrets,
  }
}
