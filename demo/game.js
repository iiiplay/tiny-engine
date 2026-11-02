'use strict';
/* ============================================================
   TinyEngine demo —「捲動鏡頭 + A* 追擊 + 排行榜」
   示範引擎的：Camera / Loop.fixedStep / Pathfind / Save / Sprite /
              Physics / Fx / UI / TouchUI / WebAudio 合成音效
   玩法：撿完 12 枚金幣，藍色小怪會用 A* 繞過障礙追你，碰到 +2 秒
   F3 看碰撞框與 A* 路徑
   ============================================================ */

/* ---------------- 世界設定 ---------------- */
const WORLD = { w: 900, h: 620 };      // 比畫面大 → 需要鏡頭捲動
GAME_W = 400;                           // 畫面看到的邏輯尺寸（引擎會依螢幕調高度）
Loop.fixedStep = 1 / 60;                // ★ 固定時間步（物理決定性）

const MANIFEST = {
  hero: { walk: { down: assetDef('assets/hero.png', 6, 16) } },
};

/* ---------------- 音效（合成，不用音檔） ---------------- */
Sfx.register({
  coin() { this.tone(900, 1400, 0.07, 'square', 0.12); },
  bump() { this.tone(200, 90, 0.12, 'triangle', 0.2); },
  win() { this.tone(660, 660, 0.12, 'square', 0.14); this.tone(880, 880, 0.12, 'square', 0.14, 0.1); this.tone(1180, 1180, 0.3, 'square', 0.16, 0.2); },
  start() { this.tone(520, 780, 0.12, 'triangle', 0.16); },
});

/* ---------------- 狀態 ---------------- */
const G_ = {            // demo 自己的狀態（引擎的 G 只放 app 層級的東西）
  player: null,
  chasers: [],
  coins: [],
  blocks: [],
  time: 0,
  penalty: 0,
  hitCd: 0,
  best: null,
  record: null,
};

/* ---------------- 關卡 ---------------- */
function buildLevel() {
  Physics.clear();
  G_.blocks = [];
  const B = 10;
  const add = (x, y, w, h) => { Physics.add(x, y, w, h); G_.blocks.push({ x, y, w, h }); };

  /* 外牆 */
  add(0, 0, WORLD.w, B);
  add(0, WORLD.h - B, WORLD.w, B);
  add(0, 0, B, WORLD.h);
  add(WORLD.w - B, 0, B, WORLD.h);

  /* 障礙物（讓 A* 有事做） */
  const walls = [
    [120, 90, 180, 22], [120, 90, 22, 140],
    [420, 60, 22, 200], [420, 240, 200, 22],
    [640, 140, 22, 260], [150, 380, 220, 22],
    [520, 380, 24, 180], [700, 420, 150, 22],
    [260, 260, 100, 22], [260, 260, 22, 90],
  ];
  for (const w of walls) add(w[0], w[1], w[2], w[3]);

  /* 可活動範圍 = 整個世界（不然會被畫面上限卡住） */
  Physics.bounds = { l: 10, r: WORLD.w - 10, t: 10, b: WORLD.h - 10 };

  /* A* 圖（場地變了就要重建；大小是整個世界） */
  Pathfind.build({ cell: 8, pad: 2, w: WORLD.w, h: WORLD.h });

  /* 金幣：分散在角落與空曠處 */
  G_.coins = [];
  const spots = [[80, 80], [360, 80], [560, 90], [820, 80], [80, 300], [340, 200],
                 [560, 300], [820, 300], [80, 540], [360, 480], [600, 540], [820, 540]];
  for (const s of spots) G_.coins.push({ x: s[0], y: s[1], t: Math.random() * 6 });

  /* 玩家與追擊者 */
  G_.player = { x: 450, y: 320, dir: 'down', aim: { x: 0, y: 1 }, spr: new Sprite(10, true), walkT: 0 };
  G_.chasers = [];
  for (let i = 0; i < 3; i++) {
    G_.chasers.push({
      x: [80, 820, 450][i], y: [540, 80, 560][i],
      path: [], repathT: 0, speed: 46 + i * 8,
      spr: new Sprite(8, true), hitCd: 0,
    });
  }

  Camera.follow(G_.player, { x: 0, y: 0, w: WORLD.w, h: WORLD.h });
  Camera.lerp = 6;
}

