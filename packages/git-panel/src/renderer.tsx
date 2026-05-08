import React, { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GitPanel } from "./panel/GitPanel";
import {
  DEFAULT_GIT_PANEL_SETTINGS,
  type GitPanelSettings,
} from "./types";

/**
 * Renderer entry for the git-panel extension.
 *
 * The panel stays props-shaped. The wrapper here adapts ctx → props so the
 * panel itself doesn't have to be rewritten field-by-field. AI provider
 * config flows through the `ai.binding.commit` settings entry, populated by
 * the host's auto-rendered AI binding card. Custom-mode keys come from
 * `ctx.secrets`. Core-mode requests go through `window.mt.ai`.
 */

export type AiProviderId = "anthropic" | "openai" | "ollama";

export interface AiBindingConfig {
  source: "core" | "custom";
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
}

export interface SecretsApiLite {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  onChange(cb: (key: string, present: boolean) => void): { dispose: () => void };
}

interface ExtCtx {
  id: string;
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
  panels: {
    register(p: {
      id: string;
      title: string;
      location: string;
      render: (host: HTMLElement) => void | (() => void);
    }): { dispose: () => void };
  };
  commands: {
    register(c: { id: string; title?: string; run: () => unknown }): {
      dispose: () => void;
    };
  };
  settings: {
    get<T = unknown>(key: string): T | undefined;
    set(key: string, value: unknown): void | Promise<void>;
    onChange(cb: (key: string, value: unknown) => void): { dispose: () => void };
  };
  events: {
    emit(event: string, payload?: unknown): void;
    on(event: string, cb: (payload: unknown) => void): { dispose: () => void };
  };
  tabs: {
    onChange(cb: (tabs: unknown) => void): { dispose: () => void };
  };
  workspace: { cwd(): string | null };
  secrets: SecretsApiLite;
  ui: {
    toast(opts: { kind?: "info" | "success" | "warn" | "error"; message: string }): void;
  };
  subscribe(d: { dispose: () => void } | (() => void)): void;
}

const DEFAULT_AI_BINDING: AiBindingConfig = {
  source: "core",
  provider: "anthropic",
  model: "claude-sonnet-4-5",
};

function readSettings(ctx: ExtCtx): GitPanelSettings {
  const get = <K extends keyof GitPanelSettings>(key: K): GitPanelSettings[K] => {
    const v = ctx.settings.get<GitPanelSettings[K]>(key);
    return v !== undefined ? v : DEFAULT_GIT_PANEL_SETTINGS[key];
  };
  return {
    commitSystemPrompt: get("commitSystemPrompt"),
    pullStrategy: get("pullStrategy"),
  };
}

function readBinding(ctx: ExtCtx): AiBindingConfig {
  const cfg = ctx.settings.get<AiBindingConfig>("ai.binding.commit");
  if (!cfg || typeof cfg !== "object") return DEFAULT_AI_BINDING;
  return {
    source: cfg.source === "custom" ? "custom" : "core",
    provider: cfg.provider ?? DEFAULT_AI_BINDING.provider,
    model: cfg.model || DEFAULT_AI_BINDING.model,
    baseUrl: cfg.baseUrl,
  };
}

interface DebugEntry {
  t: number;
  source: string;
  cwd: string | undefined;
  payload: unknown;
}

