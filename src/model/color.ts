// Colour helpers. Document colours are stored as #rrggbb or #rrggbbaa.

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number; // 0..1
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v.trim());
}

export function parseHex(hex: string): RGBA {
  let h = hex.trim().replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

const hx = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

export function toHex(c: RGBA): string {
  const base = `#${hx(c.r)}${hx(c.g)}${hx(c.b)}`;
  return c.a >= 0.999 ? base.toUpperCase() : (base + hx(c.a * 255)).toUpperCase();
}

/** Normalise any accepted hex form to #RRGGBB or #RRGGBBAA. */
export function normalizeHex(hex: string): string {
  return toHex(parseHex(hex));
}

export function withAlpha(hex: string, alpha: number): string {
  return toHex({ ...parseHex(hex), a: alpha });
}

export function opaqueHex(hex: string): string {
  return toHex({ ...parseHex(hex), a: 1 });
}

export function alphaOf(hex: string): number {
  return parseHex(hex).a;
}

/** rgba() string for canvas / CSS. */
export function cssColor(hex: string): string {
  const c = parseHex(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${Number(c.a.toFixed(4))})`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const c = parseHex(hex);
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio between two opaque colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
