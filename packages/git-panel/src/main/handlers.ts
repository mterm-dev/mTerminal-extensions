import type { GitService } from './service'

interface IpcCtx {
  ipc: {
    handle(
      channel: string,
      fn: (args: unknown, sender?: unknown) => unknown | Promise<unknown>,
    ): { dispose(): void }
  }
  subscribe(d: { dispose(): void } | (() => void)): void
}

type WithCwdString = { cwd: string }

export function registerHandlers(ctx: IpcCtx, service: GitService): void {
  const sub = (channel: string, fn: (args: unknown) => unknown | Promise<unknown>) => {
    ctx.subscribe(ctx.ipc.handle(channel, fn))
  }

  sub('status', (a) => service.status(((a as WithCwdString) ?? { cwd: '' }).cwd))
  sub('diff', (a) => service.diff(a as Parameters<GitService['diff']>[0]))
  sub('stage', (a) => service.stage(a as Parameters<GitService['stage']>[0]))
  sub('unstage', (a) => service.unstage(a as Parameters<GitService['unstage']>[0]))
  sub('commit', (a) => service.commit(a as Parameters<GitService['commit']>[0]))
  sub('amend', (a) => service.amend(a as Parameters<GitService['amend']>[0]))
  sub('last-commit-message', (a) =>
    service.lastCommitMessage(((a as WithCwdString) ?? { cwd: '' }).cwd),
  )
  sub('reset', (a) => service.reset(a as Parameters<GitService['reset']>[0]))
  sub('push', (a) => service.push(a as Parameters<GitService['push']>[0]))
  sub('pull', (a) => service.pull(a as Parameters<GitService['pull']>[0]))
  sub('fetch', (a) => service.fetch(a as Parameters<GitService['fetch']>[0]))
  sub('branches', (a) => service.branches(((a as WithCwdString) ?? { cwd: '' }).cwd))
  sub('checkout', (a) => service.checkout(a as Parameters<GitService['checkout']>[0]))
  sub('branch-create', (a) => service.branchCreate(a as Parameters<GitService['branchCreate']>[0]))
  sub('branch-delete', (a) => service.branchDelete(a as Parameters<GitService['branchDelete']>[0]))
  sub('branch-delete-remote', (a) =>
    service.branchDeleteRemote(a as Parameters<GitService['branchDeleteRemote']>[0]),
  )
  sub('branch-rename', (a) => service.branchRename(a as Parameters<GitService['branchRename']>[0]))
  sub('log', (a) => service.log(a as Parameters<GitService['log']>[0]))
  sub('show', (a) => service.show(a as Parameters<GitService['show']>[0]))
  sub('diff-commit', (a) => service.diffCommit(a as Parameters<GitService['diffCommit']>[0]))
  sub('incoming', (a) => service.incoming(((a as WithCwdString) ?? { cwd: '' }).cwd))
  sub('outgoing', (a) => service.outgoing(((a as WithCwdString) ?? { cwd: '' }).cwd))
  sub('pull-strategy', (a) => service.pullStrategy(a as Parameters<GitService['pullStrategy']>[0]))
  sub('stash', (a) => service.stash(a as Parameters<GitService['stash']>[0]))
  sub('stash-pop', (a) => service.stashPop(a as Parameters<GitService['stashPop']>[0]))
  sub('stash-list', (a) => service.stashList(((a as WithCwdString) ?? { cwd: '' }).cwd))
  sub('stash-drop', (a) => service.stashDrop(a as Parameters<GitService['stashDrop']>[0]))
  sub('stash-apply', (a) => service.stashApply(a as Parameters<GitService['stashApply']>[0]))
  sub('stash-show', (a) => service.stashShow(a as Parameters<GitService['stashShow']>[0]))
  sub('discard-all', (a) => service.discardAll(a as Parameters<GitService['discardAll']>[0]))
  sub('discard-paths', (a) => service.discardPaths(a as Parameters<GitService['discardPaths']>[0]))
  sub('delete-file', (a) => service.deleteFile(a as Parameters<GitService['deleteFile']>[0]))
  sub('list-conflicts', (a) => service.listConflicts(((a as WithCwdString) ?? { cwd: '' }).cwd))
  sub('read-conflict-file', (a) =>
    service.readConflictFile(a as Parameters<GitService['readConflictFile']>[0]),
  )
  sub('resolve-file', (a) => service.resolveFile(a as Parameters<GitService['resolveFile']>[0]))
  sub('merge-state', (a) => service.mergeState(((a as WithCwdString) ?? { cwd: '' }).cwd))
  sub('merge-abort', (a) => service.mergeAbort(a as Parameters<GitService['mergeAbort']>[0]))
}
