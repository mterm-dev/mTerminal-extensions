import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import {
  DEFAULT_TIMEOUT,
  DIFF_MAX_BUFFER,
  NETWORK_TIMEOUT,
  ensureRefName,
  ensureSafeRef,
  isGitRepo,
  isValidRefName,
  runGit,
} from './exec'
import {
  BRANCH_FORMAT,
  BRANCH_RECORD_SEP,
  LOG_FORMAT,
  LOG_RECORD_SEP,
  STASH_FORMAT,
  STASH_RECORD_SEP,
  parseBranchOutput,
  parseConflictListPorcelain,
  parseConflictMarkers,
  parseLogOutput,
  parsePorcelainV2,
  parseShowOutput,
  parseStashList,
} from './parsers'
import type {
  CheckoutOptions,
  ConflictFileEntry,
  ConflictSegment,
  GitBranch,
  GitCommitDetail,
  GitLogEntry,
  GitPullStrategyOption,
  GitStatus,
  LogOptions,
  MergeStateKind,
  ResetMode,
  StashEntry,
} from './types'

async function readUntrackedAsDiff(cwd: string, relPath: string): Promise<{ text: string; truncated: boolean }> {
  let rel = relPath
  let base = cwd
  if (rel.startsWith(':/')) {
    rel = rel.slice(2)
    const top = await runGit(['rev-parse', '--show-toplevel'], { cwd, timeout: 5_000 })
    if (top.code === 0 && top.stdout.trim()) base = top.stdout.trim()
  }
  const abs = path.join(base, rel)
  try {
    const st = await fsp.stat(abs)
    if (st.size > DIFF_MAX_BUFFER) {
      return { text: '', truncated: true }
    }
    const buf = await fsp.readFile(abs)
    if (buf.includes(0)) {
      return { text: 'Binary file (untracked)\n', truncated: false }
    }
    const lines = buf.toString('utf8').split('\n')
    const header = `diff --git a/dev/null b/${rel}\n--- /dev/null\n+++ b/${rel}\n@@ -0,0 +1,${lines.length} @@\n`
    return { text: header + lines.map((l) => '+' + l).join('\n') + '\n', truncated: false }
  } catch (err) {
    return { text: `Could not read file: ${(err as Error).message}\n`, truncated: false }
  }
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  const repo = await isGitRepo(cwd)
  if (!repo) {
    return { isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, files: [] }
  }
  const r = await runGit(
    ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'],
    { cwd },
  )
  if (r.code !== 0) {
    return {
      isRepo: true,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      error: r.stderr.trim() || `git status exited with code ${r.code}`,
    }
  }
  const parsed = parsePorcelainV2(r.stdout)
  return { isRepo: true, ...parsed }
}

export async function gitDiff(
  cwd: string,
  relPath: string,
  staged: boolean,
  context?: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  const tracked = await runGit(['ls-files', '--error-unmatch', '--', relPath], { cwd, timeout: 5_000 })
  if (tracked.code !== 0) {
    return readUntrackedAsDiff(cwd, relPath)
  }
  const args = ['diff', '--no-color']
  if (typeof context === 'number' && Number.isFinite(context) && context >= 0) {
    args.push(`-U${Math.floor(context)}`)
  }
  if (staged) args.push('--cached')
  args.push('--', relPath)
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0 && !r.stdout) {
    throw new Error(r.stderr.trim() || `git diff exited with code ${r.code}`)
  }
  const truncated = r.stdout.length >= DIFF_MAX_BUFFER
  return { text: truncated ? r.stdout.slice(0, DIFF_MAX_BUFFER) : r.stdout, truncated }
}

export async function gitStage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const r = await runGit(['add', '--', ...paths], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git add failed')
}

