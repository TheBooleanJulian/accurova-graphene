// Element factories and presets.
import { DEFAULT_FONT } from "./fonts.ts";
import { FULL_CROP, coverCrop } from "./image.ts";
import type {
  AssetRecord,
  GrapheneDocument,
  IconElement,
  ImageElement,
  ShapeElement,
  ShapeKind,
  TextElement,
} from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createDocument(name: string, width: number, height: number): GrapheneDocument {
  const t = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: newId("project"),
      name,
      width,
      height,
      background: "#FFFFFF",
      margin: 0,
      protectOriginals: true,
      createdAt: t,
      updatedAt: t,
    },
    assets: [],
    slots: [],
    palette: ["#071D43", "#C50918", "#FFFFFF", "#111827", "#D9DEE7"],
    elements: [],
  };
}

const base = (name: string, x: number, y: number, width: number, height: number) => ({
  name,
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  shadow: null,
});

export type TextPreset = "headline" | "subheading" | "paragraph" | "label" | "caption";

export const TEXT_PRESETS: Record<TextPreset, { label: string; text: string; props: Partial<TextElement> }> = {
  headline: { label: "Headline", text: "Add a headline", props: { fontSize: 96, fontWeight: 800, lineHeight: 1.05 } },
  subheading: { label: "Subheading", text: "Add a subheading", props: { fontSize: 48, fontWeight: 700, lineHeight: 1.15 } },
  paragraph: {
    label: "Paragraph",
    text: "Add a paragraph of supporting text. Double-click to edit.",
    props: { fontSize: 24, fontWeight: 400, lineHeight: 1.45 },
  },
  label: { label: "Label", text: "Label", props: { fontSize: 18, fontWeight: 600, uppercase: true, letterSpacing: 2 } },
  caption: { label: "Caption", text: "Caption", props: { fontSize: 16, fontWeight: 400, italic: true, lineHeight: 1.3 } },
};

export function createText(preset: TextPreset, cx: number, cy: number, overrides: Partial<TextElement> = {}): TextElement {
  const p = TEXT_PRESETS[preset];
  const fontSize = p.props.fontSize ?? 24;
  const width = overrides.width ?? Math.max(160, Math.round(p.text.length * fontSize * 0.6));
  const height = Math.round(fontSize * (p.props.lineHeight ?? 1.2));
  return {
    ...base(p.label, Math.round(cx - width / 2), Math.round(cy - height / 2), width, height),
    id: newId("text"),
    type: "text",
    text: p.text,
    fontFamily: DEFAULT_FONT,
    fontSize,
    fontWeight: 400,
    italic: false,
    fill: "#071D43",
    align: "left",
    lineHeight: 1.2,
    letterSpacing: 0,
    paragraphSpacing: 0,
    uppercase: false,
    stroke: null,
    ...p.props,
    ...overrides,
  };
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  polygon: "Polygon",
  star: "Star",
  ribbon: "Ribbon",
  callout: "Callout",
  line: "Line",
  arrow: "Arrow",
};

export function createShape(kind: ShapeKind, cx: number, cy: number, overrides: Partial<ShapeElement> = {}): ShapeElement {
  const isLine = kind === "line" || kind === "arrow";
  const width = kind === "ribbon" ? 360 : isLine ? 240 : 200;
  const height = kind === "ribbon" ? 64 : isLine ? 16 : kind === "callout" ? 160 : 200;
  return {
    ...base(SHAPE_LABELS[kind], Math.round(cx - width / 2), Math.round(cy - height / 2), width, height),
    id: newId("shape"),
    type: "shape",
    kind,
    fill: isLine ? null : kind === "ribbon" ? "#C50918" : "#071D43",
    stroke: isLine ? { color: "#071D43", width: 4 } : null,
    cornerRadius: kind === "ribbon" ? 8 : kind === "callout" ? 16 : 0,
    sides: kind === "star" ? 5 : 6,
    innerRatio: 0.45,
    slantLeft: kind === "ribbon" ? 18 : 0,
    slantRight: kind === "ribbon" ? 18 : 0,
    tailPosition: 0.25,
    tailSize: 28,
    ...overrides,
  };
}

/** A new image frame showing the whole asset at a size that fits within maxW × maxH, centred on (cx, cy). */
export function createImageElement(asset: AssetRecord, cx: number, cy: number, maxW: number, maxH: number): ImageElement {
  const s = Math.min(maxW / asset.width, maxH / asset.height, 1);
  const width = Math.max(1, Math.round(asset.width * s));
  const height = Math.max(1, Math.round(asset.height * s));
  return {
    ...base(asset.name.replace(/\.[a-z0-9]+$/i, ""), Math.round(cx - width / 2), Math.round(cy - height / 2), width, height),
    id: newId("image"),
    type: "image",
    assetId: asset.id,
    slotId: null,
    placeholder: "",
    fit: "cover",
    crop: coverCrop(asset.width, asset.height, width / height),
    cornerRadius: 0,
    fade: { left: 0, right: 0, top: 0, bottom: 0 },
    mask: null,
    adjustments: { brightness: 100, contrast: 100, saturation: 100 },
    stroke: null,
  };
}

export function createEmptyFrame(name: string, x: number, y: number, width: number, height: number, placeholder: string, slotId: string | null = null): ImageElement {
  return {
    ...base(name, x, y, width, height),
    id: newId("image"),
    type: "image",
    assetId: null,
    slotId,
    placeholder,
    fit: "cover",
    crop: { ...FULL_CROP },
    cornerRadius: 0,
    fade: { left: 0, right: 0, top: 0, bottom: 0 },
    mask: null,
    adjustments: { brightness: 100, contrast: 100, saturation: 100 },
    stroke: null,
  };
}

export function createIcon(icon: string, paths: string[], cx: number, cy: number, size = 96, color = "#071D43"): IconElement {
  return {
    ...base(icon.replace(/-/g, " "), Math.round(cx - size / 2), Math.round(cy - size / 2), size, size),
    id: newId("icon"),
    type: "icon",
    icon,
    paths,
    color,
    strokeWidth: 2,
  };
}

export interface SizePreset {
  label: string;
  width: number;
  height: number;
  group: "Banner" | "Social" | "Print";
  note?: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { label: "Accurova reference banner", width: 1647, height: 922, group: "Banner" },
  { label: "Landscape banner 16:9", width: 1920, height: 1080, group: "Banner" },
  { label: "Web hero", width: 2400, height: 1000, group: "Banner" },
  { label: "LinkedIn banner", width: 1584, height: 396, group: "Banner" },
  { label: "Facebook cover", width: 1640, height: 624, group: "Banner" },
  { label: "Instagram post (square)", width: 1080, height: 1080, group: "Social" },
  { label: "Instagram post (portrait)", width: 1080, height: 1350, group: "Social" },
  { label: "Story / Reel", width: 1080, height: 1920, group: "Social" },
  { label: "LinkedIn post", width: 1200, height: 627, group: "Social" },
  { label: "A4 portrait", width: 2480, height: 3508, group: "Print", note: "210 × 297 mm at 300 dpi" },
  { label: "A5 flyer", width: 1748, height: 2480, group: "Print", note: "148 × 210 mm at 300 dpi" },
  { label: "Business card", width: 1004, height: 650, group: "Print", note: "85 × 55 mm at 300 dpi" },
];
