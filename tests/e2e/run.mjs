// End-to-end workflow test: drives the real editor in headless Edge/Chrome over
// CDP and checks the Phase 1 acceptance workflows with real pointer and
// keyboard input.
//
//   npm run sample:prepare      # once: copies the demo photos (git-ignored)
//   npm run test:e2e            # starts Vite if needed, runs, writes tests/e2e/out/
//
// Set GRAPHENE_URL to test an already-running dev server, HEADED=1 to watch.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";
import { readZip } from "../../src/persist/zip.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "tests/e2e/out");
const sampleDir = join(root, "public/samples/bni-crescendo/assets");
const URL_ = process.env.GRAPHENE_URL ?? "http://localhost:5190/";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const results = [];
let current = "";
function ok(cond, msg) {
  if (!cond) throw new Error(`${current}: ${msg}`);
}
function near(a, b, eps, msg) {
  ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, expected ${b} ± ${eps})`);
}

async function ensureServer() {
  try {
    await fetch(URL_);
    return null;
  } catch {
    const vite = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "--port", "5190", "--strictPort"], { cwd: root, stdio: "ignore" });
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      try {
        await fetch(URL_);
        return vite;
      } catch {
        // starting
      }
    }
    vite.kill();
    throw new Error("Vite dev server did not start");
  }
}

function pngSize(file) {
  const b = readFileSync(file);
  ok(b.subarray(1, 4).toString() === "PNG", `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(file) {
  const b = readFileSync(file);
  ok(b[0] === 0xff && b[1] === 0xd8, `${file} is not a JPEG`);
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("No SOF marker");
}

async function waitForFile(dir, pattern, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const f = readdirSync(dir).find((n) => pattern.test(n) && !n.endsWith(".crdownload") && !n.endsWith(".tmp"));
    if (f) {
      const p = join(dir, f);
      const s1 = statSync(p).size;
      await sleep(300);
      if (statSync(p).size === s1 && s1 > 0) return p;
    }
    await sleep(200);
  }
  throw new Error(`No download matching ${pattern}`);
}

const server = await ensureServer();
const b = await launch({ headless: !process.env.HEADED });
await b.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: out, eventsEnabled: true });
const G = "window.__graphene";
const js = (s) => b.evaluate(s);
const state = (expr) => js(`(() => { const s = ${G}.getState(); return ${expr}; })()`);
const byName = (name) => js(`${G}.byName(${JSON.stringify(name)})`);
const clickTestId = (id) => js(`(() => { const el = document.querySelector('[data-testid="${id}"]'); if (!el) throw new Error('missing ${id}'); el.click(); return true; })()`);
const centerOf = async (name) => {
  const el = await byName(name);
  ok(el, `layer "${name}" exists`);
  return js(`${G}.toClient(${el.x + el.width / 2}, ${el.y + el.height / 2})`);
};
const rectOf = (selector) => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const CTRL = 2;
const SHIFT = 8;

async function step(name, fn) {
  current = name;
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✓ ${name} (${Date.now() - t} ms)`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  ✗ ${name}\n    ${err.message}`);
    await b.screenshot(join(out, `FAILED-${name.replace(/[^\w]+/g, "-")}.png`)).catch(() => {});
    throw err;
  }
}

