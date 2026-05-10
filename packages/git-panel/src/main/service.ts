import { ensureCwd, ensurePathArray, ensureSafeRef } from './exec'
import {
  gitAmend,
  gitBranchCreate,
  gitBranchDelete,
  gitBranchDeleteRemote,
  gitBranchRename,
  gitCheckout,
  gitCommit,
  gitDeleteFile,
  gitDiff,
  gitDiffCommit,
  gitDiscardAll,
  gitDiscardPaths,
  gitFetch,
  gitIncoming,
  gitLastCommitMessage,
  gitListBranches,
  gitListConflicts,
  gitLog,
  gitMergeAbort,
  gitMergeState,
  gitOutgoing,
  gitPull,
  gitPullStrategy,
  gitPush,
  gitReadConflictFile,
  gitReset,
  gitResolveFile,
  gitShow,
  gitStage,
  gitStash,
  gitStashApply,
  gitStashDrop,
  gitStashList,
  gitStashPop,
  gitStashShow,
  gitStatus,
  gitUnstage,
} from './operations'
import type {
  ConflictFileEntry,
  ConflictSegment,
  GitBranch,
  GitCommitDetail,
  GitLogEntry,
  GitPullStrategyOption,
  GitStatus,
  MergeStateKind,
  ResetMode,
  StashEntry,
} from './types'

export interface GitService {
  status(cwd: string): Promise<GitStatus>
  diff(args: { cwd: string; path: string; staged: boolean; context?: number }): Promise<{ text: string; truncated: boolean }>
  stage(args: { cwd: string; paths: string[] }): Promise<void>
  unstage(args: { cwd: string; paths: string[] }): Promise<void>
  commit(args: { cwd: string; message: string; paths?: string[] }): Promise<{ commit: string }>
  amend(args: { cwd: string; message?: string; paths?: string[] }): Promise<{ commit: string }>
  lastCommitMessage(cwd: string): Promise<string>
  reset(args: { cwd: string; ref: string; mode: ResetMode }): Promise<void>
  push(args: { cwd: string; setUpstream?: boolean }): Promise<{ stdout: string; stderr: string }>
  pull(args: { cwd: string }): Promise<{ stdout: string; stderr: string }>
  fetch(args: { cwd: string }): Promise<{ stdout: string; stderr: string }>
  branches(cwd: string): Promise<GitBranch[]>
  checkout(args: { cwd: string; ref: string; createNew?: boolean; newName?: string }): Promise<void>
  branchCreate(args: { cwd: string; name: string; fromRef?: string; checkout?: boolean }): Promise<void>
  branchDelete(args: { cwd: string; name: string; force?: boolean }): Promise<void>
  branchDeleteRemote(args: { cwd: string; remote: string; name: string }): Promise<void>
  branchRename(args: { cwd: string; oldName: string; newName: string }): Promise<void>
  log(args: { cwd: string; ref?: string; limit?: number; skip?: number; all?: boolean }): Promise<GitLogEntry[]>
  show(args: { cwd: string; sha: string }): Promise<GitCommitDetail>
  diffCommit(args: { cwd: string; sha: string; path: string; context?: number }): Promise<{ text: string; truncated: boolean }>
  incoming(cwd: string): Promise<GitLogEntry[]>
  outgoing(cwd: string): Promise<GitLogEntry[]>
  pullStrategy(args: { cwd: string; strategy: GitPullStrategyOption }): Promise<{ stdout: string; stderr: string }>
  stash(args: { cwd: string; message?: string }): Promise<{ created: boolean; stdout: string }>
  stashPop(args: { cwd: string }): Promise<{ stdout: string; stderr: string; conflict: boolean }>
  stashList(cwd: string): Promise<StashEntry[]>
  stashDrop(args: { cwd: string; index: number }): Promise<void>
  stashApply(args: { cwd: string; index: number; pop?: boolean }): Promise<{ stdout: string; stderr: string; conflict: boolean }>
  stashShow(args: { cwd: string; index: number; context?: number }): Promise<{ text: string; truncated: boolean }>
  discardAll(args: { cwd: string }): Promise<void>
  discardPaths(args: { cwd: string; paths: string[] }): Promise<void>
  deleteFile(args: { cwd: string; path: string }): Promise<void>
  listConflicts(cwd: string): Promise<ConflictFileEntry[]>
  readConflictFile(args: { cwd: string; path: string }): Promise<{
    path: string
    content: string
    segments: ConflictSegment[]
    hasConflicts: boolean
    binary: boolean
  }>
  resolveFile(args: { cwd: string; path: string; content: string }): Promise<void>
  mergeState(cwd: string): Promise<MergeStateKind>
  mergeAbort(args: { cwd: string }): Promise<void>
}

function ensureContext(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  if (!Number.isFinite(value) || value < 0) return undefined
  return Math.min(value, 1_000_000)
}

