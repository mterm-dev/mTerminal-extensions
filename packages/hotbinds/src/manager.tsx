import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  background: var(--bg-base);
  container-type: inline-size;
  container-name: hb-modal;
}
@container hb-modal (max-width: 520px) {
  .hb-subtitle { display: none; }
  .hb-head { padding: 10px 12px; }
  .hb-body { padding: 10px 12px 12px; }
  .hb-foot { padding: 10px 12px; }
}
.hb-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.hb-head-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.hb-title {
  font-weight: 600;
  font-size: var(--t-md);
  letter-spacing: -0.01em;
}
.hb-subtitle {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  letter-spacing: 0.02em;
}
.hb-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: var(--bg-active);
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
}
.hb-spacer { flex: 1; }
.hb-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  container-type: inline-size;
  container-name: hb-body;
}
.hb-body::-webkit-scrollbar { width: 10px; }
.hb-body::-webkit-scrollbar-track { background: transparent; }
.hb-body::-webkit-scrollbar-thumb {
  background: var(--n-300, var(--border));
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 5px;
}

.hb-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 16px;
  gap: 16px;
}
.hb-empty-art {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 6px;
  opacity: 0.55;
  margin-bottom: 4px;
}
.hb-empty-art .hb-cap {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--fg-muted);
  background: var(--bg-raised, var(--bg-base));
  border: 1px solid var(--border);
  border-bottom-width: 3px;
  border-radius: 8px;
}
.hb-empty-title {
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--fg);
}
.hb-empty-sub {
  color: var(--fg-dim);
  font-size: var(--t-sm);
  max-width: 380px;
  line-height: 1.5;
}
.hb-empty-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}
.hb-templates {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  max-width: 520px;
}
.hb-templates-label {
  width: 100%;
  font-size: var(--t-xs);
  color: var(--fg-dim);
  text-align: center;
  margin-top: 4px;
  text-transform: lowercase;
  letter-spacing: 0.04em;
}
.hb-template {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-muted);
  background: var(--bg-raised, var(--bg-base));
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.12s;
}
.hb-template:hover {
  color: var(--fg);
  border-color: var(--accent);
  background: color-mix(in oklch, var(--accent) 8%, var(--bg-base));
}

.hb-card {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(140px, auto) minmax(220px, 2fr) auto auto;
  grid-template-areas: "name shortcut snippet submit actions";
  gap: 10px;
  align-items: stretch;
  padding: 10px;
  background: var(--bg-raised, var(--bg-base));
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md, 8px);
  transition: border-color 0.12s, box-shadow 0.12s;
  position: relative;
  min-width: 0;
}
.hb-card > .hb-cell:nth-of-type(1) { grid-area: name; }
.hb-card > .hb-cell:nth-of-type(2) { grid-area: shortcut; }
.hb-card > .hb-cell:nth-of-type(3) { grid-area: snippet; }
.hb-card > .hb-segmented { grid-area: submit; }
.hb-card > .hb-actions { grid-area: actions; }

/* Narrow viewport (e.g. embedded in Settings card): stack everything. */
@container hb-body (max-width: 720px) {
  .hb-card {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "name name"
      "shortcut shortcut"
      "snippet snippet"
      "submit actions";
    gap: 8px;
  }
  .hb-card > .hb-segmented {
    margin-top: 4px;
    justify-self: start;
  }
  .hb-card > .hb-actions {
    margin-top: 4px;
    flex-direction: row;
    align-self: end;
    justify-self: end;
  }
}

/* Even narrower: actions go on their own row to avoid clipping. */
@container hb-body (max-width: 480px) {
  .hb-card {
    grid-template-columns: 1fr;
    grid-template-areas:
      "name"
      "shortcut"
      "snippet"
      "submit"
      "actions";
  }
  .hb-card > .hb-actions {
    justify-self: start;
  }
}
.hb-card:hover {
  border-color: var(--border);
}
.hb-card.dup {
  border-color: var(--c-amber, var(--err));
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--c-amber, var(--err)) 30%, transparent);
}
.hb-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.hb-cell-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-dim);
  font-weight: 600;
}
.hb-input, .hb-textarea {
  width: 100%;
  background: var(--bg-base);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 4px);
  padding: 6px 8px;
  font-family: inherit;
  font-size: var(--t-sm);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.hb-input:focus, .hb-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 24%, transparent);
}
.hb-input::placeholder, .hb-textarea::placeholder {
  color: var(--fg-dim);
}
.hb-textarea {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  min-height: 56px;
  resize: vertical;
  line-height: 1.5;
}

