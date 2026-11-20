// High-resolution export. Each image is decoded from the ORIGINAL file at the
// exact pixel size it occupies in the output (never from the editing proxy),
// then the same renderer the editor uses draws the document at the export scale.
import { imageDrawPlan, sourcePixelsPerUnit } from "../model/image.ts";
import { layoutText } from "../model/text.ts";
import { walk, isHiddenInTree } from "../model/tree.ts";
import { aabbOf, boxesIntersect } from "../model/geometry.ts";
import { fontInfo } from "../model/fonts.ts";
import type { GrapheneDocument, ImageElement } from "../model/types.ts";
import { getBlob } from "../persist/db.ts";
import { loadSvgImage } from "../render/imageCache.ts";
import { canvasMeasure } from "../render/measure.ts";
import { ensureFonts } from "../render/fonts.ts";
import { renderDocument, type ResolvedImage } from "../render/renderer.ts";

export type ExportFormat = "png" | "jpeg";

export interface ExportOptions {
  format: ExportFormat;
  /** Output pixels per document pixel. */
  scale: number;
  /** JPEG quality 0..1. */
  quality: number;
  /** PNG only: leave the background transparent. */
  transparent: boolean;
}

export interface ExportWarning {
  elementId: string | null;
  message: string;
}

/** Browser canvas limits (Chromium: 16384 per side within ~268 MP; we stay well inside). */
export const MAX_SIDE = 16000;
export const MAX_PIXELS = 120_000_000;

export function outputSize(doc: GrapheneDocument, scale: number): { width: number; height: number } {
  return { width: Math.round(doc.project.width * scale), height: Math.round(doc.project.height * scale) };
}

export function checkSize(doc: GrapheneDocument, scale: number): string | null {
  const { width, height } = outputSize(doc, scale);
  if (width < 1 || height < 1) return "The export size is too small.";
  if (width > MAX_SIDE || height > MAX_SIDE) return `Each side must be ${MAX_SIDE.toLocaleString()} px or less. Lower the scale.`;
  if (width * height > MAX_PIXELS) return `The export would be ${((width * height) / 1e6).toFixed(0)} MP; the limit is ${MAX_PIXELS / 1e6} MP. Lower the scale.`;
  return null;
}

/** Pre-flight checks shown before exporting. They describe; they never change the design. */
export function exportWarnings(doc: GrapheneDocument, scale: number): ExportWarning[] {
  const out: ExportWarning[] = [];
  const canvas = { x: 0, y: 0, width: doc.project.width, height: doc.project.height };
  const assets = new Map(doc.assets.map((a) => [a.id, a]));
  walk(doc.elements, (el) => {
    if (el.type === "group") return;
    if (isHiddenInTree(doc.elements, el.id)) return;
    if (!boxesIntersect(aabbOf(el), canvas)) {
      out.push({ elementId: el.id, message: `"${el.name}" is outside the canvas and will not appear.` });
      return;
    }
    if (el.type === "image") {
      const asset = el.assetId ? assets.get(el.assetId) : undefined;
      if (!asset) {
        out.push({ elementId: el.id, message: `"${el.name}" is an empty frame and will be left out.` });
        return;
      }
      if (asset.mimeType !== "image/svg+xml") {
        const spp = sourcePixelsPerUnit(el, asset.width, asset.height);
        if (spp < scale * 0.999) {
          out.push({
            elementId: el.id,
            message: `"${el.name}" will be enlarged ${(scale / spp).toFixed(1)}× beyond its native resolution (${asset.width} × ${asset.height} px source). It may look soft.`,
          });
        }
      }
      if (asset.provenance !== "original") {
        out.push({ elementId: el.id, message: `"${el.name}" uses ${asset.name}, whose provenance is "${asset.provenance}".` });
      }
    }
    if (el.type === "text") {
      const l = layoutText(el, canvasMeasure);
      if (l.overflowX) out.push({ elementId: el.id, message: `"${el.name}" has a word wider than its text box; widen the box.` });
      if (fontInfo(el.fontFamily)?.source === "system") {
        out.push({ elementId: el.id, message: `"${el.name}" uses ${el.fontFamily}, a system font. It renders with this computer's copy.` });
      }
    }
  });
  return out;
}

