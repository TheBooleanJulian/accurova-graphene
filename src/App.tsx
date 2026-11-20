import { useEffect, useRef } from "react";
import { requestPersistence } from "./persist/db.ts";
import { openProjectById } from "./store/actions.ts";
import { flushSave, hasUnsavedChanges, setState, useEditor } from "./store/editor.ts";
import { Stage } from "./ui/canvas/Stage.tsx";
import { ContextMenu, StatusBar, Toasts, Welcome } from "./ui/Chrome.tsx";
import { Dialogs } from "./ui/Dialogs.tsx";
import { Inspector } from "./ui/Inspector.tsx";
import { LayersPanel } from "./ui/LayersPanel.tsx";
import { LeftPanel, Rail } from "./ui/LeftPanel.tsx";
import { installShortcuts } from "./ui/shortcuts.ts";
import { TopBar } from "./ui/TopBar.tsx";
import { Icon } from "./ui/Icon.tsx";

export function App() {
  const hasDoc = useEditor((s) => s.doc !== null);
  const preview = useEditor((s) => s.preview);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void requestPersistence();
    const off = installShortcuts();
    let last: string | null = null;
    try {
      last = localStorage.getItem("graphene:last-project");
    } catch {
      // no storage access: start from the welcome screen
    }
    if (last) void openProjectById(last);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        void flushSave();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      off();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  // Drag the splitter between Properties and Layers.
  const startSplit = (e: React.PointerEvent) => {
    const col = rightRef.current;
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const h = Math.min(rect.height - 160, Math.max(120, rect.bottom - ev.clientY));
      col.style.setProperty("--layers-h", `${h}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  if (preview && hasDoc) {
    return (
      <div className="app app--preview">
        <Stage />
        <button className="btn preview-exit" data-testid="exit-preview" onClick={() => setState({ preview: false })}>
          <Icon name="x" /> Exit preview <span className="kbd">Esc</span>
        </button>
        <Toasts />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      {hasDoc ? (
        <div className="workspace">
          <Rail />
          <LeftPanel />
          <Stage />
          <div className="rightcol" ref={rightRef}>
            <Inspector />
            <div className="splitter" role="separator" aria-orientation="horizontal" aria-label="Resize layers panel" onPointerDown={startSplit} />
            <LayersPanel />
          </div>
        </div>
      ) : (
        <Welcome />
      )}
      <StatusBar />
      <ContextMenu />
      <Dialogs />
      <Toasts />
    </div>
  );
}
