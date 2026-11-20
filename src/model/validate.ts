// Validate and normalise project JSON from any untrusted source (IndexedDB,
// an imported package, a template). Unknown fields are dropped, missing fields
// get defaults, and structurally broken input is rejected with readable errors.
import { isHexColor, normalizeHex } from "./color.ts";
import { sanitizeCrop, FULL_CROP } from "./image.ts";
import { syncGroupBounds } from "./ops.ts";
import type {
  AssetRecord,
  AssetSlot,
  Element,
  Fill,
  GrapheneDocument,
  Integrity,
  Provenance,
  Shadow,
  ShapeKind,
  Stroke,
} from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";

export interface ValidationResult {
  ok: boolean;
  doc: GrapheneDocument | null;
  errors: string[];
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown, def: number, min = -1e7, max = 1e7): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
const str = (v: unknown, def: string, maxLen = 10000) => (typeof v === "string" ? v.slice(0, maxLen) : def);
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const color = (v: unknown, def: string) => (isHexColor(v) ? normalizeHex(v) : def);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);

const SHAPE_KINDS: readonly ShapeKind[] = ["rect", "ellipse", "polygon", "star", "ribbon", "callout", "line", "arrow"];
const INTEGRITY: readonly Integrity[] = ["protected", "editable", "ai-editable", "generated"];
const PROVENANCE: readonly Provenance[] = ["original", "ai-generated", "unknown"];
// SVG path data only: commands, numbers, separators. Rejects anything that could smuggle markup.
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/;

function fill(v: unknown, def: Fill | null): Fill | null {
  if (v === null) return null;
  if (isHexColor(v)) return normalizeHex(v);
  if (isObj(v) && v.type === "linear" && Array.isArray(v.stops)) {
    const stops = v.stops
      .filter(isObj)
      .map((s) => ({ offset: num(s.offset, 0, 0, 1), color: color(s.color, "#000000") }))
      .sort((a, b) => a.offset - b.offset)
      .slice(0, 16);
    if (stops.length >= 2) return { type: "linear", angle: num(v.angle, 90, -360, 360), stops };
  }
  return def;
}

function stroke(v: unknown): Stroke | null {
  if (!isObj(v)) return null;
  return { color: color(v.color, "#000000"), width: num(v.width, 1, 0, 1000) };
}

function shadow(v: unknown): Shadow | null {
  if (!isObj(v)) return null;
  return {
    color: color(v.color, "#00000040"),
    blur: num(v.blur, 12, 0, 1000),
    offsetX: num(v.offsetX, 0),
    offsetY: num(v.offsetY, 4),
  };
}

interface Ctx {
  ids: Set<string>;
  assetIds: Set<string>;
  warnings: string[];
  counter: number;
}

function element(v: unknown, ctx: Ctx, path: string, depth: number): Element | null {
  if (!isObj(v)) {
    ctx.warnings.push(`${path}: not an object, dropped`);
    return null;
  }
  const type = v.type;
  let id = str(v.id, "", 100);
  if (!id || ctx.ids.has(id)) {
    const fresh = `${typeof type === "string" ? type : "el"}-fixed-${++ctx.counter}`;
    if (id) ctx.warnings.push(`${path}: duplicate id "${id}" renamed to "${fresh}"`);
    id = fresh;
  }
  ctx.ids.add(id);
  const common = {
    id,
    name: str(v.name, typeof type === "string" ? type : "Layer", 200),
    x: num(v.x, 0),
    y: num(v.y, 0),
    width: num(v.width, 100, 0, 1e6),
    height: num(v.height, 100, 0, 1e6),
    rotation: num(v.rotation, 0, -360, 360),
    opacity: num(v.opacity, 1, 0, 1),
    visible: bool(v.visible, true),
    locked: bool(v.locked, false),
    shadow: shadow(v.shadow),
  };

  switch (type) {
    case "text":
      return {
        ...common,
        type: "text",
        text: str(v.text, ""),
        fontFamily: str(v.fontFamily, "Montserrat", 100),
        fontSize: num(v.fontSize, 32, 1, 5000),
        fontWeight: Math.round(num(v.fontWeight, 400, 100, 900) / 100) * 100,
        italic: bool(v.italic, false),
        fill: color(v.fill, "#000000"),
        align: oneOf(v.align, ["left", "center", "right"] as const, "left"),
        lineHeight: num(v.lineHeight, 1.2, 0.5, 5),
        letterSpacing: num(v.letterSpacing, 0, -100, 1000),
        paragraphSpacing: num(v.paragraphSpacing, 0, 0, 5000),
        uppercase: bool(v.uppercase, false),
        stroke: stroke(v.stroke),
      };
    case "shape":
      return {
        ...common,
        type: "shape",
        kind: oneOf(v.kind, SHAPE_KINDS, "rect"),
        fill: fill(v.fill, null),
        stroke: stroke(v.stroke),
        cornerRadius: num(v.cornerRadius, 0, 0, 1e5),
        sides: Math.round(num(v.sides, 6, 3, 64)),
        innerRatio: num(v.innerRatio, 0.45, 0.05, 0.95),
        slantLeft: num(v.slantLeft, 0),
        slantRight: num(v.slantRight, 0),
        tailPosition: num(v.tailPosition, 0.25, 0, 1),
        tailSize: num(v.tailSize, 28, 0, 1e5),
      };
    case "image": {
      let assetId = typeof v.assetId === "string" ? v.assetId : null;
      if (assetId && !ctx.assetIds.has(assetId)) {
        ctx.warnings.push(`${path} ("${common.name}"): asset "${assetId}" is missing; the frame was kept empty`);
        assetId = null;
      }
      const c = isObj(v.crop) ? v.crop : {};
      const f = isObj(v.fade) ? v.fade : {};
      const adj = isObj(v.adjustments) ? v.adjustments : {};
      return {
        ...common,
        type: "image",
        assetId,
        slotId: typeof v.slotId === "string" ? v.slotId : null,
        placeholder: str(v.placeholder, "", 300),
        fit: oneOf(v.fit, ["cover", "contain"] as const, "cover"),
        crop: sanitizeCrop({
          x: num(c.x, FULL_CROP.x, 0, 1),
          y: num(c.y, FULL_CROP.y, 0, 1),
          width: num(c.width, 1, 0, 1),
          height: num(c.height, 1, 0, 1),
        }),
        cornerRadius: num(v.cornerRadius, 0, 0, 1e5),
        fade: { left: num(f.left, 0, 0, 1e5), right: num(f.right, 0, 0, 1e5), top: num(f.top, 0, 0, 1e5), bottom: num(f.bottom, 0, 0, 1e5) },
        adjustments: {
          brightness: num(adj.brightness, 100, 0, 300),
          contrast: num(adj.contrast, 100, 0, 300),
          saturation: num(adj.saturation, 100, 0, 300),
        },
        stroke: stroke(v.stroke),
      };
    }
    case "icon": {
      const paths = Array.isArray(v.paths) ? v.paths.filter((p): p is string => typeof p === "string" && PATH_DATA.test(p) && p.length < 20000) : [];
      if (paths.length === 0) ctx.warnings.push(`${path} ("${common.name}"): icon has no valid path data`);
      return {
        ...common,
        type: "icon",
        icon: str(v.icon, "icon", 100),
        paths: paths.slice(0, 64),
        color: color(v.color, "#000000"),
        strokeWidth: num(v.strokeWidth, 2, 0.1, 24),
      };
    }
    case "group": {
      if (depth > 32) {
        ctx.warnings.push(`${path}: groups nested too deeply, dropped`);
        return null;
      }
      const children = (Array.isArray(v.children) ? v.children : [])
        .map((c, i) => element(c, ctx, `${path}.children[${i}]`, depth + 1))
        .filter((c): c is Element => !!c);
      if (children.length === 0) {
        ctx.warnings.push(`${path} ("${common.name}"): empty group dropped`);
        return null;
      }
      return { ...common, type: "group", rotation: 0, children };
    }
    default:
      ctx.warnings.push(`${path}: unknown element type "${String(type)}", dropped`);
      return null;
  }
}

