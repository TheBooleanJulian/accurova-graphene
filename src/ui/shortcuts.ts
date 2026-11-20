// Global keyboard shortcuts. Ignored while typing in a field (except Escape).
import { findById } from "../model/tree.ts";
import {
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  importFiles,
  nudgeSelection,
  pasteClipboard,
  placeAsset,
  reorderSelection,
  select,
  selectAll,
  setFlag,
  ungroupSelection,
} from "../store/actions.ts";
import { fitToScreen, flushSave, getState, redo, setState, toast, undo, zoomAt, zoomStep } from "../store/editor.ts";
import { isTyping } from "./canvas/Stage.tsx";

export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const s = getState();
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;

    if (key === "Escape") {
      if (s.contextMenu) return setState({ contextMenu: null });
      if (s.dialog) return; // the dialog handles its own Escape
      if (s.preview) return setState({ preview: false });
      if (s.cropId) return setState({ cropId: null });
      if (s.editingTextId) return;
      if (s.enteredGroup) return setState({ enteredGroup: null, selection: [s.enteredGroup] });
      if (!isTyping(e.target)) select([]);
      return;
    }
    if (isTyping(e.target) || s.dialog || !s.doc) return;

    const lower = key.toLowerCase();
    if (mod && lower === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && lower === "y") {
      e.preventDefault();
      return redo();
    }
    if (mod && lower === "s") {
      e.preventDefault();
      void flushSave().then(() => toast("success", "Saved in this browser"));
      return;
    }
    if (mod && lower === "e") {
      e.preventDefault();
      return setState({ dialog: { type: "export" } });
    }
    if (mod && lower === "o") {
      e.preventDefault();
      return setState({ dialog: { type: "open" } });
    }
    if (mod && e.altKey && lower === "n") {
      e.preventDefault();
      return setState({ dialog: { type: "new" } });
    }
    if (mod && (key === "=" || key === "+")) {
      e.preventDefault();
      return zoomStep(1);
    }
    if (mod && key === "-") {
      e.preventDefault();
      return zoomStep(-1);
    }
    if (mod && key === "0") {
      e.preventDefault();
      return fitToScreen();
    }
    if (mod && key === "1") {
      e.preventDefault();
      return zoomAt(1);
    }
    if (s.preview) return;

    if (mod && lower === "a") {
      e.preventDefault();
      return selectAll();
    }
    if (mod && lower === "c") return copySelection();
    if (mod && lower === "x") return cutSelection();
    if (mod && lower === "d") {
      e.preventDefault();
      return duplicateSelection();
    }
    if (mod && lower === "g") {
      e.preventDefault();
      return e.shiftKey ? ungroupSelection() : groupSelection();
    }
    if (mod && e.shiftKey && lower === "l") {
      e.preventDefault();
      const els = s.selection.map((id) => findById(s.doc!.elements, id)).filter((x) => !!x);
      return setFlag(s.selection, "locked", !els.every((x) => x!.locked));
    }
    if (mod && e.shiftKey && lower === "h") {
      e.preventDefault();
      const els = s.selection.map((id) => findById(s.doc!.elements, id)).filter((x) => !!x);
      return setFlag(s.selection, "visible", !els.every((x) => x!.visible));
    }
    if (mod && (key === "]" || key === "}")) {
      e.preventDefault();
      return reorderSelection(e.shiftKey ? "front" : "forward");
    }
    if (mod && (key === "[" || key === "{")) {
      e.preventDefault();
      return reorderSelection(e.shiftKey ? "back" : "backward");
    }
    if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      return deleteSelection();
    }
    if (key.startsWith("Arrow") && s.selection.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
      const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
      return nudgeSelection(dx, dy);
    }
    if (key === "Enter" && s.selection.length === 1) {
      const el = findById(s.doc.elements, s.selection[0]);
      if (!el) return;
      e.preventDefault();
      if (el.type === "text") setState({ editingTextId: el.id });
      else if (el.type === "group") setState({ enteredGroup: el.id, selection: el.children.length ? [el.children[el.children.length - 1].id] : [] });
      else if (el.type === "image" && el.assetId) setState({ cropId: el.id });
      return;
    }
    if (key === "?") return setState({ dialog: { type: "shortcuts" } });
  };

  // Paste: images from the system clipboard become assets; otherwise paste copied layers.
  const onPaste = (e: ClipboardEvent) => {
    const s = getState();
    if (isTyping(e.target) || s.dialog || !s.doc || s.preview) return;
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      void importFiles(files.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}-${i}.png`, { type: f.type }))).then((assets) =>
        assets.forEach((a) => placeAsset(a)),
      );
      return;
    }
    if (pasteClipboard()) e.preventDefault();
  };

  window.addEventListener("keydown", onKey);
  window.addEventListener("paste", onPaste);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("paste", onPaste);
  };
}
