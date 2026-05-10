import React, { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GitPanel } from "./panel/GitPanel";
import { mountSettings } from "./settings";
import {
  DEFAULT_GIT_PANEL_SETTINGS,
  type GitPanelSettings,
} from "./types";
import type { ExtensionContext } from "@mterminal/extension-api";
import { createGitClient } from "./lib/git-client";
import { setGitClient } from "./lib/git-api";

/**
 * Renderer entry for the git-panel extension.
 *
 * The panel stays props-shaped. The wrapper here adapts ctx → props so the
 * panel itself doesn't have to be rewritten field-by-field.
 *
 * The AI side is unified through `ctx.ai.stream()`. The host's
 * `<AiBindingCard>` auto-renders provider + model picking inside
 * Settings → Extensions → Git Panel.
 *
 * Two source modes:
 *   • "core"   — use the global vault key from Settings → AI.
 *   • "custom" — read a per-binding key from `ctx.secrets` and pass it as
 *     `apiKey` to `ctx.ai.stream()`; the host instantiates an ad-hoc SDK
 *     client for that call only and falls back to the global key when no
 *     override is supplied.
 */

export interface AiBindingConfig {
  source: "core" | "custom";
  provider: string;
  model: string;
  baseUrl?: string;
}

const DEFAULT_AI_BINDING: AiBindingConfig = {
  source: "core",
  provider: "",
  model: "",
};

function readSettings(ctx: ExtensionContext): GitPanelSettings {
  const get = <K extends keyof GitPanelSettings>(key: K): GitPanelSettings[K] => {
    const v = ctx.settings.get<GitPanelSettings[K]>(key);
    return v !== undefined ? v : DEFAULT_GIT_PANEL_SETTINGS[key];
  };
  return {
    commitSystemPrompt: get("commitSystemPrompt"),
    pullStrategy: get("pullStrategy"),
  };
}

function readBinding(ctx: ExtensionContext): AiBindingConfig {
  const cfg = ctx.settings.get<Partial<AiBindingConfig> & {
    source?: unknown;
    provider?: unknown;
    model?: unknown;
  }>("ai.binding.commit");
  if (!cfg || typeof cfg !== "object") return DEFAULT_AI_BINDING;
  return {
    source: cfg.source === "custom" ? "custom" : "core",
    provider: typeof cfg.provider === "string" ? cfg.provider : DEFAULT_AI_BINDING.provider,
    model: typeof cfg.model === "string" ? cfg.model : DEFAULT_AI_BINDING.model,
    baseUrl: typeof cfg.baseUrl === "string" ? cfg.baseUrl : undefined,
  };
}

function GitPanelMount({ ctx }: { ctx: ExtensionContext }) {
  const [cwd, setCwd] = useState<string | undefined>(() => ctx.workspace.cwd() ?? undefined);
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
    const syncCwd = () => {
      const next = ctx.workspace.cwd() ?? undefined;
      setCwd((prev) => (prev === next ? prev : next));
    };
    const offCwd = ctx.events.on("app:cwd:changed", syncCwd);
    const offFocus = ctx.events.on("app:tab:focused", syncCwd);
    const offSettings = ctx.settings.onChange(() => {
      setSettings(readSettings(ctx));
      setBinding(readBinding(ctx));
      setCollapsed(ctx.settings.get<boolean>("collapsed") ?? false);
      setTreeView(ctx.settings.get<boolean>("treeView") ?? true);
      setHeight(ctx.settings.get<number>("panelHeight") ?? 240);
      setMsgHeight(ctx.settings.get<number>("messageHeight") ?? 60);
    });
    return () => {
      offCwd.dispose();
      offFocus.dispose();
      offSettings.dispose();
    };
  }, [ctx]);

  return (
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
      ai={ctx.ai}
      secrets={ctx.secrets}
      ui={ctx.ui}
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
  );
}

export function activate(ctx: ExtensionContext): void {
  ctx.logger.info("git-panel activated");

  const client = createGitClient(ctx);
  setGitClient(client);
  ctx.subscribe({ dispose: () => setGitClient(null) });
  ctx.subscribe(ctx.providedServices.publish("git", client));

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

  ctx.subscribe(
    ctx.settingsRenderer.register({
      render: (host, rctx) => mountSettings(host, rctx.settings),
    }),
  );
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically */
}
