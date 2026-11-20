// Visual check helper: opens the BNI sample in a fresh profile and saves
// screenshots (whole canvas and a 1:1 close-up) to tests/e2e/out/.
//   node tests/e2e/snapshot.mjs   (dev server must be running on :5190)
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const out = join(resolve(dirname(fileURLToPath(import.meta.url))), "out");
mkdirSync(out, { recursive: true });
const b = await launch({ width: 1600, height: 1000 });
try {
  await b.navigate(process.env.GRAPHENE_URL ?? "http://localhost:5190/");
  await b.waitFor(`!!window.__graphene && !!document.querySelector('[data-testid="welcome-sample"]')`);
  await b.evaluate(`document.querySelector('[data-testid="welcome-sample"]').click()`);
  await b.waitFor(`(() => { const s = window.__graphene.getState(); return s.doc && s.busy === null && s.doc.assets.length === 7 && window.__graphene.imagesReady(); })()`, { timeout: 180000 });
  await b.evaluate(`window.__graphene.setState({ preview: true })`);
  await sleep(1200);
  await b.screenshot(join(out, "sample-preview.png"));
  await b.evaluate(`(() => { const g = window.__graphene; const v = g.getState().viewport; g.setState({ view: { zoom: 1, panX: v.width / 2 - 900, panY: v.height / 2 - 500 } }); })()`);
  await sleep(1200);
  await b.screenshot(join(out, "sample-studio-1to1.png"));
  console.log(`Saved to ${out}`);
} finally {
  await b.close();
}
