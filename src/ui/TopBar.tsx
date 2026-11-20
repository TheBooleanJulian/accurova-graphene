import { useEffect, useRef, useState } from "react";
import { newId, nowIso } from "../model/defaults.ts";
import { saveDoc } from "../persist/db.ts";
import { PACKAGE_EXTENSION, buildPackage, importPackage, readProjectJson } from "../persist/package.ts";
import { commit, flushSave, getState, openDocument, redo, setState, toast, undo, useEditor, zoomAt, zoomStep, fitToScreen } from "../store/editor.ts";
import { Icon } from "./Icon.tsx";
import { downloadBlob, pickFiles } from "./filePicker.ts";

export function toggleTheme(): void {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("graphene:theme", next);
  } catch {
    // remembering the theme is a convenience only
  }
}

export async function duplicateProject(): Promise<void> {
  const doc = getState().doc;
  if (!doc) return;
  await flushSave();
  const t = nowIso();
  const copy = { ...doc, project: { ...doc.project, id: newId("project"), name: `${doc.project.name} copy`, createdAt: t, updatedAt: t } };
  await saveDoc(copy);
  openDocument(copy);
  toast("success", "Project duplicated", "You are now editing the copy. Original files are shared, not copied.");
}

export async function importProjectFile(): Promise<void> {
  const [file] = await pickFiles(".zip,.json,application/zip,application/json", false);
  if (!file) return;
  setState({ busy: `Importing ${file.name}` });
  try {
    const r = file.name.toLowerCase().endsWith(".json") ? await readProjectJson(file) : await importPackage(file);
    await saveDoc(r.doc);
    openDocument(r.doc);
    if (r.warnings.length) toast("warning", "Imported with warnings", r.warnings.slice(0, 4).join(" "));
    else toast("success", `Imported ${r.doc.project.name}`, `${r.doc.assets.length} original files verified against their checksums.`);
  } catch (err) {
    toast("danger", "Could not import this file", err instanceof Error ? err.message : String(err));
  } finally {
    setState({ busy: null });
  }
}

export async function exportProjectPackage(): Promise<void> {
  const doc = getState().doc;
  if (!doc) return;
  setState({ busy: "Packaging project" });
  try {
    const { blob, missing } = await buildPackage(doc);
    const base = doc.project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "graphene-project";
    downloadBlob(blob, `${base}${PACKAGE_EXTENSION}`);
    if (missing.length) toast("warning", "Package is incomplete", `Missing originals: ${missing.join(", ")}`);
    else toast("success", "Project package saved", `project.json plus ${doc.assets.length} original files.`);
  } catch (err) {
    toast("danger", "Could not package the project", err instanceof Error ? err.message : String(err));
  } finally {
    setState({ busy: null });
  }
}

function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasSlots = useEditor((s) => (s.doc?.slots.length ?? 0) > 0);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn btn--ghost btn--sm" aria-haspopup="menu" aria-expanded={open} data-testid="project-menu" onClick={() => setOpen((o) => !o)}>
        Project <Icon name="chevron-down" size={12} />
      </button>
      {open && (
        <div className="menu" role="menu" style={{ top: 30, left: 0 }}>
          <button role="menuitem" onClick={run(() => setState({ dialog: { type: "new" } }))}>
            New design… <span className="kbd">Ctrl+Alt+N</span>
          </button>
          <button role="menuitem" data-testid="menu-open" onClick={run(() => setState({ dialog: { type: "open" } }))}>
            Open… <span className="kbd">Ctrl+O</span>
          </button>
          <button role="menuitem" onClick={run(() => void duplicateProject())}>
            Duplicate project
          </button>
          <hr />
          <button role="menuitem" data-testid="menu-import" onClick={run(() => void importProjectFile())}>
            Import package…
          </button>
          <button role="menuitem" data-testid="menu-package" onClick={run(() => void exportProjectPackage())}>
            Export project package
          </button>
          {hasSlots && (
            <button role="menuitem" onClick={run(() => setState({ dialog: { type: "slots" } }))}>
              Map template slots…
            </button>
          )}
          <hr />
          <button role="menuitem" onClick={run(() => setState({ dialog: { type: "shortcuts" } }))}>
            Keyboard shortcuts <span className="kbd">?</span>
          </button>
          <button role="menuitem" onClick={run(toggleTheme)}>
            Switch light / dark
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const zoom = useEditor((s) => s.view.zoom);
  const showGrid = useEditor((s) => s.showGrid);
  const snapping = useEditor((s) => s.snapping);
  const save = useEditor((s) => s.save);
  const [name, setName] = useState(doc?.project.name ?? "");
  useEffect(() => setName(doc?.project.name ?? ""), [doc?.project.name]);

  const saveLabel = { idle: "", dirty: "Unsaved changes", saving: "Saving…", saved: "Saved locally", error: "Save failed" }[save.status];
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true" />
        <div className="col" style={{ gap: 2 }}>
          <span className="brand__name">Graphene</span>
          <span className="brand__sub">Accurova</span>
        </div>
      </div>
      {doc && (
        <>
          <span className="topbar__sep" />
          <input
            className="input topbar__name"
            value={name}
            aria-label="Project name"
            data-testid="project-name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const n = name.trim() || "Untitled design";
              if (n !== doc.project.name) commit((d) => ({ ...d, project: { ...d.project, name: n } }));
              setName(n);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <span className={`mono-sm save--${save.status}`} data-testid="save-status" title={save.error ?? undefined}>
            {save.status === "saved" ? "✓ " : save.status === "error" ? "x " : ""}
            {saveLabel}
          </span>
        </>
      )}
      <ProjectMenu />
      {doc && (
        <>
          <span className="topbar__sep" />
          <button className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo" data-testid="undo" disabled={!canUndo} onClick={undo}>
            <Icon name="undo-2" />
          </button>
          <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" data-testid="redo" disabled={!canRedo} onClick={redo}>
            <Icon name="redo-2" />
          </button>
          <span className="topbar__sep" />
          <button className="icon-btn" title="Zoom out (Ctrl+-)" aria-label="Zoom out" onClick={() => zoomStep(-1)}>
            <Icon name="zoom-out" />
          </button>
          <button className="zoom-label" title="Reset to 100% (Ctrl+1)" data-testid="zoom-label" onClick={() => zoomAt(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="icon-btn" title="Zoom in (Ctrl+=)" aria-label="Zoom in" onClick={() => zoomStep(1)}>
            <Icon name="zoom-in" />
          </button>
          <button className="icon-btn" title="Fit to screen (Ctrl+0)" aria-label="Fit to screen" data-testid="fit" onClick={fitToScreen}>
            <Icon name="maximize" />
          </button>
          <span className="topbar__sep" />
          <button className="icon-btn" title="Grid" aria-label="Show grid" aria-pressed={showGrid} onClick={() => setState({ showGrid: !showGrid })}>
            <Icon name="grid-3x3" />
          </button>
          <button className="icon-btn" title="Snapping and smart guides (hold Ctrl while dragging to bypass)" aria-label="Snapping" aria-pressed={snapping} onClick={() => setState({ snapping: !snapping })}>
            <Icon name="magnet" />
          </button>
        </>
      )}
      <span className="topbar__spacer" />
      {doc && (
        <>
          <button className="btn btn--ghost" data-testid="preview" onClick={() => setState({ preview: true, selection: [], editingTextId: null, cropId: null })}>
            <Icon name="play" /> Preview
          </button>
          <button className="btn btn--primary" data-testid="export" onClick={() => setState({ dialog: { type: "export" } })}>
            <Icon name="download" /> Export
          </button>
        </>
      )}
    </header>
  );
}
