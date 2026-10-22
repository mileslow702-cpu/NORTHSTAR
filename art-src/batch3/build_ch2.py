# Chapter 2 (THE UNDERGROUND) art, built the same way as Chapter 1. Run from the repo root: python3 art/batch3/build_ch2.py
# Writes site/images/bg-*.webp, scene-c2-*.webp, atlas2.png and art/batch3/meta2.json.
import json, os, numpy as np
from PIL import Image
from scipy import ndimage
SRC = 'art/batch3/'; OUT = 'site/images/'; SCALE = 4
meta = {}

def raw(name):
    p = SRC + name + '.png'
    if not os.path.exists(p): p = 'art-src/batch3/' + name + '.webp'
    return np.array(Image.open(p).convert('RGB')).astype(int)

def street_line(arr):   # top edge of the sidewalk (same test as Chapter 1)
    H = arr.shape[0]; e = (np.abs(np.diff(arr, axis=0)).sum(2) > 70).mean(1)
    lo, hi = int(H * 0.72), int(H * 0.93); seg = e[lo:hi]
    return lo + int(np.nonzero(seg >= 0.85 * seg.max())[0][0]) + 1

def unbox(arr):   # drop black letterbox bars
    m = arr.mean(2).mean(1); keep = np.nonzero(m > 6)[0]
    return arr[keep[0]:keep[-1] + 1]

# ---- level backgrounds: sidewalk top lands on game row 160, like Chapter 1 ----
bgw, ground = {}, {}
for name in ['northtown', 'boulder', 'tunnels', 'lair']:
    try: arr = unbox(raw('bg-' + name))
    except FileNotFoundError: print('missing bg-' + name); continue
    sl = street_line(arr); f = 160 / sl; need = round(192 / f)
    if arr.shape[0] < need: arr = np.concatenate([arr, np.repeat(arr[-1:], need - arr.shape[0], 0)])   # extend the floor
    crop = arr[:need]
    img = Image.fromarray(crop.astype(np.uint8)).resize((round(arr.shape[1] * f) * SCALE, 192 * SCALE), Image.LANCZOS)
    img.save(OUT + 'bg-%s.webp' % name, quality=86); bgw[name] = img.width
    col = lambda y: '#%02x%02x%02x' % tuple(int(v) for v in np.median(arr[min(y, arr.shape[0] - 1), 200:2400], axis=0))
    ground[name] = {'walkHi': col(sl + 4), 'walk': col(sl + 22), 'curb': col(sl + 90)}
    print('bg', name, 'street line', sl, 'width', img.width)
meta['bgw'] = bgw; meta['ground'] = ground

# ---- story scenes: 5:3, like Chapter 1 ----
for name in ['scene-c2-open1', 'scene-c2-open2', 'scene-c2-end1', 'scene-c2-end2']:
    src = name if os.path.exists(SRC + name + '.png') else name + '-v1'
    arr = raw(src).astype(np.uint8); H, W = arr.shape[:2]
    w = round(H * 5 / 3); h = H; y0 = 0
    if w > W: w = W; h = round(W * 3 / 5); y0 = (H - h) // 2
    x0 = (W - w) // 2
    Image.fromarray(arr[y0:y0 + h, x0:x0 + w]).resize((320 * SCALE, 192 * SCALE), Image.LANCZOS).save(OUT + name + '.webp', quality=85)
    print('scene', name, 'from', src)

# ---- sprites: enemies + THE CURATOR, cut from the green screen and packed into atlas2 ----
def figures(name, n_fig, min_bottom=0.6):
    im = raw(name); H, W = im.shape[:2]; r, g, b = im[..., 0], im[..., 1], im[..., 2]
    fg = ~((g > 140) & (g - r > 60) & (g - b > 60))
    lab, k = ndimage.label(ndimage.binary_closing(fg, iterations=6))
    objs = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        n = int((lab[s] == i + 1).sum())
        if n > 20000 and s[0].stop > H * min_bottom: objs.append((n, s[1].start, s, i + 1))
    objs = sorted(sorted(objs, reverse=True)[:n_fig], key=lambda o: o[1])   # the biggest pieces are the figures; drop loose props
    out = []
    for _, _, s, i in objs:
        m = (lab[s] == i) & fg[s]
        o = np.zeros(m.shape + (4,), np.uint8); o[..., :3] = im[s]; o[..., 3] = m * 255
        # take the green spill off the edges
        rr, gg, bb = o[..., 0].astype(int), o[..., 1].astype(int), o[..., 2].astype(int)
        spill = (gg > rr) & (gg > bb); o[..., 1] = np.where(spill, np.maximum(rr, bb), gg)
        a = o[..., 3] > 0; ys = np.nonzero(a.any(1))[0]; xs = np.nonzero(a.any(0))[0]
        out.append(o[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1])
    return out

def scaled(f, k):
    w, h = max(1, round(f.shape[1] * k)), max(1, round(f.shape[0] * k))
    rgb = Image.fromarray(np.ascontiguousarray(f[..., :3])).resize((w, h), Image.LANCZOS)
    al = Image.fromarray(f[..., 3]).resize((w, h), Image.BOX).point(lambda v: 255 if v > 110 else 0)
    rgb.putalpha(al); return rgb

imgs = {}
for who in ['blogger', 'nerd', 'techbro']:
    fr = figures('enemy-' + who, 3)
    assert len(fr) == 3, (who, len(fr))
    k = 55 * SCALE / fr[0].shape[0]   # same height as the label's clones
    for tag, f in zip(['1', '2', 'Dead'], fr): imgs[who + tag] = scaled(f, k)
fr = figures('boss-curator', 4)
assert len(fr) == 4, ('curator', len(fr))
k = 60 * SCALE / fr[0].shape[0]
for tag, f in zip(['Idle', 'Attack', 'Hurt', 'Dead'], fr): imgs['curator' + tag] = scaled(f, k)

order = sorted(imgs, key=lambda n: -imgs[n].height); rects = {}; x = y = rowh = 0; MAXW = 2048
for n in order:
    i = imgs[n]
    if x + i.width > MAXW: x = 0; y += rowh + 2; rowh = 0
    rects[n] = [x, y, i.width, i.height]; x += i.width + 2; rowh = max(rowh, i.height)
atlas = Image.new('RGBA', (MAXW, y + rowh))
for n, r in rects.items(): atlas.paste(imgs[n], (r[0], r[1]))
atlas = atlas.crop((0, 0, max(r[0] + r[2] for r in rects.values()), y + rowh))
atlas.save(OUT + 'atlas2.png', optimize=True); meta['atlas2'] = rects
print('atlas2', atlas.size, {n: r[2:] for n, r in rects.items()})
json.dump(meta, open(SRC + 'meta2.json', 'w'))
