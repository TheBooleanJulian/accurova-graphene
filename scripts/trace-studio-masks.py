"""Trace the BNI sample's studio cut-outs from the photo itself.

Produces src/samples/studio-masks.json: one vector polygon per studio layer
(backdrop, subject, softbox/lights, DSLR on tripod) in normalised source
coordinates. The photo is only READ; the output is an ordinary editable
Graphene mask, so the original stays untouched.

How: a coarse hand-drawn region per object limits where to look (so a trace
can never leak into the room), then simple colour rules find the real edge:
the paper backdrop is bright and unsaturated, the softbox, stand, camera and
tripod are near-black, and the subject is whatever the paper encloses.
Outlines are traced with sub-pixel marching squares and thinned to ~0.7 px.

Requires numpy, scipy, scikit-image and Pillow (authoring tool only; the app
itself needs none of them):

    python scripts/trace-studio-masks.py [--preview DIR]
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import measure, morphology

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "demo" / "original_background.png"
OUT = ROOT / "src" / "samples" / "studio-masks.json"

# Coarse search regions (pixels of the 2048 x 1536 photo). Generous on purpose:
# the colour rules below find the actual edge inside them.
ROI = {
    # Shaped like the paper (bar and clips at the top, the curl onto the floor at the bottom) so the
    # glossy floor, which is as bright as the paper, cannot be picked up.
    "backdrop": [
        (1098, 424), (1438, 424), (1438, 476), (1398, 484), (1382, 800), (1366, 940), (1352, 966), (1346, 1080), (1250, 1084),
        (1150, 1050), (1074, 1016), (1042, 988), (1074, 946), (1094, 884), (1100, 484), (1094, 476),
    ],
    "subject": [(1105, 478), (1295, 478), (1295, 990), (1105, 990)],
    "softbox": [
        (115, 0), (335, 0), (450, 125), (480, 90), (560, 60), (700, 85), (905, 178), (955, 255), (955, 395),
        (928, 528), (856, 628), (762, 708), (700, 748), (636, 712), (554, 620), (472, 504), (436, 382),
        (440, 290), (352, 282), (344, 300), (380, 905), (360, 905), (322, 300), (290, 278), (195, 238), (100, 188),
        (85, 120), (92, 30),
    ],
    "dslr": [
        (322, 955), (338, 915), (400, 902), (548, 904), (608, 930), (622, 988), (618, 1178), (708, 1184),
        (712, 1216), (598, 1222), (596, 1300), (586, 1378), (622, 1438), (664, 1500), (700, 1536), (318, 1536),
        (352, 1448), (382, 1385), (378, 1306), (380, 1284), (142, 1380), (110, 1360), (134, 1336), (378, 1234),
        (332, 1204), (324, 1100),
    ],
}


def opening(m, fp):
    return ndi.binary_opening(m, structure=fp)


def closing(m, fp):
    # Pad so shapes touching the image edge are not eaten by the closing.
    r = fp.shape[0]
    return ndi.binary_closing(np.pad(m, r), structure=fp)[r:-r, r:-r]


def erosion(m, fp):
    return ndi.binary_erosion(m, structure=fp)


def polygon_mask(points, shape, grow=0):
    img = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(img).polygon(points, fill=1)
    m = np.asarray(img, dtype=bool)
    return ndi.binary_dilation(m, iterations=grow) if grow else m


def largest(mask):
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))


def outline(mask, tolerance=0.7):
    """Longest sub-pixel contour of a mask as (x, y) pixel coordinates."""
    soft = ndi.gaussian_filter(np.pad(mask, 2).astype(float), 0.8)
    contours = measure.find_contours(soft, 0.5)
    c = max(contours, key=len)
    c = measure.approximate_polygon(c, tolerance)
    if np.allclose(c[0], c[-1]):
        c = c[:-1]
    return [(float(col) - 2 + 0.5, float(row) - 2 + 0.5) for row, col in c]


def signed_area(poly):
    return 0.5 * sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]))


def keyhole(outer, hole):
    """Single polygon = outer ring with a hole, bridged at the closest pair of points.
    The hole runs the opposite way round, so both fill rules leave it empty."""
    if (signed_area(outer) > 0) == (signed_area(hole) > 0):
        hole = hole[::-1]
    o = np.array(outer)
    h = np.array(hole)
    d = ((o[:, None, :] - h[None, :, :]) ** 2).sum(-1)
    i, j = np.unravel_index(np.argmin(d), d.shape)
    ring = hole[j:] + hole[:j]
    return outer[: i + 1] + ring + [ring[0], outer[i]] + outer[i + 1 :]


def trace(preview_dir=None):
    img = Image.open(SRC).convert("RGB")
    rgb = np.asarray(img).astype(np.float32) / 255
    H, W = rgb.shape[:2]
    lum = ndi.gaussian_filter(rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32), 1.0)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = ndi.gaussian_filter((mx - mn) / (mx + 1e-6), 1.0)
    shape = (H, W)

    # Paper: bright and nearly colourless, inside the backdrop region.
    # Paper is neutral-to-cool; lit skin is just as bright but warm (blue well below red).
    warmth = ndi.gaussian_filter(rgb[..., 2] - rgb[..., 0], 1.0)
    paper = (lum > 0.62) & (sat < 0.16) & (warmth > -0.06) & polygon_mask(ROI["backdrop"], shape)
    # The two blue clips that hold the paper up belong to the backdrop too.
    band = np.zeros(shape, dtype=bool)
    band[415:500, 1150:1390] = True
    clips = band & (rgb[..., 2] - rgb[..., 0] > 0.2) & (lum > 0.3)
    paper |= ndi.binary_dilation(clips, structure=morphology.disk(1))
    paper = opening(paper, morphology.disk(2))
    paper = largest(closing(paper, morphology.disk(3)))
    filled = ndi.binary_fill_holes(paper)

    # Subject: what the paper encloses, near the person.
    subject = filled & ~paper & polygon_mask(ROI["subject"], shape)
    subject = opening(subject, morphology.disk(2))
    subject = ndi.binary_fill_holes(largest(closing(subject, morphology.disk(4))))

    # Dark gear: softbox + light + stand, and camera + tripod.
    dark = lum < 0.2
    softbox = dark & polygon_mask(ROI["softbox"], shape, grow=6)
    softbox = ndi.binary_fill_holes(largest(closing(softbox, morphology.disk(6))))
    softbox = opening(softbox, morphology.disk(1))
    dslr = dark & polygon_mask(ROI["dslr"], shape, grow=6)
    dslr = ndi.binary_fill_holes(largest(closing(dslr, morphology.disk(4))))
    dslr = opening(dslr, morphology.disk(1))

    # The backdrop keeps a hole for the subject, shrunk 3 px so its edge tucks under the subject layer:
    # moving the subject leaves no copy behind, and there is no hairline gap where they meet.
    # Built from the subject's final polygon (not its raw mask) so the two layers match exactly.
    subject_poly = outline(subject)
    hole = erosion(polygon_mask(subject_poly, shape), morphology.disk(3))
    backdrop_poly = keyhole(outline(filled), outline(hole))

    layers = {
        "backdrop": backdrop_poly,
        "subject": subject_poly,
        "softbox": outline(softbox),
        "dslr": outline(dslr),
    }

    if preview_dir:
        preview_dir = Path(preview_dir)
        preview_dir.mkdir(parents=True, exist_ok=True)
        colours = {"backdrop": (0, 229, 255), "subject": (255, 43, 214), "softbox": (255, 200, 0), "dslr": (60, 255, 120)}
        over = img.copy()
        d = ImageDraw.Draw(over)
        for name, poly in layers.items():
            d.line(poly + [poly[0]], fill=colours[name], width=2)
        over.save(preview_dir / "studio-trace-overlay.png")
        for name, poly in layers.items():
            m = Image.new("L", (W, H), 0)
            ImageDraw.Draw(m).polygon(poly, fill=255)
            cut = Image.new("RGB", (W, H), (255, 0, 255))
            cut.paste(img, mask=m)
            cut.save(preview_dir / f"studio-cut-{name}.png")

    data = {
        "source": "demo/original_background.png",
        "sha256": hashlib.sha256(SRC.read_bytes()).hexdigest(),
        "width": W,
        "height": H,
        "note": "Generated by scripts/trace-studio-masks.py. Normalised source coordinates (x, y).",
        "layers": {k: [[round(x / W, 5), round(y / H, 5)] for x, y in v] for k, v in layers.items()},
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    for k, v in layers.items():
        print(f"{k:9s} {len(v):4d} points")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", help="folder for overlay and cut-out previews")
    trace(ap.parse_args().preview)
