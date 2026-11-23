# Progress

## Phase 1: functional editor foundation (complete, 2026-11-20)

| Spec checklist item | Status | Where |
|---|---|---|
| React + TypeScript application | Done | Vite 8, React 19, TS 7 |
| Editor shell and responsive desktop layout | Done | top bar, tool rail + asset panel, canvas, properties, docked layers, status bar; narrower panels below 1280 / 1024 px |
| Canvas with custom dimensions | Done | presets + custom; resize at any time |
| Image upload and asset library | Done | Uploads panel, drag to canvas or into a frame, provenance and integrity badges |
| Text and basic shapes | Done | text presets; 9 shape kinds incl. ribbon and callout; icons |
| Selection, drag, resize, rotation | Done | single and multi; rotated-box resize; Alt from centre; Shift constraints |
| Layer panel | Done | tree, drag reorder, rename, hide, lock |
| Grouping, locking, visibility, z-order | Done | |
| Alignment and snapping | Done | smart guides to canvas, margins and layers; align / distribute |
| Undo/redo | Done | all document edits; gestures are single steps |
| Local project save/load | Done | IndexedDB autosave, project list, duplicate, packages |
| Export PNG and JPEG | Done | 1×–10×, transparent PNG, preview, pre-flight checks |

**Acceptance test** ("recreate the reference Accurova banner using uploaded source photographs and logo without generating or modifying those assets"): passes. `npm run test:e2e` builds the banner from the seven supplied files, checks that every stored original matches the file on disk by SHA-256, checks for no clipped text and no stretched image, then exports 2× PNG and 1× JPEG at the correct pixel sizes.

### Verified (2026-11-20)

- `npm test`: 41 unit tests pass.
- `npm run build`: typecheck and production build clean.
- `npm run test:e2e`: 24 workflows pass in headless Edge with real mouse and keyboard input:
  - open the sample and check the SHA-256 of every original;
  - check for no clipped text or stretched images;
  - click and double-click selection, group entry;
  - drag, undo/redo, nudge, snapping, rotation;
  - corner and edge photo resizing, crop mode;
  - in-place text editing;
  - adding text, ribbon and icon;
  - group/ungroup/reorder, layer hide/lock/rename;
  - upload validation, slot replacement keeping the frame;
  - autosave across reload;
  - PNG/JPEG export with downloaded-file dimension checks;
  - package export with hash checks, package import;
  - preview mode, light theme;
  - no console errors.
- The 2× export and editor screenshots were inspected by eye.

### Not verified

- Firefox and Safari: only Edge (Chromium) was exercised. Expected gaps are listed below.
- Touch and tablet input: the layout adapts, but touch gestures were not tested.
- Very large projects (hundreds of layers or dozens of 45 MP photos): not profiled.

## Masking tools (complete, 2026-11-20)

Rectangle, ellipse, polygon and freehand masks with feather, invert, fit-frame-to-mask and duplicate-in-place (design in [DECISIONS.md D10](DECISIONS.md)). The BNI sample now builds the studio composite as the spec's four separately selectable layers, all cut from the one supplied photo (`demo/original_background.png`, renamed from the ChatGPT-named file and confirmed Original by the owner).

Verified: `npm test` passes 49 unit tests, including coordinate round trips, masks following crops and pans, fit-frame keeping the photo fixed, simplification, validation and feather scaling. `npm run test:e2e` passes 28 workflows. The new ones are: mask-aware selection of the four studio layers; a rectangle mask drawn, resized, feathered, inverted, removed and undone; a polygon drawn by clicks, with vertex drag, Alt+click delete and undo; a freehand lasso plus fit-frame-to-mask; masks surviving reload and the package round trip. The sample and 2× export were also inspected by eye.

## Deployment and CI (2026-11-20)

- Live at https://graphene.accurova.com (Cloudflare Workers static assets). Verified: the site serves over HTTPS with immutable caching for hashed assets; the full BNI sample loads in a real browser from the production build; no dev hook and no console errors.
- Workers Builds trigger on `main` (build: `npm ci && npm run sample:prepare && npm run build`, deploy: `npx wrangler deploy`).
- GitHub Actions CI: typecheck, build and unit tests, plus the end-to-end suite in headless Chrome.
- Fixed: the welcome screen's sample button could open "map your files" instead of loading the photos when clicked before the sample check finished.

## Known limitations

- **Studio cut-outs** are traced from the photo by `scripts/trace-studio-masks.py` (2026-11-23), replacing the first hand-drawn polygons, which cut into the gear and let the studio wall show. Colour rules plus sub-pixel edge tracing give the result as editable polygons. Very fine detail (cable strands, the softbox's thinnest ribs) is simplified to about 1 px, and the original photo is unchanged. Re-run the script if `demo/original_background.png` changes; a unit test checks the recorded hash.
- **Masks** are one shape per layer (holes via keyhole polygons), with straight polygon edges only (no Béziers) and no brush painting. Feather needs canvas `filter` (Chromium, Firefox); elsewhere edges are hard.
- **Gradients** are linear only. Text fills are solid colour only.
- **Rotated groups:** rotating a group rotates its children about the group centre; afterwards the group's selection box is axis-aligned rather than rotated.
- **Text editing** uses a textarea overlay styled like the text. Paragraph spacing is not shown while typing, and wrapping can differ from the canvas by a pixel or two until editing ends.
- **Display proxies** are capped at 2560 px, so a large photo zoomed far past 100 % looks soft *in the editor*. Exports always use the original.
- **Custom SVG icons** upload as images: safe and scalable, but not recolourable. Font upload is deferred to Phase 4.
- **ctx.filter** (image adjustments) and `EyeDropper` are Chromium features. Elsewhere, adjustments are ignored and the eyedropper is disabled.
- **EXIF orientation** relies on the browser's default (`from-image`); unusual EXIF-rotated photos are untested.
- PDF/SVG export, multiple pages, brand-kit management and template saving are later phases.
- Storage is per browser profile. Clearing site data deletes projects, so export a package to keep a copy. The app requests persistent storage to avoid eviction.

## Next

- Phase 2: Markdown brief import (parse spec Part I → the same template and slot structure the sample already uses), Markdown export.
- Before any public deployment: decide hosting (Cloudflare Workers static assets per the migration standard) and create the GitHub repository.
