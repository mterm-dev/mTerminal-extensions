import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileBrowserPane, type CtxBridge } from './FileBrowserPane'
import { FileEditor } from './FileEditor'
import { FileEditorTabs } from './FileEditorTabs'
import { createFsIpc, type SftpServiceLike, type ServiceProxyLike } from '../lib/sftp-adapter'
import {
  DEFAULT_BROWSER_STATE,
  fileEditorTabKey,
  type FileBackend,
  type FileBrowserClipboard,
  type FileBrowserState,
} from '../shared/types'

interface ExtCtx {
  ipc: {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
    on?(channel: string, cb: (payload: unknown) => void): { dispose(): void }
  }
  services: Record<string, { available: boolean; impl: unknown }>
  ui: CtxBridge['ui']
  terminal: CtxBridge['terminal']
  events: { on(event: string, cb: (payload: unknown) => void): { dispose(): void } }
  workspace: {
    cwd(): string | null
    tabs(): Array<{ id: number; type: string; title: string; groupId: string | null; active: boolean }>
  }
  tabs: { close(tabId: number): void }
  settings: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): void | Promise<void>
  }
}

const NO_GROUP_KEY = '__none__'
type CwdByGroup = Record<string, string>

function readCwdByGroup(api: ExtCtx['settings']): CwdByGroup {
  const v = api.get<CwdByGroup>('lastCwdByGroup')
  return v && typeof v === 'object' ? v : {}
}

interface InitialProps {
  initialCwd?: string
  backend?: FileBackend
}

interface Props {
  ctx: ExtCtx
  tabId: number
  initial: InitialProps
}

