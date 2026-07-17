#!/usr/bin/env python3
"""Generate extension icons from public/icons/logo.svg (or procedural fallback)."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"
SVG = ICONS / "logo.svg"

# VS Code blue palette
BLUE = (0, 122, 204, 255)
BLUE_DARK = (0, 90, 158, 255)
BLUE_LIGHT = (55, 163, 248, 255)
WHITE = (255, 255, 255, 255)
DOC = (245, 248, 252, 255)
MUTED = (138, 150, 163, 255)
FOLD = (199, 212, 228, 255)


def try_cairosvg(size: int, dest: Path) -> bool:
    try:
        import cairosvg  # type: ignore
    except Exception:
        return False
    cairosvg.svg2png(url=str(SVG), write_to=str(dest), output_width=size, output_height=size)
    return True


def draw_logo(size: int):
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(1, size // 32)
    r = max(2, size * 22 // 100)

    # Gradient rounded tile
    for y in range(pad, size - pad):
        t = (y - pad) / max(1, size - 2 * pad)
        col = tuple(int(BLUE_LIGHT[i] * (1 - t) * 0.35 + BLUE[i] * (1 - t * 0.55) + BLUE_DARK[i] * (t * 0.55)) for i in range(3)) + (255,)
        # mix more carefully
        col = (
            int(26 + (0 - 26) * t + 55 * (1 - t) * 0.3),
            int(159 + (90 - 159) * t),
            int(255 + (158 - 255) * t),
            255,
        )
        # Prefer solid VS Code blue with slight darken
        col = tuple(int(BLUE[i] * (1 - t * 0.22) + BLUE_DARK[i] * (t * 0.22)) for i in range(3)) + (255,)
        d.line([(pad, y), (size - pad - 1, y)], fill=col)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [pad, pad, size - pad - 1, size - pad - 1], radius=r, fill=255
    )
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded.paste(img, mask=mask)
    img = rounded
    d = ImageDraw.Draw(img)

    # Highlight
    hi = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(hi).rounded_rectangle(
        [pad + 1, pad + 1, size - pad - 2, size // 2],
        radius=r,
        fill=(255, 255, 255, 30),
    )
    img = Image.alpha_composite(img, hi)
    d = ImageDraw.Draw(img)

    # Document
    dw, dh = size * 52 // 100, size * 62 // 100
    dx, dy = (size - dw) // 2 - size // 40, size * 17 // 100
    dr = max(2, size * 6 // 100)
    d.rounded_rectangle(
        [dx + size // 36, dy + size // 36, dx + dw + size // 36, dy + dh + size // 36],
        radius=dr,
        fill=(0, 0, 0, 45),
    )
    d.rounded_rectangle([dx, dy, dx + dw, dy + dh], radius=dr, fill=DOC)

    fold = size * 14 // 100
    fx = dx + dw - fold
    d.polygon([(fx, dy), (dx + dw, dy + fold), (fx, dy + fold)], fill=FOLD)

    # Lines
    lx = dx + size * 9 // 100
    ly = dy + size * 22 // 100
    gap = max(3, size * 8 // 100)
    for i, (wfrac, col) in enumerate(
        [(0.72, BLUE), (0.58, MUTED), (0.45, MUTED)]
    ):
        th = max(2, size * 5 // 100)
        w = int(dw * wfrac)
        y0 = ly + i * gap
        d.rounded_rectangle([lx, y0, lx + w, y0 + th], radius=th // 2, fill=col)

    # M mark
    mx, my = dx + size * 10 // 100, dy + dh - size * 20 // 100
    mw, mh = dw - size * 20 // 100, size * 14 // 100
    width = max(2, size // 22)
    pts = [
        (mx, my + mh),
        (mx, my),
        (mx + mw * 0.28, my + mh * 0.72),
        (mx + mw * 0.5, my + mh * 0.2),
        (mx + mw * 0.72, my + mh * 0.72),
        (mx + mw, my),
        (mx + mw, my + mh),
    ]
    d.line(pts, fill=BLUE, width=width, joint="curve")

    # Eye badge
    br = size * 15 // 100
    bx = size * 62 // 100
    by = size * 62 // 100
    d.ellipse([bx - 2, by - 2, bx + br * 2 + 2, by + br * 2 + 2], fill=WHITE)
    d.ellipse([bx, by, bx + br * 2, by + br * 2], fill=BLUE_LIGHT)
    cx, cy = bx + br, by + br
    d.ellipse([cx - br // 2, cy - br // 3, cx + br // 2, cy + br // 3], fill=WHITE)
    d.ellipse([cx - br // 5, cy - br // 5, cx + br // 5, cy + br // 5], fill=BLUE_DARK)

    return img


def draw_tiny(size: int):
    """Simplified glyph for 16–32px."""
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = max(2, size // 5)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BLUE)
    # doc
    d.rounded_rectangle(
        [size * 0.2, size * 0.16, size * 0.8, size * 0.84],
        radius=max(1, size // 8),
        fill=DOC,
    )
    y = int(size * 0.34)
    th = max(1, size // 9)
    for i, wf in enumerate([0.48, 0.38, 0.28]):
        x0 = int(size * 0.3)
        d.rectangle(
            [x0, y + i * (th + max(1, size // 16)), x0 + int(size * wf), y + i * (th + max(1, size // 16)) + th],
            fill=BLUE if i == 0 else MUTED,
        )
    if size >= 24:
        d.ellipse([size * 0.55, size * 0.55, size * 0.9, size * 0.9], fill=BLUE_LIGHT)
        d.ellipse([size * 0.66, size * 0.66, size * 0.8, size * 0.8], fill=WHITE)
        d.ellipse([size * 0.7, size * 0.7, size * 0.76, size * 0.76], fill=BLUE_DARK)
    return img


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    sizes = {
        16: "icon16.png",
        32: "icon32.png",
        48: "icon48.png",
        128: "icon128.png",
        512: "logo-512.png",
    }
    for size, name in sizes.items():
        dest = ICONS / name
        if size >= 48 and SVG.exists() and try_cairosvg(size, dest):
            print(f"svg → {dest}")
            continue
        img = draw_tiny(size) if size <= 32 else draw_logo(size)
        img.save(dest, "PNG")
        print(f"drew {dest}")


if __name__ == "__main__":
    main()
