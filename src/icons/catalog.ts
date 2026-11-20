// Icon data. The full Lucide catalog (~2,100 icons) is loaded on demand; the
// editor chrome uses a small eager subset. Lucide is ISC-licensed (LUCIDE-LICENSE.txt).
import uiIcons from "./ui-icons.json";

export interface IconDef {
  name: string;
  tags: string[];
  paths: string[];
}

let catalog: Promise<IconDef[]> | null = null;

export function loadIconCatalog(): Promise<IconDef[]> {
  if (!catalog) catalog = import("./catalog.json").then((m) => (m.default as { icons: IconDef[] }).icons);
  return catalog;
}

export type UiIconName = keyof typeof uiIcons;
export const UI_ICONS = uiIcons as Record<UiIconName, string[]>;

/** Curated starting categories (spec 8.5). Search covers the whole catalog. */
export const ICON_CATEGORIES: { label: string; icons: string[] }[] = [
  { label: "Photography", icons: ["camera", "aperture", "focus", "image", "images", "film", "video", "scan-face", "sun", "lightbulb", "layers", "frame", "crop", "flashlight", "sparkles"] },
  { label: "Calendar & time", icons: ["calendar", "calendar-days", "calendar-check", "calendar-clock", "clock", "alarm-clock", "timer", "hourglass", "history", "watch"] },
  { label: "Business", icons: ["briefcase", "building", "handshake", "presentation", "chart-line", "trending-up", "target", "award", "badge-check", "trophy", "gift", "tag", "percent", "credit-card", "receipt", "users", "user", "id-card"] },
  { label: "Technology", icons: ["monitor", "laptop", "smartphone", "tablet", "wifi", "cloud", "cpu", "database", "code", "globe", "zap", "battery-full", "qr-code", "printer"] },
  { label: "Social & media", icons: ["share-2", "thumbs-up", "heart", "star", "message-circle", "messages-square", "rss", "hash", "at-sign", "megaphone", "radio", "send"] },
  { label: "Location", icons: ["map-pin", "map", "navigation", "compass", "house", "building-2", "hotel", "car", "train-front", "plane", "parking-meter", "signpost"] },
  { label: "Communication", icons: ["mail", "phone", "phone-call", "message-square", "inbox", "bell", "link", "contact", "voicemail", "headset"] },
  { label: "Arrows & marks", icons: ["arrow-right", "arrow-up-right", "chevron-right", "chevrons-right", "check", "circle-check", "x", "plus", "minus", "info", "circle-alert", "quote"] },
];
