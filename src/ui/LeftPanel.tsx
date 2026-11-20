// Left rail and asset panel: templates, uploads, text, shapes, icons, background.
import { useEffect, useMemo, useRef, useState } from "react";
import { createIcon, createShape, createText, TEXT_PRESETS, type TextPreset } from "../model/defaults.ts";
import { elementsUsingAsset, removeAsset, updateElement } from "../model/ops.ts";
import { findById } from "../model/tree.ts";
import type { AssetRecord, Fill, ShapeKind } from "../model/types.ts";
import { ACCEPT_ATTR, formatBytes } from "../persist/sniff.ts";
import { imageError, imageStatus, resolveProxy, subscribeImages } from "../render/imageCache.ts";
import { ICON_CATEGORIES, loadIconCatalog, type IconDef, type UiIconName } from "../icons/catalog.ts";
import { addAndSelect, importFiles, openSample, placeAsset, sampleAssetsAvailable, viewCenter } from "../store/actions.ts";
import { commit, getState, setState, useEditor, type LeftTab } from "../store/editor.ts";
import { FillField } from "./fields.tsx";
import { Icon, PathIcon } from "./Icon.tsx";

const TABS: { id: LeftTab; label: string; icon: UiIconName }[] = [
  { id: "templates", label: "Templates", icon: "layout-template" },
  { id: "uploads", label: "Uploads", icon: "upload" },
  { id: "text", label: "Text", icon: "type" },
  { id: "shapes", label: "Shapes", icon: "shapes" },
  { id: "icons", label: "Icons", icon: "star" },
  { id: "background", label: "Backgr.", icon: "palette" },
];

