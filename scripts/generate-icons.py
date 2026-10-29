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
    android()


ANDROID_RES = ROOT / "apps" / "web" / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def round_icon(size: int) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse([0, 0, s - 1, s - 1], fill=DEEP)
    img = img.resize((size, size), Image.LANCZOS)
    art = mark(size, 0.16, background=None)
    img.alpha_composite(art)
    return img


def notification_icon(size: int) -> Image.Image:
    """Android status-bar icons must be white on transparent; the system tints them."""
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(s * 0.06)
    h = int((s - 2 * pad) * 0.58)
    top = (s - h) // 2
    d.rounded_rectangle([pad, top, s - pad, top + h], radius=h // 2, outline=WHITE, width=int(s * 0.12))
    r = int(s * 0.11)
    cx, cy = int(s * 0.7), top + int(s * 0.06)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def splash(width: int, height: int) -> Image.Image:
    img = Image.new("RGBA", (width, height), DEEP + (255,))
    size = int(min(width, height) * 0.42)
    art = mark(size, 0.04, background=None)
    img.alpha_composite(art, ((width - size) // 2, (height - size) // 2))
    return img


def android() -> None:
    """Launcher, adaptive, round, notification and splash images for the Capacitor app."""
    if not ANDROID_RES.exists():
        print("no android project yet (run `npx cap add android` in apps/web) - skipping")
        return
    for name, k in DENSITIES.items():
        folder = ANDROID_RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        mark(int(48 * k), 0.12).save(folder / "ic_launcher.png")
        round_icon(int(48 * k)).save(folder / "ic_launcher_round.png")
        # Adaptive icon foreground: 108dp canvas, art kept inside the central 66dp safe zone.
        mark(int(108 * k), 0.24, background=None).save(folder / "ic_launcher_foreground.png")
        drawable = ANDROID_RES / f"drawable-{name}"
        drawable.mkdir(parents=True, exist_ok=True)
        notification_icon(int(24 * k)).save(drawable / "ic_stat_trackly.png")
    (ANDROID_RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#14286E</color>\n</resources>\n'
    )
    # Splash screens: same sizes as the Capacitor template, regenerated in Trackly colours.
    for png in ANDROID_RES.glob("drawable*/splash.png"):
        with Image.open(png) as old:
            w, h = old.size
        splash(w, h).save(png)
    print("android resources written to", ANDROID_RES)


if __name__ == "__main__":
    main()
