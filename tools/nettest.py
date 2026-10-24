"""區網 demo 端到端測試：兩個瀏覽器分頁（房主 + 加入端）
用法： python tools/nettest.py [url]     預設 http://localhost:8766/demo/net.html
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/net.html'
ok = True

with sync_playwright() as p:
    b = p.chromium.launch()
    host = b.new_context(viewport={'width': 900, 'height': 620}).new_page()
    peer = b.new_context(viewport={'width': 700, 'height': 520}).new_page()
    errs = []
    for name, pg in (('host', host), ('peer', peer)):
        pg.on('pageerror', lambda e, n=name: errs.append(f'[{n}] {e}'))
        pg.on('console', lambda m, n=name: errs.append(f'[{n}] {m.text}') if m.type == 'error' else None)
        pg.goto(URL, wait_until='load')
        pg.wait_for_function("typeof G !== 'undefined'", timeout=20000)
        pg.wait_for_timeout(500)

    host.keyboard.press('Digit1')
    host.wait_for_timeout(700)
    peer.keyboard.press('Digit2')
    peer.wait_for_timeout(1500)

    print('host ready   :', host.evaluate("Net.ready"), '| sent', host.evaluate("Net.sentCount"))
    print('peer snapshots:', peer.evaluate("Net.snapCount"), '| age', round(peer.evaluate("Net.snapAge") * 1000), 'ms')

    x0 = host.evaluate("Math.round(N.box.x)")
    peer.keyboard.down('ArrowRight')
    peer.wait_for_timeout(800)
    peer.keyboard.up('ArrowRight')
    x1 = host.evaluate("Math.round(N.box.x)")
    px = peer.evaluate("Math.round(N.box.x)")
    print(f'加入端按 → 房主端方塊 x: {x0} -> {x1}（要變大）｜加入端看到 x={px}')

    if not (x1 > x0 + 5):
        ok = False
        print('FAIL: 加入端的輸入沒有影響房主端')
    if peer.evaluate("Net.snapCount") < 10:
        ok = False
        print('FAIL: 加入端沒有收到快照')
    if errs:
        ok = False
        print('errors:', errs[:6])
    else:
        print('errors: (none)')
    b.close()

print('結果:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
