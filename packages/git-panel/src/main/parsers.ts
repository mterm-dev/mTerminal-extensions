import type {
  ConflictSegment,
  GitBranch,
  GitCommitDetail,
  GitCommitFile,
  GitFile,
  GitLogEntry,
  GitStatus,
  StashEntry,
} from './types'

export const LOG_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%D%x00%s'
export const LOG_RECORD_SEP = '\x1e'

export const BRANCH_FORMAT = [
  '%(refname)',
  '%(HEAD)',
  '%(upstream)',
  '%(upstream:track,nobracket)',
  '%(objectname)',
  '%(authorname)',
  '%(authordate:unix)',
  '%(contents:subject)',
].join('%00')
export const BRANCH_RECORD_SEP = '\x1e'

export const STASH_FORMAT = '%gd%x00%gs%x00%gD%x00%ct'
export const STASH_RECORD_SEP = '\x1e'

function pathAfterFields(s: string, count: number): string {
  let idx = 0
  for (let n = 0; n < count; n++) {
    const sp = s.indexOf(' ', idx)
    if (sp < 0) return ''
    idx = sp + 1
  }
  return s.slice(idx)
}

function makeFile(xy: string, p: string): GitFile {
  const indexStatus = xy[0] ?? '.'
  const worktreeStatus = xy[1] ?? '.'
  return {
    path: p,
    indexStatus,
    worktreeStatus,
    staged: indexStatus !== '.' && indexStatus !== '?',
    unstaged: worktreeStatus !== '.' && worktreeStatus !== '?',
    untracked: false,
  }
}

