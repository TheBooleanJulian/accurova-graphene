// The single renderer used for the editor canvas, thumbnails and export, so
// what you see while editing is what you export. It draws a GrapheneDocument
// in document coordinates; the caller sets up the transform (zoom / export scale).
import { cssColor } from "../model/color.ts";
import { imageDrawPlan } from "../model/image.ts";
import { maskOutlineLocal, type LocalOutline } from "../model/mask.ts";
import { fontString, layoutText, lineOffset } from "../model/text.ts";
import type {
  AssetRecord,
  Element,
  Fill,
  GrapheneDocument,
  IconElement,
  ImageElement,
  ShapeElement,
  TextElement,
} from "../model/types.ts";
import { canvasMeasure, fontMetrics, supportsLetterSpacing } from "./measure.ts";
import { arrowHeadPath, shapePath } from "./shapes.ts";

type Ctx = CanvasRenderingContext2D;

/** A drawable for an asset plus the mapping from original-asset pixels to its own pixels. */
export interface ResolvedImage {
  source: CanvasImageSource;
  /** Original-asset pixel at the drawable's (0, 0). */
  originX: number;
  originY: number;
  /** Drawable pixels per original-asset pixel. */
  scaleX: number;
  scaleY: number;
}

export interface RenderOptions {
  /** Device pixels per document pixel (zoom × devicePixelRatio, or the export scale). Sizes shadows and offscreen buffers. */
  pixelRatio: number;
  resolveImage: (el: ImageElement, asset: AssetRecord) => ResolvedImage | null;
  /** Elements to skip (e.g. text currently being edited in the overlay). */
  hidden?: ReadonlySet<string>;
  /** Draw empty/loading frames as placeholders (editor) or skip them (export). */
  drawPlaceholders: boolean;
  /** Paint the document background (false = transparent export). */
  background: boolean;
  /** Image element in crop mode: draw the uncropped image as a ghost behind it. */
  cropModeId?: string | null;
  /** Image element whose mask is being edited: draw the masked-out area as a ghost. */
  maskEditId?: string | null;
}

const supportsFilter = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

export function makeFill(ctx: Ctx, fill: Fill, w: number, h: number): string | CanvasGradient {
  if (typeof fill === "string") return cssColor(fill);
  const a = (fill.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  for (const s of fill.stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), cssColor(s.color));
  return g;
}

function applyShadow(ctx: Ctx, el: Element, pixelRatio: number): void {
  if (!el.shadow) return;
  ctx.shadowColor = cssColor(el.shadow.color);
  ctx.shadowBlur = el.shadow.blur * pixelRatio;
  ctx.shadowOffsetX = el.shadow.offsetX * pixelRatio;
  ctx.shadowOffsetY = el.shadow.offsetY * pixelRatio;
}

function clearShadow(ctx: Ctx): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function renderDocument(ctx: Ctx, doc: GrapheneDocument, opts: RenderOptions): void {
  const { width, height, background } = doc.project;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (opts.background && background) {
    ctx.fillStyle = makeFill(ctx, background, width, height);
    ctx.fillRect(0, 0, width, height);
  }
  const assets = new Map(doc.assets.map((a) => [a.id, a]));
  for (const el of doc.elements) renderElement(ctx, el, assets, opts, 1);
  ctx.restore();
}

function renderElement(ctx: Ctx, el: Element, assets: Map<string, AssetRecord>, opts: RenderOptions, parentAlpha: number): void {
  if (!el.visible) return;
  if (el.type === "group") {
    const alpha = parentAlpha * el.opacity;
    for (const child of el.children) renderElement(ctx, child, assets, opts, alpha);
    return;
  }
  if (opts.hidden?.has(el.id)) return;
  ctx.save();
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.translate(-el.width / 2, -el.height / 2);
  ctx.globalAlpha = parentAlpha * el.opacity;
  switch (el.type) {
    case "text":
      drawText(ctx, el, opts);
      break;
    case "shape":
      drawShape(ctx, el, opts);
      break;
    case "icon":
      drawIcon(ctx, el, opts);
      break;
    case "image":
      drawImageElement(ctx, el, assets, opts, parentAlpha);
      break;
  }
  ctx.restore();
}

