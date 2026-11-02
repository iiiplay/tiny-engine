"""tiny-engine v1.3 驗收測試：Scene / UI / 離線收益 / 四方向 / 繪製節流 / UI 成本
用法： python tools/v13.py [url]
"""
import os
import sys
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/v13.html'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'shots')
os.makedirs(OUT, exist_ok=True)

fails = []
logs = []

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1100, 'height': 720}, device_scale_factor=1)
    pg.on('pageerror', lambda e: logs.append('[pageerror] %s' % e))
    pg.on('console', lambda m: logs.append('[%s] %s' % (m.type, m.text)) if m.type == 'error' else None)
    pg.on('requestfailed', lambda r: logs.append('[fail] %s' % r.url))

    pg.goto(URL, wait_until='load')
    pg.wait_for_function("typeof DEV !== 'undefined' && typeof Scene !== 'undefined' && Scene.name !== null", timeout=20000)
    pg.wait_for_timeout(500)

    def ev(js):
        return pg.evaluate(js)

    def rect_of(hot, bid):
        for r in hot:
            if r['id'] == bid:
                return r
        return None

    def click_id(bid):
        hot = ev("() => DEV.hot()")
        r = rect_of(hot, bid)
        if not r:
            fails.append('找不到按鈕 %s（熱區：%s）' % (bid, [x['id'] for x in hot]))
            return False
        box = pg.locator('#game').bounding_box()
        scale = box['width'] / ev("() => GAME_W")
        pg.mouse.click(box['x'] + (r['x'] + r['w'] / 2) * scale,
                       box['y'] + (r['y'] + r['h'] / 2) * scale)
        pg.wait_for_timeout(180)
        return True

    print('=== 1. 初始狀態 ===')
    name = ev("() => Scene.name")
    print('scene =', name)
    if name != 'camp':
        fails.append('初始場景不是 camp')

    print('=== 2. Scene 切換（點按鈕） ===')
    click_id('toBattle')
    if ev("() => Scene.name") != 'battle':
        fails.append('點「去戰鬥」沒有切到 battle')
    click_id('toCamp')
    if ev("() => Scene.name") != 'camp':
        fails.append('點「回營地」沒有切回 camp')

    print('=== 3. Scene.overlay（模擬不中斷） ===')
    click_id('overlay')
    has = ev("() => Scene.hasOverlay()")
    r0 = ev("() => Loop.renderCount")
    pg.wait_for_timeout(400)
    r1 = ev("() => Loop.renderCount")
    print('overlay =', has, ' render', r0, '->', r1)
    if not has:
        fails.append('覆蓋層沒有開啟')
    if r1 <= r0:
        fails.append('覆蓋層開啟後停止繪製（應該是模擬照跑、畫面照畫）')
    click_id('closeOverlay')
    if ev("() => Scene.hasOverlay()"):
        fails.append('覆蓋層沒有關閉')

    print('=== 4. Save.offline（2 小時 / 20 小時上限 / 時鐘倒退） ===')
    o2 = ev("() => DEV.away(2 * 3600)")
    print(o2)
    if o2['first'] or o2['gain'] <= 0:
        fails.append('2 小時離線沒有收益')
    if o2['capped']:
        fails.append('2 小時不應該碰到 8 小時上限')
    if abs(o2['gain'] - 240) > 1:
        fails.append('每小時 120 → 2 小時應該是 240，得到 %s' % o2['gain'])
    o20 = ev("() => DEV.away(20 * 3600)")
    print(o20)
    if not o20['capped'] or abs(o20['seconds'] - 8 * 3600) > 2:
        fails.append('20 小時應該被截到 8 小時')
    oclock = ev("() => DEV.away(-3600)")   # 時鐘往回撥
    print(oclock)
    if oclock['gain'] != 0:
        fails.append('時鐘倒退應該回 0，得到 %s' % oclock['gain'])

    print('=== 5. drawDirSheet（四方向都畫得出來） ===')
    dirs = ev("""() => {
        const s = sheetOf(window.MANIFEST.hero.dir);
        const out = [];
        for (const d of ['down','left','up','right']) out.push([d, DIR_ROW[d], s.rows, s.fw, s.h]);
        return out;
    }""")
    print(dirs)
    if any(r[2] != 4 or r[3] != 16 or r[4] != 16 for r in dirs):
        fails.append('四方向動畫表解析錯誤（rows/fw/fh）')
    for d in ('down', 'left', 'up', 'right'):
        ev("() => { ST.dir = '%s'; }" % d)
        pg.wait_for_timeout(60)
    pg.screenshot(path=os.path.join(OUT, 'v13_camp.png'))

    print('=== 6. Loop.renderRate（10 fps 省電，模擬照跑） ===')
    click_id('toggleRate')
    rate = ev("() => Loop.renderRate")
    c0 = ev("() => Loop.renderCount")
    pg.wait_for_timeout(1200)
    c1 = ev("() => Loop.renderCount")
    got = c1 - c0
    print('renderRate =', rate, ' 1.2 秒內畫了', got, '次')
    if rate != 10:
        fails.append('節流沒有設成 10')
    if not (5 <= got <= 18):
        fails.append('節流後 1.2 秒應該約 12 次繪製，得到 %s' % got)
    click_id('toggleRate')
    if ev("() => Loop.renderRate") != 0:
        fails.append('關閉節流沒有回到全速')

    print('=== 7. UI 成本（200 個按鈕） ===')
    bench = ev("() => DEV.benchUI(200)")
    print(bench)
    if bench['drawMs'] > 8:
        fails.append('200 個按鈕繪製 %.2f ms（> 8ms）' % bench['drawMs'])
    if bench['hitMs'] > 3:
        fails.append('200 個熱區命中 %.2f ms（> 3ms）' % bench['hitMs'])
    if bench['hot'] != 200:
        fails.append('熱區數量不對：%s' % bench['hot'])

    print('=== 8. 一般 fps ===')
    pg.wait_for_timeout(800)
    fps = ev("() => Loop.fps")
    print('fps =', fps)
    if fps < 50:
        fails.append('fps 低於 50：%s' % fps)

    pg.screenshot(path=os.path.join(OUT, 'v13_after.png'))
    b.close()

print('\n--- console ---')
print('\n'.join(logs[:20]) or '(none)')
fatal = logs
if fatal:
    fails.append('%d 個 JS 錯誤 / 資源載入失敗' % len(fatal))

print('\n=== 結果 ===')
if fails:
    for f in fails:
        print('FAIL:', f)
    sys.exit(1)
print('PASS')
