# Chapter 3 (THE BOT FARMS) art, built the same way as Chapters 1-2. Run from the repo root: python3 art/batch4/build_ch3.py
# Reads art-src/batch4/*.png (Higgsfield), writes site/images/ (backgrounds, drive layers, scenes, atlas3.png) and art/batch4/meta3.json.
import json, os, numpy as np
from PIL import Image
from scipy import ndimage
SRC = 'art-src/batch4/'; OUT = 'site/images/'; SCALE = 4
meta = {}

def raw(name):
    p = SRC + name + '.png'
    return np.array(Image.open(p).convert('RGB')).astype(int)

def save(arr, w, h, path, q=86):
    Image.fromarray(np.ascontiguousarray(arr).astype(np.uint8)).resize((w, h), Image.LANCZOS).save(OUT + path, quality=q)

def street_line(arr, lo=0.72, hi=0.93):   # top edge of the floor (same test as Chapters 1-2)
    H = arr.shape[0]; e = (np.abs(np.diff(arr, axis=0)).sum(2) > 70).mean(1)
    a, b = int(H * lo), int(H * hi); seg = e[a:b]
    return a + int(np.nonzero(seg >= 0.85 * seg.max())[0][0]) + 1

# ---- side-scrolling backgrounds: the floor's top edge lands on game row 160 ----
FLOOR = {'blockparty': None, 'lafarm': None, 'houston': None, 'atlanta': None, 'nyc': None, 'throne': None}
FILES = {'blockparty': '00-bg-blockparty', 'lafarm': '04-bg-la-farm', 'houston': '05-bg-houston', 'atlanta': '06-bg-atlanta',
         'nyc': '08-bg-nyc-tunnels-fixed' if os.path.exists(SRC + '08-bg-nyc-tunnels-fixed.png') else '08-bg-nyc-tunnels', 'throne': '10-bg-throne'}
OVERRIDE = json.load(open('art/batch4/floor.json')) if os.path.exists('art/batch4/floor.json') else {}
bgw = {}
for name, f in FILES.items():
    arr = raw(f)
    sl = OVERRIDE.get(name) or street_line(arr); k = 160 / sl; need = round(192 / k)
    if arr.shape[0] < need: arr = np.concatenate([arr, np.repeat(arr[-1:], need - arr.shape[0], 0)])
    w = round(arr.shape[1] * k) * SCALE
    save(arr[:need], w, 192 * SCALE, 'bg-%s.webp' % name); bgw[name] = w
    print('bg', name, 'floor line', sl, 'width', w)
meta['bgw'] = bgw

# ---- the drive: a sky layer (rows above the road, slow) and a road layer (fast), both tiling seamlessly ----
def tileable(a, band):   # cross-fade the right edge into the left so the strip repeats without a seam
    a = a.astype(float); W = a.shape[1]; k = np.linspace(0, 1, band)[None, :, None]
    out = a[:, :W - band].copy(); out[:, :band] = a[:, :band] * k + a[:, W - band:] * (1 - k)
    return out
ROAD = {'desert': ('01-bg-desert', 860, 1376), 'la': ('03-bg-la-freeway', 878, 1368)}   # road edges found from the painted white lines
SKY = {'desert': ('01-bg-desert', 860), 'cajon': ('02-bg-cajon', 1029), 'la': ('03-bg-la-freeway', 878)}
drive = {}
for name, (f, top) in SKY.items():
    a = raw(f)[:top]; h = 106 * SCALE; w = round(a.shape[1] * h / top)
    a = tileable(a, 260); w = round(a.shape[1] * h / top)
    save(a, w, h, 'drv-sky-%s.webp' % name); drive['sky_' + name] = w
for name, (f, top, bot) in ROAD.items():   # road band -> game rows 106..182, plus 10 rows of shoulder below
    a = raw(f); shoulder = round((bot - top) * 10 / 76)
    a = tileable(a[top:bot + shoulder], 120); h = 86 * SCALE; w = round(a.shape[1] * (76 * SCALE) / (bot - top))
    save(a, w, h, 'drv-road-%s.webp' % name); drive['road_' + name] = w