export function createGitService(): GitService {
  return {
    async status(cwd) {
      return gitStatus(ensureCwd(cwd))
    },
    async diff(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.path !== 'string') throw new Error('path is required')
      return gitDiff(cwd, args.path, !!args.staged, ensureContext(args.context))
    },
    async stage(args) {
      const cwd = ensureCwd(args?.cwd)
      const paths = ensurePathArray(args?.paths)
      await gitStage(cwd, paths)
    },
    async unstage(args) {
      const cwd = ensureCwd(args?.cwd)
      const paths = ensurePathArray(args?.paths)
      await gitUnstage(cwd, paths)
    },
    async commit(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.message !== 'string') throw new Error('message is required')
      const paths = args.paths ? ensurePathArray(args.paths) : undefined
      return gitCommit(cwd, args.message, paths)
    },
    async amend(args) {
      const cwd = ensureCwd(args?.cwd)
      const paths = args?.paths ? ensurePathArray(args.paths) : undefined
      const message = typeof args?.message === 'string' ? args.message : undefined
      return gitAmend(cwd, message, paths)
    },
    async lastCommitMessage(cwd) {
      return gitLastCommitMessage(ensureCwd(cwd))
    },
    async reset(args) {
      const cwd = ensureCwd(args?.cwd)
      ensureSafeRef(args?.ref)
      await gitReset(cwd, args.ref, args.mode)
    },
    async push(args) {
      const cwd = ensureCwd(args?.cwd)
      return gitPush(cwd, !!args?.setUpstream)
    },
    async pull(args) {
      const cwd = ensureCwd(args?.cwd)
      return gitPull(cwd)
    },
    async fetch(args) {
      const cwd = ensureCwd(args?.cwd)
      return gitFetch(cwd)
    },
    async branches(cwd) {
      return gitListBranches(ensureCwd(cwd))
    },
    async checkout(args) {
      const cwd = ensureCwd(args?.cwd)
      const ref = ensureSafeRef(args?.ref)
      await gitCheckout(cwd, ref, {
        createNew: !!args?.createNew,
        newName: args?.newName,
      })
    },
    async branchCreate(args) {
      const cwd = ensureCwd(args?.cwd)
      await gitBranchCreate(cwd, args?.name, args?.fromRef, !!args?.checkout)
    },
    async branchDelete(args) {
      const cwd = ensureCwd(args?.cwd)
      await gitBranchDelete(cwd, args?.name, !!args?.force)
    },
    async branchDeleteRemote(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.remote !== 'string') throw new Error('remote is required')
      await gitBranchDeleteRemote(cwd, args.remote, args?.name)
    },
    async branchRename(args) {
      const cwd = ensureCwd(args?.cwd)
      await gitBranchRename(cwd, args?.oldName, args?.newName)
    },
    async log(args) {
      const cwd = ensureCwd(args?.cwd)
      return gitLog(cwd, {
        ref: args?.ref,
        limit: args?.limit,
        skip: args?.skip,
        all: args?.all,
      })
    },
    async show(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.sha !== 'string') throw new Error('sha is required')
      return gitShow(cwd, args.sha)
    },
    async diffCommit(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.sha !== 'string') throw new Error('sha is required')
      if (typeof args?.path !== 'string') throw new Error('path is required')
      return gitDiffCommit(cwd, args.sha, args.path, ensureContext(args.context))
    },
    async incoming(cwd) {
      return gitIncoming(ensureCwd(cwd))
    },
    async outgoing(cwd) {
      return gitOutgoing(ensureCwd(cwd))
    },
    async pullStrategy(args) {
      const cwd = ensureCwd(args?.cwd)
      return gitPullStrategy(cwd, args?.strategy)
    },
    async stash(args) {
      const cwd = ensureCwd(args?.cwd)
      return gitStash(cwd, args?.message)
    },
    async stashPop(args) {
      const cwd = ensureCwd(args?.cwd)
      return gitStashPop(cwd)
    },
    async stashList(cwd) {
      return gitStashList(ensureCwd(cwd))
    },
    async stashDrop(args) {
      const cwd = ensureCwd(args?.cwd)
      if (!Number.isInteger(args?.index)) throw new Error('index is required')
      await gitStashDrop(cwd, args.index)
    },
    async stashApply(args) {
      const cwd = ensureCwd(args?.cwd)
      if (!Number.isInteger(args?.index)) throw new Error('index is required')
      return gitStashApply(cwd, args.index, !!args?.pop)
    },
    async stashShow(args) {
      const cwd = ensureCwd(args?.cwd)
      if (!Number.isInteger(args?.index)) throw new Error('index is required')
      return gitStashShow(cwd, args.index, ensureContext(args.context))
    },
    async discardAll(args) {
      const cwd = ensureCwd(args?.cwd)
      await gitDiscardAll(cwd)
    },
    async discardPaths(args) {
      const cwd = ensureCwd(args?.cwd)
      const paths = ensurePathArray(args?.paths)
      await gitDiscardPaths(cwd, paths)
    },
    async deleteFile(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.path !== 'string' || args.path.length === 0)
        throw new Error('path is required')
      await gitDeleteFile(cwd, args.path)
    },
    async listConflicts(cwd) {
      return gitListConflicts(ensureCwd(cwd))
    },
    async readConflictFile(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.path !== 'string') throw new Error('path is required')
      return gitReadConflictFile(cwd, args.path)
    },
    async resolveFile(args) {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.path !== 'string') throw new Error('path is required')
      if (typeof args?.content !== 'string') throw new Error('content is required')
      await gitResolveFile(cwd, args.path, args.content)
    },
    async mergeState(cwd) {
      return gitMergeState(ensureCwd(cwd))
    },
    async mergeAbort(args) {
      const cwd = ensureCwd(args?.cwd)
      await gitMergeAbort(cwd)
    },
  }
}
