export interface GitFile {
  path: string
  oldPath?: string
  indexStatus: string
  worktreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFile[]
  error?: string
}

export interface GitBranch {
  name: string
  isRemote: boolean
  isCurrent: boolean
  upstream: string | null
  ahead: number
  behind: number
  lastCommitSha: string
  lastCommitSubject: string
  lastCommitAuthor: string
  lastCommitDate: number
}

export interface GitLogEntry {
  sha: string
  shortSha: string
  parents: string[]
  author: string
  authorEmail: string
  date: number
  subject: string
  refs: string[]
}

export interface GitCommitFile {
  path: string
  oldPath?: string
  status: string
}

export interface GitCommitDetail {
  sha: string
  parents: string[]
  author: string
  authorEmail: string
  date: number
  subject: string
  body: string
  files: GitCommitFile[]
}

export type GitPullStrategyOption = 'ff-only' | 'merge' | 'rebase'

export interface CheckoutOptions {
  createNew?: boolean
  newName?: string
}

export interface LogOptions {
  ref?: string
  limit?: number
  skip?: number
  all?: boolean
}

export type ConflictSegment =
  | { kind: 'common'; lines: string[] }
  | {
      kind: 'conflict'
      id: number
      ours: string[]
      theirs: string[]
      base?: string[]
      labelOurs?: string
      labelTheirs?: string
      labelBase?: string
    }

export interface ConflictFileEntry {
  path: string
  indexStatus: string
  worktreeStatus: string
}

export type MergeStateKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'stash' | null

export interface StashEntry {
  index: number
  message: string
  branch: string | null
  time: number
}

export type ResetMode = 'soft' | 'mixed' | 'hard'
