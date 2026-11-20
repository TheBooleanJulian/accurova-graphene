// Properties inspector. Every control writes through commit(), so each change is
// undoable and autosaved. Rapid changes to one field merge into one undo step.
import { FONT_FAMILIES, WEIGHT_NAMES, fontInfo, nearestWeight } from "../model/fonts.ts";
import { coverCrop, cropZoom, naturalHeightFor, setCropZoom, sourcePixelsPerUnit, FULL_CROP } from "../model/image.ts";
import { scaleElements, rotateElements, setProtectOriginals, translateElements, updateAsset, updateElement, applyResize, type AlignMode } from "../model/ops.ts";
import { layoutText } from "../model/text.ts";
import { findById, isLockedInTree, leavesOf } from "../model/tree.ts";
import { SIZE_PRESETS } from "../model/defaults.ts";
import type { AssetRecord, Element, GroupElement, IconElement, ImageElement, Integrity, Provenance, ShapeElement, ShapeKind, TextElement } from "../model/types.ts";
import { canvasMeasure } from "../render/measure.ts";
import { formatBytes } from "../persist/sniff.ts";
import {
  alignSelection,
  distributeSelection,
  groupSelection,
  reorderSelection,
  selectionBounds,
  setFlag,
  ungroupSelection,
} from "../store/actions.ts";
import { commit, setState, useEditor } from "../store/editor.ts";
import { ColorField, Field, FillField, NumberField, Section, Segmented, Toggle } from "./fields.tsx";
import { Icon } from "./Icon.tsx";
import { IntegrityBadge, ProvenanceBadge } from "./LeftPanel.tsx";
import { pickFileForFrame } from "./filePicker.ts";

const r1 = (v: number) => Math.round(v * 10) / 10;

function patch(id: string, p: Partial<Element> | ((el: Element) => Element), key: string): void {
  commit((d) => updateElement(d, id, p), { merge: `${id}:${key}` });
}

export function Inspector() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  useEditor((s) => s.renderTick); // re-measure warnings when fonts load
  if (!doc) return null;
  const selected = selection.map((id) => findById(doc.elements, id)).filter((e): e is Element => !!e);
  return (
    <section className="panel" aria-label="Properties">
      <div className="panel__head">
        <h2>{selected.length === 0 ? "Document" : selected.length === 1 ? "Properties" : `${selected.length} layers`}</h2>
        {selected.length === 1 && <span className="badge">{typeLabel(selected[0])}</span>}
      </div>
      <div className="panel__body" data-testid="inspector">
        {selected.length === 0 && <DocumentProps />}
        {selected.length === 1 && <ElementProps el={selected[0]} />}
        {selected.length > 1 && <MultiProps els={selected} />}
      </div>
    </section>
  );
}

function typeLabel(el: Element): string {
  if (el.type === "shape") return el.kind;
  return el.type;
}

// ---------------------------------------------------------------------------

