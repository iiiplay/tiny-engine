"""tiny-engine v1.6 驗收：Level（JSON 關卡）／Edit（編輯器）／TE 命名空間／gen_manifest

跑法： python tools/v16.py [url]
前面幾項是 Python 端（gen_manifest、globals 掃描），後面是瀏覽器端的像素/行為測試。
"""
import json
import os
import struct
import subprocess
import sys
import tempfile
import zlib
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
def fixture_png(path, width=16, height=16):
    """用標準庫產生測試圖片，驗收不依賴其他遊戲或第三方素材。"""
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    raw = (b'\x00' + bytes([80, 160, 40, 255]) * width) * height
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


with tempfile.TemporaryDirectory(prefix='temf_') as tmp:
    src_dir = os.path.join(tmp, 'art')
    os.makedirs(os.path.join(src_dir, 'enemy'))
    fixture_png(os.path.join(src_dir, 'grass.png'))
    fixture_png(os.path.join(src_dir, 'arrow.png'))
    fixture_png(os.path.join(src_dir, 'enemy', 'Goblin_walk_right.png'), width=96)
    for i in range(4):
        fixture_png(os.path.join(src_dir, 'bomb_f%d.png' % i))
    out_js = os.path.join(tmp, 'manifest.gen.js')
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'gen_manifest.py'),
                        src_dir, '--fw', '16', '--out', out_js],
                       capture_output=True, text=True, encoding='utf-8',
                       env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
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

    # ---------------- Python 端：globals 掃描 ----------------
    print('== tools/globals.py')
    game_dir = os.path.join(tmp, 'game')
    os.makedirs(game_dir)
    game_js = os.path.join(game_dir, 'game.js')
    with open(game_js, 'w', encoding='utf-8') as f:
        f.write('const GameTest = {};\n')
    def scan_globals():
        return subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'globals.py'),
                               tmp, '--check', '--json'],
                              capture_output=True, text=True, encoding='utf-8')
    r = scan_globals()
    check('globals.py --check 對獨立測試專案是乾淨的', r.returncode, 0)
    data = json.loads(r.stdout)
    check_true('globals 掃到引擎保留名稱', data['engine'] > 40, data['engine'])
    check('測試專案沒有撞名', len(data['collisions']), 0)
    with open(game_js, 'w', encoding='utf-8') as f:
        f.write('const SHEETS = {};\n')
    r = scan_globals()
    check('故意撞名會回傳失敗', r.returncode, 1)
    check_true('故意撞名能指出 SHEETS', 'SHEETS' in json.loads(r.stdout)['collisions'])

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
fatal = logs
if fatal:
    print('FAILED: 有 %d 個頁面錯誤' % len(fatal))
    FAIL.append('頁面錯誤 / console.error / 資源載入失敗')
if FAIL:
    print('FAILED: ' + ', '.join(FAIL))
    sys.exit(1)
print('PASS')
