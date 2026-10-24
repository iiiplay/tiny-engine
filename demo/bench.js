'use strict';
/* ============================================================
   demo/bench.js — 效能台（給人看，也給 CI 看）
   用法： bench.html?n=200&cull=1&w=2400&h=1600
   結果寫進 window.__bench = { n, cull, fps, renderMs, updateMs, frames }

   重點：驗證「捲動鏡頭 + 剔除」在大地圖＋大量實體時還撐得住。
   ============================================================ */

const Q = new URLSearchParams(location.search);
const N = Math.max(1, parseInt(Q.get('n') || '200', 10));
const CULL = Q.get('cull') !== '0';
const WORLD = { w: parseInt(Q.get('w') || '2400', 10), h: parseInt(Q.get('h') || '1600', 10) };

GAME_W = 480;
Loop.fixedStep = 1 / 60;
Camera.cullEnabled = CULL;

const MANIFEST = { hero: { walk: { down: assetDef('assets/hero.png', 6, 16) } } };

Sfx.register({});

const B = {
  player: null,
  chasers: [],
  blocks: [],
  fpsHist: [],
  visCount: 0,
  lastRender: 0,
};

function build() {
  Physics.clear();
  B.blocks = [];
  const add = (x, y, w, h) => { Physics.add(x, y, w, h); B.blocks.push({ x, y, w, h }); };
  const T = 10;
  add(0, 0, WORLD.w, T); add(0, WORLD.h - T, WORLD.w, T);
  add(0, 0, T, WORLD.h); add(WORLD.w - T, 0, T, WORLD.h);

  /* 散落障礙物（讓剔除有意義：很多物件在畫面外） */
  for (let i = 0; i < 60; i++) {
    const x = 40 + (i * 137) % (WORLD.w - 160);
    const y = 40 + (i * 211) % (WORLD.h - 160);
    add(x, y, 24 + (i % 3) * 30, 20 + (i % 4) * 26);
  }
  Physics.bounds = { l: T, r: WORLD.w - T, t: T, b: WORLD.h - T };
  Pathfind.build({ cell: 12, w: WORLD.w, h: WORLD.h, pad: 2 });

  B.player = { x: WORLD.w / 2, y: WORLD.h / 2, spr: new Sprite(10, true), t: 0 };
  Camera.follow(B.player, { x: 0, y: 0, w: WORLD.w, h: WORLD.h });
  Camera.snapTo(B.player.x - GAME_W / 2, B.player.y - GAME_H / 2);

  B.chasers = [];
  for (let i = 0; i < N; i++) {
    B.chasers.push({
      x: 30 + (i * 97) % (WORLD.w - 60),
      y: 30 + (i * 173) % (WORLD.h - 60),
      path: [], repathT: (i % 20) * 0.03,      // ★ 錯開重算時機，避免同一帧爆量
      speed: 40 + (i % 5) * 8,
      spr: new Sprite(8, true),
    });
  }
}

function update(dt) {
  B.player.t += dt;
  /* 玩家繞圓走，強迫鏡頭一直捲動 */
  const a = B.player.t * 0.35;
  B.player.x = WORLD.w / 2 + Math.cos(a) * (WORLD.w * 0.3);
  B.player.y = WORLD.h / 2 + Math.sin(a * 1.3) * (WORLD.h * 0.28);

  for (const c of B.chasers) {
    c.repathT -= dt;
    if (c.repathT <= 0) {
      c.repathT = 0.6 + Math.random() * 0.4;
      c.path = Pathfind.lineClear(c.x, c.y, B.player.x, B.player.y)
        ? [{ x: B.player.x, y: B.player.y }]
        : Pathfind.find(c.x, c.y, B.player.x, B.player.y);
    }
    const wp = c.path[0];
    if (!wp) continue;
    const dx = wp.x - c.x, dy = wp.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 8) { c.path.shift(); continue; }
    Physics.moveAxis(c, (dx / d) * c.speed * dt, (dy / d) * c.speed * dt, { bw: 10, bh: 8, by: -8 });
  }
}

