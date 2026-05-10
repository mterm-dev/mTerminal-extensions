import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TabBody } from './components/TabBody'
import { mountSettings } from './settings'

interface ExtCtx {
  id: string
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void }
  tabs: {
    registerTabType(spec: {
      id: string
      title: string
      icon?: string
      factory(props: { tabId: number; active: boolean; props: unknown; ctx: unknown }): {
        mount(host: HTMLElement): void
        unmount(): void
        onFocus?(): void
        onBlur?(): void
      }
    }): { dispose(): void }
    open(args: {
      type: string
      title?: string
      props?: unknown
      groupId?: string | null
    }): Promise<number>
    close(tabId: number): void
  }
  commands: {
    register(c: { id: string; title?: string; run: (args?: unknown) => unknown }): { dispose(): void }
    execute<T = unknown>(id: string, args?: unknown): Promise<T>
  }
  keybindings: {
    register(k: { command: string; key: string; when?: string }): { dispose(): void }
  }
  workspace: {
    activeGroup(): string | null
    tabs(): Array<{ id: number; type: string; title: string; groupId: string | null; active: boolean }>
    cwd(): string | null
  }
  events: {
    on(event: string, cb: (payload: unknown) => void): { dispose(): void }
  }
  ipc: {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
  }
  settings: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): void | Promise<void>
    onChange(cb: (key: string, value: unknown) => void): { dispose(): void }
  }
  settingsRenderer: {
    register(spec: {
      render(
        host: HTMLElement,
        ctx: {
          host: HTMLElement
          extId: string
          settings: {
            get<T = unknown>(key: string): T | undefined
            set(key: string, value: unknown): void | Promise<void>
            onChange(cb: (key: string, value: unknown) => void): { dispose(): void }
          }
        },
      ): void | (() => void)
    }): { dispose(): void }
  }
  services: Record<string, { available: boolean; impl: unknown }>
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
  mt: unknown
  subscribe(d: { dispose(): void } | (() => void)): void
}

