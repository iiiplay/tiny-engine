# -*- coding: utf-8 -*-
"""TinyEngine demo/assets/hero.png r2 — native 16x16 x 6 frames.
Keeps r1 files. Not a downscale of the 1024 style anchor.
Output: 96x16 RGBA, foot=16 (pixels on row y=15), transparent ground.
r2: two 1px eyes with skin between; frames 2/5 (1-based) 1px body bob;
lantern swing 1px; obvious foot alternate; teal-green leaf cloak vs grass.
"""
from PIL import Image
import hashlib
import os

W, H, FRAMES = 16, 16, 6
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(OUT_DIR)
PREV = os.path.join(PKG, "preview")

# Cloak teal-green, not playground grass #254337 and not r1 blue.
PAL = {
    ".": None,
    "O": (47, 29, 17, 255),       # #2F1D11 outline
    "H": (67, 41, 24, 255),       # #432918 hair dark
    "h": (113, 72, 42, 255),      # #71482A hair
    "A": (122, 79, 47, 255),      # #7A4F2F
    "S": (250, 209, 157, 255),    # #FAD19D skin
    "E": (8, 0, 0, 255),          # #080000 eye
    "C": (16, 58, 62, 255),       # #103A3E cloak dark teal
    "c": (28, 110, 96, 255),      # #1C6E60 cloak mid
    "V": (168, 220, 170, 255),    # #A8DCAA light vein
    "N": (120, 200, 150, 255),    # #78C896 leaf rim
    "T": (105, 65, 39, 255),      # #694127 tunic
    "t": (57, 35, 21, 255),       # #392315 tunic dark
    "F": (67, 41, 24, 255),       # boot
    "L": (255, 229, 80, 255),     # lantern 2x2
    "G": (232, 176, 48, 255),     # 1px glow
}
GRASS = (37, 67, 55, 255)  # #254337 homemade preview only

# Head y0-6. Eyes: two 1px with skin between (not EE mask).
BODY = [
    #  0123456789abcdef
    "....HHHH........",
    "...HhhhhH.......",
    "...HhhhhH.......",
    "...HhSSSh.......",
    "...HSESEH.......",  # E S E
    "....hSSh........",
    "....cVVc........",
    "..NccVVccN......",
    "NVccTtccVN......",
    ".NccTttTccN.....",
    "..NcTttTVc......",
    "...NTTCCcN......",
    "................",
    "................",
    "................",
    "................",
]

# 1-based frames 2 and 5 → indices 1, 4
BOB = {1, 4}

# Wide plant vs one-foot pass. y=15 always has planted boot.
LEGS = {
    0: [  # right plant, left back, wide
        "...T......T.....",
        "...F......F.....",
        "..FF.....FF.....",
        "..FF.....FF.....",
    ],
    1: [  # 第2格：left lifted, right plant
        "...F...TT.......",
        "...F....F.......",
        "........FF......",
        "........FF......",
    ],
    2: [  # left plant, right back
        "..T......T......",
        "..F......F......",
        ".FF.....FF......",
        ".FF.....FF......",
    ],
    3: [  # left plant, right lifted
        "....TT...F......",
        "....F....F......",
        "...FF...........",
        "...FF...........",
    ],
    4: [  # 第5格：right plant, left back (bob)
        "...T......T.....",
        "...F......F.....",
        "..FF.....FF.....",
        "..FF.....FF.....",
    ],
    5: [  # left lifted, right plant
        "...F...TT.......",
        "...F....F.......",
        "........FF......",
        "........FF......",
    ],
}

# lantern 2x2; dx front/back, dy bob on frames 2/5
LANTERN_BASE = (12, 7)
LANTERN_OFF = [
    (0, 0),
    (-1, 1),  # 第2格 後擺＋下沉
    (1, 0),   # 前擺
    (0, 1),
    (-1, 1),  # 第5格 後擺＋下沉
    (1, 0),   # 前擺
]


def paint_ascii(px, ox, rows, y0=0):
    for y, row in enumerate(rows):
        assert len(row) == 16, (y, len(row), row)
        yy = y0 + y
        if yy < 0 or yy >= H:
            continue
        for x, ch in enumerate(row):
            col = PAL.get(ch)
            if col:
                px[ox + x, yy] = col


