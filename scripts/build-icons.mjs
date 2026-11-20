// Generates the icon data Graphene uses from the `lucide-static` dev dependency.
//
//   npm run icons
//
// Output (committed, so a normal build never needs this script):
//   src/icons/catalog.json  - every Lucide icon as { name, tags, paths } for the
//                             searchable Icons panel (lazy-loaded chunk)
//   src/icons/ui-icons.json - the small subset the editor chrome uses (eager)
//
// Every Lucide primitive (circle, rect, line, ...) is converted to SVG path data
// so one renderer (Path2D on canvas, <path> in SVG) handles all of them.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = dirname(require.resolve("lucide-static/package.json"));
const nodes = JSON.parse(readFileSync(join(pkgDir, "icon-nodes.json"), "utf8"));
const tags = JSON.parse(readFileSync(join(pkgDir, "tags.json"), "utf8"));
const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;

const n = (v) => Number(v ?? 0);
const fmt = (v) => Number(v.toFixed(3)).toString();

function toPath([tag, a]) {
  switch (tag) {
    case "path":
      return a.d;
    case "circle": {
      const cx = n(a.cx), cy = n(a.cy), r = n(a.r);
      return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0`;
    }
    case "ellipse": {
      const cx = n(a.cx), cy = n(a.cy), rx = n(a.rx), ry = n(a.ry);
      return `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0`;
    }
    case "rect": {
      const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height);
      let rx = a.rx !== undefined ? n(a.rx) : a.ry !== undefined ? n(a.ry) : 0;
      let ry = a.ry !== undefined ? n(a.ry) : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx && !ry) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
      return (
        `M${fmt(x + rx)} ${fmt(y)}h${fmt(w - 2 * rx)}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(rx)} ${fmt(ry)}` +
        `v${fmt(h - 2 * ry)}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(-rx)} ${fmt(ry)}` +
        `h${fmt(-(w - 2 * rx))}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(-rx)} ${fmt(-ry)}` +
        `v${fmt(-(h - 2 * ry))}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(rx)} ${fmt(-ry)}z`
      );
    }
    case "line":
      return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
    case "polyline":
    case "polygon": {
      const pts = a.points.trim().split(/[\s,]+/).map(Number);
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return tag === "polygon" ? d + "z" : d;
    }
    default:
      throw new Error(`Unsupported Lucide element <${tag}>`);
  }
}

const catalog = Object.keys(nodes)
  .sort()
  .map((name) => ({ name, tags: tags[name] ?? [], paths: nodes[name].map(toPath) }));

// Icons used by the editor UI itself (toolbar, panels). Keep this list short.
const UI = [
  "undo-2", "redo-2", "zoom-in", "zoom-out", "maximize", "play", "download", "upload",
  "lock", "lock-open", "eye", "eye-off", "trash", "copy", "group", "ungroup", "crop",
  "grid-3x3", "magnet", "save", "folder-open", "file-plus", "layout-template", "shapes",
  "palette", "pipette", "minus", "plus", "chevron-down", "chevron-right", "bring-to-front",
  "send-to-back", "arrow-up", "arrow-down", "image", "type", "layers", "x", "settings",
  "align-start-vertical", "align-center-vertical", "align-end-vertical",
  "align-start-horizontal", "align-center-horizontal", "align-end-horizontal",
  "align-horizontal-distribute-center", "align-vertical-distribute-center",
  "square", "circle", "triangle", "star", "minus", "move-right", "hexagon",
  "message-square", "replace", "info", "check", "shield-check", "sparkles", "package",
  "rotate-ccw", "square-dashed", "sun", "moon", "search", "file-image", "link",
];
const byName = Object.fromEntries(catalog.map((i) => [i.name, i.paths]));
const ui = {};
for (const name of [...new Set(UI)]) {
  if (!byName[name]) throw new Error(`UI icon "${name}" not found in lucide-static ${version}`);
  ui[name] = byName[name];
}

mkdirSync(join(root, "src/icons"), { recursive: true });
writeFileSync(join(root, "src/icons/catalog.json"), JSON.stringify({ source: `lucide-static@${version}`, icons: catalog }));
writeFileSync(join(root, "src/icons/ui-icons.json"), JSON.stringify(ui, null, 0));
console.log(`Wrote ${catalog.length} catalog icons and ${Object.keys(ui).length} UI icons (lucide-static ${version}).`);
