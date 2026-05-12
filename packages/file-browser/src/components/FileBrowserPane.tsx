import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileBrowserToolbar } from './FileBrowserToolbar'
import { FileTreeNode } from './FileTreeNode'
import { useFileBrowser, parentOf } from '../hooks/useFileBrowser'
import { computeCompactView } from '../lib/tree-compact'
import type {
  FileBackend,
  FileBrowserClipboard,
  FileBrowserState,
  FileNode,
} from '../shared/types'

export interface CtxBridge {
  ipc: {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
    on?(channel: string, cb: (payload: unknown) => void): { dispose(): void }
  }
  ui: {
    confirm(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>
    prompt(opts: { title: string; message?: string; placeholder?: string; defaultValue?: string }): Promise<string | undefined>
    toast(opts: {
      kind?: 'info' | 'success' | 'warn' | 'error'
      title?: string
      message: string
      details?: string
      durationMs?: number
      dismissible?: boolean
    }): void
  }
  terminal: {
    active(): {
      tabId: number
      cwd: string | null
      write(data: string): Promise<void>
    } | null
  }
}

interface PaneProps {
  ctx: CtxBridge
  state: FileBrowserState
  backend: FileBackend | null
  activeTabCwd: string | null
  onPatchState: (patch: Partial<FileBrowserState>) => void
  onClipboard: (clip: FileBrowserClipboard | null) => void
  onOpenEditor?: (path: string, backend: FileBackend) => void
  onSftpDisconnected?: (hostId: string) => void
  style?: React.CSSProperties
  fullWidth?: boolean
}

interface MenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  separator?: boolean
  danger?: boolean
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export function FileBrowserPane(props: PaneProps): React.JSX.Element {
  const {
    ctx,
    state,
    backend,
    activeTabCwd,
    onPatchState,
    onClipboard,
    onOpenEditor,
    onSftpDisconnected,
    style,
    fullWidth,
  } = props
  const fb = useFileBrowser({
    ipc: ctx.ipc,
    backend,
    cwd: state.cwd,
    showHidden: state.showHidden,
  })

  const paneRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [sftpStatus, setSftpStatus] = useState<'connected' | 'disconnected' | 'idle'>('idle')
  const lastSftpStatusRef = useRef<'connected' | 'disconnected' | 'idle'>('idle')
  useEffect(() => {
    if (
      backend?.kind === 'sftp' &&
      sftpStatus === 'disconnected' &&
      lastSftpStatusRef.current === 'connected'
    ) {
      onSftpDisconnected?.(backend.hostId)
    }
    lastSftpStatusRef.current = sftpStatus
  }, [backend, sftpStatus, onSftpDisconnected])

  useEffect(() => {
    if (backend?.kind !== 'sftp') {
      setSftpStatus('idle')
      return
    }
    let cancelled = false
    const hostId = backend.hostId
    const refId = `fb:${Math.random().toString(36).slice(2)}`
    const check = async (): Promise<void> => {
      try {
        const r = await ctx.ipc.invoke<{ connected: boolean }>('sftp:status', {
          hostId,
        })
        if (!cancelled) setSftpStatus(r.connected ? 'connected' : 'disconnected')
      } catch {
        if (!cancelled) setSftpStatus('disconnected')
      }
    }
    void ctx.ipc
      .invoke('sftp:register-use', { hostId, refId })
      .catch(() => {})
    void check()
    const fallback = setInterval(check, 30_000)
    const onDisc = ctx.ipc.on?.('sftp:disconnected', (payload) => {
      const p = payload as { hostId: string } | null
      if (p?.hostId !== hostId) return
      if (!cancelled) setSftpStatus('disconnected')
    })
    return () => {
      cancelled = true
      clearInterval(fallback)
      onDisc?.dispose()
      void ctx.ipc
        .invoke('sftp:unregister-use', { hostId, refId })
        .catch(() => {})
    }
  }, [backend, ctx.ipc])

  useEffect(() => {
    if (!menu) return
    const onDoc = (): void => setMenu(null)
    document.addEventListener('click', onDoc)
    document.addEventListener('contextmenu', onDoc)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('contextmenu', onDoc)
    }
  }, [menu])

  const handleSyncFromTerminal = useCallback(() => {
    if (!activeTabCwd) {
      ctx.ui.toast({ kind: 'warn', message: 'no terminal cwd available' })
      return
    }
    onPatchState({ cwd: activeTabCwd, expandedPaths: [], selectedPath: null })
  }, [activeTabCwd, ctx, onPatchState])

