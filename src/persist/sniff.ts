// File-type detection from content (never trust the extension or browser MIME alone).

export const ACCEPT_ATTR = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export type SupportedMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

export function sniffImageType(bytes: Uint8Array): SupportedMime | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, Math.min(b.length, 2048))).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

const AI_HINTS = /(chatgpt|dall[-_ ]?e|midjourney|firefly|stable[-_ ]?diffusion|sdxl|gemini|imagen|ideogram|leonardo|ai[-_ ]generated|generated)/i;

/**
 * Initial provenance for an upload. Uploads are treated as authentic originals,
 * except when the filename suggests an AI tool produced or processed the file —
 * then the status is "unknown" and the user is asked to confirm.
 */
export function guessProvenance(filename: string): { provenance: "original" | "unknown"; note?: string } {
  if (AI_HINTS.test(filename)) {
    return {
      provenance: "unknown",
      note: "The filename suggests an AI tool created or processed this file. Confirm it is an authentic, unaltered original before using it as one.",
    };
  }
  return { provenance: "original" };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
