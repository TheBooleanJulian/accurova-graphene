// Copies the BNI Crescendo source assets into public/samples/bni-crescendo/assets
// so "Open sample" can offer them. That folder is git-ignored: these are real
// client photographs and must not be committed.
//
//   npm run sample:prepare                # reads ./demo
//   npm run sample:prepare -- <dir>       # reads another folder
//
// Files are copied byte-for-byte; nothing is resized or re-encoded.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(process.argv[2] ?? join(root, "demo"));
const out = join(root, "public/samples/bni-crescendo/assets");

// Slot → expected source filename (as supplied in demo/).
const MAP = [
  ["logo", "Accurova RTB Banner trans v1.png", "logo.png"],
  ["event", "Accurova_850_2984.jpg", "event-room.jpg"],
  ["studio", "original_background.png", "studio.png"],
  ["portrait-1", "Accurova_850_6577_LR.jpg", "portrait-01.jpg"],
  ["portrait-2", "Accurova_850_6584_LR.jpg", "portrait-02.jpg"],
  ["portrait-3", "Accurova_850_6548_LR.jpg", "portrait-03.jpg"],
  ["portrait-4", "Accurova_850_6531_LR.jpg", "portrait-04.jpg"],
];

mkdirSync(out, { recursive: true });
const files = [];
const missing = [];
for (const [slot, name, file] of MAP) {
  const from = join(src, name);
  if (!existsSync(from)) {
    missing.push(name);
    continue;
  }
  copyFileSync(from, join(out, file));
  files.push({ slot, file, originalName: name });
  console.log(`  ${slot.padEnd(11)} ${name}  (${(statSync(from).size / 1048576).toFixed(1)} MB)`);
}
writeFileSync(join(out, "manifest.json"), JSON.stringify({ files }, null, 2));
console.log(`Prepared ${files.length} of ${MAP.length} sample assets in ${out}`);
if (missing.length) {
  console.log(`Missing (map these in the app instead): ${missing.join(", ")}`);
  process.exitCode = files.length ? 0 : 1;
}
