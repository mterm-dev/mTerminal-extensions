import type { MtGit } from './git-api'

interface ExtIpc {
  invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
}

interface ClientCtx {
  ipc: ExtIpc
}

export function createGitClient(ctx: ClientCtx): MtGit {
  const inv = <T>(channel: string, args?: unknown): Promise<T> =>
    ctx.ipc.invoke<T>(channel, args)

  return {
    status: (cwd) => inv('status', { cwd }),
    diff: (cwd, path, staged, context) => inv('diff', { cwd, path, staged, context }),
    stage: (cwd, paths) => inv('stage', { cwd, paths }),
    unstage: (cwd, paths) => inv('unstage', { cwd, paths }),
    commit: (cwd, message, paths) => inv('commit', { cwd, message, paths }),
    amend: (cwd, message, paths) => inv('amend', { cwd, message, paths }),
    lastCommitMessage: (cwd) => inv('last-commit-message', { cwd }),
    reset: (cwd, ref, mode) => inv('reset', { cwd, ref, mode }),
    push: (cwd, setUpstream) => inv('push', { cwd, setUpstream }),
    pull: (cwd) => inv('pull', { cwd }),
    fetch: (cwd) => inv('fetch', { cwd }),
    branches: (cwd) => inv('branches', { cwd }),
    checkout: (cwd, ref, opts) =>
      inv('checkout', { cwd, ref, createNew: opts?.createNew, newName: opts?.newName }),
    branchCreate: (cwd, name, fromRef, checkout) =>
      inv('branch-create', { cwd, name, fromRef, checkout }),
    branchDelete: (cwd, name, force) => inv('branch-delete', { cwd, name, force }),
    branchDeleteRemote: (cwd, remote, name) =>
      inv('branch-delete-remote', { cwd, remote, name }),
    branchRename: (cwd, oldName, newName) =>
      inv('branch-rename', { cwd, oldName, newName }),
    log: (cwd, opts) =>
      inv('log', {
        cwd,
        ref: opts?.ref,
        limit: opts?.limit,
        skip: opts?.skip,
        all: opts?.all,
      }),
    show: (cwd, sha) => inv('show', { cwd, sha }),
    diffCommit: (cwd, sha, path, context) =>
      inv('diff-commit', { cwd, sha, path, context }),
    incoming: (cwd) => inv('incoming', { cwd }),
    outgoing: (cwd) => inv('outgoing', { cwd }),
    pullStrategy: (cwd, strategy) => inv('pull-strategy', { cwd, strategy }),
    stash: (cwd, message) => inv('stash', { cwd, message }),
    stashPop: (cwd) => inv('stash-pop', { cwd }),
    stashList: (cwd) => inv('stash-list', { cwd }),
    stashDrop: (cwd, index) => inv('stash-drop', { cwd, index }),
    stashApply: (cwd, index, pop) => inv('stash-apply', { cwd, index, pop }),
    stashShow: (cwd, index, context) => inv('stash-show', { cwd, index, context }),
    discardAll: (cwd) => inv('discard-all', { cwd }),
    discardPaths: (cwd, paths) => inv('discard-paths', { cwd, paths }),
    deleteFile: (cwd, path) => inv('delete-file', { cwd, path }),
    listConflicts: (cwd) => inv('list-conflicts', { cwd }),
    readConflictFile: (cwd, path) => inv('read-conflict-file', { cwd, path }),
    resolveFile: (cwd, path, content) => inv('resolve-file', { cwd, path, content }),
    mergeState: (cwd) => inv('merge-state', { cwd }),
    mergeAbort: (cwd) => inv('merge-abort', { cwd }),
  }
}
