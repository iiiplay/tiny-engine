"""本機伺服器 + 區網連線用的 WebSocket 中繼（純 Python 標準庫，無需安裝任何東西）

用法：
    python tools/serve.py            # 自動挑一個空閒的埠
    python tools/serve.py 8080       # 指定埠
    python tools/serve.py --root .   # 指定要服務的資料夾

功能：
  1. 提供遊戲靜態檔（/ 導向 index.html），產生 qr.png
  2. /ws?room=CODE&role=host|peer  → WebSocket 中繼（同一個 room 的兩端互相轉發）

根目錄判斷：專案裡有 index.html 就服務專案本身；否則服務上一層（讓 /<資料夾名>/ 可用）。
"""
import base64
import functools
import hashlib
import http.server
import json
import os
import socket
import struct
import sys
import threading
import urllib.parse

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)          # 專案資料夾（tools 的上一層）
GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


# ---------------------------------------------------------------- WebSocket 工具
def ws_frame(payload, opcode=0x1):
    """伺服器 → 客戶端（不遮罩）"""
    if isinstance(payload, str):
        payload = payload.encode('utf-8')
    n = len(payload)
    if n < 126:
        head = struct.pack('>BB', 0x80 | opcode, n)
    elif n < 65536:
        head = struct.pack('>BBH', 0x80 | opcode, 126, n)
    else:
        head = struct.pack('>BBQ', 0x80 | opcode, 127, n)
    return head + payload


class Rooms:
    """room -> {'host': conn, 'peer': conn}"""
    _lock = threading.Lock()
    _rooms = {}

    @classmethod
    def join(cls, room, role, conn):
        with cls._lock:
            r = cls._rooms.setdefault(room, {})
            r[role] = conn
            other = r.get('peer' if role == 'host' else 'host')
            alive = bool(other and other.alive)
        if alive:
            cls._send(other, json.dumps({'t': 'sys', 'msg': 'peer-joined'}))
            cls._send(conn, json.dumps({'t': 'sys', 'msg': 'room-ready'}))
        return alive

    @classmethod
    def leave(cls, room, role, conn):
        with cls._lock:
            r = cls._rooms.get(room) or {}
            if r.get(role) is conn:
                r.pop(role, None)
            other = r.get('peer' if role == 'host' else 'host')
            if not r:
                cls._rooms.pop(room, None)
        if other and other.alive:
            cls._send(other, json.dumps({'t': 'sys', 'msg': 'peer-left'}))

    @classmethod
    def relay(cls, room, role, data):
        with cls._lock:
            r = cls._rooms.get(room) or {}
            other = r.get('peer' if role == 'host' else 'host')
        if other and other.alive:
            try:
                other.send(data)
                return True
            except Exception:
                return False
        return False

    @classmethod
    def _send(cls, conn, text):
        try:
            conn.send(text)
        except Exception:
            pass


# ---------------------------------------------------------------- HTTP / WS
class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    _io_lock = threading.Lock()
    alive = False
    index_path = '/index.html'

    def do_GET(self):
        if self.path.startswith('/ws'):
            self.handle_ws()
            return
        if self.path == '/':
            self.send_response(302)
            self.send_header('Location', self.index_path)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        # 開發用：一律不快取，避免新舊 JS 混用
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def handle_ws(self):
        key = self.headers.get('Sec-WebSocket-Key')
        if not key:
            self.send_error(400, 'need websocket')
            return
        acc = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        self.send_response(101, 'Switching Protocols')
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', acc)
        self.end_headers()
        self.wfile.flush()

        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        room = (q.get('room', ['lobby'])[0] or 'lobby')[:16]
        role = q.get('role', ['peer'])[0]
        if role not in ('host', 'peer'):
            role = 'peer'

        self.alive = True
        try:
            self.connection.settimeout(None)
        except Exception:
            pass
        ready = Rooms.join(room, role, self)
        sys.stderr.write('  [ws] room=%s role=%s %s\n' % (room, role, 'READY' if ready else 'waiting'))
        try:
            while self.alive:
                frame = self.read_frame()
                if frame is None:
                    break
                opcode, data = frame
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    self.send_raw(ws_frame(data, 0xA))
                    continue
                if opcode == 0xA:
                    continue
                if opcode in (0x1, 0x2):
                    Rooms.relay(room, role, data)
        except Exception:
            pass
        finally:
            self.alive = False
            Rooms.leave(room, role, self)
            self.close_connection = True
            sys.stderr.write('  [ws] room=%s role=%s bye\n' % (room, role))

    def read_frame(self):
        hdr = self.rfile.read(2)
        if not hdr or len(hdr) < 2:
            return None
        b1, b2 = hdr[0], hdr[1]
        opcode = b1 & 0x0F
        masked = b2 & 0x80
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack('>H', self.rfile.read(2))[0]
        elif n == 127:
            n = struct.unpack('>Q', self.rfile.read(8))[0]
        mask = self.rfile.read(4) if masked else None
        data = self.rfile.read(n) if n else b''
        if mask and data:
            data = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
        return opcode, data

    def send(self, text):
        self.send_raw(ws_frame(text))

    def send_raw(self, raw):
        with self._io_lock:
            self.wfile.write(raw)
            self.wfile.flush()

    def log_message(self, fmt, *args):
        code = args[1] if len(args) > 1 else ''
        if str(code) != '200':
            sys.stderr.write('  [%s] %s\n' % (code, args[0]))