/* Key capture: visual kbd display */
.hb-kbd-host {
  position: relative;
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 4px);
  cursor: pointer;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
  flex-wrap: wrap;
}
.hb-kbd-host:hover { border-color: var(--fg-dim); }
.hb-kbd-host:focus, .hb-kbd-host.recording {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 24%, transparent);
}
.hb-kbd-host.empty {
  border-style: dashed;
}
.hb-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--fg-muted);
  background: linear-gradient(180deg, var(--bg-raised, var(--bg-base)), var(--bg-active, var(--bg-base)));
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 4px;
  white-space: nowrap;
}
.hb-kbd-plus {
  color: var(--fg-dim);
  font-weight: 400;
  font-size: 10px;
}
.hb-kbd-placeholder {
  color: var(--fg-dim);
  font-size: var(--t-xs);
  font-style: italic;
  padding: 0 4px;
}
.hb-kbd-clear {
  margin-left: auto;
  background: transparent;
  border: 0;
  color: var(--fg-dim);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
}
.hb-kbd-clear:hover { color: var(--err); background: var(--bg-hover); }

/* Submit toggle: segmented switch */
.hb-segmented {
  display: inline-flex;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 4px);
  padding: 2px;
  gap: 2px;
  align-self: center;
  margin-top: 16px;
}
.hb-seg {
  background: transparent;
  border: 0;
  color: var(--fg-dim);
  cursor: pointer;
  font: inherit;
  font-size: var(--t-xs);
  padding: 4px 8px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.12s;
  white-space: nowrap;
}
.hb-seg:hover { color: var(--fg-muted); }
.hb-seg.active {
  background: var(--bg-active);
  color: var(--fg);
}
.hb-seg-icon {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.85;
}

/* Card actions */
.hb-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: flex-start;
  margin-top: 16px;
}
.hb-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--fg-dim);
  border-radius: var(--r-sm, 4px);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  transition: all 0.12s;
}
.hb-icon-btn:hover {
  color: var(--fg);
  background: var(--bg-hover);
  border-color: var(--border-subtle);
}
.hb-icon-btn.danger:hover {
  color: var(--err);
  border-color: var(--err);
}

.hb-msg {
  font-size: 11px;
  color: var(--c-amber, var(--err));
  padding-left: 2px;
}

/* Buttons */
.hb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: var(--r-sm, 4px);
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
  font-size: var(--t-sm);
  transition: all 0.12s;
}
.hb-btn:hover { background: var(--bg-hover); border-color: var(--fg-dim); }
.hb-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-base);
  font-weight: 600;
}
.hb-btn.primary:hover { filter: brightness(1.08); }
.hb-btn.subtle {
  border-color: var(--border-subtle);
  color: var(--fg-muted);
}
.hb-btn-plus {
  font-size: 14px;
  line-height: 1;
}

