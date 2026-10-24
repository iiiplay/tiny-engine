"""冒煙測試：載入 demo → 開始 → 移動 → F3 → 截圖，並收集 console 錯誤
用法： python tools/shot.py [url]
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots')
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1100, 'height': 700})
    logs = []
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.on('requestfailed', lambda r: logs.append(f'[fail] {r.url}'))

    pg.goto(URL, wait_until='load')
    pg.wait_for_function("typeof G !== 'undefined'", timeout=20000)
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, '1_title.png'))

    pg.keyboard.press('Enter')
    pg.wait_for_timeout(400)
    cam0 = pg.evaluate("typeof Camera !== 'undefined' ? Math.round(Camera.x) : -1")
    pg.keyboard.down('KeyD')
    pg.wait_for_timeout(900)
    pg.keyboard.up('KeyD')
    cam1 = pg.evaluate("typeof Camera !== 'undefined' ? Math.round(Camera.x) : -1")
    pg.keyboard.press('F3')
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, '2_play.png'))

    print('state      :', pg.evaluate("typeof G !== 'undefined' ? G.state : '?'"))
    print('camera.x   :', cam0, '->', cam1, '(捲動鏡頭)' if cam1 > cam0 else '')
    print('fps        :', pg.evaluate("typeof Loop !== 'undefined' ? Loop.fps : '?'"))
    print('--- console ---')
    print('\n'.join(logs[:20]) or '(none)')
    print('shots ->', OUT)
    b.close()
