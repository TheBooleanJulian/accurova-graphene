// Non-destructive image masks. Mask points are stored in normalised SOURCE
// image coordinates (0..1 of the original asset), so a mask stays on the
// subject it was drawn around when the frame is cropped, panned, resized or
// rotated. The original pixels are never changed; masking only hides them.
import { boundsOfPoints, localToWorld, type Box, type Point } from "./geometry.ts";
import { imageDrawPlan } from "./image.ts";
import type { ImageElement, ImageMask, MaskShape } from "./types.ts";

type Frame = Pick<ImageElement, "width" | "height" | "fit" | "crop">;

export const MASK_LIMITS = { maxPoints: 4000, minPolygonPoints: 3 };

/** Normalised source point → the element's local frame (document px). */
export function sourceToLocal(el: Frame, assetW: number, assetH: number, p: Point): Point {
  const plan = imageDrawPlan(el, assetW, assetH);
  const k = plan.dw / plan.sw;
  return { x: (p.x * assetW - plan.sx) * k + plan.dx, y: (p.y * assetH - plan.sy) * k + plan.dy };
}

/** The element's local frame → normalised source point. */
export function localToSource(el: Frame, assetW: number, assetH: number, p: Point): Point {
  const plan = imageDrawPlan(el, assetW, assetH);
  const k = plan.dw / plan.sw;
  return { x: ((p.x - plan.dx) / k + plan.sx) / assetW, y: ((p.y - plan.dy) / k + plan.sy) / assetH };
}

/** Bounds of the mask shape in normalised source coordinates. */
export function maskBounds(mask: ImageMask): Box {
  return boundsOfPoints(mask.points);
}

/** Outline of the mask in local coordinates; ellipses are returned analytically. */
export type LocalOutline = { kind: "polygon"; points: Point[] } | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

export function maskOutlineLocal(el: Frame & { mask: ImageMask | null }, assetW: number, assetH: number): LocalOutline | null {
  const m = el.mask;
  if (!m) return null;
  const pts = m.points.map((p) => sourceToLocal(el, assetW, assetH, p));
  if (m.shape === "polygon") return { kind: "polygon", points: pts };
  const b = boundsOfPoints(pts);
  if (m.shape === "rect") {
    return {
      kind: "polygon",
      points: [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y },
        { x: b.x + b.width, y: b.y + b.height },
        { x: b.x, y: b.y + b.height },
      ],
    };
  }
  return { kind: "ellipse", cx: b.x + b.width / 2, cy: b.y + b.height / 2, rx: b.width / 2, ry: b.height / 2 };
}

/** Outline as a polygon (ellipses sampled), for overlays and hit-testing. */
export function outlinePolygon(o: LocalOutline, segments = 72): Point[] {
  if (o.kind === "polygon") return o.points;
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return { x: o.cx + o.rx * Math.cos(a), y: o.cy + o.ry * Math.sin(a) };
  });
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Is a local point visible through the mask? (Feather is ignored; it only softens the edge.) */
export function visibleThroughMask(el: Frame & { mask: ImageMask | null }, assetW: number, assetH: number, local: Point): boolean {
  const o = maskOutlineLocal(el, assetW, assetH);
  if (!o) return true;
  const inside =
    o.kind === "ellipse"
      ? o.rx > 0 && o.ry > 0 && ((local.x - o.cx) / o.rx) ** 2 + ((local.y - o.cy) / o.ry) ** 2 <= 1
      : pointInPolygon(local, o.points);
  return el.mask!.invert ? !inside : inside;
}

/** A rectangle or ellipse mask covering the middle 70 % of what the frame currently shows. */
export function defaultBoxMask(el: Frame, assetW: number, assetH: number, shape: "rect" | "ellipse"): ImageMask {
  const a = localToSource(el, assetW, assetH, { x: el.width * 0.15, y: el.height * 0.15 });
  const b = localToSource(el, assetW, assetH, { x: el.width * 0.85, y: el.height * 0.85 });
  return { shape, points: [a, b], feather: 0, invert: false };
}

/** Check a mask has enough points for its shape. */
export function isUsableMask(m: ImageMask): boolean {
  if (m.shape === "polygon") return m.points.length >= MASK_LIMITS.minPolygonPoints;
  if (m.points.length !== 2) return false;
  const b = boundsOfPoints(m.points);
  return b.width > 1e-6 && b.height > 1e-6;
}

/**
 * Shrink (or grow) the frame to the mask's bounds, keeping the image exactly
 * where it is on the canvas. The selection box then hugs the cut-out.
 * Inverted masks and masks outside the image are left alone.
 */
export function fitFrameToMask<T extends ImageElement>(el: T, assetW: number, assetH: number, pad = 0): T {
  if (!el.mask || el.mask.invert || !isUsableMask(el.mask)) return el;
  const plan = imageDrawPlan(el, assetW, assetH);
  const k = plan.dw / plan.sw; // document px per source px
  const b = maskBounds(el.mask);
  const padN = { x: pad / k / assetW, y: pad / k / assetH };
  const x0 = Math.max(0, b.x - padN.x);
  const y0 = Math.max(0, b.y - padN.y);
  const x1 = Math.min(1, b.x + b.width + padN.x);
  const y1 = Math.min(1, b.y + b.height + padN.y);
  if (x1 <= x0 || y1 <= y0) return el;
  const tl = sourceToLocal(el, assetW, assetH, { x: x0, y: y0 });
  const br = sourceToLocal(el, assetW, assetH, { x: x1, y: y1 });
  const width = br.x - tl.x;
  const height = br.y - tl.y;
  const c = localToWorld(el, { x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2 });
  return {
    ...el,
    x: c.x - width / 2,
    y: c.y - height / 2,
    width,
    height,
    fit: "cover",
    crop: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  };
}

/** Ramer–Douglas–Peucker simplification for freehand lasso paths. */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) return points;
  const sq = tolerance * tolerance;
  const distSq = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    const x = a.x + t * dx - p.x;
    const y = a.y + t * dy - p.y;
    return x * x + y * y;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distSq(points[i], points[s], points[e]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx >= 0 && max > sq) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export const MASK_SHAPE_LABELS: Record<MaskShape, string> = { rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon" };