  const handleCdTerminalHere = useCallback(() => {
    if (!state.cwd) return
    const term = ctx.terminal.active()
    if (!term) {
      ctx.ui.toast({ kind: 'warn', message: 'no active terminal' })
      return
    }
    void term.write('cd ' + shellQuote(state.cwd) + '\n')
  }, [ctx, state.cwd])

  const handleNavigate = useCallback(
    (target: string) => {
      onPatchState({ cwd: target, selectedPath: null, expandedPaths: [] })
    },
    [onPatchState],
  )

  const handleNewFolder = useCallback(async () => {
    if (!state.cwd) return
    const name = await ctx.ui.prompt({
      title: 'new folder',
      placeholder: 'folder name',
    })
    if (!name) return
    try {
      await fb.mkdir(state.cwd, name)
    } catch (err) {
      ctx.ui.toast({
        kind: 'error',
        title: 'mkdir failed',
        message: (err as Error).message,
        details: (err as Error).stack,
      })
    }
  }, [ctx, fb, state.cwd])

  const handleNewFile = useCallback(async () => {
    if (!state.cwd) return
    const name = await ctx.ui.prompt({
      title: 'new file',
      placeholder: 'file name',
    })
    if (!name) return
    try {
      await fb.touch(state.cwd, name)
    } catch (err) {
      ctx.ui.toast({
        kind: 'error',
        title: 'create file failed',
        message: (err as Error).message,
        details: (err as Error).stack,
      })
    }
  }, [ctx, fb, state.cwd])

  const handleToggleHidden = useCallback(() => {
    onPatchState({ showHidden: !state.showHidden })
  }, [onPatchState, state.showHidden])

  const handleReconnect = useCallback(async () => {
    if (backend?.kind !== 'sftp') return
    void fb.refreshRoot()
  }, [backend, fb])

  const onActivate = useCallback(
    async (node: FileNode) => {
      if (node.kind === 'dir') {
        onPatchState({ cwd: node.path, selectedPath: node.path, expandedPaths: [] })
        return
      }
      if (backend && onOpenEditor) {
        onOpenEditor(node.path, backend)
      }
    },
    [backend, onOpenEditor, onPatchState],
  )

  const onToggleNode = useCallback(
    async (p: string) => {
      const node = fb.tree.nodes[p]
      if (!node) return
      if (node.expanded) {
        fb.collapse(p)
        const expanded = state.expandedPaths.filter((x) => x !== p)
        onPatchState({ expandedPaths: expanded })
      } else {
        await fb.expand(p)
        if (!state.expandedPaths.includes(p)) {
          const next = [p, ...state.expandedPaths].slice(0, 500)
          onPatchState({ expandedPaths: next })
        }
      }
    },
    [fb, onPatchState, state.expandedPaths],
  )

  const onSelect = useCallback(
    (p: string) => {
      onPatchState({ selectedPath: p })
    },
    [onPatchState],
  )

  const handleRename = useCallback(
    async (node: FileNode) => {
      const newName = await ctx.ui.prompt({
        title: 'rename',
        defaultValue: node.name,
      })
      if (!newName || newName === node.name) return
      const parent = parentOf(backend ?? { kind: 'local' }, node.path)
      if (!parent) return
      const sep = backend?.kind === 'sftp' ? '/' : node.path.includes('\\') ? '\\' : '/'
      const target = parent.endsWith(sep) ? parent + newName : parent + sep + newName
      try {
        await fb.rename(node.path, target)
      } catch (err) {
        ctx.ui.toast({
          kind: 'error',
          title: 'rename failed',
          message: (err as Error).message,
          details: (err as Error).stack,
        })
      }
    },
    [backend, ctx, fb],
  )

  const handleDelete = useCallback(
    async (node: FileNode) => {
      const confirm = await ctx.ui.confirm({
        title: 'delete',
        message: `delete ${node.name}?${node.kind === 'dir' ? ' (recursive)' : ''}`,
        confirmLabel: 'delete',
        danger: true,
      })
      if (!confirm) return
      try {
        await fb.remove(node.path, node.kind === 'dir')
      } catch (err) {
        ctx.ui.toast({
          kind: 'error',
          title: 'delete failed',
          message: (err as Error).message,
          details: (err as Error).stack,
        })
      }
    },
    [ctx, fb],
  )

  const handleCdInTerminal = useCallback(
    (node: FileNode) => {
      const term = ctx.terminal.active()
      if (!term) {
        ctx.ui.toast({ kind: 'warn', message: 'no active terminal' })
        return
      }
      const target = node.kind === 'dir' ? node.path : parentOf(backend ?? { kind: 'local' }, node.path)
      if (!target) return
      void term.write('cd ' + shellQuote(target) + '\n')
    },
    [backend, ctx],
  )

