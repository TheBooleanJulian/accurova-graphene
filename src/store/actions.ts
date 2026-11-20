// Editor actions used by the UI and keyboard shortcuts. Each one is a thin
// wrapper that picks the target elements and calls a pure model operation.
import { aabbOf, unionBoxes, type Box, type Point } from "../model/geometry.ts";
import {
  addAsset,
  addElements,
  alignElements,
  assignSlot,
  deleteElements,
  distributeElements,
  duplicateElements,
  groupElements,
  pasteElements,
  reorderElements,
  replaceImageInDoc,
  translateElements,
  ungroupElement,
  updateElements,
  type AlignMode,
  type OrderMove,
} from "../model/ops.ts";
import { createDocument, createImageElement } from "../model/defaults.ts";
import { findById, isLockedInTree, topmostSelection, walk } from "../model/tree.ts";
import type { AssetRecord, Element, GrapheneDocument } from "../model/types.ts";
import { validateDocument } from "../model/validate.ts";
import { importAssetFile } from "../persist/assets.ts";
import { loadDoc, saveDoc } from "../persist/db.ts";
import { BNI_SLOTS, SAMPLE_ASSET_BASE, buildBniCrescendo, type SampleManifest } from "../samples/bniCrescendo.ts";
import { loadIconCatalog } from "../icons/catalog.ts";
import { commit, getState, openDocument, setState, toast } from "./editor.ts";

// ---------------------------------------------------------------------------
// Selection

export function selectedElements(): Element[] {
  const { doc, selection } = getState();
  if (!doc) return [];
  return selection.map((id) => findById(doc.elements, id)).filter((e): e is Element => !!e);
}

export function select(ids: string[], mode: "replace" | "add" | "toggle" = "replace"): void {
  const current = getState().selection;
  let next: string[];
  if (mode === "replace") next = ids;
  else if (mode === "add") next = [...new Set([...current, ...ids])];
  else {
    const set = new Set(current);
    for (const id of ids) {
      if (set.has(id)) set.delete(id);
      else set.add(id);
    }
    next = [...set];
  }
  setState({ selection: next, contextMenu: null });
}

export function selectAll(): void {
  const doc = getState().doc;
  if (!doc) return;
  select(doc.elements.filter((e) => e.visible && !e.locked).map((e) => e.id));
}

/** Bounds of the current selection (or of the given ids). */
export function selectionBounds(ids = getState().selection): Box | null {
  const doc = getState().doc;
  if (!doc) return null;
  return unionBoxes(
    topmostSelection(doc.elements, ids)
      .map((id) => findById(doc.elements, id))
      .filter((e): e is Element => !!e)
      .map((e) => aabbOf(e)),
  );
}

/** Ids in the selection that are not locked (directly or through a parent). */
export function editableSelection(): string[] {
  const { doc, selection } = getState();
  if (!doc) return [];
  return topmostSelection(doc.elements, selection).filter((id) => !isLockedInTree(doc.elements, id));
}

/** Centre of the visible part of the canvas, in document coordinates. */
export function viewCenter(): Point {
  const { view, viewport, doc } = getState();
  const p = { x: (viewport.width / 2 - view.panX) / view.zoom, y: (viewport.height / 2 - view.panY) / view.zoom };
  if (!doc) return p;
  return { x: Math.min(Math.max(p.x, 0), doc.project.width), y: Math.min(Math.max(p.y, 0), doc.project.height) };
}

// ---------------------------------------------------------------------------
// Element actions

export function addAndSelect(items: Element[]): void {
  commit((d) => addElements(d, items), { selection: items.map((e) => e.id) });
}

export function deleteSelection(): void {
  const ids = editableSelection();
  if (ids.length === 0) return;
  commit((d) => deleteElements(d, ids), { selection: [] });
}

export function duplicateSelection(): void {
  const ids = topmostSelection(getState().doc?.elements ?? [], getState().selection);
  if (ids.length === 0) return;
  let newIds: string[] = [];
  commit((d) => {
    const r = duplicateElements(d, ids);
    newIds = r.newIds;
    return r.doc;
  });
  setState({ selection: newIds });
}

let clipboard: Element[] = [];
let pasteCount = 0;