function render() {
  const ctx = G.ctx;
  Camera.apply(ctx, G.scale);
  ctx.imageSmoothingEnabled = false;

  /* 地板 */
  ctx.fillStyle = '#2b3350';
  ctx.fillRect(Camera.x, Camera.y, GAME_W, GAME_H);
  ctx.fillStyle = '#323b5c';
  const cell = 64;
  const x0 = Math.floor(Camera.x / cell) * cell;
  const y0 = Math.floor(Camera.y / cell) * cell;
  for (let y = y0; y < Camera.y + GAME_H + cell; y += cell) {
    for (let x = x0; x < Camera.x + GAME_W + cell; x += cell) {
      if (((x / cell) + (y / cell)) % 2 === 0) ctx.fillRect(x, y, cell, cell);
    }
  }

  /* 障礙物（剔除） */
  for (const b of B.blocks) {
    if (!Camera.visible(b.x, b.y, b.w, b.h)) continue;
    ctx.fillStyle = '#3f4a72';
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }

  /* 實體（剔除 + y 排序） */
  const sheet = sheetOf(MANIFEST.hero.walk.down);
  const list = [];
  for (const c of B.chasers) {
    if (!Camera.visible(c.x - 10, c.y - 18, 20, 20)) continue;
    list.push(c);
  }
  B.visCount = list.length;
  list.push(B.player);
  list.sort((a, b) => a.y - b.y);
  for (const e of list) {
    shadow(e.x, e.y - 1, 6, 2.4, 0.2);
    drawSheet(sheet, 0, e.x, e.y, {});
  }

  /* ---- HUD（螢幕座標，不受鏡頭影響）---- */
  ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);

  /* 左上：設定與統計 */
  hudPanel(6, 6, 240, 46);
  text('BENCH  n=' + N + '   剔除 ' + (CULL ? 'ON' : 'OFF'), 12, 9, { size: 8, shadow: false });
  text('同屏實體 ' + B.visCount + ' / ' + N + '   世界 ' + WORLD.w + 'x' + WORLD.h, 12, 21, { size: 6.5, shadow: false, color: '#cfd8c0' });
  text('render ' + B.lastRender.toFixed(2) + ' ms   update ' + Loop.ms + ' ms', 12, 33, { size: 6.5, shadow: false, color: '#8fe36a' });

  /* 右上：大字 FPS + 折線圖 */
  const px = GAME_W - 118, py = 6;
  hudPanel(px, py, 112, 46);
  const fpsNow = Loop.fps;
  const col = fpsNow >= 55 ? '#8fe36a' : fpsNow >= 40 ? '#ffe9a8' : '#ff8fa3';
  text(String(fpsNow), px + 56, py + 6, { align: 'center', size: 20, color: col, shadow: false });
  text('FPS', px + 56, py + 30, { align: 'center', size: 6, color: '#cfd8c0', shadow: false });
  /* 折線圖（最近 60 個樣本） */
  const hist = B.fpsHist;
  ctx.strokeStyle = 'rgba(143,227,106,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gw = 52, gh = 18, gx = px + 56, gy = py + 20;
  hist.forEach((v, i) => {
    const x = gx - gw / 2 + (i / Math.max(1, hist.length - 1)) * gw;
    const y = gy + 8 - Math.min(1, v / 70) * gh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  /* 60fps 基準線 */
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(gx - gw / 2, gy + 8 - Math.min(1, 60 / 70) * gh);
  ctx.lineTo(gx + gw / 2, gy + 8 - Math.min(1, 60 / 70) * gh);
  ctx.stroke();

  /* 跑完 → 結果框 */
  if (window.__bench) {
    const r = window.__bench;
    hudPanel(GAME_W / 2 - 110, GAME_H / 2 - 34, 220, 68);
    text('完成', GAME_W / 2, GAME_H / 2 - 26, { align: 'center', size: 10, color: '#ffe9a8' });
    text('fps ' + r.fps + '   render ' + r.renderMs + ' ms', GAME_W / 2, GAME_H / 2 - 8, { align: 'center', size: 8, shadow: false });
    text('同屏 ' + r.visChasers + ' / ' + r.n + '   世界 ' + r.world, GAME_W / 2, GAME_H / 2 + 8, { align: 'center', size: 7, shadow: false, color: '#cfd8c0' });
  }
}

window.addEventListener('load', async () => {
  Display.init(document.getElementById('game'));
  Input.init({});
  await loadAll(MANIFEST);
  const label = document.getElementById('loading');
  if (label) label.remove();
  build();
  Loop.update = update;
  Loop.render = render;

  /* 量測：跑 3 秒後把結果寫進 window.__bench */
  Loop.start();
  let frames = 0;
  const t0 = performance.now();
  const renderMs = [];
  const origRender = render;
  Loop.render = () => {
    const a = performance.now();
    origRender();
    B.lastRender = performance.now() - a;
    renderMs.push(B.lastRender);
  };
  /* 每 0.25 秒記一個 fps 樣本給折線圖 */
  setInterval(() => {
    if (Loop.fps > 0) { B.fpsHist.push(Loop.fps); if (B.fpsHist.length > 60) B.fpsHist.shift(); }
  }, 250);
  const iv = setInterval(() => {
    frames++;
    if (performance.now() - t0 > 3000) {
      clearInterval(iv);
      const sorted = renderMs.slice().sort((a, b) => a - b);
      window.__bench = {
        n: N,
        cull: CULL,
        world: WORLD.w + 'x' + WORLD.h,
        fps: Loop.fps,
        renderMs: Math.round((sorted[Math.floor(sorted.length / 2)] || 0) * 100) / 100,
        updateMs: Loop.ms,
        visChasers: B.chasers.filter((c) => Camera.visible(c.x - 10, c.y - 18, 20, 20)).length,
      };
      document.title = 'bench-done';
    }
  }, 60);
});
