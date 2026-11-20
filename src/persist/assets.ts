// Importing an uploaded file as an asset. The original bytes are hashed and
// stored untouched; only a display proxy is derived from them.
import { newId, nowIso } from "../model/defaults.ts";
import type { AssetRecord } from "../model/types.ts";
import { PROXY_MAX, primeProxy, proxyFromBitmap, loadSvgImage } from "../render/imageCache.ts";
import { putBlob } from "./db.ts";
import { sanitizeSvg } from "./svg.ts";
import { MAX_UPLOAD_BYTES, formatBytes, guessProvenance, sniffImageType } from "./sniff.ts";

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class AssetImportError extends Error {}

/** Validate, hash, store and register an uploaded image file. */
export async function importAssetFile(file: Blob, name: string): Promise<AssetRecord> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AssetImportError(`${name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)} per file.`);
  }
  if (file.size === 0) throw new AssetImportError(`${name} is empty.`);
  const buf = await file.arrayBuffer();
  const mime = sniffImageType(new Uint8Array(buf));
  if (!mime) throw new AssetImportError(`${name} is not a PNG, JPEG, WebP or SVG image.`);
  const hash = await sha256Hex(buf);
  const blob = new Blob([buf], { type: mime });

  let width: number;
  let height: number;
  if (mime === "image/svg+xml") {
    const size = sanitizeSvg(new TextDecoder().decode(buf));
    width = size.width;
    height = size.height;
    const img = await loadSvgImage(blob);
    primeProxy(hash, { source: img, originX: 0, originY: 0, scaleX: img.naturalWidth / width, scaleY: img.naturalHeight / height });
  } else {
    let full: ImageBitmap;
    try {
      full = await createImageBitmap(blob);
    } catch {
      throw new AssetImportError(`${name} could not be decoded. The file may be damaged.`);
    }
    width = full.width;
    height = full.height;
    const s = Math.min(1, PROXY_MAX / Math.max(width, height));
    if (s < 1) {
      const proxy = await createImageBitmap(full, { resizeWidth: Math.round(width * s), resizeHeight: Math.round(height * s), resizeQuality: "high" });
      full.close();
      primeProxy(hash, proxyFromBitmap(proxy, { width, height }));
    } else {
      primeProxy(hash, proxyFromBitmap(full, { width, height }));
    }
  }

  await putBlob(hash, blob);
  const { provenance, note } = guessProvenance(name);
  return {
    id: newId("asset"),
    name,
    mimeType: mime,
    bytes: file.size,
    width,
    height,
    hash,
    integrity: "protected",
    provenance,
    note,
    addedAt: nowIso(),
  };
}