function DocumentProps() {
  const doc = useEditor((s) => s.doc)!;
  const p = doc.project;
  const setProject = (patchP: Partial<typeof p>, key: string) => commit((d) => ({ ...d, project: { ...d.project, ...patchP } }), { merge: `project:${key}` });
  const preset = SIZE_PRESETS.find((s) => s.width === p.width && s.height === p.height);
  return (
    <>
      <Section title="Canvas">
        <div className="grid2">
          <NumberField label="W" unit="px" value={p.width} min={16} max={20000} decimals={0} testId="doc-width" onChange={(width) => setProject({ width }, "width")} />
          <NumberField label="H" unit="px" value={p.height} min={16} max={20000} decimals={0} testId="doc-height" onChange={(height) => setProject({ height }, "height")} />
        </div>
        <select
          className="select"
          value={preset ? `${preset.width}x${preset.height}` : ""}
          aria-label="Size preset"
          onChange={(e) => {
            const [w, h] = e.target.value.split("x").map(Number);
            if (w && h) setProject({ width: w, height: h }, "preset");
          }}
        >
          <option value="">Custom size</option>
          {SIZE_PRESETS.map((s) => (
            <option key={s.label} value={`${s.width}x${s.height}`}>
              {s.label} — {s.width} × {s.height}
            </option>
          ))}
        </select>
        <p className="hint">Changing the size keeps every layer where it is; nothing is stretched.</p>
      </Section>
      <Section title="Background">
        <FillField value={p.background} onChange={(background) => setProject({ background }, "background")} palette={doc.palette} noneLabel="Transparent" />
      </Section>
      <Section title="Guides">
        <NumberField label="M" unit="px" value={p.margin} min={0} max={Math.min(p.width, p.height) / 2} decimals={0} title="Margin / safe area" onChange={(margin) => setProject({ margin }, "margin")} />
        <p className="hint">A margin shows a safe-area guide and adds snap lines.</p>
      </Section>
      <Section title="Asset protection">
        <Toggle
          label="Protect all original assets"
          checked={p.protectOriginals}
          onChange={(on) => commit((d) => setProtectOriginals(d, on))}
        />
        <p className="hint">Protected photographs and logos can be placed, scaled, rotated, cropped and masked, but their appearance is never altered.</p>
      </Section>
      {doc.slots.length > 0 && (
        <Section title="Template slots">
          <p className="hint">
            {doc.slots.filter((s) => slotFilled(doc, s.id)).length} of {doc.slots.length} slots have a file.
          </p>
          <button className="btn btn--block" onClick={() => setState({ dialog: { type: "slots" } })}>
            Map template slots
          </button>
        </Section>
      )}
    </>
  );
}

export function slotFilled(doc: { elements: Element[] }, slotId: string): boolean {
  let filled = false;
  const visit = (list: Element[]) => {
    for (const el of list) {
      if (el.type === "group") visit(el.children);
      else if (el.type === "image" && el.slotId === slotId && el.assetId) filled = true;
    }
  };
  visit(doc.elements);
  return filled;
}

// ---------------------------------------------------------------------------

function ElementProps({ el }: { el: Element }) {
  const doc = useEditor((s) => s.doc)!;
  const locked = isLockedInTree(doc.elements, el.id);
  const asset = el.type === "image" && el.assetId ? doc.assets.find((a) => a.id === el.assetId) ?? null : null;
  const isProtected = !!asset && asset.integrity === "protected";
  return (
    <>
      <Section title="Layer">
        <input className="input" value={el.name} aria-label="Layer name" data-testid="layer-name" onChange={(e) => patch(el.id, { name: e.target.value }, "name")} />
        <div className="row">
          <Toggle label="Visible" checked={el.visible} onChange={(v) => setFlag([el.id], "visible", v)} />
          <Toggle label="Locked" checked={el.locked} onChange={(v) => setFlag([el.id], "locked", v)} />
        </div>
        {locked && !el.locked && <p className="hint">A parent group is locked.</p>}
      </Section>
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, display: "contents" }}>
        <GeometrySection el={el} asset={asset} />
        <ArrangeSection />
        {el.type === "text" && <TextSection el={el} />}
        {el.type === "shape" && <ShapeSection el={el} />}
        {el.type === "image" && <ImageSection el={el} asset={asset} />}
        {el.type === "icon" && <IconSection el={el} />}
        {el.type === "group" && <GroupSection el={el} />}
        <Section title="Appearance">
          <label className="field">
            <span className="label">Opacity · {Math.round(el.opacity * 100)}%</span>
            <input
              type="range"
              className="range"
              min={0}
              max={100}
              value={isProtected ? 100 : Math.round(el.opacity * 100)}
              disabled={isProtected}
              aria-label="Opacity"
              onChange={(e) => patch(el.id, { opacity: Number(e.target.value) / 100 }, "opacity")}
            />
          </label>
          {isProtected && <p className="hint">Protected asset: shown at full opacity.</p>}
          {el.type !== "group" && <ShadowEditor el={el} />}
        </Section>
      </fieldset>
    </>
  );
}

