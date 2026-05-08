import { useEffect, useRef } from "react";
import type { GitFile } from "../hooks/useGitStatus";

export interface FileMenuState {
  x: number;
  y: number;
  file: GitFile;
}

interface Props {
  state: FileMenuState;
  onClose: () => void;
  onRollback: (f: GitFile) => void;
}

export function FileContextMenu({ state, onClose, onRollback }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // keep menu inside viewport
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const W = 200;
  const H = 80;
  const left = Math.min(state.x, vw - W - 4);
  const top = Math.min(state.y, vh - H - 4);

  return (
    <div
      ref={ref}
      className="git-file-ctxmenu"
      role="menu"
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 9999,
        minWidth: W,
        background: "var(--c-bg-2, #1f2229)",
        color: "var(--c-fg, #e8e8ea)",
        border: "1px solid var(--c-border, #2c3038)",
        borderRadius: 6,
        padding: 4,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        fontSize: 12,
        userSelect: "none",
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="git-file-ctxmenu-item"
        onClick={() => {
          onRollback(state.file);
          onClose();
        }}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "6px 10px",
          background: "transparent",
          color: "inherit",
          border: 0,
          borderRadius: 4,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--c-bg-3, #2a2e36)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        {state.file.untracked
          ? "Rollback (delete untracked file)"
          : "Rollback (discard local changes)"}
      </button>
    </div>
  );
}
