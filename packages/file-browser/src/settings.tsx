import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface SettingsApi {
  get<T = unknown>(key: string): T | undefined
  set(key: string, value: unknown): void | Promise<void>
  onChange(cb: (key: string, value: unknown) => void): { dispose(): void }
}

interface FileBrowserSettings {
  defaultWidth: number
  showHiddenByDefault: boolean
  maxEntriesPerDir: number
}

const DEFAULTS: FileBrowserSettings = {
  defaultWidth: 320,
  showHiddenByDefault: true,
  maxEntriesPerDir: 5000,
}

const STYLE_ID = 'file-browser-settings-styles'
const CSS = `
.fb-st {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
  background: var(--bg-base);
  container-type: inline-size;
  container-name: fb-st;
}
.fb-st-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.fb-st-head-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.fb-st-title {
  font-weight: 600;
  font-size: var(--t-md);
  letter-spacing: -0.01em;
}
.fb-st-subtitle {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  letter-spacing: 0.02em;
}
.fb-st-count {
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
.fb-st-spacer { flex: 1; }
@container fb-st (max-width: 520px) {
  .fb-st-subtitle { display: none; }
  .fb-st-head { padding: 10px 12px; }
  .fb-st-body { padding: 10px 12px 12px; }
  .fb-st-foot { padding: 10px 12px; }
}
.fb-st-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  container-type: inline-size;
  container-name: fb-st-body;
}
.fb-st-body::-webkit-scrollbar { width: 10px; }
.fb-st-body::-webkit-scrollbar-track { background: transparent; }
.fb-st-body::-webkit-scrollbar-thumb {
  background: var(--n-300, var(--border));
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 5px;
}
.fb-st-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  background: var(--bg-raised, var(--bg-base));
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md, 8px);
  transition: border-color 0.12s, box-shadow 0.12s;
  min-width: 0;
}
.fb-st-card:hover { border-color: var(--border); }
@container fb-st-body (max-width: 520px) {
  .fb-st-card {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .fb-st-control { justify-self: start; }
}
.fb-st-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.fb-st-label {
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--fg);
  letter-spacing: -0.005em;
}
.fb-st-desc {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  line-height: 1.5;
}
.fb-st-control {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}
.fb-st-input {
  width: 120px;
  background: var(--bg-base);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 4px);
  padding: 6px 8px;
  font: inherit;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.12s, box-shadow 0.12s;
  text-align: right;
}
.fb-st-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 24%, transparent);
}
.fb-st-input.invalid {
  border-color: var(--err);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--err) 24%, transparent);
}
.fb-st-suffix {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
}
.fb-st-segmented {
  display: inline-flex;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 4px);
  padding: 2px;
  gap: 2px;
}
.fb-st-seg {
  background: transparent;
  border: 0;
  color: var(--fg-dim);
  cursor: pointer;
  font: inherit;
  font-size: var(--t-xs);
  padding: 4px 10px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.12s;
  white-space: nowrap;
}
.fb-st-seg:hover { color: var(--fg-muted); }
.fb-st-seg.active {
  background: var(--bg-active);
  color: var(--fg);
}
.fb-st-seg-icon {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.85;
}
.fb-st-msg {
  font-size: 11px;
  color: var(--c-amber, var(--err));
  margin-top: 2px;
}
.fb-st-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--bg-base);
}
.fb-st-foot-hint {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  font-family: var(--font-mono);
}
.fb-st-foot-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  margin: 0 1px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  font-size: 10px;
  background: var(--bg-raised, var(--bg-base));
}
.fb-st-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: var(--r-sm, 4px);
  padding: 5px 10px;
  cursor: pointer;
  font: inherit;
  font-size: var(--t-xs);
  transition: all 0.12s;
}
.fb-st-btn:hover { background: var(--bg-hover); border-color: var(--fg-dim); }
`