function GeometrySection({ el, asset }: { el: Element; asset: AssetRecord | null }) {
  const setBox = (key: "x" | "y" | "width" | "height", v: number) => {
    if (key === "x" || key === "y") {
      const dx = key === "x" ? v - el.x : 0;
      const dy = key === "y" ? v - el.y : 0;
      commit((d) => translateElements(d, [el.id], dx, dy), { merge: `${el.id}:${key}` });
      return;
    }
    if (el.type === "group") {
      const s = key === "width" ? v / el.width : v / el.height;
      commit((d) => scaleElements(d, [el.id], s, { x: el.x, y: el.y }), { merge: `${el.id}:${key}` });
      return;
    }
    // Images and icons keep their aspect ratio; text height follows its content.
    const keep = el.type === "image" || el.type === "icon";
    const w = key === "width" ? v : keep ? (v * el.width) / el.height : el.width;
    const h = key === "height" ? v : keep ? (v * el.height) / el.width : el.height;
    const r = { x: el.x, y: el.y, width: Math.max(1, w), height: Math.max(1, h), localLeft: 0, localTop: 0 };
    commit((d) => updateElement(d, el.id, () => applyResize(el, r, keep ? "corner" : "side", asset)), { merge: `${el.id}:${key}` });
  };
  return (
    <Section title="Position and size">
      <div className="grid2">
        <NumberField label="X" value={r1(el.x)} testId="prop-x" onChange={(v) => setBox("x", v)} />
        <NumberField label="Y" value={r1(el.y)} testId="prop-y" onChange={(v) => setBox("y", v)} />
        <NumberField label="W" value={r1(el.width)} min={1} testId="prop-w" onChange={(v) => setBox("width", v)} />
        <NumberField label="H" value={r1(el.height)} min={1} testId="prop-h" disabled={el.type === "text"} title={el.type === "text" ? "Text height follows its content" : "Height"} onChange={(v) => setBox("height", v)} />
      </div>
      {el.type !== "group" && (
        <NumberField
          label="R"
          unit="°"
          value={r1(el.rotation)}
          min={-180}
          max={180}
          testId="prop-rotation"
          title="Rotation"
          onChange={(v) => commit((d) => rotateElements(d, [el.id], v - el.rotation, { x: el.x + el.width / 2, y: el.y + el.height / 2 }), { merge: `${el.id}:rotation` })}
        />
      )}
    </Section>
  );
}

const ALIGN_BUTTONS: { mode: AlignMode; icon: Parameters<typeof Icon>[0]["name"]; label: string }[] = [
  { mode: "left", icon: "align-start-vertical", label: "Align left" },
  { mode: "hcenter", icon: "align-center-vertical", label: "Align centre" },
  { mode: "right", icon: "align-end-vertical", label: "Align right" },
  { mode: "top", icon: "align-start-horizontal", label: "Align top" },
  { mode: "vcenter", icon: "align-center-horizontal", label: "Align middle" },
  { mode: "bottom", icon: "align-end-horizontal", label: "Align bottom" },
];

