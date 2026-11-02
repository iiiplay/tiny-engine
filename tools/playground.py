"""光種森林操作驗收：FPS／玩家控制／衝刺／攻擊／碰撞／觸控／暫停／重來。
用法：python tools/playground.py [http://localhost:8766/demo/playground.html]
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/demo/playground.html'
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
        page.wait_for_function("typeof ForestDemo !== 'undefined' && ForestDemo.metrics.fps > 0")
        assert int(page.locator('#fps').inner_text()) > 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('#game').is_visible()
        assert page.evaluate('ForestDemo.ready && Object.keys(ASSETS).length === 31 && Object.values(ASSETS).every(img => img.complete && img.naturalWidth > 0)')
        # 記錄真實 drawImage 的來源及切格，避免動畫狀態有更新但仍畫程式色塊。
        page.evaluate("""() => {
          window.__spriteDraws = { idle: new Set(), walk: new Set(), attack: new Set(), slime: new Set() };
          const original = G.ctx.drawImage;
          G.ctx.drawImage = function(img, ...args) {
            if (img instanceof HTMLImageElement) {
              for (const state of ['idle','walk','attack']) {
                if (img.src.includes('/hero-' + state + '-')) window.__spriteDraws[state].add(img.src + ':' + args[0]);
              }
              if (img.src.includes('/slime-')) window.__spriteDraws.slime.add(img.src);
            }
            return original.call(this, img, ...args);
          };
        }""")
        page.wait_for_function('__spriteDraws.idle.size >= 2 && __spriteDraws.slime.size >= 2')

        # 真實按鍵控制，同方向的兩個鍵不互相取消。
        x0 = page.evaluate('ForestDemo.player.x')
        page.keyboard.down('ArrowRight'); page.keyboard.down('KeyD'); page.keyboard.up('KeyD')
        page.wait_for_function('(x) => ForestDemo.player.x > x + 8', arg=x0)
        page.wait_for_function("ForestDemo.player.dir === 'right' && ForestDemo.player.animMode === 'walk' && __spriteDraws.walk.size >= 2")
        page.keyboard.up('ArrowRight')
        assert not page.evaluate("Input.isDown('right')")

        # 收集第一顆光種；移動能影響遊戲目標。
        page.keyboard.down('KeyD')
        page.wait_for_function('ForestDemo.collected >= 1')
        page.keyboard.up('KeyD')

        # 將一隻真實敵人放到攻擊前方，仍透過按鍵觸發完整戰鬥流程。
        page.evaluate("""() => {
          const p = ForestDemo.player, c = ForestDemo.creatures[0];
          p.aimX=1; p.aimY=0; p.attackCd=0;
          c.x=p.x+18; c.y=p.y; c.hp=2; c.respawn=0;
        }""")
        hit0 = page.evaluate('ForestDemo.hits')
        page.keyboard.press('Space')
        page.wait_for_function('(n) => ForestDemo.hits > n', arg=hit0)
        page.wait_for_function('__spriteDraws.attack.size > 0')
        assert page.evaluate("ForestDemo.player.animMode === 'attack' && !ForestDemo.player.anim.loop")

        # 無按方向也能沿面向衝刺，且持續按住不會重複觸發。
        dash0 = page.evaluate('ForestDemo.dashes')
        page.keyboard.down('ShiftLeft')
        page.wait_for_function('(n) => ForestDemo.dashes === n + 1', arg=dash0)
        page.wait_for_timeout(180)
        page.keyboard.up('ShiftLeft')
        assert page.evaluate('ForestDemo.dashes') == dash0 + 1

        # 在世界邊界前衝刺，確認走位仍受 Grid 碰撞限制。
        page.evaluate('ForestDemo.player.x=24; ForestDemo.player.y=180; ForestDemo.player.aimX=-1; ForestDemo.player.aimY=0; ForestDemo.player.dashCd=0;')
        page.keyboard.press('ShiftLeft')
        page.wait_for_timeout(200)
        assert page.evaluate('ForestDemo.player.x') >= 21

        page.locator('#pause').click()
        page.wait_for_function('ForestDemo.paused')
        before = page.evaluate('ForestDemo.time')
        page.keyboard.down('KeyD'); page.wait_for_timeout(150); page.keyboard.up('KeyD')
        assert page.evaluate('ForestDemo.time') == before
        assert page.locator('#pause-overlay').is_visible()
        page.locator('#pause').click()
        page.wait_for_function('!ForestDemo.paused')

        page.locator('#population').click(); page.locator('#population').click()
        assert page.evaluate('ForestDemo.creatures.length') == 160
        page.locator('#reset').click()
        assert page.evaluate('ForestDemo.collected === 0 && ForestDemo.player.health === 5')
        page.keyboard.press('KeyR')
        page.wait_for_function('ForestDemo.time < .3')
        for key, direction in [('KeyW','up'), ('KeyA','left'), ('KeyS','down'), ('KeyD','right')]:
            page.keyboard.down(key)
            page.wait_for_function('(dir) => ForestDemo.player.dir === dir && ForestDemo.player.animMode === "walk"', arg=direction)
            assert page.evaluate('(dir) => ForestDemo.player.anim.s.src.endsWith("hero-walk-" + dir + ".png")', direction)
            page.keyboard.up(key)
            page.wait_for_function('ForestDemo.player.animMode === "idle"')

        if mobile:
            assert page.evaluate('TouchUI.enabled')
            joy = page.evaluate('TouchUI.joyHome')
            session = context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': joy['x'], 'y': joy['y']}]})
            session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': joy['x'] + 20, 'y': joy['y']}]})
            page.wait_for_function('Input.moveAxis().x > 0')
            session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            page.wait_for_function('Input.moveAxis().mag === 0')
            attack = page.evaluate("TouchUI.btns.find(b => b.a==='attack')")
            count = page.evaluate('ForestDemo.attacks')
            page.evaluate('ForestDemo.player.attackCd=0')
            page.touchscreen.tap(attack['x'], attack['y'])
            page.wait_for_function('(n) => ForestDemo.attacks > n', arg=count)
            dash = page.evaluate("TouchUI.btns.find(b => b.a==='dash')")
            count = page.evaluate('ForestDemo.dashes')
            page.evaluate('ForestDemo.player.dashCd=0')
            page.touchscreen.tap(dash['x'], dash['y'])
            page.wait_for_function('(n) => ForestDemo.dashes > n', arg=count)

        # 驗證全部光種可到達（沒有生成在障礙物裡或封閉區域）。
        assert page.evaluate("""() => {
          const d=ForestDemo, f=d.map.field({from:{cx:40,cy:31}});
          return d.seeds.every(s=>d.map.reachable(f,Math.floor(s.x/16),Math.floor(s.y/16)));
        }""")
        for i in range(8):
            page.evaluate('(i) => { const s=ForestDemo.seeds[i]; ForestDemo.player.x=s.x; ForestDemo.player.y=s.y; }', i)
            page.wait_for_function('(i) => ForestDemo.seeds[i].taken', arg=i)
        page.wait_for_function("document.getElementById('objective').textContent === '石環甦醒了'")
        page.locator('#reset').click()
        page.wait_for_timeout(700)
        page.screenshot(path=os.path.join(OUT, 'qa-playground-' + name + '.png'))
        assert not errors, errors
        print(name + ': PASS (31 PNGs / sprite frames / 4 directions / movement / attack / dash / collision / touch / 160 entities / 8 seeds / FPS)')
        context.close()
    browser.close()
