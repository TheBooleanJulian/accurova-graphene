// SVG safety. Uploaded SVGs are rendered through <img> (which never runs
// scripts or loads external resources), and additionally sanitised: scripts,
// foreign content, event handlers and external references are removed.

const BLOCKED_ELEMENTS = ["script", "foreignObject", "iframe", "object", "embed", "audio", "video", "handler", "listener"];
const SAFE_HREF = /^(#|data:image\/(png|jpe?g|webp|gif);base64,)/i;

export function sanitizeSvg(text: string): { svg: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) {
    throw new Error("This SVG could not be read. Export it again from your design tool and retry.");
  }
  for (const name of BLOCKED_ELEMENTS) {
    for (const el of Array.from(doc.getElementsByTagName(name))) el.remove();
  }
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      const v = attr.value.trim();
      if (n.startsWith("on")) el.removeAttribute(attr.name);
      else if ((n === "href" || n === "xlink:href" || n === "src") && !SAFE_HREF.test(v)) el.removeAttribute(attr.name);
      else if (n === "style" && /url\s*\(\s*['"]?(?!#)/i.test(v)) el.removeAttribute(attr.name);
    }
  }
  const { width, height } = svgSize(root);
  if (!root.getAttribute("width") || !root.getAttribute("height")) {
    // <img> needs an intrinsic size to rasterise reliably.
    root.setAttribute("width", String(width));
    root.setAttribute("height", String(height));
  }
  return { svg: new XMLSerializer().serializeToString(doc), width, height };
}

function svgSize(root: Element): { width: number; height: number } {
  const num = (v: string | null) => {
    const n = v ? parseFloat(v) : NaN;
    return v && /^[\d.]+(px)?$/.test(v.trim()) && n > 0 ? n : NaN;
  };
  let w = num(root.getAttribute("width"));
  let h = num(root.getAttribute("height"));
  const vb = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (!w && !h) {
      // Rasterise small icons at a useful size.
      const s = Math.max(1, 512 / Math.max(vb[2], vb[3]));
      w = vb[2] * s;
      h = vb[3] * s;
    } else if (!w) w = (h * vb[2]) / vb[3];
    else if (!h) h = (w * vb[3]) / vb[2];
  }
  return { width: Math.round(w || 512), height: Math.round(h || 512) };
}
