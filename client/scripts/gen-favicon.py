from PIL import Image
from pathlib import Path

src = Path(
    r"C:\Users\ASPIRE\.cursor\projects\d-Myproject-starmediacrm\assets\698680602_18004558640873039_3869092524219347580_n-2fa3e198-e376-4b61-b8dc-9d47cb42a3eb.jpg"
)
out_dir = Path(r"d:\Myproject\starmediacrm\client\public")
out_dir.mkdir(parents=True, exist_ok=True)

img = Image.open(src).convert("RGBA")
px = img.load()
w, h = img.size


def is_bg(x, y):
    r, g, b, a = px[x, y]
    return a < 10 or (r > 245 and g > 245 and b > 245)


minx, miny, maxx, maxy = w, h, 0, 0
for y in range(h):
    for x in range(w):
        if not is_bg(x, y):
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)

pad = 8
minx = max(0, minx - pad)
miny = max(0, miny - pad)
maxx = min(w - 1, maxx + pad)
maxy = min(h - 1, maxy + pad)
cropped = img.crop((minx, miny, maxx + 1, maxy + 1))


def make_square(im, size, bg=(255, 255, 255, 255), margin_ratio=0.08):
    cw, ch = im.size
    side = max(cw, ch)
    canvas = Image.new("RGBA", (side, side), bg)
    canvas.paste(im, ((side - cw) // 2, (side - ch) // 2), im)
    m = int(side * margin_ratio)
    padded = Image.new("RGBA", (side + 2 * m, side + 2 * m), bg)
    padded.paste(canvas, (m, m), canvas)
    return padded.resize((size, size), Image.Resampling.LANCZOS)


def to_rgb(sq):
    rgb = Image.new("RGB", sq.size, (255, 255, 255))
    rgb.paste(sq, mask=sq.split()[-1])
    return rgb


sizes = {
    "favicon-16.png": 16,
    "favicon-32.png": 32,
    "favicon-48.png": 48,
    "favicon-96.png": 96,
    "favicon-192.png": 192,
    "favicon-512.png": 512,
    "apple-touch-icon.png": 180,
}

for name, size in sizes.items():
    to_rgb(make_square(cropped, size)).save(out_dir / name, format="PNG", optimize=True)
    print("wrote", name)

# OG share image 1200x630
brand = cropped.copy()
bw, bh = brand.size
scale = min(900 / bw, 480 / bh, 1.0)
if scale < 1:
    brand = brand.resize((int(bw * scale), int(bh * scale)), Image.Resampling.LANCZOS)
og = Image.new("RGB", (1200, 630), (255, 255, 255))
bx, by = brand.size
og.paste(brand.convert("RGB"), ((1200 - bx) // 2, (630 - by) // 2))
og.save(out_dir / "og-image.png", format="PNG", optimize=True)
print("wrote og-image.png")

# favicon.ico multi-size
ico_imgs = [make_square(cropped, s).convert("RGBA") for s in (16, 32, 48)]
ico_imgs[0].save(
    out_dir / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=ico_imgs[1:],
)
print("wrote favicon.ico")

# High-res brand + default favicon.png (48 for Google)
to_rgb(make_square(cropped, 512)).save(out_dir / "brand-logo.png", format="PNG", optimize=True)
to_rgb(make_square(cropped, 48)).save(out_dir / "favicon.png", format="PNG", optimize=True)
print("done")
