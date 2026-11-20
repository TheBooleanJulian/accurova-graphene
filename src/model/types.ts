// Graphene project document — schema version 1.
//
// The document is plain JSON and is independent of the rendering engine: the
// canvas renderer reads it, the editor writes changes back through pure
// operations (ops.ts), and persistence/export serialise it as-is.
//
// Coordinates are in document pixels. Every element has a top-left (x, y), a
// size, and a rotation in degrees about its own centre. Children of groups use
// the same absolute coordinate space (groups do not introduce a transform), so
// rendering, hit-testing and export never need to compose nested matrices.

export const SCHEMA_VERSION = 1;

/** How an asset may be altered. Uploaded photographs and logos default to "protected". */
export type Integrity = "protected" | "editable" | "ai-editable" | "generated";
/** Where an asset came from, shown as a visible badge on every asset. */
export type Provenance = "original" | "ai-generated" | "unknown";

export interface ColorStop {
  offset: number; // 0..1
  color: string; // #rrggbb or #rrggbbaa
}
export interface LinearGradient {
  type: "linear";
  angle: number; // degrees, CSS convention: 0 = to top, 90 = to right
  stops: ColorStop[];
}
/** A hex colour or a linear gradient. */
export type Fill = string | LinearGradient;

export interface Stroke {
  color: string;
  width: number;
}
export interface Shadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface AssetRecord {
  id: string;
  /** Original filename, preserved for provenance and packaging. */
  name: string;
  mimeType: string;
  bytes: number;
  /** Intrinsic pixel size of the original file. */
  width: number;
  height: number;
  /** SHA-256 of the original bytes. Also the key of the stored, untouched original. */
  hash: string;
  integrity: Integrity;
  provenance: Provenance;
  note?: string;
  addedAt: string;
}

/** A named slot a template expects the user to fill with a real asset. */
export interface AssetSlot {
  id: string;
  label: string;
  description: string;
}

interface ElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise, about the element centre. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
  shadow: Shadow | null;
}

export type TextAlign = "left" | "center" | "right";

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number; // 100..900
  italic: boolean;
  fill: string;
  align: TextAlign;
  /** Multiple of fontSize. */
  lineHeight: number;
  /** Extra space between characters, px. */
  letterSpacing: number;
  /** Extra space between paragraphs (blank-line separated or newline separated), px. */
  paragraphSpacing: number;
  uppercase: boolean;
  stroke: Stroke | null;
}

export type ShapeKind = "rect" | "ellipse" | "polygon" | "star" | "ribbon" | "callout" | "line" | "arrow";

export interface ShapeElement extends ElementBase {
  type: "shape";
  kind: ShapeKind;
  fill: Fill | null;
  stroke: Stroke | null;
  cornerRadius: number;
  /** polygon: number of sides; star: number of points. */
  sides: number;
  /** star: inner radius as a fraction of outer. */
  innerRatio: number;
  /** ribbon: horizontal lean of the left / right edge in px (positive leans "/"). */
  slantLeft: number;
  slantRight: number;
  /** callout: tail position along the bottom edge (0..1) and tail height in px. */
  tailPosition: number;
  tailSize: number;
}

/** Normalised (0..1) rectangle of the source image. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface EdgeFade {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface Adjustments {
  /** 100 = unchanged. */
  brightness: number;
  contrast: number;
  saturation: number;
}

export type ImageFit = "cover" | "contain";

export interface ImageElement extends ElementBase {
  type: "image";
  /** null = an empty frame waiting for an asset. */
  assetId: string | null;
  /** Template slot this frame belongs to (filled through the asset-mapping step). */
  slotId: string | null;
  /** Label shown on an empty frame. */
  placeholder: string;
  /** cover = fill the frame (cropped), contain = whole crop visible (letterboxed). Never stretches. */
  fit: ImageFit;
  crop: Crop;
  cornerRadius: number;
  /** Non-destructive soft mask on each edge, px. */
  fade: EdgeFade;
  /** Non-destructive display adjustments. Ignored while the asset is protected. */
  adjustments: Adjustments;
  stroke: Stroke | null;
}

export interface IconElement extends ElementBase {
  type: "icon";
  /** Library name, for reference only — the path data below is authoritative. */
  icon: string;
  /** SVG path data in a 24×24 view box. Embedded so projects stay self-contained. */
  paths: string[];
  color: string;
  /** Stroke width in view-box units (Lucide default is 2). */
  strokeWidth: number;
}

export interface GroupElement extends ElementBase {
  type: "group";
  /** Bottom-to-top paint order. x/y/width/height are the derived bounds of the children. */
  children: Element[];
}

export type Element = TextElement | ShapeElement | ImageElement | IconElement | GroupElement;
export type ElementType = Element["type"];
export type LeafElement = Exclude<Element, GroupElement>;

export interface ProjectInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  /** null = transparent. */
  background: Fill | null;
  /** Margin / safe-area inset in px used for guides and snapping. 0 = none. */
  margin: number;
  /** When true every original asset is locked to "protected". */
  protectOriginals: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GrapheneDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  project: ProjectInfo;
  assets: AssetRecord[];
  slots: AssetSlot[];
  /** Saved brand / project colours. */
  palette: string[];
  /** Bottom-to-top paint order. */
  elements: Element[];
}
