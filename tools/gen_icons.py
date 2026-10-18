"""Generate Android launcher icons + PWA icons from art/icon.png and art/icon-foreground.png."""
import os, sys
from PIL import Image, ImageDraw

ROOT = sys.argv[1]
BG = (0x10, 0x0C, 0x18, 255)
icon = Image.open(os.path.join(ROOT, 'art/icon.png')).convert('RGBA')
fg = Image.open(os.path.join(ROOT, 'art/icon-foreground.png')).convert('RGBA')
fg_crop = fg.crop(fg.getchannel('A').getbbox())

def resize(img, size):
    return img.resize((size, size), Image.LANCZOS)

def foreground(size, scale):
    """Foreground art re-centred on a transparent size x size canvas.
    `scale` = fraction of the canvas the art's bounding box may occupy relative to the
    original 1024 layout (1.0 = same size as in icon-foreground.png)."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    k = size / 1024 * scale
    w, h = max(1, round(fg_crop.width * k)), max(1, round(fg_crop.height * k))
    art = fg_crop.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(art, ((size - w) // 2, (size - h) // 2))
    return canvas

def circle(img):
    size = img.width
    ss = 4
    mask = Image.new('L', (size * ss, size * ss), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

# --- Android ---------------------------------------------------------------
res = os.path.join(ROOT, 'android/app/src/main/res')
densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, d in densities.items():
    out = os.path.join(res, f'mipmap-{name}')
    os.makedirs(out, exist_ok=True)
    legacy = round(48 * d)
    resize(icon, legacy).save(os.path.join(out, 'ic_launcher.png'), optimize=True)
    circle(resize(icon, legacy)).save(os.path.join(out, 'ic_launcher_round.png'), optimize=True)
    # Adaptive foreground: 108dp layer; keep the art inside the 66dp safe circle (r ~ 0.30).
    foreground(round(108 * d), 0.9).save(os.path.join(out, 'ic_launcher_foreground.png'), optimize=True)

# --- PWA ---------------------------------------------------------------------
pub = os.path.join(ROOT, 'public/icons')
os.makedirs(pub, exist_ok=True)
resize(icon, 192).save(os.path.join(pub, 'icon-192.png'), optimize=True)
resize(icon, 512).save(os.path.join(pub, 'icon-512.png'), optimize=True)
resize(icon, 180).convert('RGB').save(os.path.join(pub, 'apple-touch-icon.png'), optimize=True)
# Maskable: art inside the 80% safe-zone circle (r = 0.40); r ~ 0.36 at scale 1.1.
m = Image.new('RGBA', (512, 512), BG)
m.alpha_composite(foreground(512, 1.1))
m.convert('RGB').save(os.path.join(pub, 'icon-maskable-512.png'), optimize=True)
print('ok')
