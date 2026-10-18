#!/usr/bin/env python3
"""Pack every PNG in art/tiles/ into one texture atlas.

Outputs public/assets/atlas.png and src/assets/atlas.json
({name: [[x, y, w, h], ...frames]}). Files named like `floor_crypt_2.png`
become frame 2 of sprite `floor_crypt`; any other file is a one-frame sprite.

Requires Pillow:  pip install pillow
Usage:            python3 tools/build_atlas.py
"""
import json, os, re
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'tiles')
ATLAS_W = 512
PAD = 1

# Per-prefix brightness tweaks so the darker DCSS floors read well under the lighting.
BRIGHTNESS = {
    'floor_crypt': 1.6,
    'floor_sewer': 1.5,
    'floor_bone': 1.8,
    'floor_hell': 1.0,
    'wall_hell': 0.6,
    'floor_ice': 0.9,
    'wall_ice': 0.85,
}


def main():
    entries = []
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith('.png'):
            continue
        stem = fn[:-4]
        m = re.match(r'^(.*)_(\d+)$', stem)
        name, frame = (m.group(1), int(m.group(2))) if m else (stem, 0)
        img = Image.open(os.path.join(SRC, fn)).convert('RGBA')
        for prefix, k in BRIGHTNESS.items():
            if name.startswith(prefix):
                rgb = ImageEnhance.Brightness(img.convert('RGB')).enhance(k)
                rgb.putalpha(img.getchannel('A'))
                img = rgb
        entries.append((name, frame, img))

    # shelf packing, tallest first
    entries.sort(key=lambda e: (-e[2].height, e[0], e[1]))
    x = y = shelf_h = 0
    placed = []
    for name, frame, img in entries:
        w, h = img.size
        if x + w > ATLAS_W:
            x, y, shelf_h = 0, y + shelf_h + PAD, 0
        placed.append((name, frame, img, x, y))
        x += w + PAD
        shelf_h = max(shelf_h, h)
    height = y + shelf_h
    atlas = Image.new('RGBA', (ATLAS_W, height))
    meta = {}
    for name, frame, img, px, py in placed:
        atlas.paste(img, (px, py))
        meta.setdefault(name, {})[frame] = [px, py, img.width, img.height]
    out = {name: [frames[i] for i in sorted(frames)] for name, frames in sorted(meta.items())}

    os.makedirs(os.path.join(ROOT, 'public', 'assets'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'src', 'assets'), exist_ok=True)
    atlas.save(os.path.join(ROOT, 'public', 'assets', 'atlas.png'), optimize=True)
    with open(os.path.join(ROOT, 'src', 'assets', 'atlas.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'atlas {ATLAS_W}x{height}, {len(out)} sprites, {len(entries)} frames')


if __name__ == '__main__':
    main()
