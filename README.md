# Accurova Graphene

A browser-based, layer-based graphic editor for marketing graphics built from **real, supplied assets**. Logos and photographs are placed, cropped, masked and layered exactly as uploaded, never redrawn, and exported at high resolution from the original files.

> **Generate ideas. Compose with real assets. Edit individual layers. Export with confidence.**

The full product brief is [accurova-graphene-specification.md](accurova-graphene-specification.md). This repository currently implements **Phase 1: the functional editor**. AI features (Phase 3) and Markdown import (Phase 2) are not built yet; see [docs/PROGRESS.md](docs/PROGRESS.md).

## Run it

Requires Node 22+ and a Chromium-based browser (Chrome or Edge) or Firefox.

```bash
npm install
npm run dev            # http://localhost:5190
```

**Live:** https://graphene.accurova.com, which auto-deploys from `main`.

Everything runs in the browser. There is no server, no account and no AI call. Projects and original files are saved in the browser's IndexedDB.

### The reference sample (BNI Crescendo banner)

The sample is a template with every designed element as an editable layer, plus seven named **asset slots** (logo, event room photo, studio photo, four portraits). Two ways to fill them:

- **Map your own files**: *Templates → Open and map my files*, then choose a file for each slot. Graphene never guesses which photo is which.
- **Use the supplied demo files** (in `demo/`, committed with the owner's approval):

  ```bash
  npm run sample:prepare      # copies demo/ → public/samples/bni-crescendo/assets (git-ignored)
  ```

  *Templates → Open with sample photos* then loads them automatically.

## Test

```bash
npm test               # unit tests (Node's built-in runner, no extra dependencies)
npm run typecheck
npm run build          # typecheck + production build into dist/
npm run sample:prepare && npm run test:e2e   # end-to-end workflows in headless Edge/Chrome
```

`node tests/e2e/snapshot.mjs` (with the dev server running) saves sample screenshots for a visual check; `node tests/e2e/render-sample.mjs [out.png]` exports the sample at 1× through the app's exporter.

`test:e2e` starts Vite if needed, drives the real editor with real mouse and keyboard input over the Chrome DevTools Protocol, and writes screenshots and exported files to `tests/e2e/out/`. Set `GRAPHENE_BROWSER` to a browser executable if Edge/Chrome is not in a standard location, and `HEADED=1` to watch it run.

## What it does (Phase 1)

| Area | Features |
|---|---|
| Canvas | Custom size and presets (banner, social, print @300 dpi); resize later without stretching anything; zoom, pan, fit; grid; margin / safe-area guide; solid, gradient or transparent background |
| Images | PNG, JPEG, WebP, SVG upload (content-sniffed, 60 MB limit, SVG sanitised); originals stored byte-for-byte with a SHA-256; fill/fit modes that **cannot stretch**; non-destructive crop and reposition; edge resizing reveals more of the photo; corner radius and soft edge fade masks; replace image keeping the frame; provenance (Original / Unverified / AI-generated) and integrity (Protected / Editable / AI-editable / Generated) on every asset; resolution check |
| Masks | Rectangle, ellipse, click-polygon and freehand lasso masks on any photo; drag vertices, insert at midpoints, Alt+click to delete, move the whole mask; feather and invert; "Fit frame to mask"; "Duplicate in place" to cut one photo into several layers. Masks are stored in the photo's own coordinates, so they stay on the subject through crops and resizes, and clicks pass through masked-out areas. Allowed on Protected assets: they hide pixels, never change them |
| Text | Editable text boxes that grow with their content (no clipping); presets; Montserrat and Inter (bundled, full weights, italics) plus UI fonts; size, weight, italic, colour, alignment, line height, letter spacing, paragraph spacing, caps, outline; overflow warning |
| Shapes & icons | Rectangle, rounded rectangle, ellipse, polygon, star, slanted ribbon, callout, line, arrow; solid or gradient fill, stroke, corner radius, shadow. Searchable library of ~2,100 recolourable Lucide outline icons |
| Layers | Tree panel: reorder by drag (including into and out of groups), rename, hide, lock, multi-select; group/ungroup; z-order; click-through for locked layers; double-click to enter a group |
| Layout | Move, resize, rotate (single or multiple); smart guides and snapping to canvas, margins and other layers; align and distribute; nudge; duplicate (Ctrl+D or Alt-drag); copy and paste |
| History & saving | Undo/redo for every edit (drags are one step); autosave to IndexedDB with a visible save state; reopen last project; duplicate project; project packages (`.graphene.zip`: JSON plus untouched originals, checksum-verified on import) |
| Export | PNG (optionally transparent) and JPEG at 1×–10×, with a preview and pre-flight warnings (low resolution, empty frames, off-canvas layers, unverified provenance, system fonts). Images are decoded from the **original files** at the exact output size |

Keyboard shortcuts: press `?` in the editor.

## Project layout

```text
src/
  model/      document schema, pure operations, geometry, crop maths, text layout, validation, undo history
  render/     the one Canvas2D renderer (editor, thumbnails and export), image proxies, fonts
  persist/    IndexedDB, asset import and hashing, SVG sanitising, ZIP packages
  export/     high-resolution export and pre-flight checks
  store/      editor state and actions
  ui/         React components (canvas stage, panels, inspector, dialogs)
  samples/    the BNI Crescendo template
  icons/      generated Lucide data (npm run icons)
scripts/      icon generation, sample preparation, studio cut-out tracing (Python, authoring only)
tests/e2e/    CDP driver and workflow test
docs/         DECISIONS.md (architecture), PROGRESS.md (status, limitations)
```

## Deployment and CI

- **Hosting:** Cloudflare Workers static assets on the accurova account, at the custom domain `graphene.accurova.com` (`wrangler.jsonc`). There is no server code, binding or secret.
- **Auto-deploy:** Cloudflare Workers Builds runs on every push to `main`: `npm ci && npm run sample:prepare && npm run build`, then `npx wrangler deploy`. The deployed site includes the BNI sample photos from `demo/`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) runs on pushes and PRs. It does the typecheck, production build and unit tests, then the full end-to-end suite in headless Chrome, and uploads screenshots as an artifact.
- **Manual deploy** (if ever needed): `npm run sample:prepare && npm run build && npx wrangler deploy` from a non-Drive clone.
- **Expected check failure:** the Workers Builds GitHub check fails on feature/dev PRs and succeeds on `main`. It is the same for the fleet's other Workers sites; judge the `main` build.

## Configuration

Phase 1 needs no environment variables. `.env.example` reserves the server-side names Phase 3 will use. API keys will never go into browser code.

## Licences

Bundled fonts are under the SIL Open Font License (`src/assets/fonts/licenses/`). Icons are from Lucide (ISC, `src/icons/LUCIDE-LICENSE.txt`).
