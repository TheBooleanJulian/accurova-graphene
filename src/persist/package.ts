// Project packages: a portable .zip holding the project JSON and every original
// asset byte-for-byte, so a design can move between machines or be archived.
//
//   project.json        the document (plus a "package" map of asset files)
//   assets/<file>       original uploads, untouched
//   README.txt          what the package is
import { newId, nowIso } from "../model/defaults.ts";
import type { GrapheneDocument } from "../model/types.ts";
import { validateDocument } from "../model/validate.ts";
import { sha256Hex } from "./assets.ts";
import { getBlob, putBlob } from "./db.ts";
import { createZip, readZip, type ZipEntry } from "./zip.ts";

export const PACKAGE_EXTENSION = ".graphene.zip";

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "asset";
}

export async function buildPackage(doc: GrapheneDocument): Promise<{ blob: Blob; missing: string[] }> {
  const enc = new TextEncoder();
  const files: Record<string, string> = {};
  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  const used = new Set<string>();
  for (const asset of doc.assets) {
    const blob = await getBlob(asset.hash);
    if (!blob) {
      missing.push(asset.name);
      continue;
    }
    let path = `assets/${safeName(asset.name)}`;
    for (let i = 2; used.has(path); i++) path = `assets/${i}-${safeName(asset.name)}`;
    used.add(path);
    files[asset.id] = path;
    entries.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  const json = JSON.stringify({ ...doc, package: { format: "accurova-graphene-package", version: 1, assets: files } }, null, 2);
  const readme =
    `Accurova Graphene project package\n\n` +
    `Project: ${doc.project.name}\nSize: ${doc.project.width} x ${doc.project.height} px\nPackaged: ${nowIso()}\n\n` +
    `project.json holds the editable design. assets/ holds the original files exactly as uploaded;\n` +
    `each one's SHA-256 is recorded in project.json and checked on import.\n` +
    `Open in Graphene with Project > Import package.\n`;
  return {
    blob: new Blob([createZip([{ name: "project.json", data: enc.encode(json) }, { name: "README.txt", data: enc.encode(readme) }, ...entries]) as BlobPart], {
      type: "application/zip",
    }),
    missing,
  };
}

export interface ImportedPackage {
  doc: GrapheneDocument;
  warnings: string[];
}

/** Read a package, verify every asset against its recorded hash, store originals, and return the project as a NEW project. */
export async function importPackage(file: Blob): Promise<ImportedPackage> {
  const files = await readZip(new Uint8Array(await file.arrayBuffer()));
  const jsonBytes = files.get("project.json");
  if (!jsonBytes) throw new Error("This package has no project.json.");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    throw new Error("project.json in this package is not valid JSON.");
  }
  const result = validateDocument(raw);
  if (!result.ok || !result.doc) throw new Error(result.errors.join(" "));
  const warnings = [...result.warnings];
  const map = ((raw as { package?: { assets?: Record<string, string> } }).package?.assets ?? {}) as Record<string, string>;
  for (const asset of result.doc.assets) {
    const path = map[asset.id];
    const bytes = path ? files.get(path) : undefined;
    if (!bytes) {
      warnings.push(`${asset.name} is not in the package; its frames will show as missing.`);
      continue;
    }
    if ((await sha256Hex(bytes)) !== asset.hash) {
      warnings.push(`${asset.name} does not match its recorded checksum and was not imported (the file was modified).`);
      continue;
    }
    await putBlob(asset.hash, new Blob([bytes as BlobPart], { type: asset.mimeType }));
  }
  const t = nowIso();
  const doc: GrapheneDocument = { ...result.doc, project: { ...result.doc.project, id: newId("project"), createdAt: t, updatedAt: t } };
  return { doc, warnings };
}

export async function readProjectJson(file: Blob): Promise<ImportedPackage> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const result = validateDocument(raw);
  if (!result.ok || !result.doc) throw new Error(result.errors.join(" "));
  const t = nowIso();
  return { doc: { ...result.doc, project: { ...result.doc.project, id: newId("project"), createdAt: t, updatedAt: t } }, warnings: result.warnings };
}
