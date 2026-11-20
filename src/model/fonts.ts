// Typefaces available to designs. "bundled" fonts ship with the app (public/fonts,
// SIL Open Font License) so exports render identically on every machine.
// "system" fonts depend on the viewer's computer and are flagged in the inspector.

export interface FontFamilyInfo {
  family: string;
  weights: number[];
  italic: boolean;
  source: "bundled" | "system";
}

const ALL = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const FONT_FAMILIES: FontFamilyInfo[] = [
  { family: "Montserrat", weights: ALL, italic: true, source: "bundled" },
  { family: "Inter", weights: ALL, italic: true, source: "bundled" },
  { family: "IBM Plex Sans", weights: [400, 500, 600], italic: false, source: "bundled" },
  { family: "Chakra Petch", weights: [500, 600, 700], italic: false, source: "bundled" },
  { family: "JetBrains Mono", weights: [400, 500], italic: false, source: "bundled" },
  { family: "Georgia", weights: [400, 700], italic: true, source: "system" },
  { family: "Arial", weights: [400, 700], italic: true, source: "system" },
];

export const DEFAULT_FONT = "Montserrat";

export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

export function fontInfo(family: string): FontFamilyInfo | undefined {
  return FONT_FAMILIES.find((f) => f.family === family);
}

/** Closest weight the family actually has (avoids faux-bold rendering). */
export function nearestWeight(family: string, weight: number): number {
  const info = fontInfo(family);
  if (!info) return weight;
  return info.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), info.weights[0]);
}
