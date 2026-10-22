# Batch 2: Miles's outfits, the new power-ups and the Daily Spin machine, built the same way as Chapter 1's art.
# Run from the repo root: python3 art/outfits/build_outfits.py
# Each outfit becomes one strip (images/outfit-<id>.png) of equal cells, feet on the bottom edge:
#   0-5 run, 6 fall, 7 climb1, 8 climb2, 9 victory, 10 idle
import json, numpy as np
from PIL import Image
from scipy import ndimage
SRC = 'art/outfits/'; OUT = 'site/images/'; SCALE = 4
OUTFITS = ['702', 'battle', 'bandana', 'cape']

def load(path):   # the raw Higgsfield sheets (kept in the repo as lossless .webp under art-src/batch2)
    import os
    if not os.path.exists(path): path = path.replace(SRC, 'art-src/batch2/').replace('.png', '.webp')
    im = np.array(Image.open(path).convert('RGB')).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    fg = ~((g > 140) & (g - r > 60) & (g - b > 60))
    lab, k = ndimage.label(ndimage.binary_closing(fg, iterations=4))
    boxes = [(s[0].start, s[0].stop, s[1].start, s[1].stop, i + 1) for i, s in enumerate(ndimage.find_objects(lab))
             if fg[s].sum() > 3000]
    return im, fg, lab, sorted(boxes, key=lambda b: b[2])

def cut(im, fg, lab, box):           # full-resolution RGBA of one figure, trimmed
    y0, y1, x0, x1, i = box
    m = (lab[y0:y1, x0:x1] == i) & fg[y0:y1, x0:x1]
    o = np.zeros((y1 - y0, x1 - x0, 4), np.uint8); o[..., :3] = im[y0:y1, x0:x1]; o[..., 3] = m * 255
    a = o[..., 3] > 0; rr = np.nonzero(a.any(1))[0]; cc = np.nonzero(a.any(0))[0]
    return o[rr[0]:rr[-1] + 1, cc[0]:cc[-1] + 1]

def grid(im, fg):                    # pixel-art cell size of the sheet (same test as Chapter 1)
    best = None
    d = np.abs(np.diff(im, axis=1)).sum(2) > 60; d &= fg[:, 1:] & fg[:, :-1]
    pos = np.nonzero(d)[1]
    for p in range(10, 40):
        ph = np.bincount(pos % p, minlength=p); sc = ph.max() / ph.mean()
        if best is None or sc > best[0]: best = (sc, p)
    return best[1]

def smooth(f, k):                    # same downscale as the Chapter 1 run sheet
    w, h = max(1, round(f.shape[1] * k)), max(1, round(f.shape[0] * k))
    rgb = Image.fromarray(np.ascontiguousarray(f[..., :3])).resize((w, h), Image.LANCZOS)
    al = Image.fromarray(f[..., 3]).resize((w, h), Image.BOX).point(lambda v: 255 if v > 110 else 0)
    rgb.putalpha(al); return rgb

def despill(img):                    # take the green-screen tint off edges (only where green beats red and blue)
    a = np.array(img).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (g > r) & (g > b); a[..., 1] = np.where(m, np.maximum(r, b), g)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

meta = {}
for o in OUTFITS:
    im, fg, lab, boxes = load(SRC + o + '-run.png')
    assert len(boxes) == 7, (o, 'run', len(boxes))
    run = [cut(im, fg, lab, b) for b in boxes]
    k = 51 * SCALE / max(f.shape[0] for f in run[:6])          # 51 game pixels tall, like Chapter 1
    cells = []
    for f in run:
        c = smooth(f, k); a = np.array(c)[..., 3] > 0
        cells.append((c, np.nonzero(a[:int(c.height * 0.4)])[1].mean()))   # line up on the head
    im, fg, lab, boxes = load(SRC + o + '-extra.png')
    assert len(boxes) == 4, (o, 'extra', len(boxes))
    ex = [cut(im, fg, lab, b) for b in boxes]
    k2 = 53.5 * SCALE / ex[0].shape[0]                          # climb frames 53.5 tall, like Chapter 1
    for f in ex:
        c = smooth(f, k2); cells.append((c, c.width / 2))
    CW = max(max(c.width for c, _ in cells[:7]) * 2, max(c.width for c, _ in cells[7:]) + 4)
    CH = max(c.height for c, _ in cells)
    sheet = Image.new('RGBA', (CW * len(cells), CH))
    for i, (c, cx) in enumerate(cells): sheet.paste(c, (i * CW + round(CW / 2 - cx), CH - c.height))
    sheet.save(OUT + 'outfit-%s.png' % o, optimize=True)
    meta[o] = [CW, CH, len(cells)]
    print(o, 'cell', CW, CH, 'heights', [c.height for c, _ in cells])

# power-ups: mic, 808 Drop, gold chain -> item-sized icons
im, fg, lab, boxes = load(SRC + 'powerups.png')
boxes = sorted(boxes, key=lambda b: -(b[1] - b[0]) * (b[3] - b[2]))[:3]
boxes.sort(key=lambda b: b[2])
for name, b in zip(['mic', 'drop808', 'chain'], boxes):
    f = cut(im, fg, lab, b); k = 16 * SCALE / max(f.shape[:2])
    despill(smooth(f, k)).save(OUT + 'pu-%s.png' % name, optimize=True)
    big = despill(smooth(f, 160 / max(f.shape[:2]))); big.save(OUT + 'item-%s.png' % name, optimize=True)   # for menus / instructions
    print('power-up', name, f.shape[:2])

# Daily Spin machine: key the green, keep it big for the HQ arcade screen
im, fg, lab, boxes = load(SRC + 'spin-machine.png')
b = max(boxes, key=lambda b: (b[1] - b[0]) * (b[3] - b[2]))
f = cut(im, fg, lab, b)
spin = despill(smooth(f, 900 / f.shape[0])); spin.save(OUT + 'spin-machine.png', optimize=True)
# find the empty navy circle the wheel is drawn into (largest dark-blue blob)
a = np.array(spin).astype(int); navy = (a[..., 2] > a[..., 0] + 25) & (a[..., 2] < 140) & (a[..., 0] < 60) & (a[..., 3] > 0)
nl, nk = ndimage.label(navy); sizes = ndimage.sum(navy, nl, range(1, nk + 1)); j = int(np.argmax(sizes)) + 1
ys, xs = np.nonzero(nl == j)
meta['spin'] = {'w': spin.width, 'h': spin.height, 'cx': round(float(xs.mean()), 1), 'cy': round(float(ys.mean()), 1),
                'r': round(float(min(xs.max() - xs.min(), ys.max() - ys.min()) / 2), 1)}
print('spin', meta['spin'])
json.dump(meta, open('art/outfits/meta.json', 'w'))

# the gold pointer pokes into the top of the navy circle: keep it as an overlay that sits above the spinning wheel
cx, cy, r = meta['spin']['cx'], meta['spin']['cy'], meta['spin']['r']
yy, xx = np.mgrid[0:spin.height, 0:spin.width]
inside = (xx - cx) ** 2 + (yy - cy) ** 2 < (r - 2) ** 2
over = a.copy(); over[~(inside & ~navy & (a[..., 3] > 0))] = 0
over = ndimage.binary_opening(over[..., 3] > 0, iterations=1)[..., None] * a
Image.fromarray(over.astype(np.uint8), 'RGBA').crop((0, 0, spin.width, int(cy))).save(OUT + 'spin-pointer.png', optimize=True)
print('pointer pixels', int((over[..., 3] > 0).sum()))
json.dump(meta, open('art/outfits/meta.json', 'w'))
