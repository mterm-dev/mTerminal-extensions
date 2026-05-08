import React, { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { openManager } from './manager'
import type { Binding, ExtCtx } from './types'

const STYLE_ID = 'hotbinds-panel-styles'
const CSS = `
.hbp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
}
.hbp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.hbp-title {
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  color: var(--fg-dim);
  text-transform: lowercase;
}
.hbp-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--bg-active);
  color: var(--fg-muted);
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
}
.hbp-spacer { flex: 1; }
.hbp-icon-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--fg-dim);
  border-radius: var(--r-sm, 4px);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  transition: all 0.12s;
}
.hbp-icon-btn:hover {
  color: var(--fg);
  background: var(--bg-hover);
  border-color: var(--border-subtle);
}
.hbp-icon-btn.danger:hover {
  color: var(--err);
  border-color: var(--err);
}

.hbp-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hbp-body::-webkit-scrollbar { width: 8px; }
.hbp-body::-webkit-scrollbar-thumb {
  background: var(--n-300, var(--border));
  border-radius: 4px;
}

.hbp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 12px;
  text-align: center;
}
.hbp-empty-msg {
  color: var(--fg-dim);
  font-size: var(--t-xs);
  line-height: 1.5;
  max-width: 240px;
}
.hbp-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--accent);
  border: 0;
  color: var(--bg-base);
  border-radius: var(--r-sm, 4px);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.12s;
}
.hbp-cta:hover { filter: brightness(1.08); }

.hbp-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 6px;
  align-items: center;
  padding: 5px 8px;
  border-radius: var(--r-sm, 4px);
  cursor: pointer;
  transition: background 0.1s;
  min-width: 0;
}
.hbp-row:hover { background: var(--bg-hover); }
.hbp-row-name {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.hbp-row-label {
  color: var(--fg);
  font-size: var(--t-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hbp-row-label.dim {
  color: var(--fg-dim);
  font-style: italic;
}
.hbp-row-snippet {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hbp-row-key {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.hbp-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--fg-muted);
  background: linear-gradient(180deg, var(--bg-raised, var(--bg-base)), var(--bg-active, var(--bg-base)));
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
}
.hbp-plus { color: var(--fg-dim); font-size: 9px; }
.hbp-mode {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-dim);
  width: 14px;
  text-align: center;
}
.hbp-mode.run { color: var(--accent); }
.hbp-row-del {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--fg-dim);
  border-radius: 3px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s, background 0.12s;
}
.hbp-row:hover .hbp-row-del { opacity: 1; }
.hbp-row-del:hover { color: var(--err); background: var(--bg-active); }

.hbp-foot {
  padding: 6px 10px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
  display: flex;
  gap: 6px;
}
.hbp-foot .hbp-foot-btn {
  flex: 1;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--fg-muted);
  border-radius: var(--r-sm, 4px);
  padding: 5px 8px;
  cursor: pointer;
  font: inherit;
  font-size: var(--t-xs);
  transition: all 0.1s;
}
.hbp-foot-btn:hover {
  color: var(--fg);
  border-color: var(--fg-dim);
  background: var(--bg-hover);
}
`

function ensureStyles(): void {
  const existing = document.getElementById(STYLE_ID)
  if (existing) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function HotbindsPanel({ ctx }: { ctx: ExtCtx }): React.ReactElement {
  const [bindings, setBindings] = useState<Binding[]>(
    () => (ctx.settings.get<Binding[]>('bindings') ?? []) as Binding[],
  )

  useEffect(() => {
    const off = ctx.settings.onChange((key) => {
      if (key === 'bindings') {
        setBindings((ctx.settings.get<Binding[]>('bindings') ?? []) as Binding[])
      }
    })
    return () => off.dispose()
  }, [ctx])

  const remove = async (id: string): Promise<void> => {
    const next = bindings.filter((b) => b.id !== id)
    await ctx.settings.set('bindings', next)
  }

  const valid = bindings.filter((b) => b && typeof b.key === 'string' && b.key.trim())

  return (
    <div className="hbp-root">
      <div className="hbp-head">
        <span className="hbp-title">hotbinds</span>
        <span className="hbp-count">{valid.length}</span>
        <span className="hbp-spacer" />
        <button
          className="hbp-icon-btn"
          title="Add binding"
          onClick={() => void openManager(ctx)}
        >
          +
        </button>
        <button
          className="hbp-icon-btn"
          title="Open manager (Ctrl+Alt+H)"
          onClick={() => void openManager(ctx)}
        >
          ⛶
        </button>
      </div>

      <div className="hbp-body">
        {valid.length === 0 ? (
          <div className="hbp-empty">
            <div className="hbp-empty-msg">
              No hotbinds yet. Bind a shortcut to a snippet and fire text into the focused input
              or terminal.
            </div>
            <button className="hbp-cta" onClick={() => void openManager(ctx)}>
              + Add your first binding
            </button>
          </div>
        ) : (
          valid.map((b) => {
            const parts = b.key.split('+')
            return (
              <div
                key={b.id}
                className="hbp-row"
                onClick={() => void openManager(ctx)}
                title="Edit (opens manager)"
              >
                <div className="hbp-row-name">
                  <span className={'hbp-row-label' + (b.name ? '' : ' dim')}>
                    {b.name || 'unnamed'}
                  </span>
                  {b.text ? (
                    <span className="hbp-row-snippet">
                      {b.text.length > 48 ? b.text.slice(0, 48) + '…' : b.text}
                    </span>
                  ) : null}
                </div>
                <span className="hbp-row-key">
                  {parts.map((p, i) => (
                    <React.Fragment key={i}>
                      {i > 0 ? <span className="hbp-plus">+</span> : null}
                      <span className="hbp-kbd">{p}</span>
                    </React.Fragment>
                  ))}
                </span>
                <span
                  className={'hbp-mode' + (b.submit ? ' run' : '')}
                  title={b.submit ? 'Run (presses Enter)' : 'Insert (no Enter)'}
                >
                  {b.submit ? '↵' : '▷'}
                </span>
                <button
                  className="hbp-row-del"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    void remove(b.id)
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="hbp-foot">
        <button className="hbp-foot-btn" onClick={() => void openManager(ctx)}>
          Open full manager · Ctrl+Alt+H
        </button>
      </div>
    </div>
  )
}

export function registerPanel(ctx: ExtCtx): { dispose(): void } {
  return ctx.panels.register({
    id: 'hotbinds-panel',
    title: 'Hotbinds',
    location: 'sidebar.bottom',
    initialCollapsed: true,
    render: (host) => {
      ensureStyles()
      let root: Root | null = createRoot(host)
      root.render(<HotbindsPanel ctx={ctx} />)
      return () => {
        try {
          root?.unmount()
        } catch {
          /* ignore */
        }
        root = null
      }
    },
  })
}
