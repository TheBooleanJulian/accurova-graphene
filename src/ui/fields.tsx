// Small form controls for the inspector and dialogs.
import { useEffect, useState, type ReactNode } from "react";
import { alphaOf, isHexColor, normalizeHex, opaqueHex, withAlpha } from "../model/color.ts";
import type { Fill, LinearGradient } from "../model/types.ts";
import { Icon } from "./Icon.tsx";

/** Numeric input that commits on every valid change and tolerates partial typing. */
export function NumberField(props: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  const { value, decimals = 1 } = props;
  const fmt = (v: number) => String(Number(v.toFixed(decimals)));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return;
    const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, n));
    if (clamped !== value) props.onChange(clamped);
  };
  return (
    <label className="num" title={props.title}>
      {props.label && <span>{props.label}</span>}
      <input
        className="input"
        inputMode="decimal"
        value={text}
        disabled={props.disabled}
        data-testid={props.testId}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(fmt(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const step = (props.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
            const next = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, value + step));
            props.onChange(Number(next.toFixed(4)));
          }
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={props.title ?? props.label}
      />
      {props.unit && <em>{props.unit}</em>}
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section__title">
        <span>{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ label, checked, onChange, disabled, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <label className="toggle" title={title}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="seg" role="group" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button key={o.value} type="button" aria-pressed={props.value === o.value} title={o.title} disabled={props.disabled} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

/** Hex colour with alpha, a native picker, an eyedropper (where supported) and palette swatches. */
export function ColorField({ value, onChange, palette = [], disabled, label }: { value: string; onChange: (v: string) => void; palette?: string[]; disabled?: boolean; label?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const alpha = alphaOf(value);
  const ED = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return (
    <div className="col" style={{ gap: 0 }}>
      <div className="color-row">
        <input
          type="color"
          className="swatch-input"
          value={opaqueHex(value).slice(0, 7).toLowerCase()}
          disabled={disabled}
          aria-label={label ? `${label} colour` : "Colour"}
          onChange={(e) => onChange(withAlpha(e.target.value, alpha))}
        />
        <input
          className="input input--mono"
          value={text}
          disabled={disabled}
          aria-label={label ? `${label} hex` : "Hex colour"}
          aria-invalid={!isHexColor(text)}
          onChange={(e) => {
            setText(e.target.value);
            if (isHexColor(e.target.value)) onChange(normalizeHex(e.target.value));
          }}
          onBlur={() => setText(value)}
        />
        <NumberField value={Math.round(alpha * 100)} unit="%" decimals={0} min={0} max={100} disabled={disabled} title="Opacity of this colour" onChange={(v) => onChange(withAlpha(value, v / 100))} />
        <button
          type="button"
          className="icon-btn"
          title={ED ? "Pick a colour from the screen" : "Eyedropper is not supported in this browser"}
          disabled={disabled || !ED}
          onClick={async () => {
            if (!ED) return;
            try {
              const r = await new ED().open();
              onChange(withAlpha(r.sRGBHex, alpha));
            } catch {
              // cancelled
            }
          }}
        >
          <Icon name="pipette" />
        </button>
      </div>
      {palette.length > 0 && (
        <div className="swatches">
          {palette.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} title={c} disabled={disabled} onClick={() => onChange(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_GRADIENT: LinearGradient = { type: "linear", angle: 180, stops: [{ offset: 0, color: "#D20A1C" }, { offset: 1, color: "#A50613" }] };

/** Solid / gradient / none editor for shape fills and the page background. */
export function FillField({ value, onChange, palette, allowNone = true, noneLabel = "None" }: { value: Fill | null; onChange: (v: Fill | null) => void; palette: string[]; allowNone?: boolean; noneLabel?: string }) {
  const mode = value === null ? "none" : typeof value === "string" ? "solid" : "gradient";
  const options = [
    { value: "solid" as const, label: "Solid" },
    { value: "gradient" as const, label: "Gradient" },
    ...(allowNone ? [{ value: "none" as const, label: noneLabel }] : []),
  ];
  return (
    <div className="col">
      <Segmented
        ariaLabel="Fill type"
        value={mode}
        options={options}
        onChange={(m) => {
          if (m === "none") onChange(null);
          else if (m === "solid") onChange(typeof value === "object" && value ? value.stops[0].color : "#071D43");
          else onChange(typeof value === "string" ? { ...DEFAULT_GRADIENT, stops: [{ offset: 0, color: value }, { offset: 1, color: value }] } : DEFAULT_GRADIENT);
        }}
      />
      {typeof value === "string" && <ColorField value={value} onChange={onChange} palette={palette} />}
      {value && typeof value === "object" && (
        <>
          <NumberField label="∠" unit="°" value={value.angle} decimals={0} title="Gradient angle (0 = to top, 90 = to right)" onChange={(angle) => onChange({ ...value, angle })} />
          {value.stops.map((s, i) => (
            <div key={i} className="col" style={{ gap: 2 }}>
              <span className="label" style={{ fontSize: 10 }}>
                Stop {i + 1} · {Math.round(s.offset * 100)}%
              </span>
              <ColorField value={s.color} palette={palette} onChange={(color) => onChange({ ...value, stops: value.stops.map((x, j) => (j === i ? { ...x, color } : x)) })} />
              <input
                type="range"
                className="range"
                min={0}
                max={100}
                value={Math.round(s.offset * 100)}
                aria-label={`Stop ${i + 1} position`}
                onChange={(e) => onChange({ ...value, stops: value.stops.map((x, j) => (j === i ? { ...x, offset: Number(e.target.value) / 100 } : x)) })}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