export function copySelection(): void {
  const { doc, selection } = getState();
  if (!doc) return;
  clipboard = topmostSelection(doc.elements, selection)
    .map((id) => findById(doc.elements, id))
    .filter((e): e is Element => !!e);
  pasteCount = 0;
  if (clipboard.length) toast("info", `Copied ${clipboard.length} layer${clipboard.length > 1 ? "s" : ""}`);
}

export function cutSelection(): void {
  copySelection();
  deleteSelection();
}

export function pasteClipboard(): boolean {
  const doc = getState().doc;
  if (!doc || clipboard.length === 0) return false;
  // Assets referenced by pasted images must exist in this project.
  const ids = new Set(doc.assets.map((a) => a.id));
  let missing = false;
  walk(clipboard, (el) => {
    if (el.type === "image" && el.assetId && !ids.has(el.assetId)) missing = true;
  });
  if (missing) {
    toast("warning", "Cannot paste here", "Some images come from another project. Import their files into this project first.");
    return true;
  }
  pasteCount++;
  let newIds: string[] = [];
  commit((d) => {
    const r = pasteElements(d, clipboard, 16 * pasteCount);
    newIds = r.newIds;
    return r.doc;
  });
  setState({ selection: newIds });
  return true;
}

export function groupSelection(): void {
  const ids = editableSelection();
  if (ids.length < 2) return;
  let groupId: string | null = null;
  commit((d) => {
    const r = groupElements(d, ids);
    groupId = r.groupId;
    return r.doc;
  });
  if (groupId) setState({ selection: [groupId] });
}

export function ungroupSelection(): void {
  const doc = getState().doc;
  if (!doc) return;
  const groups = editableSelection().filter((id) => findById(doc.elements, id)?.type === "group");
  if (groups.length === 0) return;
  const childIds: string[] = [];
  commit((d) => {
    let next = d;
    for (const g of groups) {
      const r = ungroupElement(next, g);
      next = r.doc;
      childIds.push(...r.childIds);
    }
    return next;
  });
  setState({ selection: childIds, enteredGroup: null });
}

export function reorderSelection(move: OrderMove): void {
  const ids = getState().selection;
  if (ids.length) commit((d) => reorderElements(d, ids, move));
}

export function alignSelection(mode: AlignMode): void {
  const { doc } = getState();
  const ids = editableSelection();
  if (!doc || ids.length === 0) return;
  const reference = ids.length === 1 ? { x: 0, y: 0, width: doc.project.width, height: doc.project.height } : selectionBounds(ids);
  if (reference) commit((d) => alignElements(d, ids, mode, reference));
}

export function distributeSelection(axis: "x" | "y"): void {
  const ids = editableSelection();
  if (ids.length >= 3) commit((d) => distributeElements(d, ids, axis));
}

export function setFlag(ids: string[], flag: "locked" | "visible", value: boolean): void {
  if (ids.length === 0) return;
  commit((d) => updateElements(d, ids, (el) => ({ ...el, [flag]: value }) as Element));
}

export function updateSelected(fn: (el: Element) => Element, merge?: string): void {
  const ids = getState().selection;
  if (ids.length) commit((d) => updateElements(d, ids, fn), { merge });
}

export function nudgeSelection(dx: number, dy: number): void {
  const ids = editableSelection();
  if (ids.length) commit((d) => translateElements(d, ids, dx, dy), { merge: "nudge" });
}

// ---------------------------------------------------------------------------
// Assets

/** Import files into the project's asset library. Failures are reported per file. */
export async function importFiles(files: File[]): Promise<AssetRecord[]> {
  const out: AssetRecord[] = [];
  if (!getState().doc) return out;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setState({ busy: `Importing ${f.name} (${i + 1} of ${files.length})` });
    try {
      const imported = await importAssetFile(f, f.name);
      let added = imported;
      commit((d) => {
        const r = addAsset(d, imported);
        added = r.asset;
        return r.doc;
      });
      out.push(added);
      if (imported.provenance !== "original") toast("warning", `Check provenance: ${f.name}`, imported.note);
    } catch (err) {
      toast("danger", `Could not import ${f.name}`, err instanceof Error ? err.message : String(err));
    }
  }
  setState({ busy: null });
  return out;
}

