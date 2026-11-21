# -*- coding: utf-8 -*-
"""Native pixel forest props + slot 7. Original sizes from 替換映射.
Not downscaled, not third-party PNG as edit base.
"""
from PIL import Image, ImageDraw
import hashlib
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(OUT_DIR)
PREV = os.path.join(PKG, "preview")
FOREST = os.path.join(OUT_DIR, "forest-sprites")
SLOT = os.path.join(OUT_DIR, "slot")

O = (47, 29, 17, 255)
TEAL_D = (16, 58, 62, 255)
TEAL = (28, 110, 96, 255)
TEAL_L = (120, 200, 150, 255)
VEIN = (168, 220, 170, 255)
TRUNK = (105, 65, 39, 255)
TRUNK_D = (57, 35, 21, 255)
ROCK = (120, 108, 92, 255)
ROCK_L = (168, 156, 138, 255)
DIRT = (92, 70, 48, 255)
DIRT_L = (122, 94, 64, 255)
DIRT_D = (64, 48, 32, 255)
GOLD = (255, 229, 80, 255)
GOLD_D = (232, 176, 48, 255)
JADE = (48, 180, 120, 255)
JADE_L = (160, 230, 180, 255)
RUBY = (196, 48, 56, 255)
RUBY_L = (232, 120, 110, 255)
HEART = (200, 40, 70, 255)
HEART_L = (240, 120, 130, 255)
WOOD = (138, 86, 42, 255)
WOOD_D = (88, 54, 26, 255)
METAL = (180, 186, 198, 255)
METAL_D = (90, 96, 110, 255)
GRASS_TILE = (42, 86, 58, 255)
GRASS_TUFT = (58, 120, 72, 255)
FLOWER = (232, 90, 120, 255)
FLOWER_C = (255, 220, 80, 255)
KEY = (220, 190, 70, 255)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def save(im, rel):
    path = os.path.join(OUT_DIR, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "PNG")
    print(rel, im.size, sha(path))
    return path


def outline_rgba(im):
    px = im.load()
    w, h = im.size
    add = []
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
            px[x, y] = O
    return im


def blob(im, cx, cy, rx, ry, fill):
    d = ImageDraw.Draw(im)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)


