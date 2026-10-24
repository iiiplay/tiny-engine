"""把 engine/*.js 合成一支 tiny-engine.js（不想管載入順序的人用）

用法：
    python tools/pack.py                  # 輸出 engine/dist/tiny-engine.js
    python tools/pack.py --check          # 只檢查 dist 是否為最新（CI 用，落後就 exit 1）
    python tools/pack.py --out build/te.js

輸出是「照載入順序串起來的同一個檔案」，行為與逐支載入相同（同一組全域）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENGINE = os.path.join(ROOT, 'engine')

# 載入順序（和 README / index.html 一致）
ORDER = [
    'util.js', 'core.js', 'assets.js', 'sprite.js', 'input.js', 'audio.js',
    'fx.js', 'physics.js', 'pathfind.js', 'save.js', 'scene.js', 'ui.js',
    'touch.js', 'net.js',
]

BANNER = """/*! tiny-engine — 單檔版（由 tools/pack.py 產生，請勿手改）
 *  來源：engine/*.js  共 %d 支
 *  授權：MIT
 */
"""


def build():
    parts = []
    for name in ORDER:
        path = os.path.join(ENGINE, name)
        with open(path, encoding='utf-8') as f:
            src = f.read()
        # 去掉各檔開頭的 'use strict';（最後統一放一次）
        stripped = src.lstrip()
        if stripped.startswith("'use strict';"):
            stripped = stripped[len("'use strict';"):].lstrip('\n')
        parts.append("/* ---- engine/%s ---- */\n%s" % (name, stripped.rstrip() + "\n"))
    head = BANNER % len(ORDER) + "'use strict';\n"
    return head + "\n".join(parts)


def main():
    args = sys.argv[1:]
    check = '--check' in args
    out = os.path.join(ENGINE, 'dist', 'tiny-engine.js')
    if '--out' in args:
        out = args[args.index('--out') + 1]

    code = build()
    size = len(code.encode('utf-8'))

    if check:
        cur = None
        if os.path.exists(out):
            with open(out, encoding='utf-8') as f:
                cur = f.read()
        if cur != code:
            print('FAIL: %s 不是最新，請執行 python tools/pack.py' % os.path.relpath(out, ROOT))
            return 1
        print('OK: %s 是最新（%.1f KB）' % (os.path.relpath(out, ROOT), size / 1024))
        return 0

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(code)
    print('已產生 %s（%.1f KB，%d 支）' % (os.path.relpath(out, ROOT), size / 1024, len(ORDER)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
