// Editor state: one module-level store read through useEditor(selector).
//
// The document is changed only through commit(), which runs a pure operation,
// re-derives text heights and group bounds, records undo history and schedules
// an autosave. Pointer gestures (drag, resize, rotate) open a transaction so a
// whole drag becomes one undo step.
import { useSyncExternalStore } from "react";
import { emptyHistory, record, redo as historyRedo, undo as historyUndo, type History } from "../model/history.ts";
import { syncDerived } from "../model/ops.ts";
import { allIds } from "../model/tree.ts";
import type { GrapheneDocument } from "../model/types.ts";
import { nowIso } from "../model/defaults.ts";
import { canvasMeasure } from "../render/measure.ts";
import { ensureFonts, needsFonts } from "../render/fonts.ts";
import { saveDoc, saveThumb } from "../persist/db.ts";
import { renderThumbnail } from "../export/export.ts";
import { resolveProxy } from "../render/imageCache.ts";

export type LeftTab = "templates" | "uploads" | "text" | "shapes" | "icons" | "background";
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type Dialog =
  | { type: "new" }
  | { type: "open" }
  | { type: "export" }
  | { type: "slots" }
  | { type: "shortcuts" }
  | { type: "confirm"; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

export interface Toast {
  id: number;
  kind: "info" | "success" | "warning" | "danger";
  title: string;
  body?: string;
}

export type MaskTool = "rect" | "ellipse" | "polygon" | "lasso";

/** Mask editing on one image: either drawing a new shape with a tool, or editing the existing mask's points. */
export interface MaskEdit {
  id: string;
  tool: MaskTool;
  drawing: boolean;
}

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export interface EditorState {
  doc: GrapheneDocument | null;
  history: History<GrapheneDocument>;
  gestureBase: GrapheneDocument | null;
  selection: string[];
  /** Group the user has double-clicked into: clicks then select its children. */
  enteredGroup: string | null;
  hoverId: string | null;
  view: View;
  viewport: { width: number; height: number };
  editingTextId: string | null;
  cropId: string | null;
  maskEdit: MaskEdit | null;
  /** Shape being drawn, in normalised source coordinates of the image. */
  maskDraft: { x: number; y: number }[] | null;
  guides: { xs: number[]; ys: number[] };
  showGrid: boolean;
  snapping: boolean;
  preview: boolean;
  save: { status: SaveStatus; savedAt: number | null; error: string | null };
  leftTab: LeftTab;
  dialog: Dialog | null;
  toasts: Toast[];
  /** Bumped when fonts or images finish loading so the canvas redraws. */
  renderTick: number;
  contextMenu: { x: number; y: number } | null;
  busy: string | null;
}

let state: EditorState = {
  doc: null,
  history: emptyHistory(),
  gestureBase: null,
  selection: [],
  enteredGroup: null,
  hoverId: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  viewport: { width: 800, height: 600 },
  editingTextId: null,
  cropId: null,
  maskEdit: null,
  maskDraft: null,
  guides: { xs: [], ys: [] },
  showGrid: false,
  snapping: true,
  preview: false,
  save: { status: "idle", savedAt: null, error: null },
  leftTab: "templates",
  dialog: null,
  toasts: [],
  renderTick: 0,
  contextMenu: null,
  busy: null,
};

const listeners = new Set<() => void>();

export function getState(): EditorState {
  return state;
}

export function setState(patch: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)): void {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Subscribe a component to a slice of state. Selectors must return stable references or primitives. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------------------------------------------------------------------------
// Document changes

export interface CommitOptions {
  /** Collapse rapid edits with the same key into one undo step. */
  merge?: string;
  selection?: string[];
}

function derive(doc: GrapheneDocument): GrapheneDocument {
  const d = syncDerived(doc, canvasMeasure);
  if (needsFonts(d)) void loadFontsFor(d);
  return d;
}

async function loadFontsFor(doc: GrapheneDocument): Promise<void> {
  if (await ensureFonts(doc)) {
    const current = state.doc;
    if (!current) return;
    // Re-measure with the real fonts. Not an undoable change: it only corrects derived heights.
    setState((s) => ({ doc: current ? syncDerived(current, canvasMeasure) : s.doc, renderTick: s.renderTick + 1 }));
  }
}

/** Apply a pure operation to the document. Returns true if anything changed. */
export function commit(fn: (doc: GrapheneDocument) => GrapheneDocument, opts: CommitOptions = {}): boolean {
  const doc = state.doc;
  if (!doc) return false;
  const changed = fn(doc);
  if (changed === doc) {
    if (opts.selection) setState({ selection: opts.selection });
    return false;
  }
  const next = derive(changed);
  const history = state.gestureBase ? state.history : record(state.history, doc, opts.merge ?? null);
  const ids = allIds(next.elements);
  setState({
    doc: next,
    history,
    selection: (opts.selection ?? state.selection).filter((id) => ids.has(id)),
  });
  scheduleSave();
  return true;
}

export function beginGesture(): void {
  if (state.doc && !state.gestureBase) setState({ gestureBase: state.doc });
}

/** Finish a gesture: one undo step if anything changed. */
export function endGesture(): void {
  const base = state.gestureBase;
  if (!base) return;
  setState({
    gestureBase: null,
    guides: { xs: [], ys: [] },
    history: state.doc !== base ? record(state.history, base, null) : state.history,
  });
}

export function cancelGesture(): void {
  const base = state.gestureBase;
  if (!base) return;
  setState({ doc: base, gestureBase: null, guides: { xs: [], ys: [] } });
}

function restore(doc: GrapheneDocument, history: History<GrapheneDocument>): void {
  const d = derive(doc);
  const ids = allIds(d.elements);
  setState({
    doc: d,
    history,
    selection: state.selection.filter((id) => ids.has(id)),
    editingTextId: null,
    cropId: null,
    maskDraft: null,
    maskEdit: state.maskEdit && ids.has(state.maskEdit.id) ? { ...state.maskEdit, drawing: false } : null,
  });
  scheduleSave();
}

export function undo(): void {
  if (!state.doc || state.gestureBase) return;
  const r = historyUndo(state.history, state.doc);
  if (r) restore(r.value, r.history);
}

export function redo(): void {
  if (!state.doc || state.gestureBase) return;
  const r = historyRedo(state.history, state.doc);
  if (r) restore(r.value, r.history);
}

/** Load a document into the editor (fresh history, fitted view). */
export function openDocument(doc: GrapheneDocument): void {
  flushSaveSoon();
  setState({
    doc: derive(doc),
    history: emptyHistory(),
    gestureBase: null,
    selection: [],
    enteredGroup: null,
    editingTextId: null,
    cropId: null,
    maskEdit: null,
    maskDraft: null,
    dialog: null,
    preview: false,
    save: { status: "saved", savedAt: Date.now(), error: null },
  });
  try {
    localStorage.setItem("graphene:last-project", doc.project.id);
  } catch {
    // storage unavailable (private mode); remembering the last project is only a convenience
  }
  fitToScreen();
}

// ---------------------------------------------------------------------------
// Autosave

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let pendingAfterSave = false;
let lastThumbAt = 0;

function scheduleSave(): void {
  if (state.save.status !== "dirty") setState({ save: { ...state.save, status: "dirty" } });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), 700);
}