function ensureStyles(): void {
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function readSettings(api: SettingsApi): FileBrowserSettings {
  const get = <K extends keyof FileBrowserSettings>(key: K): FileBrowserSettings[K] => {
    const v = api.get<FileBrowserSettings[K]>(key)
    return v !== undefined && v !== null ? v : DEFAULTS[key]
  }
  return {
    defaultWidth: get('defaultWidth'),
    showHiddenByDefault: get('showHiddenByDefault'),
    maxEntriesPerDir: get('maxEntriesPerDir'),
  }
}

function ToggleControl({
  value,
  onChange,
  offLabel = 'Off',
  onLabel = 'On',
}: {
  value: boolean
  onChange(next: boolean): void
  offLabel?: string
  onLabel?: string
}): React.ReactElement {
  return (
    <div className="fb-st-segmented" role="group">
      <button
        className={'fb-st-seg' + (!value ? ' active' : '')}
        onClick={() => onChange(false)}
        type="button"
      >
        <span className="fb-st-seg-icon">○</span>
        {offLabel}
      </button>
      <button
        className={'fb-st-seg' + (value ? ' active' : '')}
        onClick={() => onChange(true)}
        type="button"
      >
        <span className="fb-st-seg-icon">●</span>
        {onLabel}
      </button>
    </div>
  )
}

function NumberControl({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  onChange(next: number): void
}): React.ReactElement {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(String(value))
  }, [value])

  const parsed = Number(text)
  const valid =
    Number.isFinite(parsed) &&
    (min === undefined || parsed >= min) &&
    (max === undefined || parsed <= max)

  const commit = (): void => {
    if (!valid) {
      setText(String(value))
      return
    }
    if (parsed !== value) onChange(parsed)
  }

  return (
    <>
      <input
        className={'fb-st-input' + (!valid ? ' invalid' : '')}
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      {suffix ? <span className="fb-st-suffix">{suffix}</span> : null}
    </>
  )
}

function SettingsView({ api }: { api: SettingsApi }): React.ReactElement {
  const [s, setS] = useState<FileBrowserSettings>(() => readSettings(api))

  useEffect(() => {
    const off = api.onChange(() => setS(readSettings(api)))
    return () => off.dispose()
  }, [api])

  const update = <K extends keyof FileBrowserSettings>(
    key: K,
    value: FileBrowserSettings[K],
  ): void => {
    setS((prev) => ({ ...prev, [key]: value }))
    void api.set(key, value)
  }

  const reset = (): void => {
    for (const k of Object.keys(DEFAULTS) as Array<keyof FileBrowserSettings>) {
      void api.set(k, DEFAULTS[k])
    }
    setS({ ...DEFAULTS })
  }

  return (
    <div className="fb-st">
      <div className="fb-st-head">
        <div className="fb-st-head-title">
          <span className="fb-st-title">File Browser</span>
          <span className="fb-st-count">3</span>
        </div>
        <span className="fb-st-subtitle">tab + side panel for local fs and SSH/SFTP</span>
        <span className="fb-st-spacer" />
        <button className="fb-st-btn" type="button" onClick={reset} title="Restore defaults">
          Reset
        </button>
      </div>

      <div className="fb-st-body">
        <div className="fb-st-card">
          <div className="fb-st-info">
            <span className="fb-st-label">Default panel width</span>
            <span className="fb-st-desc">
              Initial width for newly opened file-browser tabs, in pixels (200–800).
            </span>
          </div>
          <div className="fb-st-control">
            <NumberControl
              value={s.defaultWidth}
              min={200}
              max={800}
              suffix="px"
              onChange={(v) => update('defaultWidth', v)}
            />
          </div>
        </div>

        <div className="fb-st-card">
          <div className="fb-st-info">
            <span className="fb-st-label">Show hidden files</span>
            <span className="fb-st-desc">
              Reveal dotfiles (.git, .env, etc.) in directory listings by default.
            </span>
          </div>
          <div className="fb-st-control">
            <ToggleControl
              value={s.showHiddenByDefault}
              onChange={(v) => update('showHiddenByDefault', v)}
              offLabel="Hide"
              onLabel="Show"
            />
          </div>
        </div>

        <div className="fb-st-card">
          <div className="fb-st-info">
            <span className="fb-st-label">Max entries per directory</span>
            <span className="fb-st-desc">
              Cap on entries returned per listing — prevents UI freezes on huge folders.
            </span>
          </div>
          <div className="fb-st-control">
            <NumberControl
              value={s.maxEntriesPerDir}
              min={100}
              step={100}
              suffix="entries"
              onChange={(v) => update('maxEntriesPerDir', v)}
            />
          </div>
        </div>
      </div>

      <div className="fb-st-foot">
        <span className="fb-st-foot-hint">
          changes save automatically · open the browser with{' '}
          <kbd>Ctrl</kbd>+<kbd>B</kbd>
        </span>
      </div>
    </div>
  )
}

export function mountSettings(host: HTMLElement, api: SettingsApi): () => void {
  ensureStyles()
  const root = createRoot(host)
  root.render(<SettingsView api={api} />)
  return () => {
    try {
      root.unmount()
    } catch {
      /* ignore */
    }
  }
}
