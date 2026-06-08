from pathlib import Path
import json
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
LOGOS = PUBLIC / "logos"
ICON = LOGOS / "logo-icon.png"
def fit_square(im, size):
    im = im.convert("RGBA")
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    w, h = im.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)
def save_png(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
def save_ico(icon, path):
    sizes = [16, 32, 48, 96, 192]
    images = [fit_square(icon, s) for s in sizes]
    images[0].save(path, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[1:])
def main():
    icon = Image.open(ICON)
    save_png(fit_square(icon, 512), LOGOS / "logo-square.png")
    for size in (48, 96, 192): save_png(fit_square(icon, size), PUBLIC / ("favicon-%d.png" % size))
    save_png(fit_square(icon, 192), PUBLIC / "favicon.png")
    save_png(fit_square(icon, 180), PUBLIC / "apple-touch-icon.png")
    save_ico(icon, PUBLIC / "favicon.ico")
if __name__ == "__main__": main()
