"""Generates Trackly's app icons (PWA + Android) from code, so there are no binary sources to maintain.

The mark: a stadium-shaped running track on track blue, an inner lane line, and a volt runner.
Run from the repo root:  python3 scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

BLUE = (35, 70, 216)
DEEP = (20, 40, 110)
VOLT = (198, 244, 50)
WHITE = (255, 255, 255)
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "apps" / "web" / "public"


def mark(size: int, padding: float, background=DEEP, rounded=True) -> Image.Image:
    scale = 4  # draw big, then downsample for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        radius = int(s * 0.22) if rounded else 0
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=background)
    pad = int(s * padding)
    w = s - 2 * pad
    h = int(w * 0.58)
    top = (s - h) // 2
    # outer track
    d.rounded_rectangle([pad, top, pad + w, top + h], radius=h // 2, fill=BLUE)
    # inner lane line
    inset = int(h * 0.22)
    d.rounded_rectangle(
        [pad + inset, top + inset, pad + w - inset, top + h - inset],
        radius=(h - 2 * inset) // 2,
        outline=WHITE + (150,),
        width=max(2, int(s * 0.018)),
    )
    # volt runner on the top straight
    r = int(h * 0.16)
    cx = pad + int(w * 0.72)
    cy = top + inset
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=VOLT)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    icons = PUBLIC / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    mark(192, 0.14).save(icons / "icon-192.png")
    mark(512, 0.14).save(icons / "icon-512.png")
    # maskable: full-bleed background, art inside the 80% safe zone
    mark(512, 0.2, rounded=False).save(icons / "icon-512-maskable.png")
    mark(180, 0.14, rounded=False).save(PUBLIC / "apple-touch-icon.png")
    # monochrome badge for notification trays
    badge = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.rounded_rectangle([8, 28, 88, 68], radius=20, outline=WHITE, width=8)
    bd.ellipse([60, 20, 76, 36], fill=WHITE)
    badge.save(icons / "badge-96.png")
    # social preview image (Open Graph)
    og = Image.new("RGB", (1200, 630), DEEP)
    m = mark(360, 0.1, background=None)
    og.paste(m, (420, 135), m)
    og.save(PUBLIC / "og-image.png")
    print("icons written to", PUBLIC)


if __name__ == "__main__":
    main()