def tree():
    im = Image.new("RGBA", (48, 54), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([21, 32, 26, 52], fill=TRUNK)
    d.rectangle([22, 32, 24, 52], fill=TRUNK_D)
    for cx, cy, r in ((24, 18, 14), (16, 22, 10), (32, 22, 10), (24, 10, 9)):
        blob(im, cx, cy, r, r - 1, TEAL)
    px = im.load()
    for y in range(54):
        for x in range(48):
            if px[x, y][:3] == TEAL[:3]:
                if (x + y * 3) % 7 == 0:
                    px[x, y] = TEAL_L
                elif (x * 2 + y) % 11 == 0:
                    px[x, y] = VEIN
                elif (x + y) % 13 == 0:
                    px[x, y] = TEAL_D
    return outline_rgba(im)


def rock():
    im = Image.new("RGBA", (15, 15), (0, 0, 0, 0))
    blob(im, 7, 8, 6, 5, ROCK)
    px = im.load()
    for x, y in ((5, 6), (8, 5), (9, 8)):
        if px[x, y][3]:
            px[x, y] = ROCK_L
    return outline_rgba(im)


def bush():
    im = Image.new("RGBA", (15, 13), (0, 0, 0, 0))
    blob(im, 7, 7, 6, 5, TEAL)
    blob(im, 4, 8, 4, 3, TEAL_D)
    px = im.load()
    for x, y in ((5, 5), (9, 6), (7, 4), (10, 8)):
        if 0 <= x < 15 and 0 <= y < 13 and px[x, y][3]:
            px[x, y] = VEIN
    return outline_rgba(im)


def grass():
    im = Image.new("RGBA", (16, 16), GRASS_TILE)
    px = im.load()
    for y in range(16):
        for x in range(16):
            if (x + y * 2) % 5 == 0:
                px[x, y] = GRASS_TUFT
            elif (x * 3 + y) % 8 == 0:
                px[x, y] = TEAL_D
    return im  # fully opaque, no outline required


def flower():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y in range(9, 16):
        px[8, y] = TEAL
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        px[8 + dx, 7 + dy] = FLOWER
    px[8, 7] = FLOWER_C
    return outline_rgba(im)


def seed_orb():
    im = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
    blob(im, 3, 3, 2, 2, JADE)
    px = im.load()
    px[3, 3] = JADE_L
    px[2, 2] = GOLD
    return outline_rgba(im)


def dirt_tileset():
    im = Image.new("RGBA", (80, 64), (0, 0, 0, 0))
    px = im.load()
    for ty in range(4):
        for tx in range(5):
            ox, oy = tx * 16, ty * 16
            for y in range(16):
                for x in range(16):
                    v = (x * 3 + y * 5 + tx * 7 + ty * 11) % 5
                    if v == 0:
                        col = DIRT_L
                    elif v == 1:
                        col = DIRT_D
                    else:
                        col = DIRT
                    if tx == 1 and ty == 0:
                        # used crop (16,0,16,16): pebble path
                        if (x + y) % 4 == 0:
                            col = ROCK
                        elif (x * 2 + y) % 6 == 0:
                            col = ROCK_L
                    px[ox + x, oy + y] = col
    return im


def coin():
    im = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
    px = im.load()
    for y in range(1, 4):
        for x in range(1, 4):
            px[x, y] = GOLD
    px[2, 2] = GOLD_D
    return outline_rgba(im)


def ruby():
    im = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
    blob(im, 3, 3, 2, 2, RUBY)
    px = im.load()
    px[3, 2] = RUBY_L
    return outline_rgba(im)


def heart():
    im = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
    px = im.load()
    for x, y in ((1, 2), (2, 1), (3, 2), (4, 1), (5, 2),
                 (1, 3), (2, 3), (3, 3), (4, 3), (5, 3),
                 (2, 4), (3, 4), (4, 4), (3, 5)):
        px[x, y] = HEART
    px[2, 2] = HEART_L
    px[4, 2] = HEART_L
    return outline_rgba(im)


def chest():
    im = Image.new("RGBA", (96, 16), (0, 0, 0, 0))
    px = im.load()
    # 6 frames: closed → lid up → open gold
    lids = [0, 2, 3, 4, 5, 6]
    for i in range(6):
        ox = i * 16
        # box
        for y in range(8, 15):
            for x in range(2, 14):
                px[ox + x, y] = WOOD if y < 14 else WOOD_D
        for x in range(2, 14):
            px[ox + x, 14] = WOOD_D
        lift = lids[i]
        # lid
        ly = 8 - lift
        for y in range(max(ly, 0), max(ly, 0) + 3):
            if y >= 16:
                continue
            for x in range(2, 14):
                if 0 <= y < 16:
                    px[ox + x, y] = WOOD_D if y == ly else WOOD
        # lock / gold
        if i == 0:
            px[ox + 7, 10] = GOLD
            px[ox + 8, 10] = GOLD
        else:
            for y in range(10, 13):
                for x in range(6, 10):
                    px[ox + x, y] = GOLD if i >= 3 else GOLD_D
            if i >= 4:
                px[ox + 7, 9] = GOLD
                px[ox + 8, 9] = GOLD
    return outline_rgba(im)


def wild_sword():
    im = Image.new("RGBA", (7, 14), (0, 0, 0, 0))
    px = im.load()
    for y in range(1, 10):
        px[3, y] = METAL
    px[3, 0] = METAL
    px[2, 9] = METAL_D
    px[4, 9] = METAL_D
    for x in range(1, 6):
        px[x, 10] = GOLD_D
    px[3, 11] = TRUNK
    px[3, 12] = TRUNK
    return outline_rgba(im)


def scatter_key():
    im = Image.new("RGBA", (9, 6), (0, 0, 0, 0))
    px = im.load()
    # ring
    for x, y in ((1, 1), (2, 0), (3, 0), (4, 1), (2, 2), (3, 2), (1, 2), (4, 2)):
        px[x, y] = KEY
    px[2, 1] = GOLD
    # shaft
    for x in range(4, 8):
        px[x, 1] = KEY
    px[7, 2] = KEY
    px[7, 3] = KEY
    px[6, 3] = KEY
    return outline_rgba(im)


def contact_preview(paths):
    """4x nearest strip on dark, homemade, not third-party."""
    imgs = []
    for p in paths:
        im = Image.open(p)
        imgs.append((os.path.basename(p), im))
    pad, scale, gap = 8, 4, 6
    # row of items; chest is wide
    widths = [im.size[0] * scale for _, im in imgs]
    heights = [im.size[1] * scale for _, im in imgs]
    cw = pad * 2 + sum(widths) + gap * (len(imgs) - 1)
    ch = pad * 2 + max(heights)
    canvas = Image.new("RGBA", (cw, ch), (24, 28, 32, 255))
    x = pad
    for (name, im), w, h in zip(imgs, widths, heights):
        big = im.resize((w, h), Image.NEAREST)
        canvas.paste(big, (x, pad + (max(heights) - h)), big)
        x += w + gap
    return canvas


def main():
    os.makedirs(FOREST, exist_ok=True)
    os.makedirs(SLOT, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    seed = seed_orb()
    jobs = [
        ("forest-sprites/tree.png", tree()),
        ("forest-sprites/rock.png", rock()),
        ("forest-sprites/bush.png", bush()),
        ("forest-sprites/grass.png", grass()),
        ("forest-sprites/flower.png", flower()),
        ("forest-sprites/seed.png", seed),
        ("forest-sprites/dirt.png", dirt_tileset()),
        ("slot/coin.png", coin()),
        ("slot/jade.png", seed.copy()),
        ("slot/ruby.png", ruby()),
        ("slot/heart.png", heart()),
        ("slot/chest.png", chest()),
        ("slot/wild.png", wild_sword()),
        ("slot/scatter.png", scatter_key()),
    ]
    paths = []
    for rel, im in jobs:
        paths.append(save(im, rel))
    # jade == seed like original duplicate
    prev = contact_preview([
        os.path.join(FOREST, "tree.png"),
        os.path.join(FOREST, "rock.png"),
        os.path.join(FOREST, "bush.png"),
        os.path.join(FOREST, "grass.png"),
        os.path.join(FOREST, "flower.png"),
        os.path.join(FOREST, "seed.png"),
        os.path.join(SLOT, "coin.png"),
        os.path.join(SLOT, "jade.png"),
        os.path.join(SLOT, "ruby.png"),
        os.path.join(SLOT, "heart.png"),
        os.path.join(SLOT, "wild.png"),
        os.path.join(SLOT, "scatter.png"),
        os.path.join(SLOT, "chest.png"),
    ])
    prev_path = os.path.join(PREV, "props-slot-r2-x4.png")
    prev.save(prev_path, "PNG")
    print("preview", prev.size, sha(prev_path))
    dirt_cell = Image.open(os.path.join(FOREST, "dirt.png")).crop((16, 0, 32, 16))
    dc = os.path.join(PREV, "dirt-used-cell-x8.png")
    dirt_cell.resize((128, 128), Image.NEAREST).save(dc, "PNG")
    print("dirt-cell", dirt_cell.size, sha(dc))


if __name__ == "__main__":
    main()
