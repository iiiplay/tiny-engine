"""效能驗證：跑 demo/bench.html（大地圖 + 大量 A* 實體），檢查 fps 與 render 成本
用法： python tools/bench.py [url]        預設 http://localhost:8766/demo/bench.html
CI 會用這個腳本把關（fps >= 45 才算過）
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/bench.html'
CASES = [
    ('中地圖 100 隻', '?n=100&cull=1&w=1600&h=1200'),
    ('大地圖 200 隻', '?n=200&cull=1&w=2400&h=1600'),
    ('大地圖 200 隻（關閉剔除）', '?n=200&cull=0&w=2400&h=1600'),
    ('超大地圖 400 隻', '?n=400&cull=1&w=3200&h=2000'),
]
MIN_FPS = 45

ok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1200, 'height': 720})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    for name, qs in CASES:
        pg.goto(BASE + qs, wait_until='load')
        pg.wait_for_function("window.__bench", timeout=30000)
        r = pg.evaluate("window.__bench")
        line = '%-24s fps %3d | render %5.2f ms | 同屏 %3d/%d | %s' % (
            name, r['fps'], r['renderMs'], r['visChasers'], r['n'], r['world'])
        flag = 'OK ' if r['fps'] >= MIN_FPS else 'LOW'
        if r['fps'] < MIN_FPS:
            ok = False
        print('%s %s' % (flag, line))
    print('errors:', errs[:5] or '(none)')
    b.close()

print('結果:', 'PASS' if ok else 'FAIL（有案例 fps < %d）' % MIN_FPS)
sys.exit(0 if ok else 1)
