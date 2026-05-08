import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface SettingsApi {
  get<T = unknown>(key: string): T | undefined
  set(key: string, value: unknown): void | Promise<void>
  onChange(cb: (key: string, value: unknown) => void): { dispose(): void }
}

interface RemoteSshSettings {
  idleTimeoutSec: number
  maxEntriesPerDir: number
  keepaliveIntervalSec: number
  readyTimeoutMs: number
}

const DEFAULTS: RemoteSshSettings = {
  idleTimeoutSec: 300,
  maxEntriesPerDir: 5000,
  keepaliveIntervalSec: 30,
  readyTimeoutMs: 10000,
}

const STYLE_ID = 'remote-ssh-settings-styles'
const CSS = `
.rs-st {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
  background: var(--bg-base);
  container-type: inline-size;
  container-name: rs-st;
}
.rs-st-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.rs-st-head-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.rs-st-title {
  font-weight: 600;
  font-size: var(--t-md);
  letter-spacing: -0.01em;
}
.rs-st-subtitle {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  letter-spacing: 0.02em;
}
.rs-st-count {
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
.rs-st-spacer { flex: 1; }
@container rs-st (max-width: 520px) {
  .rs-st-subtitle { display: none; }
  .rs-st-head { padding: 10px 12px; }
  .rs-st-body { padding: 10px 12px 12px; }
  .rs-st-foot { padding: 10px 12px; }
}
.rs-st-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  container-type: inline-size;
  container-name: rs-st-body;
}
.rs-st-body::-webkit-scrollbar { width: 10px; }
.rs-st-body::-webkit-scrollbar-track { background: transparent; }
.rs-st-body::-webkit-scrollbar-thumb {
  background: var(--n-300, var(--border));
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 5px;
}
.rs-st-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-dim);
  font-weight: 600;
  padding: 4px 2px 0;
}
.rs-st-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rs-st-card {
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
.rs-st-card:hover { border-color: var(--border); }
@container rs-st-body (max-width: 520px) {
  .rs-st-card {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .rs-st-control { justify-self: start; }
}
.rs-st-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rs-st-label {
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--fg);
  letter-spacing: -0.005em;
}
.rs-st-desc {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  line-height: 1.5;
}
.rs-st-control {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}
.rs-st-input {
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
.rs-st-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 24%, transparent);
}
.rs-st-input.invalid {
  border-color: var(--err);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--err) 24%, transparent);
}
.rs-st-suffix {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
}
.rs-st-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--bg-base);
}
.rs-st-foot-hint {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  font-family: var(--font-mono);
}
.rs-st-foot-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  margin: 0 1px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  font-size: 10px;
  background: var(--bg-raised, var(--bg-base));
}
.rs-st-btn {
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
.rs-st-btn:hover { background: var(--bg-hover); border-color: var(--fg-dim); }
`

function ensureStyles(): void {
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function readSettings(api: SettingsApi): RemoteSshSettings {
  const get = <K extends keyof RemoteSshSettings>(key: K): RemoteSshSettings[K] => {
    const v = api.get<RemoteSshSettings[K]>(key)
    return v !== undefined && v !== null ? v : DEFAULTS[key]
  }
  return {
    idleTimeoutSec: get('idleTimeoutSec'),
    maxEntriesPerDir: get('maxEntriesPerDir'),
    keepaliveIntervalSec: get('keepaliveIntervalSec'),
    readyTimeoutMs: get('readyTimeoutMs'),
  }
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
        className={'rs-st-input' + (!valid ? ' invalid' : '')}
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
      {suffix ? <span className="rs-st-suffix">{suffix}</span> : null}
    </>
  )
}

function SettingsView({ api }: { api: SettingsApi }): React.ReactElement {
  const [s, setS] = useState<RemoteSshSettings>(() => readSettings(api))

  useEffect(() => {
    const off = api.onChange(() => setS(readSettings(api)))
    return () => off.dispose()
  }, [api])

  const update = <K extends keyof RemoteSshSettings>(
    key: K,
    value: RemoteSshSettings[K],
  ): void => {
    setS((prev) => ({ ...prev, [key]: value }))
    void api.set(key, value)
  }

  const reset = (): void => {
    for (const k of Object.keys(DEFAULTS) as Array<keyof RemoteSshSettings>) {
      void api.set(k, DEFAULTS[k])
    }
    setS({ ...DEFAULTS })
  }

  return (
    <div className="rs-st">
      <div className="rs-st-head">
        <div className="rs-st-head-title">
          <span className="rs-st-title">Remote SSH</span>
          <span className="rs-st-count">4</span>
        </div>
        <span className="rs-st-subtitle">SSH host registry, terminals & SFTP filesystem</span>
        <span className="rs-st-spacer" />
        <button className="rs-st-btn" type="button" onClick={reset} title="Restore defaults">
          Reset
        </button>
      </div>

      <div className="rs-st-body">
        <div className="rs-st-section-label">Connections</div>
        <div className="rs-st-group">
          <div className="rs-st-card">
            <div className="rs-st-info">
              <span className="rs-st-label">Connection ready timeout</span>
              <span className="rs-st-desc">
                How long to wait for the SSH handshake before giving up. Bump this for slow links.
              </span>
            </div>
            <div className="rs-st-control">
              <NumberControl
                value={s.readyTimeoutMs}
                min={1000}
                step={500}
                suffix="ms"
                onChange={(v) => update('readyTimeoutMs', v)}
              />
            </div>
          </div>

          <div className="rs-st-card">
            <div className="rs-st-info">
              <span className="rs-st-label">Keepalive interval</span>
              <span className="rs-st-desc">
                Send a TCP keepalive at this cadence to keep NAT pinholes open and detect dead peers.
              </span>
            </div>
            <div className="rs-st-control">
              <NumberControl
                value={s.keepaliveIntervalSec}
                min={5}
                step={5}
                suffix="s"
                onChange={(v) => update('keepaliveIntervalSec', v)}
              />
            </div>
          </div>

          <div className="rs-st-card">
            <div className="rs-st-info">
              <span className="rs-st-label">Idle timeout</span>
              <span className="rs-st-desc">
                Disconnect SSH/SFTP clients with no traffic for this long — frees up sockets and remote slots.
              </span>
            </div>
            <div className="rs-st-control">
              <NumberControl
                value={s.idleTimeoutSec}
                min={60}
                step={30}
                suffix="s"
                onChange={(v) => update('idleTimeoutSec', v)}
              />
            </div>
          </div>
        </div>

        <div className="rs-st-section-label">Filesystem</div>
        <div className="rs-st-group">
          <div className="rs-st-card">
            <div className="rs-st-info">
              <span className="rs-st-label">Max entries per directory</span>
              <span className="rs-st-desc">
                Cap on entries returned by an SFTP listing — prevents UI freezes on huge folders.
              </span>
            </div>
            <div className="rs-st-control">
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
      </div>

      <div className="rs-st-foot">
        <span className="rs-st-foot-hint">
          changes save automatically · open the hosts panel with{' '}
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>
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
