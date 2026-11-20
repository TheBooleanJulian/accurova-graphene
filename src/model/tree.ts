// Immutable helpers for the element tree. All functions return new arrays and
// share unchanged subtrees, so undo snapshots stay cheap.
import type { Element, GroupElement } from "./types.ts";

export interface Located {
  el: Element;
  parent: GroupElement | null;
  index: number;
  siblings: Element[];
  depth: number;
}

export function walk(
  elements: Element[],
  fn: (el: Element, parent: GroupElement | null, index: number, depth: number) => void | false,
  parent: GroupElement | null = null,
  depth = 0,
): void {
  elements.forEach((el, index) => {
    const descend = fn(el, parent, index, depth);
    if (descend !== false && el.type === "group") walk(el.children, fn, el, depth + 1);
  });
}

export function locate(elements: Element[], id: string): Located | null {
  let found: Located | null = null;
  const visit = (list: Element[], parent: GroupElement | null, depth: number): boolean => {
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el.id === id) {
        found = { el, parent, index: i, siblings: list, depth };
        return true;
      }
      if (el.type === "group" && visit(el.children, el, depth + 1)) return true;
    }
    return false;
  };
  visit(elements, null, 0);
  return found;
}

export function findById(elements: Element[], id: string): Element | null {
  return locate(elements, id)?.el ?? null;
}

/** Ancestors from the root down to (not including) the element. */
export function ancestorsOf(elements: Element[], id: string): GroupElement[] {
  const path: GroupElement[] = [];
  const visit = (list: Element[]): boolean => {
    for (const el of list) {
      if (el.id === id) return true;
      if (el.type === "group") {
        path.push(el);
        if (visit(el.children)) return true;
        path.pop();
      }
    }
    return false;
  };
  return visit(elements) ? path : [];
}

/** Map every element (depth-first, children before the parent is rebuilt). Returns the same array when nothing changed. */
export function mapTree(elements: Element[], fn: (el: Element) => Element): Element[] {
  let changed = false;
  const out = elements.map((el) => {
    let next = el;
    if (el.type === "group") {
      const children = mapTree(el.children, fn);
      if (children !== el.children) next = { ...el, children };
    }
    const mapped = fn(next);
    if (mapped !== el) changed = true;
    return mapped;
  });
  return changed ? out : elements;
}

export function updateById(elements: Element[], id: string, fn: (el: Element) => Element): Element[] {
  return mapTree(elements, (el) => (el.id === id ? fn(el) : el));
}

export function updateByIds(elements: Element[], ids: ReadonlySet<string>, fn: (el: Element) => Element): Element[] {
  return mapTree(elements, (el) => (ids.has(el.id) ? fn(el) : el));
}

/** Remove the given ids (anywhere in the tree). Empty groups left behind are removed too. */
export function removeIds(elements: Element[], ids: ReadonlySet<string>): Element[] {
  let changed = false;
  const out: Element[] = [];
  for (const el of elements) {
    if (ids.has(el.id)) {
      changed = true;
      continue;
    }
    if (el.type === "group") {
      const children = removeIds(el.children, ids);
      if (children !== el.children) {
        changed = true;
        if (children.length === 0) continue;
        out.push({ ...el, children });
        continue;
      }
    }
    out.push(el);
  }
  return changed ? out : elements;
}

/** Insert elements into a parent group (null = root) at an index (clamped; -1 or undefined = top). */
export function insertInto(elements: Element[], parentId: string | null, index: number | undefined, items: Element[]): Element[] {
  const place = (list: Element[]) => {
    const i = index === undefined || index < 0 || index > list.length ? list.length : index;
    return [...list.slice(0, i), ...items, ...list.slice(i)];
  };
  if (parentId === null) return place(elements);
  return updateById(elements, parentId, (el) => (el.type === "group" ? { ...el, children: place(el.children) } : el));
}

/** Leaf descendants of an element (the element itself if it is a leaf). */
export function leavesOf(el: Element): Element[] {
  if (el.type !== "group") return [el];
  return el.children.flatMap(leavesOf);
}

export function allIds(elements: Element[]): Set<string> {
  const ids = new Set<string>();
  walk(elements, (el) => {
    ids.add(el.id);
  });
  return ids;
}

/** Drop ids whose ancestor is also in the list, keeping document order (bottom to top). */
export function topmostSelection(elements: Element[], ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  const out: string[] = [];
  walk(elements, (el) => {
    if (wanted.has(el.id)) {
      out.push(el.id);
      return false; // descendants are covered by this ancestor
    }
  });
  return out;
}

export function isHiddenInTree(elements: Element[], id: string): boolean {
  const el = findById(elements, id);
  if (!el) return true;
  return !el.visible || ancestorsOf(elements, id).some((g) => !g.visible);
}

export function isLockedInTree(elements: Element[], id: string): boolean {
  const el = findById(elements, id);
  if (!el) return true;
  return el.locked || ancestorsOf(elements, id).some((g) => g.locked);
}

/** Product of the element's and its ancestors' opacity. */
export function effectiveOpacity(elements: Element[], id: string): number {
  const el = findById(elements, id);
  if (!el) return 0;
  return ancestorsOf(elements, id).reduce((a, g) => a * g.opacity, el.opacity);
}

export function countElements(elements: Element[]): number {
  let n = 0;
  walk(elements, () => {
    n++;
  });
  return n;
}