async function decodeForExport(doc: GrapheneDocument, el: ImageElement, scale: number): Promise<ResolvedImage | null> {
  const asset = doc.assets.find((a) => a.id === el.assetId);
  if (!asset) return null;
  const blob = await getBlob(asset.hash);
  if (!blob) throw new Error(`The original file for "${el.name}" (${asset.name}) is not in local storage.`);
  if (asset.mimeType === "image/svg+xml") {
    const img = await loadSvgImage(blob);
    return { source: img, originX: 0, originY: 0, scaleX: img.naturalWidth / asset.width, scaleY: img.naturalHeight / asset.height };
  }
  const plan = imageDrawPlan(el, asset.width, asset.height);
  // Integer source region covering the visible crop.
  const sx = Math.max(0, Math.floor(plan.sx));
  const sy = Math.max(0, Math.floor(plan.sy));
  const ex = Math.min(asset.width, Math.ceil(plan.sx + plan.sw));
  const ey = Math.min(asset.height, Math.ceil(plan.sy + plan.sh));
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);
  // Target pixel size: what the region covers in the output, never more than the source has.
  const k = (plan.dw * scale) / plan.sw;
  const tw = Math.max(1, Math.min(sw, Math.round(sw * k)));
  const th = Math.max(1, Math.min(sh, Math.round(sh * k)));
  const bmp =
    tw < sw || th < sh
      ? await createImageBitmap(blob, sx, sy, sw, sh, { resizeWidth: tw, resizeHeight: th, resizeQuality: "high" })
      : await createImageBitmap(blob, sx, sy, sw, sh);
  return { source: bmp, originX: sx, originY: sy, scaleX: bmp.width / sw, scaleY: bmp.height / sh };
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}

export async function exportImage(doc: GrapheneDocument, opts: ExportOptions, onProgress?: (msg: string) => void): Promise<ExportResult> {
  const sizeError = checkSize(doc, opts.scale);
  if (sizeError) throw new Error(sizeError);
  onProgress?.("Loading fonts");
  await ensureFonts(doc);

  const images = new Map<string, ResolvedImage>();
  const frames: ImageElement[] = [];
  walk(doc.elements, (el) => {
    if (el.type === "image" && el.assetId && !isHiddenInTree(doc.elements, el.id)) frames.push(el);
  });
  try {
    // Sequential decoding keeps peak memory to one full-size original at a time.
    for (let i = 0; i < frames.length; i++) {
      onProgress?.(`Decoding original ${i + 1} of ${frames.length}`);
      const r = await decodeForExport(doc, frames[i], opts.scale);
      if (r) images.set(frames[i].id, r);
    }

    onProgress?.("Rendering");
    const { width, height } = outputSize(doc, opts.scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: opts.format === "png" });
    if (!ctx) throw new Error("This browser could not create a canvas of that size. Lower the scale.");
    const transparent = opts.format === "png" && opts.transparent;
    if (opts.format === "jpeg") {
      ctx.fillStyle = "#FFFFFF"; // JPEG has no alpha; transparent areas become white
      ctx.fillRect(0, 0, width, height);
    }
    ctx.scale(width / doc.project.width, height / doc.project.height);
    renderDocument(ctx, doc, {
      pixelRatio: opts.scale,
      resolveImage: (el) => images.get(el.id) ?? null,
      drawPlaceholders: false,
      background: !transparent,
    });

    onProgress?.("Encoding");
    const mimeType = opts.format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, opts.quality));
    canvas.width = canvas.height = 0; // release memory
    if (!blob) throw new Error("The browser could not encode the image. Try a smaller scale.");
    return { blob, width, height, mimeType };
  } finally {
    for (const r of images.values()) if (r.source instanceof ImageBitmap) r.source.close();
  }
}

export function exportFilename(doc: GrapheneDocument, opts: ExportOptions): string {
  const base = doc.project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "graphene-design";
  return `${base}@${opts.scale}x.${opts.format === "png" ? "png" : "jpg"}`;
}

/** Small preview render for project thumbnails, using display proxies. */
export function renderThumbnail(doc: GrapheneDocument, resolve: (el: ImageElement) => ResolvedImage | null, maxSide = 320): string {
  const s = Math.min(1, maxSide / Math.max(doc.project.width, doc.project.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(doc.project.width * s));
  c.height = Math.max(1, Math.round(doc.project.height * s));
  const ctx = c.getContext("2d")!;
  ctx.scale(s, s);
  renderDocument(ctx, doc, { pixelRatio: s, resolveImage: resolve, drawPlaceholders: true, background: true });
  return c.toDataURL("image/jpeg", 0.8);
}
