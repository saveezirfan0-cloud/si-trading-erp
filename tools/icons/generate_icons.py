#!/usr/bin/env python3
"""Generate every PWA icon / splash asset from code — no dependencies.

The SI monogram is drawn as a signed-distance field and antialiased, so each
size is rendered natively rather than resampled from one big master.

    python3 tools/icons/generate_icons.py

Writes into public/ (icons, apple-touch-icon, favicon.ico) and public/splash/.
"""

import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUBLIC = os.path.join(ROOT, "public")

# ── Brand ────────────────────────────────────────────────────────────────────
GOLD_LIGHT = (0xF5, 0xB5, 0x25)
GOLD_DARK = (0xD4, 0x90, 0x0A)
INK = (0x0D, 0x0F, 0x14)


# ── PNG output ───────────────────────────────────────────────────────────────
def write_png(path, width, height, pixels):
    """pixels: flat bytearray of RGBA rows, length width*height*4."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)
    return png


def write_ico(path, entries):
    """entries: list of (size, png_bytes). Modern browsers read PNG-in-ICO."""
    count = len(entries)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    dirs, blobs = b"", b""
    for size, png in entries:
        dirs += struct.pack("<BBBBHHII", size & 0xFF, size & 0xFF, 0, 0,
                            1, 32, len(png), offset)
        blobs += png
        offset += len(png)
    with open(path, "wb") as fh:
        fh.write(header + dirs + blobs)


# ── Signed distance helpers (all distances in pixels) ────────────────────────
def sd_round_rect(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ox, oy = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - r


def sd_arc(px, py, cx, cy, r, a0, a1):
    """Distance to a circular arc sweeping CCW from a0 to a1 (radians)."""
    dx, dy = px - cx, py - cy
    ang = math.atan2(dy, dx)
    sweep = (a1 - a0) % (2 * math.pi)
    rel = (ang - a0) % (2 * math.pi)
    if rel <= sweep:
        return abs(math.hypot(dx, dy) - r)
    e0 = (cx + r * math.cos(a0), cy + r * math.sin(a0))
    e1 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
    return min(math.hypot(px - e0[0], py - e0[1]),
               math.hypot(px - e1[0], py - e1[1]))


def monogram_sd(px, py, cx, cy, h):
    """Distance to the 'SI' monogram of cap-height h centred on (cx, cy).

    y grows downward (image space); the S is built from two stacked arcs.
    """
    t = 0.185 * h                      # stroke weight
    r = (h - t) / 4.0                  # radius of each S bowl
    w_s = 2 * r + t                    # width of the S
    w_i = 2.35 * t                     # width of the serifed I
    gap = 0.20 * t + 0.10 * h
    total = w_s + gap + w_i

    s_cx = cx - total / 2 + w_s / 2
    i_cx = cx + total / 2 - w_i / 2

    # ── S: top bowl + bottom bowl, round caps come free from the arc SDF ──
    d_top = sd_arc(px, py, s_cx, cy - r, r,
                   math.radians(90), math.radians(330))
    d_bot = sd_arc(px, py, s_cx, cy + r, r,
                   math.radians(270), math.radians(150))
    d_s = min(d_top, d_bot) - t / 2

    # ── I: stem plus top and bottom serifs ──
    cap = 0.92 * t
    d_stem = sd_round_rect(px, py, i_cx, cy, t / 2, h / 2, t * 0.12)
    d_top_serif = sd_round_rect(px, py, i_cx, cy - h / 2 + cap / 2,
                                w_i / 2, cap / 2, cap * 0.18)
    d_bot_serif = sd_round_rect(px, py, i_cx, cy + h / 2 - cap / 2,
                                w_i / 2, cap / 2, cap * 0.18)
    d_i = min(d_stem, d_top_serif, d_bot_serif)

    return min(d_s, d_i)


def coverage(d):
    """Antialiased coverage from a distance: 1 inside, 0 outside, ramp across 1px."""
    return min(1.0, max(0.0, 0.5 - d))


def blend(dst, src, alpha):
    return tuple(int(round(d + (s - d) * alpha)) for d, s in zip(dst, src))


# ── Icon renderer ────────────────────────────────────────────────────────────
def render_icon(size, logo_ratio=0.56, corner_ratio=0.0, opaque=True):
    """A gold gradient tile carrying the ink-coloured SI monogram.

    corner_ratio 0 → full-bleed square (maskable / iOS, which apply their own
    mask); > 0 → rounded tile with transparent corners.
    """
    px = bytearray(size * size * 4)
    radius = corner_ratio * size
    h = logo_ratio * size
    c = size / 2.0

    for y in range(size):
        row = y * size * 4
        for x in range(size):
            fx, fy = x + 0.5, y + 0.5

            # Diagonal gold gradient
            k = min(1.0, max(0.0, (fx + fy) / (2.0 * size)))
            bg = tuple(int(round(a + (b - a) * k))
                       for a, b in zip(GOLD_LIGHT, GOLD_DARK))

            if radius > 0:
                a_tile = coverage(sd_round_rect(fx, fy, c, c, c, c, radius))
            else:
                a_tile = 1.0
            if a_tile <= 0.0:
                continue

            a_logo = coverage(monogram_sd(fx, fy, c, c, h))
            rgb = blend(bg, INK, a_logo) if a_logo > 0 else bg

            alpha = 255 if opaque and radius <= 0 else int(round(a_tile * 255))
            i = row + x * 4
            px[i], px[i + 1], px[i + 2], px[i + 3] = rgb[0], rgb[1], rgb[2], alpha
    return px


def render_splash(width, height):
    """Dark launch screen with the gold monogram centred."""
    px = bytearray(width * height * 4)
    h = min(width, height) * 0.30
    cx, cy = width / 2.0, height / 2.0
    # Only the box around the logo needs per-pixel work; the rest is flat ink.
    box = int(h * 1.6)
    x0, x1 = max(0, int(cx - box)), min(width, int(cx + box))
    y0, y1 = max(0, int(cy - box)), min(height, int(cy + box))

    for y in range(height):
        row = y * width * 4
        for x in range(width):
            i = row + x * 4
            px[i], px[i + 1], px[i + 2], px[i + 3] = INK[0], INK[1], INK[2], 255

    for y in range(y0, y1):
        row = y * width * 4
        for x in range(x0, x1):
            fx, fy = x + 0.5, y + 0.5
            a = coverage(monogram_sd(fx, fy, cx, cy, h))
            if a <= 0:
                continue
            rgb = blend(INK, GOLD_LIGHT, a)
            i = row + x * 4
            px[i], px[i + 1], px[i + 2] = rgb
    return px


# ── Entry point ──────────────────────────────────────────────────────────────
def main():
    os.makedirs(os.path.join(PUBLIC, "splash"), exist_ok=True)

    # Rounded tiles for browsers/launchers that don't mask ("purpose: any")
    for size in (192, 512):
        path = os.path.join(PUBLIC, f"logo{size}.png")
        write_png(path, size, size,
                  render_icon(size, logo_ratio=0.52, corner_ratio=0.22, opaque=False))
        print("wrote", os.path.relpath(path, ROOT))

    # Full-bleed tiles with the logo inside the 80% safe zone ("maskable")
    for size in (192, 512):
        path = os.path.join(PUBLIC, f"logo{size}-maskable.png")
        write_png(path, size, size, render_icon(size, logo_ratio=0.38))
        print("wrote", os.path.relpath(path, ROOT))

    # iOS home screen (no alpha, iOS rounds it itself)
    path = os.path.join(PUBLIC, "apple-touch-icon.png")
    write_png(path, 180, 180, render_icon(180, logo_ratio=0.52))
    print("wrote", os.path.relpath(path, ROOT))

    # favicon.ico — PNG-encoded 16/32/48 entries
    entries = []
    for size in (16, 32, 48):
        tmp = os.path.join(PUBLIC, f".favicon-{size}.png")
        png = write_png(tmp, size, size, render_icon(size, logo_ratio=0.62))
        os.remove(tmp)
        entries.append((size, png))
    write_ico(os.path.join(PUBLIC, "favicon.ico"), entries)
    print("wrote public/favicon.ico")

    for w, h in ((1290, 2796), (1179, 2556), (750, 1334)):
        path = os.path.join(PUBLIC, "splash", f"splash-{w}x{h}.png")
        write_png(path, w, h, render_splash(w, h))
        print("wrote", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
