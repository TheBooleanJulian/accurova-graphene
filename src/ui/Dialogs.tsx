import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SIZE_PRESETS } from "../model/defaults.ts";
import { elementsUsingAsset } from "../model/ops.ts";
import { deleteProject, getThumbs, listProjects, storageEstimate, type ProjectMeta } from "../persist/db.ts";
import { checkSize, exportFilename, exportImage, exportWarnings, outputSize, type ExportFormat } from "../export/export.ts";
import { formatBytes } from "../persist/sniff.ts";
import { fillSlot, newProject, openProjectById, select } from "../store/actions.ts";
import { flushSave, getState, setState, toast, useEditor } from "../store/editor.ts";
import { NumberField, Segmented, Toggle } from "./fields.tsx";
import { Icon } from "./Icon.tsx";
import { AssetThumb, ProvenanceBadge } from "./LeftPanel.tsx";
import { slotFilled } from "./Inspector.tsx";
import { downloadBlob, pickFileForSlot } from "./filePicker.ts";
import { importProjectFile } from "./TopBar.tsx";

function Modal({ title, children, footer, wide, onClose, testId }: { title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; onClose: () => void; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, button:not([data-close]), select")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog ${wide ? "dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="dialog__head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" data-close onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

const close = () => setState({ dialog: null });

export function Dialogs() {
  const dialog = useEditor((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.type) {
    case "new":
      return <NewDesignDialog />;
    case "open":
      return <OpenDialog />;
    case "export":
      return <ExportDialog />;
    case "slots":
      return <SlotsDialog />;
    case "shortcuts":
      return <ShortcutsDialog />;
    case "confirm":
      return (
        <Modal
          title={dialog.title}
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className={`btn ${dialog.danger ? "btn--danger" : "btn--primary"}`}
                onClick={() => {
                  close();
                  dialog.onConfirm();
                }}
              >
                {dialog.confirmLabel}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>{dialog.body}</p>
        </Modal>
      );
  }
}

// ---------------------------------------------------------------------------

function NewDesignDialog() {
  const [name, setName] = useState("Untitled design");
  const [w, setW] = useState(1647);
  const [h, setH] = useState(922);
  const groups = ["Banner", "Social", "Print"] as const;
  const create = () => {
    if (w < 16 || h < 16 || w > 20000 || h > 20000) return;
    newProject(name.trim() || "Untitled design", Math.round(w), Math.round(h));
  };
  return (
    <Modal
      title="New design"
      wide
      onClose={close}
      testId="new-dialog"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn--primary" data-testid="create-design" onClick={create}>
            Create {Math.round(w)} × {Math.round(h)}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
      </label>
      {groups.map((g) => (
        <div key={g} className="col">
          <span className="label">{g}</span>
          <div className="preset-list">
            {SIZE_PRESETS.filter((p) => p.group === g).map((p) => (
              <button
                key={p.label}
                className="preset"
                aria-pressed={p.width === w && p.height === h}
                onClick={() => {
                  setW(p.width);
                  setH(p.height);
                }}
              >
                <span>{p.label}</span>
                <span className="mono-sm faint">
                  {p.width} × {p.height}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="col">
        <span className="label">Custom size (px)</span>
        <div className="row" style={{ maxWidth: 320 }}>
          <NumberField label="W" value={w} min={16} max={20000} decimals={0} testId="new-width" onChange={setW} />
          <NumberField label="H" value={h} min={16} max={20000} decimals={0} testId="new-height" onChange={setH} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function ProjectList({ onOpened }: { onOpened?: () => void }) {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const current = useEditor((s) => s.doc?.project.id);
  const refresh = async () => {
    await flushSave();
    setProjects(await listProjects());
    setThumbs(await getThumbs());
  };
  useEffect(() => {
    void refresh();
  }, []);
  if (!projects) return <p className="hint">Loading projects…</p>;
  if (projects.length === 0) return <p className="hint">No saved projects in this browser yet.</p>;
  return (
    <div className="project-grid" data-testid="project-list">
      {projects.map((p) => (
        <div key={p.id} className="project-card" data-testid="project-card" data-project-name={p.name}>
          <button
            className="project-card__thumb"
            aria-label={`Open ${p.name}`}
            onClick={async () => {
              if (await openProjectById(p.id)) onOpened?.();
            }}
          >
            {thumbs.get(p.id) ? <img src={thumbs.get(p.id)} alt="" /> : <Icon name="file-image" size={28} />}
          </button>
          <div className="project-card__meta">
            <strong style={{ fontSize: 13 }}>{p.name}</strong>
            <span className="mono-sm faint">
              {p.width} × {p.height} · {p.elementCount} layers · {p.assetCount} assets
            </span>
            <span className="mono-sm faint">{new Date(p.updatedAt).toLocaleString()}</span>
          </div>
          <div className="project-card__actions">
            <button
              className="btn btn--sm"
              onClick={async () => {
                if (await openProjectById(p.id)) onOpened?.();
              }}
            >
              {current === p.id ? "Current" : "Open"}
            </button>
            <button
              className="btn btn--sm btn--danger"
              disabled={current === p.id}
              title={current === p.id ? "Open another project before deleting this one" : "Delete"}
              onClick={() =>
                setState({
                  dialog: {
                    type: "confirm",
                    title: "Delete project",
                    body: `Delete “${p.name}” from this browser? Original files used only by this project are removed too. This can't be undone; export a package first if you need a copy.`,
                    confirmLabel: "Delete",
                    danger: true,
                    onConfirm: () => {
                      void deleteProject(p.id).then(() => toast("success", `Deleted ${p.name}`));
                    },
                  },
                })
              }
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function OpenDialog() {
  const [usage, setUsage] = useState<string>("");
  useEffect(() => {
    void storageEstimate().then((e) => e && setUsage(`${formatBytes(e.usage)} used of ${formatBytes(e.quota)} available to this site`));
  }, []);
  return (
    <Modal
      title="Open project"
      wide
      onClose={close}
      testId="open-dialog"
      footer={
        <>
          <span className="mono-sm faint" style={{ marginRight: "auto" }}>
            {usage}
          </span>
          <button className="btn" onClick={() => void importProjectFile()}>
            <Icon name="upload" /> Import package…
          </button>
        </>
      }
    >
      <ProjectList onOpened={close} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function ExportDialog() {
  const doc = useEditor((s) => s.doc)!;
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(2);
  const [quality, setQuality] = useState(92);
  const [transparent, setTransparent] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob; width: number; height: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const size = outputSize(doc, scale);
  const sizeError = checkSize(doc, scale);
  const warnings = useMemo(() => exportWarnings(doc, scale), [doc, scale]);
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    setResult(null);
  }, [format, scale, quality, transparent]);

  const render = async () => {
    setError(null);
    setResult(null);
    try {
      const opts = { format, scale, quality: quality / 100, transparent };
      const r = await exportImage(doc, opts, setProgress);
      setResult({ url: URL.createObjectURL(r.blob), blob: r.blob, width: r.width, height: r.height, name: exportFilename(doc, opts) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal
      title="Export"
      wide
      onClose={close}
      testId="export-dialog"
      footer={
        <>
          <button className="btn" onClick={close}>
            Close
          </button>
          <button className="btn" data-testid="render-export" disabled={!!sizeError || !!progress} onClick={() => void render()}>
            {result ? "Render again" : "Render preview"}
          </button>
          <button className="btn btn--primary" data-testid="download-export" disabled={!result} onClick={() => result && downloadBlob(result.blob, result.name)}>
            <Icon name="download" /> Download {format.toUpperCase()}
          </button>
        </>
      }
    >
      <div className="grid2" style={{ gap: "var(--space-4)" }}>
        <div className="col">
          <span className="label">Format</span>
          <Segmented
            ariaLabel="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpeg", label: "JPEG" },
            ]}
          />
          <span className="label">Resolution</span>
          <Segmented
            ariaLabel="Scale"
            value={String(scale)}
            onChange={(v) => setScale(Number(v))}
            options={[1, 2, 3, 4].map((s) => ({ value: String(s), label: `${s}×` }))}
          />
          <NumberField label="×" value={scale} min={0.1} max={10} step={0.5} decimals={2} title="Custom scale" testId="export-scale" onChange={setScale} />
          <span className={`mono ${sizeError ? "" : "muted"}`} data-testid="export-size">
            {size.width} × {size.height} px · {((size.width * size.height) / 1e6).toFixed(1)} MP
          </span>
          {sizeError && <span style={{ color: "var(--danger)", fontSize: 12.5 }}>x {sizeError}</span>}
          {format === "jpeg" ? (
            <label className="field">
              <span className="label">Quality · {quality}</span>
              <input type="range" className="range" min={50} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
          ) : (
            <Toggle label="Transparent background" checked={transparent} onChange={setTransparent} />
          )}
          <p className="hint">Photos are decoded from the original files at the exact size they occupy in the export, not from the editing preview. The editor interface never appears in the file.</p>
        </div>
        <div className="col">
          <span className="label">Pre-flight checks</span>
          {warnings.length === 0 ? (
            <div className="alert alert--success">
              <span className="alert__icon">✓</span>
              <div>
                <div className="alert__title">No issues found</div>
                <div className="alert__body">Every image is sharp at this size, and nothing is empty or off-canvas.</div>
              </div>
            </div>
          ) : (
            <ul className="warn-list" data-testid="export-warnings">
              {warnings.map((w, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      if (w.elementId) {
                        select([w.elementId]);
                        close();
                      }
                    }}
                  >
                    <span style={{ color: "var(--warning)" }}>! </span>
                    {w.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="export-preview" data-testid="export-preview">
        {progress && (
          <span>
            <span className="live-dot" />
            {progress}…
          </span>
        )}
        {error && <span style={{ color: "var(--danger)" }}>x {error}</span>}
        {result && !progress && <img src={result.url} alt="Export preview" data-testid="export-image" data-width={result.width} data-height={result.height} />}
        {!result && !progress && !error && <span className="muted">Render a preview to check the final image before downloading.</span>}
      </div>
      {result && (
        <span className="mono-sm muted" data-testid="export-result">
          {result.name} · {result.width} × {result.height} px · {formatBytes(result.blob.size)}
        </span>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function SlotsDialog() {
  const doc = useEditor((s) => s.doc)!;
  const busy = useEditor((s) => s.busy);
  const assetForSlot = (slotId: string) => {
    let id: string | null = null;
    const visit = (list: typeof doc.elements) => {
      for (const el of list) {
        if (el.type === "group") visit(el.children);
        else if (el.type === "image" && el.slotId === slotId && el.assetId) id = el.assetId;
      }
    };
    visit(doc.elements);
    return id ? doc.assets.find((a) => a.id === id) ?? null : null;
  };
  const filled = doc.slots.filter((s) => slotFilled(doc, s.id)).length;
  return (
    <Modal
      title="Map template assets"
      wide
      onClose={close}
      testId="slots-dialog"
      footer={
        <>
          <span className="mono-sm muted" style={{ marginRight: "auto" }}>
            {filled} of {doc.slots.length} slots filled
          </span>
          <button className="btn btn--primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      <p className="hint" style={{ fontSize: 13 }}>
        Choose the real file for each slot. Graphene never guesses which photo is which and never generates a substitute. Frames keep the template's position and crop.
      </p>
      {busy && (
        <p className="hint">
          <span className="live-dot" />
          {busy}
        </p>
      )}
      {doc.slots.map((slot) => {
        const asset = assetForSlot(slot.id);
        return (
          <div key={slot.id} className="slot-row" data-testid="slot-row" data-slot={slot.id}>
            {asset ? <AssetThumb asset={asset} height={56} /> : <canvas aria-hidden="true" />}
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>{slot.label}</strong>
              <span className="hint">{slot.description}</span>
              {asset ? (
                <span className="row" style={{ gap: 6 }}>
                  <span className="mono-sm" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asset.name}
                  </span>
                  <ProvenanceBadge asset={asset} />
                </span>
              ) : (
                <span className="badge badge--warning">Not mapped</span>
              )}
            </div>
            <div className="col" style={{ gap: 4 }}>
              <button className="btn btn--sm" onClick={() => void pickFileForSlot(slot.id)}>
                {asset ? "Replace…" : "Choose file…"}
              </button>
              {doc.assets.length > 0 && (
                <select
                  className="select"
                  value=""
                  aria-label={`Use an uploaded asset for ${slot.label}`}
                  onChange={(e) => {
                    const a = getState().doc!.assets.find((x) => x.id === e.target.value);
                    if (a) fillSlot(slot.id, a);
                  }}
                >
                  <option value="">Use uploaded…</option>
                  {doc.assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {elementsUsingAsset(doc, a.id).length ? "" : " (unused)"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const SHORTCUTS: [string, string][] = [
  ["Undo / redo", "Ctrl+Z / Ctrl+Shift+Z"],
  ["Copy / cut / paste", "Ctrl+C / Ctrl+X / Ctrl+V"],
  ["Duplicate", "Ctrl+D (or Alt-drag)"],
  ["Delete", "Delete / Backspace"],
  ["Group / ungroup", "Ctrl+G / Ctrl+Shift+G"],
  ["Select all", "Ctrl+A"],
  ["Nudge 1 px / 10 px", "Arrows / Shift+Arrows"],
  ["Bring forward / to front", "Ctrl+] / Ctrl+Shift+]"],
  ["Send backward / to back", "Ctrl+[ / Ctrl+Shift+["],
  ["Lock / hide", "Ctrl+Shift+L / Ctrl+Shift+H"],
  ["Edit text, crop image, enter group", "Enter or double-click"],
  ["Exit / deselect", "Esc"],
  ["Zoom in / out / fit / 100%", "Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1"],
  ["Pan", "Space+drag, middle mouse, or scroll"],
  ["Zoom at pointer", "Ctrl+scroll"],
  ["Constrain move / keep proportions", "Shift while dragging"],
  ["Resize from centre", "Alt while resizing"],
  ["Bypass snapping / select inside groups", "Ctrl while dragging / clicking"],
  ["Save now / export", "Ctrl+S / Ctrl+E"],
];

function ShortcutsDialog() {
  return (
    <Modal title="Keyboard shortcuts" onClose={close}>
      <table className="shortcut-table">
        <tbody>
          {SHORTCUTS.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>
                <span className="kbd">{b}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
