// Pure document operations. Every editing action in the UI goes through one of
// these, which keeps undo/redo, persistence and (later) AI-proposed edits on
// the same, testable path. None of them touch asset bytes.
import { aabbOf, centerOf, localToWorld, rotateAround, unionBoxes, type Box, type Point, type ResizeResult } from "./geometry.ts";
import { coverCrop, isFullCrop, refitCropAfterResize, visibleCrop } from "./image.ts";
import { layoutText, type Measure } from "./text.ts";
import { newId } from "./defaults.ts";
import {
  ancestorsOf,
  findById,
  insertInto,
  locate,
  mapTree,
  removeIds,
  topmostSelection,
  updateById,
  updateByIds,
  walk,
} from "./tree.ts";
import type { AssetRecord, Element, GrapheneDocument, GroupElement, ImageElement, TextElement } from "./types.ts";

export function withElements(doc: GrapheneDocument, elements: Element[]): GrapheneDocument {
  return elements === doc.elements ? doc : { ...doc, elements };
}

// ---------------------------------------------------------------------------
// Derived data

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Recompute every group's bounds from its children. Groups never carry their own rotation. */
export function syncGroupBounds(elements: Element[]): Element[] {
  return mapTree(elements, (el) => {
    if (el.type !== "group") return el;
    const b = unionBoxes(el.children.map((c) => aabbOf(c)));
    if (!b) return el;
    const next = { x: r2(b.x), y: r2(b.y), width: r2(b.width), height: r2(b.height) };
    if (el.x === next.x && el.y === next.y && el.width === next.width && el.height === next.height && el.rotation === 0) return el;
    return { ...el, ...next, rotation: 0 };
  });
}

/** Text boxes grow and shrink vertically with their content, so text can never be clipped. */
export function syncTextHeights(elements: Element[], measure: Measure): Element[] {
  return mapTree(elements, (el) => {
    if (el.type !== "text") return el;
    const h = r2(layoutText(el, measure).height);
    if (Math.abs(h - el.height) < 0.01) return el;
    if (!el.rotation) return { ...el, height: h };
    // Keep the rotated top-left corner fixed in world space while the height changes.
    const anchor = localToWorld(el, { x: 0, y: 0 });
    const resized = { ...el, height: h };
    const moved = localToWorld({ ...resized, x: 0, y: 0 }, { x: 0, y: 0 });
    return { ...resized, x: r2(anchor.x - moved.x), y: r2(anchor.y - moved.y) };
  });
}

export function syncDerived(doc: GrapheneDocument, measure: Measure | null): GrapheneDocument {
  let elements = doc.elements;
  if (measure) elements = syncTextHeights(elements, measure);
  elements = syncGroupBounds(elements);
  return withElements(doc, elements);
}

// ---------------------------------------------------------------------------
// Add, update, delete

export function addElements(doc: GrapheneDocument, items: Element[], parentId: string | null = null, index?: number): GrapheneDocument {
  return withElements(doc, insertInto(doc.elements, parentId, index, items));
}

export function updateElement(doc: GrapheneDocument, id: string, patch: Partial<Element> | ((el: Element) => Element)): GrapheneDocument {
  const fn = typeof patch === "function" ? patch : (el: Element) => ({ ...el, ...patch }) as Element;
  return withElements(doc, updateById(doc.elements, id, fn));
}

export function updateElements(doc: GrapheneDocument, ids: string[], fn: (el: Element) => Element): GrapheneDocument {
  return withElements(doc, updateByIds(doc.elements, new Set(ids), fn));
}

export function deleteElements(doc: GrapheneDocument, ids: string[]): GrapheneDocument {
  return withElements(doc, removeIds(doc.elements, new Set(ids)));
}

// ---------------------------------------------------------------------------
// Transforms. Groups are transformed by transforming their descendants.

