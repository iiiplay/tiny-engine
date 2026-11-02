"""注入真實瀏覽器錯誤，確認驗收腳本不會誤報 PASS。"""
import functools
import http.server
import os
from pathlib import Path
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]


class FaultHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        target = Path(self.translate_path(self.path))
        if target.is_dir():
            target /= 'index.html'
        if target.suffix == '.html' and target.is_file():
            fault = ("throw new Error('injected-pageerror')" if 'pageerror=1' in self.path
                     else "console.error('injected-console-error')")
            html = target.read_text(encoding='utf-8').replace('</head>', '<script>' + fault + '</script></head>')
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(FaultHandler, directory=str(ROOT)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = 'http://127.0.0.1:%d/demo/' % server.server_port
try:
    for name, args in [
        ('bench', [base + 'bench.html']),
        ('soak', ['1', base]),
        ('v16', [base + 'v16.html']),
        ('v16', [base + 'v16.html?pageerror=1']),
    ]:
        result = subprocess.run([sys.executable, str(ROOT / 'tools' / (name + '.py')), *args],
                                capture_output=True, text=True, encoding='utf-8', timeout=90,
                                env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        assert result.returncode == 1, (name, result.returncode, result.stdout, result.stderr)
        assert 'injected-' in result.stdout, (name, '沒有測到注入的錯誤', result.stdout, result.stderr)
        print(name + ' ' + args[-1].split('/')[-1] + ': rejected injected error')
finally:
    server.shutdown()
    server.server_close()
    thread.join()
