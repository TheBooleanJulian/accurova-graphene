// The design canvas: renders the document with the shared renderer and turns
// pointer input into model operations (select, move, resize, rotate, crop, pan).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  HANDLE_DIRS,
  canvasTargets,
  centerOf,
  cornersOf,
  elementTargets,
  localToWorld,
  resizeBox,
  rotationFromPointer,
  snapAngle,
  snapMove,
  snapScalar,
  worldToLocal,
  boundsOfPoints,
  type Box,
  type Handle,
  type Point,
} from "../../model/geometry.ts";
import { panCrop, setCropZoom, cropZoom } from "../../model/image.ts";
import { localToSource, maskOutlineLocal, outlinePolygon, simplifyPath, sourceToLocal, visibleThroughMask } from "../../model/mask.ts";
import { applyResize, deleteElements, duplicateElements, rotateElements, scaleElements, translateElements, updateElement } from "../../model/ops.ts";
import { findById, isLockedInTree } from "../../model/tree.ts";
import type { Element, GrapheneDocument, TextElement } from "../../model/types.ts";
import { renderDocument } from "../../render/renderer.ts";
import { resolveProxy, subscribeImages } from "../../render/imageCache.ts";
import {
  beginGesture,
  bumpRender,
  commit,
  endGesture,
  fitToScreen,
  getState,
  setState,
  useEditor,
  zoomAt,
} from "../../store/editor.ts";
import { applyMaskShape, editableSelection, exitMaskEdit, importFiles, placeAsset, select, selectionBounds, updateMask } from "../../store/actions.ts";
import { hitTest, marqueeHits, snapCandidates } from "./hit.ts";
import { pickFileForFrame } from "../filePicker.ts";

type Gesture =
  | { kind: "pan"; sx: number; sy: number; panX: number; panY: number }
  | { kind: "move"; ids: string[]; start: Point; box: Box; moved: boolean; base: GrapheneDocument | null; duplicated: boolean }
  | { kind: "resize"; id: string; handle: Handle; el: Element; asset: { width: number; height: number } | null }
  | { kind: "scale"; ids: string[]; handle: Handle; box: Box }
  | { kind: "rotate"; ids: string[]; center: Point; startAngle: number; baseRotation: number }
  | { kind: "marquee"; start: Point; initial: string[]; additive: boolean }
  | { kind: "crop"; id: string; start: Point; el: Element }
  | { kind: "mask-vertex"; id: string; index: number }
  | { kind: "mask-corner"; id: string; corner: Handle; points: Point[] }
  | { kind: "mask-move"; id: string; start: Point; points: Point[] }
  | { kind: "mask-box"; id: string; start: Point }
  | { kind: "mask-lasso"; id: string; last: Point };

const SNAP_PX = 6;
const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 26;
const CURSORS = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"];

function handleCursor(handle: Handle, rotation: number): string {
  const { hx, hy } = HANDLE_DIRS[handle];
  const angle = (Math.atan2(hy, hx) * 180) / Math.PI + rotation; // 0 = east
  const idx = Math.round(((((angle + 90) % 180) + 180) % 180) / 45) % 4;
  return CURSORS[idx];
}

/** Which resize handles an element offers. */
function handlesFor(el: Element, screenW: number, screenH: number): Handle[] {
  const corners: Handle[] = ["nw", "ne", "se", "sw"];
  const sides: Handle[] = [];
  if (screenH >= 28) sides.push("e", "w");
  if (screenW >= 28) sides.push("n", "s");
  switch (el.type) {
    case "text":
      return ["nw", "ne", "se", "sw", "e", "w"];
    case "icon":
      return corners;
    case "shape":
      if (el.kind === "line" || el.kind === "arrow") return ["e", "w"];
      return [...corners, ...sides];
    case "image":
      return [...corners, ...sides];
    default:
      return corners;
  }
}

function needsRatio(el: Element, handle: Handle, shift: boolean): boolean {
  const corner = handle.length === 2;
  if (el.type === "image" || el.type === "icon" || el.type === "text") return corner;
  return shift;
}