let failed = false;
try {
  console.log(`Graphene E2E against ${URL_}`);
  await b.navigate(URL_);
  await b.waitFor(`!!${G} && !!document.querySelector('[data-testid="welcome-sample"]')`, { label: "welcome screen" });
  await b.screenshot(join(out, "00-welcome.png"));

  const sampleFiles = JSON.parse(readFileSync(join(sampleDir, "manifest.json"), "utf8")).files;

  await step("Open the BNI Crescendo sample with the supplied photographs", async () => {
    await clickTestId("welcome-sample");
    await b.waitFor(`(() => { const s = ${G}.getState(); return s.doc && s.busy === null && s.doc.assets.length === 7 && ${G}.imagesReady(); })()`, { timeout: 180000, label: "7 assets loaded" });
    ok((await state("s.dialog")) === null, "no mapping dialog: every slot was filled");
    const empty = await js(`(() => { const out = []; const visit = (l) => l.forEach((e) => { if (e.type === 'group') visit(e.children); else if (e.type === 'image' && !e.assetId) out.push(e.name); }); visit(${G}.getState().doc.elements); return out; })()`);
    ok(empty.length === 0, `no empty frames (found ${empty.join(", ")})`);
    await sleep(800);
    await b.screenshot(join(out, "01-sample-loaded.png"));
  });

  await step("Uploaded originals are stored byte-for-byte (SHA-256)", async () => {
    const assets = await state("s.doc.assets");
    for (const f of sampleFiles) {
      const expected = sha(readFileSync(join(sampleDir, f.file)));
      const a = assets.find((x) => x.name === f.originalName);
      ok(a, `asset for ${f.originalName}`);
      ok(a.hash === expected, `${f.originalName}: recorded hash matches the file on disk`);
      ok((await js(`${G}.storedHash(${JSON.stringify(a.hash)})`)) === expected, `${f.originalName}: stored bytes hash to the original`);
      ok(a.integrity === "protected", `${f.originalName} defaults to Protected`);
    }
    const studio = assets.find((x) => x.name.startsWith("ChatGPT"));
    ok(studio.provenance === "unknown", "the ChatGPT-named studio file is flagged for provenance confirmation");
  });

  await step("Sample has no clipped text and no stretched images", async () => {
    const r = await js(`${G}.integrityReport()`);
    ok(r.overflow.length === 0, `text fits its boxes (overflowing: ${r.overflow.join(", ")})`);
    ok(r.stretched.length === 0, `images keep their proportions (stretched: ${r.stretched.join(", ")})`);
    const studio = await byName("Studio photograph (backdrop, subject, softbox, DSLR on tripod)");
    ok(studio.visible && studio.assetId, "studio photo with the DSLR and tripod is placed and visible");
  });

  let pose;
  await step("Click selects the group; double-click enters it", async () => {
    pose = await byName("3 Pose");
    const c = await centerOf("3 Pose");
    await b.click(c.x, c.y);
    const headline = await byName("Headline");
    ok(JSON.stringify(await state("s.selection")) === JSON.stringify([headline.id]), "first click selects the Headline group");
    await b.dblclick(c.x, c.y);
    ok((await state("s.enteredGroup")) === headline.id, "double-click enters the group");
    ok(JSON.stringify(await state("s.selection")) === JSON.stringify([pose.id]), "and selects 3 Pose");
  });

  await step("Drag moves a layer; undo and redo restore it", async () => {
    await js(`${G}.setState({ snapping: false })`);
    const zoom = await state("s.view.zoom");
    const c = await centerOf("3 Pose");
    await b.drag(c.x, c.y, c.x + 60, c.y + 30);
    const moved = await byName("3 Pose");
    near(moved.x, pose.x + 60 / zoom, 0.6, "x moved by the drag distance");
    near(moved.y, pose.y + 30 / zoom, 0.6, "y moved by the drag distance");
    await b.key("z", CTRL);
    const undone = await byName("3 Pose");
    near(undone.x, pose.x, 0.01, "undo restores x");
    near(undone.y, pose.y, 0.01, "undo restores y");
    await b.key("z", CTRL | SHIFT);
    near((await byName("3 Pose")).x, moved.x, 0.01, "redo re-applies the move");
    await b.key("z", CTRL);
    await b.key("ArrowRight");
    await b.key("ArrowRight", SHIFT);
    near((await byName("3 Pose")).x, pose.x + 11, 0.01, "arrow keys nudge 1 px and 10 px");
    await b.key("z", CTRL);
    near((await byName("3 Pose")).x, pose.x, 0.01, "nudges undo as one step");
    await js(`${G}.setState({ snapping: true })`);
    await b.key("Escape");
    await b.key("Escape");
  });

  await step("Snapping pulls a shape onto the canvas edge", async () => {
    await clickTestId("tab-shapes");
    await clickTestId("add-shape-rectangle");
    const id = (await state("s.selection"))[0];
    // Hide every other layer so the canvas edge is the only nearby snap line (one undo step).
    await js(`${G}.commit((d) => ({ ...d, elements: d.elements.map((e) => (e.id === ${JSON.stringify(id)} ? e : { ...e, visible: false })) }))`);
    const el = await js(`${G}.findById(${JSON.stringify(id)})`);
    const c = await js(`${G}.toClient(${el.x + el.width / 2}, ${el.y + el.height / 2})`);
    const target = await js(`${G}.toClient(${3 + el.width / 2}, ${el.y + el.height / 2 + 0.4})`); // left edge to x=3
    await b.drag(c.x, c.y, target.x, target.y, { steps: 20 });
    const snapped = await js(`${G}.findById(${JSON.stringify(id)})`);
    ok(snapped.x === 0, `left edge snapped to the canvas edge (x=${snapped.x})`);
    await b.drag(c.x + 200, c.y, c.x + 200, c.y, { steps: 1 }); // click on empty canvas: deselects
    await b.key("z", CTRL); // undo the move
    await b.key("z", CTRL); // undo the hiding
    ok((await byName("Footer")).visible, "layers visible again after undo");
    await js(`${G}.setState({ selection: [${JSON.stringify(id)}] })`);
  });

  await step("Rotate handle rotates the shape (with 45° detents)", async () => {
    const id = (await state("s.selection"))[0];
    const el = await js(`${G}.findById(${JSON.stringify(id)})`);
    const h = await rectOf('[data-testid="handle-rotate"]');
    const c = await js(`${G}.toClient(${el.x + el.width / 2}, ${el.y + el.height / 2})`);
    const r = Math.hypot(h.x - c.x, h.y - c.y);
    await b.drag(h.x, h.y, c.x + r, c.y + 1, { steps: 16 });
    const rotated = await js(`${G}.findById(${JSON.stringify(id)})`);
    ok(rotated.rotation === 90, `rotation is 90° (got ${rotated.rotation})`);
    near(rotated.x + rotated.width / 2, el.x + el.width / 2, 0.01, "rotates about its centre");
    await b.key("Delete");
    ok((await js(`${G}.findById(${JSON.stringify(id)})`)) === null, "Delete removes the layer");
  });

  await step("Corner-resizing a photo keeps its proportions and crop", async () => {
    const before = await byName("Portrait 01 photo");
    const c = await centerOf("Portrait 01 photo");
    await b.click(c.x, c.y, { modifiers: CTRL });
    ok((await state("s.selection"))[0] === before.id, "Ctrl+click selects inside groups");
    const h = await rectOf('[data-testid="handle-se"]');
    await b.drag(h.x, h.y, h.x + 40, h.y + 5, { modifiers: CTRL });
    const after = await byName("Portrait 01 photo");
    ok(after.width > before.width + 10, "frame grew");
    near(after.width / after.height, before.width / before.height, 1e-6, "aspect ratio unchanged");
    ok(JSON.stringify(after.crop) === JSON.stringify(before.crop), "crop unchanged");
    await b.key("z", CTRL);
  });

  await step("Edge-resizing a photo reveals more of it without stretching", async () => {
    const before = await byName("Portrait 01 photo");
    const h = await rectOf('[data-testid="handle-e"]');
    await b.drag(h.x, h.y, h.x + 30, h.y, { modifiers: CTRL });
    const after = await byName("Portrait 01 photo");
    ok(after.width > before.width && Math.abs(after.height - before.height) < 0.01, "width grew, height kept");
    ok(after.crop.width > before.crop.width, "crop widened (more of the photo is revealed)");
    ok((await js(`${G}.integrityReport()`)).stretched.length === 0, "no stretching");
    await b.key("z", CTRL);
    ok(JSON.stringify((await byName("Portrait 01 photo")).crop) === JSON.stringify(before.crop), "undo restores the crop");
  });

  await step("Crop mode repositions the photo inside its frame", async () => {
    const before = await byName("Portrait 02 photo");
    const c = await centerOf("Portrait 02 photo");
    await b.click(c.x, c.y, { modifiers: CTRL });
    await b.key("Enter");
    ok((await state("s.cropId")) === before.id, "Enter starts crop mode");
    await b.drag(c.x, c.y, c.x, c.y + 25);
    const after = await byName("Portrait 02 photo");
    ok(after.crop.y < before.crop.y, "dragging down shows more of the top of the photo");
    near(after.crop.width, before.crop.width, 1e-9, "crop size unchanged while panning");
    await b.screenshot(join(out, "02-crop-mode.png"));
    await b.key("Escape");
    ok((await state("s.cropId")) === null, "Escape leaves crop mode");
    await b.key("z", CTRL);
  });

  await step("Edit text in place; undo restores the wording", async () => {
    const c = await centerOf("Fast and Easy");
    await b.click(c.x, c.y, { modifiers: CTRL });
    await b.key("Enter");
    await b.waitFor(`document.activeElement?.dataset?.testid === 'text-editor'`, { label: "text editor focused" });
    await b.type("Quick and Easy");
    await b.screenshot(join(out, "03-text-editing.png"));
    await b.key("Escape");
    const t = await byName("Fast and Easy");
    ok(t.text === "Quick and Easy", `text updated (got "${t.text}")`);
    ok((await state("s.editingTextId")) === null, "editor closed");
    await b.key("z", CTRL);
    ok((await byName("Fast and Easy")).text === "Fast and Easy", "undo restores the approved wording");
  });

  let addedText, addedRibbon, addedIcon;
  await step("Add text, a ribbon and a searchable icon", async () => {
    await b.key("Escape");
    await clickTestId("tab-text");
    await clickTestId("add-text-headline");
    addedText = (await state("s.selection"))[0];
    await clickTestId("tab-shapes");
    await clickTestId("add-shape-ribbon");
    addedRibbon = (await state("s.selection"))[0];
    await clickTestId("tab-icons");
    await b.waitFor(`!!document.querySelector('[data-testid="icon-camera"]')`, { label: "icon catalog" });
    await js(`(() => { const i = document.querySelector('input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'calendar'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await b.waitFor(`!!document.querySelector('[data-testid="icon-calendar-days"]')`, { label: "search results" });
    await clickTestId("icon-calendar-days");
    addedIcon = (await state("s.selection"))[0];
    const icon = await js(`${G}.findById(${JSON.stringify(addedIcon)})`);
    ok(icon.type === "icon" && icon.paths.length > 0, "icon layer with vector paths");
    const text = await js(`${G}.findById(${JSON.stringify(addedText)})`);
    ok(text.type === "text" && text.text === "Add a headline", "headline text added");
  });

  await step("Group, ungroup and reorder from the keyboard", async () => {
    await js(`${G}.setState({ selection: [${JSON.stringify(addedText)}, ${JSON.stringify(addedRibbon)}] })`);
    await b.key("g", CTRL);
    const gid = (await state("s.selection"))[0];
    const g = await js(`${G}.findById(${JSON.stringify(gid)})`);
    ok(g.type === "group" && g.children.length === 2, "Ctrl+G groups the two layers");
    await b.key("g", CTRL | SHIFT);
    ok((await state("s.selection")).length === 2, "Ctrl+Shift+G ungroups");
    const ids = await state("s.doc.elements.map((e) => e.id)");
    await js(`${G}.setState({ selection: [${JSON.stringify(addedRibbon)}] })`);
    await b.key("[", CTRL);
    const ids2 = await state("s.doc.elements.map((e) => e.id)");
    ok(ids2.indexOf(addedRibbon) === ids.indexOf(addedRibbon) - 1, "Ctrl+[ sends backward one step");
    await b.key("]", CTRL | SHIFT);
    const ids3 = await state("s.doc.elements.map((e) => e.id)");
    ok(ids3[ids3.length - 1] === addedRibbon, "Ctrl+Shift+] brings to front");
  });

  await step("Layers panel: hide, lock, rename", async () => {
    await b.key("Escape");
    const row = `[data-testid="layer-row"][data-layer-name="Footer"]`;
    await js(`document.querySelector('${row} [data-testid="layer-visibility"]').click()`);
    ok((await byName("Footer")).visible === false, "eye button hides the layer");
    await js(`document.querySelector('${row} [data-testid="layer-visibility"]').click()`);
    ok((await byName("Footer")).visible === true, "and shows it again");
    const studioRow = `[data-testid="layer-row"][data-layer-name="Studio composite"]`;
    await js(`document.querySelector('${studioRow} [data-testid="layer-lock"]').click()`);
    ok((await byName("Studio composite")).locked === true, "lock button locks the layer");
    const sc = await centerOf("Studio photograph (backdrop, subject, softbox, DSLR on tripod)");
    await b.click(sc.x + 40, sc.y + 120);
    const sel = await state("s.selection");
    const studio = await byName("Studio composite");
    ok(!sel.includes(studio.id), "locked layers are click-through on the canvas");
    await js(`document.querySelector('${studioRow} [data-testid="layer-lock"]').click()`);
    ok((await byName("Studio composite")).locked === false, "unlocked");
    const name = await rectOf(`${row} .layer__name`);
    await b.dblclick(name.x, name.y);
    await b.waitFor(`document.activeElement?.getAttribute('aria-label') === 'Rename layer'`, { label: "rename input" });
    await b.key("a", CTRL);
    await b.type("Session footer");
    await b.key("Enter");
    ok(!!(await byName("Session footer")), "layer renamed");
  });

  await step("Upload validates files and places images without distortion", async () => {
    await clickTestId("tab-uploads");
    const before = (await state("s.doc.assets")).length;
    await b.setFiles('[data-testid="upload-input"]', [join(root, "package.json")]);
    await b.waitFor(`document.querySelector('[data-testid="toasts"]').textContent.includes('Could not import package.json')`, { label: "rejection toast" });
    ok((await state("s.doc.assets")).length === before, "non-image rejected");
    const ref = join(root, "demo", "Fast, Easy BNI Portraits.png");
    ok(existsSync(ref), "reference artwork available for the upload test");
    await b.setFiles('[data-testid="upload-input"]', [ref]);
    await b.waitFor(`${G}.getState().doc.assets.length === ${before + 1} && ${G}.getState().busy === null`, { label: "upload imported" });
    const a = (await state("s.doc.assets")).at(-1);
    ok(a.hash === sha(readFileSync(ref)), "uploaded bytes preserved");
    await js(`document.querySelectorAll('[data-testid="asset"]')[${before}].click()`);
    const placed = await js(`${G}.findById(${G}.getState().selection[0])`);
    ok(placed.type === "image" && placed.assetId === a.id, "clicking the asset places it");
    near(placed.width / placed.height, a.width / a.height, 0.01, "placed at its own aspect ratio");
    await b.key("Delete");
  });

  await step("Replace an image while keeping its frame (template slot mapping)", async () => {
    const before = await byName("Portrait 04 photo");
    await clickTestId("project-menu");
    await js(`[...document.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.includes('Map template slots')).click()`);
    await b.waitFor(`!!document.querySelector('[data-testid="slots-dialog"]')`, { label: "slots dialog" });
    const ref = (await state("s.doc.assets")).at(-1);
    await js(`(() => { const sel = document.querySelector('[data-slot="portrait-4"] select'); sel.value = ${JSON.stringify(ref.id)}; sel.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const after = await byName("Portrait 04 photo");
    ok(after.assetId === ref.id, "slot now shows the chosen file");
    ok(after.x === before.x && after.y === before.y && after.width === before.width && after.height === before.height, "frame position and size kept");
    await b.key("Escape");
    await b.key("z", CTRL);
    ok((await byName("Portrait 04 photo")).assetId === before.assetId, "undo restores the original portrait");
  });

  await step("Autosave survives a reload", async () => {
    await b.waitFor(`${G}.getState().save.status === 'saved'`, { label: "saved", timeout: 15000 });
    const count = await state("(() => { let n = 0; const v = (l) => l.forEach((e) => { n++; if (e.children) v(e.children); }); v(s.doc.elements); return n; })()");
    await b.navigate(URL_);
    await b.waitFor(`!!${G} && !!${G}.getState().doc && ${G}.imagesReady()`, { timeout: 120000, label: "project reopened" });
    ok(!!(await byName("Session footer")), "rename persisted");
    const count2 = await state("(() => { let n = 0; const v = (l) => l.forEach((e) => { n++; if (e.children) v(e.children); }); v(s.doc.elements); return n; })()");
    ok(count2 === count, `same number of layers after reload (${count2} vs ${count})`);
    ok((await state("s.doc.assets")).length === 8, "assets persisted");
  });

  await step("Export a 2× PNG (preview, then download) from the originals", async () => {
    await sleep(600);
    await b.screenshot(join(out, "04-editor-after-edits.png"));
    await clickTestId("export");
    await b.waitFor(`!!document.querySelector('[data-testid="export-dialog"]')`, { label: "export dialog" });
    await clickTestId("render-export");
    await b.waitFor(`!!document.querySelector('[data-testid="export-image"]')`, { timeout: 180000, label: "export rendered" });
    const dims = await js(`(() => { const i = document.querySelector('[data-testid="export-image"]'); return { w: +i.dataset.width, h: +i.dataset.height }; })()`);
    ok(dims.w === 3294 && dims.h === 1844, `2× of 1647 × 922 (got ${dims.w} × ${dims.h})`);
    // Sample pixels from the rendered export: the red offer panel and the navy "3 Pose".
    const px = await js(`(async () => {
      const img = document.querySelector('[data-testid="export-image"]');
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const at = (x, y) => Array.from(ctx.getImageData(x * 2, y * 2, 1, 1).data);
      return { offer: at(300, 650), pose: at(${pose.x + 20}, ${pose.y + 100}), card: at(1082, 702) };
    })()`);
    ok(px.offer[0] > 140 && px.offer[1] < 60 && px.offer[2] < 70, `offer panel is red (${px.offer})`);
    await b.screenshot(join(out, "05-export-preview.png"));
    await clickTestId("download-export");
    const file = await waitForFile(out, /@2x\.png$/);
    const size = pngSize(file);
    ok(size.width === 3294 && size.height === 1844, `downloaded PNG is ${size.width} × ${size.height}`);
  });

  await step("Export a 1× JPEG", async () => {
    await js(`[...document.querySelectorAll('[data-testid="export-dialog"] .seg button')].find((b) => b.textContent === 'JPEG').click()`);
    await js(`[...document.querySelectorAll('[data-testid="export-dialog"] .seg button')].find((b) => b.textContent === '1×').click()`);
    await clickTestId("render-export");
    await b.waitFor(`document.querySelector('[data-testid="export-image"]')?.dataset.width === '1647'`, { timeout: 120000, label: "jpeg rendered" });
    await clickTestId("download-export");
    const file = await waitForFile(out, /@1x\.jpg$/);
    const size = jpegSize(file);
    ok(size.width === 1647 && size.height === 922, `downloaded JPEG is ${size.width} × ${size.height}`);
    await b.key("Escape");
  });

  await step("Project package contains the JSON and untouched originals", async () => {
    await clickTestId("project-menu");
    await clickTestId("menu-package");
    const zip = await waitForFile(out, /\.graphene\.zip$/, 60000);
    const files = await readZip(new Uint8Array(readFileSync(zip)));
    const project = JSON.parse(new TextDecoder().decode(files.get("project.json")));
    ok(project.schemaVersion === 1 && project.assets.length === 8, "project.json with 8 assets");
    for (const a of project.assets) {
      const bytes = files.get(project.package.assets[a.id]);
      ok(bytes && sha(bytes) === a.hash, `${a.name} in the package matches its hash`);
    }
  });

  await step("Import the package as a new project", async () => {
    const zip = readdirSync(out).find((n) => n.endsWith(".graphene.zip"));
    const beforeId = await state("s.doc.project.id");
    await clickTestId("project-menu");
    await b.chooseFiles(() => clickTestId("menu-import"), [join(out, zip)]);
    await b.waitFor(`${G}.getState().doc.project.id !== ${JSON.stringify(beforeId)} && ${G}.getState().busy === null`, { timeout: 60000, label: "imported project opened" });
    await b.waitFor(`${G}.imagesReady()`, { timeout: 120000, label: "imported images" });
    ok((await state("s.doc.assets")).length === 8, "imported with all assets");
    ok(!!(await byName("Session footer")), "imported design matches");
  });

  await step("Preview mode hides the editor UI", async () => {
    await clickTestId("preview");
    await b.waitFor(`!!document.querySelector('[data-testid="exit-preview"]') && !document.querySelector('.topbar')`, { label: "preview" });
    await sleep(500);
    await b.screenshot(join(out, "06-preview.png"));
    await b.key("Escape");
    await b.waitFor(`!!document.querySelector('.topbar')`, { label: "editor back" });
  });

  await step("Light theme keeps the same layout", async () => {
    await js(`document.documentElement.setAttribute('data-theme', 'light')`);
    await sleep(300);
    const bg = await js(`getComputedStyle(document.body).backgroundColor`);
    ok(bg === "rgb(243, 245, 255)", `light background token applied (${bg})`);
    await b.screenshot(join(out, "07-light-theme.png"));
    await js(`document.documentElement.setAttribute('data-theme', 'dark')`);
  });

  await step("No uncaught errors in the page", async () => {
    const errs = b.consoleErrors.filter((e) => e && !/favicon|DevTools/.test(e));
    ok(errs.length === 0, `console errors: ${errs.join(" | ")}`);
  });
} catch (err) {
  failed = true;
  if (!results.some((r) => !r.ok)) console.error(err);
} finally {
  await b.close();
  server?.kill();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} workflows passed${failed ? " — FAILED" : ""}. Screenshots and exports: ${out}`);
process.exit(failed ? 1 : 0);
