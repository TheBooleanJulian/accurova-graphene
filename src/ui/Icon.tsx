import { UI_ICONS, type UiIconName } from "../icons/catalog.ts";

export function Icon({ name, size = 16, stroke = 1.5 }: { name: UiIconName; size?: number; stroke?: number }) {
  return <PathIcon paths={UI_ICONS[name]} size={size} stroke={stroke} />;
}

export function PathIcon({ paths, size = 16, stroke = 1.5 }: { paths: string[]; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
