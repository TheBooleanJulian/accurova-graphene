// Canvas-backed text measurement shared by layout, editing and export.
import type { Measure } from "../model/text.ts";

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();
const metricsCache = new Map<string, { ascent: number; descent: number }>();

function context(): CanvasRenderingContext2D {
  if (!ctx) {
    const c = document.createElement("canvas");
    c.width = c.height = 4;
    ctx = c.getContext("2d")!;
  }
  return ctx;
}

export const supportsLetterSpacing = typeof CanvasRenderingContext2D !== "undefined" && "letterSpacing" in CanvasRenderingContext2D.prototype;

/** Width of a run of text, excluding the trailing letter-spacing after the last character. */
export const canvasMeasure: Measure = (text, font, letterSpacing) => {
  if (!text) return 0;
  const key = `${font}|${letterSpacing}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = context();
  c.font = font;
  let width: number;
  if (supportsLetterSpacing) {
    c.letterSpacing = `${letterSpacing}px`;
    width = c.measureText(text).width;
    c.letterSpacing = "0px";
  } else {
    width = c.measureText(text).width + letterSpacing * [...text].length;
  }
  if (letterSpacing) width -= letterSpacing;
  if (cache.size > 20000) cache.clear();
  cache.set(key, width);
  return width;
};

/** Font ascent/descent used to place the baseline inside each line box. */
export function fontMetrics(font: string): { ascent: number; descent: number } {
  const hit = metricsCache.get(font);
  if (hit) return hit;
  const c = context();
  c.font = font;
  const m = c.measureText("Hg");
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || size * 0.8;
  const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || size * 0.2;
  const v = { ascent, descent };
  metricsCache.set(font, v);
  return v;
}

/** Call after web fonts finish loading: cached widths were measured with fallback fonts. */
export function clearMeasureCache(): void {
  cache.clear();
  metricsCache.clear();
}
