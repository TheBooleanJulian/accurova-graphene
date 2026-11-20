// Make sure every font a document uses is loaded before it is measured or
// exported, so text never renders (or wraps) with a fallback face.
import { walk } from "../model/tree.ts";
import type { GrapheneDocument } from "../model/types.ts";
import { fontString } from "../model/text.ts";
import { clearMeasureCache } from "./measure.ts";

const loaded = new Set<string>();

function fontKeys(doc: GrapheneDocument): Map<string, string> {
  const keys = new Map<string, string>();
  walk(doc.elements, (el) => {
    if (el.type !== "text") return;
    const font = fontString({ ...el, fontSize: 40 });
    keys.set(font, (keys.get(font) ?? "") + el.text.slice(0, 200));
  });
  return keys;
}

/** True if this document needs fonts that have not been loaded yet. */
export function needsFonts(doc: GrapheneDocument): boolean {
  for (const k of fontKeys(doc).keys()) if (!loaded.has(k)) return true;
  return false;
}

/** Load any missing fonts. Resolves true if something new was loaded (caches were reset). */
export async function ensureFonts(doc: GrapheneDocument): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  const missing = [...fontKeys(doc)].filter(([k]) => !loaded.has(k));
  if (missing.length === 0) return false;
  await Promise.all(
    missing.map(async ([font, sample]) => {
      try {
        await document.fonts.load(font, sample || "AaBb");
      } catch {
        // A failed load falls back to the next font in the stack; nothing else to do.
      }
      loaded.add(font);
    }),
  );
  clearMeasureCache();
  return true;
}
