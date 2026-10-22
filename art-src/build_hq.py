# HQ art -> site/images: room background (2000x1116 = world 500x279 at 4x) and Miles top-down walk frames.
import json, numpy as np
from PIL import Image
from scipy import ndimage
OUT = '/home/claude/north-star/site/images/'
Image.open('room.png').convert('RGB').resize((2000, 1116), Image.LANCZOS).save(OUT + 'hq-room.webp', quality=90)

sheet = Image.open('walk-sheet.png').convert('RGB')
a = np.asarray(sheet).astype(float)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
green = g - np.maximum(r, b)
alpha = np.clip((140 - green) / 90, 0, 1)
g2 = np.where(green > 0, np.maximum(r, b) + np.clip(green, 0, None) * 0.1, g)
rgba = Image.fromarray(np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8))
lab, n = ndimage.label(ndimage.binary_closing(alpha > 0.5, iterations=3))
objs = [sl for sl in ndimage.find_objects(lab) if (lab[sl] > 0).sum() > 3000]
objs.sort(key=lambda sl: (round(sl[0].start / 400), sl[1].start))
assert len(objs) == 24
PICK = {'down': [0, 1, 0, 4], 'left': [12, 6, 12, 10], 'right': [9, 8, 9, 14], 'up': [18, 19, 18, 22]}   # idle, step, idle, step
FH = 192            # frame height in canvas pixels = 48 world units
frames, x = {}, 0
cells = []
for d, idx in PICK.items():
    frames[d] = []
    for i in idx:
        sl = objs[i]
        crop = rgba.crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
        m = np.asarray(crop)[..., 3] > 128
        head = m[: m.shape[0] // 3]
        hx = np.nonzero(head.any(0))[0]; cx = (hx.min() + hx.max()) / 2   # line frames up on the head, not the feet
        s = FH / crop.height
        im = crop.resize((round(crop.width * s), FH), Image.LANCZOS)
        cells.append((im, cx * s))
        frames[d].append(len(cells) - 1)
CW = max(max(c.width for c, _ in cells), 2 * max(max(cx, c.width - cx) for c, cx in cells))
CW = int(np.ceil(CW / 4) * 4)
atlas = Image.new('RGBA', (CW * len(cells), FH))
for k, (im, cx) in enumerate(cells):
    atlas.paste(im, (k * CW + round(CW / 2 - cx), 0), im)
atlas.save(OUT + 'hq-miles.png', optimize=True)
json.dump({'cw': CW, 'h': FH, 'frames': frames}, open('hq-miles.json', 'w'))
print('cell', CW, FH, 'frames', frames)