export function translateEl(el: Element, dx: number, dy: number): Element {
  if (el.type === "group") {
    return { ...el, x: el.x + dx, y: el.y + dy, children: el.children.map((c) => translateEl(c, dx, dy)) };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function translateElements(doc: GrapheneDocument, ids: string[], dx: number, dy: number): GrapheneDocument {
  if (!dx && !dy) return doc;
  const top = new Set(topmostSelection(doc.elements, ids));
  return withElements(doc, updateByIds(doc.elements, top, (el) => translateEl(el, dx, dy)));
}

/** Scale type-specific measurements (font size, radii, strokes, shadows) by s. */
function scaleDetails<T extends Element>(el: T, s: number): T {
  const shadow = el.shadow ? { ...el.shadow, blur: el.shadow.blur * s, offsetX: el.shadow.offsetX * s, offsetY: el.shadow.offsetY * s } : null;
  switch (el.type) {
    case "text":
      return {
        ...el,
        shadow,
        fontSize: r2(el.fontSize * s),
        letterSpacing: r2(el.letterSpacing * s),
        paragraphSpacing: r2(el.paragraphSpacing * s),
        stroke: el.stroke ? { ...el.stroke, width: el.stroke.width * s } : null,
      };
    case "shape":
      return {
        ...el,
        shadow,
        cornerRadius: el.cornerRadius * s,
        slantLeft: el.slantLeft * s,
        slantRight: el.slantRight * s,
        tailSize: el.tailSize * s,
        stroke: el.stroke ? { ...el.stroke, width: el.stroke.width * s } : null,
      };
    case "image":
      return {
        ...el,
        shadow,
        cornerRadius: el.cornerRadius * s,
        fade: { left: el.fade.left * s, right: el.fade.right * s, top: el.fade.top * s, bottom: el.fade.bottom * s },
        mask: el.mask ? { ...el.mask, feather: el.mask.feather * s } : null,
        stroke: el.stroke ? { ...el.stroke, width: el.stroke.width * s } : null,
      };
    default:
      return { ...el, shadow };
  }
}

/** Uniformly scale an element (and descendants) about an anchor point. Images keep their crop, so they never distort. */
export function scaleEl(el: Element, s: number, anchor: Point): Element {
  if (el.type === "group") {
    return { ...el, children: el.children.map((c) => scaleEl(c, s, anchor)) };
  }
  const c = centerOf(el);
  const nc = { x: anchor.x + (c.x - anchor.x) * s, y: anchor.y + (c.y - anchor.y) * s };
  const width = el.width * s;
  const height = el.height * s;
  return scaleDetails({ ...el, x: nc.x - width / 2, y: nc.y - height / 2, width, height }, s);
}

export function scaleElements(doc: GrapheneDocument, ids: string[], s: number, anchor: Point): GrapheneDocument {
  if (s === 1) return doc;
  const top = new Set(topmostSelection(doc.elements, ids));
  return withElements(doc, syncGroupBounds(updateByIds(doc.elements, top, (el) => scaleEl(el, s, anchor))));
}

export function rotateEl(el: Element, delta: number, pivot: Point): Element {
  if (el.type === "group") return { ...el, children: el.children.map((c) => rotateEl(c, delta, pivot)) };
  const c = rotateAround(centerOf(el), pivot, delta);
  let rotation = (el.rotation + delta) % 360;
  if (rotation > 180) rotation -= 360;
  if (rotation <= -180) rotation += 360;
  return { ...el, x: c.x - el.width / 2, y: c.y - el.height / 2, rotation: r2(rotation) };
}

export function rotateElements(doc: GrapheneDocument, ids: string[], delta: number, pivot: Point): GrapheneDocument {
  if (!delta) return doc;
  const top = new Set(topmostSelection(doc.elements, ids));
  return withElements(doc, syncGroupBounds(updateByIds(doc.elements, top, (el) => rotateEl(el, delta, pivot))));
}

/**
 * Apply a single-element handle resize. Text: side handles reflow (width only),
 * corner handles scale the type. Images: corner handles keep the crop, side
 * handles move the frame edge over a fixed image (revealing or hiding content).
 */
export function applyResize(el: Element, r: ResizeResult, kind: "corner" | "side", asset: { width: number; height: number } | null): Element {
  const box = { x: r.x, y: r.y, width: r.width, height: r.height };
  if (el.type === "text") {
    if (kind === "corner") {
      const s = r.width / el.width;
      return { ...scaleDetails(el, s), ...box };
    }
    return { ...el, x: r.x, y: r.y, width: r.width };
  }
  if (el.type === "image") {
    if (kind === "side" && asset && el.assetId) {
      return { ...el, ...box, crop: refitCropAfterResize(el, asset.width, asset.height, r.localLeft, r.localTop, r.width, r.height) };
    }
    if (kind === "side" && !el.assetId) return { ...el, ...box };
    return { ...el, ...box };
  }
  return { ...el, ...box } as Element;
}

// ---------------------------------------------------------------------------
// Structure: duplicate, group, ungroup, order

export function cloneWithNewIds(el: Element): Element {
  const prefix = el.type === "group" ? "group" : el.type;
  if (el.type === "group") return { ...el, id: newId(prefix), children: el.children.map(cloneWithNewIds) };
  return { ...el, id: newId(prefix) };
}

export function duplicateElements(doc: GrapheneDocument, ids: string[], offset = 16): { doc: GrapheneDocument; newIds: string[] } {
  const top = topmostSelection(doc.elements, ids);
  let elements = doc.elements;
  const newIds: string[] = [];
  for (const id of top) {
    const loc = locate(elements, id);
    if (!loc) continue;
    const copy = translateEl(cloneWithNewIds(loc.el), offset, offset);
    copy.name = `${loc.el.name} copy`;
    newIds.push(copy.id);
    elements = insertInto(elements, loc.parent?.id ?? null, loc.index + 1, [copy]);
  }
  return { doc: withElements(doc, syncGroupBounds(elements)), newIds };
}

/** Paste copies of elements (already detached) on top of the root, or inside a group. */
export function pasteElements(doc: GrapheneDocument, items: Element[], offset: number): { doc: GrapheneDocument; newIds: string[] } {
  const copies = items.map((el) => translateEl(cloneWithNewIds(el), offset, offset));
  return { doc: addElements(doc, copies), newIds: copies.map((c) => c.id) };
}

function replaceWith(elements: Element[], id: string, items: Element[]): Element[] {
  const loc = locate(elements, id);
  if (!loc) return elements;
  const parentId = loc.parent?.id ?? null;
  const without = removeIdsKeepEmpty(elements, id);
  return insertInto(without, parentId, loc.index, items);
}

function removeIdsKeepEmpty(elements: Element[], id: string): Element[] {
  return mapTree(elements, (el) => (el.type === "group" && el.children.some((c) => c.id === id) ? { ...el, children: el.children.filter((c) => c.id !== id) } : el)).filter(
    (el) => el.id !== id,
  );
}

export function groupElements(doc: GrapheneDocument, ids: string[], name = "Group"): { doc: GrapheneDocument; groupId: string | null } {
  const top = topmostSelection(doc.elements, ids);
  if (top.length < 2) return { doc, groupId: null };
  const items = top.map((id) => findById(doc.elements, id)).filter((e): e is Element => !!e);
  const last = top[top.length - 1];
  const group: GroupElement = {
    id: newId("group"),
    type: "group",
    name,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    shadow: null,
    children: items,
  };
  let elements = removeIds(doc.elements, new Set(top.slice(0, -1)));
  elements = replaceWith(elements, last, [group]);
  return { doc: withElements(doc, syncGroupBounds(elements)), groupId: group.id };
}

export function ungroupElement(doc: GrapheneDocument, groupId: string): { doc: GrapheneDocument; childIds: string[] } {
  const g = findById(doc.elements, groupId);
  if (!g || g.type !== "group") return { doc, childIds: [] };
  const children = g.children.map((c) => ({
    ...c,
    opacity: r2(c.opacity * g.opacity),
    visible: c.visible && g.visible,
    locked: c.locked || g.locked,
  })) as Element[];
  return { doc: withElements(doc, syncGroupBounds(replaceWith(doc.elements, groupId, children))), childIds: children.map((c) => c.id) };
}

export type OrderMove = "forward" | "backward" | "front" | "back";

function reorderList(list: Element[], selected: Set<string>, move: OrderMove): Element[] {
  if (!list.some((e) => selected.has(e.id))) return list;
  const out = [...list];
  if (move === "front" || move === "back") {
    const picked = out.filter((e) => selected.has(e.id));
    const rest = out.filter((e) => !selected.has(e.id));
    return move === "front" ? [...rest, ...picked] : [...picked, ...rest];
  }
  if (move === "forward") {
    for (let i = out.length - 2; i >= 0; i--) {
      if (selected.has(out[i].id) && !selected.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (selected.has(out[i].id) && !selected.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
    }
  }
  return out;
}

export function reorderElements(doc: GrapheneDocument, ids: string[], move: OrderMove): GrapheneDocument {
  const selected = new Set(topmostSelection(doc.elements, ids));
  const apply = (list: Element[]): Element[] => {
    const reordered = reorderList(list, selected, move);
    let changed = reordered !== list;
    const mapped = reordered.map((el) => {
      if (el.type !== "group") return el;
      const children = apply(el.children);
      if (children === el.children) return el;
      changed = true;
      return { ...el, children };
    });
    return changed ? mapped : list;
  };
  return withElements(doc, apply(doc.elements));
}

/** Move an element to a new parent (null = root) at an index — used by layer drag-and-drop. */
export function moveElementTo(doc: GrapheneDocument, id: string, parentId: string | null, index: number): GrapheneDocument {
  if (id === parentId) return doc;
  if (parentId && ancestorsOf(doc.elements, parentId).some((g) => g.id === id)) return doc; // no cycles
  const loc = locate(doc.elements, id);
  if (!loc) return doc;
  let targetIndex = index;
  if ((loc.parent?.id ?? null) === parentId && loc.index < index) targetIndex -= 1;
  const without = removeIds(doc.elements, new Set([id]));
  // removeIds may have dropped a now-empty group that was the target; fall back to root.
  const parentStillExists = parentId === null || findById(without, parentId);
  return withElements(doc, syncGroupBounds(insertInto(without, parentStillExists ? parentId : null, targetIndex, [loc.el])));
}

// ---------------------------------------------------------------------------
// Alignment and distribution

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export function alignElements(doc: GrapheneDocument, ids: string[], mode: AlignMode, reference: Box): GrapheneDocument {
  const top = topmostSelection(doc.elements, ids);
  let elements = doc.elements;
  for (const id of top) {
    const el = findById(elements, id);
    if (!el) continue;
    const b = aabbOf(el);
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = reference.x - b.x;
    if (mode === "hcenter") dx = reference.x + reference.width / 2 - (b.x + b.width / 2);
    if (mode === "right") dx = reference.x + reference.width - (b.x + b.width);
    if (mode === "top") dy = reference.y - b.y;
    if (mode === "vcenter") dy = reference.y + reference.height / 2 - (b.y + b.height / 2);
    if (mode === "bottom") dy = reference.y + reference.height - (b.y + b.height);
    if (dx || dy) elements = updateById(elements, id, (e) => translateEl(e, dx, dy));
  }
  return withElements(doc, syncGroupBounds(elements));
}

/** Equal gaps between neighbouring bounding boxes along an axis. Needs three or more elements. */
export function distributeElements(doc: GrapheneDocument, ids: string[], axis: "x" | "y"): GrapheneDocument {
  const top = topmostSelection(doc.elements, ids);
  if (top.length < 3) return doc;
  const items = top
    .map((id) => {
      const el = findById(doc.elements, id);
      return el ? { id, b: aabbOf(el) } : null;
    })
    .filter((x): x is { id: string; b: Box } => !!x);
  const pos = (b: Box) => (axis === "x" ? b.x : b.y);
  const size = (b: Box) => (axis === "x" ? b.width : b.height);
  items.sort((a, b) => pos(a.b) + size(a.b) / 2 - (pos(b.b) + size(b.b) / 2));
  const first = items[0].b;
  const last = items[items.length - 1].b;
  const span = pos(last) + size(last) - pos(first);
  const total = items.reduce((s, i) => s + size(i.b), 0);
  const gap = (span - total) / (items.length - 1);
  let cursor = pos(first);
  let elements = doc.elements;
  for (const item of items) {
    const delta = cursor - pos(item.b);
    if (Math.abs(delta) > 1e-6) elements = updateById(elements, item.id, (e) => (axis === "x" ? translateEl(e, delta, 0) : translateEl(e, 0, delta)));
    cursor += size(item.b) + gap;
  }
  return withElements(doc, syncGroupBounds(elements));
}

// ---------------------------------------------------------------------------
// Assets

/** Add an asset record. If identical bytes are already in the project, the existing record is reused. */
export function addAsset(doc: GrapheneDocument, asset: AssetRecord): { doc: GrapheneDocument; asset: AssetRecord } {
  const existing = doc.assets.find((a) => a.hash === asset.hash);
  if (existing) return { doc, asset: existing };
  const integrity = doc.project.protectOriginals && asset.integrity !== "generated" ? "protected" : asset.integrity;
  const added = { ...asset, integrity };
  return { doc: { ...doc, assets: [...doc.assets, added] }, asset: added };
}

export function updateAsset(doc: GrapheneDocument, id: string, patch: Partial<AssetRecord>): GrapheneDocument {
  return { ...doc, assets: doc.assets.map((a) => (a.id === id ? { ...a, ...patch, id: a.id, hash: a.hash } : a)) };
}

export function elementsUsingAsset(doc: GrapheneDocument, assetId: string): ImageElement[] {
  const out: ImageElement[] = [];
  walk(doc.elements, (el) => {
    if (el.type === "image" && el.assetId === assetId) out.push(el);
  });
  return out;
}

export function removeAsset(doc: GrapheneDocument, id: string): GrapheneDocument {
  if (elementsUsingAsset(doc, id).length > 0) return doc;
  return { ...doc, assets: doc.assets.filter((a) => a.id !== id) };
}

/** Put a different asset into an existing frame. The frame keeps its position, size, rotation and styling. */
export function replaceImage(el: ImageElement, asset: AssetRecord): ImageElement {
  return { ...el, assetId: asset.id, crop: coverCrop(asset.width, asset.height, el.width / el.height) };
}

export function replaceImageInDoc(doc: GrapheneDocument, elementId: string, asset: AssetRecord): GrapheneDocument {
  return updateElement(doc, elementId, (el) => (el.type === "image" ? replaceImage(el, asset) : el));
}

/**
 * Fill every frame bound to a template slot with an asset. An empty template
 * frame keeps the crop its template defined (e.g. an upper-body crop of a
 * full-length portrait); otherwise the image is centred to fill the frame.
 */
export function assignSlot(doc: GrapheneDocument, slotId: string, asset: AssetRecord): GrapheneDocument {
  return withElements(
    doc,
    mapTree(doc.elements, (el) => {
      if (el.type !== "image" || el.slotId !== slotId) return el;
      if (el.assetId === null && !isFullCrop(el.crop)) {
        return { ...el, assetId: asset.id, crop: visibleCrop(el, asset.width, asset.height) };
      }
      return replaceImage(el, asset);
    }),
  );
}

export function setProtectOriginals(doc: GrapheneDocument, on: boolean): GrapheneDocument {
  return {
    ...doc,
    project: { ...doc.project, protectOriginals: on },
    assets: on ? doc.assets.map((a) => (a.integrity === "generated" ? a : { ...a, integrity: "protected" })) : doc.assets,
  };
}

export function isAssetProtected(doc: GrapheneDocument, assetId: string | null): boolean {
  if (!assetId) return false;
  const a = doc.assets.find((x) => x.id === assetId);
  return !a || a.integrity === "protected";
}

export function textElements(doc: GrapheneDocument): TextElement[] {
  const out: TextElement[] = [];
  walk(doc.elements, (el) => {
    if (el.type === "text") out.push(el);
  });
  return out;
}