const STYLE_ID = 'file-browser-ext-styles'
const CSS = `
.fb-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: transparent;
  color: var(--fg);
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  user-select: none;
}
.fb-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-family: var(--font-sans);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  color: var(--fg-dim);
  text-transform: lowercase;
  border-bottom: 1px solid var(--border-subtle);
}
.fb-toolbar {
  flex-shrink: 0;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid var(--border-subtle);
}
.fb-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.fb-spacer { flex: 1; }
.fb-breadcrumbs {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.fb-bc-empty { color: var(--fg-dim); font-style: italic; }
.fb-bc-seg {
  background: transparent;
  border: 0;
  color: var(--fg-muted);
  cursor: pointer;
  font: inherit;
  padding: 1px 4px;
  border-radius: var(--r-sm);
  transition: color 0.12s, background 0.12s;
  flex-shrink: 0;
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fb-bc-seg:hover { color: var(--fg); background: var(--bg-hover); }
.fb-bc-sep { color: var(--fg-dim); padding: 0 1px; flex-shrink: 0; }
.fb-sftp-banner {
  font-family: var(--font-sans);
  font-size: var(--t-xs);
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: color-mix(in oklch, var(--c-amber) 14%, transparent);
  color: var(--c-amber);
  cursor: pointer;
}
.fb-body {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
  min-height: 0;
}
.fb-body::-webkit-scrollbar { width: 8px; }
.fb-body::-webkit-scrollbar-track { background: transparent; }
.fb-body::-webkit-scrollbar-thumb { background: var(--n-250); border-radius: 4px; }
.fb-body::-webkit-scrollbar-thumb:hover { background: var(--n-300); }
.fb-loading, .fb-empty, .fb-error {
  padding: 12px;
  color: var(--fg-dim);
  text-align: center;
  font-family: var(--font-sans);
  font-size: var(--t-xs);
  font-style: italic;
}
.fb-error { color: var(--err); font-style: normal; }
.fb-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 22px;
  margin: 1px 4px;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  border-radius: var(--r-sm);
  transition: color 0.1s, background 0.1s;
  position: relative;
  user-select: none;
}
.fb-node::before {
  content: "";
  position: absolute;
  left: 12px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: 1px;
  background: transparent;
  transition: background 0.12s;
}
.fb-node:hover {
  color: var(--fg);
  background: var(--bg-hover);
}
.fb-node.selected {
  color: var(--fg);
  background: var(--bg-active);
}
.fb-node.selected::before {
  background: var(--group-accent, var(--accent));
}
.fb-node.hidden-file { color: var(--fg-disabled); }
.fb-node.hidden-file:hover, .fb-node.hidden-file.selected { color: var(--fg-muted); }
.fb-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: var(--fg-dim);
  font-size: 9px;
  flex-shrink: 0;
}
.fb-chevron:empty { visibility: hidden; }
.fb-icon {
  width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.fb-icon svg { display: block; }
.fb-name {
  text-overflow: ellipsis;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}
.fb-spinner {
  margin-left: auto;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  flex-shrink: 0;
}
.fb-children { margin-left: 0; }

.fb-split {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.fb-split.fb-resizing {
  cursor: col-resize;
  user-select: none;
}
.fb-split.fb-resizing * {
  user-select: none !important;
}
.fb-pane.fb-tree-side {
  flex: 0 0 auto;
  min-width: 0;
  height: 100%;
  border-right: 1px solid var(--border-subtle);
}
.fb-pane.fb-tree-full {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
}
.fb-resizer {
  flex: 0 0 5px;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 1;
}
.fb-resizer::after {
  content: '';
  position: absolute;
  inset: 0 2px;
  background: transparent;
  transition: background 120ms ease;
}
.fb-resizer:hover::after,
.fb-resizer.dragging::after {
  background: color-mix(in oklch, var(--accent) 55%, transparent);
}
.fb-editor-side {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--bg-base);
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
}
.fb-tabs {
  display: flex;
  flex: none;
  align-items: stretch;
  height: 30px;
  background: var(--bg-muted);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.fb-tabs::-webkit-scrollbar { height: 3px; }
.fb-tabs::-webkit-scrollbar-track { background: transparent; }
.fb-tabs::-webkit-scrollbar-thumb { background: var(--n-250); border-radius: 2px; }
.fb-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px 0 12px;
  height: 30px;
  max-width: 200px;
  font-family: var(--font-sans);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  border-right: 1px solid var(--border-subtle);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.12s, background 0.12s;
}
.fb-tab:hover { background: var(--bg-hover); color: var(--fg); }
.fb-tab.fb-tab-active {
  background: var(--bg-base);
  color: var(--fg);
}
.fb-tab.fb-tab-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--accent);
}
.fb-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.01em;
}
.fb-tab.fb-tab-dirty .fb-tab-name::before {
  content: '●';
  color: var(--accent);
  font-size: 10px;
  margin-right: 5px;
  vertical-align: 1px;
}
.fb-tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--fg-dim);
  border-radius: var(--r-sm);
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}
.fb-tab:hover .fb-tab-close,
.fb-tab.fb-tab-active .fb-tab-close,
.fb-tab.fb-tab-dirty .fb-tab-close {
  opacity: 0.65;
}
.fb-tab-close:hover {
  opacity: 1;
  background: var(--bg-active);
  color: var(--fg);
}
.fb-editor-surface {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.fb-editor-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  min-width: 0;
}
.fb-editor-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  min-width: 26px;
  padding: 0 6px;
}
.fb-editor-path {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.fb-editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--bg-base);
}
.fb-editor-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.fb-editor-host > .cm-editor {
  height: 100%;
  outline: none;
}
.fb-editor-host .cm-scroller {
  scrollbar-gutter: stable;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar {
  width: 12px;
  height: 12px;
  background: transparent;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.025);
  border-radius: 6px;
  margin: 4px 0;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-thumb {
  background: var(--n-300);
  border: 3px solid transparent;
  background-clip: padding-box;
  border-radius: 6px;
  min-height: 30px;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-thumb:hover {
  background: var(--n-500);
  background-clip: padding-box;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-thumb:active {
  background: var(--n-600);
  background-clip: padding-box;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-corner {
  background: transparent;
}
.fb-editor-status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-dim);
  font-style: italic;
  padding: 24px;
}
.fb-editor-error { color: var(--err); font-style: normal; }
.fb-editor-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
}
`

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface InitialProps {
  initialCwd?: string
}

export function activate(ctx: ExtCtx): void {
  ctx.logger.info('file-browser renderer activated')
  ensureStyles()

  ctx.subscribe(
    ctx.tabs.registerTabType({
      id: 'file-browser',
      title: 'files',
      factory: ({ tabId, props }) => {
        let root: Root | null = null
        return {
          mount(host: HTMLElement) {
            root = createRoot(host)
            root.render(
              <TabBody ctx={ctx} tabId={tabId} initial={(props ?? {}) as InitialProps} />,
            )
          },
          unmount() {
            try {
              root?.unmount()
            } catch {
              /* ignore */
            }
            root = null
          },
        }
      },
    }),
  )

  ctx.subscribe(
    ctx.commands.register({
      id: 'fileBrowser.openInActiveGroup',
      title: 'File Browser: Open in active group',
      run: async () => {
        const groupId = ctx.workspace.activeGroup()
        const cwdByGroup =
          ctx.settings.get<Record<string, string>>('lastCwdByGroup') ?? {}
        const groupKey = groupId ?? '__none__'
        const savedCwd = cwdByGroup[groupKey]
        const cwd = savedCwd ?? ctx.workspace.cwd() ?? undefined
        await ctx.tabs.open({
          type: 'file-browser',
          title: 'files',
          groupId: groupId ?? undefined,
          props: { initialCwd: cwd },
        })
      },
    }),
  )

  ctx.subscribe(
    ctx.keybindings.register({
      command: 'fileBrowser.openInActiveGroup',
      key: 'Ctrl+B',
    }),
  )

  ctx.subscribe(
    ctx.settingsRenderer.register({
      render: (host, rctx) => mountSettings(host, rctx.settings),
    }),
  )
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically */
}