export function parsePorcelainV2(stdout: string): Omit<GitStatus, 'isRepo' | 'error'> {
  const tokens = stdout.split('\0')
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const files: GitFile[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue

    if (t.startsWith('# branch.head ')) {
      const v = t.slice('# branch.head '.length)
      branch = v === '(detached)' ? null : v
    } else if (t.startsWith('# branch.upstream ')) {
      upstream = t.slice('# branch.upstream '.length)
    } else if (t.startsWith('# branch.ab ')) {
      const m = t.match(/# branch\.ab \+(-?\d+) -(-?\d+)/)
      if (m) {
        ahead = parseInt(m[1], 10)
        behind = parseInt(m[2], 10)
      }
    } else if (t.startsWith('1 ')) {
      const rest = t.slice(2)
      const xy = rest.slice(0, 2)
      const p = pathAfterFields(rest, 7)
      if (p) files.push(makeFile(xy, p))
    } else if (t.startsWith('2 ')) {
      const rest = t.slice(2)
      const xy = rest.slice(0, 2)
      const p = pathAfterFields(rest, 8)
      const oldPath = tokens[i + 1] ?? ''
      i += 1
      if (p) files.push({ ...makeFile(xy, p), oldPath: oldPath || undefined })
    } else if (t.startsWith('u ')) {
      const rest = t.slice(2)
      const xy = rest.slice(0, 2)
      const p = pathAfterFields(rest, 9)
      if (p) files.push(makeFile(xy, p))
    } else if (t.startsWith('? ')) {
      const p = t.slice(2)
      files.push({
        path: p,
        indexStatus: '?',
        worktreeStatus: '?',
        staged: false,
        unstaged: true,
        untracked: true,
      })
    }
  }

  return { branch, upstream, ahead, behind, files }
}

export function parseConflictListPorcelain(stdout: string): Array<{
  path: string
  indexStatus: string
  worktreeStatus: string
}> {
  const out: Array<{ path: string; indexStatus: string; worktreeStatus: string }> = []
  const tokens = stdout.split('\0')
  for (const t of tokens) {
    if (!t || !t.startsWith('u ')) continue
    const rest = t.slice(2)
    const xy = rest.slice(0, 2)
    const p = pathAfterFields(rest, 9)
    if (!p) continue
    out.push({ path: p, indexStatus: xy[0] ?? '.', worktreeStatus: xy[1] ?? '.' })
  }
  return out
}

function parseRefs(decorate: string): string[] {
  if (!decorate) return []
  return decorate
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function parseLogOutput(stdout: string): GitLogEntry[] {
  if (!stdout) return []
  const records = stdout.split(LOG_RECORD_SEP)
  const out: GitLogEntry[] = []
  for (const rec of records) {
    if (!rec) continue
    const trimmed = rec.startsWith('\n') ? rec.slice(1) : rec
    if (!trimmed) continue
    const parts = trimmed.split('\x00')
    if (parts.length < 8) continue
    const sha = parts[0]
    if (!sha || sha.length < 7) continue
    const parentsRaw = parts[2].trim()
    out.push({
      sha,
      shortSha: parts[1],
      parents: parentsRaw ? parentsRaw.split(/\s+/).filter((s) => s.length > 0) : [],
      author: parts[3],
      authorEmail: parts[4],
      date: Number(parts[5]) || 0,
      subject: parts[7],
      refs: parseRefs(parts[6]),
    })
  }
  return out
}

interface ParsedTrack {
  ahead: number
  behind: number
}

function parseTrack(track: string): ParsedTrack {
  if (!track) return { ahead: 0, behind: 0 }
  let ahead = 0
  let behind = 0
  const aheadMatch = track.match(/ahead (\d+)/)
  if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)
  const behindMatch = track.match(/behind (\d+)/)
  if (behindMatch) behind = parseInt(behindMatch[1], 10)
  return { ahead, behind }
}

function shortRefName(refname: string): { name: string; isRemote: boolean } | null {
  if (refname.startsWith('refs/heads/')) {
    return { name: refname.slice('refs/heads/'.length), isRemote: false }
  }
  if (refname.startsWith('refs/remotes/')) {
    const rest = refname.slice('refs/remotes/'.length)
    if (rest.endsWith('/HEAD')) return null
    return { name: rest, isRemote: true }
  }
  return null
}

export function parseBranchOutput(stdout: string): GitBranch[] {
  if (!stdout) return []
  const records = stdout.split(BRANCH_RECORD_SEP)
  const out: GitBranch[] = []
  for (const rec of records) {
    if (!rec) continue
    const trimmed = rec.startsWith('\n') ? rec.slice(1) : rec
    if (!trimmed) continue
    const parts = trimmed.split('\x00')
    if (parts.length < 8) continue
    const ref = shortRefName(parts[0])
    if (!ref) continue
    const upstream = parts[2]
      ? parts[2].startsWith('refs/remotes/')
        ? parts[2].slice('refs/remotes/'.length)
        : parts[2]
      : null
    const { ahead, behind } = parseTrack(parts[3])
    out.push({
      name: ref.name,
      isRemote: ref.isRemote,
      isCurrent: parts[1] === '*',
      upstream: ref.isRemote ? null : upstream,
      ahead,
      behind,
      lastCommitSha: parts[4],
      lastCommitAuthor: parts[5],
      lastCommitDate: Number(parts[6]) || 0,
      lastCommitSubject: parts[7],
    })
  }
  return out
}

export function parseShowOutput(stdout: string): GitCommitDetail | null {
  if (!stdout) return null
  const sepIdx = stdout.indexOf('\x1e')
  if (sepIdx < 0) return null
  const headerPart = stdout.slice(0, sepIdx)
  let filesPart = stdout.slice(sepIdx + 1)
  while (filesPart.length > 0 && (filesPart[0] === '\x00' || filesPart[0] === '\n')) {
    filesPart = filesPart.slice(1)
  }
  const parts = headerPart.split('\x00')
  if (parts.length < 8) return null
  const sha = parts[0]
  if (!sha) return null
  const parentsRaw = parts[2].trim()
  const subject = parts[6]
  const body = parts[7] ?? ''
  const files: GitCommitFile[] = []
  const tokens = filesPart.split('\x00')
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.startsWith('R') || t.startsWith('C')) {
      const oldPath = tokens[i + 1] ?? ''
      const newPath = tokens[i + 2] ?? ''
      i += 2
      if (newPath) files.push({ path: newPath, oldPath, status: t[0] })
    } else if (t.length === 1 && /[A-Z]/.test(t)) {
      const p = tokens[i + 1] ?? ''
      i += 1
      if (p) files.push({ path: p, status: t })
    }
  }
  return {
    sha,
    parents: parentsRaw ? parentsRaw.split(/\s+/).filter((s) => s.length > 0) : [],
    author: parts[3],
    authorEmail: parts[4],
    date: Number(parts[5]) || 0,
    subject,
    body,
    files,
  }
}

