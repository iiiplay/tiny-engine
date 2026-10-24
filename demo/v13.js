'use strict';
/* ============================================================
   demo/v13.js — tiny-engine v1.3 驗收頁
   驗：Scene 切換 / 覆蓋層 / UI 熱區與按鈕 / Save.offline（含上限與時鐘倒退）
       drawDirSheet（4 方向）/ Loop.renderRate（省電）/ UI 大量按鈕的成本
   ============================================================ */

const W = 480, H = 270;
const COL = {
  bg: '#121a26', line: '#2b374d', cream: '#f2e8d5', dim: '#8b98ad',
  gold: '#f5c451', green: '#7ec08d', red: '#e26a6a', blue: '#7fb3e8',
};

window.MANIFEST = {
  hero: { dir: assetDef('assets/dir4.png', 4, 16, 16, { rows: 4 }) },
};

const ST = {
  dir: 'down', rate: 0, offline: null, pets: 0, log: [],
};

/* ---------------- 場景 ---------------- */
function bg() {
  G.ctx.fillStyle = COL.bg;
  G.ctx.fillRect(0, 0, W, H);
  G.ctx.fillStyle = '#182234';
  G.ctx.fillRect(0, H - 60, W, 60);
  G.ctx.fillStyle = COL.line;
  G.ctx.fillRect(0, H - 60, W, 1);
}

function drawHero(x, y, sc) {
  const t = Scene.t;
  const walking = Scene.name === 'battle';
  const frame = Math.floor(t * (walking ? 9 : 4)) % 4;
  drawDirSheet(sheetOf(window.MANIFEST.hero.dir), ST.dir, frame, x, y, { scale: sc || 2 });
}

function chipRow(list, y) {
  let x = 12;
  for (const it of list) x += UI.chip(x, y, it[0], { color: it[1] }) + 6;
}

/* 場景一：營地 */
Scene.register('camp', {
  enter() {
    ST.dir = 'down';
  },
  render() {
    bg();
    drawHero(96, H - 58, 2);

    text('tiny-engine v1.3', 12, 12, { size: 9, color: COL.gold });
    text('Scene / UI / 離線 / 4 方向 / 節流', 12, 26, { size: 6, color: COL.dim });
    chipRow([
      ['scene: ' + Scene.name, COL.blue],
      ['fps ' + Loop.fps, COL.green],
      ['render ' + Loop.renderCount, COL.dim],
      ['rate ' + (ST.rate || '全速'), COL.gold],
      ['熱區 ' + UI._hotN, COL.dim],
    ], 38);

    UI.button('toBattle', 250, 70, 100, 18, '去戰鬥 →', { size: 6 });
    UI.button('offline', 250, 94, 100, 18, '模擬離開 2 小時', { size: 6 });
    UI.button('toggleRate', 250, 118, 100, 18,
      ST.rate ? '節流中（10 fps）' : '開啟繪製節流', { size: 6, color: COL.gold });
    UI.button('pet', 250, 142, 100, 18, '摸一下（' + ST.pets + '）', { size: 6 });
    UI.button('overlay', 250, 166, 100, 18, '開覆蓋層', { size: 6 });
    UI.button('reset', 360, 70, 100, 18, '清除離線時間', { size: 6, color: COL.dim });

    if (ST.offline) {
      const o = ST.offline;
      const line = o.first
        ? '第一次記錄時間（還沒有離線收益）'
        : '離開 ' + (o.away / 3600).toFixed(1) + ' 小時 → +' + Math.round(o.gain) +
          (o.capped ? '（上限 8 小時）' : '（未達上限）');
      text(line, 12, H - 34, { size: 6, color: o.capped ? COL.gold : COL.green });
    }
    text('點按鈕看 Scene / UI 熱區有沒有正常', 12, H - 20, { size: 5, color: '#5c6779' });
    if (UI.hover) text('hover: ' + UI.hover.id, W - 12, H - 20, { size: 5, color: COL.dim, align: 'right' });
  },
});