meta['drive'] = drive

# ---- full-screen art: the airport (top-down, 2x the screen), the Machine World shaft ----
save(raw('07-bg-airport'), 640 * SCALE, 360 * SCALE, 'bg-airport.webp', 84)
save(raw('09-bg-machine-climb'), 1280, 720, 'bg-machine.webp', 84)

# ---- story scenes, 5:3 ----
for name, f in [('party', '24-scene-blockparty-500'), ('map', '20-scene-map'), ('ride', '25-scene-lowrider-500'), ('plane', '21-scene-plane'),
                ('down', '22-scene-botfather-down'), ('fans', '23-scene-fans')]:
    a = raw(f); H, W = a.shape[:2]; w = round(H * 5 / 3); x0 = (W - w) // 2
    save(a[:, x0:x0 + w], 320 * SCALE, 192 * SCALE, 'scene-c3-%s.webp' % name, 85)

# ---- sprites, cut from the green screen ----
def figures(name, n_fig, crop=None, min_px=20000, close=6, glass=None, line=False):
    im = raw(name)
    if crop: im = im[crop[0]:crop[1], crop[2]:crop[3]]
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    fg = ~((g > 140) & (g - r > 60) & (g - b > 60))
    if line: fg[fg.mean(1) > 0.97] = False   # the painted ground line under the cars
    lab, k = ndimage.label(ndimage.binary_closing(fg, iterations=close))
    objs = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        n = int((lab[s] == i + 1).sum())
        if n > min_px: objs.append((n, s, i + 1))
    objs = sorted(objs, key=lambda o: -o[0])[:n_fig]
    out = []
    for _, s, i in objs:
        m = (lab[s] == i) & fg[s]
        hole = ndimage.binary_fill_holes(m) & ~m if glass else None   # windows the green showed through
        if glass: m = m | hole
        o = np.zeros(m.shape + (4,), np.uint8); o[..., :3] = im[s]; o[..., 3] = m * 255
        rr, gg, bb = o[..., 0].astype(int), o[..., 1].astype(int), o[..., 2].astype(int)
        spill = (gg > rr) & (gg > bb) & (gg > 100); o[..., 1] = np.where(spill, np.maximum(rr, bb), gg)
        if glass: o[hole] = glass
        a = o[..., 3] > 0; ys = np.nonzero(a.any(1))[0]; xs = np.nonzero(a.any(0))[0]
        out.append((s[0].start + ys[0], s[1].start + xs[0], o[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]))
    return out

def rows(fs, gap=150):   # reading order: top row first, left to right
    fs = sorted(fs, key=lambda f: f[0]); out = []; line = []
    for f in fs:
        if line and f[0] - line[0][0] > gap: out += sorted(line, key=lambda q: q[1]); line = []
        line.append(f)
    return [f[2] for f in out + sorted(line, key=lambda q: q[1])]

def scaled(f, k):
    w, h = max(1, round(f.shape[1] * k)), max(1, round(f.shape[0] * k))
    rgb = Image.fromarray(np.ascontiguousarray(f[..., :3])).resize((w, h), Image.LANCZOS)
    al = Image.fromarray(f[..., 3]).resize((w, h), Image.BOX).point(lambda v: 255 if v > 110 else 0)
    rgb.putalpha(al); return rgb

imgs = {}
def put(names, frames, k):
    assert len(frames) == len(names), (names, len(frames))
    for n, f in zip(names, frames): imgs[n] = scaled(f, k)

