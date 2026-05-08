import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_GIT_PANEL_SETTINGS,
  type GitPanelSettings,
  type PullStrategy,
} from "./types";

interface SettingsApi {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void | Promise<void>;
  onChange(cb: (key: string, value: unknown) => void): { dispose(): void };
}

interface PanelStateSettings {
  treeView: boolean;
  collapsed: boolean;
  panelHeight: number;
  messageHeight: number;
}

const PANEL_DEFAULTS: PanelStateSettings = {
  treeView: true,
  collapsed: false,
  panelHeight: 240,
  messageHeight: 60,
};

const STYLE_ID = "git-panel-settings-styles";
const CSS = `
.gp-st {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
  background: var(--bg-base);
  container-type: inline-size;
  container-name: gp-st;
}
.gp-st-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.gp-st-head-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.gp-st-title {
  font-weight: 600;
  font-size: var(--t-md);
  letter-spacing: -0.01em;
}
.gp-st-subtitle {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  letter-spacing: 0.02em;
}
.gp-st-count {
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
.gp-st-spacer { flex: 1; }
@container gp-st (max-width: 520px) {
  .gp-st-subtitle { display: none; }
  .gp-st-head { padding: 10px 12px; }
  .gp-st-body { padding: 10px 12px 12px; }
  .gp-st-foot { padding: 10px 12px; }
}
.gp-st-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  container-type: inline-size;
  container-name: gp-st-body;
}
.gp-st-body::-webkit-scrollbar { width: 10px; }
.gp-st-body::-webkit-scrollbar-track { background: transparent; }
.gp-st-body::-webkit-scrollbar-thumb {
  background: var(--n-300, var(--border));
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 5px;
}
.gp-st-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-dim);
  font-weight: 600;
  padding: 4px 2px 0;
}
.gp-st-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gp-st-card {
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
.gp-st-card.stack {
  grid-template-columns: 1fr;
  align-items: stretch;
}
.gp-st-card:hover { border-color: var(--border); }
@container gp-st-body (max-width: 520px) {
  .gp-st-card {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .gp-st-control { justify-self: start; }
}
.gp-st-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.gp-st-label {
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--fg);
  letter-spacing: -0.005em;
}
.gp-st-desc {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  line-height: 1.5;
}
.gp-st-control {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}
.gp-st-input {
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
.gp-st-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 24%, transparent);
}
.gp-st-input.invalid {
  border-color: var(--err);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--err) 24%, transparent);
}
.gp-st-suffix {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
}
.gp-st-textarea {
  width: 100%;
  background: var(--bg-base);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 4px);
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  line-height: 1.5;
  outline: none;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.gp-st-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 24%, transparent);
}
.gp-st-textarea::placeholder { color: var(--fg-dim); }
.gp-st-segmented {
  display: inline-flex;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 4px);
  padding: 2px;
  gap: 2px;
}
.gp-st-seg {
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
.gp-st-seg:hover { color: var(--fg-muted); }
.gp-st-seg.active {
  background: var(--bg-active);
  color: var(--fg);
}
.gp-st-seg-icon {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.85;
}
.gp-st-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--bg-base);
}
.gp-st-foot-hint {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  font-family: var(--font-mono);
}
.gp-st-foot-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  margin: 0 1px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 3px;
  font-size: 10px;
  background: var(--bg-raised, var(--bg-base));
}
.gp-st-btn {
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
.gp-st-btn:hover { background: var(--bg-hover); border-color: var(--fg-dim); }
`;

