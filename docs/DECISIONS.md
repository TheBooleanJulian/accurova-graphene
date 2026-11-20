# Architecture decisions

Decisions taken while building Phase 1, with the reason for each. The spec (Part IV §11) lists a *suggested* stack and asks for the simplest well-supported option; the house rules for this fleet weight low maintenance and minimal dependencies above all.

## D1 — React + TypeScript + Vite, nothing else at runtime

**Decision:** Runtime dependencies are `react` and `react-dom` only. Dev tooling is Vite, TypeScript, `@vitejs/plugin-react`, and `lucide-static` (icon generation only).

**Not used, and why:**

| Suggested | Replaced by | Reason |
|---|---|---|
| Tailwind, shadcn/ui | Plain CSS on Julian Unified UI tokens (`src/styles/tokens.css`) | The fleet design system is defined as CSS custom properties; a utility framework would duplicate it. |
| Zustand | ~150-line store with `useSyncExternalStore` (`src/store/editor.ts`) | It needs only one store, selectors and subscribe. |
| Zod | Hand-written validator/normaliser (`src/model/validate.ts`) | One schema, which also needs to normalise and migrate; it is unit-tested. |
| Konva / Fabric | Own Canvas2D renderer (`src/render/renderer.ts`) | See D3. |
| remark/unified, Fastify, Sharp | Not needed in Phase 1 | Markdown import is Phase 2; there is no server yet. |

The setup mirrors `miku-keytar` (same React/Vite/TS versions and `node --test` with type stripping), so the fleet stays consistent.

## D2 — The document is renderer-independent JSON (schema v1)

`src/model/types.ts` defines the schema. Elements form a tree (groups hold children); array order is paint order. **Groups do not transform their children**: every element stores absolute coordinates plus a rotation about its own centre. Moving or scaling a group transforms its descendants. Rendering, hit-testing and export therefore never compose nested matrices, and group bounds are derived data (`syncGroupBounds`).

All edits go through pure functions in `src/model/ops.ts`. They return a new document and share unchanged subtrees. This gives:

- cheap, reliable undo/redo, because a snapshot is a reference (`src/model/history.ts`);
- unit-testable editing behaviour without a browser;
- a clean target for Phase 3, where AI will propose the same object-level operations.

Text boxes have a fixed width, and their height is derived from the laid-out text (`syncTextHeights`), so text can never be clipped vertically. A word wider than its box is flagged, not hidden.

## D3 — One Canvas2D renderer for editing, thumbnails and export

Konva would have provided transform handles and hit-testing. The trade-off went the other way for three reasons:

1. **What you see is what you export.** The same `renderDocument()` draws the editor canvas and the export, so the export can't drift from the editor.
2. **Original-quality export.** The renderer asks a resolver for each image's pixels. The editor answers with a display proxy; export answers with the original file decoded at the exact size needed. With Konva, the scene graph would have had to be swapped or cloned for this.
3. **Interaction lives in a thin SVG overlay** (`src/ui/canvas/Stage.tsx`) driven by pure geometry (`src/model/geometry.ts`, tested). That covers resize of rotated boxes, snapping and rotation.

## D4 — Asset integrity is structural, not a convention

- An upload is content-sniffed, hashed (SHA-256) and stored **as-is** in IndexedDB, keyed by hash. Stored originals are never overwritten. Identical files are stored once and shared by duplicated projects.
- An image element is a frame plus a normalised crop rectangle. Both fit modes (`cover`, `contain`) scale uniformly, so **stretching is not representable**. Edge-resizing a frame keeps the image fixed on the canvas and reveals or hides content (`refitCropAfterResize`).
- **Protected** assets (the default for every upload) ignore opacity and brightness/contrast/saturation in the renderer itself, so a protected photo cannot be altered by any code path. Placement, scale, rotation, crop and masks (corner radius, edge fades) are allowed, as the spec's "Protected" mode describes.
- Provenance is recorded per asset and shown as a badge. A filename that suggests an AI tool (e.g. "ChatGPT Image …") is set to *Unverified* with a note, never silently treated as an authentic original.
- Packages carry each asset's hash, and import rejects any file whose bytes changed.

## D5 — Display proxies for editing, originals for export

