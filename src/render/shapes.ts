// Vector paths for shape elements, in the element's local frame (0,0)–(w,h).
import type { Point } from "../model/geometry.ts";
import type { ShapeElement } from "../model/types.ts";

/** Closed polygon with a (clamped) rounding radius per vertex. */
export function roundedPolygon(points: Point[], radii: number[] | number): Path2D {
  const path = new Path2D();
  const n = points.length;
  const r = (i: number) => (Array.isArray(radii) ? radii[i] ?? 0 : radii);
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const start = { x: (points[n - 1].x + points[0].x) / 2, y: (points[n - 1].y + points[0].y) / 2 };
  path.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const radius = Math.max(0, Math.min(r(i), dist(p, prev) / 2, dist(p, next) / 2));
    path.arcTo(p.x, p.y, next.x, next.y, radius);
  }
  path.closePath();
  return path;
}

export function ribbonPoints(w: number, h: number, slantLeft: number, slantRight: number): Point[] {
  return [
    { x: Math.max(slantLeft, 0), y: 0 },
    { x: w - Math.max(-slantRight, 0), y: 0 },
    { x: w - Math.max(slantRight, 0), y: h },
    { x: Math.max(-slantLeft, 0), y: h },
  ];
}

function regularPoints(w: number, h: number, sides: number): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return { x: w / 2 + (w / 2) * Math.cos(a), y: h / 2 + (h / 2) * Math.sin(a) };
  });
}

function starPoints(w: number, h: number, points: number, inner: number): Point[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const k = i % 2 === 0 ? 1 : inner;
    return { x: w / 2 + (w / 2) * k * Math.cos(a), y: h / 2 + (h / 2) * k * Math.sin(a) };
  });
}

/** Arrow head length for a given stroke width. */
export function arrowHead(strokeWidth: number): number {
  return Math.max(10, strokeWidth * 3.5);
}

export function shapePath(el: ShapeElement): Path2D {
  const w = el.width;
  const h = el.height;
  const r = el.cornerRadius;
  switch (el.kind) {
    case "rect": {
      if (r <= 0) {
        const p = new Path2D();
        p.rect(0, 0, w, h);
        return p;
      }
      return roundedPolygon(
        [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
        Math.min(r, w / 2, h / 2),
      );
    }
    case "ellipse": {
      const p = new Path2D();
      p.ellipse(w / 2, h / 2, Math.max(w / 2, 0), Math.max(h / 2, 0), 0, 0, Math.PI * 2);
      return p;
    }
    case "polygon":
      return roundedPolygon(regularPoints(w, h, Math.max(3, el.sides)), r);
    case "star":
      return roundedPolygon(starPoints(w, h, Math.max(3, el.sides), el.innerRatio), r);
    case "ribbon":
      return roundedPolygon(ribbonPoints(w, h, el.slantLeft, el.slantRight), r);
    case "callout": {
      const tail = Math.min(el.tailSize, h * 0.6);
      const bh = h - tail;
      const tx = Math.min(Math.max(el.tailPosition * w, tail), w - tail);
      const half = Math.max(tail * 0.6, 8);
      const pts = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: bh },
        { x: tx + half, y: bh },
        { x: tx - half * 0.4, y: h },
        { x: tx - half, y: bh },
        { x: 0, y: bh },
      ];
      const cr = Math.min(r, w / 2, bh / 2);
      return roundedPolygon(pts, [cr, cr, cr, 0, Math.min(4, cr), 0, cr]);
    }
    case "line":
    case "arrow": {
      const p = new Path2D();
      const end = el.kind === "arrow" ? w - arrowHead(el.stroke?.width ?? 2) * 0.6 : w;
      p.moveTo(0, h / 2);
      p.lineTo(Math.max(0, end), h / 2);
      return p;
    }
  }
}

/** Filled arrow head at the right end of an arrow shape. */
export function arrowHeadPath(el: ShapeElement): Path2D {
  const p = new Path2D();
  const len = arrowHead(el.stroke?.width ?? 2);
  const y = el.height / 2;
  p.moveTo(el.width, y);
  p.lineTo(el.width - len, y - len * 0.55);
  p.lineTo(el.width - len, y + len * 0.55);
  p.closePath();
  return p;
}