function ensureStyles(): void {
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function readAll(api: SettingsApi): GitPanelSettings & PanelStateSettings {
  const get = <T,>(key: string, fallback: T): T => {
    const v = api.get<T>(key);
    return v !== undefined && v !== null ? v : fallback;
  };
  return {
    pullStrategy: get("pullStrategy", DEFAULT_GIT_PANEL_SETTINGS.pullStrategy),
    commitSystemPrompt: get(
      "commitSystemPrompt",
      DEFAULT_GIT_PANEL_SETTINGS.commitSystemPrompt,
    ),
    treeView: get("treeView", PANEL_DEFAULTS.treeView),
    collapsed: get("collapsed", PANEL_DEFAULTS.collapsed),
    panelHeight: get("panelHeight", PANEL_DEFAULTS.panelHeight),
    messageHeight: get("messageHeight", PANEL_DEFAULTS.messageHeight),
  };
}

function ToggleControl({
  value,
  onChange,
  offLabel = "Off",
  onLabel = "On",
}: {
  value: boolean;
  onChange(next: boolean): void;
  offLabel?: string;
  onLabel?: string;
}): React.ReactElement {
  return (
    <div className="gp-st-segmented" role="group">
      <button
        className={"gp-st-seg" + (!value ? " active" : "")}
        onClick={() => onChange(false)}
        type="button"
      >
        <span className="gp-st-seg-icon">○</span>
        {offLabel}
      </button>
      <button
        className={"gp-st-seg" + (value ? " active" : "")}
        onClick={() => onChange(true)}
        type="button"
      >
        <span className="gp-st-seg-icon">●</span>
        {onLabel}
      </button>
    </div>
  );
}

function NumberControl({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange(next: number): void;
}): React.ReactElement {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const parsed = Number(text);
  const valid =
    Number.isFinite(parsed) &&
    (min === undefined || parsed >= min) &&
    (max === undefined || parsed <= max);

  const commit = (): void => {
    if (!valid) {
      setText(String(value));
      return;
    }
    if (parsed !== value) onChange(parsed);
  };

  return (
    <>
      <input
        className={"gp-st-input" + (!valid ? " invalid" : "")}
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
      {suffix ? <span className="gp-st-suffix">{suffix}</span> : null}
    </>
  );
}

const PULL_STRATEGIES: Array<{ value: PullStrategy; label: string; icon: string }> = [
  { value: "ff-only", label: "Fast-forward", icon: "→" },
  { value: "merge", label: "Merge", icon: "⎇" },
  { value: "rebase", label: "Rebase", icon: "↻" },
];

function PullStrategyControl({
  value,
  onChange,
}: {
  value: PullStrategy;
  onChange(next: PullStrategy): void;
}): React.ReactElement {
  return (
    <div className="gp-st-segmented" role="group">
      {PULL_STRATEGIES.map((opt) => (
        <button
          key={opt.value}
          className={"gp-st-seg" + (value === opt.value ? " active" : "")}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          <span className="gp-st-seg-icon">{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingsView({ api }: { api: SettingsApi }): React.ReactElement {
  const [s, setS] = useState(() => readAll(api));

  useEffect(() => {
    const off = api.onChange(() => setS(readAll(api)));
    return () => off.dispose();
  }, [api]);

  const update = <K extends keyof (GitPanelSettings & PanelStateSettings)>(
    key: K,
    value: (GitPanelSettings & PanelStateSettings)[K],
  ): void => {
    setS((prev) => ({ ...prev, [key]: value }));
    void api.set(key, value);
  };

  const reset = (): void => {
    const all = { ...DEFAULT_GIT_PANEL_SETTINGS, ...PANEL_DEFAULTS };
    for (const k of Object.keys(all) as Array<keyof typeof all>) {
      void api.set(k, all[k]);
    }
    setS({ ...all });
  };

  return (
    <div className="gp-st">
      <div className="gp-st-head">
        <div className="gp-st-head-title">
          <span className="gp-st-title">Git Panel</span>
          <span className="gp-st-count">6</span>
        </div>
        <span className="gp-st-subtitle">commit, push/pull, history & AI commit messages</span>
        <span className="gp-st-spacer" />
        <button className="gp-st-btn" type="button" onClick={reset} title="Restore defaults">
          Reset
        </button>
      </div>

      <div className="gp-st-body">
        <div className="gp-st-section-label">Workflow</div>
        <div className="gp-st-group">
          <div className="gp-st-card">
            <div className="gp-st-info">
              <span className="gp-st-label">Pull strategy</span>
              <span className="gp-st-desc">
                How <code>git pull</code> integrates upstream changes.
                Fast-forward refuses divergent histories; merge creates a merge commit;
                rebase replays your commits on top.
              </span>
            </div>
            <div className="gp-st-control">
              <PullStrategyControl
                value={s.pullStrategy}
                onChange={(v) => update("pullStrategy", v)}
              />
            </div>
          </div>

          <div className="gp-st-card">
            <div className="gp-st-info">
              <span className="gp-st-label">Tree view</span>
              <span className="gp-st-desc">
                Group changes into a folder tree instead of a flat file list.
              </span>
            </div>
            <div className="gp-st-control">
              <ToggleControl
                value={s.treeView}
                onChange={(v) => update("treeView", v)}
                offLabel="Flat"
                onLabel="Tree"
              />
            </div>
          </div>
        </div>

        <div className="gp-st-section-label">Layout</div>
        <div className="gp-st-group">
          <div className="gp-st-card">
            <div className="gp-st-info">
              <span className="gp-st-label">Start collapsed</span>
              <span className="gp-st-desc">
                Whether the Git panel begins collapsed when the workspace opens.
              </span>
            </div>
            <div className="gp-st-control">
              <ToggleControl
                value={s.collapsed}
                onChange={(v) => update("collapsed", v)}
                offLabel="Open"
                onLabel="Collapsed"
              />
            </div>
          </div>

          <div className="gp-st-card">
            <div className="gp-st-info">
              <span className="gp-st-label">Panel height</span>
              <span className="gp-st-desc">
                Initial pixel height for the Git panel area in the sidebar.
              </span>
            </div>
            <div className="gp-st-control">
              <NumberControl
                value={s.panelHeight}
                min={120}
                max={1200}
                step={10}
                suffix="px"
                onChange={(v) => update("panelHeight", v)}
              />
            </div>
          </div>

          <div className="gp-st-card">
            <div className="gp-st-info">
              <span className="gp-st-label">Commit message height</span>
              <span className="gp-st-desc">
                Initial pixel height of the commit message textarea.
              </span>
            </div>
            <div className="gp-st-control">
              <NumberControl
                value={s.messageHeight}
                min={40}
                max={600}
                step={10}
                suffix="px"
                onChange={(v) => update("messageHeight", v)}
              />
            </div>
          </div>
        </div>

        <div className="gp-st-section-label">AI commit messages</div>
        <div className="gp-st-group">
          <div className="gp-st-card stack">
            <div className="gp-st-info">
              <span className="gp-st-label">System prompt</span>
              <span className="gp-st-desc">
                Sent to the model alongside your staged diff when you click <em>Generate</em>.
                Tweak it to lock in your team's commit conventions.
              </span>
            </div>
            <textarea
              className="gp-st-textarea"
              value={s.commitSystemPrompt}
              onChange={(e) => update("commitSystemPrompt", e.target.value)}
              spellCheck={false}
              placeholder="Write a single conventional-commit message…"
            />
          </div>
        </div>
      </div>

      <div className="gp-st-foot">
        <span className="gp-st-foot-hint">
          changes save automatically · commit with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
        </span>
      </div>
    </div>
  );
}

export function mountSettings(host: HTMLElement, api: SettingsApi): () => void {
  ensureStyles();
  const root = createRoot(host);
  root.render(<SettingsView api={api} />);
  return () => {
    try {
      root.unmount();
    } catch {
      /* ignore */
    }
  };
}
