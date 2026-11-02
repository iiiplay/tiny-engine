"""Slot 真實瀏覽器驗收：扣款／中獎／連點／免費旋轉／存檔恢復／自動／手機。
用法：python tools/slot.py [http://localhost:8766/demo/slot.html]
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/slot.html'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots')
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, width, height, mobile in [('desktop', 1280, 720, False), ('mobile', 375, 667, True)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=mobile, is_mobile=mobile)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('requestfailed', lambda r: errors.append('request failed: ' + r.url))
        page.goto(URL, wait_until='load')
        page.wait_for_function('SlotDemo.ready && SlotDemo.metrics.fps > 0')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.evaluate('Object.keys(ASSETS).length===7 && Object.values(ASSETS).every(img=>img.complete&&img.naturalWidth>0)')
        if not mobile:
            assert page.locator('#spin').bounding_box()['y'] + page.locator('#spin').bounding_box()['height'] <= height
        page.locator('#bet-plus').click()
        assert page.evaluate('SlotDemo.state.bet') == 40
        page.locator('#bet-minus').click()
        page.locator('#fast').click()
        # 透過規則層的亂數注入，真實點按 UI 產生可驗證的全金幣結果。
        page.evaluate('SlotDemo.random=()=>0')
        page.locator('#spin').click()
        page.wait_for_function('SlotDemo.spinning')
        assert page.locator('#spin').is_disabled()
        assert page.locator('#bet-plus').is_disabled()
        assert page.evaluate('SlotDemo.state.balance') == 1980
        page.keyboard.press('Space')
        assert page.evaluate('SlotDemo.state.serial') == 1
        page.wait_for_function('!SlotDemo.spinning')
        assert page.evaluate('SlotDemo.state.balance') == 2780
        assert page.evaluate('SlotDemo.state.lastWin') == 800
        assert page.evaluate('SlotDemo.result.wins.length') == 20
        page.screenshot(path=os.path.join(OUT, 'slot-win-' + name + '.png'), full_page=True)
        # pending 存檔已扣款，重整只補一次結算。
        page.locator('#spin').click()
        page.wait_for_function('SlotDemo.spinning')
        page.reload()
        page.wait_for_function('SlotDemo.ready')
        assert page.evaluate('SlotDemo.state.balance') == 3560
        assert page.evaluate('SlotDemo.state.totalSpins') == 2
        page.reload(); page.wait_for_function('SlotDemo.ready')
        assert page.evaluate('SlotDemo.state.balance') == 3560
        assert page.evaluate('SlotDemo.board.every(col=>col.every(s=>s===0))')

        # 體驗贈送不派彩；真正免費旋轉不扣款且下注鎖定。
        page.locator('#gift').click()
        assert page.evaluate('SlotDemo.state.freeRemaining') == 8
        assert page.evaluate('SlotDemo.state.balance') == 3560
        assert page.locator('#bet-plus').is_disabled()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.evaluate('SlotDemo.random=()=>0')
        page.locator('#fast').click()
        page.locator('#spin').click()
        assert page.evaluate('SlotDemo.state.balance') == 3560
        page.wait_for_function('!SlotDemo.spinning')
        assert page.evaluate('SlotDemo.state.freeRemaining') == 7
        assert page.evaluate('SlotDemo.state.balance') == 4360
        assert page.evaluate('SlotDemo.result.free')
        # 全 Scatter 確認轉輪畫面與追加免費旋轉的完整流程。
        page.evaluate('SlotDemo.random=()=>.99')
        page.locator('#spin').click(); page.wait_for_function('!SlotDemo.spinning')
        assert page.evaluate('SlotDemo.state.freeRemaining') == 26
        assert page.evaluate('SlotDemo.result.scatterCount') == 15
        assert page.evaluate('SlotDemo.state.lastWin') == 200

        page.locator('#rules-button').click()
        assert page.locator('#rules').is_visible()
        assert page.locator('#paytable tr').count() == 6
        assert page.locator('#line-map > div').count() == 20
        serial = page.evaluate('SlotDemo.state.serial')
        page.keyboard.press('Space'); page.wait_for_timeout(100)
        assert page.evaluate('SlotDemo.state.serial') == serial
        page.locator('#rules-close').click()
        page.locator('#reset').click()
        assert page.evaluate('SlotDemo.state.balance') == 2000
        assert page.evaluate('SlotDemo.state.freeRemaining') == 0
        assert page.evaluate('new Set(SlotDemo.board.flat()).size > 1')
        page.evaluate('SlotDemo.random=()=>0')
        page.locator('#auto').click(); page.wait_for_function('SlotDemo.spinning')
        page.locator('#auto').click()
        page.wait_for_function('!SlotDemo.spinning')
        page.wait_for_timeout(1400)
        assert page.evaluate('SlotDemo.state.totalSpins') == 1
        assert page.evaluate('SlotDemo.autoRemaining') == 0
        page.locator('#sound').click()
        assert page.evaluate('Sfx.muted')
        page.locator('#reset').click()
        if mobile:
            rect = page.locator('#spin').bounding_box()
            page.touchscreen.tap(rect['x'] + rect['width']/2, rect['y'] + rect['height']/2)
            page.wait_for_function('SlotDemo.spinning'); page.wait_for_function('!SlotDemo.spinning')
            assert page.evaluate('SlotDemo.state.totalSpins') == 1
            page.locator('#reset').click()
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT, 'qa-slot-' + name + '.png'), full_page=True)
        assert not errors, errors
        print(name + ': PASS (7 PNG / spin / payout / pending restore / free spins / Scatter / auto cancel / rules / FPS)')
        context.close()
    # 低動態偏好仍能完成旋轉與結算。
    context = browser.new_context(reduced_motion='reduce')
    page = context.new_page(); page.goto(URL); page.wait_for_function('SlotDemo.ready')
    assert page.evaluate('SlotDemo.reducedMotion')
    page.evaluate('SlotDemo.random=()=>0')
    page.locator('#spin').click(); page.wait_for_function('!SlotDemo.spinning')
    assert page.evaluate('SlotDemo.state.balance') == 2780
    page.locator('#reset').click()
    page.locator('#auto').click()
    page.wait_for_function('SlotDemo.state.totalSpins===10 && !SlotDemo.spinning && SlotDemo.autoRemaining===0', timeout=30000)
    assert page.evaluate('SlotDemo.state.balance') == 9800
    print('reduced motion / exactly 10 auto spins: PASS')
    context.close(); browser.close()
