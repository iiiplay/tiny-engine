# -*- coding: utf-8 -*-
"""Native pixel: 12 forest hero sheets + 12 slime files + dir4.png.
Hero r2 palette/outline/eyes/leaf cloak. Not a downscale, not third-party base.
"""
from PIL import Image
import hashlib
import os

OUT = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(OUT)
PREV = os.path.join(PKG, "preview")
FOREST = os.path.join(OUT, "forest-sprites")

PAL = {
    ".": None,
    "O": (47, 29, 17, 255),
    "H": (67, 41, 24, 255),
    "h": (113, 72, 42, 255),
    "S": (250, 209, 157, 255),
    "E": (8, 0, 0, 255),
    "C": (16, 58, 62, 255),
    "c": (28, 110, 96, 255),
    "V": (168, 220, 170, 255),
    "N": (120, 200, 150, 255),
    "T": (105, 65, 39, 255),
    "t": (57, 35, 21, 255),
    "F": (67, 41, 24, 255),
    "L": (255, 229, 80, 255),
    "G": (232, 176, 48, 255),
    "M": (40, 140, 88, 255),   # slime mid
    "m": (22, 88, 58, 255),    # slime dark
    "W": (180, 230, 170, 255), # slime highlight
    "B": (12, 40, 32, 255),    # slime outline-ish fill
}
GRASS = (37, 67, 55, 255)
LRGB, GRGB = PAL["L"][:3], PAL["G"][:3]

DOWN_BODY = [
    "....HHHH........",
    "...HhhhhH.......",
    "...HhhhhH.......",
    "...HhSSSh.......",
    "...HSESEH.......",
    "....hSSh........",
    "....cVVc........",
    "..NccVVccN......",
    "NVccTtccVN......",
    ".NccTttTccN.....",
    "..NcTttTVc......",
    "...NTTCCcN......",
]
UP_BODY = [
    "....HHHH........",
    "...HhhhhH.......",
    "...HhhhhH.......",
    "...HhhhhH.......",
    "....HHHH........",
    "....cNNc........",
    "..NccVVccN......",
    "NVccccccVN......",
    ".NcccVVccN......",
    "..NccCCccN......",
    "...NccccN.......",
    "....NTTN........",
]
SIDE_BODY = [
    ".....HHHH.......",
    "....HhhhhH......",
    "....Hhhhh.......",
    "....HhSSh.......",
    "....hSESh.......",
    ".....hSS........",
    "....cVVc........",
    "...NccVcN.......",
    "..NVcTtVN.......",
    "...NcTtN........",
    "....NTTN........",
    ".....TT.........",
]

LEGS_WALK = {
    0: ["...T......T.....", "...F......F.....", "..FF.....FF.....", "..FF.....FF....."],
    1: ["...F...TT.......", "...F....F.......", "........FF......", "........FF......"],
    2: ["..T......T......", "..F......F......", ".FF.....FF......", ".FF.....FF......"],
    3: ["....TT...F......", "....F....F......", "...FF...........", "...FF..........."],
    4: ["...T......T.....", "...F......F.....", "..FF.....FF.....", "..FF.....FF....."],
    5: ["...F...TT.......", "...F....F.......", "........FF......", "........FF......"],
}
LEGS_IDLE = {
    i: ["....T....T......", "....F....F......", "...FF...FF......", "...FF...FF......"]
    for i in range(6)
}
BOB = {1, 4}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def save(im, rel):
    path = os.path.join(OUT, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "PNG")
    print(rel, im.size, sha(path))
    return path, sha(path)


def put(px, x, y, col, w=None, h=None):
    if col is None:
        return
    if w is None:
        w, h = 10**9, 10**9
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = col


def paint_ascii(im, ox, oy, rows, w=None, h=None):
    px = im.load()
    iw, ih = im.size
    if w is None:
        w, h = iw, ih
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            col = PAL.get(ch)
            if col:
                xx, yy = ox + x, oy + y
                if 0 <= xx < iw and 0 <= yy < ih:
                    px[xx, yy] = col


def outline_box(im, x0, y0, x1, y1):
    px = im.load()
    add = []
    skip = (LRGB, GRGB)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if px[x, y][3] == 0:
                continue
            if px[x, y][:3] in skip:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if x0 <= nx < x1 and y0 <= ny < y1 and px[nx, ny][3] == 0:
                    add.append((nx, ny))
    for x, y in add:
        if px[x, y][3] == 0:
            px[x, y] = PAL["O"]