export async function gitUnstage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const headProbe = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd, timeout: 5_000 })
  if (headProbe.code === 0) {
    const r = await runGit(['reset', 'HEAD', '--', ...paths], { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git reset failed')
  } else {
    const r = await runGit(['rm', '--cached', '--', ...paths], { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git rm --cached failed')
  }
}

export async function gitCommit(
  cwd: string,
  message: string,
  paths?: string[],
): Promise<{ commit: string }> {
  if (!message || !message.trim()) throw new Error('commit message is empty')
  const args = ['commit', '-m', message]
  if (paths && paths.length > 0) {
    args.push('--', ...paths)
  }
  const r = await runGit(args, { cwd })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git commit failed')
  }
  const head = await runGit(['rev-parse', 'HEAD'], { cwd, timeout: 5_000 })
  return { commit: head.stdout.trim() }
}

export async function gitAmend(
  cwd: string,
  message: string | undefined,
  paths?: string[],
): Promise<{ commit: string }> {
  if (paths && paths.length > 0) {
    const add = await runGit(['add', '--', ...paths], { cwd })
    if (add.code !== 0) throw new Error(add.stderr.trim() || 'git add failed')
  }
  const args = ['commit', '--amend']
  if (typeof message === 'string' && message.trim().length > 0) {
    args.push('-m', message)
  } else {
    args.push('--no-edit')
  }
  const r = await runGit(args, { cwd })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git commit --amend failed')
  }
  const head = await runGit(['rev-parse', 'HEAD'], { cwd, timeout: 5_000 })
  return { commit: head.stdout.trim() }
}

export async function gitLastCommitMessage(cwd: string): Promise<string> {
  const r = await runGit(['log', '-1', '--pretty=%B'], { cwd, timeout: 5_000 })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git log failed')
  return r.stdout.replace(/\n+$/, '')
}

export async function gitReset(
  cwd: string,
  ref: string,
  mode: ResetMode,
): Promise<void> {
  ensureSafeRef(ref)
  if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') {
    throw new Error(`invalid reset mode: ${mode}`)
  }
  const r = await runGit(['reset', `--${mode}`, ref], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || 'git reset failed')
}