  const handlePastePath = useCallback(
    (node: FileNode) => {
      const term = ctx.terminal.active()
      if (!term) {
        ctx.ui.toast({ kind: 'warn', message: 'no active terminal' })
        return
      }
      void term.write(shellQuote(node.path) + ' ')
    },
    [ctx],
  )

  const handleCopyPath = useCallback(
    (node: FileNode) => {
      try {
        void navigator.clipboard.writeText(node.path)
        ctx.ui.toast({ kind: 'success', message: 'path copied' })
      } catch {
        ctx.ui.toast({ kind: 'warn', message: 'clipboard unavailable' })
      }
    },
    [ctx],
  )

  const handleSetClipboard = useCallback(
    (node: FileNode, mode: 'copy' | 'cut') => {
      if (!backend) return
      onClipboard({
        paths: [node.path],
        mode,
        sourceViewKey: 'current',
        backend,
      })
      ctx.ui.toast({ kind: 'info', message: `${mode}: ${node.name}` })
    },
    [backend, ctx, onClipboard],
  )

  const handlePaste = useCallback(
    async (targetDir: string) => {
      const clip = state.clipboard
      if (!clip || !backend) return
      if (clip.backend.kind !== backend.kind) {
        ctx.ui.toast({ kind: 'warn', message: 'cross-backend paste not supported' })
        return
      }
      if (clip.backend.kind === 'sftp' && backend.kind === 'sftp' && clip.backend.hostId !== backend.hostId) {
        ctx.ui.toast({ kind: 'warn', message: 'cross-host paste not supported' })
        return
      }
      const sep = backend.kind === 'sftp' ? '/' : targetDir.includes('\\') ? '\\' : '/'
      try {
        for (const src of clip.paths) {
          const idx = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'))
          const name = idx >= 0 ? src.slice(idx + 1) : src
          const dst = targetDir.endsWith(sep) ? targetDir + name : targetDir + sep + name
          if (clip.mode === 'cut') {
            await fb.move(src, dst)
          } else {
            await fb.copy(src, dst, true)
          }
        }
        if (clip.mode === 'cut') onClipboard(null)
      } catch (err) {
        ctx.ui.toast({
          kind: 'error',
          title: 'paste failed',
          message: (err as Error).message,
          details: (err as Error).stack,
        })
      }
    },
    [backend, ctx, fb, onClipboard, state.clipboard],
  )

  const openContextMenu = useCallback(
    (e: React.MouseEvent, node: FileNode) => {
      const isLocal = backend?.kind === 'local'
      const items: MenuItem[] = [
        {
          label: node.kind === 'dir' ? 'cd in terminal' : 'cd to parent in terminal',
          onClick: () => handleCdInTerminal(node),
        },
        { label: 'paste path to terminal', onClick: () => handlePastePath(node) },
        { label: 'copy absolute path', onClick: () => handleCopyPath(node) },
        { label: 'sep', separator: true },
        ...(node.kind !== 'dir' && backend && onOpenEditor
          ? [
              {
                label: 'edit',
                onClick: () => onOpenEditor(node.path, backend),
              } as MenuItem,
            ]
          : []),
        ...(isLocal && node.kind !== 'dir'
          ? [
              {
                label: 'open in default app',
                onClick: () => {
                  void fb.openDefault(node.path).catch((err) =>
                    ctx.ui.toast({
                      kind: 'error',
                      title: 'open failed',
                      message: (err as Error).message,
                      details: (err as Error).stack,
                    }),
                  )
                },
              } as MenuItem,
            ]
          : []),
        { label: 'rename', onClick: () => void handleRename(node) },
        { label: 'delete', onClick: () => void handleDelete(node), danger: true },
        { label: 'sep2', separator: true },
        { label: 'cut', onClick: () => handleSetClipboard(node, 'cut') },
        { label: 'copy', onClick: () => handleSetClipboard(node, 'copy') },
        ...(node.kind === 'dir' && state.clipboard
          ? [{ label: 'paste here', onClick: () => void handlePaste(node.path) } as MenuItem]
          : []),
      ]
      setMenu({ x: e.clientX, y: e.clientY, items })
    },
    [
      backend,
      ctx,
      fb,
      handleCdInTerminal,
      handleCopyPath,
      handleDelete,
      handlePaste,
      handlePastePath,
      handleRename,
      handleSetClipboard,
      onOpenEditor,
      state.clipboard,
    ],
  )