The demo photographs are up to 45 MP. Decoding them at full size for every frame would cost ~180 MB of RAM each and stall interaction. Editing therefore draws a proxy (long edge ≤ 2560 px, `src/render/imageCache.ts`). Export decodes each original **sequentially**, cropped to the visible region and resized to exactly the output pixels it covers (`createImageBitmap` with crop + `resizeQuality: "high"`), so peak memory is one original at a time.

## D6 — Local-first persistence

IndexedDB holds projects (metadata, JSON, thumbnail) and original blobs, with a debounced autosave (700 ms) and a visible save state. The app requests persistent storage. Deleting a project garbage-collects originals that no project references. The portable form is the project package, a ZIP produced and read by a small dependency-free implementation (`src/persist/zip.ts`, stored entries, deflate accepted on import, path-traversal and checksum checks).

## D7 — Fonts are bundled

Montserrat and Inter (variable, full weight range with italics) are bundled as WOFF2 under the OFL, as are the UI fonts (Chakra Petch, IBM Plex Sans, JetBrains Mono). Text is measured and exported only after `document.fonts.load()` resolves, so wrapping and exports are identical on every machine. System fonts are offered but flagged.

## D8 — Testing approach

- Unit tests (`node --test` with type stripping) cover geometry, crop maths, text layout, every document operation, history, validation, ZIP, file sniffing and the sample template.
- End-to-end tests drive headless Edge over raw CDP (`tests/e2e/cdp.mjs`, using Node 22's built-in WebSocket; no Playwright). This is the same zero-dependency approach used for the reels studio. A dev-only `window.__graphene` hook (`src/devtools.ts`, excluded from production builds) exposes state for assertions; all interaction itself is real pointer and keyboard input.

## D9 — Repository and hosting

Development happens in a non-Drive working copy (npm installs corrupt on Google Drive); the Drive folder is a source mirror. Git branches follow `feature/* → dev → main`. The public repository is github.com/TheBooleanJulian/accurova-graphene. `demo/` (the BNI source photos and reference artwork) is committed with the owner's approval. No hosting has been set up; per the fleet's migration plan it would be static assets on Cloudflare Workers, and that needs a separate go-ahead.

## D10 — Masking tools (2026-11-20)

**Goal:** cut supplied photos into separate layers (the spec's studio composite: backdrop, subject, softbox/lights, DSLR on tripod) without editing a single original pixel.

**Model.** An image element has an optional `mask` (`src/model/types.ts`): `shape` is `rect`, `ellipse` or `polygon`, with `points`, `feather` (document px) and `invert`. This is an additive field in schema v1: older projects load with `mask: null`, and invalid masks are dropped with a warning.

**Points are in normalised source-image coordinates, not frame coordinates.** A mask drawn around a person stays on that person when the photo is re-cropped, panned in crop mode, resized from an edge, rotated or scaled. All conversions live in `src/model/mask.ts` (`sourceToLocal` / `localToSource` through the frame's draw plan) and are unit-tested.

**One shape per layer.** To split a photo, duplicate it in place and give each copy its own mask. Every copy points at the same stored original. A polygon with a hole is expressed as a single keyhole polygon (the sample's backdrop has its subject cut out this way), so the format stays one simple ring.

**Rendering.** Masks go through the same offscreen pass as corner radius and fades: draw the image, then apply `destination-in` with the shape filled on a separate canvas, blurred by `ctx.filter` for feather (hard edge where the browser has no canvas filter). Export uses the same renderer, so masks export exactly as shown.

**Interaction.** A mask-edit mode on the canvas: rectangle and ellipse start as a centred shape with corner handles; polygon is click-to-place (close on the first point, double-click or Enter); lasso is freehand, simplified with Ramer–Douglas–Peucker to about 1.5 screen px. Vertex drag, midpoint insert and Alt+click delete edit polygons, and dragging inside moves the whole mask. Hit-testing respects masks, so stacked cut-outs of one photo stay individually clickable. "Fit frame to mask" shrinks the frame to the cut-out's bounds without moving the image on the canvas.

**Integrity.** Masks are allowed on Protected assets; the spec lists masking among the permitted non-destructive operations.

**Not included:** multiple shapes per mask, Bézier curves, brush/eraser painting, and automatic subject selection. Automatic selection is AI background removal, planned for Phase 3 with approval.