/* 場景二：戰鬥（驗 drawDirSheet 換方向） */
Scene.register('battle', {
  enter() { ST.dir = 'right'; },
  update(dt) {
    ST.dir = Math.floor(Scene.t / 2) % 4 === 0 ? 'right' : (Math.floor(Scene.t / 2) % 4 === 1 ? 'up' : (Math.floor(Scene.t / 2) % 4 === 2 ? 'left' : 'down'));
  },
  render() {
    bg();
    /* 假的地板格線（順便看 render 成本） */
    G.ctx.globalAlpha = 0.28;
    G.ctx.strokeStyle = '#2b374d';
    for (let x = 0; x < W; x += 24) {
      G.ctx.beginPath(); G.ctx.moveTo(x + 0.5, H - 60); G.ctx.lineTo(x + 0.5, H); G.ctx.stroke();
    }
    G.ctx.globalAlpha = 1;

    drawHero(W / 2, H - 58, 2);
    text('battle scene · 方向 ' + ST.dir, 12, 12, { size: 8, color: COL.cream });
    text('每 2 秒換一次面向（drawDirSheet）', 12, 26, { size: 6, color: COL.dim });
    UI.button('toCamp', W / 2 - 50, H - 40, 100, 18, '← 回營地', { size: 6 });
  },
});

/* 每帧開始先清熱區（Scene 的 beforeRender 鉤子） */
Scene.beforeRender = () => UI.beginFrame();

/* ---------------- 互動 ---------------- */
function act(id) {
  const o = { toBattle: () => Scene.go('battle'), toCamp: () => Scene.go('camp') };
  if (o[id]) return o[id]();
  if (id === 'pet') { ST.pets++; Sfx.play('pet'); return; }
  if (id === 'offline') { ST.offline = away(2 * 3600); return; }
  if (id === 'reset') { Save.del('demo:ts'); ST.offline = null; return; }
  if (id === 'toggleRate') {
    ST.rate = ST.rate ? 0 : 10;
    Loop.renderRate = ST.rate;
    return;
  }
  if (id === 'overlay') {
    Scene.overlay({
      render() {
        G.ctx.fillStyle = 'rgba(6,9,16,0.72)';
        G.ctx.fillRect(0, 0, W, H);
        text('這是 Scene.overlay', W / 2, 96, { size: 9, color: COL.gold, align: 'center' });
        text('背景的模擬還在跑（fps ' + Loop.fps + '）', W / 2, 112, { size: 6, color: COL.dim, align: 'center' });
        UI.button('closeOverlay', W / 2 - 40, 136, 80, 18, '關閉', { size: 6 });
      },
    });
    return;
  }
  if (id === 'closeOverlay') return Scene.closeOverlay();
}

/* 讓測試可以模擬「離開 N 秒」 */
function away(sec) {
  Save.set('demo:ts', Date.now() - sec * 1000);
  return Save.offline('demo', { hours: 8, rate: 120 });
}

/* 大量按鈕 / 熱區的成本（效能驗收） */
function benchUI(n) {
  G.ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);
  UI.beginFrame();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) UI.button('b' + i, (i * 13) % 460, (i * 7) % 250, 30, 10, 'ok', { size: 5 });
  const t1 = performance.now();
  for (let i = 0; i < n; i++) UI.hitAt((i * 13) % 480, (i * 7) % 270);
  const t2 = performance.now();
  return { n, hot: UI._hotN, drawMs: +(t1 - t0).toFixed(3), hitMs: +(t2 - t1).toFixed(3) };
}

/* ---------------- 啟動 ---------------- */
function boot() {
  const canvas = document.getElementById('game');
  Display.fit(canvas, { w: W, h: H, scale: 2 });
  Input.init();
  Loop.fixedStep = 1 / 60;
  Loop.autoPauseWhenHidden = true;
  Loop.watchVisibility();
  Scene.attach();
  UI.bind(canvas, act);
  loadAll(() => {
    Sfx.register({ pet() { this.tone(760, 980, 0.08, 'sine', 0.1); } });
    Scene.go('camp');
    Loop.start();
  });
}

window.DEV = {
  scene: Scene, loop: Loop, ui: UI, st: ST, away, benchUI,
  hot: () => UI._hot.slice(0, UI._hotN).map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })),
};

addEventListener('DOMContentLoaded', boot);