function startGame() {
  buildLevel();
  G.state = 'play';
  G_.time = 0;
  G_.penalty = 0;
  G_.hitCd = 0;
  G_.best = Save.get('demo:best', null);
  G_.record = null;
  Sfx.play('start');
  Sfx.playMusic();          // 第一次點畫面/按鍵後才播，符合自動播放規則
}

/* M 鍵：音樂開關 */
function toggleMusic() {
  if (!Sfx.music) return;
  if (Sfx.music.paused) Sfx.playMusic(); else Sfx.stopMusic();
}

/* ---------------- 更新 ---------------- */
function update(dt) {
  if (Input.justPressed('debug')) Loop.toggleDebug();
  if (Input.justPressed('music')) toggleMusic();

  if (G.state === 'title') {
    if (Input.justPressed('confirm') || Input.justPressed('sword')) startGame();
    return;
  }
  if (G.state === 'win') {
    if (Input.justPressed('confirm') || Input.justPressed('sword') || Input.justPressed('restart')) startGame();
    return;
  }

  G_.time += dt;
  G_.hitCd = Math.max(0, G_.hitCd - dt);
  const p = G_.player;

  /* --- 移動（8 方向 / 搖桿） --- */
  const mv = Input.moveAxis();
  const moving = mv.x !== 0 || mv.y !== 0;
  if (moving) {
    const len = Math.hypot(mv.x, mv.y) || 1;
    p.aim.x = mv.x / len; p.aim.y = mv.y / len;
    const spd = 120 * (0.7 + 0.3 * mv.mag);
    Physics.moveAxis(p, (mv.x / len) * spd * dt, (mv.y / len) * spd * dt, { bw: 10, bh: 8, by: -8, margin: 0 });
    p.walkT += dt;
  }

  /* --- 金幣 --- */
  for (let i = G_.coins.length - 1; i >= 0; i--) {
    const c = G_.coins[i];
    c.t += dt;
    if (U.dist(c.x, c.y, p.x, p.y) < 14) {
      G_.coins.splice(i, 1);
      Fx.burst(c.x, c.y, '#ffd45e', 8, 90, { size: 2 });
      Sfx.play('coin');
      if (!G_.coins.length) winGame();
    }
  }

  /* --- 追擊者（A*） --- */
  for (const c of G_.chasers) {
    c.hitCd = Math.max(0, c.hitCd - dt);
    c.repathT -= dt;
    if (c.repathT <= 0) {
      c.repathT = 0.45;                                  // 每 0.45 秒重算一次路徑
      c.path = Pathfind.lineClear(c.x, c.y, p.x, p.y)
        ? [{ x: p.x, y: p.y }]
        : Pathfind.find(c.x, c.y, p.x, p.y);
    }
    const wp = c.path[0];
    if (wp) {
      const dx = wp.x - c.x, dy = wp.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 6) c.path.shift();
      Physics.moveAxis(c, (dx / d) * c.speed * dt, (dy / d) * c.speed * dt, { bw: 10, bh: 8, by: -8, margin: 0 });
      c.aim = { x: dx / d, y: dy / d };
    }
    /* 碰到玩家 → 罰 2 秒 */
    if (c.hitCd <= 0 && G_.hitCd <= 0 && U.dist(c.x, c.y, p.x, p.y) < 14) {
      G_.hitCd = 1.2;
      c.hitCd = 1.2;
      G_.penalty += 2;
      Fx.shake(4, 0.25);
      Fx.burst(p.x, p.y - 8, '#ff6b81', 10, 120, { size: 2 });
      Sfx.play('bump');
      buzz(24);
    }
  }
}

function winGame() {
  G.state = 'win';
  const score = Math.max(0, Math.round((G_.time + G_.penalty) * 10) / 10);
  const res = Save.addScore('demo:time', -score, { max: 5, meta: { sec: score } });   // 負數 = 越小越好
  G_.best = res.best < 0 ? -res.best : null;
  G_.record = res.isRecord;
  Sfx.play('win');
}

