"""自動遊玩壓力測試：亂走 N 秒，檢查 JS 錯誤
用法： python tools/soak.py [秒數] [url]
"""
import random
import sys
import time
from playwright.sync_api import sync_playwright

SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 20
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8766/demo/'
KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD']

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1000, 'height': 640})
    errs = []
    pg.on('pageerror', lambda e: errs.append(f'[pageerror] {e}'))
    pg.on('console', lambda m: errs.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.on('requestfailed', lambda r: errs.append(f'[fail] {r.url}'))
    pg.goto(URL, wait_until='load')
    pg.wait_for_function("typeof Loop !== 'undefined' && Loop.renderCount > 0 && G.state !== 'loading'", timeout=20000)
    pg.keyboard.press('Enter')
    t0 = time.time()
    while time.time() - t0 < SECS:
        k = random.choice(KEYS)
        pg.keyboard.down(k)
        pg.wait_for_timeout(random.randint(100, 400))
        pg.keyboard.up(k)
        pg.wait_for_timeout(random.randint(50, 200))
    print('fps   :', pg.evaluate("typeof Loop !== 'undefined' ? Loop.fps : '?'"))
    print('state :', pg.evaluate("typeof G !== 'undefined' ? G.state : '?'"))
    print('errors:', errs[:10] or '(none)')
    b.close()

print('FAIL' if errs else 'PASS')
sys.exit(1 if errs else 0)