export function Stage() {
  const doc = useEditor((s) => s.doc)!;
  const view = useEditor((s) => s.view);
  const viewport = useEditor((s) => s.viewport);
  const selection = useEditor((s) => s.selection);
  const hoverId = useEditor((s) => s.hoverId);
  const editingTextId = useEditor((s) => s.editingTextId);
  const cropId = useEditor((s) => s.cropId);
  const enteredGroup = useEditor((s) => s.enteredGroup);
  const guides = useEditor((s) => s.guides);
  const showGrid = useEditor((s) => s.showGrid);
  const preview = useEditor((s) => s.preview);
  const renderTick = useEditor((s) => s.renderTick);
  const gestureActive = useEditor((s) => s.gestureBase !== null);
  const maskEdit = useEditor((s) => s.maskEdit);
  const maskDraft = useEditor((s) => s.maskDraft);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [tag, setTag] = useState<{ x: number; y: number; text: string } | null>(null);
  const [maskCursor, setMaskCursor] = useState<Point | null>(null);

  const z = view.zoom;
  const toDoc = (clientX: number, clientY: number): Point => {
    const r = containerRef.current!.getBoundingClientRect();
    const v = getState().view;
    return { x: (clientX - r.left - v.panX) / v.zoom, y: (clientY - r.top - v.panY) / v.zoom };
  };
  const toScreen = (p: Point): Point => ({ x: p.x * z + view.panX, y: p.y * z + view.panY });

  // Viewport size; fit the document whenever a different project opens.
  useLayoutEffect(() => {
    const el = containerRef.current!;
    const measure = () => setState({ viewport: { width: el.clientWidth, height: el.clientHeight } });
    measure();
    fitToScreen();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.project.id, preview]);

  useEffect(() => subscribeImages(bumpRender), []);

  // Draw.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(viewport.width * dpr));
      const h = Math.max(1, Math.round(viewport.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
      }
      const ctx = canvas.getContext("2d")!;
      const { width: W, height: H } = doc.project;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.panX, dpr * view.panY);
      // Artboard base: shadow, then a checkerboard when the background is transparent.
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 28 * dpr;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      if (!doc.project.background) {
        const cell = 12 / view.zoom;
        ctx.fillStyle = "#E3E6EE";
        for (let y = 0; y < H; y += cell) for (let x = (Math.floor(y / cell) % 2) * cell; x < W; x += cell * 2) ctx.fillRect(x, y, Math.min(cell, W - x), Math.min(cell, H - y));
      }
      ctx.save();
      if (!cropId) {
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.clip();
      }
      const assets = new Map(doc.assets.map((a) => [a.id, a]));
      renderDocument(ctx, doc, {
        pixelRatio: view.zoom * dpr,
        resolveImage: (el) => {
          const a = el.assetId ? assets.get(el.assetId) : undefined;
          return a ? resolveProxy(a) : null;
        },
        hidden: editingTextId ? new Set([editingTextId]) : undefined,
        drawPlaceholders: true,
        background: true,
        cropModeId: cropId,
        maskEditId: maskEdit?.id ?? null,
      });
      ctx.restore();
      if (showGrid && !preview) {
        const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
        const step = steps.find((s) => s * view.zoom >= 14) ?? 1000;
        ctx.beginPath();
        for (let x = step; x < W; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
        }
        for (let y = step; y < H; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
        }
        ctx.strokeStyle = "rgba(0, 170, 210, 0.28)";
        ctx.lineWidth = 1 / (view.zoom * dpr);
        ctx.stroke();
      }
      if (doc.project.margin > 0 && !preview) {
        const m = doc.project.margin;
        ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
        ctx.strokeStyle = "rgba(255, 43, 214, 0.7)";
        ctx.lineWidth = 1 / view.zoom;
        ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
        ctx.setLineDash([]);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [doc, view, viewport, editingTextId, cropId, maskEdit, renderTick, showGrid, preview]);

  // Leaving the image (e.g. selecting another layer in the Layers panel) ends mask editing.
  useEffect(() => {
    if (maskEdit && !selection.includes(maskEdit.id)) exitMaskEdit();
  }, [maskEdit, selection]);

  // Space-to-pan and wheel zoom/pan.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const s = getState();
      const cropTarget = s.cropId ? findById(s.doc!.elements, s.cropId) : null;
      if (cropTarget?.type === "image" && !e.ctrlKey && !e.metaKey) {
        const asset = s.doc!.assets.find((a) => a.id === cropTarget.assetId);
        if (asset) {
          const zNow = cropZoom(cropTarget, asset.width, asset.height);
          const next = Math.min(8, Math.max(1, zNow * Math.exp(-e.deltaY * 0.0015)));
          commit((d) => updateElement(d, cropTarget.id, { crop: setCropZoom(cropTarget, asset.width, asset.height, next) }), { merge: `cropzoom:${cropTarget.id}` });
        }
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        zoomAt(s.view.zoom * Math.exp(-e.deltaY * 0.0022), { x: e.clientX - r.left, y: e.clientY - r.top });
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setState({ view: { ...s.view, panX: s.view.panX - dx, panY: s.view.panY - dy } });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ------------------------------------------------------------------ pointer

  /** The image whose mask is being edited, with coordinate converters. */
  const maskTarget = () => {
    const s = getState();
    if (!s.maskEdit || !s.doc) return null;
    const el = findById(s.doc.elements, s.maskEdit.id);
    if (el?.type !== "image" || !el.assetId) return null;
    const asset = s.doc.assets.find((a) => a.id === el.assetId);
    if (!asset) return null;
    const toNorm = (p: Point) => localToSource(el, asset.width, asset.height, worldToLocal(el, p));
    const v = s.view;
    const toScreenNow = (p: Point) => ({ x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY });
    const normToScreen = (n: Point) => toScreenNow(localToWorld(el, sourceToLocal(el, asset.width, asset.height, n)));
    return { s, el, asset, edit: s.maskEdit, toNorm, toScreenNow, normToScreen };
  };

  const onMaskPointerDown = (e: React.PointerEvent, p: Point) => {
    const t = maskTarget();
    if (!t) {
      exitMaskEdit();
      return;
    }
    const { el, asset, edit, toNorm } = t;
    const n = toNorm(p);
    const capture = () => containerRef.current!.setPointerCapture(e.pointerId);
    const handle = (e.target as HTMLElement).closest("[data-mask-vertex],[data-mask-mid],[data-mask-corner]");
    if (!edit.drawing && el.mask) {
      const mask = el.mask;
      if (handle?.hasAttribute("data-mask-vertex")) {
        const i = Number(handle.getAttribute("data-mask-vertex"));
        if (e.altKey) {
          if (mask.points.length > 3) updateMask(el.id, { points: mask.points.filter((_, j) => j !== i) });
          return;
        }
        beginGesture();
        gesture.current = { kind: "mask-vertex", id: el.id, index: i };
        capture();
        return;
      }
      if (handle?.hasAttribute("data-mask-mid")) {
        const i = Number(handle.getAttribute("data-mask-mid"));
        beginGesture();
        const points = [...mask.points];
        points.splice(i + 1, 0, n);
        commit((d) => updateElement(d, el.id, { mask: { ...mask, points } }));
        gesture.current = { kind: "mask-vertex", id: el.id, index: i + 1 };
        capture();
        return;
      }
      if (handle?.hasAttribute("data-mask-corner")) {
        beginGesture();
        gesture.current = { kind: "mask-corner", id: el.id, corner: handle.getAttribute("data-mask-corner") as Handle, points: mask.points };
        capture();
        return;
      }
      const local = worldToLocal(el, p);
      if (visibleThroughMask({ ...el, mask: { ...mask, invert: false } }, asset.width, asset.height, local)) {
        beginGesture();
        gesture.current = { kind: "mask-move", id: el.id, start: n, points: mask.points };
        capture();
        return;
      }
      if (local.x < 0 || local.y < 0 || local.x > el.width || local.y > el.height) exitMaskEdit();
      return;
    }
    if (edit.tool === "rect" || edit.tool === "ellipse") {
      gesture.current = { kind: "mask-box", id: el.id, start: n };
      setState({ maskDraft: [n, n] });
      capture();
      return;
    }
    if (edit.tool === "lasso") {
      gesture.current = { kind: "mask-lasso", id: el.id, last: p };
      setState({ maskDraft: [n] });
      capture();
      return;
    }
    // Polygon: each click adds a point; clicking the first point closes the shape.
    const draft = t.s.maskDraft ?? [];
    if (draft.length >= 3) {
      const first = t.normToScreen(draft[0]);
      const here = t.toScreenNow(p);
      if (Math.hypot(first.x - here.x, first.y - here.y) <= 10) {
        if (!applyMaskShape(el.id, "polygon", draft)) setState({ maskDraft: null });
        return;
      }
    }
    setState({ maskDraft: [...draft, n] });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (preview) return;
    const s = getState();
    if (s.editingTextId) return;
    setState({ contextMenu: null });
    containerRef.current!.focus({ preventScroll: true });
    const p = toDoc(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, panX: s.view.panX, panY: s.view.panY };
      setPanning(true);
      containerRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (s.maskEdit) {
      onMaskPointerDown(e, p);
      return;
    }

    const handleEl = (e.target as HTMLElement).closest("[data-handle]");
    if (handleEl) {
      const handle = handleEl.getAttribute("data-handle")!;
      const ids = editableSelection();
      if (ids.length === 0) return;
      beginGesture();
      if (handle === "rotate") {
        const single = ids.length === 1 ? findById(s.doc!.elements, ids[0]) : null;
        const center = single && single.type !== "group" ? centerOf(single) : centerOf(selectionBounds(ids)!);
        gesture.current = { kind: "rotate", ids, center, startAngle: rotationFromPointer(center, p), baseRotation: single && single.type !== "group" ? single.rotation : 0 };
      } else {
        const single = ids.length === 1 ? findById(s.doc!.elements, ids[0])! : null;
        if (single && single.type !== "group") {
          const asset = single.type === "image" && single.assetId ? s.doc!.assets.find((a) => a.id === single.assetId) ?? null : null;
          gesture.current = { kind: "resize", id: single.id, handle: handle as Handle, el: single, asset };
        } else {
          gesture.current = { kind: "scale", ids, handle: handle as Handle, box: selectionBounds(ids)! };
        }
      }
      containerRef.current!.setPointerCapture(e.pointerId);
      return;
    }

    if (s.cropId) {
      const el = findById(s.doc!.elements, s.cropId);
      if (el && el.type === "image") {
        const l = worldToLocal(el, p);
        if (l.x >= 0 && l.y >= 0 && l.x <= el.width && l.y <= el.height) {
          beginGesture();
          gesture.current = { kind: "crop", id: el.id, start: p, el };
          containerRef.current!.setPointerCapture(e.pointerId);
          return;
        }
      }
      setState({ cropId: null });
      return;
    }

    const tol = 3 / s.view.zoom;
    const hit = hitTest(s.doc!, p, tol, s.enteredGroup, e.ctrlKey || e.metaKey);
    if (!hit.insideEntered && s.enteredGroup) setState({ enteredGroup: null });
    if (hit.id) {
      if (e.shiftKey) {
        select([hit.id], "toggle");
      } else if (!s.selection.includes(hit.id)) {
        select([hit.id]);
      }
      const ids = editableSelection();
      if (ids.length && getState().selection.includes(hit.id)) {
        gesture.current = { kind: "move", ids, start: p, box: selectionBounds(ids)!, moved: false, base: null, duplicated: false };
        containerRef.current!.setPointerCapture(e.pointerId);
      }
    } else {
      if (!e.shiftKey) select([]);
      gesture.current = { kind: "marquee", start: p, initial: e.shiftKey ? s.selection : [], additive: e.shiftKey };
      containerRef.current!.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const s = getState();
    if (!s.doc) return;
    const p = toDoc(e.clientX, e.clientY);
    const zoom = s.view.zoom;
    const r = containerRef.current!.getBoundingClientRect();
    const screenTag = (text: string) => setTag({ x: e.clientX - r.left + 14, y: e.clientY - r.top + 18, text });

    if (!g) {
      if (s.maskEdit?.drawing && s.maskEdit.tool === "polygon") setMaskCursor(p);
      if (preview || s.editingTextId || s.maskEdit) return;
      const hit = hitTest(s.doc, p, 3 / zoom, s.enteredGroup, e.ctrlKey || e.metaKey);
      if (hit.id !== s.hoverId) setState({ hoverId: hit.id });
      return;
    }

    switch (g.kind) {
      case "pan":
        setState({ view: { ...s.view, panX: g.panX + e.clientX - g.sx, panY: g.panY + e.clientY - g.sy } });
        return;
      case "move": {
        let dx = p.x - g.start.x;
        let dy = p.y - g.start.y;
        if (!g.moved) {
          if (Math.hypot(dx * zoom, dy * zoom) < 3) return;
          g.moved = true;
          beginGesture();
          g.base = getState().gestureBase;
        }
        if (e.altKey && !g.duplicated && g.base) {
          // Alt-drag duplicates: the copies move, the originals stay.
          const d = duplicateElements(g.base, g.ids, 0);
          g.base = d.doc;
          g.ids = d.newIds;
          g.duplicated = true;
          setState({ selection: d.newIds });
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let guides = { xs: [] as number[], ys: [] as number[] };
        if (s.snapping && !(e.ctrlKey || e.metaKey) && g.base) {
          const targets = canvasTargets(s.doc.project.width, s.doc.project.height, s.doc.project.margin);
          const others = elementTargets(snapCandidates(g.base, g.ids));
          const res = snapMove(g.box, dx, dy, { xs: [...targets.xs, ...others.xs], ys: [...targets.ys, ...others.ys] }, SNAP_PX / zoom);
          dx = e.shiftKey && dx === 0 ? 0 : res.dx;
          dy = e.shiftKey && dy === 0 ? 0 : res.dy;
          guides = { xs: res.guidesX, ys: res.guidesY };
        }
        const base = g.base!;
        commit(() => translateElements(base, g.ids, dx, dy));
        setState({ guides });
        screenTag(`${Math.round(g.box.x + dx)}, ${Math.round(g.box.y + dy)}`);
        return;
      }
      case "resize": {
        const base = s.gestureBase;
        if (!base) return;
        let pp = p;
        const guides = { xs: [] as number[], ys: [] as number[] };
        if (s.snapping && !g.el.rotation && !(e.ctrlKey || e.metaKey)) {
          const { hx, hy } = HANDLE_DIRS[g.handle];
          const t = canvasTargets(s.doc.project.width, s.doc.project.height, s.doc.project.margin);
          const o = elementTargets(snapCandidates(base, [g.id]));
          if (hx) {
            const sx = snapScalar(p.x, [...t.xs, ...o.xs], SNAP_PX / zoom);
            pp = { ...pp, x: sx.value };
            if (sx.target !== null) guides.xs.push(sx.target);
          }
          if (hy && !(needsRatio(g.el, g.handle, e.shiftKey) && hx)) {
            const sy = snapScalar(p.y, [...t.ys, ...o.ys], SNAP_PX / zoom);
            pp = { ...pp, y: sy.value };
            if (sy.target !== null) guides.ys.push(sy.target);
          }
        }
        const res = resizeBox(g.el, g.handle, pp, {
          keepRatio: needsRatio(g.el, g.handle, e.shiftKey),
          fromCenter: e.altKey,
          minSize: g.el.type === "text" ? 12 : 4,
        });
        const next = applyResize(g.el, res, g.handle.length === 2 ? "corner" : "side", g.asset);
        commit(() => updateElement(base, g.id, () => next));
        setState({ guides });
        screenTag(g.el.type === "text" && g.handle.length === 2 ? `${Math.round((next as TextElement).fontSize)} px type` : `${Math.round(res.width)} × ${Math.round(res.height)}`);
        return;
      }
      case "scale": {
        const base = s.gestureBase;
        if (!base) return;
        const res = resizeBox({ ...g.box, rotation: 0 }, g.handle, p, { keepRatio: true, fromCenter: e.altKey, minSize: 4 });
        const k = res.width / g.box.width;
        const { hx, hy } = HANDLE_DIRS[g.handle];
        const anchor = e.altKey
          ? centerOf(g.box)
          : { x: hx < 0 ? g.box.x + g.box.width : g.box.x, y: hy < 0 ? g.box.y + g.box.height : g.box.y };
        commit(() => scaleElements(base, g.ids, k, anchor));
        screenTag(`${Math.round(k * 100)}%`);
        return;
      }
      case "rotate": {
        const base = s.gestureBase;
        if (!base) return;
        let total = g.baseRotation + rotationFromPointer(g.center, p) - g.startAngle;
        if (e.shiftKey) total = snapAngle(total, 15);
        else if (Math.abs(snapAngle(total, 45) - total) < 3) total = snapAngle(total, 45);
        commit(() => rotateElements(base, g.ids, total - g.baseRotation, g.center));
        screenTag(`${Math.round(((total % 360) + 540) % 360 - 180)}°`);
        return;
      }
      case "marquee": {
        const box = { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), width: Math.abs(p.x - g.start.x), height: Math.abs(p.y - g.start.y) };
        setMarquee(box);
        if (box.width * zoom > 2 || box.height * zoom > 2) {
          const ids = marqueeHits(s.doc, box, s.enteredGroup);
          setState({ selection: g.additive ? [...new Set([...g.initial, ...ids])] : ids });
        }
        return;
      }
      case "mask-vertex":
      case "mask-corner":
      case "mask-move": {
        const t = maskTarget();
        const base = s.gestureBase;
        if (!t || !base || !t.el.mask) return;
        const n = t.toNorm(p);
        let points: Point[];
        if (g.kind === "mask-vertex") points = t.el.mask.points.map((q, i) => (i === g.index ? n : q));
        else if (g.kind === "mask-move") points = g.points.map((q) => ({ x: q.x + n.x - g.start.x, y: q.y + n.y - g.start.y }));
        else {
          const b = boundsOfPoints(g.points);
          let x0 = b.x;
          let y0 = b.y;
          let x1 = b.x + b.width;
          let y1 = b.y + b.height;
          if (g.corner.includes("w")) x0 = n.x;
          if (g.corner.includes("e")) x1 = n.x;
          if (g.corner.includes("n")) y0 = n.y;
          if (g.corner.includes("s")) y1 = n.y;
          points = [
            { x: Math.min(x0, x1), y: Math.min(y0, y1) },
            { x: Math.max(x0, x1), y: Math.max(y0, y1) },
          ];
        }
        const mask = { ...t.el.mask, points };
        commit(() => updateElement(base, g.id, { mask }));
        return;
      }
      case "mask-box": {
        const t = maskTarget();
        if (t) setState({ maskDraft: [g.start, t.toNorm(p)] });
        return;
      }
      case "mask-lasso": {
        const t = maskTarget();
        if (!t || Math.hypot(p.x - g.last.x, p.y - g.last.y) * zoom < 3) return;
        g.last = p;
        setState({ maskDraft: [...(s.maskDraft ?? []), t.toNorm(p)] });
        return;
      }
      case "crop": {
        const base = s.gestureBase;
        if (!base || g.el.type !== "image") return;
        const asset = s.doc.assets.find((a) => a.id === (g.el as { assetId: string }).assetId);
        if (!asset) return;
        const a = worldToLocal(g.el, g.start);
        const b = worldToLocal(g.el, p);
        const crop = panCrop(g.el, asset.width, asset.height, b.x - a.x, b.y - a.y);
        commit(() => updateElement(base, g.id, { crop }));
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setTag(null);
    if (containerRef.current?.hasPointerCapture(e.pointerId)) containerRef.current.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === "pan") setPanning(false);
    if (g.kind === "marquee") setMarquee(null);
    if (g.kind === "mask-box" || g.kind === "mask-lasso") {
      const t = maskTarget();
      const d = getState().maskDraft;
      if (!t || !d) return setState({ maskDraft: null });
      if (g.kind === "mask-box") {
        const a = t.normToScreen(d[0]);
        const b2 = t.normToScreen(d[1]);
        if (Math.abs(a.x - b2.x) < 4 || Math.abs(a.y - b2.y) < 4 || !applyMaskShape(g.id, t.edit.tool as "rect" | "ellipse", d)) setState({ maskDraft: null });
        return;
      }
      // Freehand: simplify in source pixels to about 1.5 screen px of tolerance.
      const { width: aw, height: ah } = t.asset;
      const k1 = t.normToScreen({ x: 1, y: 0 });
      const k0 = t.normToScreen({ x: 0, y: 0 });
      const screenPerSourcePx = Math.hypot(k1.x - k0.x, k1.y - k0.y) / aw;
      const simplified = simplifyPath(
        d.map((q) => ({ x: q.x * aw, y: q.y * ah })),
        1.5 / Math.max(screenPerSourcePx, 1e-9),
      ).map((q) => ({ x: q.x / aw, y: q.y / ah }));
      if (!applyMaskShape(g.id, "polygon", simplified)) setState({ maskDraft: null });
      return;
    }
    endGesture();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (preview) return;
    const s = getState();
    if (s.maskEdit) {
      if (s.maskEdit.drawing && s.maskEdit.tool === "polygon" && (s.maskDraft?.length ?? 0) >= 3) applyMaskShape(s.maskEdit.id, "polygon", s.maskDraft!);
      return;
    }
    const p = toDoc(e.clientX, e.clientY);
    const tol = 3 / s.view.zoom;
    const shallow = hitTest(s.doc!, p, tol, s.enteredGroup, false);
    if (!shallow.id) return;
    const el = findById(s.doc!.elements, shallow.id);
    if (!el) return;
    if (el.type === "group") {
      const inner = hitTest(s.doc!, p, tol, el.id, false);
      setState({ enteredGroup: el.id, selection: inner.id ? [inner.id] : [] });
      return;
    }
    if (isLockedInTree(s.doc!.elements, el.id)) return;
    if (el.type === "text") setState({ editingTextId: el.id, selection: [el.id] });
    else if (el.type === "image" && el.assetId) setState({ cropId: el.id, selection: [el.id] });
    else if (el.type === "image") void pickFileForFrame(el.id);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (preview) return;
    const s = getState();
    const p = toDoc(e.clientX, e.clientY);
    const hit = hitTest(s.doc!, p, 3 / s.view.zoom, s.enteredGroup, false);
    if (hit.id && !s.selection.includes(hit.id)) select([hit.id]);
    setState({ contextMenu: { x: e.clientX, y: e.clientY } });
  };

  // ------------------------------------------------------------------ drop

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("application/x-graphene-asset")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (e.dataTransfer.types.includes("Files")) setDropActive(true);
    }
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const s = getState();
    const p = toDoc(e.clientX, e.clientY);
    const hit = hitTest(s.doc!, p, 3 / s.view.zoom, s.enteredGroup, true);
    const target = hit.id ? findById(s.doc!.elements, hit.id) : null;
    const frameId = target?.type === "image" ? target.id : null;
    const assetId = e.dataTransfer.getData("application/x-graphene-asset");
    if (assetId) {
      const asset = s.doc!.assets.find((a) => a.id === assetId);
      if (asset) placeAsset(asset, p, frameId);
      return;
    }
    const files = [...e.dataTransfer.files];
    if (files.length) {
      const assets = await importFiles(files);
      assets.forEach((a, i) => placeAsset(a, { x: p.x + i * 24, y: p.y + i * 24 }, i === 0 ? frameId : null));
    }
  };

  // ------------------------------------------------------------------ overlay

  const selected = selection.map((id) => findById(doc.elements, id)).filter((x): x is Element => !!x);
  const editable = selected.filter((el) => !isLockedInTree(doc.elements, el.id));
  const poly = (el: Element) =>
    cornersOf(el)
      .map(toScreen)
      .map((q) => `${q.x},${q.y}`)
      .join(" ");

  const overlay: React.ReactNode[] = [];
  if (!preview) {
    const hover = hoverId && !selection.includes(hoverId) ? findById(doc.elements, hoverId) : null;
    if (hover && !gestureActive) overlay.push(<polygon key="hover" className="hover-outline" points={poly(hover)} />);
    if (enteredGroup) {
      const g = findById(doc.elements, enteredGroup);
      if (g) overlay.push(<polygon key="entered" className="group-outline" points={poly(g)} />);
    }
    for (const el of selected) {
      const locked = isLockedInTree(doc.elements, el.id);
      overlay.push(<polygon key={`sel-${el.id}`} className={locked ? "locked-outline" : el.type === "group" ? "group-outline" : "sel-outline"} points={poly(el)} />);
    }
    const showHandles = !editingTextId && !cropId && !maskEdit && editable.length > 0 && !(gestureActive && gesture.current?.kind === "move");
    if (showHandles) {
      const single = editable.length === 1 && editable[0].type !== "group" ? editable[0] : null;
      const box: (Box & { rotation: number }) | null = single ?? (() => {
        const b = selectionBounds(editable.map((e) => e.id));
        return b ? { ...b, rotation: 0 } : null;
      })();
      if (box) {
        if (!single) {
          const tl = toScreen({ x: box.x, y: box.y });
          overlay.push(<rect key="multi" className="sel-outline" x={tl.x} y={tl.y} width={box.width * z} height={box.height * z} />);
        }
        const handles: Handle[] = single ? handlesFor(single, single.width * z, single.height * z) : ["nw", "ne", "se", "sw"];
        for (const h of handles) {
          const { hx, hy } = HANDLE_DIRS[h];
          const q = toScreen(localToWorld(box, { x: (box.width * (hx + 1)) / 2, y: (box.height * (hy + 1)) / 2 }));
          const isSide = h.length === 1;
          const w = isSide && (h === "e" || h === "w") ? 6 : isSide ? 14 : HANDLE_PX;
          const hgt = isSide && (h === "n" || h === "s") ? 6 : isSide ? 14 : HANDLE_PX;
          overlay.push(
            <rect
              key={`h-${h}`}
              data-handle={h}
              data-testid={`handle-${h}`}
              className="handle"
              x={q.x - w / 2}
              y={q.y - hgt / 2}
              width={w}
              height={hgt}
              rx={isSide ? 3 : 2}
              transform={`rotate(${box.rotation} ${q.x} ${q.y})`}
              style={{ cursor: handleCursor(h, box.rotation) }}
            />,
          );
        }
        const top = toScreen(localToWorld(box, { x: box.width / 2, y: 0 }));
        const rot = toScreen(localToWorld(box, { x: box.width / 2, y: -ROTATE_OFFSET_PX / z }));
        overlay.push(<line key="rot-line" x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} stroke="var(--cyan)" strokeWidth={1} />);
        overlay.push(<circle key="rot" data-handle="rotate" data-testid="handle-rotate" className="handle handle--rotate" cx={rot.x} cy={rot.y} r={6} />);
      }
    }
    if (cropId) {
      const el = findById(doc.elements, cropId);
      if (el) overlay.push(<polygon key="crop" className="crop-outline" points={poly(el)} />);
    }
    const mt = maskEdit ? findById(doc.elements, maskEdit.id) : null;
    const masset = mt?.type === "image" && mt.assetId ? doc.assets.find((a) => a.id === mt.assetId) : null;
    if (maskEdit && mt?.type === "image" && masset) {
      const aw = masset.width;
      const ah = masset.height;
      const nToS = (n: Point) => toScreen(localToWorld(mt, sourceToLocal(mt, aw, ah, n)));
      const lToS = (q: Point) => toScreen(localToWorld(mt, q));
      const pts = (arr: Point[]) => arr.map((q) => `${q.x},${q.y}`).join(" ");
      overlay.push(<polygon key="mask-frame" className="crop-outline" points={poly(mt)} />);
      if (mt.mask && !maskEdit.drawing) {
        const o = maskOutlineLocal(mt, aw, ah);
        if (o) overlay.push(<polygon key="mask-outline" className="mask-outline" data-testid="mask-outline" points={pts(outlinePolygon(o).map(lToS))} />);
        if (mt.mask.shape === "polygon") {
          const vs = mt.mask.points.map(nToS);
          vs.forEach((v, i) => {
            const w = vs[(i + 1) % vs.length];
            overlay.push(<circle key={`mm${i}`} data-mask-mid={i} className="mask-mid" cx={(v.x + w.x) / 2} cy={(v.y + w.y) / 2} r={3.5} />);
          });
          vs.forEach((v, i) =>
            overlay.push(<rect key={`mv${i}`} data-mask-vertex={i} data-testid="mask-vertex" className="mask-vertex" x={v.x - 4.5} y={v.y - 4.5} width={9} height={9} rx={2} />),
          );
        } else {
          const b = boundsOfPoints(mt.mask.points);
          const corners: [Handle, Point][] = [
            ["nw", { x: b.x, y: b.y }],
            ["ne", { x: b.x + b.width, y: b.y }],
            ["se", { x: b.x + b.width, y: b.y + b.height }],
            ["sw", { x: b.x, y: b.y + b.height }],
          ];
          for (const [h, n] of corners) {
            const v = nToS(n);
            overlay.push(<rect key={`mc${h}`} data-mask-corner={h} data-testid={`mask-corner-${h}`} className="mask-vertex" x={v.x - 4.5} y={v.y - 4.5} width={9} height={9} rx={2} />);
          }
        }
      }
      if (maskDraft && maskEdit.drawing) {
        if (maskEdit.tool === "rect" || maskEdit.tool === "ellipse") {
          const o = maskOutlineLocal({ ...mt, mask: { shape: maskEdit.tool, points: maskDraft, feather: 0, invert: false } }, aw, ah);
          if (o) overlay.push(<polygon key="mask-draft" className="mask-outline" points={pts(outlinePolygon(o).map(lToS))} />);
        } else {
          const vs = maskDraft.map(nToS);
          const line = maskCursor && maskEdit.tool === "polygon" ? [...vs, toScreen(maskCursor)] : vs;
          overlay.push(<polyline key="mask-draft" className="mask-draft" points={pts(line)} />);
          if (maskEdit.tool === "polygon") {
            vs.forEach((v, i) =>
              overlay.push(<circle key={`md${i}`} className={i === 0 && vs.length >= 3 ? "mask-vertex mask-vertex--close" : "mask-vertex"} cx={v.x} cy={v.y} r={i === 0 ? 6 : 4} />),
            );
          }
        }
      }
    }
    const W = doc.project.width;
    const H = doc.project.height;
    guides.xs.forEach((x, i) => {
      const a = toScreen({ x, y: 0 });
      const b = toScreen({ x, y: H });
      overlay.push(<line key={`gx${i}`} className="guide" x1={a.x} y1={a.y - 20} x2={b.x} y2={b.y + 20} />);
    });
    guides.ys.forEach((y, i) => {
      const a = toScreen({ x: 0, y });
      const b = toScreen({ x: W, y });
      overlay.push(<line key={`gy${i}`} className="guide" x1={a.x - 20} y1={a.y} x2={b.x + 20} y2={b.y} />);
    });
    if (marquee) {
      const tl = toScreen(marquee);
      overlay.push(<rect key="marquee" className="marquee" x={tl.x} y={tl.y} width={marquee.width * z} height={marquee.height * z} />);
    }
  }

  const editing = editingTextId ? findById(doc.elements, editingTextId) : null;
  const cls = ["stage", spaceDown ? "stage--pan" : "", panning ? "stage--panning" : "", dropActive ? "stage--drop" : ""].join(" ");
  const hoverEl = hoverId ? findById(doc.elements, hoverId) : null;
  const cursor = maskEdit?.drawing ? "crosshair" : !spaceDown && !panning && hoverEl && !isLockedInTree(doc.elements, hoverEl.id) ? (cropId ? "grab" : "move") : undefined;

  return (
    <div
      ref={containerRef}
      className={cls}
      tabIndex={0}
      aria-label="Design canvas"
      data-testid="stage"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => !gesture.current && getState().hoverId && setState({ hoverId: null })}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} data-testid="design-canvas" />
      <svg className="overlay">
        {overlay}
        {tag && (
          <g transform={`translate(${tag.x} ${tag.y})`}>
            <rect className="size-tag-bg" x={0} y={0} width={tag.text.length * 7 + 12} height={18} rx={3} />
            <text className="size-tag" x={6} y={13}>
              {tag.text}
            </text>
          </g>
        )}
      </svg>
      {editing?.type === "text" && <TextEditor el={editing} view={view} />}
      {cropId && !preview && (
        <div className="stage-hint" onPointerDown={(e) => e.stopPropagation()}>
          <span>Drag to reposition the photo. Scroll to zoom. The original file is not changed.</span>
          <button className="btn btn--primary btn--sm" onClick={() => setState({ cropId: null })}>
            Done
          </button>
        </div>
      )}
      {maskEdit && !preview && (
        <div className="stage-hint" data-testid="mask-hint" onPointerDown={(e) => e.stopPropagation()}>
          <span>{maskHint(maskEdit, maskDraft?.length ?? 0)}</span>
          <button className="btn btn--primary btn--sm" onClick={exitMaskEdit}>
            Done
          </button>
        </div>
      )}
      {enteredGroup && !cropId && !maskEdit && !preview && (
        <div className="stage-hint" onPointerDown={(e) => e.stopPropagation()}>
          <span>Editing inside “{findById(doc.elements, enteredGroup)?.name}”.</span>
          <button className="btn btn--sm" onClick={() => setState({ enteredGroup: null, selection: [enteredGroup] })}>
            Exit group
          </button>
        </div>
      )}
    </div>
  );
}