/* ---------------- 繪製 ---------------- */
function render() {
  // 觸控層是獨立畫布，每次繪製也要更新（包含標題／結束時清掉搖桿）。
  TouchUI.draw();
  const ctx = G.ctx;
  const SC = G.scale;
  Camera.apply(ctx, SC);                 // ★ 鏡頭（沒啟用時等於 (0,0)）
  ctx.imageSmoothingEnabled = false;

  /* 地板（棋盤花紋，只畫看得到的範圍） */
  ctx.fillStyle = '#2b3350';
  ctx.fillRect(Camera.x, Camera.y, GAME_W, GAME_H);
  ctx.fillStyle = '#323b5c';
  const cell = 40;
  const x0 = Math.floor(Camera.x / cell) * cell;
  const y0 = Math.floor(Camera.y / cell) * cell;
  for (let y = y0; y < Camera.y + GAME_H + cell; y += cell) {
    for (let x = x0; x < Camera.x + GAME_W + cell; x += cell) {
      if (((x / cell) + (y / cell)) % 2 === 0) ctx.fillRect(x, y, cell, cell);
    }
  }

  /* 障礙物 */
  for (const b of G_.blocks) {
    if (!Camera.visible(b.x, b.y, b.w, b.h)) continue;
    ctx.fillStyle = '#3f4a72';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#55628f';
    ctx.fillRect(b.x, b.y, b.w, 4);
  }

  if (G.state === 'title') { drawTitle(); return; }

  /* 金幣 */
  for (const c of G_.coins) {
    if (!Camera.visible(c.x - 8, c.y - 8, 16, 16)) continue;
    const bob = Math.sin(c.t * 5) * 2;
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(c.x, c.y + bob, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd45e';
    ctx.beginPath(); ctx.arc(c.x, c.y + bob, 3, 0, Math.PI * 2); ctx.fill();
  }

  /* 深度排序：玩家 + 追擊者 */
  const list = [];
  for (const c of G_.chasers) {
    list.push({ y: c.y, draw: () => {
      if (!Camera.visible(c.x - 10, c.y - 18, 20, 20)) return;
      shadow(c.x, c.y - 1, 6, 2.4, 0.22);
      const s = sheetOf(MANIFEST.hero.walk.down);
      c.spr.set(s, 8, true);
      c.spr.draw(c.x, c.y, {});
    } });
  }
  list.push({ y: G_.player.y, draw: () => {
    const p = G_.player;
    shadow(p.x, p.y - 1, 7, 2.8, 0.22);
    const s = sheetOf(MANIFEST.hero.walk.down);
    p.spr.set(s, p.walkT > 0 ? 12 : 6, true);
    p.spr.draw(p.x, p.y, {});
  } });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();

  Fx.draw();

  /* HUD（螢幕座標，不受鏡頭影響） */
  Camera.apply(ctx, SC);            // 先把 transform 還原成「世界」
  ctx.setTransform(SC, 0, 0, SC, 0, 0);
  drawHud();
}

function drawHud() {
  const p = G_.player;
  hudPanel(6, 6, 120, 16);
  text('金幣 ' + (12 - G_.coins.length) + ' / 12', 12, 10, { size: 8, shadow: false });
  const t = Math.round((G_.time + G_.penalty) * 10) / 10;
  hudPanel(6, 24, 120, 16);
  text('時間 ' + t.toFixed(1) + 's', 12, 28, { size: 8, shadow: false, color: G_.penalty > 0 ? '#ff9f9f' : '#fff8e7' });
  if (G_.best != null) text('最佳 ' + G_.best.toFixed(1) + 's', 132, 28, { size: 7, color: '#8fe36a' });

  if (G.state === 'win') {
    const ctx = G.ctx;
    ctx.fillStyle = 'rgba(11,14,28,0.72)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    text(G_.record ? '新紀錄！' : '完成！', GAME_W / 2, GAME_H / 2 - 30, { align: 'center', size: 16, color: G_.record ? '#ffe9a8' : '#fff8e7' });
    text('時間 ' + (Math.round((G_.time + G_.penalty) * 10) / 10).toFixed(1) + ' 秒', GAME_W / 2, GAME_H / 2 - 2, { align: 'center', size: 10 });
    const list = Save.scores('demo:time', 3);
    list.forEach((s, i) => {
      const sec = s.sec != null ? s.sec : -s.score;
      text((i + 1) + '. ' + sec.toFixed(1) + 's', GAME_W / 2, GAME_H / 2 + 16 + i * 11, {
        align: 'center', size: 7, color: i === 0 ? '#ffe9a8' : '#cfd8c0',
      });
    });
    text('點畫面 / Enter 再玩一次', GAME_W / 2, GAME_H - 30, { align: 'center', size: 7, color: '#8fe36a' });
  }
}

function drawTitle() {
  const ctx = G.ctx;
  ctx.fillStyle = 'rgba(11,14,28,0.72)';
  ctx.fillRect(Camera.x, Camera.y, GAME_W, GAME_H);
  text('TinyEngine', GAME_W / 2 + Camera.x, Camera.y + GAME_H / 2 - 46, { align: 'center', size: 22, color: '#ffe9a8' });
  text('捲動鏡頭・A* 追擊・排行榜・固定時間步', GAME_W / 2 + Camera.x, Camera.y + GAME_H / 2 - 16, { align: 'center', size: 8, color: '#cfd8c0' });
  const a = 0.5 + 0.5 * Math.sin(G.time * 4);
  ctx.globalAlpha = 0.5 + a * 0.45;
  text('Enter / 點畫面 開始', GAME_W / 2 + Camera.x, Camera.y + GAME_H / 2 + 16, { align: 'center', size: 10, color: '#ffe9a8' });
  ctx.globalAlpha = 1;
  text('WASD 移動　F3 除錯（碰撞框 + A* 路徑）', GAME_W / 2 + Camera.x, Camera.y + GAME_H - 24, { align: 'center', size: 6, color: '#8d97a8', shadow: false });
}

/* ---------------- 點擊 ---------------- */
G.tap = function () {
  if (G.state !== 'play') startGame();
  return true;
};

/* ---------------- 啟動 ---------------- */
window.addEventListener('load', async () => {
  Display.init(document.getElementById('game'));
  Input.init({ KeyM: 'music' });
  const label = document.getElementById('loading');
  await loadAll(MANIFEST, (p) => { if (label) label.textContent = '載入中… ' + Math.round(p * 100) + '%'; });
  /* 音檔（有就用音檔，沒有就退回合成音效） */
  await Sfx.loadClips({
    coin: 'assets/sfx/coin.wav',
    hit: 'assets/sfx/hit.wav',
    bump: 'assets/sfx/bump.wav',
    win: 'assets/sfx/win.wav',
  });
  Sfx.loadMusic('assets/bgm.wav', { loop: true, volume: 0.5 });
  if (label) label.remove();

  Screen.init();
  TouchUI.showIn = ['play'];
  TouchUI.setButtons([]);            // 這個 demo 只需要搖桿
  TouchUI.init();

  document.addEventListener('pointerdown', (e) => {
    if (G.state !== 'play') { if (G.tap) G.tap(e.clientX, e.clientY); }
  });

  buildLevel();
  G_.best = Save.get('demo:best', null);
  G.state = 'title';

  Loop.update = update;
  Loop.render = render;
  Loop.debugInfo = () => 'coins ' + G_.coins.length + '  cam ' + Math.round(Camera.x) + ',' + Math.round(Camera.y) + '  step ' + (Loop.fixedStep ? 'fixed' : 'var');
  Loop.drawHitboxes = () => {
    const ctx = G.ctx;
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255,80,120,0.6)';
    for (const s of Physics.solids) ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w, s.h);
    ctx.strokeStyle = 'rgba(120,255,160,0.9)';
    const p = G_.player;
    ctx.strokeRect(p.x - 5 + 0.5, p.y - 8 + 0.5, 10, 8);
    /* A* 路徑 */
    ctx.strokeStyle = 'rgba(255,233,168,0.85)';
    for (const c of G_.chasers) {
      if (c.path.length < 1) continue;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 4);
      for (const w of c.path) ctx.lineTo(w.x, w.y - 4);
      ctx.stroke();
    }
  };
  Loop.start();
});