// --- text -------------------------------------------------------------------

function drawRun(ctx: Ctx, text: string, x: number, y: number, ls: number, stroke: boolean): void {
  if (!ls || supportsLetterSpacing) {
    if (stroke) ctx.strokeText(text, x, y);
    else ctx.fillText(text, x, y);
    return;
  }
  let cx = x;
  for (const ch of text) {
    if (stroke) ctx.strokeText(ch, cx, y);
    else ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
}

export function drawText(ctx: Ctx, el: TextElement, opts: RenderOptions): void {
  const layout = layoutText(el, canvasMeasure);
  const font = fontString(el);
  const { ascent, descent } = fontMetrics(font);
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  if (supportsLetterSpacing) ctx.letterSpacing = `${el.letterSpacing}px`;
  applyShadow(ctx, el, opts.pixelRatio);
  for (const line of layout.lines) {
    if (!line.text) continue;
    const x = lineOffset(el.align, el.width, line.width);
    const y = line.top + (layout.lineHeightPx - (ascent + descent)) / 2 + ascent;
    if (el.stroke && el.stroke.width > 0) {
      ctx.strokeStyle = cssColor(el.stroke.color);
      ctx.lineWidth = el.stroke.width * 2; // centred stroke drawn under the fill → visible outer half
      ctx.lineJoin = "round";
      drawRun(ctx, line.text, x, y, el.letterSpacing, true);
      clearShadow(ctx);
    }
    ctx.fillStyle = cssColor(el.fill);
    drawRun(ctx, line.text, x, y, el.letterSpacing, false);
  }
  if (supportsLetterSpacing) ctx.letterSpacing = "0px";
}

// --- shapes and icons ---------------------------------------------------------

function drawShape(ctx: Ctx, el: ShapeElement, opts: RenderOptions): void {
  const path = shapePath(el);
  const isLine = el.kind === "line" || el.kind === "arrow";
  applyShadow(ctx, el, opts.pixelRatio);
  if (!isLine && el.fill) {
    ctx.fillStyle = makeFill(ctx, el.fill, el.width, el.height);
    ctx.fill(path);
    clearShadow(ctx);
  }
  if (el.stroke && el.stroke.width > 0) {
    ctx.strokeStyle = cssColor(el.stroke.color);
    ctx.lineWidth = el.stroke.width;
    ctx.lineJoin = "round";
    ctx.lineCap = isLine ? "round" : "butt";
    ctx.stroke(path);
    if (el.kind === "arrow") {
      ctx.fillStyle = cssColor(el.stroke.color);
      ctx.fill(arrowHeadPath(el));
    }
  }
}

const pathCache = new Map<string, Path2D>();
function cachedPath(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    if (pathCache.size > 5000) pathCache.clear();
    pathCache.set(d, p);
  }
  return p;
}

function drawIcon(ctx: Ctx, el: IconElement, opts: RenderOptions): void {
  const s = Math.min(el.width, el.height) / 24;
  if (s <= 0) return;
  ctx.translate((el.width - 24 * s) / 2, (el.height - 24 * s) / 2);
  ctx.scale(s, s);
  applyShadow(ctx, el, opts.pixelRatio);
  ctx.strokeStyle = cssColor(el.color);
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of el.paths) ctx.stroke(cachedPath(d));
}

// --- images -------------------------------------------------------------------

function roundRectPath(w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) p.rect(0, 0, w, h);
  else p.roundRect(0, 0, w, h, rr);
  return p;
}