function maskHint(edit: { tool: string; drawing: boolean }, draftLength: number): string {
  if (edit.drawing) {
    if (edit.tool === "polygon")
      return draftLength >= 3
        ? "Keep clicking to add points. Click the first point, double-click or press Enter to close. Backspace removes the last point."
        : "Click around the subject to place points.";
    if (edit.tool === "lasso") return "Drag around the subject to draw a freehand mask.";
    return "Drag across the photo to draw the shape.";
  }
  if (edit.tool === "polygon") return "Drag points to adjust. Drag a midpoint to add a point; Alt+click a point to remove it. Drag inside to move the mask.";
  return "Drag the corners to resize the mask, or drag inside it to move it. The original photo is not changed.";
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** In-place text editing: a textarea styled like the text element, over the canvas. */
function TextEditor({ el, view }: { el: TextElement; view: { zoom: number; panX: number; panY: number } }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = ref.current!;
    t.focus();
    t.select();
  }, [el.id]);
  useLayoutEffect(() => {
    const t = ref.current!;
    t.style.height = "0px";
    t.style.height = `${Math.max(t.scrollHeight, el.height * view.zoom)}px`;
  });
  const finish = () => {
    const s = getState();
    const current = s.doc ? findById(s.doc.elements, el.id) : null;
    if (current?.type === "text" && current.text.trim() === "") {
      commit((d) => deleteElements(d, [el.id]), { selection: [] });
    }
    setState({ editingTextId: null });
  };
  const z = view.zoom;
  const style: CSSProperties = {
    left: view.panX + el.x * z,
    top: view.panY + el.y * z,
    width: el.width * z + 2,
    font: `${el.italic ? "italic " : ""}${el.fontWeight} ${el.fontSize * z}px "${el.fontFamily}", sans-serif`,
    lineHeight: `${el.fontSize * el.lineHeight * z}px`,
    letterSpacing: `${el.letterSpacing * z}px`,
    color: el.fill,
    textAlign: el.align,
    textTransform: el.uppercase ? "uppercase" : "none",
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  };
  return (
    <textarea
      ref={ref}
      className="text-editor"
      data-testid="text-editor"
      style={style}
      value={el.text}
      spellCheck
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => commit((d) => updateElement(d, el.id, { text: e.target.value }), { merge: `text:${el.id}` })}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}