# the top row has a blurred ghost behind it, so the cruise and crash frames come from the clean bottom row (the hop is drawn in code)
fr = [figures('11-spr-lowrider', 1, crop=(768, 1536, x, x + 1376), close=3, glass=(120, 160, 190, 255), line=True)[0][2] for x in (0, 1376)]
put(['car0', 'carCrash'], fr, 74 * SCALE / fr[0].shape[1])
fr = rows(figures('12-spr-obstacles', 6, min_px=4000), 300)          # pothole, rocks, cop, cop, bot SUV, cone
put(['pothole', 'rocks', 'cop', 'cop2', 'suv', 'cone'], fr, 64 * SCALE / fr[2].shape[1])
fr = rows(figures('13-spr-drone', 2, crop=(0, 1000, 0, 1700), glass=(30, 40, 50, 255)), 300)   # the beam glow below them is drawn in code
fr += [figures('13-spr-drone', 1, crop=(0, 1536, 1700, 2752))[0][2]]
put(['drone1', 'drone2', 'droneDead'], fr, 30 * SCALE / fr[0].shape[1])
fr = rows(figures('14-spr-botaccount', 3), 300)
put(['bot1', 'bot2', 'botDead'], fr, 52 * SCALE / fr[0].shape[0])
fr = rows(figures('15-spr-turret', 3), 300)
put(['rack', 'rackFire', 'rackDead'], fr, 46 * SCALE / fr[0].shape[0])
fr = figures('17-spr-rat-gator', 6, min_px=8000)
pizza = min(fr, key=lambda f: f[2].size)[2]; fr = sorted([f for f in fr if f[2] is not pizza], key=lambda f: f[1])
put(['rat1', 'rat2'], [f[2] for f in fr[:2]], 20 * SCALE / fr[0][2].shape[0])
put(['gatorEat', 'gatorShock', 'gatorRun'], [f[2] for f in fr[2:]], 50 * SCALE / fr[2][2].shape[0])
put(['pizza'], [pizza], 50 * SCALE / fr[2][2].shape[0])
fr = rows(figures('18-spr-botfather', 4), 300)
put(['bfIdle', 'bfPoint', 'bfHurt', 'bfDead'], fr, 74 * SCALE / fr[0].shape[0])
fr = rows(figures('19-spr-trinity', 3, close=2), 300)
put(['tri0', 'tri1', 'tri2'], fr, 40 * SCALE / fr[0].shape[0])
fr = figures('16-spr-guard', 48, min_px=3000, close=3)              # 4 rows: facing down, left, right, up
by = rows(fr, 120); assert len(by) == 48, len(by)
k = 40 * SCALE / max(f.shape[0] for f in by[:12])
for d, name in enumerate(['Down', 'Left', 'Right', 'Up']):
    for j in range(3): imgs['g%s%d' % (name, j)] = scaled(by[d * 12 + j], k)
hq = np.array(Image.open(OUT + 'hq-miles.png').convert('RGBA'))     # top-down Miles from the HQ, at airport size
for d, name in enumerate(['Down', 'Left', 'Right', 'Up']):
    for j in range(4):
        cell = hq[:, (d * 4 + j) * 100:(d * 4 + j + 1) * 100]; a = cell[..., 3] > 0; ys = np.nonzero(a.any(1))[0]; xs = np.nonzero(a.any(0))[0]
        cell = cell[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
        imgs['m%s%d' % (name, j)] = Image.fromarray(cell).resize((max(1, round(cell.shape[1] * 40 / 48)), max(1, round(cell.shape[0] * 40 / 48))), Image.LANCZOS)

order = sorted(imgs, key=lambda n: -imgs[n].height); rects = {}; x = y = rowh = 0; MAXW = 2048
for n in order:
    i = imgs[n]
    if x + i.width > MAXW: x = 0; y += rowh + 2; rowh = 0
    rects[n] = [x, y, i.width, i.height]; x += i.width + 2; rowh = max(rowh, i.height)
atlas = Image.new('RGBA', (MAXW, y + rowh))
for n, r in rects.items(): atlas.paste(imgs[n], (r[0], r[1]))
atlas.save(OUT + 'atlas3.png', optimize=True); meta['atlas3'] = rects
print('atlas3', atlas.size, {n: [round(v / 4) for v in r[2:]] for n, r in rects.items()})
json.dump(meta, open('art/batch4/meta3.json', 'w'))