function drawPlaceholder(ctx: Ctx, el: ImageElement, label: string, loading: boolean): void {
  const w = el.width;
  const h = el.height;
  const clip = roundRectPath(w, h, el.cornerRadius);
  ctx.save();
  ctx.clip(clip);
  ctx.fillStyle = loading ? "#E7EBF3" : "#DCE2EE";
  ctx.fillRect(0, 0, w, h);
  if (!loading) {
    ctx.strokeStyle = "rgba(7, 29, 67, 0.08)";
    ctx.lineWidth = Math.max(2, Math.min(w, h) / 60);
    const step = Math.max(12, Math.min(w, h) / 10);
    for (let x = -h; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = "rgba(7, 29, 67, 0.45)";
  ctx.lineWidth = Math.max(1, Math.min(w, h) / 200);
  ctx.stroke(clip);
  ctx.restore();
  const size = Math.max(9, Math.min(28, Math.min(w, h) / 9));
  ctx.fillStyle = "rgba(7, 29, 67, 0.75)";
  ctx.font = `600 ${size}px "IBM Plex Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = (loading ? "Loading…" : label || "Empty frame").split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const t = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(t).width > w * 0.85 && cur) {
      lines.push(cur);
      cur = word;
    } else cur = t;
  }
  lines.push(cur);
  const shown = lines.slice(0, Math.max(1, Math.floor((h * 0.8) / (size * 1.25))));
  shown.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (shown.length - 1) / 2) * size * 1.25));
}

function applyFades(c: Ctx, w: number, h: number, fade: ImageElement["fade"]): void {
  c.globalCompositeOperation = "destination-in";
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    return g;
  };
  if (fade.left > 0) {
    c.fillStyle = edge(0, 0, fade.left, 0);
    c.fillRect(0, 0, w, h);
  }
  if (fade.right > 0) {
    c.fillStyle = edge(w, 0, w - fade.right, 0);
    c.fillRect(0, 0, w, h);
  }
  if (fade.top > 0) {
    c.fillStyle = edge(0, 0, 0, fade.top);
    c.fillRect(0, 0, w, h);
  }
  if (fade.bottom > 0) {
    c.fillStyle = edge(0, h, 0, h - fade.bottom);
    c.fillRect(0, 0, w, h);
  }
  c.globalCompositeOperation = "source-over";
}

const MAX_OFFSCREEN = 8192;

function outlinePath(o: LocalOutline): Path2D {
  const p = new Path2D();
  if (o.kind === "ellipse") {
    p.ellipse(o.cx, o.cy, Math.max(o.rx, 0), Math.max(o.ry, 0), 0, 0, Math.PI * 2);
  } else if (o.points.length) {
    p.moveTo(o.points[0].x, o.points[0].y);
    for (const q of o.points.slice(1)) p.lineTo(q.x, q.y);
    p.closePath();
  }
  return p;
}

/** Keep only the masked area of an offscreen layer (o is scaled by k = offscreen px per document px). */
function applyMask(o: Ctx, outline: LocalOutline, mask: NonNullable<ImageElement["mask"]>, w: number, h: number, k: number): void {
  const m = document.createElement("canvas");
  m.width = o.canvas.width;
  m.height = o.canvas.height;
  const mc = m.getContext("2d")!;
  mc.scale(k, k);
  mc.fillStyle = "#000";
  const path = outlinePath(outline);
  const blur = mask.feather > 0 && supportsFilter ? `blur(${(mask.feather * k) / 2}px)` : "none";
  if (mask.invert) {
    mc.fillRect(0, 0, w, h);
    mc.globalCompositeOperation = "destination-out";
  }
  mc.filter = blur;
  mc.fill(path);
  o.save();
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = "destination-in";
  o.drawImage(m, 0, 0);
  o.restore();
}

function drawImageElement(ctx: Ctx, el: ImageElement, assets: Map<string, AssetRecord>, opts: RenderOptions, parentAlpha: number): void {
  const asset = el.assetId ? assets.get(el.assetId) : undefined;
  if (!asset) {
    if (opts.drawPlaceholders) drawPlaceholder(ctx, el, el.assetId ? `Missing asset: ${el.name}` : el.placeholder || el.name, false);
    return;
  }
  const resolved = opts.resolveImage(el, asset);
  if (!resolved) {
    if (opts.drawPlaceholders) drawPlaceholder(ctx, el, "", true);
    return;
  }
  // Protected assets: appearance is never altered — no opacity, no adjustments.
  const isProtected = asset.integrity === "protected";
  if (isProtected) ctx.globalAlpha = parentAlpha;

  const plan = imageDrawPlan(el, asset.width, asset.height);
  const src = {
    x: (plan.sx - resolved.originX) * resolved.scaleX,
    y: (plan.sy - resolved.originY) * resolved.scaleY,
    w: plan.sw * resolved.scaleX,
    h: plan.sh * resolved.scaleY,
  };

  if (opts.cropModeId === el.id && el.fit === "cover") {
    // Ghost of the whole source image, so the user can see what the crop hides.
    const k = plan.dw / plan.sw;
    const ox = plan.dx - (plan.sx - resolved.originX) * k;
    const oy = plan.dy - (plan.sy - resolved.originY) * k;
    const sw = (resolved.source as { width: number }).width;
    const sh = (resolved.source as { height: number }).height;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(resolved.source, ox, oy, (sw / resolved.scaleX) * k, (sh / resolved.scaleY) * k);
    ctx.restore();
  }

  const adj = el.adjustments;
  const wantsFilter = !isProtected && supportsFilter && (adj.brightness !== 100 || adj.contrast !== 100 || adj.saturation !== 100);
  const f = el.fade;
  const outline = el.mask ? maskOutlineLocal(el, asset.width, asset.height) : null;
  const needsOffscreen = el.cornerRadius > 0 || f.left > 0 || f.right > 0 || f.top > 0 || f.bottom > 0 || wantsFilter || !!outline;
  const filter = wantsFilter ? `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)` : "none";

  if (!needsOffscreen) {
    applyShadow(ctx, el, opts.pixelRatio);
    ctx.drawImage(resolved.source, src.x, src.y, src.w, src.h, plan.dx, plan.dy, plan.dw, plan.dh);
    clearShadow(ctx);
  } else {
    const scale = Math.min(opts.pixelRatio, MAX_OFFSCREEN / Math.max(el.width, el.height, 1));
    const ow = Math.max(1, Math.ceil(el.width * scale));
    const oh = Math.max(1, Math.ceil(el.height * scale));
    const off = document.createElement("canvas");
    off.width = ow;
    off.height = oh;
    const o = off.getContext("2d")!;
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    o.scale(ow / el.width, oh / el.height);
    if (el.cornerRadius > 0) o.clip(roundRectPath(el.width, el.height, el.cornerRadius));
    if (wantsFilter) o.filter = filter;
    o.drawImage(resolved.source, src.x, src.y, src.w, src.h, plan.dx, plan.dy, plan.dw, plan.dh);
    o.filter = "none";
    if (outline && opts.maskEditId === el.id) {
      // Ghost of the masked-out area while the mask is being edited.
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(off, 0, 0, el.width, el.height);
      ctx.restore();
    }
    if (outline) applyMask(o, outline, el.mask!, el.width, el.height, ow / el.width);
    applyFades(o, el.width, el.height, f);
    applyShadow(ctx, el, opts.pixelRatio);
    ctx.drawImage(off, 0, 0, el.width, el.height);
    clearShadow(ctx);
  }

  if (el.stroke && el.stroke.width > 0) {
    ctx.strokeStyle = cssColor(el.stroke.color);
    ctx.lineWidth = el.stroke.width;
    ctx.stroke(roundRectPath(el.width, el.height, el.cornerRadius));
  }
}
