import { describe, it, expect } from 'vitest'
import {
  parseBranchOutput,
  parseConflictListPorcelain,
  parseConflictMarkers,
  parseLogOutput,
  parsePorcelainV2,
  parseShowOutput,
  parseStashList,
  isLocalChangesPullConflict,
  BRANCH_RECORD_SEP,
  LOG_RECORD_SEP,
  STASH_RECORD_SEP,
} from '../../src/main/parsers'

describe('parsePorcelainV2', () => {
  it('handles branch head and ahead/behind', () => {
    const input = [
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +3 -1',
    ].join('\0') + '\0'
    const out = parsePorcelainV2(input)
    expect(out.branch).toBe('main')
    expect(out.upstream).toBe('origin/main')
    expect(out.ahead).toBe(3)
    expect(out.behind).toBe(1)
    expect(out.files).toEqual([])
  })

  it('detaches branch as null', () => {
    const out = parsePorcelainV2('# branch.head (detached)\0')
    expect(out.branch).toBeNull()
  })

  it('parses modified ordinary entries (type 1)', () => {
    // type-1 entry: "1 XY sub <mH> <mI> <mW> <hH> <hI> <path>"
    const entry = '1 M. N... 100644 100644 100644 abc def src/foo.ts'
    const out = parsePorcelainV2(entry + '\0')
    expect(out.files).toHaveLength(1)
    expect(out.files[0]).toMatchObject({
      path: 'src/foo.ts',
      indexStatus: 'M',
      worktreeStatus: '.',
      staged: true,
      unstaged: false,
      untracked: false,
    })
  })

  it('parses untracked entries (type ?)', () => {
    const out = parsePorcelainV2('? new-file.txt\0')
    expect(out.files).toHaveLength(1)
    expect(out.files[0]).toMatchObject({
      path: 'new-file.txt',
      indexStatus: '?',
      worktreeStatus: '?',
      untracked: true,
      unstaged: true,
    })
  })

  it('parses renamed entries with old path (type 2)', () => {
    // type-2: "2 XY sub mH mI mW hH hI <X<score>> <newPath>" then "\0<oldPath>\0"
    const entry = '2 R. N... 100644 100644 100644 abc def R100 newpath.ts'
    const oldPath = 'oldpath.ts'
    const out = parsePorcelainV2(entry + '\0' + oldPath + '\0')
    expect(out.files).toHaveLength(1)
    expect(out.files[0].path).toBe('newpath.ts')
    expect(out.files[0].oldPath).toBe('oldpath.ts')
  })

  it('parses unmerged entries (type u)', () => {
    const entry = 'u UU N... 100644 100644 100644 100644 a b c conflict.txt'
    const out = parsePorcelainV2(entry + '\0')
    expect(out.files).toHaveLength(1)
    expect(out.files[0]).toMatchObject({
      path: 'conflict.txt',
      indexStatus: 'U',
      worktreeStatus: 'U',
    })
  })
})

describe('parseConflictListPorcelain', () => {
  it('lists only unmerged entries', () => {
    const stdout = [
      '# branch.head main',
      'u UU N... 100644 100644 100644 100644 a b c conflict.txt',
      '1 M. N... 100644 100644 100644 abc def src/foo.ts',
    ].join('\0') + '\0'
    const out = parseConflictListPorcelain(stdout)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ path: 'conflict.txt', indexStatus: 'U', worktreeStatus: 'U' })
  })
})

describe('parseLogOutput', () => {
  it('parses minimal log record', () => {
    const rec = [
      'aaaaaaaaaaaa1234567890',
      'aaaaaaa',
      'bbbbbbb cccccccc',
      'Author Name',
      'a@example.com',
      '1700000000',
      'HEAD -> main, origin/main',
      'init: first commit',
    ].join('\x00')
    const out = parseLogOutput(rec + LOG_RECORD_SEP)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      sha: 'aaaaaaaaaaaa1234567890',
      shortSha: 'aaaaaaa',
      parents: ['bbbbbbb', 'cccccccc'],
      author: 'Author Name',
      authorEmail: 'a@example.com',
      date: 1700000000,
      subject: 'init: first commit',
    })
    expect(out[0].refs).toEqual(['HEAD -> main', 'origin/main'])
  })

  it('returns empty array for empty input', () => {
    expect(parseLogOutput('')).toEqual([])
  })

  it('handles multiple records', () => {
    const r = (sha: string) =>
      [sha, sha.slice(0, 7), '', 'A', 'a@b', '1', '', sha].join('\x00')
    const stdout = r('sha1aaa') + LOG_RECORD_SEP + r('sha2bbb') + LOG_RECORD_SEP
    const out = parseLogOutput(stdout)
    expect(out).toHaveLength(2)
    expect(out.map((c) => c.sha)).toEqual(['sha1aaa', 'sha2bbb'])
  })
})

describe('parseBranchOutput', () => {
  it('parses local branches with current marker', () => {
    const rec = [
      'refs/heads/main',
      '*',
      'refs/remotes/origin/main',
      'ahead 2 behind 1',
      'abc123',
      'Author',
      '1700000000',
      'subject line',
    ].join('\x00')
    const out = parseBranchOutput(rec + BRANCH_RECORD_SEP)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      name: 'main',
      isRemote: false,
      isCurrent: true,
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      lastCommitSubject: 'subject line',
    })
  })

  it('parses remote branches', () => {
    const rec = [
      'refs/remotes/origin/feature-x',
      '',
      '',
      '',
      'abc',
      'A',
      '1',
      'subj',
    ].join('\x00')
    const out = parseBranchOutput(rec + BRANCH_RECORD_SEP)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      name: 'origin/feature-x',
      isRemote: true,
      isCurrent: false,
      upstream: null,
    })
  })

  it('skips HEAD ref pseudo-entry', () => {
    const rec = ['refs/remotes/origin/HEAD', '', '', '', 'a', 'A', '1', 's'].join('\x00')
    const out = parseBranchOutput(rec + BRANCH_RECORD_SEP)
    expect(out).toHaveLength(0)
  })
})

