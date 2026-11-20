// Reference sample: "Accurova — BNI Crescendo Portrait Session" (spec Part I).
//
// The template contains every designed element as an editable layer, and empty
// image frames bound to named slots for the seven real assets (logo, event
// photo, studio photo, four portraits). Nothing is generated: the user maps
// their own files to the slots, and the frames show those originals.
import { createDocument, createEmptyFrame, createIcon, createShape, createText, newId } from "../model/defaults.ts";
import { syncGroupBounds } from "../model/ops.ts";
import type { AssetSlot, Element, GrapheneDocument, GroupElement, ImageElement, ShapeElement, TextElement } from "../model/types.ts";

export const BNI_SAMPLE_ID = "bni-crescendo";

const NAVY = "#071D43";
const RED = "#C50918";
const WHITE = "#FFFFFF";
const NEAR_BLACK = "#111827";
const GREY = "#D9DEE7";

export const BNI_SLOTS: AssetSlot[] = [
  { id: "logo", label: "Accurova logo", description: "The supplied Accurova logo file (camera mark, wordmark and tagline). Used as-is, never retyped." },
  { id: "event", label: "Event room photograph", description: "The BNI meeting room with the queue of attendees." },
  { id: "studio", label: "Studio set-up photograph", description: "Backdrop, brown-jacket subject, softbox and the DSLR on its tripod." },
  { id: "portrait-1", label: "Portrait 01", description: "Woman in a dark blazer and teal dress." },
  { id: "portrait-2", label: "Portrait 02", description: "Woman in a vivid blue blazer and black dress." },
  { id: "portrait-3", label: "Portrait 03", description: "Woman in a dark suit holding a laptop." },
  { id: "portrait-4", label: "Portrait 04", description: "Man in a brown jacket." },
];

function group(name: string, children: Element[]): GroupElement {
  return { id: newId("group"), type: "group", name, x: 0, y: 0, width: 0, height: 0, rotation: 0, opacity: 1, visible: true, locked: false, shadow: null, children };
}

function text(name: string, value: string, x: number, y: number, width: number, props: Partial<TextElement>): TextElement {
  return createText("paragraph", 0, 0, { name, text: value, x, y, width, fontWeight: 800, italic: true, fill: WHITE, lineHeight: 1.15, ...props });
}

function ribbon(name: string, x: number, y: number, width: number, height: number, props: Partial<ShapeElement> = {}): ShapeElement {
  return createShape("ribbon", 0, 0, { name, x, y, width, height, fill: RED, cornerRadius: 6, ...props });
}

function frame(name: string, slot: string, x: number, y: number, width: number, height: number, props: Partial<ImageElement> = {}): ImageElement {
  const s = BNI_SLOTS.find((x) => x.id === slot)!;
  return { ...createEmptyFrame(name, x, y, width, height, `${s.label}: ${s.description}`, slot), ...props };
}

/** Upper-body crop of a full-length portrait: horizontal centre, top and height as fractions of the photo. */
function portraitCrop(cx: number, top: number, heightFrac: number, frameAspect: number, photoAspect = 5504 / 8256) {
  const width = (heightFrac * frameAspect) / photoAspect;
  return { x: Math.min(Math.max(cx - width / 2, 0), 1 - width), y: top, width, height: heightFrac };
}

function portraitCard(n: number, x: number, crop: { cx: number; top: number }): GroupElement {
  const y = 700;
  const w = 132;
  const h = 192;
  const pad = 7;
  const card = createShape("rect", 0, 0, {
    name: "Card",
    x,
    y,
    width: w,
    height: h,
    fill: WHITE,
    cornerRadius: 10,
    shadow: { color: "#0000004D", blur: 18, offsetX: 0, offsetY: 6 },
  });
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const photo = frame(`Portrait 0${n} photo`, `portrait-${n}`, x + pad, y + pad, iw, ih, {
    cornerRadius: 6,
    crop: portraitCrop(crop.cx, crop.top, 0.42, iw / ih),
  });
  return group(`Portrait 0${n}`, [card, photo]);
}

