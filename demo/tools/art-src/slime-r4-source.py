# -*- coding: utf-8 -*-
"""r4: slime 12 only. Blue-violet vs grass. Keep 1px outline + two eyes.
Idle bounce modest; run squash/stretch obvious. Pairing unchanged.
Does not rewrite forest hero sheets or dir4.
"""
from PIL import Image
import hashlib
import os
import shutil

OUT = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(OUT)
PREV = os.path.join(PKG, "preview")
FOREST = os.path.join(OUT, "forest-sprites")
KEEP = os.path.join(OUT, "slime-r3")

PAL = {
    ".": None,
    "O": (32, 14, 48, 255),     # dark purple outline
    "M": (118, 72, 196, 255),   # mid violet
    "m": (58, 32, 112, 255),    # dark violet
    "W": (186, 164, 232, 255),  # rim
    "E": (8, 0, 0, 255),
}
GRASS = (37, 67, 55, 255)  # #254337 playground homemade grass


def paint_ascii(im, rows):
    px = im.load()
    iw, ih = im.size
    for y, row in enumerate(rows):
        assert len(row) == 16, (y, len(row), row)
        for x, ch in enumerate(row):
            col = PAL.get(ch)
            if col:
                px[x, y] = col


def outline(im):
    px = im.load()
    add = []
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    add.append((nx, ny))
    for x, y in add:
        if px[x, y][3] == 0:
            px[x, y] = PAL["O"]


def slime_img(rows):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    paint_ascii(im, rows)
    outline(im)
    return im


# idle A rest — round, two eyes with mid between
SLIME_A = [
    "................",
    "................",
    "......mmmm......",
    "....mmMWWMmm....",
    "...mMMMMMMMMm...",
    "...mMMEMEMMMm...",
    "...mMMMMMMMMm...",
    "....mMMMMMMm....",
    ".....mmmmmm.....",
    "......m..m......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
]
# idle B slight squat
SLIME_B = [
    "................",
    "................",
    "................",
    ".....mmmmmm.....",
    "...mmMWWWWMmm...",
    "..mMMMMEMEMMMm..",
    "..mMMMMMMMMMMm..",
    "...mmMMMMMMmm...",
    ".....mmmmmm.....",
    "......m..m......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
]
# idle C slight stretch
SLIME_C = [
    "................",
    "......mmmm......",
    "....mmMWWMmm....",
    "...mMMMMMMMMm...",
    "...mMMEMEMMMm...",
    "...mMMMMMMMMm...",
    "....mMMMMMMm....",
    ".....mMMMMm.....",
    "......mmmm......",
    "......m..m......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
]
# run D squash — wide pancake, feet spread
SLIME_D = [
    "................",
    "................",
    "................",
    "................",
    "..mmmmmmmmmmmm..",
    ".mMWWWWWWWWWWMm.",
    ".mMMMMEMEMMMMMm.",
    ".mMMMMMMMMMMMMm.",
    "..mmmmmmmmmmmm..",
    "..m..........m..",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
]
# run E stretch — tall thin, lean right
SLIME_E = [
    "................",
    "........mm......",
    ".......mWWm.....",
    "......mMMMMm....",
    "......mMEMEMm...",
    ".....mMMMMMMm...",
    ".....mMMMMMm....",
    "......mMMMMm....",
    "......mMMMm.....",
    ".......mmm......",
    ".......m.m......",
    "................",
    "................",
    "................",
    "................",
    "................",
]


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def save(im, rel):
    path = os.path.join(PKG, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    return rel, sha(path), im.size


def nearest_strip(images, scale, bg):
    pad, gap = 8, 6
    bigs = [im.resize((im.size[0] * scale, im.size[1] * scale), Image.NEAREST) for im in images]
    w = pad * 2 + sum(b.size[0] for b in bigs) + gap * (len(bigs) - 1)
    h = pad * 2 + max(b.size[1] for b in bigs)
    canvas = Image.new("RGBA", (w, h), bg)
    x = pad
    mh = max(b.size[1] for b in bigs)
    for b in bigs:
        canvas.paste(b, (x, pad + (mh - b.size[1])), b)
        x += b.size[0] + gap
    return canvas


def keep_r3():
    os.makedirs(KEEP, exist_ok=True)
    names = [
        "slime-idle-%d.png" % i for i in range(6)
    ] + [
        "slime-run-%d.png" % i for i in range(6)
    ]
    for n in names:
        src = os.path.join(FOREST, n)
        dst = os.path.join(KEEP, n)
        if os.path.isfile(src) and not os.path.isfile(dst):
            shutil.copy2(src, dst)


def main():
    keep_r3()
    os.makedirs(PREV, exist_ok=True)
    hashes = {}
    A, B, C, D, E = [slime_img(r) for r in (SLIME_A, SLIME_B, SLIME_C, SLIME_D, SLIME_E)]
    slime_map = {
        "slime-idle-0.png": A, "slime-idle-1.png": A,
        "slime-idle-2.png": B, "slime-idle-3.png": B,
        "slime-idle-4.png": C, "slime-idle-5.png": C,
        "slime-run-0.png": B, "slime-run-1.png": B,
        "slime-run-2.png": D, "slime-run-3.png": D,
        "slime-run-4.png": E, "slime-run-5.png": E,
    }
    for name, im in slime_map.items():
        rel, h, sz = save(im, "raw/forest-sprites/" + name)
        hashes[rel] = h
        assert sz == (16, 16), (name, sz)
        # two 1px eyes: count E pixels
        e = sum(1 for p in im.getdata() if p[:3] == PAL["E"][:3] and p[3] == 255)
        assert e >= 2, (name, e)

    hashes["raw/slime-r4-source.py"] = sha(os.path.join(OUT, "slime-r4-source.py"))

    row8 = nearest_strip([A, B, C, D, E], 8, GRASS)
    p = os.path.join(PREV, "slime-r4-5unique-x8-on-grass.png")
    row8.save(p)
    hashes["preview/slime-r4-5unique-x8-on-grass.png"] = sha(p)

    # 12-file strip x4 on grass, labeled idle then run
    order = [
        A, A, B, B, C, C,
        B, B, D, D, E, E,
    ]
    row4 = nearest_strip(order, 4, GRASS)
    p = os.path.join(PREV, "slime-r4-12files-x4-on-grass.png")
    row4.save(p)
    hashes["preview/slime-r4-12files-x4-on-grass.png"] = sha(p)

    # keep hashes
    for n in slime_map:
        kp = os.path.join(KEEP, n)
        if os.path.isfile(kp):
            hashes["raw/slime-r3/" + n] = sha(kp)

    print("OK slimes", len(slime_map))
    for k, v in hashes.items():
        print(k, v)
    return hashes


if __name__ == "__main__":
    main()
