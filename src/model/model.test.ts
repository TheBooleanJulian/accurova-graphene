import { test } from "node:test";
import assert from "node:assert/strict";
import { createDocument, createEmptyFrame, createIcon, createShape, createText } from "./defaults.ts";
import { aabbOf, resizeBox, snapMove, worldToLocal, localToWorld, hitsElement } from "./geometry.ts";
import { coverCrop, imageDrawPlan, panCrop, refitCropAfterResize, setCropZoom, cropZoom, sourcePixelsPerUnit } from "./image.ts";
import { layoutText, type Measure } from "./text.ts";
import {
  addElements,
  alignElements,
  applyResize,
  addAsset,
  assignSlot,
  deleteElements,
  distributeElements,
  duplicateElements,
  groupElements,
  moveElementTo,
  reorderElements,
  rotateElements,
  scaleElements,
  syncTextHeights,
  translateElements,
  ungroupElement,
  setProtectOriginals,
} from "./ops.ts";
import { findById, topmostSelection } from "./tree.ts";
import { emptyHistory, record, redo, undo } from "./history.ts";
import { validateDocument } from "./validate.ts";
import { contrastRatio, normalizeHex } from "./color.ts";
import type { AssetRecord, GrapheneDocument, ImageElement } from "./types.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// A deterministic measure: every character is 0.5em wide plus letter spacing.
const measure: Measure = (text, font, ls) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]);
  return text.length * (size * 0.5 + ls);
};

function asset(id: string, width: number, height: number): AssetRecord {
  return {
    id,
    name: `${id}.jpg`,
    mimeType: "image/jpeg",
    bytes: 100,
    width,
    height,
    hash: id.padEnd(64, "0").replace(/[^0-9a-f]/g, "a").slice(0, 64),
    integrity: "protected",
    provenance: "original",
    addedAt: "2026-11-20T00:00:00.000Z",
  };
}

function docWith(...els: Parameters<typeof addElements>[1]): GrapheneDocument {
  return addElements(createDocument("Test", 1000, 600), els);
}

// --- geometry --------------------------------------------------------------

test("resize from the south-east corner keeps the north-west corner fixed", () => {
  const r = resizeBox({ x: 10, y: 20, width: 100, height: 50, rotation: 0 }, "se", { x: 210, y: 120 }, { keepRatio: false, fromCenter: false, minSize: 1 });
  assert.deepEqual([r.x, r.y, r.width, r.height], [10, 20, 200, 100]);
});

test("ratio-locked corner resize never changes the aspect ratio", () => {
  const r = resizeBox({ x: 0, y: 0, width: 400, height: 300, rotation: 0 }, "se", { x: 500, y: 320 }, { keepRatio: true, fromCenter: false, minSize: 1 });
  close(r.width / r.height, 4 / 3);
  close(r.x, 0);
  close(r.y, 0);
});

test("resizing a rotated box keeps the opposite corner fixed in world space", () => {
  const box = { x: 100, y: 100, width: 200, height: 100, rotation: 30 };
  const fixedBefore = localToWorld(box, { x: 0, y: 0 }); // nw corner
  const target = localToWorld(box, { x: 260, y: 140 }); // drag se handle outward
  const r = resizeBox(box, "se", target, { keepRatio: false, fromCenter: false, minSize: 1 });
  const fixedAfter = localToWorld({ ...r, rotation: 30 }, { x: 0, y: 0 });
  close(fixedAfter.x, fixedBefore.x);
  close(fixedAfter.y, fixedBefore.y);
  close(r.width, 260);
  close(r.height, 140);
});

test("west handle reports the new left edge in the old local frame", () => {
  const r = resizeBox({ x: 0, y: 0, width: 100, height: 100, rotation: 0 }, "w", { x: 30, y: 50 }, { keepRatio: false, fromCenter: false, minSize: 1 });
  assert.equal(r.localLeft, 30);
  assert.equal(r.width, 70);
});

test("world/local round trip and hit testing respect rotation", () => {
  const b = { x: 0, y: 0, width: 100, height: 20, rotation: 90 };
  const p = localToWorld(b, { x: 90, y: 10 });
  const back = worldToLocal(b, p);
  close(back.x, 90);
  close(back.y, 10);
  const shape = { ...createShape("rect", 50, 10), ...b };
  assert.ok(hitsElement(shape, { x: 50, y: 50 }, 0)); // inside after rotation
  assert.ok(!hitsElement(shape, { x: 95, y: 10 }, 0)); // inside before rotation, outside after
});

test("snapping pulls an edge onto a nearby target and reports the guide", () => {
  const s = snapMove({ x: 0, y: 0, width: 100, height: 50 }, 97, 0, { xs: [200], ys: [] }, 5);
  assert.equal(s.dx, 100); // right edge 197 snaps to 200
  assert.deepEqual(s.guidesX, [200]);
  const none = snapMove({ x: 0, y: 0, width: 100, height: 50 }, 50, 0, { xs: [200], ys: [] }, 5);
  assert.equal(none.dx, 50);
});

