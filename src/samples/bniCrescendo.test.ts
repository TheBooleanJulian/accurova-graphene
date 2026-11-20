import { test } from "node:test";
import assert from "node:assert/strict";
import { BNI_SLOTS, buildBniCrescendo } from "./bniCrescendo.ts";
import { validateDocument } from "../model/validate.ts";
import { walk } from "../model/tree.ts";
import type { ImageElement } from "../model/types.ts";

const icons = { camera: ["M1 1L2 2"], zap: ["M1 1L2 2"], layers: ["M1 1L2 2"], monitor: ["M1 1L2 2"], calendar: ["M1 1L2 2"] };

test("the BNI sample is a valid, editable layer tree matching the spec", () => {
  const doc = buildBniCrescendo(icons);
  assert.equal(doc.project.width, 1647);
  assert.equal(doc.project.height, 922);
  const r = validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(
    doc.elements.map((e) => e.name),
    ["Background", "Studio composite", "Brand", "Exclusive ribbon", "Headline", "Offer", "Features", "Portrait examples", "Footer"],
  );
});

test("every asset slot has a frame, and nothing is pre-filled or generated", () => {
  const doc = buildBniCrescendo(icons);
  const frames: ImageElement[] = [];
  walk(doc.elements, (el) => {
    if (el.type === "image") frames.push(el);
  });
  assert.equal(doc.assets.length, 0);
  for (const slot of BNI_SLOTS) assert.ok(frames.some((f) => f.slotId === slot.id), `frame for ${slot.id}`);
  assert.ok(frames.every((f) => f.assetId === null));
});

test("the spec's exact copy is present as editable text", () => {
  const doc = buildBniCrescendo(icons);
  const texts: string[] = [];
  walk(doc.elements, (el) => {
    if (el.type === "text") texts.push(el.text);
  });
  for (const copy of [
    "Exclusive for",
    "BNI Crescendo",
    "Fast and Easy",
    "3 Pose",
    "Upper Body Portrait",
    "Special Package",
    "$50",
    "for",
    "3 Photos",
    "Authentic\nPhotos",
    "Quick &\nEfficient",
    "Clean White\nBackdrop",
    "Ready for\nBNI+ & More",
    "Next Session",
    "26 Nov (Thurs) at 10:00 AM",
    "After the BNI Meeting",
  ]) {
    assert.ok(texts.includes(copy), `copy "${copy.replace("\n", " ")}"`);
  }
});