function asset(v: unknown, i: number, warnings: string[]): AssetRecord | null {
  if (!isObj(v)) return null;
  const id = str(v.id, "", 100);
  const hash = str(v.hash, "", 128);
  if (!id || !/^[0-9a-f]{64}$/.test(hash)) {
    warnings.push(`assets[${i}]: missing id or SHA-256 hash, dropped`);
    return null;
  }
  return {
    id,
    name: str(v.name, "asset", 300),
    mimeType: str(v.mimeType, "application/octet-stream", 100),
    bytes: num(v.bytes, 0, 0, 1e10),
    width: num(v.width, 1, 1, 1e6),
    height: num(v.height, 1, 1, 1e6),
    hash,
    integrity: oneOf(v.integrity, INTEGRITY, "protected"),
    provenance: oneOf(v.provenance, PROVENANCE, "unknown"),
    note: typeof v.note === "string" ? v.note.slice(0, 1000) : undefined,
    addedAt: str(v.addedAt, new Date(0).toISOString(), 40),
  };
}

export function validateDocument(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(input)) return { ok: false, doc: null, errors: ["Project file is not a JSON object."], warnings };
  const version = input.schemaVersion;
  if (typeof version !== "number") errors.push("Missing schemaVersion.");
  else if (version > SCHEMA_VERSION) errors.push(`This project was saved by a newer Graphene (schema ${version}); this version reads schema ${SCHEMA_VERSION}.`);
  if (!isObj(input.project)) errors.push("Missing project section.");
  if (errors.length) return { ok: false, doc: null, errors, warnings };

  const p = input.project as Obj;
  const width = num(p.width, NaN, 1, 20000);
  const height = num(p.height, NaN, 1, 20000);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, doc: null, errors: ["Project width and height must be numbers between 1 and 20000."], warnings };
  }

  const assets = (Array.isArray(input.assets) ? input.assets : [])
    .map((a, i) => asset(a, i, warnings))
    .filter((a): a is AssetRecord => !!a);
  const slots: AssetSlot[] = (Array.isArray(input.slots) ? input.slots : []).filter(isObj).map((s) => ({
    id: str(s.id, "slot", 100),
    label: str(s.label, "Slot", 200),
    description: str(s.description, "", 1000),
  }));
  const ctx: Ctx = { ids: new Set(), assetIds: new Set(assets.map((a) => a.id)), warnings, counter: 0 };
  const elements = (Array.isArray(input.elements) ? input.elements : [])
    .map((e, i) => element(e, ctx, `elements[${i}]`, 0))
    .filter((e): e is Element => !!e);

  const now = new Date().toISOString();
  const doc: GrapheneDocument = {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: str(p.id, `project-imported-${Date.now()}`, 100),
      name: str(p.name, "Untitled design", 200),
      width,
      height,
      background: fill(p.background, "#FFFFFF"),
      margin: num(p.margin, 0, 0, 5000),
      protectOriginals: bool(p.protectOriginals, true),
      createdAt: str(p.createdAt, now, 40),
      updatedAt: str(p.updatedAt, now, 40),
    },
    assets,
    slots,
    palette: (Array.isArray(input.palette) ? input.palette : []).filter(isHexColor).map(normalizeHex).slice(0, 48),
    elements: syncGroupBounds(elements),
  };
  return { ok: true, doc, errors, warnings };
}
