// Display proxies for assets. Editing draws a downscaled copy (long edge ≤ 2560 px)
// so a 45-megapixel photo doesn't have to be decoded at full size on every frame.
// Export never uses proxies: it decodes the original at the exact size it needs.
import type { AssetRecord } from "../model/types.ts";
import { getBlob } from "../persist/db.ts";
import { sanitizeSvg } from "../persist/svg.ts";
import type { ResolvedImage } from "./renderer.ts";

export const PROXY_MAX = 2560;

interface Entry {
  status: "loading" | "ready" | "error";
  resolved?: ResolvedImage;
  error?: string;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

export function subscribeImages(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function imagesVersion(): number {
  return version;
}
function notify() {
  version++;
  for (const fn of listeners) fn();
}

export function imageStatus(hash: string): Entry["status"] | "idle" {
  return entries.get(hash)?.status ?? "idle";
}
export function imageError(hash: string): string | undefined {
  return entries.get(hash)?.error;
}

/** The proxy for an asset, or null while it loads (a load is started on first request). */
export function resolveProxy(asset: AssetRecord): ResolvedImage | null {
  const e = entries.get(asset.hash);
  if (e?.status === "ready") return e.resolved!;
  if (!e) void load(asset);
  return null;
}

/** Register a proxy created during import, avoiding a second decode. */
export function primeProxy(hash: string, resolved: ResolvedImage): void {
  entries.set(hash, { status: "ready", resolved });
  notify();
}

async function load(asset: AssetRecord): Promise<void> {
  entries.set(asset.hash, { status: "loading" });
  try {
    const blob = await getBlob(asset.hash);
    if (!blob) throw new Error("The original file is not in this browser's storage. Re-upload it or import the project package.");
    entries.set(asset.hash, { status: "ready", resolved: await makeProxy(blob, asset) });
  } catch (err) {
    entries.set(asset.hash, { status: "error", error: err instanceof Error ? err.message : String(err) });
  }
  notify();
}

export async function loadSvgImage(blob: Blob): Promise<HTMLImageElement> {
  const { svg } = sanitizeSvg(await blob.text());
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export async function makeProxy(blob: Blob, asset: Pick<AssetRecord, "width" | "height" | "mimeType">): Promise<ResolvedImage> {
  if (asset.mimeType === "image/svg+xml") {
    const img = await loadSvgImage(blob);
    return { source: img, originX: 0, originY: 0, scaleX: img.naturalWidth / asset.width, scaleY: img.naturalHeight / asset.height };
  }
  const s = Math.min(1, PROXY_MAX / Math.max(asset.width, asset.height));
  const bmp =
    s < 1
      ? await createImageBitmap(blob, { resizeWidth: Math.round(asset.width * s), resizeHeight: Math.round(asset.height * s), resizeQuality: "high" })
      : await createImageBitmap(blob);
  return proxyFromBitmap(bmp, asset);
}

export function proxyFromBitmap(bmp: ImageBitmap, asset: Pick<AssetRecord, "width" | "height">): ResolvedImage {
  return { source: bmp, originX: 0, originY: 0, scaleX: bmp.width / asset.width, scaleY: bmp.height / asset.height };
}
