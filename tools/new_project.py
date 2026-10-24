"""從 TinyEngine 建一個新專案（引擎 + demo 骨架 + 伺服器）

用法：
    python tools/new_project.py ../my-game
    python tools/new_project.py ../my-game --title "我的遊戲"
"""
import os
import shutil
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main():
    argv = sys.argv[1:]
    args = [a for a in argv if not a.startswith('--')]
    if not args:
        print(__doc__)
        return 1
    target = os.path.abspath(args[0])
    title = None
    if '--title' in argv:
        i = argv.index('--title')
        if i + 1 < len(argv):
            title = argv[i + 1]

    if os.path.exists(target) and os.listdir(target):
        print('[x] 目標資料夾不是空的：%s' % target)
        return 1
    os.makedirs(target, exist_ok=True)

    def copy(src, dst):
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'qr.png', 'shots'))
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)

    print('建立專案：%s' % target)
    copy(os.path.join(ROOT, 'engine'), os.path.join(target, 'engine'))
    print('  [ok] engine/')
    copy(os.path.join(ROOT, 'tools', 'serve.py'), os.path.join(target, 'tools', 'serve.py'))
    print('  [ok] tools/serve.py')

    # demo 當成起始遊戲骨架（index.html / game.js / assets / tools/make_art.py）
    demo = os.path.join(ROOT, 'demo')
    copy(os.path.join(demo, 'index.html'), os.path.join(target, 'index.html'))
    copy(os.path.join(demo, 'game.js'), os.path.join(target, 'game.js'))
    copy(os.path.join(demo, 'assets'), os.path.join(target, 'assets'))
    copy(os.path.join(demo, 'tools'), os.path.join(target, 'tools'))
    print('  [ok] index.html / game.js / assets/ / tools/make_art.py')

    if title:
        p = os.path.join(target, 'index.html')
        s = open(p, encoding='utf-8').read()
        s = s.replace('<title>TinyEngine — Demo（捲動鏡頭・A*・排行榜）</title>', '<title>%s</title>' % title)
        open(p, 'w', encoding='utf-8').write(s)

    print("""
完成！接下來：

  cd "%s"
  python tools/serve.py        # 印出網址（手機也能連）
  # http://localhost:8766/

改遊戲：game.js（現在是 demo：捲動鏡頭 + A* 追擊 + 排行榜，直接改它）
引擎：engine/（不要改，要改就回頭改 tiny-engine 再重新複製）
""" % target)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