export async function gitPush(
  cwd: string,
  setUpstream: boolean,
): Promise<{ stdout: string; stderr: string }> {
  const args = ['push']
  if (setUpstream) {
    const branchRes = await runGit(['symbolic-ref', '--short', 'HEAD'], { cwd, timeout: 5_000 })
    const branch = branchRes.stdout.trim()
    if (!branch) throw new Error('cannot determine current branch (detached HEAD?)')
    args.push('--set-upstream', 'origin', branch)
  }
  const r = await runGit(args, { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git push failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export async function gitPull(cwd: string): Promise<{ stdout: string; stderr: string }> {
  const r = await runGit(['pull', '--ff-only'], { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git pull failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export async function gitFetch(cwd: string): Promise<{ stdout: string; stderr: string }> {
  const r = await runGit(['fetch'], { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git fetch failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export async function gitListBranches(cwd: string): Promise<GitBranch[]> {
  const r = await runGit(
    [
      'for-each-ref',
      `--format=${BRANCH_FORMAT}${BRANCH_RECORD_SEP}`,
      'refs/heads',
      'refs/remotes',
    ],
    { cwd },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git for-each-ref failed')
  return parseBranchOutput(r.stdout)
}

export async function gitCheckout(
  cwd: string,
  ref: string,
  opts: CheckoutOptions = {},
): Promise<void> {
  ensureSafeRef(ref)
  const args: string[] = ['checkout']
  if (opts.createNew) {
    if (!opts.newName) throw new Error('newName required when createNew is true')
    ensureRefName(opts.newName)
    args.push('-b', opts.newName, ref)
  } else if (ref.includes('/') && !opts.newName) {
    const localName = ref.split('/').slice(1).join('/')
    if (localName && isValidRefName(localName)) {
      args.push('--track', '-b', localName, ref)
    } else {
      args.push(ref)
    }
  } else {
    args.push(ref)
  }
  const r = await runGit(args, { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git checkout failed')
}

export async function gitBranchCreate(
  cwd: string,
  name: string,
  fromRef?: string,
  checkout?: boolean,
): Promise<void> {
  ensureRefName(name)
  if (fromRef !== undefined) ensureSafeRef(fromRef)
  if (checkout) {
    const args = ['checkout', '-b', name]
    if (fromRef) args.push(fromRef)
    const r = await runGit(args, { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git checkout -b failed')
    return
  }
  const args = ['branch', name]
  if (fromRef) args.push(fromRef)
  const r = await runGit(args, { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git branch failed')
}

export async function gitBranchDelete(
  cwd: string,
  name: string,
  force: boolean,
): Promise<void> {
  ensureRefName(name)
  const r = await runGit(['branch', force ? '-D' : '-d', name], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git branch -d failed')
}

export async function gitBranchDeleteRemote(
  cwd: string,
  remote: string,
  name: string,
): Promise<void> {
  ensureRefName(name)
  if (!remote || remote.startsWith('-')) throw new Error(`invalid remote: ${remote}`)
  const r = await runGit(['push', remote, '--delete', name], {
    cwd,
    timeout: NETWORK_TIMEOUT,
  })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git push --delete failed')
}

export async function gitBranchRename(
  cwd: string,
  oldName: string,
  newName: string,
): Promise<void> {
  ensureRefName(oldName)
  ensureRefName(newName)
  const r = await runGit(['branch', '-m', oldName, newName], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git branch -m failed')
}

export async function gitLog(
  cwd: string,
  opts: LogOptions = {},
): Promise<GitLogEntry[]> {
  const limit = Math.max(1, Math.min(2000, opts.limit ?? 200))
  const skip = Math.max(0, opts.skip ?? 0)
  const args = [
    'log',
    `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
    '--decorate=short',
    `--max-count=${limit}`,
  ]
  if (skip > 0) args.push(`--skip=${skip}`)
  if (opts.all) args.push('--all')
  if (opts.ref) {
    ensureSafeRef(opts.ref)
    args.push(opts.ref)
  }
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `git log exited with code ${r.code}`
    if (/does not have any commits|unknown revision|bad revision|ambiguous argument/i.test(msg)) {
      return []
    }
    throw new Error(msg)
  }
  return parseLogOutput(r.stdout)
}

export async function gitShow(cwd: string, sha: string): Promise<GitCommitDetail> {
  ensureSafeRef(sha)
  const fmt = '%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%b%x1e'
  const r = await runGit(
    ['log', '-1', '--name-status', '-z', `--format=${fmt}`, sha],
    { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git show failed')
  const parsed = parseShowOutput(r.stdout)
  if (!parsed) throw new Error('failed to parse commit')
  return parsed
}

export async function gitDiffCommit(
  cwd: string,
  sha: string,
  relPath: string,
  context?: number,
): Promise<{ text: string; truncated: boolean }> {
  ensureSafeRef(sha)
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  const args = ['show', '--no-color']
  if (typeof context === 'number' && Number.isFinite(context) && context >= 0) {
    args.push(`-U${Math.floor(context)}`)
  }
  args.push('--format=', sha, '--', relPath)
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0 && !r.stdout) {
    throw new Error(r.stderr.trim() || `git show exited with code ${r.code}`)
  }
  const truncated = r.stdout.length >= DIFF_MAX_BUFFER
  return { text: truncated ? r.stdout.slice(0, DIFF_MAX_BUFFER) : r.stdout, truncated }
}

export async function gitIncoming(cwd: string): Promise<GitLogEntry[]> {
  const upstreamProbe = await runGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { cwd, timeout: 5_000 },
  )
  if (upstreamProbe.code !== 0) return []
  const r = await runGit(
    [
      'log',
      `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
      '--decorate=short',
      'HEAD..@{u}',
    ],
    { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 },
  )
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `git log exited with code ${r.code}`
    if (/unknown revision|bad revision/i.test(msg)) return []
    throw new Error(msg)
  }
  return parseLogOutput(r.stdout)
}

export async function gitOutgoing(cwd: string): Promise<GitLogEntry[]> {
  const upstreamProbe = await runGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { cwd, timeout: 5_000 },
  )
  let args: string[]
  if (upstreamProbe.code === 0) {
    args = [
      'log',
      `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
      '--decorate=short',
      '@{u}..HEAD',
    ]
  } else {
    args = [
      'log',
      `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
      '--decorate=short',
      '--max-count=200',
      'HEAD',
      '--not',
      '--remotes',
    ]
  }
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `git log exited with code ${r.code}`
    if (/unknown revision|bad revision|does not have any commits/i.test(msg)) return []
    throw new Error(msg)
  }
  return parseLogOutput(r.stdout)
}

export async function gitPullStrategy(
  cwd: string,
  strategy: GitPullStrategyOption,
): Promise<{ stdout: string; stderr: string }> {
  let flag: string
  if (strategy === 'ff-only') flag = '--ff-only'
  else if (strategy === 'merge') flag = '--no-rebase'
  else if (strategy === 'rebase') flag = '--rebase'
  else throw new Error(`invalid strategy: ${strategy}`)
  const r = await runGit(['pull', flag], { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git pull failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export async function gitStash(
  cwd: string,
  message?: string,
): Promise<{ created: boolean; stdout: string }> {
  const args = ['stash', 'push', '--include-untracked']
  if (typeof message === 'string' && message.trim().length > 0) {
    args.push('-m', message.trim())
  }
  const r = await runGit(args, { cwd })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git stash failed')
  }
  const created = !/No local changes to save/i.test(r.stdout + r.stderr)
  return { created, stdout: r.stdout }
}

export async function gitStashPop(
  cwd: string,
): Promise<{ stdout: string; stderr: string; conflict: boolean }> {
  const r = await runGit(['stash', 'pop'], { cwd })
  if (r.code !== 0) {
    const text = (r.stderr + r.stdout).trim()
    if (/conflict/i.test(text)) {
      return { stdout: r.stdout, stderr: r.stderr, conflict: true }
    }
    throw new Error(text || 'git stash pop failed')
  }
  const conflict = /CONFLICT/.test(r.stdout) || /CONFLICT/.test(r.stderr)
  return { stdout: r.stdout, stderr: r.stderr, conflict }
}

export async function gitStashList(cwd: string): Promise<StashEntry[]> {
  const r = await runGit(
    ['stash', 'list', `--format=${STASH_FORMAT}${STASH_RECORD_SEP}`],
    { cwd, timeout: DEFAULT_TIMEOUT },
  )
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `git stash list exited with code ${r.code}`
    if (/not a git repository/i.test(msg)) return []
    throw new Error(msg)
  }
  return parseStashList(r.stdout)
}

export async function gitStashDrop(cwd: string, index: number): Promise<void> {
  if (!Number.isInteger(index) || index < 0) throw new Error(`invalid stash index: ${index}`)
  const r = await runGit(['stash', 'drop', `stash@{${index}}`], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || 'git stash drop failed')
}

export async function gitStashApply(
  cwd: string,
  index: number,
  pop: boolean,
): Promise<{ stdout: string; stderr: string; conflict: boolean }> {
  if (!Number.isInteger(index) || index < 0) throw new Error(`invalid stash index: ${index}`)
  const sub = pop ? 'pop' : 'apply'
  const r = await runGit(['stash', sub, `stash@{${index}}`], { cwd })
  if (r.code !== 0) {
    const text = (r.stderr + r.stdout).trim()
    if (/conflict/i.test(text)) {
      return { stdout: r.stdout, stderr: r.stderr, conflict: true }
    }
    throw new Error(text || `git stash ${sub} failed`)
  }
  const conflict = /CONFLICT/.test(r.stdout) || /CONFLICT/.test(r.stderr)
  return { stdout: r.stdout, stderr: r.stderr, conflict }
}

export async function gitStashShow(
  cwd: string,
  index: number,
  context?: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!Number.isInteger(index) || index < 0) throw new Error(`invalid stash index: ${index}`)
  const args = ['stash', 'show', '-p', '--no-color']
  if (typeof context === 'number' && Number.isFinite(context) && context >= 0) {
    args.push(`-U${Math.floor(context)}`)
  }
  args.push(`stash@{${index}}`)
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0 && !r.stdout) {
    throw new Error(r.stderr.trim() || `git stash show exited with code ${r.code}`)
  }
  const truncated = r.stdout.length >= DIFF_MAX_BUFFER
  return { text: truncated ? r.stdout.slice(0, DIFF_MAX_BUFFER) : r.stdout, truncated }
}

export async function gitListConflicts(cwd: string): Promise<ConflictFileEntry[]> {
  const r = await runGit(
    ['status', '--porcelain=v2', '--untracked-files=no', '-z'],
    { cwd },
  )
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || `git status exited with code ${r.code}`)
  }
  return parseConflictListPorcelain(r.stdout)
}

export async function gitReadConflictFile(
  cwd: string,
  relPath: string,
): Promise<{
  path: string
  content: string
  segments: ConflictSegment[]
  hasConflicts: boolean
  binary: boolean
}> {
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  const abs = path.join(cwd, relPath)
  const buf = await fsp.readFile(abs)
  if (buf.includes(0)) {
    return { path: relPath, content: '', segments: [], hasConflicts: false, binary: true }
  }
  const content = buf.toString('utf8')
  const { segments, hasConflicts } = parseConflictMarkers(content)
  return { path: relPath, content, segments, hasConflicts, binary: false }
}

export async function gitResolveFile(
  cwd: string,
  relPath: string,
  content: string,
): Promise<void> {
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  if (typeof content !== 'string') throw new Error('content must be a string')
  const { hasConflicts } = parseConflictMarkers(content)
  if (hasConflicts) {
    throw new Error('content still contains conflict markers; resolve all conflicts before saving')
  }
  const abs = path.join(cwd, relPath)
  await fsp.writeFile(abs, content, 'utf8')
  const r = await runGit(['add', '--', relPath], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git add failed')
}

export async function gitMergeState(cwd: string): Promise<MergeStateKind> {
  const gitDirRes = await runGit(['rev-parse', '--git-dir'], { cwd, timeout: 5_000 })
  if (gitDirRes.code !== 0) return null
  const rel = gitDirRes.stdout.trim()
  const gitDir = path.isAbsolute(rel) ? rel : path.join(cwd, rel)
  const exists = (p: string) => {
    try {
      fs.accessSync(path.join(gitDir, p))
      return true
    } catch {
      return false
    }
  }
  if (exists('MERGE_HEAD')) return 'merge'
  if (exists('rebase-merge') || exists('rebase-apply') || exists('REBASE_HEAD')) return 'rebase'
  if (exists('CHERRY_PICK_HEAD')) return 'cherry-pick'
  if (exists('REVERT_HEAD')) return 'revert'
  return null
}

export async function gitMergeAbort(cwd: string): Promise<void> {
  const state = await gitMergeState(cwd)
  let args: string[]
  if (state === 'merge') args = ['merge', '--abort']
  else if (state === 'rebase') args = ['rebase', '--abort']
  else if (state === 'cherry-pick') args = ['cherry-pick', '--abort']
  else if (state === 'revert') args = ['revert', '--abort']
  else throw new Error('no merge/rebase/cherry-pick/revert in progress')
  const r = await runGit(args, { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git abort failed')
}

export async function gitDiscardAll(cwd: string): Promise<void> {
  const headProbe = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd, timeout: 5_000 })
  if (headProbe.code === 0) {
    const r1 = await runGit(['reset', '--hard', 'HEAD'], { cwd })
    if (r1.code !== 0) throw new Error(r1.stderr.trim() || 'git reset --hard failed')
  }
  const r2 = await runGit(['clean', '-fd'], { cwd })
  if (r2.code !== 0) throw new Error(r2.stderr.trim() || 'git clean failed')
}

export async function gitDiscardPaths(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return

  const ls = await runGit(['ls-files', '-z', '--', ...paths], { cwd })
  if (ls.code !== 0) throw new Error(ls.stderr.trim() || 'git ls-files failed')
  const tracked = new Set(ls.stdout.split('\0').filter((s) => s.length > 0))

  const headProbe = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd, timeout: 5_000 })
  const hasHead = headProbe.code === 0

  const restorePaths: string[] = []
  const rmPaths: string[] = []
  const cleanPaths: string[] = []

  for (const p of paths) {
    if (!tracked.has(p)) {
      cleanPaths.push(p)
      continue
    }
    if (!hasHead) {
      rmPaths.push(p)
      continue
    }
    const probe = await runGit(['cat-file', '-e', `HEAD:${p}`], { cwd, timeout: 5_000 })
    if (probe.code === 0) restorePaths.push(p)
    else rmPaths.push(p)
  }

  if (restorePaths.length > 0) {
    const r = await runGit(['checkout', 'HEAD', '--', ...restorePaths], { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git checkout HEAD failed')
  }
  if (rmPaths.length > 0) {
    const r = await runGit(['rm', '-f', '--', ...rmPaths], { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git rm failed')
  }
  if (cleanPaths.length > 0) {
    const r = await runGit(['clean', '-fd', '--', ...cleanPaths], { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git clean failed')
  }
}

export async function gitDeleteFile(cwd: string, filePath: string): Promise<void> {
  const abs = path.resolve(cwd, filePath)
  if (!abs.startsWith(path.resolve(cwd) + path.sep) && abs !== path.resolve(cwd)) {
    throw new Error(`path escapes cwd: ${filePath}`)
  }
  await fsp.rm(abs, { recursive: false, force: false })
}
