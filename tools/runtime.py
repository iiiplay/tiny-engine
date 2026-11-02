"""真實瀏覽器回歸：雙鍵輸入、觸控搖桿，以及桌面／手機畫面。
用法：python tools/runtime.py [http://localhost:8766/demo/]
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots')
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, width, height, mobile in [('desktop', 1280, 720, False), ('mobile', 375, 667, True)]:
        context = browser.new_context(viewport={'width': width, 'height': height},
                                      has_touch=mobile, is_mobile=mobile)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('requestfailed', lambda r: errors.append('request failed: ' + r.url))
        page.goto(URL, wait_until='load')
        page.wait_for_function("typeof Loop !== 'undefined' && Loop.renderCount > 0 && G.state === 'title'")
        if mobile:
            page.touchscreen.tap(width / 2, height / 2)
        else:
            page.keyboard.press('Enter')
        page.wait_for_function("G.state === 'play'")

        page.keyboard.down('ArrowRight')
        page.keyboard.down('KeyD')
        page.keyboard.up('KeyD')
        assert page.evaluate("Input.isDown('right') && Input.keyDown.right"), '放開 D 不應中斷方向鍵'
        x0 = page.evaluate('G_.player.x')
        page.wait_for_function('(x) => G_.player.x > x', arg=x0)
        page.keyboard.up('ArrowRight')
        assert not page.evaluate("Input.isDown('right')"), '全部放開後應停止'

        if mobile:
            assert page.evaluate('TouchUI.enabled'), '手機應啟用觸控'
            # 透過瀏覽器觸控事件推搖桿，確認完整事件鏈能產生移動向量。
            joy = page.evaluate('({x: TouchUI.joyHome.x, y: TouchUI.joyHome.y, r: TouchUI.joyHome.r})')
            session = context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': joy['x'], 'y': joy['y']}]})
            session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': joy['x'] + joy['r'] / 2, 'y': joy['y']}]})
            page.wait_for_function('Input.moveAxis().x > 0 && Input.moveAxis().mag > 0')
            page.wait_for_function("""() => {
                const j = TouchUI.joyHome, d = TouchUI.dpr;
                return TouchUI.uiCtx.getImageData(Math.round(j.x*d), Math.round(j.y*d), 1, 1).data[3] > 0;
            }""")
            page.screenshot(path=os.path.join(OUT, 'qa-runtime-mobile.png'))
            session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            page.wait_for_function('Input.moveAxis().mag === 0')
        else:
            page.keyboard.press('F3')
            page.wait_for_function('Loop._showDebug')
            page.screenshot(path=os.path.join(OUT, 'qa-runtime-desktop.png'))

        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), '不應出現水平溢位'
        assert not errors, errors
        print(name + ': PASS')
        context.close()
    browser.close()