function flushSaveSoon(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    void flushSave();
  }
}

export async function flushSave(): Promise<void> {
  saveTimer = null;
  const doc = state.doc;
  if (!doc) return;
  if (saving) {
    pendingAfterSave = true;
    return;
  }
  saving = true;
  setState({ save: { ...state.save, status: "saving" } });
  try {
    await saveDoc({ ...doc, project: { ...doc.project, updatedAt: nowIso() } });
    const stillCurrent = state.doc === doc;
    setState({ save: { status: stillCurrent ? "saved" : "dirty", savedAt: Date.now(), error: null } });
    if (Date.now() - lastThumbAt > 8000) {
      lastThumbAt = Date.now();
      try {
        const assets = new Map(doc.assets.map((a) => [a.id, a]));
        const url = renderThumbnail(doc, (el) => {
          const a = el.assetId ? assets.get(el.assetId) : undefined;
          return a ? resolveProxy(a) : null;
        });
        await saveThumb(doc.project.id, url);
      } catch {
        // thumbnails are cosmetic
      }
    }
  } catch (err) {
    setState({
      save: {
        status: "error",
        savedAt: state.save.savedAt,
        error: err instanceof Error ? err.message : "Could not save to browser storage.",
      },
    });
  } finally {
    saving = false;
    if (pendingAfterSave || state.save.status === "dirty") {
      pendingAfterSave = false;
      scheduleSave();
    }
  }
}

export function hasUnsavedChanges(): boolean {
  return state.save.status === "dirty" || state.save.status === "saving" || state.save.status === "error";
}

// ---------------------------------------------------------------------------
// View

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export function fitToScreen(): void {
  const doc = state.doc;
  if (!doc) return;
  const { width, height } = state.viewport;
  const pad = 56;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((width - pad * 2) / doc.project.width, (height - pad * 2) / doc.project.height)));
  setState({
    view: {
      zoom,
      panX: (width - doc.project.width * zoom) / 2,
      panY: (height - doc.project.height * zoom) / 2,
    },
  });
}

/** Zoom keeping the document point under `screen` (viewport px) fixed. */
export function zoomAt(zoom: number, screen?: { x: number; y: number }): void {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const v = state.view;
  const sp = screen ?? { x: state.viewport.width / 2, y: state.viewport.height / 2 };
  const docX = (sp.x - v.panX) / v.zoom;
  const docY = (sp.y - v.panY) / v.zoom;
  setState({ view: { zoom: z, panX: sp.x - docX * z, panY: sp.y - docY * z } });
}

export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

export function zoomStep(direction: 1 | -1): void {
  const z = state.view.zoom;
  const next = direction > 0 ? ZOOM_STEPS.find((s) => s > z + 1e-3) ?? MAX_ZOOM : [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-3) ?? MIN_ZOOM;
  zoomAt(next);
}

// ---------------------------------------------------------------------------
// Notifications

let toastId = 0;
export function toast(kind: Toast["kind"], title: string, body?: string, ms = kind === "danger" ? 9000 : 5000): void {
  const t = { id: ++toastId, kind, title, body };
  setState((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), ms);
}

export function bumpRender(): void {
  setState((s) => ({ renderTick: s.renderTick + 1 }));
}
