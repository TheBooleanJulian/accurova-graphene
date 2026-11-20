// Pure geometry: rotation, bounds, hit-testing, resize and snapping maths.
import type { Element } from "./types.ts";

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RotatedBox extends Box {
  rotation: number;
}

export const DEG = Math.PI / 180;

export function rotateVec(v: Point, deg: number): Point {
  if (!deg) return { x: v.x, y: v.y };
  const r = deg * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function rotateAround(p: Point, pivot: Point, deg: number): Point {
  const v = rotateVec({ x: p.x - pivot.x, y: p.y - pivot.y }, deg);
  return { x: pivot.x + v.x, y: pivot.y + v.y };
}

export function centerOf(b: Box): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Corners in world space: top-left, top-right, bottom-right, bottom-left. */
export function cornersOf(b: RotatedBox): Point[] {
  const c = centerOf(b);
  const hw = b.width / 2;
  const hh = b.height / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((v) => {
    const r = rotateVec(v, b.rotation);
    return { x: c.x + r.x, y: c.y + r.y };
  });
}

export function boundsOfPoints(points: Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Axis-aligned bounds of an element in world space (groups use their derived bounds). */
export function aabbOf(el: RotatedBox): Box {
  if (!el.rotation) return { x: el.x, y: el.y, width: el.width, height: el.height };
  return boundsOfPoints(cornersOf(el));
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boundsOfPoints(boxes.flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height }]));
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** World point → the element's local frame (origin at its unrotated top-left). */
export function worldToLocal(b: RotatedBox, p: Point): Point {
  const c = centerOf(b);
  const v = rotateVec({ x: p.x - c.x, y: p.y - c.y }, -b.rotation);
  return { x: v.x + b.width / 2, y: v.y + b.height / 2 };
}

export function localToWorld(b: RotatedBox, p: Point): Point {
  const c = centerOf(b);
  const v = rotateVec({ x: p.x - b.width / 2, y: p.y - b.height / 2 }, b.rotation);
  return { x: c.x + v.x, y: c.y + v.y };
}

/** Hit-test a single (non-group) element. `tolerance` is in document px. */
export function hitsElement(el: Element, p: Point, tolerance: number): boolean {
  const l = worldToLocal(el, p);
  if (el.type === "shape" && (el.kind === "line" || el.kind === "arrow")) {
    const halfThickness = Math.max(el.height / 2, (el.stroke?.width ?? 2) / 2, tolerance);
    return l.x >= -tolerance && l.x <= el.width + tolerance && Math.abs(l.y - el.height / 2) <= halfThickness;
  }
  return l.x >= -tolerance && l.x <= el.width + tolerance && l.y >= -tolerance && l.y <= el.height + tolerance;
}

// ---------------------------------------------------------------------------
// Resize

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLE_DIRS: Record<Handle, { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }> = {
  n: { hx: 0, hy: -1 },
  s: { hx: 0, hy: 1 },
  e: { hx: 1, hy: 0 },
  w: { hx: -1, hy: 0 },
  ne: { hx: 1, hy: -1 },
  nw: { hx: -1, hy: -1 },
  se: { hx: 1, hy: 1 },
  sw: { hx: -1, hy: 1 },
};

export interface ResizeOptions {
  keepRatio: boolean;
  fromCenter: boolean;
  minSize: number;
}

export interface ResizeResult extends Box {
  /** New top-left expressed in the ORIGINAL element's local frame (used to keep image content fixed while a frame edge moves). */
  localLeft: number;
  localTop: number;
}

/**
 * Resize a (possibly rotated) box by dragging one of its handles to `pointer`
 * (world space). The opposite edge/corner stays fixed (or the centre, with
 * `fromCenter`). Rotation is preserved.
 */
