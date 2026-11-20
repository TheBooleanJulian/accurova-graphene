// Native file chooser helpers. The input is attached to the page while open so
// automated tests can find it (#graphene-file-picker).
import { ACCEPT_ATTR } from "../persist/sniff.ts";
import { fillSlot, importFiles, placeAsset } from "../store/actions.ts";

export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    document.getElementById("graphene-file-picker")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "graphene-file-picker";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Choose an image and put it into an existing frame (keeping the frame). */
export async function pickFileForFrame(frameId: string): Promise<void> {
  const files = await pickFiles(ACCEPT_ATTR, false);
  if (!files.length) return;
  const [asset] = await importFiles(files);
  if (asset) placeAsset(asset, undefined, frameId);
}

export async function pickFileForSlot(slotId: string): Promise<void> {
  const files = await pickFiles(ACCEPT_ATTR, false);
  if (!files.length) return;
  const [asset] = await importFiles(files);
  if (asset) fillSlot(slotId, asset);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