describe('parseShowOutput', () => {
  it('parses commit with files', () => {
    const header = [
      'abc123',
      'abc1234',
      'parent1',
      'Author',
      'a@b',
      '1700000000',
      'subject line',
      'body text\nmore body',
    ].join('\x00')
    const files = '\x00M\x00src/foo.ts\x00R\x00old.ts\x00new.ts\x00'
    const out = parseShowOutput(header + '\x1e' + files)
    expect(out).not.toBeNull()
    expect(out!.sha).toBe('abc123')
    expect(out!.body).toBe('body text\nmore body')
    expect(out!.files).toEqual([
      { path: 'src/foo.ts', status: 'M' },
      { path: 'new.ts', oldPath: 'old.ts', status: 'R' },
    ])
  })

  it('returns null on malformed input', () => {
    expect(parseShowOutput('')).toBeNull()
    expect(parseShowOutput('not-a-valid-format')).toBeNull()
  })
})

describe('parseStashList', () => {
  it('parses stash entries with branch and timestamp', () => {
    const rec = ['stash@{0}', 'WIP on main: 1234567 hello', 'refs/stash@{0}', '1700000000'].join('\x00')
    const out = parseStashList(rec + STASH_RECORD_SEP)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      index: 0,
      message: 'WIP on main: 1234567 hello',
      branch: 'main',
      time: 1700000000,
    })
  })

  it('parses messages without branch', () => {
    const rec = ['stash@{5}', 'my custom message', 'refs/stash@{5}', '1700000000'].join('\x00')
    const out = parseStashList(rec + STASH_RECORD_SEP)
    expect(out).toHaveLength(1)
    expect(out[0].index).toBe(5)
    expect(out[0].branch).toBeNull()
  })

  it('returns empty array for empty input', () => {
    expect(parseStashList('')).toEqual([])
  })
})

describe('parseConflictMarkers', () => {
  it('detects no conflicts in plain content', () => {
    const out = parseConflictMarkers('line1\nline2\nline3\n')
    expect(out.hasConflicts).toBe(false)
    expect(out.segments).toHaveLength(1)
    expect(out.segments[0]).toMatchObject({ kind: 'common' })
  })

  it('parses 2-way conflict', () => {
    const content = [
      'before',
      '<<<<<<< HEAD',
      'ours-1',
      'ours-2',
      '=======',
      'theirs-1',
      '>>>>>>> branch',
      'after',
    ].join('\n')
    const out = parseConflictMarkers(content)
    expect(out.hasConflicts).toBe(true)
    expect(out.segments).toHaveLength(3)
    expect(out.segments[0]).toMatchObject({ kind: 'common', lines: ['before'] })
    const conflict = out.segments[1]
    expect(conflict.kind).toBe('conflict')
    if (conflict.kind === 'conflict') {
      expect(conflict.ours).toEqual(['ours-1', 'ours-2'])
      expect(conflict.theirs).toEqual(['theirs-1'])
      expect(conflict.labelOurs).toBe('HEAD')
      expect(conflict.labelTheirs).toBe('branch')
      expect(conflict.base).toBeUndefined()
    }
  })

  it('parses 3-way conflict with base', () => {
    const content = [
      '<<<<<<< HEAD',
      'ours',
      '||||||| parent',
      'base-line',
      '=======',
      'theirs',
      '>>>>>>> feature',
    ].join('\n')
    const out = parseConflictMarkers(content)
    expect(out.hasConflicts).toBe(true)
    const conflict = out.segments[0]
    expect(conflict.kind).toBe('conflict')
    if (conflict.kind === 'conflict') {
      expect(conflict.ours).toEqual(['ours'])
      expect(conflict.base).toEqual(['base-line'])
      expect(conflict.theirs).toEqual(['theirs'])
      expect(conflict.labelBase).toBe('parent')
    }
  })

  it('handles multiple conflicts', () => {
    const content = [
      '<<<<<<< HEAD',
      'a',
      '=======',
      'b',
      '>>>>>>> branch',
      'middle',
      '<<<<<<< HEAD',
      'c',
      '=======',
      'd',
      '>>>>>>> branch',
    ].join('\n')
    const out = parseConflictMarkers(content)
    expect(out.hasConflicts).toBe(true)
    const conflictSegments = out.segments.filter((s) => s.kind === 'conflict')
    expect(conflictSegments).toHaveLength(2)
  })

  it('treats unclosed markers as common lines', () => {
    const content = '<<<<<<< HEAD\nours\n'
    const out = parseConflictMarkers(content)
    expect(out.hasConflicts).toBe(false)
  })
})

describe('isLocalChangesPullConflict', () => {
  it('detects "would be overwritten by merge"', () => {
    expect(isLocalChangesPullConflict('Your local changes would be overwritten by merge')).toBe(true)
  })

  it('detects "commit your changes or stash them"', () => {
    expect(isLocalChangesPullConflict('please commit your changes or stash them before')).toBe(true)
  })

  it('detects "move or remove them"', () => {
    expect(isLocalChangesPullConflict('please move or remove them before')).toBe(true)
  })

  it('rejects unrelated messages', () => {
    expect(isLocalChangesPullConflict('Already up to date.')).toBe(false)
    expect(isLocalChangesPullConflict('')).toBe(false)
  })
})