// --- images ----------------------------------------------------------------

test("cover never stretches: drawn scale is identical on both axes", () => {
  const el = { width: 300, height: 300, fit: "cover" as const, crop: { x: 0, y: 0, width: 1, height: 1 } };
  const p = imageDrawPlan(el, 4000, 2000);
  close(p.dw / p.sw, p.dh / p.sh);
  assert.equal(p.sh, 2000);
  assert.equal(p.sw, 2000); // centred square
  assert.equal(p.sx, 1000);
});

test("contain letterboxes without stretching", () => {
  const p = imageDrawPlan({ width: 300, height: 300, fit: "contain", crop: { x: 0, y: 0, width: 1, height: 1 } }, 4000, 2000);
  close(p.dw / p.sw, p.dh / p.sh);
  assert.equal(p.dw, 300);
  assert.equal(p.dh, 150);
  assert.equal(p.dy, 75);
});

test("coverCrop matches the frame aspect and stays inside the image", () => {
  const c = coverCrop(5504, 8256, 165 / 250);
  close((c.width * 5504) / (c.height * 8256), 165 / 250, 1e-9);
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.width <= 1 + 1e-9 && c.y + c.height <= 1 + 1e-9);
});

test("moving a frame edge reveals more image without moving the content", () => {
  const el = { width: 200, height: 100, fit: "cover" as const, crop: coverCrop(4000, 2000, 2, 2) }; // zoomed in 2x
  const before = imageDrawPlan(el, 4000, 2000);
  const k = el.width / before.sw;
  // Drag the east edge 50px further right.
  const crop = refitCropAfterResize(el, 4000, 2000, 0, 0, 250, 100);
  const after = imageDrawPlan({ ...el, width: 250, crop }, 4000, 2000);
  close(after.sx, before.sx); // left edge content unchanged
  close(250 / after.sw, k); // same scale: nothing zoomed or stretched
});

test("pan and zoom keep crops inside the source", () => {
  const el = { width: 200, height: 200, fit: "cover" as const, crop: coverCrop(1000, 500, 1) };
  const panned = panCrop(el, 1000, 500, -10000, 0);
  close(panned.x + panned.width, 1);
  const zoomed = setCropZoom(el, 1000, 500, 2);
  close(cropZoom({ ...el, crop: zoomed }, 1000, 500), 2);
  close(sourcePixelsPerUnit({ ...el, crop: zoomed }, 1000, 500), 1.25);
});

// --- text ------------------------------------------------------------------

test("text wraps on word boundaries and grows in height", () => {
  const t = createText("paragraph", 0, 0, { text: "one two three four", fontSize: 20, width: 100, lineHeight: 1.5 });
  const l = layoutText(t, measure); // 10px per char
  assert.deepEqual(
    l.lines.map((x) => x.text),
    ["one two", "three four"],
  );
  assert.equal(l.height, 60);
  assert.equal(l.overflowX, false);
});

test("a word wider than the box is flagged rather than silently clipped", () => {
  const t = createText("paragraph", 0, 0, { text: "Supercalifragilistic", fontSize: 20, width: 50 });
  assert.equal(layoutText(t, measure).overflowX, true);
});

test("paragraph spacing and explicit newlines are honoured", () => {
  const t = createText("paragraph", 0, 0, { text: "a\nb", fontSize: 10, width: 500, lineHeight: 1, paragraphSpacing: 7 });
  assert.equal(layoutText(t, measure).height, 27);
});

test("syncTextHeights resizes text boxes to their content", () => {
  const t = createText("paragraph", 0, 0, { text: "one two three four", fontSize: 20, width: 100, lineHeight: 1.5, height: 5 });
  const [synced] = syncTextHeights([t], measure);
  assert.equal(synced.height, 60);
});

// --- structure ops ---------------------------------------------------------

test("group, ungroup and z-order keep paint order intact", () => {
  const a = createShape("rect", 50, 50);
  const b = createShape("rect", 150, 50);
  const c = createShape("rect", 250, 50);
  let doc = docWith(a, b, c);
  const g = groupElements(doc, [a.id, c.id]);
  doc = g.doc;
  assert.deepEqual(
    doc.elements.map((e) => e.id),
    [b.id, g.groupId],
  );
  const group = findById(doc.elements, g.groupId!);
  assert.equal(group?.type, "group");
  assert.equal(group!.width, 400); // 200-wide rects centred at 50 and 250 → spans -50..350
  doc = ungroupElement(doc, g.groupId!).doc;
  assert.deepEqual(
    doc.elements.map((e) => e.id),
    [b.id, a.id, c.id],
  );
  doc = reorderElements(doc, [b.id], "front");
  assert.deepEqual(
    doc.elements.map((e) => e.id),
    [a.id, c.id, b.id],
  );
  doc = reorderElements(doc, [b.id], "backward");
  assert.deepEqual(
    doc.elements.map((e) => e.id),
    [a.id, b.id, c.id],
  );
});

