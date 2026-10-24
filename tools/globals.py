"""檢查「遊戲自己的全域」有沒有撞到引擎的保留名稱

為什麼需要：引擎有一堆全域（G / Display / Grid / SHEETS …）。
遊戲如果也寫 `const SHEETS = {}`，整個檔案會直接 SyntaxError（tiny-keep 撞過）。

用法：
    python tools/globals.py <遊戲資料夾>            # 只看報告
    python tools/globals.py <遊戲資料夾> --check     # 撞名就 exit 1（CI 用）
    python tools/globals.py <遊戲資料夾> --strict    # 連警告（同引擎前綴）也當失敗

它會掃 `engine/*.js` 取得保留名稱，再掃 `<遊戲>/game/*.js`（或 --dir 指定的資料夾），
報告「遊戲宣告了跟引擎同名的東西」。不會執行任何程式。
"""
import argparse
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

DECL = re.compile(r'^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)', re.M)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENGINE = os.path.join(ROOT, 'engine')


def decls(folder, pattern='*.js'):
    names = {}
    if not os.path.isdir(folder):
        return names
    for dirpath, _d, files in os.walk(folder):
        for fn in sorted(files):
            if not fn.endswith('.js'):
                continue
            if pattern == '*.js' and not fn.endswith('.js'):
                continue
            path = os.path.join(dirpath, fn)
            try:
                src = open(path, encoding='utf-8').read()
            except Exception:
                continue
            for m in DECL.finditer(src):
                names.setdefault(m.group(1), os.path.relpath(path, folder))
    return names


def engine_names():
    return decls(ENGINE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('game', help='遊戲資料夾（裡面要有 game/*.js 或 --dir）')
    ap.add_argument('--dir', default=None, help='要掃哪個子資料夾（預設 game）')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    eng = engine_names()
    target = os.path.join(args.game, args.dir) if args.dir else os.path.join(args.game, 'game')
    if not os.path.isdir(target):
        target = args.game
    game = decls(target)

    collisions = {k: v for k, v in game.items() if k in eng}
    # 警告：用引擎的命名風格（全大寫或 G/Display 這種）但不是撞名
    warns = {k: v for k, v in game.items()
             if k not in eng and re.match(r'^[A-Z][A-Z0-9_]{2,}$', k)}

    if args.json:
        import json
        print(json.dumps({'engine': len(eng), 'game': len(game),
                          'collisions': collisions, 'warns': warns}, indent=2))
    else:
        print('引擎保留名稱：%d 個　遊戲宣告：%d 個' % (len(eng), len(game)))
        if collisions:
            print('\n撞名（一定要改！會 SyntaxError）：')
            for k, v in sorted(collisions.items()):
                print('  ✗ %-16s %s（引擎也有同名全域）' % (k, v))
        else:
            print('\n沒有撞名 ✓')
        if warns:
            print('\n提醒（全大寫命名，容易哪天撞到）：')
            for k, v in sorted(warns.items()):
                print('  ! %-16s %s' % (k, v))

    bad = bool(collisions) or (args.strict and bool(warns))
    if bad and (args.check or args.strict):
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
