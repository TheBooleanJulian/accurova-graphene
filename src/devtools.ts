// Development-only hook used by the end-to-end tests (tests/e2e). It is not
// included in production builds (guarded by import.meta.env.DEV in main.tsx).
import { findById, walk } from "./model/tree.ts";
import type { Element } from "./model/types.ts";
import { getBlob } from "./persist/db.ts";
import { sha256Hex } from "./persist/assets.ts";
import { imageStatus } from "./render/imageCache.ts";
import { layoutText } from "./model/text.ts";
import { canvasMeasure } from "./render/measure.ts";
import { imageDrawPlan } from "./model/image.ts";
import { sourceToLocal } from "./model/mask.ts";
import { localToWorld } from "./model/geometry.ts";
import { commit, getState, setState } from "./store/editor.ts";

function byName(name: string): Element | null {
  const doc = getState().doc;
  if (!doc) return null;
  let found: Element | null = null;
  walk(doc.elements, (el) => {
    if (!found && el.name === name) found = el;
  });
  return found;
}

export function installDevtools(): void {
  (window as unknown as { __graphene: unknown }).__graphene = {
    getState,
    setState,
    commit,
    byName,
    findById: (id: string) => (getState().doc ? findById(getState().doc!.elements, id) : null),
    /** Document point → client (viewport) coordinates of the design canvas. */
    toClient(x: number, y: number) {
      const stage = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
      const v = getState().view;
      return { x: stage.left + v.panX + x * v.zoom, y: stage.top + v.panY + y * v.zoom };
    },
    /** Client coordinates of a point given in normalised source-image coordinates of an image layer. */
    clientOfSource(name: string, nx: number, ny: number) {
      const el = byName(name);
      const doc = getState().doc!;
      if (el?.type !== "image" || !el.assetId) return null;
      const a = doc.assets.find((x) => x.id === el.assetId)!;
      const w = localToWorld(el, sourceToLocal(el, a.width, a.height, { x: nx, y: ny }));
      const stage = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
      const v = getState().view;
      return { x: stage.left + v.panX + w.x * v.zoom, y: stage.top + v.panY + w.y * v.zoom };
    },
    /** Every asset placed on the canvas has its display proxy decoded. */
    imagesReady() {
      const doc = getState().doc;
      if (!doc) return false;
      const used = new Set<string>();
      walk(doc.elements, (el) => {
        if (el.type === "image" && el.assetId) used.add(el.assetId);
      });
      return doc.assets.filter((a) => used.has(a.id)).every((a) => imageStatus(a.hash) === "ready");
    },
    async storedHash(hash: string) {
      const blob = await getBlob(hash);
      return blob ? sha256Hex(await blob.arrayBuffer()) : null;
    },
    /** Every text layer whose words don't fit its box, and every cover image whose crop aspect differs from its frame. */
    integrityReport() {
      const doc = getState().doc!;
      const overflow: string[] = [];
      const stretched: string[] = [];
      walk(doc.elements, (el) => {
        if (el.type === "text" && layoutText(el, canvasMeasure).overflowX) overflow.push(el.name);
        if (el.type === "image" && el.assetId) {
          const a = doc.assets.find((x) => x.id === el.assetId)!;
          const p = imageDrawPlan(el, a.width, a.height);
          if (Math.abs(p.dw / p.sw - p.dh / p.sh) > 1e-6) stretched.push(el.name);
        }
      });
      return { overflow, stretched };
    },
  };
}
