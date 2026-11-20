// Canvas hit-testing in document coordinates. Hidden and locked layers are
// click-through: locked layers are selected from the Layers panel instead.
import { aabbOf, boxesIntersect, hitsElement, type Box, type Point } from "../../model/geometry.ts";
import { ancestorsOf, findById, isHiddenInTree, isLockedInTree, walk } from "../../model/tree.ts";
import type { Element, GrapheneDocument } from "../../model/types.ts";

function hitIn(list: Element[], p: Point, tol: number, deep: boolean): string | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i];
    if (!el.visible || el.locked) continue;
    if (el.type === "group") {
      const child = hitIn(el.children, p, tol, deep);
      if (child) return deep ? child : el.id;
    } else if (hitsElement(el, p, tol)) return el.id;
  }
  return null;
}

export interface Hit {
  id: string | null;
  /** True when the hit is inside the group the user has entered. */
  insideEntered: boolean;
}

/** Topmost selectable element under p. Inside an entered group, its children are tested first. */
export function hitTest(doc: GrapheneDocument, p: Point, tol: number, enteredGroup: string | null, deep: boolean): Hit {
  if (enteredGroup) {
    const g = findById(doc.elements, enteredGroup);
    if (g?.type === "group" && !isHiddenInTree(doc.elements, g.id) && !isLockedInTree(doc.elements, g.id)) {
      const id = hitIn(g.children, p, tol, deep);
      if (id) return { id, insideEntered: true };
    }
  }
  return { id: hitIn(doc.elements, p, tol, deep), insideEntered: false };
}

/** Elements selectable by a marquee: the entered group's children, or top-level layers. */
export function marqueeHits(doc: GrapheneDocument, rect: Box, enteredGroup: string | null): string[] {
  const g = enteredGroup ? findById(doc.elements, enteredGroup) : null;
  const list = g?.type === "group" ? g.children : doc.elements;
  return list.filter((el) => el.visible && !el.locked && boxesIntersect(aabbOf(el), rect)).map((el) => el.id);
}

/** Bounds of every visible layer that is not moving, for snapping. */
export function snapCandidates(doc: GrapheneDocument, moving: string[]): Box[] {
  const movingSet = new Set(moving);
  const ancestors = new Set<string>();
  for (const id of moving) for (const a of ancestorsOf(doc.elements, id)) ancestors.add(a.id);
  const out: Box[] = [];
  walk(doc.elements, (el) => {
    if (movingSet.has(el.id) || !el.visible) return false; // skip moving layers and their descendants
    if (!ancestors.has(el.id)) out.push(aabbOf(el)); // an ancestor's bounds move with the selection
  });
  return out;
}