export function parseStashList(stdout: string): StashEntry[] {
  if (!stdout) return []
  const records = stdout.split(STASH_RECORD_SEP)
  const out: StashEntry[] = []
  for (const rec of records) {
    if (!rec) continue
    const trimmed = rec.startsWith('\n') ? rec.slice(1) : rec
    if (!trimmed) continue
    const parts = trimmed.split('\x00')
    if (parts.length < 4) continue
    const ref = parts[0]
    const m = ref.match(/^stash@\{(\d+)\}$/)
    if (!m) continue
    const message = parts[1]
    const branchMatch = message.match(/^(?:WIP )?[Oo]n ([^:]+):/)
    out.push({
      index: parseInt(m[1], 10),
      message,
      branch: branchMatch ? branchMatch[1] : null,
      time: Number(parts[3]) || 0,
    })
  }
  return out
}

const MARKER_OURS = /^<{7}(?:\s(.*))?$/
const MARKER_BASE = /^\|{7}(?:\s(.*))?$/
const MARKER_SEP = /^={7}\s*$/
const MARKER_THEIRS = /^>{7}(?:\s(.*))?$/

export function parseConflictMarkers(content: string): {
  segments: ConflictSegment[]
  hasConflicts: boolean
} {
  const lines = content.split('\n')
  const segments: ConflictSegment[] = []
  let common: string[] = []
  let nextId = 1
  let i = 0
  let hasConflicts = false

  const flushCommon = () => {
    if (common.length > 0) {
      segments.push({ kind: 'common', lines: common })
      common = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const startMatch = line.match(MARKER_OURS)
    if (!startMatch) {
      common.push(line)
      i++
      continue
    }
    flushCommon()
    const labelOurs = startMatch[1] ?? undefined
    const ours: string[] = []
    const base: string[] = []
    let theirs: string[] = []
    let labelBase: string | undefined
    let labelTheirs: string | undefined
    let inBase = false
    let inTheirs = false
    let closed = false
    i++
    while (i < lines.length) {
      const l = lines[i]
      const baseMatch = l.match(MARKER_BASE)
      const sepMatch = l.match(MARKER_SEP)
      const endMatch = l.match(MARKER_THEIRS)
      if (!inTheirs && !inBase && baseMatch) {
        labelBase = baseMatch[1] ?? undefined
        inBase = true
        i++
        continue
      }
      if (!inTheirs && sepMatch) {
        inTheirs = true
        inBase = false
        i++
        continue
      }
      if (inTheirs && endMatch) {
        labelTheirs = endMatch[1] ?? undefined
        closed = true
        i++
        break
      }
      if (inTheirs) theirs.push(l)
      else if (inBase) base.push(l)
      else ours.push(l)
      i++
    }
    if (!closed) {
      common.push(line)
      for (const o of ours) common.push(o)
      if (inBase || base.length > 0) {
        common.push('||||||| ' + (labelBase ?? ''))
        for (const b of base) common.push(b)
      }
      if (inTheirs || theirs.length > 0) {
        common.push('=======')
        for (const t of theirs) common.push(t)
      }
      continue
    }
    hasConflicts = true
    segments.push({
      kind: 'conflict',
      id: nextId++,
      ours,
      theirs,
      base: base.length > 0 || inBase ? base : undefined,
      labelOurs,
      labelTheirs,
      labelBase,
    })
  }
  flushCommon()
  return { segments, hasConflicts }
}

export function isLocalChangesPullConflict(message: string): boolean {
  if (typeof message !== 'string' || message.length === 0) return false
  if (/would be overwritten by (merge|checkout|reset)/i.test(message)) return true
  if (/please commit your changes or stash them before/i.test(message)) return true
  if (/please move or remove them before/i.test(message)) return true
  return false
}