test("ungroup bakes group opacity, visibility and lock into children", () => {
  const a = { ...createShape("rect", 50, 50), opacity: 0.5 };
  const b = createShape("rect", 150, 50);
  let doc = docWith(a, b);
  const g = groupElements(doc, [a.id, b.id]);
  doc = { ...g.doc, elements: g.doc.elements.map((e) => ({ ...e, opacity: 0.5, locked: true })) };
  doc = ungroupElement(doc, g.groupId!).doc;
  assert.equal(doc.elements[0].opacity, 0.25);
  assert.ok(doc.elements.every((e) => e.locked));
});

test("moving a group moves its children; deleting the last child removes the group", () => {
  const a = createShape("rect", 50, 50);
  const b = createShape("rect", 150, 50);
  let doc = docWith(a, b);
  const g = groupElements(doc, [a.id, b.id]);
  doc = translateElements(g.doc, [g.groupId!], 10, 20);
  assert.equal(findById(doc.elements, a.id)!.x, a.x + 10);
  assert.equal(findById(doc.elements, b.id)!.y, b.y + 20);
  doc = deleteElements(doc, [a.id, b.id]);
  assert.equal(doc.elements.length, 0);
});

test("duplicate inserts copies directly above the originals with new ids", () => {
  const a = createShape("rect", 50, 50);
  const b = createShape("rect", 150, 50);
  const r = duplicateElements(docWith(a, b), [a.id]);
  assert.equal(r.doc.elements.length, 3);
  assert.equal(r.doc.elements[1].id, r.newIds[0]);
  assert.notEqual(r.newIds[0], a.id);
  assert.equal(r.doc.elements[1].x, a.x + 16);
});

test("moveElementTo moves a layer into a group and refuses cycles", () => {
  const a = createShape("rect", 50, 50);
  const b = createShape("rect", 150, 50);
  const c = createShape("rect", 250, 50);
  const g = groupElements(docWith(a, b, c), [a.id, b.id]);
  let doc = moveElementTo(g.doc, c.id, g.groupId!, 0);
  assert.equal(doc.elements.length, 1);
  assert.equal((doc.elements[0] as { children: unknown[] }).children.length, 3);
  const same = moveElementTo(doc, g.groupId!, g.groupId!, 0);
  assert.equal(same, doc);
});

test("align and distribute use bounding boxes", () => {
  const a = { ...createShape("rect", 0, 0), x: 0, y: 0, width: 10, height: 10 };
  const b = { ...createShape("rect", 0, 0), x: 30, y: 40, width: 20, height: 10 };
  const c = { ...createShape("rect", 0, 0), x: 100, y: 5, width: 10, height: 10 };
  let doc = docWith(a, b, c);
  doc = alignElements(doc, [a.id, b.id, c.id], "top", { x: 0, y: 0, width: 110, height: 50 });
  assert.ok(doc.elements.every((e) => e.y === 0));
  doc = distributeElements(doc, [a.id, b.id, c.id], "x");
  const xs = doc.elements.map((e) => e.x);
  // total span 110, sizes 40 → gap 35: a 0..10, b 45..65, c 100..110
  assert.deepEqual(xs, [0, 45, 100]);
});

test("uniform group scaling scales type and keeps image crops (no distortion)", () => {
  const t = createText("headline", 100, 100, { fontSize: 40 });
  const frame: ImageElement = { ...createEmptyFrame("Photo", 200, 0, 100, 150, ""), assetId: "a1", crop: coverCrop(1000, 1500, 100 / 150) };
  let doc = docWith(t, frame);
  doc = { ...doc, assets: [asset("a1", 1000, 1500)] };
  doc = scaleElements(doc, [t.id, frame.id], 2, { x: 0, y: 0 });
  const t2 = findById(doc.elements, t.id) as typeof t;
  const f2 = findById(doc.elements, frame.id) as ImageElement;
  assert.equal(t2.fontSize, 80);
  assert.deepEqual(f2.crop, frame.crop);
  close(f2.width / f2.height, 100 / 150);
});

test("rotating a selection rotates element centres about the pivot", () => {
  const a = { ...createShape("rect", 0, 0), x: 90, y: -10, width: 20, height: 20 }; // centre (100, 0)
  const doc = rotateElements(docWith(a), [a.id], 90, { x: 0, y: 0 });
  const r = findById(doc.elements, a.id)!;
  close(r.x + r.width / 2, 0);
  close(r.y + r.height / 2, 100);
  assert.equal(r.rotation, 90);
  const box = aabbOf(r);
  close(box.width, 20);
});