def lantern(im, ox, oy, lx, ly):
    px = im.load()
    w, h = im.size
    cores = [(lx, ly), (lx + 1, ly), (lx, ly + 1), (lx + 1, ly + 1)]
    halo = []
    for x, y in cores:
        for hx, hy in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (hx, hy) not in cores:
                halo.append((hx, hy))
    for x, y in halo:
        ax, ay = ox + x, oy + y
        if 0 <= ax < w and 0 <= ay < h:
            px[ax, ay] = PAL["G"]
    for x, y in cores:
        ax, ay = ox + x, oy + y
        if 0 <= ax < w and 0 <= ay < h:
            px[ax, ay] = PAL["L"]


def hero_16(facing, kind, frame):
    """16x16 cell. kind: idle|walk|dir. facing: down|left|up|right."""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    bob = 1 if (kind != "idle" and frame in BOB) else (1 if (kind == "idle" and frame in (2, 5)) else 0)
    if facing == "up":
        body = UP_BODY
    elif facing in ("left", "right"):
        body = SIDE_BODY
    else:
        body = DOWN_BODY
    legs = LEGS_IDLE[frame] if kind == "idle" else LEGS_WALK[frame]
    paint_ascii(im, 0, bob, body)
    paint_ascii(im, 0, 12, legs)
    # lantern on the sprite's right; left-facing is a full flip so it leads.
    if facing == "up":
        lx, ly = 7, max(8, 10 + bob - (1 if frame in (1, 4) else 0))
        dx = 0
    else:
        lx, ly = 12, 7 + bob
        dx = [0, -1, 1, 0, -1, 1][frame]
    lantern(im, 0, 0, lx + dx, ly)
    outline_box(im, 0, 0, 16, 16)
    if facing == "left":
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im


