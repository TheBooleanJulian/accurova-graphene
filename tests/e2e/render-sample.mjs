// Visual check helper: opens the BNI sample in a fresh profile and exports it
// at 1x through the app's own exporter, so the PNG is exactly what a user gets.
//   node tests/e2e/render-sample.mjs [out.png]   (dev server must be running on :5190)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./cdp.mjs";

const here = resolve(dirname(fileURLToPath(import.meta.url)));
const file = resolve(process.argv[2] ?? join(here, "out", "sample-export.png"));
mkdirSync(dirname(file), { recursive: true });
const b = await launch({ width: 1600, height: 1000, port: 9334 });
try {
  await b.navigate(process.env.GRAPHENE_URL ?? "http://localhost:5190/");
  await b.waitFor(`!!window.__graphene && !!document.querySelector('[data-testid="welcome-sample"]')`);
  await b.evaluate(`document.querySelector('[data-testid="welcome-sample"]').click()`);
  await b.waitFor(`(() => { const s = window.__graphene.getState(); return s.doc && s.busy === null && s.doc.assets.length === 7 && window.__graphene.imagesReady(); })()`, { timeout: 180000 });
  const b64 = await b.evaluate(`(async () => {
    const { exportImage } = await import("/src/export/export.ts");
    const r = await exportImage(window.__graphene.getState().doc, { format: "png", scale: 1, quality: 1, transparent: false });
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);
  writeFileSync(file, Buffer.from(b64, "base64"));
  console.log(`Saved ${file}`);
} finally {
  await b.close();
}