function ArrangeSection({ multi = false }: { multi?: boolean }) {
  return (
    <Section title={multi ? "Align to selection" : "Align to canvas"}>
      <div className="row" style={{ gap: 2, flexWrap: "wrap" }}>
        {ALIGN_BUTTONS.map((b) => (
          <button key={b.mode} className="icon-btn" title={b.label} aria-label={b.label} data-testid={`align-${b.mode}`} onClick={() => alignSelection(b.mode)}>
            <Icon name={b.icon} />
          </button>
        ))}
        {multi && (
          <>
            <button className="icon-btn" title="Distribute horizontally (3+ layers)" aria-label="Distribute horizontally" data-testid="distribute-x" onClick={() => distributeSelection("x")}>
              <Icon name="align-horizontal-distribute-center" />
            </button>
            <button className="icon-btn" title="Distribute vertically (3+ layers)" aria-label="Distribute vertically" data-testid="distribute-y" onClick={() => distributeSelection("y")}>
              <Icon name="align-vertical-distribute-center" />
            </button>
          </>
        )}
      </div>
      <div className="row" style={{ gap: 2 }}>
        <button className="icon-btn" title="Bring to front (Ctrl+Shift+])" aria-label="Bring to front" onClick={() => reorderSelection("front")}>
          <Icon name="bring-to-front" />
        </button>
        <button className="icon-btn" title="Bring forward (Ctrl+])" aria-label="Bring forward" data-testid="order-forward" onClick={() => reorderSelection("forward")}>
          <Icon name="arrow-up" />
        </button>
        <button className="icon-btn" title="Send backward (Ctrl+[)" aria-label="Send backward" data-testid="order-backward" onClick={() => reorderSelection("backward")}>
          <Icon name="arrow-down" />
        </button>
        <button className="icon-btn" title="Send to back (Ctrl+Shift+[)" aria-label="Send to back" onClick={() => reorderSelection("back")}>
          <Icon name="send-to-back" />
        </button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function TextSection({ el }: { el: TextElement }) {
  const doc = useEditor((s) => s.doc)!;
  const info = fontInfo(el.fontFamily);
  const layout = layoutText(el, canvasMeasure);
  const set = (p: Partial<TextElement>, key: string) => patch(el.id, p, key);
  return (
    <Section title="Text">
      <textarea className="textarea" value={el.text} aria-label="Text content" data-testid="text-content" onChange={(e) => set({ text: e.target.value }, "text")} />
      <div className="grid2">
        <select
          className="select"
          value={el.fontFamily}
          aria-label="Font family"
          data-testid="font-family"
          onChange={(e) => set({ fontFamily: e.target.value, fontWeight: nearestWeight(e.target.value, el.fontWeight), italic: fontInfo(e.target.value)?.italic ? el.italic : false }, "font")}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.family} value={f.family}>
              {f.family}
              {f.source === "system" ? " (system)" : ""}
            </option>
          ))}
        </select>
        <select className="select" value={el.fontWeight} aria-label="Font weight" data-testid="font-weight" onChange={(e) => set({ fontWeight: Number(e.target.value) }, "weight")}>
          {(info?.weights ?? [400, 700]).map((w) => (
            <option key={w} value={w}>
              {WEIGHT_NAMES[w] ?? w}
            </option>
          ))}
        </select>
      </div>
      <div className="grid2">
        <NumberField label="Sz" unit="px" value={el.fontSize} min={1} max={2000} testId="font-size" title="Font size" onChange={(fontSize) => set({ fontSize }, "size")} />
        <Segmented
          ariaLabel="Style"
          value={el.italic ? "i" : "n"}
          onChange={(v) => set({ italic: v === "i" }, "italic")}
          options={[
            { value: "n", label: "Aa", title: "Upright" },
            { value: "i", label: <em>Aa</em>, title: info?.italic === false ? "This font has no italic" : "Italic" },
          ]}
          disabled={info?.italic === false && !el.italic}
        />
      </div>
      <ColorField value={el.fill} label="Text" palette={doc.palette} onChange={(fill) => set({ fill }, "fill")} />
      <div className="row row--between">
        <Segmented
          ariaLabel="Alignment"
          value={el.align}
          onChange={(align) => set({ align }, "align")}
          options={[
            { value: "left", label: "L", title: "Align left" },
            { value: "center", label: "C", title: "Centre" },
            { value: "right", label: "R", title: "Align right" },
          ]}
        />
        <Toggle label="Caps" checked={el.uppercase} onChange={(uppercase) => set({ uppercase }, "caps")} />
      </div>
      <div className="grid3">
        <NumberField label="LH" value={el.lineHeight} step={0.05} min={0.5} max={5} decimals={2} title="Line height (× size)" onChange={(lineHeight) => set({ lineHeight }, "lh")} />
        <NumberField label="LS" value={el.letterSpacing} step={0.5} title="Letter spacing (px)" onChange={(letterSpacing) => set({ letterSpacing }, "ls")} />
        <NumberField label="PS" value={el.paragraphSpacing} min={0} title="Paragraph spacing (px)" onChange={(paragraphSpacing) => set({ paragraphSpacing }, "ps")} />
      </div>
      <Toggle label="Outline" checked={!!el.stroke} onChange={(on) => set({ stroke: on ? { color: "#071D43", width: 2 } : null }, "stroke")} />
      {el.stroke && (
        <div className="col">
          <ColorField value={el.stroke.color} label="Outline" palette={doc.palette} onChange={(color) => set({ stroke: { ...el.stroke!, color } }, "stroke-color")} />
          <NumberField label="W" unit="px" value={el.stroke.width} min={0} max={100} onChange={(width) => set({ stroke: { ...el.stroke!, width } }, "stroke-width")} />
        </div>
      )}
      {layout.overflowX && (
        <div className="alert alert--warning" data-testid="overflow-warning">
          <span className="alert__icon">!</span>
          <div>
            <div className="alert__title">Text overflows</div>
            <div className="alert__body">A word is wider than the text box. Widen the box or reduce the size.</div>
          </div>
        </div>
      )}
      {info?.source === "system" && <p className="hint">{el.fontFamily} is a system font: exports use this computer's copy.</p>}
    </Section>
  );
}

