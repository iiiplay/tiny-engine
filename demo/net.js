'use strict';
/* ============================================================
   demo/net.js — 區網連線最小範例（房主權威 + 加入端瘦客戶端）
   兩台裝置開同一頁：
     其中一台按 1（開房間，房號 TEDEMO）
     另一台按 2（加入房間）
   加入端用方向鍵移動方塊 → 房主端算出結果 → 加入端看到同步結果
   ============================================================ */

GAME_W = 360;

const ROOM = 'TEDEMO';
const N = { state: 'title', box: { x: GAME_W / 2, y: 120, dir: 'idle' }, tick: 0 };

/* 房主：把狀態打包（只有遊戲知道要送什麼） */
Net.produceSnapshot = function () {
  return { t: 's', x: Math.round(N.box.x), y: Math.round(N.box.y), d: N.box.dir, k: N.tick };
};
/* 加入端：收到狀態就更新顯示 */
Net.onSnapshot = function (s) { N.box.x = s.x; N.box.y = s.y; N.box.dir = s.d; N.state = 'play'; };
Net.onReady = function () { N.state = 'play'; };
Net.onDrop = function () { N.state = 'over'; };

function update(dt) {
  if (Input.justPressed('debug')) Loop.toggleDebug();

  if (N.state !== 'play') {
    if (Input.justPressed('host')) { Net.connect('host', ROOM); N.role = 'host'; N.state = 'connecting'; }
    if (Input.justPressed('join')) { Net.connect('peer', ROOM); N.role = 'peer'; N.state = 'connecting'; }
    if (Input.justPressed('confirm') && (Net.status === 'closed' || Net.status === 'error')) {
      Net.close(); N.state = 'title'; N.role = null;
    }
    return;
  }

  const speed = 90;
  if (Net.isHost) {
    /* 房主：套用「自己的輸入」+「加入端送來的輸入」 */
    N.tick += 1;
    const mv = Input.moveAxis();
    const rv = Net.remote.moveAxis();
    const x = mv.x || rv.x, y = mv.y || rv.y;
    N.box.x = U.clamp(N.box.x + x * speed * dt, 12, GAME_W - 12);
    N.box.y = U.clamp(N.box.y + y * speed * dt, 20, GAME_H - 20);
    N.box.dir = x ? 'peer' : y ? 'peer' : 'idle';
    if (Input.justPressed('confirm')) { N.box.x = GAME_W / 2; N.box.y = 120; }   // 房主可重置
  }
  /* 加入端：什麼都不模擬，只等快照（輸入由 Net 每 25ms 自動送出） */
}

function render() {
  const ctx = G.ctx;
  const SC = G.scale;
  ctx.setTransform(SC, 0, 0, SC, 0, 0);
  ctx.fillStyle = '#1b2238';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let x = 0; x < GAME_W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_H); ctx.stroke(); }
  for (let y = 0; y < GAME_H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_W, y); ctx.stroke(); }

  /* 方塊 */
  const b = N.box;
  ctx.fillStyle = Net.isHost ? '#8fe36a' : '#7fd4ff';
  ctx.fillRect(Math.round(b.x) - 10, Math.round(b.y) - 10, 20, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 3, 6, 6);

  /* HUD */
  hudPanel(6, 6, 190, 34);
  const role = Net.isHost ? '房主（權威）' : Net.isPeer ? '加入端（瘦客戶端）' : '未連線';
  text(role + '  ' + ROOM, 12, 9, { size: 8, shadow: false, color: Net.isHost ? '#8fe36a' : '#7fd4ff' });
  text('狀態 ' + Net.status + '  快照 ' + Net.snapCount + '  延遲 ' + Math.round(Net.snapAge * 1000) + 'ms', 12, 22, { size: 6.5, shadow: false, color: '#cfd8c0' });

  if (N.state === 'title') {
    text('區網連線 demo', GAME_W / 2, 60, { align: 'center', size: 18, color: '#ffe9a8' });
    text('兩台裝置開同一頁，一台按 1、另一台按 2', GAME_W / 2, 88, { align: 'center', size: 8, color: '#cfd8c0' });
    text('1 = 開房間', GAME_W / 2, 130, { align: 'center', size: 11, color: '#8fe36a' });
    text('2 = 加入房間', GAME_W / 2, 150, { align: 'center', size: 11, color: '#7fd4ff' });
    text('加入端用方向鍵移動方塊，房主端會算並回傳', GAME_W / 2, 180, { align: 'center', size: 7, color: '#8d97a8', shadow: false });
  } else if (N.state === 'connecting') {
    text('連線中… 等待另一端', GAME_W / 2, 100, { align: 'center', size: 10, color: '#cfd8c0' });
  } else if (N.state === 'over') {
    text('對方離線', GAME_W / 2, 100, { align: 'center', size: 12, color: '#ff9f9f' });
    text('按 Enter 回標題', GAME_W / 2, 124, { align: 'center', size: 8, color: '#cfd8c0' });
  }
}

window.addEventListener('load', async () => {
  Display.init(document.getElementById('game'));
  Input.init({ Digit1: 'host', Digit2: 'join', Enter: 'confirm', Escape: 'confirm' });
  await loadAll({});
  const label = document.getElementById('loading');
  if (label) label.remove();
  if (typeof Screen !== 'undefined') Screen.init();
  TouchUI.showIn = [];
  TouchUI.init();
  Loop.update = update;
  Loop.render = render;
  Loop.debugInfo = () => 'role ' + (Net.isHost ? 'host' : Net.isPeer ? 'peer' : '-') + '  snap ' + Net.snapCount + '  sent ' + Net.sentCount + '  ready ' + (Net.ready ? 1 : 0);
  Loop.start();
});
