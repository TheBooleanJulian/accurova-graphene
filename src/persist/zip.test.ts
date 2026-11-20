import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { createZip, crc32, readZip } from "./zip.ts";

test("crc32 matches the reference value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("createZip / readZip round trip with UTF-8 names and binary data", async () => {
  const bin = new Uint8Array(70000).map((_, i) => (i * 31) % 256);
  const zip = createZip([
    { name: "project.json", data: new TextEncoder().encode('{"a":1}') },
    { name: "assets/café portrait.jpg", data: bin },
  ]);
  const files = await readZip(zip);
  assert.equal(new TextDecoder().decode(files.get("project.json")), '{"a":1}');
  assert.deepEqual(files.get("assets/café portrait.jpg"), bin);
});

test("readZip accepts deflated entries written by other tools", async () => {
  const text = new TextEncoder().encode("hello hello hello hello");
  const stored = createZip([{ name: "a.txt", data: text }]);
  // Rewrite the single entry as method 8 (deflate).
  const deflated = new Uint8Array(deflateRawSync(text));
  const name = new TextEncoder().encode("a.txt");
  const local = new Uint8Array(30 + name.length);
  local.set(stored.subarray(0, 30 + name.length));
  const lv = new DataView(local.buffer);
  lv.setUint16(8, 8, true);
  lv.setUint32(18, deflated.length, true);
  const central = stored.slice(30 + name.length + text.length, 30 + name.length + text.length + 46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint16(10, 8, true);
  cv.setUint32(20, deflated.length, true);
  const end = stored.slice(stored.length - 22);
  const ev = new DataView(end.buffer);
  ev.setUint32(16, local.length + deflated.length, true);
  const zip = new Uint8Array([...local, ...deflated, ...central, ...end]);
  const files = await readZip(zip);
  assert.equal(new TextDecoder().decode(files.get("a.txt")), "hello hello hello hello");
});

test("readZip rejects path traversal and corrupted data", async () => {
  await assert.rejects(readZip(createZip([{ name: "../evil.txt", data: new Uint8Array([1]) }])), /Unsafe path/);
  const zip = createZip([{ name: "a.bin", data: new Uint8Array([1, 2, 3]) }]);
  zip[30 + 5] ^= 0xff; // flip a data byte
  await assert.rejects(readZip(zip), /Checksum mismatch/);
  await assert.rejects(readZip(new Uint8Array(40)), /Not a ZIP/);
});