// ---------------------------------------------------------------------------

const KIND_OPTIONS: { value: ShapeKind; label: string }[] = [
  { value: "rect", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "polygon", label: "Polygon" },
  { value: "star", label: "Star" },
  { value: "ribbon", label: "Ribbon" },
  { value: "callout", label: "Callout" },
  { value: "line", label: "Line" },
  { value: "arrow", label: "Arrow" },
];

function ShapeSection({ el }: { el: ShapeElement }) {
  const doc = useEditor((s) => s.doc)!;
  const set = (p: Partial<ShapeElement>, key: string) => patch(el.id, p, key);
  const isLine = el.kind === "line" || el.kind === "arrow";
  return (
    <Section title="Shape">
      <select className="select" value={el.kind} aria-label="Shape type" onChange={(e) => set({ kind: e.target.value as ShapeKind, stroke: (e.target.value === "line" || e.target.value === "arrow") && !el.stroke ? { color: "#071D43", width: 4 } : el.stroke }, "kind")}>
        {KIND_OPTIONS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      {!isLine && (
        <Field label="Fill">
          <FillField value={el.fill} palette={doc.palette} onChange={(fill) => set({ fill }, "fill")} />
        </Field>
      )}
      <Toggle label={isLine ? "Stroke" : "Border"} checked={!!el.stroke} onChange={(on) => set({ stroke: on ? { color: "#071D43", width: isLine ? 4 : 2 } : null }, "stroke")} />
      {el.stroke && (
        <div className="col">
          <ColorField value={el.stroke.color} label="Stroke" palette={doc.palette} onChange={(color) => set({ stroke: { ...el.stroke!, color } }, "stroke-color")} />
          <NumberField label="W" unit="px" value={el.stroke.width} min={0} max={500} onChange={(width) => set({ stroke: { ...el.stroke!, width } }, "stroke-width")} />
        </div>
      )}
      {(el.kind === "rect" || el.kind === "ribbon" || el.kind === "polygon" || el.kind === "star" || el.kind === "callout") && (
        <NumberField label="Rad" unit="px" value={el.cornerRadius} min={0} max={10000} title="Corner radius" onChange={(cornerRadius) => set({ cornerRadius }, "radius")} />
      )}
      {(el.kind === "polygon" || el.kind === "star") && (
        <div className="grid2">
          <NumberField label="N" value={el.sides} min={3} max={64} decimals={0} title={el.kind === "star" ? "Points" : "Sides"} onChange={(sides) => set({ sides: Math.round(sides) }, "sides")} />
          {el.kind === "star" && <NumberField label="In" value={el.innerRatio} step={0.05} min={0.05} max={0.95} decimals={2} title="Inner radius" onChange={(innerRatio) => set({ innerRatio }, "inner")} />}
        </div>
      )}
      {el.kind === "ribbon" && (
        <div className="grid2">
          <NumberField label="SL" unit="px" value={el.slantLeft} title="Left edge slant" onChange={(slantLeft) => set({ slantLeft }, "slantL")} />
          <NumberField label="SR" unit="px" value={el.slantRight} title="Right edge slant" onChange={(slantRight) => set({ slantRight }, "slantR")} />
        </div>
      )}
      {el.kind === "callout" && (
        <div className="grid2">
          <NumberField label="TP" unit="%" value={Math.round(el.tailPosition * 100)} min={0} max={100} decimals={0} title="Tail position" onChange={(v) => set({ tailPosition: v / 100 }, "tailPos")} />
          <NumberField label="TS" unit="px" value={el.tailSize} min={0} title="Tail size" onChange={(tailSize) => set({ tailSize }, "tailSize")} />
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

const INTEGRITY_OPTIONS: { value: Integrity; label: string }[] = [
  { value: "protected", label: "Protected — placement, scale, crop only" },
  { value: "editable", label: "Editable — non-destructive adjustments" },
  { value: "ai-editable", label: "AI-editable — AI changes need approval" },
  { value: "generated", label: "Generated — created by an AI workflow" },
];
const PROVENANCE_OPTIONS: { value: Provenance; label: string }[] = [
  { value: "original", label: "Original (authentic source)" },
  { value: "unknown", label: "Unverified" },
  { value: "ai-generated", label: "AI-generated" },
];

function ImageSection({ el, asset }: { el: ImageElement; asset: AssetRecord | null }) {
  const doc = useEditor((s) => s.doc)!;
  const cropId = useEditor((s) => s.cropId);
  const set = (p: Partial<ImageElement>, key: string) => patch(el.id, p, key);
  const slot = el.slotId ? doc.slots.find((s) => s.id === el.slotId) : null;
  if (!asset) {
    return (
      <Section title="Image">
        <div className="alert alert--info">
          <span className="alert__icon">i</span>
          <div>
            <div className="alert__title">{el.assetId ? "Asset missing" : "Empty frame"}</div>
            <div className="alert__body">{slot ? `${slot.label}: ${slot.description}` : el.placeholder || "Choose an image to fill this frame."}</div>
          </div>
        </div>
        <button className="btn btn--primary btn--block" data-testid="fill-frame" onClick={() => void pickFileForFrame(el.id)}>
          Choose image…
        </button>
        <p className="hint">Or drag an upload onto the frame. The frame keeps its size and position.</p>
        <NumberField label="Rad" unit="px" value={el.cornerRadius} min={0} title="Corner radius" onChange={(cornerRadius) => set({ cornerRadius }, "radius")} />
      </Section>
    );
  }
  const isProtected = asset.integrity === "protected";
  const spp = sourcePixelsPerUnit(el, asset.width, asset.height);
  const zoom = el.fit === "cover" ? cropZoom(el, asset.width, asset.height) : 1;
  const lockedIntegrity = doc.project.protectOriginals && asset.integrity !== "generated";
  return (
    <>
      <Section title="Image source">
        <div className="col" style={{ gap: 4 }}>
          <span style={{ fontWeight: 600, wordBreak: "break-all" }} data-testid="asset-name">
            {asset.name}
          </span>
          <span className="mono-sm faint">
            {asset.width} × {asset.height} px · {formatBytes(asset.bytes)} · {asset.mimeType.replace("image/", "").toUpperCase()}
          </span>
          <div className="row" style={{ gap: 4 }}>
            <ProvenanceBadge asset={asset} />
            <IntegrityBadge asset={asset} />
          </div>
          {asset.note && <p className="hint">{asset.note}</p>}
        </div>
        <Field label="Provenance">
          <select className="select" value={asset.provenance} onChange={(e) => commit((d) => updateAsset(d, asset.id, { provenance: e.target.value as Provenance, note: e.target.value === "original" ? undefined : asset.note }))}>
            {PROVENANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Integrity">
          <select className="select" value={asset.integrity} disabled={lockedIntegrity} data-testid="integrity" onChange={(e) => commit((d) => updateAsset(d, asset.id, { integrity: e.target.value as Integrity }))}>
            {INTEGRITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {lockedIntegrity && <p className="hint">“Protect all original assets” is on for this project (Document settings).</p>}
        <p className={`hint ${spp < 1 ? "" : ""}`} data-testid="resolution">
          Sharp up to <strong className="mono">{spp >= 10 ? "10+" : spp.toFixed(1)}×</strong> export.
          {spp < 1 && <span style={{ color: "var(--warning)" }}> ! Enlarged beyond native resolution at 1×.</span>}
        </p>
      </Section>
      <Section title="Frame and crop">
        <Segmented
          ariaLabel="Fit"
          value={el.fit}
          onChange={(fit) => set({ fit, crop: fit === "cover" ? coverCrop(asset.width, asset.height, el.width / el.height) : FULL_CROP }, "fit")}
          options={[
            { value: "cover", label: "Fill frame", title: "Fill the frame; the photo is cropped, never stretched" },
            { value: "contain", label: "Fit inside", title: "Show the whole photo inside the frame" },
          ]}
        />
        {el.fit === "cover" && (
          <>
            <label className="field">
              <span className="label">Crop zoom · {zoom.toFixed(2)}×</span>
              <input
                type="range"
                className="range"
                min={100}
                max={800}
                value={Math.round(zoom * 100)}
                aria-label="Crop zoom"
                data-testid="crop-zoom"
                onChange={(e) => set({ crop: setCropZoom(el, asset.width, asset.height, Number(e.target.value) / 100) }, "cropzoom")}
              />
            </label>
            <div className="row">
              <button className="btn btn--sm" aria-pressed={cropId === el.id} data-testid="crop-mode" onClick={() => setState({ cropId: cropId === el.id ? null : el.id })}>
                <Icon name="crop" /> {cropId === el.id ? "Done" : "Reposition"}
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => set({ crop: coverCrop(asset.width, asset.height, el.width / el.height) }, "cropreset")}>
                Reset crop
              </button>
            </div>
          </>
        )}
        <div className="row">
          <button
            className="btn btn--sm"
            title="Change the frame height so the whole crop shows with no further cropping"
            onClick={() => set({ height: naturalHeightFor(el, asset.width, asset.height) }, "fitframe")}
          >
            Fit frame to image
          </button>
          <button className="btn btn--sm" data-testid="replace-image" onClick={() => void pickFileForFrame(el.id)}>
            <Icon name="replace" /> Replace…
          </button>
        </div>
      </Section>
      <Section title="Mask">
        <NumberField label="Rad" unit="px" value={el.cornerRadius} min={0} title="Corner radius" onChange={(cornerRadius) => set({ cornerRadius }, "radius")} />
        <span className="label" style={{ fontSize: 10 }}>
          Soft edge fade
        </span>
        <div className="grid4">
          <NumberField label="L" value={el.fade.left} min={0} decimals={0} title="Fade left edge (px)" onChange={(v) => set({ fade: { ...el.fade, left: v } }, "fadeL")} />
          <NumberField label="R" value={el.fade.right} min={0} decimals={0} title="Fade right edge (px)" onChange={(v) => set({ fade: { ...el.fade, right: v } }, "fadeR")} />
          <NumberField label="T" value={el.fade.top} min={0} decimals={0} title="Fade top edge (px)" onChange={(v) => set({ fade: { ...el.fade, top: v } }, "fadeT")} />
          <NumberField label="B" value={el.fade.bottom} min={0} decimals={0} title="Fade bottom edge (px)" onChange={(v) => set({ fade: { ...el.fade, bottom: v } }, "fadeB")} />
        </div>
        <Toggle label="Border" checked={!!el.stroke} onChange={(on) => set({ stroke: on ? { color: "#FFFFFF", width: 6 } : null }, "stroke")} />
        {el.stroke && (
          <div className="col">
            <ColorField value={el.stroke.color} label="Border" palette={doc.palette} onChange={(color) => set({ stroke: { ...el.stroke!, color } }, "stroke-color")} />
            <NumberField label="W" unit="px" value={el.stroke.width} min={0} onChange={(width) => set({ stroke: { ...el.stroke!, width } }, "stroke-width")} />
          </div>
        )}
      </Section>
      <Section title="Adjustments">
        {isProtected ? (
          <p className="hint" data-testid="adjustments-locked">
            Protected asset: brightness, contrast and saturation can't be changed. Set integrity to Editable to adjust it.
          </p>
        ) : (
          (["brightness", "contrast", "saturation"] as const).map((k) => (
            <label key={k} className="field">
              <span className="label">
                {k} · {el.adjustments[k]}%
              </span>
              <input type="range" className="range" min={0} max={200} value={el.adjustments[k]} onChange={(e) => set({ adjustments: { ...el.adjustments, [k]: Number(e.target.value) } }, k)} />
            </label>
          ))
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

function IconSection({ el }: { el: IconElement }) {
  const doc = useEditor((s) => s.doc)!;
  return (
    <Section title="Icon">
      <ColorField value={el.color} label="Icon" palette={doc.palette} onChange={(color) => patch(el.id, { color }, "color")} />
      <NumberField label="SW" value={el.strokeWidth} step={0.25} min={0.25} max={6} decimals={2} title="Stroke weight" onChange={(strokeWidth) => patch(el.id, { strokeWidth }, "sw")} />
      <button className="btn btn--sm" onClick={() => setState({ leftTab: "icons" })}>
        Replace icon…
      </button>
    </Section>
  );
}

function GroupSection({ el }: { el: GroupElement }) {
  return (
    <Section title="Group">
      <p className="hint">
        {el.children.length} layers · {leavesOf(el).length} in total. Double-click the group on the canvas to edit inside it.
      </p>
      <div className="row">
        <button className="btn btn--sm" data-testid="ungroup" onClick={ungroupSelection}>
          <Icon name="ungroup" /> Ungroup
        </button>
        <button className="btn btn--sm btn--ghost" onClick={() => setState({ enteredGroup: el.id, selection: el.children.map((c) => c.id) })}>
          Select layers
        </button>
      </div>
    </Section>
  );
}

function ShadowEditor({ el }: { el: Exclude<Element, GroupElement> }) {
  const doc = useEditor((s) => s.doc)!;
  const sh = el.shadow;
  return (
    <>
      <Toggle label="Shadow" checked={!!sh} onChange={(on) => patch(el.id, { shadow: on ? { color: "#0000004D", blur: 16, offsetX: 0, offsetY: 6 } : null }, "shadow")} />
      {sh && (
        <div className="col">
          <ColorField value={sh.color} label="Shadow" palette={doc.palette} onChange={(color) => patch(el.id, { shadow: { ...sh, color } }, "shadow-color")} />
          <div className="grid3">
            <NumberField label="B" value={sh.blur} min={0} title="Blur" onChange={(blur) => patch(el.id, { shadow: { ...sh, blur } }, "shadow-blur")} />
            <NumberField label="X" value={sh.offsetX} title="Offset X" onChange={(offsetX) => patch(el.id, { shadow: { ...sh, offsetX } }, "shadow-x")} />
            <NumberField label="Y" value={sh.offsetY} title="Offset Y" onChange={(offsetY) => patch(el.id, { shadow: { ...sh, offsetY } }, "shadow-y")} />
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function MultiProps({ els }: { els: Element[] }) {
  const ids = els.map((e) => e.id);
  const b = selectionBounds(ids);
  const allLocked = els.every((e) => e.locked);
  const allHidden = els.every((e) => !e.visible);
  return (
    <>
      <Section title="Selection">
        <p className="hint">{els.map((e) => e.name).join(", ")}</p>
        {b && (
          <span className="mono-sm faint">
            {Math.round(b.x)}, {Math.round(b.y)} · {Math.round(b.width)} × {Math.round(b.height)}
          </span>
        )}
        <div className="row">
          <button className="btn btn--sm" data-testid="group" onClick={groupSelection}>
            <Icon name="group" /> Group
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => setFlag(ids, "locked", !allLocked)}>
            <Icon name={allLocked ? "lock-open" : "lock"} /> {allLocked ? "Unlock" : "Lock"}
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => setFlag(ids, "visible", allHidden)}>
            <Icon name={allHidden ? "eye" : "eye-off"} /> {allHidden ? "Show" : "Hide"}
          </button>
        </div>
      </Section>
      <ArrangeSection multi />
      <p className="hint">Drag a corner handle to scale the selection together; images keep their proportions.</p>
    </>
  );
}
