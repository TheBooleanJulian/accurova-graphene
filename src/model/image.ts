// Non-destructive image framing maths. The original asset is never modified:
// an image element is a frame plus a normalised crop rectangle of the source.
// Neither fit mode can stretch: both scale the source uniformly.
import type { Crop, ImageElement } from "./types.ts";

export interface DrawPlan {
  /** Source rectangle in original-asset pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rectangle in the element's local frame (document px). */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

type Frame = Pick<ImageElement, "width" | "height" | "fit" | "crop">;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

export function sanitizeCrop(c: Crop): Crop {
  const width = clamp(c.width, 1e-4, 1);
  const height = clamp(c.height, 1e-4, 1);
  return { x: clamp(c.x, 0, 1 - width), y: clamp(c.y, 0, 1 - height), width, height };
}

/** Where to draw the source so it fills (cover) or fits (contain) the frame — uniform scale only. */
export function imageDrawPlan(el: Frame, assetW: number, assetH: number): DrawPlan {
  const c = sanitizeCrop(el.crop);
  const cx = c.x * assetW;
  const cy = c.y * assetH;
  const cw = c.width * assetW;
  const ch = c.height * assetH;
  const w = Math.max(el.width, 1e-6);
  const h = Math.max(el.height, 1e-6);
  if (el.fit === "contain") {
    const k = Math.min(w / cw, h / ch);
    const dw = cw * k;
    const dh = ch * k;
    return { sx: cx, sy: cy, sw: cw, sh: ch, dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh };
  }
  // cover: show the centred part of the crop that matches the frame's aspect.
  const k = Math.max(w / cw, h / ch);
  const vw = w / k;
  const vh = h / k;
  return { sx: cx + (cw - vw) / 2, sy: cy + (ch - vh) / 2, sw: vw, sh: vh, dx: 0, dy: 0, dw: w, dh: h };
}

/**
 * The largest crop with the frame's aspect ratio that fits inside the image,
 * zoomed in by `zoom` (1 = as large as possible) around a normalised centre.
 */
export function coverCrop(assetW: number, assetH: number, frameAspect: number, zoom = 1, center = { x: 0.5, y: 0.5 }): Crop {
  let w = assetW;
  let h = assetW / frameAspect;
  if (h > assetH) {
    h = assetH;
    w = assetH * frameAspect;
  }
  w /= Math.max(zoom, 1);
  h /= Math.max(zoom, 1);
  const x = clamp(center.x * assetW - w / 2, 0, assetW - w);
  const y = clamp(center.y * assetH - h / 2, 0, assetH - h);
  return { x: x / assetW, y: y / assetH, width: w / assetW, height: h / assetH };
}

function toCrop(sx: number, sy: number, sw: number, sh: number, assetW: number, assetH: number): Crop {
  sw = Math.min(sw, assetW);
  sh = Math.min(sh, assetH);
  sx = clamp(sx, 0, assetW - sw);
  sy = clamp(sy, 0, assetH - sh);
  return { x: sx / assetW, y: sy / assetH, width: sw / assetW, height: sh / assetH };
}

/**
 * A cover-fit frame was resized to newW × newH, its new top-left sitting at
 * (localLeft, localTop) in the old frame. Keep the image content where it was
 * on the canvas — moving an edge reveals or hides content — and only zoom in
 * when the frame would otherwise run past the edge of the source image.
 */
export function refitCropAfterResize(
  el: Frame,
  assetW: number,
  assetH: number,
  localLeft: number,
  localTop: number,
  newW: number,
  newH: number,
): Crop {
  if (el.fit !== "cover") return el.crop;
  const p = imageDrawPlan(el, assetW, assetH);
  const k = el.width / p.sw; // document px per source px
  let sw = newW / k;
  let sh = newH / k;
  let sx = p.sx + localLeft / k;
  let sy = p.sy + localTop / k;
  if (sw > assetW || sh > assetH) {
    const k2 = Math.max(newW / assetW, newH / assetH);
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    sw = newW / k2;
    sh = newH / k2;
    sx = cx - sw / 2;
    sy = cy - sh / 2;
  }
  return toCrop(sx, sy, sw, sh, assetW, assetH);
}

/** Pan the image inside a cover frame by a drag of (dx, dy) in the element's local frame. */
export function panCrop(el: Frame, assetW: number, assetH: number, dx: number, dy: number): Crop {
  const p = imageDrawPlan({ ...el, fit: "cover" }, assetW, assetH);
  const k = el.width / p.sw;
  return toCrop(p.sx - dx / k, p.sy - dy / k, p.sw, p.sh, assetW, assetH);
}

/** Current zoom of a cover frame relative to the largest possible crop (1 = zoomed out fully). */
export function cropZoom(el: Frame, assetW: number, assetH: number): number {
  const p = imageDrawPlan({ ...el, fit: "cover" }, assetW, assetH);
  const base = coverCrop(assetW, assetH, el.width / el.height);
  return (base.width * assetW) / p.sw;
}

/** Set the zoom of a cover frame, keeping the visible centre. */
export function setCropZoom(el: Frame, assetW: number, assetH: number, zoom: number): Crop {
  const p = imageDrawPlan({ ...el, fit: "cover" }, assetW, assetH);
  const center = { x: (p.sx + p.sw / 2) / assetW, y: (p.sy + p.sh / 2) / assetH };
  return coverCrop(assetW, assetH, el.width / el.height, zoom, center);
}

/**
 * Source pixels per document pixel actually displayed. Below 1 the image is
 * being enlarged beyond its native resolution at 1× export; at export scale S
 * anything below S is upscaled.
 */
export function sourcePixelsPerUnit(el: Frame, assetW: number, assetH: number): number {
  const p = imageDrawPlan(el, assetW, assetH);
  return Math.min(p.sw / p.dw, p.sh / p.dh);
}

export function isFullCrop(c: Crop): boolean {
  return c.x <= 1e-6 && c.y <= 1e-6 && c.width >= 1 - 1e-6 && c.height >= 1 - 1e-6;
}

/** The crop actually visible in a cover frame, normalised (crop aspect becomes the frame aspect). */
export function visibleCrop(el: Frame, assetW: number, assetH: number): Crop {
  if (el.fit !== "cover") return sanitizeCrop(el.crop);
  const p = imageDrawPlan(el, assetW, assetH);
  return toCrop(p.sx, p.sy, p.sw, p.sh, assetW, assetH);
}

/** Frame height that shows the current crop without any further cropping (for "fit frame to image"). */
export function naturalHeightFor(el: Frame, assetW: number, assetH: number): number {
  const c = sanitizeCrop(el.crop);
  return el.width * ((c.height * assetH) / (c.width * assetW));
}