export function TabBody({ ctx, tabId, initial }: Props): React.JSX.Element {
  const initialBackend: FileBackend = initial.backend ?? { kind: 'local' }

  const sftpProxy = useMemo(
    () =>
      (ctx.services['sftp-fs'] as ServiceProxyLike<SftpServiceLike> | undefined) ?? null,
    [ctx.services],
  )

  const ipc = useMemo(() => createFsIpc(ctx.ipc, sftpProxy), [ctx.ipc, sftpProxy])

  const bridge: CtxBridge = useMemo(
    () => ({
      ipc,
      ui: ctx.ui,
      terminal: ctx.terminal,
    }),
    [ipc, ctx.ui, ctx.terminal],
  )

  const groupKey = useMemo(() => {
    const summary = ctx.workspace.tabs().find((t) => t.id === tabId)
    return summary?.groupId ?? NO_GROUP_KEY
  }, [ctx.workspace, tabId])

  const [state, setState] = useState<FileBrowserState>(() => {
    const savedCwd =
      initialBackend.kind === 'local' ? readCwdByGroup(ctx.settings)[groupKey] : undefined
    return {
      ...DEFAULT_BROWSER_STATE,
      backend: initialBackend,
      cwd:
        initialBackend.kind === 'local'
          ? initial.initialCwd ?? savedCwd ?? null
          : null,
    }
  })

  useEffect(() => {
    if (state.backend?.kind !== 'local') return
    if (!state.cwd) return
    const map = readCwdByGroup(ctx.settings)
    if (map[groupKey] === state.cwd) return
    void ctx.settings.set('lastCwdByGroup', { ...map, [groupKey]: state.cwd })
  }, [ctx.settings, groupKey, state.backend, state.cwd])

  useEffect(() => {
    if (state.cwd) return
    const backend = state.backend
    if (!backend) return
    let cancelled = false
    void (async () => {
      try {
        if (backend.kind === 'sftp') {
          await ipc.invoke('sftp:connect', { hostId: backend.hostId })
        }
        const channel = backend.kind === 'sftp' ? 'sftp:home' : 'fs:home'
        const args = backend.kind === 'sftp' ? { hostId: backend.hostId } : {}
        const home = await ipc.invoke<string>(channel, args)
        if (cancelled) return
        setState((s) => (s.cwd ? s : { ...s, cwd: home }))
      } catch (err) {
        if (!cancelled) {
          ctx.ui.toast({
            kind: 'error',
            title: 'open failed',
            message: (err as Error).message,
            details: (err as Error).stack,
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ipc, ctx.ui, state.backend, state.cwd])

  const onPatchState = useCallback((patch: Partial<FileBrowserState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const onClipboard = useCallback(
    (clip: FileBrowserClipboard | null) => {
      setState((s) => ({
        ...s,
        clipboard: clip ? { ...clip, sourceViewKey: `t:${tabId}` } : null,
      }))
    },
    [tabId],
  )

  const buffersRef = useRef<Map<string, { text: string; original: string }>>(new Map())
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({})
  const dirtyMapRef = useRef(dirtyMap)
  dirtyMapRef.current = dirtyMap

  const handleBufferChange = useCallback(
    (key: string, text: string, original: string) => {
      buffersRef.current.set(key, { text, original })
      const isDirty = text !== original
      setDirtyMap((prev) => {
        const wasDirty = Boolean(prev[key])
        if (wasDirty === isDirty) return prev
        const next = { ...prev }
        if (isDirty) next[key] = true
        else delete next[key]
        return next
      })
    },
    [],
  )

  const onOpenEditor = useCallback((path: string, backend: FileBackend) => {
    setState((s) => {
      const key = fileEditorTabKey({ path, backend })
      const exists = s.editorTabs.some((t) => fileEditorTabKey(t) === key)
      if (exists) {
        return s.activeEditorKey === key ? s : { ...s, activeEditorKey: key }
      }
      return {
        ...s,
        editorTabs: [...s.editorTabs, { path, backend }],
        activeEditorKey: key,
      }
    })
  }, [])

  const onSelectTab = useCallback((key: string) => {
    setState((s) => (s.activeEditorKey === key ? s : { ...s, activeEditorKey: key }))
  }, [])

  const onCloseTab = useCallback(
    async (key: string): Promise<void> => {
      if (dirtyMapRef.current[key]) {
        const ok = await ctx.ui.confirm({
          title: 'unsaved changes',
          message: 'discard changes?',
          confirmLabel: 'discard',
          cancelLabel: 'keep editing',
          danger: true,
        })
        if (!ok) return
      }
      buffersRef.current.delete(key)
      setDirtyMap((prev) => {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
      let becameEmpty = false
      setState((s) => {
        const idx = s.editorTabs.findIndex((t) => fileEditorTabKey(t) === key)
        if (idx < 0) return s
        const nextTabs = s.editorTabs.filter((_, i) => i !== idx)
        let nextActive = s.activeEditorKey
        if (s.activeEditorKey === key) {
          const fallback = nextTabs[idx] ?? nextTabs[idx - 1] ?? null
          nextActive = fallback ? fileEditorTabKey(fallback) : null
        }
        if (nextTabs.length === 0) becameEmpty = true
        return { ...s, editorTabs: nextTabs, activeEditorKey: nextActive }
      })
      if (becameEmpty && splitRef.current) {
        requestAnimationFrame(() => {
          const target = splitRef.current?.querySelector<HTMLElement>(
            '.fb-tree [tabindex="0"], .fb-tree button, .fb-pane',
          )
          target?.focus()
        })
      }
    },
    [ctx.ui],
  )

  const tabsRef = useRef(state.editorTabs)
  tabsRef.current = state.editorTabs

  const onSftpDisconnected = useCallback(
    async (hostId: string): Promise<void> => {
      const affected = tabsRef.current.filter(
        (t) => t.backend.kind === 'sftp' && t.backend.hostId === hostId,
      )
      if (affected.length === 0) return
      const affectedKeys = affected.map((t) => fileEditorTabKey(t))
      const dirtyCount = affectedKeys.reduce(
        (n, k) => n + (dirtyMapRef.current[k] ? 1 : 0),
        0,
      )
      if (dirtyCount > 0) {
        const ok = await ctx.ui.confirm({
          title: 'connection lost',
          message: `discard unsaved changes to ${dirtyCount} file(s)?`,
          confirmLabel: 'discard',
          cancelLabel: 'keep',
          danger: true,
        })
        if (!ok) return
      }
      for (const k of affectedKeys) buffersRef.current.delete(k)
      setDirtyMap((prev) => {
        let mutated = false
        const next = { ...prev }
        for (const k of affectedKeys) {
          if (k in next) {
            delete next[k]
            mutated = true
          }
        }
        return mutated ? next : prev
      })
      setState((s) => {
        const nextTabs = s.editorTabs.filter(
          (t) => !(t.backend.kind === 'sftp' && t.backend.hostId === hostId),
        )
        const stillActive = nextTabs.some(
          (t) => fileEditorTabKey(t) === s.activeEditorKey,
        )
        return {
          ...s,
          editorTabs: nextTabs,
          activeEditorKey: stillActive
            ? s.activeEditorKey
            : nextTabs[0]
              ? fileEditorTabKey(nextTabs[0])
              : null,
        }
      })
      ctx.ui.toast({
        kind: 'warn',
        message: 'sftp disconnected — closed remote tabs',
      })
    },
    [ctx.ui],
  )

  const splitRef = useRef<HTMLDivElement | null>(null)
  const [localTreeWidth, setLocalTreeWidth] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = state.treeWidth
      const rect = splitRef.current?.getBoundingClientRect()
      const paneW = rect?.width ?? 800
      let finalW = startW
      setResizing(true)
      const onMove = (ev: MouseEvent): void => {
        let next = startW + (ev.clientX - startX)
        const upper = Math.max(280, paneW - 280)
        next = Math.max(200, Math.min(upper, next))
        finalW = next
        setLocalTreeWidth(next)
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setResizing(false)
        setLocalTreeWidth(null)
        const editorW = Math.max(280, paneW - finalW - 4)
        onPatchState({ treeWidth: finalW, editorWidth: editorW })
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [state.treeWidth, onPatchState],
  )

  const hasTabs = state.editorTabs.length > 0
  const activeTab = useMemo(
    () =>
      state.editorTabs.find((t) => fileEditorTabKey(t) === state.activeEditorKey) ??
      null,
    [state.editorTabs, state.activeEditorKey],
  )
  const activeTabKey = activeTab ? fileEditorTabKey(activeTab) : null

  const treeStyle: React.CSSProperties | undefined = hasTabs
    ? { width: localTreeWidth ?? state.treeWidth, flex: 'none' }
    : undefined

  const activeBuffer = activeTabKey ? buffersRef.current.get(activeTabKey) : undefined

  return (
    <div
      className={'fb-split' + (resizing ? ' fb-resizing' : '')}
      ref={splitRef}
    >
      <FileBrowserPane
        ctx={bridge}
        state={state}
        backend={state.backend}
        activeTabCwd={ctx.workspace.cwd()}
        onPatchState={onPatchState}
        onClipboard={onClipboard}
        onOpenEditor={onOpenEditor}
        onSftpDisconnected={(hostId) => void onSftpDisconnected(hostId)}
        style={treeStyle}
        fullWidth={!hasTabs}
      />
      {hasTabs && (
        <>
          <div
            className={'fb-resizer' + (resizing ? ' dragging' : '')}
            onMouseDown={startResize}
            role="separator"
            aria-orientation="vertical"
          />
          <div className="fb-editor-side">
            <FileEditorTabs
              tabs={state.editorTabs}
              activeKey={state.activeEditorKey}
              dirtyMap={dirtyMap}
              onSelect={onSelectTab}
              onClose={(k) => void onCloseTab(k)}
            />
            {activeTab && activeTabKey && (
              <FileEditor
                key={activeTabKey}
                tabKey={activeTabKey}
                ctx={bridge}
                backend={activeTab.backend}
                path={activeTab.path}
                initialContent={activeBuffer?.text}
                initialOriginal={activeBuffer?.original}
                onBufferChange={handleBufferChange}
                onRequestClose={(k) => void onCloseTab(k)}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