.hb-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--bg-base);
}
.hb-foot-hint {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  font-family: var(--font-mono);
}
.hb-foot-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  margin: 0 1px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  font-size: 10px;
  background: var(--bg-raised, var(--bg-base));
}
`

function ensureStyles(): void {
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

const QUICK_TEMPLATES: Array<Pick<Binding, 'name' | 'text' | 'submit'>> = [
  { name: 'git status', text: 'git status', submit: true },
  { name: 'git pull', text: 'git pull', submit: true },
  { name: 'ls -la', text: 'ls -la', submit: true },
  { name: 'clear', text: 'clear', submit: true },
  { name: 'docker ps', text: 'docker ps', submit: true },
  { name: 'k get pods', text: 'kubectl get pods', submit: true },
]

function formatNativeKeyEvent(e: KeyboardEvent): string | null {
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
  const ref = useRef<HTMLDivElement>(null)
  const parts = value ? value.split('+') : []

  // While recording, intercept keystrokes on the *capture* phase so the host's
  // global keybinding dispatcher (which also listens in capture phase and may
  // call stopPropagation) never sees them. Otherwise Ctrl+<key> combos that
  // collide with any registered binding fire that binding instead of being
  // recorded here.
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      // Allow the user to bail out cleanly.
      if (e.key === 'Escape' || e.key === 'Tab') {
        ref.current?.blur()
        return
      }
      const combo = formatNativeKeyEvent(e)
      if (!combo) return
      // Block both the host dispatcher (capture phase) and the browser default
      // (e.g. Ctrl+R reload, Ctrl+W close).
      e.preventDefault()
      e.stopImmediatePropagation()
      e.stopPropagation()
      onChange(combo)
      ref.current?.blur()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [recording, onChange])

  return (
    <div
      ref={ref}
      className={
        'hb-kbd-host' +
        (recording ? ' recording' : '') +
        (!value ? ' empty' : '')
      }
      tabIndex={0}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
    >
      {recording ? (
        <span className="hb-kbd-placeholder">press a combo…</span>
      ) : parts.length ? (
        parts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <span className="hb-kbd-plus">+</span> : null}
            <span className="hb-kbd">{p}</span>
          </React.Fragment>
        ))
      ) : (
        <span className="hb-kbd-placeholder">click to record</span>
      )}
      {value && !recording ? (
        <button
          className="hb-kbd-clear"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange('')
          }}
          title="Clear"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

function SubmitToggle({
  value,
  onChange,
}: {
  value: boolean
  onChange(next: boolean): void
}): React.ReactElement {
  return (
    <div className="hb-segmented" role="group" title="What to do when target is the terminal">
      <button
        className={'hb-seg' + (!value ? ' active' : '')}
        onClick={() => onChange(false)}
        type="button"
        title="Insert text without pressing Enter"
      >
        <span className="hb-seg-icon">▷</span>
        Insert
      </button>
      <button
        className={'hb-seg' + (value ? ' active' : '')}
        onClick={() => onChange(true)}
        type="button"
        title="Insert text and press Enter"
      >
        <span className="hb-seg-icon">↵</span>
        Run
      </button>
    </div>
  )
}

function Manager({
  ctx,
  ctrl,
  embedded = false,
}: {
  ctx: ExtCtx
  ctrl?: { close(result?: unknown): void }
  embedded?: boolean
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

  const add = (preset?: Pick<Binding, 'name' | 'text' | 'submit'>): void => {
    setItems((prev) => [
      ...prev,
      {
        id: randomId(),
        name: preset?.name ?? '',
        key: '',
        text: preset?.text ?? '',
        submit: preset?.submit ?? false,
      },
    ])
  }

  const duplicate = (idx: number): void => {
    setItems((prev) => {
      const src = prev[idx]
      if (!src) return prev
      const copy: Binding = { ...src, id: randomId(), key: '', name: src.name ? `${src.name} (copy)` : '' }
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]
    })
  }

  const remove = (idx: number): void => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const save = async (): Promise<void> => {
    const cleaned = items
      .map((b) => ({ ...b, name: b.name.trim(), key: b.key.trim(), text: b.text }))
      .filter((b) => b.key.length > 0)
    await ctx.settings.set('bindings', cleaned)
    ctx.ui.toast({
      kind: 'success',
      message: `Hotbinds: saved ${cleaned.length} binding${cleaned.length === 1 ? '' : 's'}`,
    })
    ctrl?.close()
  }

  // External-change sync (other window / modal saves while panel is open)
  useEffect(() => {
    if (!embedded) return
    const off = ctx.settings.onChange((key) => {
      if (key !== 'bindings') return
      const next = (ctx.settings.get<Binding[]>('bindings') ?? []) as Binding[]
      setItems((prev) => {
        // If the data is identical, don't blow away local edits
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev
        return next.map((b) => ({ ...b }))
      })
    })
    return () => off.dispose()
  }, [ctx, embedded])

  // Embedded autosave: persist only well-formed bindings, ~250ms debounce.
  const isFirst = useRef(true)
  useEffect(() => {
    if (!embedded) return
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    const t = setTimeout(() => {
      const cleaned = items
        .map((b) => ({ ...b, name: b.name.trim(), key: b.key.trim(), text: b.text }))
        .filter((b) => b.key.length > 0)
      void ctx.settings.set('bindings', cleaned)
    }, 250)
    return () => clearTimeout(t)
  }, [items, embedded, ctx])

  // Modal Ctrl+S shortcut
  useEffect(() => {
    if (embedded) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, embedded])

  const count = items.length
  const valid = items.filter((b) => b.key.trim().length > 0).length

  return (
    <div className="hb-modal">
      <div className="hb-head">
        <div className="hb-head-title">
          <span className="hb-title">Hotbinds</span>
          <span className="hb-count" title={`${valid} of ${count} ready to save`}>
            {count}
          </span>
        </div>
        <span className="hb-subtitle">global shortcuts → text into focused input or terminal</span>
        <span className="hb-spacer" />
        <button className="hb-btn" onClick={() => add()} type="button">
          <span className="hb-btn-plus">+</span> Add binding
        </button>
      </div>

      <div className="hb-body">
        {items.length === 0 ? (
          <div className="hb-empty">
            <div className="hb-empty-art" aria-hidden>
              <span className="hb-cap">⌃</span>
              <span className="hb-cap">⌥</span>
              <span className="hb-cap">1</span>
            </div>
            <div className="hb-empty-title">No hotbinds yet</div>
            <div className="hb-empty-sub">
              Bind a keyboard shortcut to a snippet. When you press the combo, the text fires
              into whatever you're focused on — terminal, commit message, anywhere.
            </div>
            <div className="hb-empty-actions">
              <button className="hb-btn primary" onClick={() => add()} type="button">
                <span className="hb-btn-plus">+</span> Create your first binding
              </button>
              <div className="hb-templates-label">or start from a template</div>
              <div className="hb-templates">
                {QUICK_TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    className="hb-template"
                    onClick={() => add(t)}
                    type="button"
                  >
                    {t.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          items.map((b, idx) => {
            const dup = b.key && conflicts.has(b.key.trim())
            return (
              <div className={'hb-card' + (dup ? ' dup' : '')} key={b.id}>
                <div className="hb-cell">
                  <span className="hb-cell-label">Name</span>
                  <input
                    className="hb-input"
                    placeholder="describe what it does"
                    value={b.name}
                    onChange={(e) => update(idx, { name: e.target.value })}
                  />
                </div>
                <div className="hb-cell">
                  <span className="hb-cell-label">Shortcut</span>
                  <KeyCapture value={b.key} onChange={(k) => update(idx, { key: k })} />
                  {dup ? <div className="hb-msg">Duplicate shortcut</div> : null}
                </div>
                <div className="hb-cell">
                  <span className="hb-cell-label">Snippet</span>
                  <textarea
                    className="hb-textarea"
                    placeholder="text to insert"
                    value={b.text}
                    onChange={(e) => update(idx, { text: e.target.value })}
                    spellCheck={false}
                  />
                </div>
                <SubmitToggle value={b.submit} onChange={(v) => update(idx, { submit: v })} />
                <div className="hb-actions">
                  <button
                    className="hb-icon-btn"
                    title="Duplicate"
                    onClick={() => duplicate(idx)}
                    type="button"
                  >
                    ⎘
                  </button>
                  <button
                    className="hb-icon-btn danger"
                    title="Delete"
                    onClick={() => remove(idx)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {embedded ? (
        <div className="hb-foot">
          <span className="hb-foot-hint">
            changes save automatically · open full manager with{' '}
            <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd>
          </span>
        </div>
      ) : (
        <div className="hb-foot">
          <span className="hb-foot-hint">
            <kbd>Ctrl</kbd>+<kbd>S</kbd> save · <kbd>Esc</kbd> close
          </span>
          <span className="hb-spacer" />
          <button className="hb-btn subtle" onClick={() => ctrl?.close()} type="button">
            Cancel
          </button>
          <button
            className="hb-btn primary"
            onClick={() => void save()}
            type="button"
            disabled={items.some((b) => !b.key.trim())}
            title={
              items.some((b) => !b.key.trim())
                ? 'Some bindings still need a shortcut'
                : 'Save all bindings'
            }
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Mount the manager UI directly into a host element (used by the
 * `settingsRenderer` API for the in-Settings card).
 */
export function mountManager(ctx: ExtCtx, host: HTMLElement): () => void {
  ensureStyles()
  const root = createRoot(host)
  root.render(<Manager ctx={ctx} embedded />)
  return () => {
    try {
      root.unmount()
    } catch {
      /* ignore */
    }
  }
}

export async function openManager(ctx: ExtCtx): Promise<void> {
  ensureStyles()
  await ctx.ui.openModal({
    title: 'Hotbinds — Manage bindings',
    width: 960,
    height: 620,
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