  const renderChildren = useCallback(
    (parentPath: string): React.ReactNode => {
      const parent = fb.tree.nodes[parentPath]
      if (!parent || !parent.childPaths) return null
      return parent.childPaths.map((p) => {
        const child = fb.tree.nodes[p]
        if (!child) return null
        const view = computeCompactView(child, fb.tree.nodes)
        return (
          <FileTreeNode
            key={view.headPath}
            node={view.tail}
            displayName={view.displayName}
            togglePath={view.togglePath}
            depth={depthOf(view.headPath, fb.tree.rootPath)}
            selected={state.selectedPath === view.tail.path}
            childNodes={[]}
            onToggle={(x) => void onToggleNode(x)}
            onSelect={onSelect}
            onActivate={(n) => void onActivate(n)}
            onContextMenu={openContextMenu}
            renderChildren={renderChildren}
          />
        )
      })
    },
    [fb.tree, onActivate, onSelect, onToggleNode, openContextMenu, state.selectedPath],
  )

  const rootChildren = useMemo(() => {
    if (!fb.tree.rootChildPaths) return null
    return fb.tree.rootChildPaths.map((p) => {
      const node = fb.tree.nodes[p]
      if (!node) return null
      const view = computeCompactView(node, fb.tree.nodes)
      return (
        <FileTreeNode
          key={view.headPath}
          node={view.tail}
          displayName={view.displayName}
          togglePath={view.togglePath}
          depth={0}
          selected={state.selectedPath === view.tail.path}
          childNodes={[]}
          onToggle={(x) => void onToggleNode(x)}
          onSelect={onSelect}
          onActivate={(n) => void onActivate(n)}
          onContextMenu={openContextMenu}
          renderChildren={renderChildren}
        />
      )
    })
  }, [fb.tree, onActivate, onSelect, onToggleNode, openContextMenu, renderChildren, state.selectedPath])

  const term = ctx.terminal.active()

  return (
    <div
      className={'fb-pane' + (fullWidth ? ' fb-tree-full' : ' fb-tree-side')}
      ref={paneRef}
      style={style}
    >
      <div className="fb-header">files</div>
      <FileBrowserToolbar
        cwd={state.cwd}
        backend={backend}
        showHidden={state.showHidden}
        hasActiveTerminal={Boolean(term)}
        sftpStatus={sftpStatus}
        onSyncFromTerminal={handleSyncFromTerminal}
        onCdTerminalHere={handleCdTerminalHere}
        onRefresh={() => void fb.refreshRoot()}
        onToggleHidden={handleToggleHidden}
        onExpandAll={() => fb.expandAll()}
        onCollapseAll={() => fb.collapseAll()}
        onNewFolder={() => void handleNewFolder()}
        onNewFile={() => void handleNewFile()}
        onNavigate={handleNavigate}
        onReconnect={() => void handleReconnect()}
      />
      <div
        className="fb-body"
        onContextMenu={(e) => {
          if (!state.cwd) return
          e.preventDefault()
          const items: MenuItem[] = [
            { label: 'new file', onClick: () => void handleNewFile() },
            { label: 'new folder', onClick: () => void handleNewFolder() },
            ...(state.clipboard
              ? [{ label: 'paste here', onClick: () => void handlePaste(state.cwd as string) } as MenuItem]
              : []),
            { label: 'sep', separator: true },
            { label: 'refresh', onClick: () => void fb.refreshRoot() },
            { label: state.showHidden ? 'hide dotfiles' : 'show dotfiles', onClick: handleToggleHidden },
          ]
          setMenu({ x: e.clientX, y: e.clientY, items })
        }}
      >
        {fb.tree.loadingRoot && <div className="fb-loading">loading…</div>}
        {fb.tree.rootError && <div className="fb-error">{fb.tree.rootError}</div>}
        {!fb.tree.rootError && rootChildren}
        {!fb.tree.loadingRoot && !fb.tree.rootError && rootChildren && rootChildren.length === 0 && (
          <div className="fb-empty">empty directory</div>
        )}
      </div>
      {menu && (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.items.map((it, i) =>
            it.separator ? (
              <div key={'sep-' + i} className="ctx-sep" />
            ) : (
              <button
                key={it.label + i}
                className={`ctx-item${it.danger ? ' danger' : ''}`}
                disabled={it.disabled}
                onClick={() => {
                  setMenu(null)
                  it.onClick?.()
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function depthOf(p: string, root: string | null): number {
  if (!root) return 0
  if (!p.startsWith(root)) return 0
  const rest = p.slice(root.length).replace(/^[/\\]+/, '')
  if (!rest) return 0
  const segs = rest.split(/[/\\]/)
  return segs.length
}
