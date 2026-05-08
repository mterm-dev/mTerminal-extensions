import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { randomId } from './insert'
import type { Binding, ExtCtx } from './types'

const STYLE_ID = 'hotbinds-ext-styles'
const CSS = `
.hb-modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
}
.hb-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.hb-toolbar-title {
  font-weight: 600;
  letter-spacing: -0.01em;
}
.hb-toolbar-spacer { flex: 1; }
.hb-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 14px 14px;
}
.hb-empty {
  padding: 24px;
  text-align: center;
  color: var(--fg-dim);
  font-style: italic;
}
.hb-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 2fr auto auto;
  gap: 8px;
  align-items: start;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.hb-row:last-child { border-bottom: 0; }
.hb-row-hdr {
  display: grid;
  grid-template-columns: 1.4fr 1fr 2fr auto auto;
  gap: 8px;
  padding: 4px 0;
  font-size: var(--t-xs);
  color: var(--fg-dim);
  text-transform: lowercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  background: var(--bg-raised, var(--bg-base));
  z-index: 1;
}
.hb-input, .hb-textarea, .hb-key {
  width: 100%;
  background: var(--bg-base);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 6px 8px;
  font-family: inherit;
  font-size: var(--t-sm);
  outline: none;
  box-sizing: border-box;
}
.hb-textarea {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  min-height: 60px;
  resize: vertical;
}
.hb-key {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  cursor: text;
}
.hb-key.recording {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 30%, transparent);
}
.hb-input:focus, .hb-textarea:focus, .hb-key:focus {
  border-color: var(--accent);
}
.hb-submit-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 8px;
}
.hb-del {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg-muted);
  border-radius: var(--r-sm);
  padding: 6px 8px;
  cursor: pointer;
  font: inherit;
  align-self: start;
}
.hb-del:hover {
  color: var(--err);
  border-color: var(--err);
}
.hb-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: var(--r-sm);
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
}
.hb-btn:hover { background: var(--bg-hover); }
.hb-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-base);
  font-weight: 600;
}
.hb-btn.primary:hover { filter: brightness(1.1); }
.hb-conflict {
  margin-top: 4px;
  font-size: var(--t-xs);
  color: var(--c-amber, var(--err));
}
.hb-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
`

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function formatKeyEvent(e: React.KeyboardEvent): string | null {
  const k = e.key
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  let key = k
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('+')
}

function KeyCapture({
  value,
  onChange,
}: {
  value: string
  onChange(next: string): void
}): React.ReactElement {
  const [recording, setRecording] = useState(false)
  return (
    <input
      className={'hb-key' + (recording ? ' recording' : '')}
      value={recording ? 'press a combo…' : value}
      placeholder="Click and press a combo"
      readOnly
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return
        const combo = formatKeyEvent(e)
        if (!combo) return
        e.preventDefault()
        e.stopPropagation()
        onChange(combo)
        ;(e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function Manager({
  ctx,
  ctrl,
}: {
  ctx: ExtCtx
  ctrl: { close(result?: unknown): void }
}): React.ReactElement {
  const initial = (ctx.settings.get<Binding[]>('bindings') ?? []) as Binding[]
  const [items, setItems] = useState<Binding[]>(() => initial.map((b) => ({ ...b })))

  const conflicts = useMemo(() => {
    const seen = new Map<string, number>()
    const dups = new Set<string>()
    for (const b of items) {
      const key = b.key.trim()
      if (!key) continue
      seen.set(key, (seen.get(key) ?? 0) + 1)
      if ((seen.get(key) ?? 0) > 1) dups.add(key)
    }
    return dups
  }, [items])

  const update = (idx: number, patch: Partial<Binding>): void => {
    setItems((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }

  const add = (): void => {
    setItems((prev) => [
      ...prev,
      { id: randomId(), name: '', key: '', text: '', submit: false },
    ])
  }

  const remove = (idx: number): void => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const save = async (): Promise<void> => {
    const cleaned = items
      .map((b) => ({ ...b, name: b.name.trim(), key: b.key.trim(), text: b.text }))
      .filter((b) => b.key.length > 0)
    await ctx.settings.set('bindings', cleaned)
    ctx.ui.toast({ kind: 'success', message: `Hotbinds: saved ${cleaned.length} binding(s)` })
    ctrl.close()
  }

  return (
    <div className="hb-modal">
      <div className="hb-toolbar">
        <span className="hb-toolbar-title">Hotbinds</span>
        <span className="hb-toolbar-spacer" />
        <button className="hb-btn" onClick={add}>+ Add binding</button>
      </div>
      <div className="hb-body">
        {items.length === 0 ? (
          <div className="hb-empty">
            No bindings yet. Click <strong>+ Add binding</strong> to create one.
          </div>
        ) : (
          <>
            <div className="hb-row-hdr">
              <span>Name</span>
              <span>Shortcut</span>
              <span>Snippet</span>
              <span>Submit</span>
              <span />
            </div>
            {items.map((b, idx) => (
              <div className="hb-row" key={b.id}>
                <div>
                  <input
                    className="hb-input"
                    placeholder="e.g. git status"
                    value={b.name}
                    onChange={(e) => update(idx, { name: e.target.value })}
                  />
                </div>
                <div>
                  <KeyCapture value={b.key} onChange={(k) => update(idx, { key: k })} />
                  {b.key && conflicts.has(b.key.trim()) ? (
                    <div className="hb-conflict">Duplicate shortcut</div>
                  ) : null}
                </div>
                <div>
                  <textarea
                    className="hb-textarea"
                    placeholder="Text to insert"
                    value={b.text}
                    onChange={(e) => update(idx, { text: e.target.value })}
                  />
                </div>
                <div className="hb-submit-cell">
                  <input
                    type="checkbox"
                    title="Append Enter when firing into terminal"
                    checked={b.submit}
                    onChange={(e) => update(idx, { submit: e.target.checked })}
                  />
                </div>
                <button
                  className="hb-del"
                  onClick={() => remove(idx)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="hb-footer">
        <button className="hb-btn" onClick={() => ctrl.close()}>Cancel</button>
        <button className="hb-btn primary" onClick={() => void save()}>Save</button>
      </div>
    </div>
  )
}

export async function openManager(ctx: ExtCtx): Promise<void> {
  ensureStyles()
  await ctx.ui.openModal({
    title: 'Hotbinds — Manage bindings',
    width: 880,
    height: 560,
    render: (host, ctrl) => {
      const root = createRoot(host)
      root.render(<Manager ctx={ctx} ctrl={ctrl} />)
      return () => {
        try {
          root.unmount()
        } catch {
          /* ignore */
        }
      }
    },
  })
}