function feature(label: string, icon: string, paths: string[], cx: number): GroupElement {
  const name = label.replace("\n", " ");
  return group(name, [
    { ...createIcon(icon, paths, cx, 710, 44, NEAR_BLACK), name: `${name} icon`, strokeWidth: 1.6 },
    text(`${name} label`, label, cx - 75, 740, 150, { fontSize: 19, fontWeight: 600, italic: false, fill: NEAR_BLACK, align: "center", lineHeight: 1.2 }),
  ]);
}

/** Lucide path data (ISC) for the five icons the poster uses, embedded so the sample needs no lookup. */
export interface SampleIcons {
  camera: string[];
  zap: string[];
  layers: string[];
  monitor: string[];
  calendar: string[];
}

export function buildBniCrescendo(icons: SampleIcons): GrapheneDocument {
  const doc = createDocument("Accurova BNI Crescendo Banner", 1647, 922);
  doc.slots = BNI_SLOTS;
  doc.palette = [NAVY, RED, WHITE, NEAR_BLACK, GREY];

  const background = group("Background", [
    // Cover crop of the room at full height, placed so the queue starts just right of the studio set-up.
    frame("Event room photograph", "event", 520, 0, 1127, 922, { crop: { x: 0, y: 0, width: (5519 * (1127 / 922)) / 8286, height: 1 } }),
    createShape("rect", 0, 0, {
      name: "Tonal overlay",
      x: 0,
      y: 0,
      width: 780,
      height: 922,
      fill: { type: "linear", angle: 90, stops: [{ offset: 0, color: WHITE }, { offset: 0.74, color: WHITE }, { offset: 1, color: "#FFFFFF00" }] },
    }),
  ]);

  const studio = group("Studio composite", [
    // Source columns 100–1460 of the 2048 × 1536 studio photo at 0.44×: camera and tripod sit right of the
    // information column, the subject stands clear above the portrait cards.
    frame("Studio photograph (backdrop, subject, softbox, DSLR on tripod)", "studio", 595, 246, 598, 676, {
      crop: { x: 100 / 2048, y: 0, width: 1360 / 2048, height: 1 },
      fade: { left: 60, right: 100, top: 160, bottom: 0 },
    }),
  ]);

  const brand = group("Brand", [
    // Contain-fit with the logo's transparent margin trimmed. The mark itself is never cropped or redrawn.
    frame("Accurova logo", "logo", 52, 26, 340, 88, { fit: "contain", crop: { x: 251 / 1584, y: 57 / 396, width: 1081 / 1584, height: 281 / 396 } }),
    createShape("rect", 0, 0, { name: "Red accent rule", x: 58, y: 132, width: 128, height: 4, fill: RED }),
  ]);

  const ribbonGradient = { type: "linear" as const, angle: 180, stops: [{ offset: 0, color: "#D20A1C" }, { offset: 1, color: "#A50613" }] };
  const exclusive = group("Exclusive ribbon", [
    ribbon("Ribbon stripe 1", 1258, 52, 12, 82, { slantLeft: 16, slantRight: 16, cornerRadius: 2 }),
    ribbon("Ribbon stripe 2", 1275, 52, 12, 82, { slantLeft: 16, slantRight: 16, cornerRadius: 2 }),
    ribbon("Red ribbon shape", 1294, 52, 353, 82, { slantLeft: 18, slantRight: 0, cornerRadius: 6, fill: ribbonGradient }),
    text("Exclusive for", "Exclusive for", 1332, 58, 290, { fontSize: 28, fontWeight: 700 }),
    text("BNI Crescendo", "BNI Crescendo", 1322, 88, 315, { fontSize: 38 }),
  ]);

  const headline = group("Headline", [
    group("Fast and Easy ribbon", [
      ribbon("Ribbon", 44, 172, 372, 60, { slantLeft: 14, slantRight: 14, cornerRadius: 8 }),
      ribbon("Stripe 1", 420, 176, 10, 52, { slantLeft: 13, slantRight: 13, cornerRadius: 2 }),
      ribbon("Stripe 2", 436, 176, 10, 52, { slantLeft: 13, slantRight: 13, cornerRadius: 2 }),
      ribbon("Stripe 3", 452, 176, 10, 52, { slantLeft: 13, slantRight: 13, cornerRadius: 2 }),
      text("Fast and Easy", "Fast and Easy", 76, 178, 330, { fontSize: 42 }),
    ]),
    text("3 Pose", "3 Pose", 50, 240, 540, { fontSize: 150, fontWeight: 800, italic: false, fill: NAVY, lineHeight: 1 }),
    text("Upper Body Portrait", "Upper Body Portrait", 54, 378, 570, { fontSize: 46, fontWeight: 700, italic: false, fill: NAVY, lineHeight: 1.1 }),
  ]);

  const offer = group("Offer", [
    ribbon("Red offer panel", 22, 492, 600, 170, { slantLeft: 24, slantRight: 24, cornerRadius: 18, fill: ribbonGradient }),
    text("Special Package", "Special Package", 100, 503, 360, { fontSize: 32 }),
    text("$50", "$50", 76, 540, 250, { fontSize: 108, fontWeight: 900, lineHeight: 1 }),
    createShape("rect", 0, 0, { name: "Divider", x: 332, y: 556, width: 4, height: 92, rotation: 15, fill: WHITE }),
    text("for", "for", 366, 548, 200, { fontSize: 36 }),
    text("3 Photos", "3 Photos", 362, 588, 250, { fontSize: 46 }),
  ]);

  const features = group("Features", [
    feature("Authentic\nPhotos", "camera", icons.camera, 100),
    createShape("rect", 0, 0, { name: "Separator 1", x: 175, y: 688, width: 1.5, height: 92, fill: GREY }),
    feature("Quick &\nEfficient", "zap", icons.zap, 250),
    createShape("rect", 0, 0, { name: "Separator 2", x: 325, y: 688, width: 1.5, height: 92, fill: GREY }),
    feature("Clean White\nBackdrop", "layers", icons.layers, 400),
    createShape("rect", 0, 0, { name: "Separator 3", x: 475, y: 688, width: 1.5, height: 92, fill: GREY }),
    feature("Ready for\nBNI+ & More", "monitor", icons.monitor, 550),
  ]);

  const portraits = group("Portrait examples", [
    portraitCard(1, 1080, { cx: 0.47, top: 0.11 }),
    portraitCard(2, 1221, { cx: 0.54, top: 0.1 }),
    portraitCard(3, 1362, { cx: 0.47, top: 0.14 }),
    portraitCard(4, 1503, { cx: 0.52, top: 0.07 }),
  ]);

  const navyGradient = { type: "linear" as const, angle: 180, stops: [{ offset: 0, color: "#0B2A5E" }, { offset: 1, color: "#061634" }] };
  const footer = group("Footer", [
    ribbon("Footer strip", 22, 818, 620, 92, { slantLeft: 0, slantRight: 22, cornerRadius: 14, fill: navyGradient }),
    { ...createIcon("calendar-days", icons.calendar, 70, 864, 52, WHITE), name: "Calendar icon", strokeWidth: 1.6 },
    text("Next Session", "Next Session", 112, 830, 300, { fontSize: 20, fontWeight: 700 }),
    text("Date and time", "26 Nov (Thurs) at 10:00 AM", 112, 852, 515, { fontSize: 30 }),
    text("After the BNI Meeting", "After the BNI Meeting", 112, 888, 400, { fontSize: 17, fontWeight: 500, fill: GREY }),
  ]);

  doc.elements = syncGroupBounds([background, studio, brand, exclusive, headline, offer, features, portraits, footer]);
  return doc;
}

/** Files produced by `npm run sample:prepare` (git-ignored; local only). */
export interface SampleManifest {
  files: { slot: string; file: string; originalName: string }[];
}

export const SAMPLE_ASSET_BASE = "samples/bni-crescendo/assets/";
