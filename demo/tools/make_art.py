"""產生 demo 用的精靈表（程式畫的，沒有第三方素材授權問題）
輸出 demo/assets/hero.png：96x16 = 6 格 x 16x16（走近動畫，腳底對齊 foot=16）
"""
import os
from PIL import Image, ImageDraw

W, H, FRAMES = 16, 16, 6
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'hero.png')

OUTLINE = (20, 24, 46, 255)
BODY = (120, 210, 255, 255)
BODY_DARK = (70, 150, 210, 255)
FACE = (255, 248, 231, 255)
EYE = (20, 24, 46, 255)

img = Image.new('RGBA', (W * FRAMES, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

for i in range(FRAMES):
    # 上下彈跳（0,-1,0,1,0,-1）
    bob = [0, -1, 0, 1, 0, -1][i]
    x0 = i * W
    top = 3 + bob
    # 身體（圓角方塊）
    d.rounded_rectangle([x0 + 4, top, x0 + 11, top + 9], radius=3, fill=BODY, outline=OUTLINE)
    # 下方暗面
    d.rectangle([x0 + 5, top + 7, x0 + 10, top + 8], fill=BODY_DARK)
    # 眼睛
    d.rectangle([x0 + 6, top + 4, x0 + 6, top + 5], fill=EYE)
    d.rectangle([x0 + 9, top + 4, x0 + 9, top + 5], fill=EYE)
    # 腳（左右交替）
    footY = top + 10
    if i % 2 == 0:
        d.rectangle([x0 + 5, footY, x0 + 6, footY + 1], fill=FACE, outline=OUTLINE)
        d.rectangle([x0 + 9, footY, x0 + 10, footY], fill=OUTLINE)
    else:
        d.rectangle([x0 + 5, footY, x0 + 6, footY], fill=OUTLINE)
        d.rectangle([x0 + 9, footY, x0 + 10, footY + 1], fill=FACE, outline=OUTLINE)

err = 16 - (top + 10 + 2)
if err:  # 貼齊腳底
    pass
img.save(OUT)
print('wrote', OUT, img.size)