/** Place an asset as a new image layer (or into an existing frame when dropped on one). */
export function placeAsset(asset: AssetRecord, at?: Point, targetFrameId?: string | null): void {
  const doc = getState().doc;
  if (!doc) return;
  if (targetFrameId) {
    const target = findById(doc.elements, targetFrameId);
    if (target?.type === "image" && !isLockedInTree(doc.elements, targetFrameId)) {
      commit((d) => replaceImageInDoc(d, targetFrameId, asset), { selection: [targetFrameId] });
      toast("success", `Placed ${asset.name} in "${target.name}"`, "The frame kept its position, size and crop settings.");
      return;
    }
  }
  const c = at ?? viewCenter();
  const el = createImageElement(asset, c.x, c.y, doc.project.width * 0.6, doc.project.height * 0.6);
  addAndSelect([el]);
}

export function fillSlot(slotId: string, asset: AssetRecord): void {
  commit((d) => assignSlot(d, slotId, asset));
}

// ---------------------------------------------------------------------------
// Projects

export function newProject(name: string, width: number, height: number): GrapheneDocument {
  const doc = createDocument(name, width, height);
  openDocument(doc);
  void saveDoc(doc);
  return doc;
}

export async function openProjectById(id: string): Promise<boolean> {
  const raw = await loadDoc(id);
  if (!raw) {
    toast("danger", "Project not found", "It may have been deleted in another tab.");
    return false;
  }
  const r = validateDocument(raw);
  if (!r.ok || !r.doc) {
    toast("danger", "This project could not be opened", r.errors.join(" "));
    return false;
  }
  openDocument(r.doc);
  if (r.warnings.length) toast("warning", "Opened with corrections", r.warnings.slice(0, 3).join(" "));
  return true;
}

export async function sampleAssetsAvailable(): Promise<SampleManifest | null> {
  try {
    const res = await fetch(`${SAMPLE_ASSET_BASE}manifest.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const m = (await res.json()) as SampleManifest;
    return Array.isArray(m.files) && m.files.length ? m : null;
  } catch {
    return null;
  }
}

/** Create the BNI Crescendo sample project, optionally filling its slots from the local sample assets. */
export async function openSample(useBundledAssets: boolean): Promise<void> {
  setState({ busy: "Building sample project" });
  try {
    const catalog = await loadIconCatalog();
    const paths = (name: string) => catalog.find((i) => i.name === name)?.paths ?? [];
    const doc = buildBniCrescendo({
      camera: paths("camera"),
      zap: paths("zap"),
      layers: paths("layers"),
      monitor: paths("monitor"),
      calendar: paths("calendar-days"),
    });
    openDocument(doc);
    const manifest = useBundledAssets ? await sampleAssetsAvailable() : null;
    if (manifest) {
      for (let i = 0; i < manifest.files.length; i++) {
        const f = manifest.files[i];
        if (!BNI_SLOTS.some((s) => s.id === f.slot)) continue;
        setState({ busy: `Loading ${f.originalName} (${i + 1} of ${manifest.files.length})` });
        const res = await fetch(`${SAMPLE_ASSET_BASE}${encodeURIComponent(f.file)}`);
        if (!res.ok) {
          toast("warning", `Sample file missing: ${f.originalName}`);
          continue;
        }
        const asset = await importAssetFile(await res.blob(), f.originalName);
        commit((d) => {
          const r = addAsset(d, asset);
          return assignSlot(r.doc, f.slot, r.asset);
        });
      }
      const filled = new Set(manifest.files.map((f) => f.slot));
      if (BNI_SLOTS.some((s) => !filled.has(s.id))) setState({ dialog: { type: "slots" } });
      // Opening a sample should not leave "Undo" pointing at an empty template.
      setState({ history: { past: [], future: [], mergeKey: null, mergeAt: 0 } });
    } else {
      setState({ dialog: { type: "slots" } });
      toast("info", "Map your files to the template", "Choose the logo, event photo, studio photo and four portraits. Nothing is generated.");
    }
  } catch (err) {
    toast("danger", "Could not build the sample", err instanceof Error ? err.message : String(err));
  } finally {
    setState({ busy: null });
  }
}
