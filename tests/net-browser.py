"""Four real browser WebSockets against our local tools/serve.py relay."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8776/demo/net.html'
with sync_playwright() as p:
    browser = p.chromium.launch()
    pages = [browser.new_page() for _ in range(5)]
    errors = []
    for i, page in enumerate(pages):
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url, wait_until='load')
        page.evaluate("(role) => {window.n = Net.create(); n.connect(role, 'V19TEST')}", 'host' if i == 0 else 'peer')
        if i == 0:
            page.wait_for_function("n.status==='waiting'", timeout=10000)
        elif i < 4:
            page.wait_for_function("n.peerId > 0", timeout=10000)
    pages[0].wait_for_function('n.connectedPeers.length === 3', timeout=10000)
    pages[4].wait_for_function("n.errMsg.includes('房間已滿')", timeout=10000)
    ids = [pages[i].evaluate('n.peerId') for i in (1,2,3)]
    assert ids == [1,2,3], ids
    pages[1].evaluate("n.send({t:'i',id:3,m:{x:.75,y:0,mag:.75}})")
    pages[0].wait_for_function('n.peer(1).axis.x === .75', timeout=10000)
    assert pages[0].evaluate('n.peer(3).axis.x') == 0
    pages[2].evaluate('n.simulateDrop()')
    pages[0].wait_for_function('n.connectedPeers.length === 2', timeout=10000)
    pages[2].evaluate('n.reconnect()')
    pages[2].wait_for_function("n.status === 'playing'", timeout=10000)
    assert pages[2].evaluate('n.peerId') == 2
    assert not errors, errors
    print('4 players, room full, server-owned seat, rejoin seat: verified')
    for page in pages: page.evaluate('n.close()')
    browser.close()