export function resizeBox(box: RotatedBox, handle: Handle, pointer: Point, opts: ResizeOptions): ResizeResult {
  const { hx, hy } = HANDLE_DIRS[handle];
  const w0 = box.width;
  const h0 = box.height;
  const p = worldToLocal(box, pointer);
  const min = Math.max(1, opts.minSize);

  let left = 0;
  let right = w0;
  let top = 0;
  let bottom = h0;

  if (opts.fromCenter) {
    if (hx !== 0) {
      const half = Math.max(min / 2, Math.abs(p.x - w0 / 2));
      left = w0 / 2 - half;
      right = w0 / 2 + half;
    }
    if (hy !== 0) {
      const half = Math.max(min / 2, Math.abs(p.y - h0 / 2));
      top = h0 / 2 - half;
      bottom = h0 / 2 + half;
    }
  } else {
    if (hx < 0) left = Math.min(p.x, right - min);
    if (hx > 0) right = Math.max(p.x, left + min);
    if (hy < 0) top = Math.min(p.y, bottom - min);
    if (hy > 0) bottom = Math.max(p.y, top + min);
  }

  if (opts.keepRatio && w0 > 0 && h0 > 0) {
    const ratio = w0 / h0;
    let w = right - left;
    let h = bottom - top;
    if (hx !== 0 && hy !== 0) {
      const s = Math.max(w / w0, h / h0);
      w = w0 * s;
      h = h0 * s;
    } else if (hx !== 0) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
    if (w < min || h < min) {
      const s = Math.max(min / w, min / h);
      w *= s;
      h *= s;
    }
    if (opts.fromCenter) {
      left = w0 / 2 - w / 2;
      right = w0 / 2 + w / 2;
      top = h0 / 2 - h / 2;
      bottom = h0 / 2 + h / 2;
    } else {
      // Anchor the opposite side; side handles keep the perpendicular axis centred.
      if (hx < 0) left = right - w;
      else if (hx > 0) right = left + w;
      else {
        left = w0 / 2 - w / 2;
        right = w0 / 2 + w / 2;
      }
      if (hy < 0) top = bottom - h;
      else if (hy > 0) bottom = top + h;
      else {
        top = h0 / 2 - h / 2;
        bottom = h0 / 2 + h / 2;
      }
    }
  }

  const width = right - left;
  const height = bottom - top;
  const c = localToWorld(box, { x: (left + right) / 2, y: (top + bottom) / 2 });
  return { x: c.x - width / 2, y: c.y - height / 2, width, height, localLeft: left, localTop: top };
}

/** Angle in degrees (0 = up) from centre to pointer, for the rotation handle. */
export function rotationFromPointer(center: Point, pointer: Point): number {
  const a = Math.atan2(pointer.y - center.y, pointer.x - center.x) / DEG + 90;
  return normalizeAngle(a);
}

export function normalizeAngle(a: number): number {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

export function snapAngle(a: number, step: number): number {
  return normalizeAngle(Math.round(a / step) * step);
}

// ---------------------------------------------------------------------------
// Snapping

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  guidesX: number[];
  guidesY: number[];
}

function bestSnap(values: number[], targets: number[], threshold: number): { delta: number; target: number } | null {
  let best: { delta: number; target: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, target: t };
    }
  }
  return best;
}

/** Snap a moving box (already offset by dx/dy) to target lines on its edges and centre. */
export function snapMove(box: Box, dx: number, dy: number, targets: SnapTargets, threshold: number): SnapResult {
  const moved = { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
  const xs = [moved.x, moved.x + moved.width / 2, moved.x + moved.width];
  const ys = [moved.y, moved.y + moved.height / 2, moved.y + moved.height];
  const sx = bestSnap(xs, targets.xs, threshold);
  const sy = bestSnap(ys, targets.ys, threshold);
  const ndx = dx + (sx?.delta ?? 0);
  const ndy = dy + (sy?.delta ?? 0);
  const final = { x: box.x + ndx, y: box.y + ndy };
  const fxs = [final.x, final.x + box.width / 2, final.x + box.width];
  const fys = [final.y, final.y + box.height / 2, final.y + box.height];
  const near = (vals: number[], t: number) => vals.some((v) => Math.abs(v - t) < 0.5);
  return {
    dx: ndx,
    dy: ndy,
    guidesX: sx ? [...new Set(targets.xs.filter((t) => near(fxs, t)))] : [],
    guidesY: sy ? [...new Set(targets.ys.filter((t) => near(fys, t)))] : [],
  };
}

/** Snap a single coordinate. */
export function snapScalar(v: number, targets: number[], threshold: number): { value: number; target: number | null } {
  const s = bestSnap([v], targets, threshold);
  return s ? { value: v + s.delta, target: s.target } : { value: v, target: null };
}

/** Snap target lines for a canvas: edges, centre lines and margins. */
export function canvasTargets(width: number, height: number, margin: number): SnapTargets {
  const xs = [0, width / 2, width];
  const ys = [0, height / 2, height];
  if (margin > 0) {
    xs.push(margin, width - margin);
    ys.push(margin, height - margin);
  }
  return { xs, ys };
}

export function elementTargets(boxes: Box[]): SnapTargets {
  return {
    xs: boxes.flatMap((b) => [b.x, b.x + b.width / 2, b.x + b.width]),
    ys: boxes.flatMap((b) => [b.y, b.y + b.height / 2, b.y + b.height]),
  };
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
