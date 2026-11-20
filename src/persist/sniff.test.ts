import { test } from "node:test";
import assert from "node:assert/strict";
import { guessProvenance, sniffImageType } from "./sniff.ts";

const bytes = (...v: number[]) => new Uint8Array(v);
const text = (s: string) => new TextEncoder().encode(s);

test("sniffImageType recognises supported formats by content", () => {
  assert.equal(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), "image/png");
  assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffImageType(text("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImageType(text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')), "image/svg+xml");
  assert.equal(sniffImageType(text("﻿<svg viewBox='0 0 1 1'/>")), "image/svg+xml");
});

test("sniffImageType rejects everything else", () => {
  assert.equal(sniffImageType(text("<html><svg></svg></html>")), null);
  assert.equal(sniffImageType(text("GIF89a")), null);
  assert.equal(sniffImageType(text("%PDF-1.7")), null);
  assert.equal(sniffImageType(new Uint8Array()), null);
});

test("provenance heuristic flags AI-tool filenames for confirmation", () => {
  assert.equal(guessProvenance("Accurova_850_6531_LR.jpg").provenance, "original");
  const ai = guessProvenance("ChatGPT Image Nov 20, 2026, 04_14_19 PM.png");
  assert.equal(ai.provenance, "unknown");
  assert.ok(ai.note);
});
