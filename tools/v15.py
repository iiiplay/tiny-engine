"""tiny-engine v1.5 驗收：Grid（碰撞 / BFS 距離場）、逐格動畫、Camera.push、Scene.syncState

測試邏輯寫在 demo/v15.html，這支只負責跑、印、截圖。
用法： python tools/v15.py [url]
"""
import os
import sys
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/v15.html'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'shots')
os.makedirs(OUT, exist_ok=True)

logs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 900, 'height': 640}, device_scale_factor=1)
    pg.on('pageerror', lambda e: logs.append('[pageerror] %s' % e))
    pg.on('console', lambda m: logs.append('[%s] %s' % (m.type, m.text)) if m.type == 'error' else None)
    pg.on('requestfailed', lambda r: logs.append('[fail] %s' % r.url))

    pg.goto(URL, wait_until='load')
    pg.wait_for_function("window.V15 && window.V15.cases && window.V15.cases.length > 0", timeout=20000)
    pg.wait_for_timeout(400)

    res = pg.evaluate("window.V15")
    print('引擎版本:', res['version'])
    for c in res['cases']:
        mark = '  ok  ' if c['ok'] else ' FAIL '
        print('%s%-40s %s' % (mark, c['name'], c['detail']))
    pg.screenshot(path=os.path.join(OUT, 'v15_grid.png'))
    print('pass %d / fail %d' % (res['pass'], res['fail']))
    b.close()

fatal = logs
print('--- console ---')
print('\n'.join(logs[:20]) or '(none)')

ok = (res['fail'] == 0) and not fatal
print('PASS' if ok else 'FAILED')
sys.exit(0 if ok else 1)