test("text corner resize scales the font; side resize only reflows", () => {
  const t = createText("headline", 0, 0, { fontSize: 50, width: 200 });
  const corner = applyResize(t, { x: 0, y: 0, width: 400, height: t.height * 2, localLeft: 0, localTop: 0 }, "corner", null);
  assert.equal((corner as typeof t).fontSize, 100);
  const side = applyResize(t, { x: 0, y: 0, width: 300, height: t.height, localLeft: 0, localTop: 0 }, "side", null);
  assert.equal((side as typeof t).fontSize, 50);
  assert.equal(side.width, 300);
});

test("assets are de-duplicated by hash and protected by default", () => {
  let doc = createDocument("T", 100, 100);
  const a = { ...asset("a1", 10, 10), integrity: "editable" as const };
  const r1 = addAsset(doc, a);
  assert.equal(r1.asset.integrity, "protected");
  const r2 = addAsset(r1.doc, { ...a, id: "a2" });
  assert.equal(r2.asset.id, "a1");
  assert.equal(r2.doc.assets.length, 1);
  doc = setProtectOriginals({ ...r2.doc, assets: [{ ...a }], project: { ...r2.doc.project, protectOriginals: false } }, true);
  assert.equal(doc.assets[0].integrity, "protected");
});

test("assignSlot fills every frame of a template slot, keeping the frame", () => {
  const f1 = createEmptyFrame("P1", 10, 20, 165, 250, "Portrait", "portrait-1");
  const f2 = createEmptyFrame("Other", 0, 0, 50, 50, "x", "other");
  const a = asset("p1", 5504, 8256);
  const doc = assignSlot({ ...docWith(f1, f2), assets: [a] }, "portrait-1", a);
  const g1 = findById(doc.elements, f1.id) as ImageElement;
  assert.equal(g1.assetId, "p1");
  assert.deepEqual([g1.x, g1.y, g1.width, g1.height], [10, 20, 165, 250]);
  assert.equal((findById(doc.elements, f2.id) as ImageElement).assetId, null);
});

test("topmostSelection drops descendants of selected groups", () => {
  const a = createShape("rect", 50, 50);
  const b = createShape("rect", 150, 50);
  const g = groupElements(docWith(a, b), [a.id, b.id]);
  assert.deepEqual(topmostSelection(g.doc.elements, [a.id, g.groupId!]), [g.groupId]);
});

// --- history ---------------------------------------------------------------

test("history undoes, redoes and merges rapid edits", () => {
  let h = emptyHistory<number>();
  h = record(h, 1, "nudge", 1000);
  h = record(h, 2, "nudge", 1500); // merged into the first step
  h = record(h, 3, null, 1600);
  assert.equal(h.past.length, 2);
  const u = undo(h, 4)!;
  assert.equal(u.value, 3);
  const u2 = undo(u.history, u.value)!;
  assert.equal(u2.value, 1);
  const r = redo(u2.history, u2.value)!;
  assert.equal(r.value, 3);
});

// --- validation ------------------------------------------------------------

test("validateDocument round-trips a real document", () => {
  const icon = createIcon("camera", ["M1 1L2 2"], 50, 50);
  const doc = docWith(createText("headline", 100, 100), createShape("ribbon", 300, 300), icon);
  const r = validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc, doc);
});

test("validateDocument rejects garbage and newer schemas, and sanitises fields", () => {
  assert.equal(validateDocument("nope").ok, false);
  assert.equal(validateDocument({ schemaVersion: 99, project: { width: 1, height: 1 } }).ok, false);
  const r = validateDocument({
    schemaVersion: 1,
    project: { width: 800, height: 600 },
    elements: [
      { type: "text", id: "t", fill: "red", opacity: 7 },
      { type: "icon", id: "i", paths: ["M0 0<script>"] },
      { type: "image", id: "img", assetId: "missing" },
      { type: "bogus" },
      { type: "text", id: "t" },
    ],
  });
  assert.equal(r.ok, true);
  const els = r.doc!.elements;
  assert.equal(els.length, 4);
  assert.equal((els[0] as { fill: string }).fill, "#000000");
  assert.equal(els[0].opacity, 1);
  assert.deepEqual((els[1] as { paths: string[] }).paths, []);
  assert.equal((els[2] as ImageElement).assetId, null);
  assert.notEqual(els[3].id, "t");
  assert.ok(r.warnings.length >= 4);
});

test("colour helpers", () => {
  assert.equal(normalizeHex("#fff"), "#FFFFFF");
  assert.equal(normalizeHex("#00000080"), "#00000080");
  assert.ok(contrastRatio("#FFFFFF", "#071D43") > 14);
});