def sheet_from_cells(cells, fw, fh):
    n = len(cells)
    im = Image.new("RGBA", (fw * n, fh), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        if c.size != (fw, fh):
            canvas = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
            # paste keeping feet: align bottom of 16px sprite to foot-1
            canvas.paste(c, ((fw - c.size[0]) // 2, 0), c)
            c = canvas
        im.paste(c, (i * fw, 0), c)
    return im


def idle_sheet(facing):
    cells = [hero_16(facing, "idle", i) for i in range(6)]
    return sheet_from_cells(cells, 16, 16)


def walk_sheet(facing):
    # 96x17, foot=16 → 16px hero in rows 0-15, extra row 16 empty
    cells16 = [hero_16(facing, "walk", i) for i in range(6)]
    cells = []
    for c in cells16:
        canvas = Image.new("RGBA", (16, 17), (0, 0, 0, 0))
        canvas.paste(c, (0, 0), c)
        cells.append(canvas)
    return sheet_from_cells(cells, 16, 17)


def attack_cell(facing, frame, fw, fh, foot):
    im = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    base = hero_16(facing, "walk", frame)
    # place so feet sit on row foot-1
    bx = (fw - 16) // 2
    by = (foot - 16)
    if by < 0:
        by = 0
    im.paste(base, (bx, by), base)
    # strike: lantern extra in facing
    strike = frame  # 0 windup .. 5 recover
    extra = min(frame, 5 - frame)  # 0,1,2,2,1,0
    if facing == "down":
        lantern(im, 0, 0, bx + 12, by + 12 + extra)
    elif facing == "up":
        lantern(im, 0, 0, bx + 7, max(0, by - extra))
    elif facing == "left":
        lantern(im, 0, 0, max(0, bx + 1 - extra), by + 8)
    else:
        lantern(im, 0, 0, min(fw - 2, bx + 12 + extra), by + 8)
    outline_box(im, 0, 0, fw, fh)
    return im


def attack_sheet(facing):
    specs = {
        "down": (23, 23, 16),
        "left": (16, 21, 16),
        "right": (16, 21, 16),
        "up": (23, 18, 18),
    }
    fw, fh, foot = specs[facing]
    cells = [attack_cell(facing, i, fw, fh, foot) for i in range(6)]
    return sheet_from_cells(cells, fw, fh)


def dir4():
    # 64x64, rows: down, left, up, right; 4 frames walk-like
    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    order = ["down", "left", "up", "right"]
    for r, facing in enumerate(order):
        for f in range(4):
            cell = hero_16(facing, "walk", f)
            im.paste(cell, (f * 16, r * 16), cell)
    return im


# --- slimes: 5 unique, copied onto 12 paths like original pairing ---
SLIME_A = [  # rest
    "................",
    "................",
    "......mmmm......",
    "....mmMMMMmm....",
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
SLIME_B = [  # squat
    "................",
    "................",
    "................",
    ".....mmmmmm.....",
    "...mmMMMMMMmm...",
    "..mMMMEMEMMMm...",
    "..mMMMMMMMMMm...",
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
SLIME_C = [  # stretch
    "................",
    "......mmmm......",
    "....mmMMMMmm....",
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
SLIME_D = [  # run lean left
    "................",
    "................",
    "....mmmm........",
    "..mmMMMMmm......",
    ".mMMMMMMMMm.....",
    ".mMMEMEMMMm.....",
    ".mMMMMMMMMm.....",
    "..mMMMMMMm......",
    "...mmmmmm.......",
    "....m...m.......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
]
SLIME_E = [  # run lean right
    "................",
    "................",
    "........mmmm....",
    "......mmMMMMmm..",
    ".....mMMMMMMMMm.",
    ".....mMMEMEMMMm.",
    ".....mMMMMMMMMm.",
    "......mMMMMMMm..",
    ".......mmmmmm...",
    ".......m...m....",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
]


def slime_img(rows):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    paint_ascii(im, 0, 0, rows)
    outline_box(im, 0, 0, 16, 16)
    return im


def nearest_strip(images, scale, bg):
    pad, gap = 8, 6
    bigs = [im.resize((im.size[0] * scale, im.size[1] * scale), Image.NEAREST) for im in images]
    w = pad * 2 + sum(b.size[0] for b in bigs) + gap * (len(bigs) - 1)
    h = pad * 2 + max(b.size[1] for b in bigs)
    canvas = Image.new("RGBA", (w, h), bg)
    x = pad
    for b in bigs:
        canvas.paste(b, (x, pad + (max(bb.size[1] for bb in bigs) - b.size[1])), b)
        x += b.size[0] + gap
    return canvas


def main():
    os.makedirs(FOREST, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    hashes = {}

    facings = ["down", "left", "right", "up"]
    hero_first = []
    for d in facings:
        im = idle_sheet(d)
        p, h = save(im, "forest-sprites/hero-idle-%s.png" % d)
        hashes[p] = h
        hero_first.append(im.crop((0, 0, 16, 16)))
        assert im.size == (96, 16), im.size
    for d in facings:
        im = walk_sheet(d)
        p, h = save(im, "forest-sprites/hero-walk-%s.png" % d)
        hashes[p] = h
        assert im.size == (96, 17), im.size
    sizes = {
        "down": (138, 23),
        "left": (96, 21),
        "right": (96, 21),
        "up": (138, 18),
    }
    for d in facings:
        im = attack_sheet(d)
        p, h = save(im, "forest-sprites/hero-attack-%s.png" % d)
        hashes[p] = h
        assert im.size == sizes[d], (d, im.size, sizes[d])

    A, B, C, D, E = [slime_img(r) for r in (SLIME_A, SLIME_B, SLIME_C, SLIME_D, SLIME_E)]
    slime_map = {
        "slime-idle-0.png": A, "slime-idle-1.png": A,
        "slime-idle-2.png": B, "slime-idle-3.png": B,
        "slime-idle-4.png": C, "slime-idle-5.png": C,
        "slime-run-0.png": B, "slime-run-1.png": B,
        "slime-run-2.png": D, "slime-run-3.png": D,
        "slime-run-4.png": E, "slime-run-5.png": E,
    }
    slime_preview = []
    for name, im in slime_map.items():
        p, h = save(im, "forest-sprites/" + name)
        hashes[p] = h
        assert im.size == (16, 16)
        slime_preview.append(im)

    d4 = dir4()
    p, h = save(d4, "dir4.png")
    hashes[p] = h
    assert d4.size == (64, 64), d4.size

    # previews
    idle_row = nearest_strip(
        [Image.open(os.path.join(FOREST, "hero-idle-%s.png" % d)).crop((0, 0, 16, 16)) for d in facings],
        8, GRASS,
    )
    idle_row.save(os.path.join(PREV, "forest-hero-idle-4dir-x8.png"))
    walk_row = nearest_strip(
        [Image.open(os.path.join(FOREST, "hero-walk-%s.png" % d)) for d in facings],
        2, GRASS,
    )
    walk_row.save(os.path.join(PREV, "forest-hero-walk-4dir-x2.png"))
    atk_row = nearest_strip(
        [Image.open(os.path.join(FOREST, "hero-attack-%s.png" % d)) for d in facings],
        2, (24, 28, 32, 255),
    )
    atk_row.save(os.path.join(PREV, "forest-hero-attack-4dir-x2.png"))
    slime_row = nearest_strip([A, B, C, D, E], 8, GRASS)
    slime_row.save(os.path.join(PREV, "slime-5unique-x8.png"))
    d4p = d4.resize((256, 256), Image.NEAREST)
    bg = Image.new("RGBA", (256 + 16, 256 + 16), GRASS)
    bg.paste(d4p, (8, 8), d4p)
    bg.save(os.path.join(PREV, "dir4-x4-on-grass.png"))
    print("preview idle", idle_row.size)
    print("preview walk", walk_row.size)
    print("preview atk", atk_row.size)
    print("preview slime", slime_row.size)
    print("preview dir4", bg.size)


if __name__ == "__main__":
    main()
