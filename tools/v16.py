"""tiny-engine v1.6 驗收：Level（JSON 關卡）／Edit（編輯器）／TE 命名空間／gen_manifest

跑法： python tools/v16.py [url]
前面幾項是 Python 端（gen_manifest、globals 掃描），後面是瀏覽器端的像素/行為測試。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/v16.html'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'shots')
os.makedirs(OUT, exist_ok=True)
FAIL = []


def check(name, got, want):
    ok = got == want
    print(('  ok  ' if ok else ' FAIL ') + f'{name}: {got}' + ('' if ok else f'（預期 {want}）'))
    if not ok:
        FAIL.append(name)


def check_true(name, got, detail=''):
    ok = bool(got)
    print(('  ok  ' if ok else ' FAIL ') + name + (f'（{detail}）' if detail else ''))
    if not ok:
        FAIL.append(name)


# ---------------- Python 端：gen_manifest ----------------
print('== tools/gen_manifest.py')
tmp = tempfile.mkdtemp(prefix='temf_')
src_dir = os.path.join(tmp, 'art')
os.makedirs(os.path.join(src_dir, 'enemy'), exist_ok=True)
src_dir2 = os.path.join(tmp, 'art')
# 借 tiny-keep 的素材（一格一張 + sheet 各一份）
keep = os.path.join(os.path.dirname(ROOT), 'tiny-keep', 'assets', 'pack', 'ta')
samples = [
    ('Other/Misc/Grass.png', 'grass.png'),
    ('Other/Items/Weapon/Arrow.png', 'arrow.png'),
    ('Enemies/Goblin/Walk/Goblin_walk_right.png', 'enemy/Goblin_walk_right.png'),
]
used_assets = all(os.path.exists(os.path.join(keep, s)) for s, _ in samples)
if used_assets:
    for rel, dst in samples:
        shutil.copyfile(os.path.join(keep, rel), os.path.join(src_dir, dst))
    # 造一組逐格動畫：bomb_f0..f3
    for i in range(4):
        shutil.copyfile(os.path.join(keep, 'Other/Misc/Flower_pink.png'),
                        os.path.join(src_dir, 'bomb_f%d.png' % i))
    out_js = os.path.join(tmp, 'manifest.gen.js')
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'gen_manifest.py'),
                        src_dir, '--fw', '16', '--out', out_js],
                       capture_output=True, text=True, encoding='utf-8')
    check('gen_manifest 正常結束', r.returncode, 0)
    js = open(out_js, encoding='utf-8').read() if os.path.exists(out_js) else ''
    check_true('有產出 SRC / ANIM / SHEET_DEF',
               'const SRC' in js and 'const ANIM' in js and 'const SHEET_DEF' in js)
    check_true('把 bomb_f0..f3 合成一組動畫', "'bomb'" in js or 'bomb: [' in js)
    check_true('sheet 認得 frames=6（Goblin 96px / 16）',
               'frames: 6' in js, js.count('frames: 6'))
    # 語法檢查
    r2 = subprocess.run(['node', '--check', out_js], capture_output=True, text=True)
    check('產出的 JS 語法正確', r2.returncode, 0)
else:
    print('  skip（找不到 tiny-keep 素材）')

# ---------------- Python 端：globals 掃描 ----------------
print('== tools/globals.py')
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'globals.py'),
                    os.path.join(os.path.dirname(ROOT), 'tiny-keep'), '--check', '--json'],
                   capture_output=True, text=True, encoding='utf-8')
check('globals.py --check 對 tiny-keep 是乾淨的', r.returncode, 0)
if r.stdout.strip().startswith('{'):
    data = json.loads(r.stdout)
    check_true('globals 掃到引擎保留名稱', data['engine'] > 40, data['engine'])
    check('tiny-keep 沒有撞名', len(data['collisions']), 0)

# ---------------- 瀏覽器端 ----------------
print('== demo/v16.html')
logs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 900, 'height': 640}, device_scale_factor=1)
    pg.on('pageerror', lambda e: logs.append('[pageerror] %s' % e))
    pg.on('console', lambda m: logs.append('[%s] %s' % (m.type, m.text)) if m.type == 'error' else None)
    pg.on('requestfailed', lambda r: logs.append('[fail] %s' % r.url))

    pg.goto(URL, wait_until='load')
    pg.wait_for_function("window.V16 && window.V16.cases && window.V16.cases.length > 0", timeout=20000)
    pg.wait_for_timeout(300)

    res = pg.evaluate("window.V16")
    for c in res['cases']:
        mark = '  ok  ' if c['ok'] else ' FAIL '
        print('%s%s' % (mark, c['name']) + ('' if c['ok'] else '  ← ' + c['detail']))
        if not c['ok']:
            FAIL.append(c['name'])

    # ---- 真的用滑鼠塗格子（編輯器）----
    def cell_pos(cx, cy):
        r = pg.evaluate("(() => { const r = G.canvas.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; })()")
        vw = pg.evaluate("GAME_W")
        vh = pg.evaluate("GAME_H")
        lx = 8 + cx * 16 + 8
        ly = 24 + cy * 16 + 8
        return (r['x'] + lx * r['w'] / vw, r['y'] + ly * r['h'] / vh)

    x, y = cell_pos(4, 4)
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.up()
    pg.wait_for_timeout(120)
    v = pg.evaluate("EDIT_LV.get(4, 4)")
    check('左鍵塗 → 變成目前選的格子（牆）', v, 1)

    # 選第 3 色 → 塗另一格
    pal = pg.evaluate("Edit.paletteRect(2)")
    r = pg.evaluate("(() => { const r = G.canvas.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; })()")
    vw = pg.evaluate("GAME_W")
    vh = pg.evaluate("GAME_H")
    pg.mouse.click(r['x'] + (pal['x'] + 10) * r['w'] / vw, r['y'] + (pal['y'] + 7) * r['h'] / vh)
    pg.wait_for_timeout(100)
    check('點色盤 → 選到第 3 色', pg.evaluate("Edit.sel"), 2)
    x2, y2 = cell_pos(2, 5)
    pg.mouse.click(x2, y2)
    pg.wait_for_timeout(100)
    check('換色後塗 → 變成 2（水）', pg.evaluate("EDIT_LV.get(2, 5)"), 2)

    # 右鍵擦
    x3, y3 = cell_pos(4, 4)
    pg.mouse.click(x3, y3, button='right')
    pg.wait_for_timeout(100)
    check('右鍵擦 → 回 0', pg.evaluate("EDIT_LV.get(4, 4)"), 0)

    # 拖曳可以連塗
    a = cell_pos(1, 6)
    bpt = cell_pos(5, 6)
    pg.mouse.move(*a)
    pg.mouse.down()
    for i in range(1, 5):
        pg.mouse.move(a[0] + (bpt[0] - a[0]) * i / 4, a[1])
        pg.wait_for_timeout(20)
    pg.mouse.up()
    pg.wait_for_timeout(100)
    row = pg.evaluate("(() => { let n = 0; for (let x = 1; x <= 5; x++) if (EDIT_LV.get(x, 6) === 2) n++; return n; })()")
    check('拖曳連塗一排', row, 5)

    # 復原
    pg.keyboard.press('Control+KeyZ')
    pg.wait_for_timeout(100)
    check_true('Ctrl+Z 有復原（那一排不見了）',
               pg.evaluate("(() => { let n = 0; for (let x = 1; x <= 5; x++) if (EDIT_LV.get(x, 6) === 2) n++; return n; })()") < 5)

    # 存檔
    pg.keyboard.press('KeyS')
    pg.wait_for_timeout(150)
    saved = pg.evaluate("(Save.get('v16-edit', null) || {}).cols")
    check('按 S 存到 localStorage', saved, 10)

    pg.screenshot(path=os.path.join(OUT, 'v16_edit.png'))
    b.close()

print('--- console ---')
print('\n'.join(logs[:20]) or '(none)')
fatal = [l for l in logs if l.startswith('[pageerror]') or l.startswith('[fail]')]
if fatal:
    print('FAILED: 有 %d 個頁面錯誤' % len(fatal))
if FAIL:
    print('FAILED: ' + ', '.join(FAIL))
    sys.exit(1)
print('PASS')
