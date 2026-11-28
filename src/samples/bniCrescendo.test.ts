import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import studioMasks from "./studio-masks.json" with { type: "json" };
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

test("the traced studio outlines belong to the photo in demo/ (re-run the tracer if it changes)", () => {
  const photo = readFileSync(new URL("../../demo/original_background.png", import.meta.url));
  assert.equal(createHash("sha256").update(photo).digest("hex"), studioMasks.sha256);
  for (const [name, pts] of Object.entries(studioMasks.layers)) {
    assert.ok(pts.length >= 20, `${name} has a real outline`);
    assert.ok(pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1), `${name} stays inside the photo`);
  }
});

test("the studio composite is four masked layers of one photo", () => {
  const doc = buildBniCrescendo(icons);
  const studio = doc.elements.find((e) => e.name === "Studio composite");
  assert.ok(studio && studio.type === "group");
  assert.deepEqual(
    studio.children.map((c) => c.name),
    ["Studio backdrop", "Brown-jacket subject", "Studio softbox / lights", "DSLR on tripod"],
  );
  for (const c of studio.children) assert.ok(c.type === "image" && c.slotId === "studio" && c.mask && c.mask.points.length >= 20);
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
    "Professional Portraits,\nMade Easy",
    "3 Poses",
    "Upper Body Portraits",
    "Message Julian to book your slot.",
    "BNI Crescendo Special",
    "$50",
    "for 3 processed\nphotos",
    "Real You.\nNo AI.",
    "Quick &\nConvenient",
    "Clean,\nProfessional\nBackdrop",
    "Ready for BNI+,\nLinkedIn &\nBeyond",
    "Next Photography Session",
    "26 Nov (Thurs) at 10:00 AM",
    "After the BNI Meeting.",
  ]) {
    assert.ok(texts.includes(copy), `copy "${copy.replaceAll("\n", " ")}"`);
  }
});
