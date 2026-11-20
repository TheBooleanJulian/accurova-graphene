import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyFrame } from "./defaults.ts";
import { coverCrop, panCrop } from "./image.ts";
import { localToWorld } from "./geometry.ts";
import { defaultBoxMask, fitFrameToMask, isUsableMask, localToSource, maskOutlineLocal, simplifyPath, sourceToLocal, visibleThroughMask } from "./mask.ts";
import { scaleEl } from "./ops.ts";
import { validateDocument } from "./validate.ts";
import { createDocument } from "./defaults.ts";
import type { ImageElement, ImageMask } from "./types.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const AW = 2000;
const AH = 1000;

function photo(mask: ImageMask | null = null, props: Partial<ImageElement> = {}): ImageElement {
  return { ...createEmptyFrame("Photo", 100, 50, 400, 200, ""), assetId: "a", crop: coverCrop(AW, AH, 2), mask, ...props };
}

const square: ImageMask = {
  shape: "polygon",
  points: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ],
  feather: 4,
  invert: false,
};

test("source and local coordinates round-trip", () => {
  const el = photo();
  const local = sourceToLocal(el, AW, AH, { x: 0.3, y: 0.6 });
  const back = localToSource(el, AW, AH, local);
  close(back.x, 0.3);
  close(back.y, 0.6);
});

test("visibility follows the shape, and invert flips it", () => {
  const el = photo(square);
  assert.equal(visibleThroughMask(el, AW, AH, { x: 200, y: 100 }), true); // centre
  assert.equal(visibleThroughMask(el, AW, AH, { x: 10, y: 10 }), false); // corner
  const inv = photo({ ...square, invert: true });
  assert.equal(visibleThroughMask(inv, AW, AH, { x: 200, y: 100 }), false);
  assert.equal(visibleThroughMask(inv, AW, AH, { x: 10, y: 10 }), true);
  const ell = photo({ shape: "ellipse", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], feather: 0, invert: false });
  assert.equal(visibleThroughMask(ell, AW, AH, { x: 200, y: 100 }), true);
  assert.equal(visibleThroughMask(ell, AW, AH, { x: 1, y: 1 }), false);
});

test("the mask stays on the same source pixels when the photo is panned in its frame", () => {
  const el = photo(square, { crop: coverCrop(AW, AH, 2, 2) });
  const before = sourceToLocal(el, AW, AH, square.points[0]);
  const panned = { ...el, crop: panCrop(el, AW, AH, 30, 0) };
  const after = sourceToLocal(panned, AW, AH, square.points[0]);
  close(after.x, before.x + 30, 1e-6); // moved with the photo
  const o = maskOutlineLocal(panned, AW, AH)!;
  assert.equal(o.kind, "polygon");
});

test("fit frame to mask hugs the cut-out without moving the photo on the canvas", () => {
  const el = photo(square, { rotation: 20 });
  const fitted = fitFrameToMask(el, AW, AH);
  const probe = { x: 0.5, y: 0.4 }; // a source point inside the mask
  const w1 = localToWorld(el, sourceToLocal(el, AW, AH, probe));
  const w2 = localToWorld(fitted, sourceToLocal(fitted, AW, AH, probe));
  close(w1.x, w2.x, 1e-6);
  close(w1.y, w2.y, 1e-6);
  assert.ok(fitted.width < el.width && fitted.height < el.height);
  assert.deepEqual(fitted.crop, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  const inverted = photo({ ...square, invert: true });
  assert.equal(fitFrameToMask(inverted, AW, AH), inverted); // inverted masks have no bounds to fit
});

test("default box masks cover the middle of what is visible", () => {
  const m = defaultBoxMask(photo(), AW, AH, "ellipse");
  assert.equal(m.shape, "ellipse");
  assert.ok(isUsableMask(m));
  const el = photo(m);
  assert.equal(visibleThroughMask(el, AW, AH, { x: 200, y: 100 }), true);
});

test("freehand paths are simplified but keep their corners", () => {
  const pts = [];
  for (let i = 0; i <= 100; i++) pts.push({ x: i, y: 0 });
  for (let i = 1; i <= 100; i++) pts.push({ x: 100, y: i });
  const s = simplifyPath(pts, 0.5);
  assert.deepEqual(s, [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ]);
});

test("scaling an element scales its feather", () => {
  const el = photo(square);
  const scaled = scaleEl(el, 2, { x: 0, y: 0 }) as ImageElement;
  assert.equal(scaled.mask!.feather, 8);
  assert.deepEqual(scaled.mask!.points, square.points); // source-space points are unchanged
});

test("validation keeps good masks and drops broken ones", () => {
  const doc = { ...createDocument("T", 100, 100), assets: [] };
  const raw = {
    ...doc,
    elements: [
      { ...photo(square), assetId: null },
      { ...photo({ shape: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], feather: 0, invert: false }), assetId: null, id: "bad" },
      { ...photo({ shape: "rect", points: [{ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.9 }], feather: 0, invert: false }), assetId: null, id: "flat" },
    ],
  };
  const r = validateDocument(JSON.parse(JSON.stringify(raw)));
  assert.equal(r.ok, true);
  assert.deepEqual((r.doc!.elements[0] as ImageElement).mask, square);
  assert.equal((r.doc!.elements[1] as ImageElement).mask, null);
  assert.equal((r.doc!.elements[2] as ImageElement).mask, null);
  assert.equal(r.warnings.filter((w) => w.includes("mask")).length, 2);
});
