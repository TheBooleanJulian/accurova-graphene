// Local persistence in IndexedDB. Nothing leaves the browser.
//
//   projects  { id, name, updatedAt, width, height, elementCount, assetCount }   list metadata
//   docs      { id, doc }                                                        full project JSON
//   thumbs    { id, dataUrl }                                                    list thumbnails
//   blobs     { hash, blob }                                                     original asset bytes, keyed by SHA-256
//
// Original files are stored exactly as uploaded and never rewritten; several
// projects (e.g. a duplicate) share the same blob.
import type { GrapheneDocument } from "../model/types.ts";
import { walk } from "../model/tree.ts";

const DB_NAME = "accurova-graphene";
const DB_VERSION = 1;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  width: number;
  height: number;
  elementCount: number;
  assetCount: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("thumbs")) db.createObjectStore("thumbs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "hash" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Could not open local storage."));
      req.onblocked = () => reject(new Error("Local storage is blocked by another Graphene tab. Close other tabs and reload."));
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Storage transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted (storage may be full)."));
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function metaOf(doc: GrapheneDocument): ProjectMeta {
  let elementCount = 0;
  walk(doc.elements, () => {
    elementCount++;
  });
  return {
    id: doc.project.id,
    name: doc.project.name,
    updatedAt: doc.project.updatedAt,
    width: doc.project.width,
    height: doc.project.height,
    elementCount,
    assetCount: doc.assets.length,
  };
}

export async function saveDoc(doc: GrapheneDocument): Promise<void> {
  const db = await open();
  const tx = db.transaction(["projects", "docs"], "readwrite");
  tx.objectStore("projects").put(metaOf(doc));
  tx.objectStore("docs").put({ id: doc.project.id, doc });
  await done(tx);
}

export async function loadDoc(id: string): Promise<unknown | null> {
  const db = await open();
  const row = await req(db.transaction("docs").objectStore("docs").get(id));
  return (row as { doc?: unknown } | undefined)?.doc ?? null;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await open();
  const rows = (await req(db.transaction("projects").objectStore("projects").getAll())) as ProjectMeta[];
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(["projects", "docs", "thumbs"], "readwrite");
  tx.objectStore("projects").delete(id);
  tx.objectStore("docs").delete(id);
  tx.objectStore("thumbs").delete(id);
  await done(tx);
  await collectGarbage();
}

export async function saveThumb(id: string, dataUrl: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("thumbs", "readwrite");
  tx.objectStore("thumbs").put({ id, dataUrl });
  await done(tx);
}

export async function getThumbs(): Promise<Map<string, string>> {
  const db = await open();
  const rows = (await req(db.transaction("thumbs").objectStore("thumbs").getAll())) as { id: string; dataUrl: string }[];
  return new Map(rows.map((r) => [r.id, r.dataUrl]));
}

export async function putBlob(hash: string, blob: Blob): Promise<void> {
  const db = await open();
  const store = db.transaction("blobs", "readwrite").objectStore("blobs");
  const existing = await req(store.getKey(hash));
  if (existing !== undefined) return; // originals are immutable: never overwrite
  const tx = db.transaction("blobs", "readwrite");
  tx.objectStore("blobs").put({ hash, blob });
  await done(tx);
}

export async function getBlob(hash: string): Promise<Blob | null> {
  const db = await open();
  const row = (await req(db.transaction("blobs").objectStore("blobs").get(hash))) as { blob: Blob } | undefined;
  return row?.blob ?? null;
}

/** Delete stored originals that no saved project references any more. */
export async function collectGarbage(): Promise<number> {
  const db = await open();
  const docs = (await req(db.transaction("docs").objectStore("docs").getAll())) as { doc: GrapheneDocument }[];
  const used = new Set(docs.flatMap((d) => (d.doc.assets ?? []).map((a) => a.hash)));
  const keys = (await req(db.transaction("blobs").objectStore("blobs").getAllKeys())) as string[];
  const unused = keys.filter((k) => !used.has(k));
  if (unused.length) {
    const tx = db.transaction("blobs", "readwrite");
    for (const k of unused) tx.objectStore("blobs").delete(k);
    await done(tx);
  }
  return unused.length;
}

/** Ask the browser not to evict local data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