export function Rail() {
  const tab = useEditor((s) => s.leftTab);
  return (
    <nav className="rail" aria-label="Tools">
      {TABS.map((t) => (
        <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} data-testid={`tab-${t.id}`} onClick={() => setState({ leftTab: t.id })} title={t.label}>
          <Icon name={t.icon} size={18} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function LeftPanel() {
  const tab = useEditor((s) => s.leftTab);
  const title = TABS.find((t) => t.id === tab)?.label ?? "";
  return (
    <aside className="panel left-panel" aria-label={title}>
      <div className="panel__head">
        <h2>{tab === "background" ? "Background" : title}</h2>
      </div>
      <div className="panel__body">
        {tab === "templates" && <TemplatesTab />}
        {tab === "uploads" && <UploadsTab />}
        {tab === "text" && <TextTab />}
        {tab === "shapes" && <ShapesTab />}
        {tab === "icons" && <IconsTab />}
        {tab === "background" && <BackgroundTab />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function TemplatesTab() {
  const [bundled, setBundled] = useState<boolean | null>(null);
  useEffect(() => {
    void sampleAssetsAvailable().then((m) => setBundled(!!m));
  }, []);
  return (
    <>
      <div className="template-card">
        <span className="badge badge--cyan">Reference sample</span>
        <h3>Accurova — BNI Crescendo portrait session</h3>
        <p className="hint">1647 × 922 banner rebuilt as independent layers: logo, studio and event photographs, four portrait cards, ribbons, offer, features and footer.</p>
        {bundled && (
          <button className="btn btn--primary btn--block" data-testid="open-sample-bundled" onClick={() => void openSample(true)}>
            Open with sample photos
          </button>
        )}
        <button className="btn btn--block" data-testid="open-sample-map" onClick={() => void openSample(false)}>
          Open and map my files
        </button>
        {bundled === false && <p className="hint">Sample photos are not installed locally. Run <code>npm run sample:prepare</code>, or map your own files.</p>}
      </div>
      <button className="btn btn--block" onClick={() => setState({ dialog: { type: "new" } })}>
        <Icon name="file-plus" /> Blank design
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------

function AssetThumb({ asset, height = 92 }: { asset: AssetRecord; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeImages(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = resolveProxy(asset);
    const w = c.clientWidth || 120;
    c.width = w * 2;
    c.height = height * 2;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!r) return;
    const s = Math.min(c.width / asset.width, c.height / asset.height);
    const dw = asset.width * s;
    const dh = asset.height * s;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(r.source, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  }, [asset, tick, height]);
  return <canvas ref={ref} style={{ height }} aria-hidden="true" />;
}

export function ProvenanceBadge({ asset }: { asset: AssetRecord }) {
  if (asset.provenance === "original") return <span className="badge badge--success" title="Authentic source file">Original</span>;
  if (asset.provenance === "ai-generated") return <span className="badge badge--magenta" title="Created by an AI workflow">AI-generated</span>;
  return <span className="badge badge--warning" title={asset.note ?? "Provenance not confirmed"}>Unverified</span>;
}

export function IntegrityBadge({ asset }: { asset: AssetRecord }) {
  const label = { protected: "Protected", editable: "Editable", "ai-editable": "AI-editable", generated: "Generated" }[asset.integrity];
  return <span className={`badge ${asset.integrity === "protected" ? "badge--cyan" : ""}`}>{label}</span>;
}

export { AssetThumb };

function UploadsTab() {
  const doc = useEditor((s) => s.doc);
  const busy = useEditor((s) => s.busy);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!doc) return null;
  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    await importFiles(files);
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        data-testid="upload-input"
        onChange={(e) => {
          void onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <div
        className={`dropzone ${over ? "dropzone--over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void onFiles([...e.dataTransfer.files]);
        }}
      >
        <Icon name="upload" size={20} />
        <strong>Upload images</strong>
        <span className="faint">PNG, JPEG, WebP or SVG · up to 60 MB each</span>
      </div>
      {busy && (
        <p className="hint">
          <span className="live-dot" />
          {busy}
        </p>
      )}
      <p className="hint">Originals are stored untouched in this browser and marked Protected. Click to add, or drag onto the canvas or into a frame.</p>
      <div className="asset-list" data-testid="asset-list">
        {doc.assets.map((a) => {
          const uses = elementsUsingAsset(doc, a.id).length;
          const status = imageStatus(a.hash);
          return (
            <div
              key={a.id}
              className="asset"
              role="button"
              tabIndex={0}
              draggable
              title={`${a.name}\n${a.width} × ${a.height} px · ${formatBytes(a.bytes)}${a.note ? `\n${a.note}` : ""}`}
              data-testid="asset"
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-graphene-asset", a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => placeAsset(a)}
              onKeyDown={(e) => e.key === "Enter" && placeAsset(a)}
            >
              <AssetThumb asset={a} />
              <div className="asset__meta">
                <span className="asset__name">{a.name}</span>
                <span className="mono-sm faint">
                  {a.width} × {a.height}
                  {uses ? ` · used ${uses}×` : ""}
                </span>
                {status === "error" && <span className="badge badge--danger" title={imageError(a.hash)}>Missing file</span>}
                <div className="asset__badges">
                  <ProvenanceBadge asset={a} />
                  <IntegrityBadge asset={a} />
                </div>
                {uses === 0 && (
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      commit((d) => removeAsset(d, a.id));
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {doc.assets.length === 0 && <p className="hint">No assets in this project yet.</p>}
    </>
  );
}

// ---------------------------------------------------------------------------

function TextTab() {
  const add = (preset: TextPreset) => {
    const c = viewCenter();
    const el = createText(preset, c.x, c.y);
    addAndSelect([el]);
  };
  const sizes: Record<TextPreset, number> = { headline: 26, subheading: 19, paragraph: 13, label: 11, caption: 12 };
  return (
    <>
      {(Object.keys(TEXT_PRESETS) as TextPreset[]).map((k) => {
        const p = TEXT_PRESETS[k];
        return (
          <button
            key={k}
            className="text-preset"
            data-testid={`add-text-${k}`}
            onClick={() => add(k)}
            style={{
              fontSize: sizes[k],
              fontWeight: p.props.fontWeight,
              fontStyle: p.props.italic ? "italic" : "normal",
              textTransform: p.props.uppercase ? "uppercase" : "none",
              letterSpacing: p.props.uppercase ? "0.12em" : undefined,
            }}
          >
            {p.label}
          </button>
        );
      })}
      <p className="hint">Text boxes grow with their content, so text is never clipped. Double-click text on the canvas to edit it.</p>
    </>
  );
}

// ---------------------------------------------------------------------------

const SHAPES: { label: string; kind: ShapeKind; props?: Record<string, unknown>; preview: React.ReactNode }[] = [
  { label: "Rectangle", kind: "rect", preview: <rect x="3" y="6" width="18" height="12" /> },
  { label: "Rounded", kind: "rect", props: { cornerRadius: 24 }, preview: <rect x="3" y="6" width="18" height="12" rx="4" /> },
  { label: "Ellipse", kind: "ellipse", preview: <ellipse cx="12" cy="12" rx="9" ry="7" /> },
  { label: "Triangle", kind: "polygon", props: { sides: 3 }, preview: <polygon points="12,4 21,20 3,20" /> },
  { label: "Hexagon", kind: "polygon", props: { sides: 6 }, preview: <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" /> },
  { label: "Star", kind: "star", preview: <polygon points="12,3 14.6,9.2 21,9.5 16,13.6 17.6,20 12,16.5 6.4,20 8,13.6 3,9.5 9.4,9.2" /> },
  { label: "Ribbon", kind: "ribbon", preview: <polygon points="6,7 22,7 18,17 2,17" /> },
  { label: "Footer strip", kind: "ribbon", props: { slantLeft: 0, slantRight: 28, fill: "#071D43", width: 620, height: 92, cornerRadius: 14 }, preview: <polygon points="2,7 22,7 18,17 2,17" /> },
  { label: "Callout", kind: "callout", preview: <path d="M4 5h16v10h-9l-4 4v-4H4z" /> },
  { label: "Line", kind: "line", preview: <line x1="3" y1="12" x2="21" y2="12" /> },
  { label: "Arrow", kind: "arrow", preview: <path d="M3 12h17M15 7l5 5-5 5" /> },
];

function ShapesTab() {
  return (
    <>
      <div className="tile-grid">
        {SHAPES.map((s) => (
          <button
            key={s.label}
            className="tile"
            data-testid={`add-shape-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => {
              const c = viewCenter();
              addAndSelect([createShape(s.kind, c.x, c.y, s.props as never)]);
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
              {s.preview}
            </svg>
            {s.label}
          </button>
        ))}
      </div>
      <p className="hint">Ribbons and callouts are reusable promotional shapes: adjust their slant, corners and tail in the inspector. Group a shape with its text to move them together.</p>
    </>
  );
}

// ---------------------------------------------------------------------------

function IconsTab() {
  const [catalog, setCatalog] = useState<IconDef[] | null>(null);
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState(true);
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  useEffect(() => {
    void loadIconCatalog().then(setCatalog);
  }, []);
  const selectedIcon = doc && selection.length === 1 ? findById(doc.elements, selection[0]) : null;
  const canReplace = selectedIcon?.type === "icon";
  const byName = useMemo(() => new Map((catalog ?? []).map((i) => [i.name, i])), [catalog]);
  const results = useMemo(() => {
    if (!catalog || !query.trim()) return null;
    const q = query.trim().toLowerCase();
    return catalog.filter((i) => i.name.includes(q) || i.tags.some((t) => t.includes(q))).slice(0, 150);
  }, [catalog, query]);

  const use = (icon: IconDef) => {
    if (canReplace && replace && selectedIcon) {
      commit((d) => updateElement(d, selectedIcon.id, { icon: icon.name, paths: icon.paths, name: icon.name.replace(/-/g, " ") }));
      return;
    }
    const c = viewCenter();
    addAndSelect([createIcon(icon.name, icon.paths, c.x, c.y)]);
  };
  const grid = (icons: IconDef[]) => (
    <div className="icon-grid">
      {icons.map((i) => (
        <button key={i.name} title={i.name} data-testid={`icon-${i.name}`} onClick={() => use(i)}>
          <PathIcon paths={i.paths} size={20} />
        </button>
      ))}
    </div>
  );
  return (
    <>
      <input className="input" type="search" placeholder="Search 2,000+ icons (camera, calendar…)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search icons" />
      {canReplace && (
        <label className="check">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Replace the selected icon
        </label>
      )}
      {!catalog && <p className="hint">Loading icons…</p>}
      {results && (results.length ? grid(results) : <p className="hint">No icons match “{query}”.</p>)}
      {catalog &&
        !results &&
        ICON_CATEGORIES.map((cat) => (
          <div key={cat.label} className="col">
            <span className="label">{cat.label}</span>
            {grid(cat.icons.map((n) => byName.get(n)).filter((x): x is IconDef => !!x))}
          </div>
        ))}
      <p className="hint">Outline icons from Lucide (ISC licence). Each one is an editable vector layer you can recolour.</p>
    </>
  );
}

// ---------------------------------------------------------------------------

function BackgroundTab() {
  const doc = useEditor((s) => s.doc);
  if (!doc) return null;
  const setBg = (bg: Fill | null) => commit((d) => ({ ...d, project: { ...d.project, background: bg } }), { merge: "background" });
  return (
    <>
      <span className="label">Page background</span>
      <FillField value={doc.project.background} onChange={setBg} palette={doc.palette} noneLabel="Transparent" />
      <p className="hint">Transparent backgrounds export as transparent PNG. To use a photograph as the background, add it and send it to the back, then lock it.</p>
      <BrandPalette />
    </>
  );
}

function BrandPalette() {
  const doc = useEditor((s) => s.doc);
  const [color, setColor] = useState("#071D43");
  if (!doc) return null;
  return (
    <div className="col">
      <span className="label">Brand palette</span>
      <div className="swatches">
        {doc.palette.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c, width: 26, height: 26 }}
            title={`${c} — click to remove`}
            onClick={() => commit((d) => ({ ...d, palette: d.palette.filter((x) => x !== c) }))}
          />
        ))}
      </div>
      <div className="row">
        <input type="color" className="swatch-input" value={color.slice(0, 7).toLowerCase()} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Palette colour" />
        <button
          className="btn btn--sm"
          onClick={() => {
            const c = color.toUpperCase();
            if (!getState().doc?.palette.includes(c)) commit((d) => ({ ...d, palette: [...d.palette, c] }));
          }}
        >
          Add to palette
        </button>
      </div>
      <p className="hint">Palette colours appear under every colour picker. Use the eyedropper in a colour field to sample a colour from an uploaded photo or logo.</p>
    </div>
  );
}