# ---------------------------------------------------------------- 網路資訊
def lan_ips():
    ips = set()
    for probe in ('8.8.8.8', '1.1.1.1'):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect((probe, 80))
            ips.add(s.getsockname()[0])
        except Exception:
            pass
        finally:
            s.close()
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            ips.add(ip)
    except Exception:
        pass
    if os.name == 'nt':
        try:
            import subprocess
            out = subprocess.run(['ipconfig'], capture_output=True).stdout.decode('cp950', 'ignore')
            for line in out.splitlines():
                if 'IPv4' in line:
                    ip = line.split(':')[-1].strip()
                    if ip.count('.') == 3:
                        ips.add(ip)
        except Exception:
            pass

    def ok(ip):
        if ip.startswith(('127.', '169.254.')):
            return False
        a, b = (int(x) for x in ip.split('.')[:2])
        return not (a == 100 and 64 <= b <= 127)

    def rank(ip):
        a, b = (int(x) for x in ip.split('.')[:2])
        if a == 192 and b == 168:
            return 0
        if a == 10:
            return 1
        if a == 172 and 16 <= b <= 31:
            return 2
        return 3

    return sorted([ip for ip in ips if ok(ip)], key=rank)


def free_port(start):
    for p in range(start, start + 20):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(('0.0.0.0', p))
            return p
        except OSError:
            continue
        finally:
            s.close()
    return start


def resolve_root(argv):
    """--root 優先；否則：專案裡有 index.html 就服務專案，不然服務上一層"""
    if '--root' in argv:
        i = argv.index('--root')
        return os.path.abspath(argv[i + 1]), argv[:i] + argv[i + 2:]
    if os.path.exists(os.path.join(APP, 'index.html')):
        return APP, argv
    return os.path.dirname(APP), argv


if __name__ == '__main__':
    root, argv = resolve_root(sys.argv[1:])
    args = [a for a in argv if not a.startswith('--')]
    port = free_port(int(args[0]) if args else 8766)

    # 讓 / 導向正確的位置
    if os.path.abspath(root) == os.path.abspath(APP):
        Handler.index_path = '/index.html'
        url_path = '/'
    else:
        Handler.index_path = '/' + os.path.basename(APP) + '/index.html'
        url_path = '/' + os.path.basename(APP) + '/'

    ips = lan_ips()
    say = lambda *a: print(*a, flush=True)
    say('=' * 62)
    say('  這台電腦             http://localhost:%d%s' % (port, url_path))
    for ip in ips:
        say('  手機／另一台裝置      http://%s:%d%s' % (ip, port, url_path))
    if not ips:
        say('  ⚠ 找不到區域網路 IP，請確認 Wi-Fi 已連線')
    say('=' * 62)

    target = 'http://%s:%d%s' % (ips[0] if ips else 'localhost', port, url_path)
    if ips:
        try:
            import segno
            qr_png = os.path.join(APP, 'qr.png')
            segno.make(target, error='m').save(qr_png, scale=8, border=3)
            say('  QR 圖已存成：%s' % qr_png)
        except Exception:
            say('  （想產生 QR 圖可執行：pip install segno）')

    say('  • 服務資料夾：%s' % root)
    say('  • 區網連線對戰：兩台裝置開同一個網址 → 一台開房間、另一台輸入房號')
    say('  • 手機要跟電腦連「同一個 Wi-Fi」；第一次啟動若跳出防火牆視窗要按「允許」')
    say('  • Ctrl+C 結束')
    say('=' * 62)

    httpd = http.server.ThreadingHTTPServer(('0.0.0.0', port), functools.partial(Handler, directory=root))
    httpd.daemon_threads = True
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
