// Snapshot undo/redo. Documents are immutable with structural sharing, so a
// snapshot is just a reference. Rapid edits with the same merge key (typing in
// a field, nudging with arrow keys) collapse into one undo step.

export interface History<T> {
  past: T[];
  future: T[];
  mergeKey: string | null;
  mergeAt: number;
}

export const HISTORY_LIMIT = 200;
export const MERGE_WINDOW_MS = 1200;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], mergeKey: null, mergeAt: 0 };
}

/** Record that the document is about to change from `previous`. */
export function record<T>(h: History<T>, previous: T, mergeKey: string | null = null, now = Date.now()): History<T> {
  if (mergeKey && mergeKey === h.mergeKey && now - h.mergeAt < MERGE_WINDOW_MS) {
    return { ...h, future: [], mergeAt: now };
  }
  const past = [...h.past, previous];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [], mergeKey, mergeAt: now };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null;
  const value = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future], mergeKey: null, mergeAt: 0 }, value };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null;
  const [value, ...future] = h.future;
  return { history: { past: [...h.past, current], future, mergeKey: null, mergeAt: 0 }, value };
}