def outline(im, ox):
    px = im.load()
    add = []
    skip = ((PAL["L"][0], PAL["L"][1], PAL["L"][2]),
            (PAL["G"][0], PAL["G"][1], PAL["G"][2]))
    for y in range(H):
        for x in range(ox, ox + W):
            if px[x, y][3] == 0:
                continue
            if px[x, y][:3] in skip:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if nx < ox or nx >= ox + W or ny < 0 or ny >= H:
                    continue
                if px[nx, ny][3] == 0:
                    add.append((nx, ny))
    for x, y in add:
        if px[x, y][3] == 0:
            px[x, y] = PAL["O"]


def paint_lantern(px, ox, dx, dy):
    lx, ly = LANTERN_BASE[0] + dx, LANTERN_BASE[1] + dy
    cores = [(lx, ly), (lx + 1, ly), (lx, ly + 1), (lx + 1, ly + 1)]
    halo = []
    for x, y in cores:
        for hx, hy in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (hx, hy) not in cores:
                halo.append((hx, hy))
    for x, y in halo:
        ax, ay = ox + x, y
        if 0 <= x < W and 0 <= ay < H:
            px[ax, ay] = PAL["G"]
    for x, y in cores:
        ax, ay = ox + x, y
        if 0 <= x < W and 0 <= ay < H:
            px[ax, ay] = PAL["L"]


def build():
    im = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0))
    px = im.load()
    for i in range(FRAMES):
        ox = i * W
        bob = 1 if i in BOB else 0
        paint_ascii(px, ox, BODY[:12], y0=bob)
        paint_ascii(px, ox, LEGS[i], y0=12)
        outline(im, ox)
        dx, dy = LANTERN_OFF[i]
        paint_lantern(px, ox, dx, dy)
        foot = sum(1 for x in range(W) if px[ox + x, 15][3])
        if foot < 2:
            raise SystemExit("frame %s missing feet on y=15" % i)
        lamp = sum(
            1
            for y in range(H)
            for x in range(W)
            if px[ox + x, y][:3] == PAL["L"][:3]
        )
        if lamp < 4:
            raise SystemExit("frame %s lantern cores %s" % (i, lamp))
        # two 1px eyes with skin between on the face row (y=4+bob)
        ey = 4 + bob
        eyes = [
            px[ox + x, ey][:3] == PAL["E"][:3]
            for x in range(W)
        ]
        if sum(eyes) != 2:
            raise SystemExit("frame %s eye count %s" % (i, sum(eyes)))
        eidx = [x for x, v in enumerate(eyes) if v]
        mid = (eidx[0] + eidx[1]) // 2
        if eidx[1] - eidx[0] != 2 or px[ox + mid, ey][:3] != PAL["S"][:3]:
            raise SystemExit("frame %s eyes not 1px with skin between" % i)
    return im


def preview_on_grass(sheet):
    scale = 2
    pad = 12
    sw, sh = sheet.size
    canvas = Image.new("RGBA", (sw * scale + pad * 2, sh * scale + pad * 2), GRASS)
    big = sheet.resize((sw * scale, sh * scale), Image.NEAREST)
    canvas.paste(big, (pad, pad), big)
    return canvas


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    os.makedirs(PREV, exist_ok=True)
    sheet = build()
    sheet_path = os.path.join(OUT_DIR, "hero-r2.png")
    sheet.save(sheet_path, "PNG")
    prev = preview_on_grass(sheet)
    prev_path = os.path.join(PREV, "hero-r2-x2-on-grass.png")
    prev.save(prev_path, "PNG")
    cells_dir = os.path.join(OUT_DIR, "hero-r2-cells")
    os.makedirs(cells_dir, exist_ok=True)
    for i in range(FRAMES):
        cell = sheet.crop((i * W, 0, (i + 1) * W, H))
        cell.save(os.path.join(cells_dir, "f%d.png" % i), "PNG")
        cell.resize((W * 8, H * 8), Image.NEAREST).save(
            os.path.join(cells_dir, "f%d@8x.png" % i), "PNG"
        )
    print("sheet", sheet.size, sha(sheet_path))
    print("preview", prev.size, sha(prev_path))
    for i in range(FRAMES):
        print("f%d" % i, sha(os.path.join(cells_dir, "f%d.png" % i)))


if __name__ == "__main__":
    main()