function GitPanelMount({ ctx }: { ctx: ExtCtx }) {
  const [cwd, setCwd] = useState<string | undefined>(() => ctx.workspace.cwd() ?? undefined);
  const [debugLog, setDebugLog] = useState<DebugEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState<boolean>(true);
  const pushDebug = (source: string, payload?: unknown) => {
    const entry: DebugEntry = { t: Date.now(), source, cwd: ctx.workspace.cwd() ?? undefined, payload };
    setDebugLog((prev) => [entry, ...prev].slice(0, 30));
  };
  const [collapsed, setCollapsed] = useState<boolean>(
    () => (ctx.settings.get<boolean>("collapsed") ?? false),
  );
  const [treeView, setTreeView] = useState<boolean>(
    () => (ctx.settings.get<boolean>("treeView") ?? true),
  );
  const [height, setHeight] = useState<number>(
    () => (ctx.settings.get<number>("panelHeight") ?? 240),
  );
  const [msgHeight, setMsgHeight] = useState<number>(
    () => (ctx.settings.get<number>("messageHeight") ?? 60),
  );
  const [settings, setSettings] = useState<GitPanelSettings>(() => readSettings(ctx));
  const [binding, setBinding] = useState<AiBindingConfig>(() => readBinding(ctx));

  useEffect(() => {
    pushDebug("mount", { initialCwd: ctx.workspace.cwd() });
    const syncCwd = (source: string, payload?: unknown) => {
      const next = ctx.workspace.cwd() ?? undefined;
      pushDebug(source, payload);
      setCwd((prev) => (prev === next ? prev : next));
    };
    const probeEvents = [
      "app:ready",
      "app:terminal:created",
      "app:terminal:exit",
      "app:tab:created",
      "app:tab:closed",
      "app:tab:focused",
      "app:settings:changed",
      "app:theme:changed",
      "app:cwd:changed",
    ];
    const offProbes = probeEvents.map((name) =>
      ctx.events.on(name, (p) => {
        pushDebug(`event:${name}`, p);
        if (name === "app:tab:focused" || name === "app:cwd:changed") syncCwd(name, p);
      }),
    );
    const offTabs = ctx.tabs.onChange((p) => syncCwd("tabs.onChange", p));
    const offSettings = ctx.settings.onChange(() => {
      setSettings(readSettings(ctx));
      setBinding(readBinding(ctx));
      setCollapsed(ctx.settings.get<boolean>("collapsed") ?? false);
      setTreeView(ctx.settings.get<boolean>("treeView") ?? true);
      setHeight(ctx.settings.get<number>("panelHeight") ?? 240);
      setMsgHeight(ctx.settings.get<number>("messageHeight") ?? 60);
    });
    return () => {
      offProbes.forEach((d) => d.dispose());
      offTabs.dispose();
      offSettings.dispose();
    };
  }, [ctx]);

  return (
    <>
    <DebugOverlay
      cwd={cwd}
      log={debugLog}
      open={debugOpen}
      onToggle={() => setDebugOpen((v) => !v)}
      onClear={() => setDebugLog([])}
      onProbe={() => pushDebug("manual-probe", { workspaceCwd: ctx.workspace.cwd() })}
    />
    <GitPanel
      cwd={cwd}
      collapsed={collapsed}
      onToggleCollapsed={(b) => {
        setCollapsed(b);
        void ctx.settings.set("collapsed", b);
      }}
      treeView={treeView}
      onToggleTreeView={(b) => {
        setTreeView(b);
        void ctx.settings.set("treeView", b);
      }}
      settings={settings}
      binding={binding}
      secrets={ctx.secrets}
      height={height}
      onResizeHeight={(h) => {
        setHeight(h);
        void ctx.settings.set("panelHeight", h);
      }}
      msgHeight={msgHeight}
      onResizeMsgHeight={(h) => {
        setMsgHeight(h);
        void ctx.settings.set("messageHeight", h);
      }}
      onUpdatePullStrategy={(s) => {
        void ctx.settings.set("pullStrategy", s);
        setSettings((p) => ({ ...p, pullStrategy: s }));
      }}
    />
    </>
  );
}

function DebugOverlay({
  cwd,
  log,
  open,
  onToggle,
  onClear,
  onProbe,
}: {
  cwd: string | undefined;
  log: DebugEntry[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  onProbe: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fmt = (t: number) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  };
  const safe = (v: unknown) => {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };
  const copyLogs = async () => {
    const text = [
      `cwd=${cwd ?? "—"}`,
      ...log
        .slice()
        .reverse()
        .map((e) => `${fmt(e.t)} ${e.source} cwd=${e.cwd ?? "—"} ${e.payload !== undefined ? safe(e.payload) : ""}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div
      style={{
        position: "fixed",
        right: 8,
        bottom: 8,
        zIndex: 99999,
        width: open ? 420 : 180,
        maxHeight: open ? 320 : 30,
        overflow: "hidden",
        background: "rgba(20,20,28,0.95)",
        color: "#e3e3e6",
        font: "11px ui-monospace, monospace",
        border: "1px solid #444",
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          background: "#2a2a36",
          cursor: "pointer",
        }}
      >
        <span style={{ flex: 1 }} onClick={onToggle}>
          [git-panel debug] cwd={cwd ?? "—"}
        </span>
        <button
          style={{ font: "11px ui-monospace, monospace", padding: "0 6px" }}
          onClick={(e) => {
            e.stopPropagation();
            onProbe();
          }}
        >
          probe
        </button>
        <button
          style={{ font: "11px ui-monospace, monospace", padding: "0 6px" }}
          onClick={(e) => {
            e.stopPropagation();
            void copyLogs();
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
        <button
          style={{ font: "11px ui-monospace, monospace", padding: "0 6px" }}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          clear
        </button>
        <button
          style={{ font: "11px ui-monospace, monospace", padding: "0 6px" }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {open ? "hide" : "show"}
        </button>
      </div>
      {open && (
        <div style={{ overflowY: "auto", maxHeight: 280, padding: "4px 8px" }}>
          {log.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no events yet — switch tabs/groups)</div>
          ) : (
            log.map((e, i) => (
              <div key={i} style={{ borderBottom: "1px solid #333", padding: "2px 0" }}>
                <div style={{ color: "#9bb6ff" }}>
                  {fmt(e.t)} <strong>{e.source}</strong>
                </div>
                <div>cwd: {e.cwd ?? "—"}</div>
                {e.payload !== undefined && (
                  <div style={{ opacity: 0.7, wordBreak: "break-all" }}>{safe(e.payload)}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function activate(ctx: ExtCtx): void {
  ctx.logger.info("git-panel activated");

  let root: Root | null = null;

  const panel = ctx.panels.register({
    id: "git-panel",
    title: "Git",
    location: "sidebar.bottom",
    render: (host) => {
      root = createRoot(host);
      root.render(<GitPanelMount ctx={ctx} />);
      return () => {
        root?.unmount();
        root = null;
      };
    },
  });
  ctx.subscribe(panel);

  const refresh = ctx.commands.register({
    id: "gitPanel.refresh",
    title: "Git: Refresh status",
    run: () => {
      ctx.events.emit("refresh-requested");
    },
  });
  ctx.subscribe(refresh);
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically */
}
