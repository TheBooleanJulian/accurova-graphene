// Context menu, toasts, status bar and the start screen.
import { useEffect, useState } from "react";
import { findById, isLockedInTree } from "../model/tree.ts";
import { storageEstimate } from "../persist/db.ts";
import { formatBytes } from "../persist/sniff.ts";
import {
  editMask,
  startMaskTool,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  openSample,
  pasteClipboard,
  reorderSelection,
  sampleAssetsAvailable,
  setFlag,
  ungroupSelection,
} from "../store/actions.ts";
import { setState, useEditor } from "../store/editor.ts";
import { ProjectList } from "./Dialogs.tsx";
import { Icon } from "./Icon.tsx";
import { pickFileForFrame } from "./filePicker.ts";
import { importProjectFile } from "./TopBar.tsx";

export function ContextMenu() {
  const menu = useEditor((s) => s.contextMenu);
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  useEffect(() => {
    if (!menu) return;
    const close = () => setState({ contextMenu: null });
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);
  if (!menu || !doc) return null;
  const els = selection.map((id) => findById(doc.elements, id)).filter((e) => !!e);
  const single = els.length === 1 ? els[0]! : null;
  const anyLocked = els.some((e) => isLockedInTree(doc.elements, e!.id));
  const item = (label: string, fn: () => void, opts: { kbd?: string; disabled?: boolean } = {}) => (
    <button
      role="menuitem"
      disabled={opts.disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        setState({ contextMenu: null });
        fn();
      }}
    >
      {label}
      {opts.kbd && <span className="kbd">{opts.kbd}</span>}
    </button>
  );
  const x = Math.min(menu.x, window.innerWidth - 240);
  const y = Math.min(menu.y, window.innerHeight - 420);
  return (
    <div className="menu ctx-menu" role="menu" style={{ left: x, top: y }} data-testid="context-menu">
      {els.length === 0 ? (
        item("Paste", () => pasteClipboard(), { kbd: "Ctrl+V" })
      ) : (
        <>
          {single?.type === "text" && item("Edit text", () => setState({ editingTextId: single.id }), { kbd: "Enter", disabled: anyLocked })}
          {single?.type === "image" && single.assetId && item("Crop / reposition", () => setState({ cropId: single.id }), { kbd: "Enter", disabled: anyLocked })}
          {single?.type === "image" && single.assetId && item(single.mask ? "Edit mask" : "Add mask", () => (single.mask ? editMask(single.id) : startMaskTool(single.id, "polygon")), { disabled: anyLocked })}
          {single?.type === "image" && item(single.assetId ? "Replace image…" : "Choose image…", () => void pickFileForFrame(single.id), { disabled: anyLocked })}
          {single?.type === "group" && item("Edit inside group", () => setState({ enteredGroup: single.id, selection: [] }), { kbd: "Enter" })}
          <hr />
          {item("Cut", cutSelection, { kbd: "Ctrl+X", disabled: anyLocked })}
          {item("Copy", copySelection, { kbd: "Ctrl+C" })}
          {item("Paste", () => pasteClipboard(), { kbd: "Ctrl+V" })}
          {item("Duplicate", duplicateSelection, { kbd: "Ctrl+D" })}
          {item("Delete", deleteSelection, { kbd: "Del", disabled: anyLocked })}
          <hr />
          {item("Bring to front", () => reorderSelection("front"), { kbd: "Ctrl+Shift+]" })}
          {item("Bring forward", () => reorderSelection("forward"), { kbd: "Ctrl+]" })}
          {item("Send backward", () => reorderSelection("backward"), { kbd: "Ctrl+[" })}
          {item("Send to back", () => reorderSelection("back"), { kbd: "Ctrl+Shift+[" })}
          <hr />
          {els.length > 1 && item("Group", groupSelection, { kbd: "Ctrl+G", disabled: anyLocked })}
          {els.some((e) => e!.type === "group") && item("Ungroup", ungroupSelection, { kbd: "Ctrl+Shift+G", disabled: anyLocked })}
          {item(els.every((e) => e!.locked) ? "Unlock" : "Lock", () => setFlag(selection, "locked", !els.every((e) => e!.locked)), { kbd: "Ctrl+Shift+L" })}
          {item("Hide", () => setFlag(selection, "visible", false), { kbd: "Ctrl+Shift+H" })}
        </>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`alert alert--${t.kind}`} role={t.kind === "danger" ? "alert" : "status"}>
          <span className="alert__icon">{t.kind === "success" ? "✓" : t.kind === "danger" ? "x" : t.kind === "warning" ? "!" : "i"}</span>
          <div>
            <div className="alert__title">{t.title}</div>
            {t.body && <div className="alert__body">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusBar() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const busy = useEditor((s) => s.busy);
  const zoom = useEditor((s) => s.view.zoom);
  const save = useEditor((s) => s.save);
  const [usage, setUsage] = useState("");
  useEffect(() => {
    void storageEstimate().then((e) => e && setUsage(`${formatBytes(e.usage)} stored`));
  }, [save.savedAt]);
  const single = doc && selection.length === 1 ? findById(doc.elements, selection[0]) : null;
  return (
    <footer className="statusbar" data-testid="statusbar">
      {busy ? (
        <span>
          <span className="live-dot" />
          {busy}
        </span>
      ) : single ? (
        <span>
          {single.name} · {Math.round(single.x)}, {Math.round(single.y)} · {Math.round(single.width)} × {Math.round(single.height)}
          {single.rotation ? ` · ${Math.round(single.rotation)}°` : ""}
        </span>
      ) : selection.length > 1 ? (
        <span>{selection.length} layers selected</span>
      ) : (
        <span>{doc ? "Nothing selected" : "Ready"}</span>
      )}
      <span className="statusbar__spacer" />
      {doc && (
        <>
          <span>
            {doc.project.width} × {doc.project.height} px
          </span>
          <span>{Math.round(zoom * 100)}%</span>
          <span>{doc.assets.length} assets</span>
        </>
      )}
      <span>{usage}</span>
      <span>Local only · no AI calls</span>
    </footer>
  );
}

export function Welcome() {
  const [bundled, setBundled] = useState(false);
  useEffect(() => {
    void sampleAssetsAvailable().then((m) => setBundled(!!m));
  }, []);
  return (
    <main className="welcome">
      <div className="welcome__card">
        <div className="col" style={{ gap: "var(--space-3)" }}>
          <span className="label">Accurova Graphene</span>
          <h1>Compose with real assets</h1>
          <div className="hairline signal" />
          <p className="welcome__lead">
            A layer-based editor for marketing graphics. Your logos and photographs are placed, cropped and layered exactly as supplied, never redrawn. Everything runs and saves in this
            browser.
          </p>
        </div>
        <div className="welcome__actions">
          <button className="welcome__action" data-testid="welcome-new" onClick={() => setState({ dialog: { type: "new" } })}>
            <Icon name="file-plus" size={20} />
            <strong>New design</strong>
            <span>Banner, social or print size, or a custom canvas.</span>
          </button>
          <button className="welcome__action" data-testid="welcome-sample" onClick={() => void openSample(true)}>
            <Icon name="layout-template" size={20} />
            <strong>BNI Crescendo sample</strong>
            <span>{bundled ? "The reference banner, built from the supplied photographs." : "The reference banner; you map your own photographs to it."}</span>
          </button>
          <button className="welcome__action" data-testid="welcome-import" onClick={() => void importProjectFile()}>
            <Icon name="package" size={20} />
            <strong>Import package</strong>
            <span>Open a .graphene.zip with its original files.</span>
          </button>
        </div>
        <div className="col">
          <span className="label">Recent projects</span>
          <ProjectList />
        </div>
      </div>
    </main>
  );
}
