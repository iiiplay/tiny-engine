/*! tiny-engine — 單檔版（由 tools/pack.py 產生，請勿手改）
 *  來源：engine/*.js  共 18 支
 *  授權：MIT
 */
'use strict';
/* ---- engine/util.js ---- */
/* ============================================================
   engine/util.js — 世界尺寸、小工具、方向表
   ============================================================ */

const TINY_ENGINE_VERSION = '1.8.1';

let GAME_W = 480;     // 邏輯寬度（遊戲可在自己的腳本裡覆寫）
let GAME_H = 240;     // 邏輯高度「依螢幕比例自動生成」→ 滿版且不裁切
let SCALE = 3;        // 實際倍率由 Display.layout() 依螢幕/DPR 決定（會動態調整）

/* ---------------- 小工具 ---------------- */
const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a = 1, b = 0) => b + Math.random() * (a - b),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[(Math.random() * arr.length) | 0],
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  sign: (v) => (v < 0 ? -1 : 1),
  overlap: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
  // 決定性亂數（場景裝飾每次一致）
  seeded: (seed) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  },
};
const DIRV = { down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] };

/* ---- engine/core.js ---- */
/* ============================================================
   engine/core.js — 全域 App 物件 G、畫面配置 Display、主迴圈 Loop
   ============================================================ */

const G = {
  canvas: null, ctx: null,
  time: 0, state: 'loading',      // 由遊戲使用（state 名稱遊戲自己定義）
  scale: 3,                       // 畫布內部倍率
  cssScale: 1,                    // 畫布 CSS 倍率
  needRebuild: false,             // 版面變了 → 遊戲重建關卡
  safe: { l: 0, r: 0, t: 0, b: 0 },   // 被 cover 裁掉的邏輯邊界
  view: { l: 12, r: GAME_W - 12, t: 16, b: GAME_H - 10 },
  lockH: false,                   // true = 不自己算高度（區網加入端沿用房主的）
};

/* ============================================================
   Display — 畫布尺寸 / 邏輯高度 / 安全區
   ============================================================ */
const Display = {
  /* 依螢幕比例決定場地高度（不裁切），並把畫布鋪滿螢幕 */
  layout() {
    if (!G.canvas) return;
    const W = innerWidth, H = innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    if (!G.lockH) {
      const wantH = U.clamp(Math.round(GAME_W * H / W), 210, 270);
      if (wantH !== GAME_H) { GAME_H = wantH; G.needRebuild = true; }
    }

    let s = Math.max(W / GAME_W, H / GAME_H);
    const sMax = Math.min(W / (GAME_W - 20), H / (GAME_H - 20));
    if (s > sMax) s = sMax;
    G.cssScale = s;
    G.canvas.style.width = Math.round(GAME_W * s) + 'px';
    G.canvas.style.height = Math.round(GAME_H * s) + 'px';

    const viewW = W / s, viewH = H / s;
    const cropX = Math.max(0, (GAME_W - viewW) / 2);
    const cropY = Math.max(0, (GAME_H - viewH) / 2);
    G.safe = { l: cropX, r: cropX, t: cropY, b: cropY };
    G.view = {
      l: 12 + cropX, r: GAME_W - 12 - cropX,
      t: 16 + cropY, b: GAME_H - 10 - cropY,
    };

    const bs = U.clamp(s * dpr, 2, 6);
    G.scale = Math.round(bs * 2) / 2;
    G.canvas.width = Math.round(GAME_W * G.scale);
    G.canvas.height = Math.round(GAME_H * G.scale);
    G.ctx = G.canvas.getContext('2d');
    G.ctx.imageSmoothingEnabled = false;
  },

  /* 螢幕座標 → 邏輯座標 */
  toWorld(clientX, clientY) {
    const r = G.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * GAME_W,
      y: ((clientY - r.top) / r.height) * GAME_H,
    };
  },

  /* 固定邏輯尺寸的版面（小卡片 / 多視窗 / 桌寵用）
     不像 layout() 會填滿整個視窗，這裡由呼叫端決定邏輯尺寸與縮放倍率。
     Display.fit(canvas, { w: 220, h: 130 })        // 自動挑 0.25 倍率
     Display.fit(canvas, { w: 220, h: 130, scale: 2 })  // 固定 2 倍
     回傳實際使用的 cssScale。 */
  fit(canvas, opt) {
    opt = opt || {};
    const w = opt.w || GAME_W;
    const h = opt.h || GAME_H;
    GAME_W = w;
    GAME_H = h;
    const dpr = opt.dpr != null ? opt.dpr : Math.min(window.devicePixelRatio || 1, 2);
    let s = opt.scale;
    if (s == null) {
      const maxW = opt.maxW || innerWidth;
      const maxH = opt.maxH || innerHeight;
      s = Math.min(maxW / w, maxH / h, opt.maxScale || 3);
      s = Math.max(0.5, Math.floor(s * 4) / 4);
    }
    G.cssScale = s;
    G.scale = Math.round(s * dpr * 2) / 2;
    canvas.style.width = Math.round(w * s) + 'px';
    canvas.style.height = Math.round(h * s) + 'px';
    canvas.width = Math.round(w * G.scale);
    canvas.height = Math.round(h * G.scale);
    G.canvas = canvas;
    G.ctx = canvas.getContext('2d');
    G.ctx.imageSmoothingEnabled = false;
    G.ctx.textRendering = 'geometricPrecision';
    return s;
  },

  init(canvas) {
    G.canvas = canvas;
    G.ctx = canvas.getContext('2d');
    G.ctx.imageSmoothingEnabled = false;
    G.ctx.textRendering = 'geometricPrecision';
    this.layout();
    const relayout = () => {
      this.layout();
      if (typeof TouchUI !== 'undefined' && TouchUI.enabled) TouchUI.resize();
    };
    addEventListener('resize', relayout);
    addEventListener('orientationchange', () => setTimeout(relayout, 150));
  },
};

/* ============================================================
   Camera — 捲動鏡頭（單螢幕遊戲不需要它，保持 enabled = false）
   ============================================================ */
const Camera = {
  enabled: false,
  x: 0, y: 0,                 // 世界座標：畫面左上角
  lerp: 8,                    // 跟隨平滑度（越大越貼）
  target: null,               // { x, y } 或函式
  bounds: null,               // { x, y, w, h } 世界邊界（不讓鏡頭露出邊）
  offsetY: -8,                // 讓角色比畫面中央略低
  view: null,                 // v1.5：只捲「畫面的一塊」（例如 HUD 下方的遊戲區）
  shakeT: 0, shakeMag: 0,     // v1.5：震動（爆炸、受擊）
  sx: 0, sy: 0,               // 這一帧的震動位移

  /* 直接把鏡頭對準某點（不插值） */
  snapTo(x, y) {
    this.x = x; this.y = y;
    this.clamp();
  },

  follow(obj, bounds) {
    this.enabled = true;
    this.target = obj;
    if (bounds) this.bounds = bounds;
    this.update(1);
    return this;
  },

  /* v1.5：只捲 sub-viewport（例如 HUD 16px 下面的遊戲區）
     Camera.setView(240, 208) → 之後 clamp / 置中都用這個尺寸 */
  setView(w, h) {
    this.view = (w && h) ? { w, h } : null;
    return this;
  },

  /* 畫面可見的邏輯範圍 */
  viewW() { return (this.view && this.view.w) || GAME_W; },
  viewH() { return (this.view && this.view.h) || GAME_H; },

  clamp() {
    const b = this.bounds;
    if (!b) {
      this.x = U.clamp(this.x, 0, Math.max(0, GAME_W - this.viewW()));
      this.y = U.clamp(this.y, 0, Math.max(0, GAME_H - this.viewH()));
      return;
    }
    this.x = U.clamp(this.x, b.x, b.x + Math.max(0, b.w - this.viewW()));
    this.y = U.clamp(this.y, b.y, b.y + Math.max(0, b.h - this.viewH()));
  },

  /* 震動（mag = 幾 px，t = 幾秒）；每帧只抖一次，apply/push 會吃到同一個位移 */
  shake(mag, t) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
    return this;
  },

  update(dt) {
    this._shakeStep(dt);
    if (!this.enabled) return;
    const t = typeof this.target === 'function' ? this.target() : this.target;
    if (!t) return;
    const k = Math.min(1, this.lerp * dt);
    this.x += (t.x - this.viewW() / 2 - this.x) * k;
    this.y += (t.y + this.offsetY - this.viewH() / 2 - this.y) * k;
    this.clamp();
  },

  /* 把 camera 套到 ctx（scale 通常是 G.scale）
     注意：這支會 setTransform，會蓋掉你原本的裁切/位移。
     要「只捲遊戲區、HUD 不跟著動」請用 push()/pop()。 */
  apply(ctx, scale) {
    const sx = -Math.round(this.x + this.sx) * (scale || 1);
    const sy = -Math.round(this.y + this.sy) * (scale || 1);
    ctx.setTransform(scale || 1, 0, 0, scale || 1, sx, sy);
  },

  _shakeStep(dt) {
    if (this.shakeT <= 0) { this.sx = 0; this.sy = 0; this.shakeMag = 0; return; }
    this.shakeT -= dt;
    const s = this.shakeMag * Math.max(0, this.shakeT / Math.max(0.001, this.shakeT + dt));
    this.sx = U.rand(-s, s);
    this.sy = U.rand(-s, s);
    if (this.shakeT <= 0) { this.sx = 0; this.sy = 0; this.shakeMag = 0; }
  },

  /* v1.5：可組合的鏡頭（save → 裁切 → 位移），畫完呼叫 pop() 還原
       Camera.push(ctx, G.scale, { x: 0, y: 16, clip: {x:0,y:16,w:240,h:208} });
       ...畫世界（世界座標）...
       Camera.pop(ctx);
     之後照樣可以在同一帧畫 HUD（不會被鏡頭影響）。 */
  push(ctx, scale, opt) {
    opt = opt || {};
    ctx.save();
    if (opt.clip) {
      const c = opt.clip;
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
    }
    ctx.setTransform(scale || 1, 0, 0, scale || 1, 0, 0);
    ctx.translate((opt.x || 0) - Math.round(this.x + this.sx),
      (opt.y || 0) - Math.round(this.y + this.sy));
    return ctx;
  },

  pop(ctx) { ctx.restore(); },

  /* 世界座標 → 邏輯螢幕座標（給 UI/點擊用） */
  toScreen(x, y) { return { x: x - this.x, y: y - this.y }; },

  /* 粗略剔除：這個矩形在畫面上嗎（cullEnabled = false 可關掉做對照） */
  cullEnabled: true,
  visible(x, y, w, h) {
    if (!this.enabled || !this.cullEnabled) return true;
    return x + w >= this.x && x <= this.x + this.viewW() && y + h >= this.y && y <= this.y + this.viewH();
  },
};

/* ============================================================
   Loop — 固定上限的 dt、背景分頁補跑、hitstop、除錯 overlay
   遊戲注入： Loop.update(dt)、Loop.render()、Loop.drawDebug()
   ============================================================ */
const Loop = {
  update: null,
  render: null,
  fps: 0,
  ms: 0,
  /* 固定時間步：0 = 用真實 dt（預設，手感最直接）
     >0  = 固定步長（例：1/60，物理決定性、可重播、連線更穩） */
  fixedStep: 0,
  maxSteps: 5,
  maxDelta: 0.25,             // 單次最多補 250ms；長時間停頓不無限追趕
  /* 繪製節流：0 = 每帧都畫；>0 = 每秒最多畫幾次（省電，模擬照跑）
     例：陪伴類遊戲切到背景/專注模式時 `Loop.renderRate = 4`，
         摺疊起來時 `Loop.renderPaused = true`（模擬仍然推進）。 */
  renderRate: 0,
  renderPaused: false,
  renderCount: 0,
  _lastRenderAt: 0,
  _last: 0,
  _lastRaf: 0,
  _acc: 0,
  _fixedAcc: 0,
  _frames: 0,
  _showDebug: false,

  start() {
    this._last = performance.now();
    this._lastRaf = this._last;
    /* 分頁切到背景時 requestAnimationFrame 會被暫停 → 用 timer 補跑
       （區網房主必須持續模擬並送狀態） */
    setInterval(() => {
      const now = performance.now();
      if (now - this._lastRaf > 120) this.tick(now);
    }, 60);
    requestAnimationFrame((ts) => this.frame(ts));
  },

  frame(ts) {
    this._lastRaf = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.tick(ts);
  },

  tick(ts) {
    // timer 與 rAF 交接時，較舊的時間戳不應倒退時鐘。
    if (ts < this._last) return;
    const raw = Math.min(this.maxDelta, Math.max(0, (ts - this._last) / 1000 || 0));
    this._last = ts;

    const t0 = performance.now();
    if (this.fixedStep > 0) {
      /* 固定步長：把真實時間累積起來，切成固定大小的步 */
      this._fixedAcc += raw;
      let steps = 0;
      while (this._fixedAcc >= this.fixedStep && steps < this.maxSteps) {
        this._fixedAcc -= this.fixedStep;
        this.step(this.fixedStep);
        steps++;
      }
      if (steps >= this.maxSteps) this._fixedAcc = 0;   // 落後太多就丟掉，避免雪崩
    } else {
      // 背景 timer 約 60ms 一次：保留經過時間，但每步不超過 50ms，避免穿牆。
      let remaining = raw;
      let steps = 0;
      do {
        const dt = Math.min(0.05, remaining);
        this.step(dt);
        remaining -= dt;
        steps++;
      } while (remaining > 1e-10 && steps < this.maxSteps);
    }

    /* 繪製（可節流 / 可暫停）；模擬與 Camera 不受影響 */
    if (this.render && !this.renderPaused) {
      const now2 = performance.now();
      if (this.renderRate <= 0 || now2 - this._lastRenderAt >= 1000 / this.renderRate) {
        this._lastRenderAt = now2;
        this.renderCount++;
        this.render();
      }
    }
    if (Camera) Camera.update(raw);

    this._frames++;
    this._acc += raw;
    if (this._acc >= 0.5) {
      this.fps = Math.round(this._frames / this._acc);
      this.ms = Math.round((this.ms + (performance.now() - t0)) * 50) / 100;
      this._frames = 0;
      this._acc = 0;
    }
    if (this._showDebug && typeof this.drawDebug === 'function') this.drawDebug();
  },

  /* 跑一個邏輯步（固定步長時會被呼叫多次） */
  step(dt) {
    let d = dt;
    if (Fx.freezeT > 0) { Fx.freezeT -= dt; d = 0; }
    /* 引擎子系統：觸控狀態合併、區網收送 */
    if (typeof TouchUI !== 'undefined' && TouchUI.enabled) TouchUI.update();
    if (typeof Net !== 'undefined' && Net.active) Net.update(d);
    Fx.update(d);
    if (this.update) this.update(d);
    Input.endFrame();
  },

  toggleDebug() {
    this._showDebug = !this._showDebug;
    return this._showDebug;
  },

  /* 配合 document.hidden：分頁在背景時不畫（rAF 本來就會停，這裡補保險） */
  autoPauseWhenHidden: false,
  watchVisibility() {
    if (this._visBound) return this;
    this._visBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.autoPauseWhenHidden) return;
      this.renderPaused = document.hidden;
    });
    return this;
  },

  /* ---- 除錯 overlay（F3）：FPS / 每帧成本 / 遊戲自訂資訊 / 碰撞框 ---- */
  debugInfo: null,        // 遊戲注入：() => '自訂一行文字'
  drawHitboxes: null,     // 遊戲注入：() => 畫碰撞框

  drawDebug() {
    const ctx = G.ctx;
    ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);
    if (Camera && Camera.enabled) ctx.translate(-Math.round(Camera.x), -Math.round(Camera.y));
    if (typeof Fx !== 'undefined') Fx.draw();
    if (this.drawHitboxes) this.drawHitboxes();

    const y0 = Math.round(G.safe.t) + 30;
    const lines = [
      'F3  dev  ' + this.fps + ' fps  ' + this.ms + ' ms',
      this.debugInfo ? this.debugInfo() : '',
    ];
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#0b0e1c';
    ctx.fillRect(4, y0 - 2, 132, 11 * lines.length + 4);
    ctx.globalAlpha = 1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) text(lines[i], 7, y0 + i * 11, { size: 6, color: '#7dffa0', shadow: false });
    }
  },
};

/* ---- engine/assets.js ---- */
/* ============================================================
   engine/assets.js — 資源載入、sprite sheet 分析、腳底對齊繪製、白色剪影
   ============================================================ */

/* ---------------- 資源 ---------------- */
const ASSETS = {};   // src -> Image
const SHEETS = {};   // "src|frames|fw|rows|fh" -> {img, frames, fw, h, foot, white}
const WHITES = {};   // src -> 白色剪影 canvas（同一張圖只做一次）

function makeWhite(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/* 手寫素材表用：assetDef(src, frames, foot, fw, { rows, fh })
   rows > 1 代表「N 列 × frames 欄」的動畫表（例如 4 方向 × 4 影格） */
function assetDef(src, frames, foot, fw, opt) {
  opt = opt || {};
  return { src, frames: frames || 1, foot: foot, fw: fw, rows: opt.rows || 1, fh: opt.fh };
}

/* v1.5.1：快取 key 加上 frames / fw / rows / fh
   以前只用 src → 同一張圖用兩種切法（例如 manifest 用 1 格、遊戲用 6 格）
   後面那個會被前面蓋掉，動畫就變成一整張圖。 */
function sheetOf(def) {
  if (!def || !def.src) return null;
  const rows = def.rows || 1;
  const key = def.src + '|' + (def.frames || 1) + '|' + (def.fw || 0) + '|' + rows + '|' + (def.fh || 0);
  let s = SHEETS[key];
  if (!s) {
    const img = ASSETS[def.src];
    if (!img) return null;
    const fh = def.fh || (rows > 1 ? Math.floor(img.height / rows) : img.height);
    if (!WHITES[def.src]) WHITES[def.src] = makeWhite(img);
    s = SHEETS[key] = {
      src: def.src,
      img,
      frames: def.frames || 1,
      fw: def.fw || Math.floor(img.width / (def.frames || 1)),
      h: fh,
      rows,
      fh,
      foot: def.foot != null ? def.foot : fh,
      white: WHITES[def.src],
    };
  }
  return s;
}

function collectSheets(manifest) {
  const out = {};
  const walk = (o) => {
    if (!o) return;
    // v1.5：manifest 可以直接寫路徑字串（陣列也可以）
    if (typeof o === 'string') { out[o] = { src: o, frames: 1 }; return; }
    if (typeof o !== 'object') return;
    if (o.src) { out[o.src] = o; return; }
    for (const k in o) walk(o[k]);
  };
  walk(manifest || window.MANIFEST);
  return out;
}

/* loadAll(manifest, onProgress) 或 loadAll(onProgress)（後者用 window.MANIFEST） */
function loadAll(a, b) {
  const manifest = typeof a === 'function' ? window.MANIFEST : a;
  const onProgress = typeof a === 'function' ? a : b;
  const defs = collectSheets(manifest);
  const srcs = Object.keys(defs);
  return new Promise((resolve) => {
    if (!srcs.length) return resolve();
    let done = 0;
    const tick = () => {
      done++;
      if (onProgress) onProgress(done / srcs.length);
      if (done >= srcs.length) {
        for (const s in defs) sheetOf(defs[s]);
        resolve();
      }
    };
    srcs.forEach((src) => {
      const img = new Image();
      img.onload = tick;
      img.onerror = () => { console.error('[loader] 載入失敗:', src); tick(); };
      img.src = src;
      ASSETS[src] = img;
    });
  });
}
/* ---------------- 繪製 ---------------- */

/* ------------------------------------------------------------------
   drawSprite(img, sx, sy, sw, sh, dx, dy, dw, dh, opt)
   ------------------------------------------------------------
   底層繪製：把圖片的一塊（sx,sy,sw,sh）畫到螢幕矩形（dx,dy,dw,dh），
   可選左右鏡像 / 上下顛倒 / 旋轉。其他繪製函式都靠這支，
   所以「鏡像與旋轉的行為」全引擎只有一份實作。

   opt = {
     flipX, flipY            左右鏡像 / 上下顛倒（true/false）
     rot                     旋轉弧度（順時針；Math.PI/2 = 轉 90°）
     pivot                   旋轉軸心：{x, y} 絕對座標（在目前的 transform 底下），
                             或 'center'（預設 = 目標矩形中心）
     alpha                   0~1（可選；沒給就不碰 globalAlpha）
     target                  要畫到哪個 ctx（預設 G.ctx）
   }

   效能：不需要變形時直接 drawImage（零額外成本）；需要時才 save/rotate/restore。
   像素遊戲注意：rot 不是 90° 的倍數時，像素會被插值糊掉
   （引擎已設 imageSmoothingEnabled=false，但非直角仍然會走樣）。
   ------------------------------------------------------------------ */
function drawSprite(img, sx, sy, sw, sh, dx, dy, dw, dh, opt) {
  if (!img) return;
  const o = opt || {};
  const ctx = o.target || G.ctx;
  const w = dw == null ? sw : dw;
  const h = dh == null ? sh : dh;
  const fx = !!o.flipX, fy = !!o.flipY, rot = o.rot || 0;
  const a = o.alpha;
  if (a != null) ctx.globalAlpha = a;

  // 最常見的情況：什麼都不變 → 直接畫
  if (!fx && !fy && !rot) {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, w, h);
    if (a != null) ctx.globalAlpha = 1;
    return;
  }

  const pv = (!o.pivot || o.pivot === 'center')
    ? { x: dx + w / 2, y: dy + h / 2 }
    : o.pivot;
  ctx.save();
  ctx.translate(pv.x, pv.y);
  if (rot) ctx.rotate(rot);
  if (fx || fy) ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
  ctx.drawImage(img, sx, sy, sw, sh, dx - pv.x, dy - pv.y, w, h);
  ctx.restore();
  if (a != null) ctx.globalAlpha = 1;
}

/* (x,y) = 角色「腳底中心」；所有動畫都用同一錨點 → 不會抖動
   opt 額外支援 flipX / flipY / rot / pivot
   （預設繞「圖框中心」轉，圖框不會跑掉；要繞腳底轉請給 pivot:{x,y}） */
function drawSheet(s, frame, x, y, o, target) {
  if (!s) return;
  const ctx = target || G.ctx;
  o = o || {};
  const sc = o.scale || 1;
  const fw = s.fw, fh = s.h;
  const img = o.white ? s.white : s.img;
  const ox = o.ox || 0, oy = o.oy || 0;
  const px = Math.round(x - (fw * sc) / 2 + ox);
  const py = Math.round(y - s.foot * sc + oy);
  drawSprite(img, (frame | 0) * fw, 0, fw, fh,
    px, py, Math.ceil(fw * sc), Math.ceil(fh * sc), {
      flipX: o.flipX, flipY: o.flipY, rot: o.rot,
      pivot: o.pivot,
      alpha: o.alpha, target: ctx,
    });
}

/* 從 tileset 裁一塊 prefab 貼圖（o 同 drawSprite，預設繞中心轉） */
function drawCrop(def, sx, sy, sw, sh, dx, dy, alpha, target, o) {
  const t = sheetOf(def);
  if (!t) return;
  const opts = Object.assign({}, o);
  if (alpha != null) opts.alpha = alpha;
  if (target || opts.target) opts.target = target || opts.target;
  drawSprite(t.img, sx, sy, sw, sh, Math.round(dx), Math.round(dy), sw, sh, opts);
}

/* ------------------------------------------------------------------
   逐格動畫（素材是「一格一張 PNG」時用）
   ------------------------------------------------------------
   很多素材包不給 sprite sheet，而是一堆 bomb_anim_f0.png ~ f9.png。
   這兩支讓你不用自己寫陣列索引：
     frameOf(['b0.png','b1.png'], t, 10)          → 取這一帧的 Image
     drawFrames(['b0.png','b1.png'], t, 10, x, y) → 直接畫（預設以中心對齊）
   ------------------------------------------------------------------ */
function frameOf(list, t, fps) {
  if (!list || !list.length) return null;
  const n = list.length;
  const f = (t || 0) * (fps || 8);
  let i = Math.floor(isFinite(f) ? f : 0) % n;
  if (i < 0) i += n;
  const it = list[i];
  const src = typeof it === 'string' ? it : (it && it.src);
  return (src && ASSETS[src]) || null;
}

/* opt：anchor 'center'（預設）| 'foot' | 'topleft'、scale、flipX/flipY/rot、alpha、target */
function drawFrames(list, t, fps, x, y, opt) {
  const img = frameOf(list, t, fps);
  if (!img) return false;
  const o = opt || {};
  const sc = o.scale || 1;
  const dw = Math.round(img.width * sc), dh = Math.round(img.height * sc);
  let dx, dy;
  if (o.anchor === 'foot') { dx = x - dw / 2; dy = y - dh; }
  else if (o.anchor === 'topleft') { dx = x; dy = y; }
  else { dx = x - dw / 2; dy = y - dh / 2; }
  drawSprite(img, 0, 0, img.width, img.height, Math.round(dx), Math.round(dy), dw, dh, o);
  return true;
}

/* 影子（讓物件有落地感） */
function shadow(x, y, rx, ry, a = 0.16) {
  const ctx = G.ctx;
  ctx.globalAlpha = a;
  ctx.fillStyle = '#0d1020';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ---- engine/sprite.js ---- */
/* ============================================================
   engine/sprite.js — 動畫播放器（單張水平 sprite sheet）
   ============================================================ */

/* 面向 → 列（Tiny Adventure Pack 慣例：0 下、1 左、2 上、3 右） */
const DIR_ROW = { down: 0, left: 1, up: 2, right: 3 };
const DIR_NAMES = ['down', 'left', 'up', 'right'];

/* 2D 動畫表：cols（影格）× rows（面向）
   用法：
     const S = sheetOf(assetDef('hero.png', 4, 16, 16, { rows: 4 }));
     drawDirSheet(S, 'right', 2, x, y, { scale: 1.5 });
   (x, y) 一樣是「腳底中心」，所以四方向動畫不會抖動。
   opt 額外支援 flipX / flipY / rot / pivot（同 drawSprite；預設繞圖框中心）：
     想讓「左走圖」當「右走圖」用 → drawDirSheet(S, 'left', f, x, y, { flipX: true }) */
function drawDirSheet(s, dir, frame, x, y, o) {
  if (!s) return;
  o = o || {};
  const ctx = o.target || G.ctx;
  const sc = o.scale || 1;
  const fw = s.fw, fh = s.h;
  const row = typeof dir === 'number' ? dir : (DIR_ROW[dir] != null ? DIR_ROW[dir] : 0);
  const n = s.frames || 1;
  const f = ((frame | 0) % n + n) % n;
  const img = o.white ? s.white : s.img;
  const ox = o.ox || 0, oy = o.oy || 0;
  const px = Math.round(x - (fw * sc) / 2 + ox);
  const py = Math.round(y - (s.foot != null ? s.foot : fh) * sc + oy);
  drawSprite(img, f * fw, row * fh, fw, fh,
    px, py, Math.ceil(fw * sc), Math.ceil(fh * sc), {
      flipX: o.flipX, flipY: o.flipY, rot: o.rot,
      pivot: o.pivot,
      alpha: o.alpha != null ? o.alpha : 1,
      target: ctx,
    });
}

class Sprite {
  constructor(fps = 8, loop = true) {
    this.fps = fps; this.loop = loop;
    this.s = null; this.t = 0; this.frame = 0; this.done = false;
  }
  set(s, fps = this.fps, loop = this.loop) {
    if (this.s === s && this.fps === fps && this.loop === loop) return;
    this.s = s; this.fps = fps; this.loop = loop;
    this.t = 0; this.frame = 0; this.done = false;
  }
  update(dt) {
    if (!this.s) return;
    this.t += dt;
    const n = this.s.frames;
    let f = Math.floor(this.t * this.fps);
    if (this.loop) {
      this.frame = n ? f % n : 0;
    } else if (f >= n) {
      this.frame = n - 1;
      this.done = true;
    } else {
      this.frame = f;
    }
  }
  draw(x, y, o) { drawSheet(this.s, this.frame, x, y, o); }
}

/* ---- engine/input.js ---- */
/* ============================================================
   engine/input.js — 鍵盤輸入 → 動作；8 方向移動向量
   ============================================================ */

const Input = {
  down: {},
  pressed: {},
  keyDown: {},   // 只有鍵盤按下的（觸控會參考它，避免互相覆蓋）
  _codes: {},    // 實體鍵 → 動作；同一動作可能同時由方向鍵與 WASD 按住
  touchAxis: null,

  /* 預設只給最共通的動作；遊戲用 Input.init(自己的 map) 覆寫/擴充 */
  defaultMap: {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Enter: 'confirm', Escape: 'cancel',
    F3: 'debug',
  },
  map: null,

  init(map) {
    this.map = Object.assign({}, this.defaultMap, map || {});
    addEventListener('keydown', (e) => {
      const a = this.map[e.code];
      if (!a) return;
      e.preventDefault();
      Sfx.unlock();
      if (!this.down[a]) this.pressed[a] = true;
      this._codes[e.code] = a;
      this.keyDown[a] = true;
      this.down[a] = true;
    });
    addEventListener('keyup', (e) => {
      const a = this.map[e.code];
      if (!a) return;
      e.preventDefault();
      delete this._codes[e.code];
      this.keyDown[a] = Object.values(this._codes).includes(a);
      const touchHeld = typeof TouchUI !== 'undefined' && TouchUI.enabled && TouchUI.held.has(a);
      this.down[a] = this.keyDown[a] || !!touchHeld;
    });
    addEventListener('blur', () => {
      this.down = {}; this.keyDown = {}; this._codes = {}; this.pressed = {};
    });
  },

  /* 取得這一帧的移動向量（鍵盤 8 方向 / 搖桿連續方向），長度 <= 1 */
  moveAxis() {
    const t = this.touchAxis;
    if (t && t.mag > 0.06) {
      return { x: t.x, y: t.y, mag: U.clamp(t.mag / 0.8, 0.25, 1) };
    }
    let x = 0, y = 0;
    if (this.down.left) x -= 1;
    if (this.down.right) x += 1;
    if (this.down.up) y -= 1;
    if (this.down.down) y += 1;
    if (!x && !y) return { x: 0, y: 0, mag: 0 };
    if (x && y) { const k = Math.SQRT1_2; x *= k; y *= k; }   // 對角線不加速
    return { x, y, mag: 1 };
  },

  isDown: (a) => !!Input.down[a],
  justPressed: (a) => !!Input.pressed[a],
  // 由 Loop 在一次邏輯更新完成後消耗；沒有更新的繪製幀不能清掉按鍵。
  endFrame() { this.pressed = {}; },
};

/* ---- engine/audio.js ---- */
/* ============================================================
   engine/audio.js — WebAudio 即時合成（不需音檔）+ 音效註冊表
   ============================================================ */

const Sfx = {
  ctx: null,
  master: 0.5,
  muted: false,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = this.muted ? 0 : this.master;
        this.gain.connect(this.ctx.destination);
      } catch (e) { /* 忽略 */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  /* 主音量（0..1）。靜音時 gain 直接歸零，但 oscillator 照常排程（成本極低） */
  setMaster(v) {
    this.master = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.master;
    return this;
  },
  /* 靜音切換：Sfx.mute(true) / Sfx.mute() 反轉 / Sfx.mute(false) */
  mute(on) {
    this.muted = (on == null) ? !this.muted : !!on;
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.master;
    if (this.music) this.music.volume = this.muted ? 0 : this.musicGain;
    return this.muted;
  },
  tone(f0, f1, dur, type = 'square', vol = 0.25, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.gain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(this.gain);
    src.start(t);
  },
  /* ---- 音檔（不想用合成音效時）----
     Sfx.loadClip('hit', 'assets/sfx/hit.wav') → Sfx.playClip('hit', {rate:1.2})
     Sfx.loadMusic('assets/music/bgm.mp3')     → Sfx.playMusic() / stopMusic() */
  clips: {},
  music: null,
  musicGain: 0.5,
  clipGain: 0.8,

  loadClip(name, src) {
    return new Promise((res) => {
      const a = new Audio();
      a.preload = 'auto';
      a.src = src;
      a.oncanplaythrough = () => res(a);
      a.onerror = () => { console.warn('[audio] 載入失敗', src); res(null); };
      this.clips[name] = a;
    });
  },

  loadClips(map) {
    return Promise.all(Object.keys(map).map((k) => this.loadClip(k, map[k])));
  },

  playClip(name, opt) {
    const base = this.clips[name];
    if (!base) return null;
    opt = opt || {};
    try {
      const a = base.cloneNode(true);
      a.volume = Math.min(1, (opt.volume != null ? opt.volume : 1) * this.clipGain);
      a.playbackRate = opt.rate || 1;
      a.play().catch(() => {});
      return a;
    } catch (e) { return null; }
  },

  loadMusic(src, opt) {
    opt = opt || {};
    const a = new Audio();
    a.src = src;
    a.loop = opt.loop !== false;
    a.volume = Math.min(1, (opt.volume != null ? opt.volume : 1) * this.musicGain);
    a.preload = 'auto';
    this.music = a;
    return a;
  },

  playMusic() {
    if (!this.music) return;
    this.music.currentTime = this.music.currentTime || 0;
    this.music.play().catch(() => {});
  },

  stopMusic() { if (this.music) { this.music.pause(); } },
  setMusicVolume(v) { if (this.music) this.music.volume = Math.max(0, Math.min(1, v)); },

  /* 遊戲用：Sfx.register({ swing(){...}, hit(){...} })
     → 可用 Sfx.swing() 或 Sfx.play('swing') */
  defs: {},
  register(list) {
    for (const k in list) {
      this.defs[k] = list[k].bind(this);
      this[k] = this.defs[k];
    }
  },
  /* 有同名音檔就播音檔，否則用註冊的合成音效 */
  play(name, opt) {
    if (this.clips[name]) return this.playClip(name, opt);
    const f = this.defs[name];
    if (f) f();
    return null;
  },
};

/* ---- engine/fx.js ---- */
/* ============================================================
   engine/fx.js — 粒子池、鏡頭震動、hitstop
   ============================================================ */

const Fx = {
  parts: [],
  pool: [],
  shakeT: 0, shakeMag: 0,
  freezeT: 0,      // 命中定格（hit-stop）
  burst(x, y, color, n = 8, spd = 70, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = opt.dir != null ? opt.dir + U.rand(0.9, -0.9) : U.rand(Math.PI * 2);
      const v = spd * U.rand(1.2, 0.35);
      const pt = this.pool.pop() || {};
      pt.x = x; pt.y = y;
      pt.vx = Math.cos(a) * v; pt.vy = Math.sin(a) * v;
      pt.life = pt.max = U.rand(0.45, 0.2);
      pt.color = color; pt.size = opt.size || 2;
      pt.grav = opt.grav != null ? opt.grav : 90;
      this.parts.push(pt);
    }
  },
  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(Math.PI * 2);
      const pt = this.pool.pop() || {};
      pt.x = x; pt.y = y - 1;
      pt.vx = Math.cos(a) * U.rand(22, 6); pt.vy = Math.sin(a) * U.rand(12, 3) - 6;
      pt.life = pt.max = U.rand(0.4, 0.18);
      pt.color = '#c9d78d'; pt.size = 1; pt.grav = -10;
      this.parts.push(pt);
    }
  },
  spark(x, y, color = '#ffe9a8') { this.burst(x, y, color, 5, 90, { size: 1, grav: 20 }); },
  shake(mag, t) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
  },
  hitstop(t) { this.freezeT = Math.max(this.freezeT, t); },
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.pool.push(p); this.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
  },
  draw() {
    const ctx = G.ctx;
    for (const p of this.parts) {
      ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  },
  reset() { this.parts.length = 0; this.pool.length = 0; this.shakeT = 0; this.shakeMag = 0; this.freezeT = 0; },
};

/* ---- engine/physics.js ---- */
/* ============================================================
   engine/physics.js — AABB 碰撞、軸分離滑動、重疊判定
   ============================================================ */

function Physics() {}

/* 場上的靜態碰撞矩形（由關卡在 build 時填入） */
Physics.solids = [];
/* 可活動範圍；null = 用畫面可見範圍 G.view（單螢幕遊戲）
   捲動世界請設成整個世界的邊界，例如 { l:8, r:worldW-8, t:8, b:worldH-8 } */
Physics.bounds = null;
Physics.clear = function () { this.solids.length = 0; };
Physics.add = function (x, y, w, h) {
  const s = { x, y, w, h };
  this.solids.push(s);
  return s;
};
Physics.hit = function (box) {
  const list = this.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (box.x < s.x + s.w && box.x + box.w > s.x && box.y < s.y + s.h && box.y + box.h > s.y) return true;
  }
  return false;
};
Physics.overlap = function (a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
};

/* 只沿單軸移動（有牆就停），回傳是否真的動了 */
Physics.moveAxis = function (e, dx, dy, opt) {
  const o = opt || {};
  const bw = o.bw != null ? o.bw : 8;
  const bh = o.bh != null ? o.bh : 6;
  const by = o.by != null ? o.by : -6;      // 判定框上緣（相對腳底）
  const m = o.margin || 0;
  let moved = false;
  if (dx) {
    const b = { x: e.x - bw / 2 + dx, y: e.y + by, w: bw, h: bh };
    if (!this.hit(b)) { e.x += dx; moved = true; }
  }
  if (dy) {
    const b = { x: e.x - bw / 2, y: e.y + by + dy, w: bw, h: bh };
    if (!this.hit(b)) { e.y += dy; moved = true; }
  }
  const v = this.bounds || G.view;
  e.x = U.clamp(e.x, v.l + m, v.r - m);
  e.y = U.clamp(e.y, v.t + m, v.b - m);
  return moved;
};

/* ---- engine/pathfind.js ---- */
/* ============================================================
   engine/pathfind.js — 格子 A*（8 方向，不切角）
   ・Pathfind.build({ cell: 8 })  用 Physics.solids 建格子圖（世界變了就重建）
   ・Pathfind.find(x1, y1, x2, y2) → [{x,y}, ...] 世界座標路徑（平滑過）
   ・Pathfind.lineClear(x1,y1,x2,y2) 兩點間有沒有障礙（可直線走就不繞路）
   ============================================================ */

const Pathfind = {
  cell: 8,
  w: 0, h: 0,
  grid: null,          // Uint8Array：1 = 不可走
  version: 0,

  build(opt) {
    opt = opt || {};
    this.cell = opt.cell || 8;
    // 預設用畫面大小；捲動世界請傳 { w: 世界寬, h: 世界高 }
    this.w = Math.ceil((opt.w || GAME_W) / this.cell);
    this.h = Math.ceil((opt.h || GAME_H) / this.cell);
    const grid = new Uint8Array(this.w * this.h);
    const pad = opt.pad != null ? opt.pad : 1;    // 讓實體不會貼牆
    for (const s of Physics.solids) {
      const x0 = Math.max(0, Math.floor((s.x - pad) / this.cell));
      const x1 = Math.min(this.w - 1, Math.floor((s.x + s.w + pad) / this.cell));
      const y0 = Math.max(0, Math.floor((s.y - pad) / this.cell));
      const y1 = Math.min(this.h - 1, Math.floor((s.y + s.h + pad) / this.cell));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * this.w + x] = 1;
    }
    this.grid = grid;
    this.version += 1;
    return this;
  },

  blocked(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return true;
    return this.grid[cy * this.w + cx] === 1;
  },

  /* 是否可以直接走直線（用 Physics.hit 取樣） */
  lineClear(x1, y1, x2, y2) {
    const d = U.dist(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(d / 6));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (Physics.hit({ x: x - 3, y: y - 4, w: 6, h: 6 })) return false;
    }
    return true;
  },

  /* A*；找不到回傳 [] */
  find(x1, y1, x2, y2, opt) {
    if (!this.grid) this.build();
    opt = opt || {};
    const maxNodes = opt.maxNodes || 3000;
    const S = this.cell;
    const sx = U.clamp(Math.floor(x1 / S), 0, this.w - 1);
    const sy = U.clamp(Math.floor(y1 / S), 0, this.h - 1);
    let tx = U.clamp(Math.floor(x2 / S), 0, this.w - 1);
    let ty = U.clamp(Math.floor(y2 / S), 0, this.h - 1);

    /* 起點或終點在牆裡 → 找最近的空位 */
    const nearFree = (cx, cy) => {
      if (!this.blocked(cx, cy)) return { x: cx, y: cy };
      for (let r = 1; r <= 4; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            if (!this.blocked(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
          }
        }
      }
      return null;
    };
    const s0 = nearFree(sx, sy);
    const t0 = nearFree(tx, ty);
    if (!s0 || !t0) return [];
    if (s0.x === t0.x && s0.y === t0.y) return [{ x: x2, y: y2 }];

    const W = this.w, N = W * this.h;
    const idx = (x, y) => y * W + x;
    const gScore = new Float32Array(N).fill(Infinity);
    const fScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const open = [idx(s0.x, s0.y)];
    const inOpen = new Uint8Array(N);
    const closed = new Uint8Array(N);
    const goal = idx(t0.x, t0.y);
    const h = (i) => {
      const x = i % W, y = (i / W) | 0;
      const dx = Math.abs(x - t0.x), dy = Math.abs(y - t0.y);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);   // octile
    };
    gScore[open[0]] = 0;
    fScore[open[0]] = h(open[0]);
    inOpen[open[0]] = 1;

    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
                [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let nodes = 0;

    while (open.length && nodes < maxNodes) {
      /* 取 f 最小的（節點數不多，線性掃描就夠） */
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      inOpen[cur] = 0;
      if (cur === goal) return this.trace(came, cur, x2, y2);
      closed[cur] = 1;
      nodes++;

      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy, cost] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (this.blocked(nx, ny)) continue;
        /* 斜走不切角 */
        if (dx && dy && (this.blocked(cx + dx, cy) || this.blocked(cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        if (closed[ni]) continue;
        const g = gScore[cur] + cost;
        if (g < gScore[ni]) {
          gScore[ni] = g;
          fScore[ni] = g + h(ni);
          came[ni] = cur;
          if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
        }
      }
    }
    return [];
  },

  trace(came, goal, tx, ty) {
    const out = [];
    let c = goal;
    while (c !== -1) {
      out.push({ x: (c % this.w) * this.cell + this.cell / 2, y: ((c / this.w) | 0) * this.cell + this.cell / 2 });
      c = came[c];
    }
    out.reverse();
    out.shift();                       // 去掉起點
    out.push({ x: tx, y: ty });        // 終點用真實座標
    return this.smooth(out);
  },

  /* ============================================================
     大量單位用的「節流排程」
     400 隻同時重算會讓某一帧爆量；把重算分散到多個帧就不會頓。
       在每帧 update 呼叫： Pathfind.update(dt)
       找路：               Pathfind.request(agent, targetX, targetY, (path) => { agent.path = path; })
     ・同一個 agent 只保留最新的一筆
     ・同一個 agent 有最短重算間隔（minInterval 秒）
     ・每帧最多算 maxPerStep 條
     ============================================================ */
  queue: [],
  maxPerStep: 2,
  minInterval: 0.35,

  pending() { return this.queue.length; },

  request(agent, tx, ty, onPath, opt) {
    opt = opt || {};
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (agent.__pfLast && now - agent.__pfLast < (opt.interval != null ? opt.interval : this.minInterval) * 1000) {
      return false;                       // 太頻繁，跳過這一帧
    }
    agent.__pfLast = now;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].agent === agent) {       // 已在排隊 → 只更新目標
        this.queue[i].tx = tx; this.queue[i].ty = ty; this.queue[i].onPath = onPath;
        return true;
      }
    }
    this.queue.push({ agent, tx, ty, onPath });
    return true;
  },

  update(dt) {
    if (!this.queue.length) return 0;
    let done = 0;
    while (done < this.maxPerStep && this.queue.length) {
      const job = this.queue.shift();
      const path = this.lineClear(job.agent.x, job.agent.y, job.tx, job.ty)
        ? [{ x: job.tx, y: job.ty }]
        : this.find(job.agent.x, job.agent.y, job.tx, job.ty);
      if (job.onPath) job.onPath(path);
      else job.agent.path = path;
      done++;
    }
    return done;
  },

  /* 去掉共線點 + 用 lineClear 走捷徑 */
  smooth(path) {
    if (path.length <= 2) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = Math.min(path.length - 1, i + 8);
      while (j > i + 1 && !this.lineClear(path[i].x, path[i].y, path[j].x, path[j].y)) j--;
      out.push(path[j]);
      i = j;
    }
    return out;
  },
};

/* ---- engine/grid.js ---- */
/* ============================================================
   engine/grid.js — 格子世界（tile 碰撞 + BFS 距離場）  v1.5
   ------------------------------------------------------------
   為什麼要有這一支：
     炸彈人 / 倉庫番 / 吃豆人 這類「一格一格」的遊戲，每一款都會重寫
     同一段程式：分軸移動、撞牆夾住、走廊對齊、BFS 找路、往距離場下坡走。
     tiny-bomber 就手寫了 200 行；抽進來之後遊戲只要描述「哪格是牆」。

   三件事：
     1) 碰撞：Grid.solid() / moveX() / moveY() / alignTo()
        · 牆用 tiles 陣列（0 = 可走，其他值由遊戲定義）
        · 臨時障礙（炸彈、NPC）用 block callback
        · 撞牆時「只往前夾、不往回彈」；人已經在障礙格裡時不算擋（不會卡死）
     2) 尋路：Grid.field() 一次算出「每格離目標幾步」
        多個目標、多來源都可以；8 方向時自動不切角
     3) 走位：Grid.downhill() 往下坡走一步、Grid.route() 走出整條路線
   ============================================================ */

const Grid = {
  cell: 16,
  cols: 0,
  rows: 0,
  tiles: null,      // Uint8Array：0 = 可走（非 0 的意義由遊戲決定）
  block: null,      // fn(cx, cy, e) → true 表示「對這個實體也算擋」

  /* ---------------- 建立 ---------------- */
  /* 兩種用法：
     A) 單例（跟 Physics / Pathfind 一樣）→ 只會有一個世界
          Grid.setup({ cell: 16, cols: 20, rows: 13 });
     B) 多個獨立的地圖（編輯器、分割畫面、同時算兩張圖）
          const a = Grid.create({ cell: 16, cols: 20, rows: 13 });
          const b = Grid.createFromTiles(tiles, 30, 26);
     兩者都是同一個 API；create() 出來的互不影響。 */

  /* Grid.setup({ cell: 16, cols: 20, rows: 13, fill: 0 }) */
  setup(opt) {
    opt = opt || {};
    this.cell = opt.cell || 16;
    this.cols = opt.cols || 1;
    this.rows = opt.rows || 1;
    this.tiles = new Uint8Array(this.cols * this.rows);
    if (opt.fill) this.tiles.fill(opt.fill);
    this.block = null;
    return this;
  },

  /* 直接吃一張既有的地圖（tiles 長度要 = cols × rows） */
  fromTiles(tiles, cols, rows, opt) {
    opt = opt || {};
    this.cell = opt.cell || 16;
    this.cols = cols;
    this.rows = rows;
    this.tiles = tiles;
    this.block = opt.block || null;
    return this;
  },

  /* 產生一個獨立的地圖（不會蓋掉 Grid 本身） */
  create(opt) {
    const g = Object.create(Grid);
    g.setup(opt);
    return g;
  },

  createFromTiles(tiles, cols, rows, opt) {
    const g = Object.create(Grid);
    g.fromTiles(tiles, cols, rows, opt);
    return g;
  },

  /* 設定臨時障礙：fn(cx, cy, e) → true = 擋（例如炸彈） */
  setBlock(fn) { this.block = fn; return this; },

  /* ---------------- 座標 ---------------- */
  idx(cx, cy) { return cy * this.cols + cx; },
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; },
  tileAt(cx, cy) { return this.inside(cx, cy) ? this.tiles[this.idx(cx, cy)] : 1; },
  setTile(cx, cy, v) {
    if (!this.inside(cx, cy)) return this;
    this.tiles[this.idx(cx, cy)] = v;
    return this;
  },
  cellOf(v) { return Math.floor(v / this.cell); },
  center(cx) { return (cx + 0.5) * this.cell; },
  snapToCell(x, y) { return { cx: Math.floor(x / this.cell), cy: Math.floor(y / this.cell) }; },

  /* 實體對齊到最近的格子中心 */
  snap(e) {
    e.x = Math.round(e.x / this.cell - 0.5) * this.cell + this.cell / 2;
    e.y = Math.round(e.y / this.cell - 0.5) * this.cell + this.cell / 2;
    return e;
  },

  /* ---------------- 碰撞 ---------------- */
  /* 擋不擋？e 可以有：
       e.passTiles = [2]  → 這幾種 tile 對它來說可以走（例如飛行敵人穿木桶） */
  solid(cx, cy, e) {
    if (!this.inside(cx, cy)) return true;
    const t = this.tiles[this.idx(cx, cy)];
    if (t && !(e && e.passTiles && e.passTiles.indexOf(t) >= 0)) return true;
    return !!(this.block && this.block(cx, cy, e));
  },

  /* 分軸移動：回傳 true = 撞到東西
     重點（tiny-bomber 實戰學到的）：
       ・被擋住時只往前夾，絕對不往回彈（往回彈 = 穿牆）
       ・「自己已經在的那一格」不算擋 → 站在炸彈上不會被鎖死 */
  moveX(e, dx) {
    if (!dx) return false;
    const C = this.cell, r = e.r;
    const dir = dx > 0 ? 1 : -1;
    const nx = e.x + dx;
    const cellX = Math.floor((nx + dir * r) / C);
    const y0 = Math.floor((e.y - r + 0.5) / C);
    const y1 = Math.floor((e.y + r - 0.5) / C);
    const centerCellX = Math.floor(e.x / C);
    let hit = false;
    for (let cy = y0; cy <= y1; cy++) {
      if (!this.solid(cellX, cy, e)) continue;
      if (cellX !== centerCellX) hit = true;
    }
    if (!hit) { e.x = nx; return false; }
    const limit = dir > 0 ? cellX * C - r : (cellX + 1) * C + r;
    e.x = dir > 0 ? Math.min(nx, Math.max(e.x, limit)) : Math.max(nx, Math.min(e.x, limit));
    return true;
  },

  moveY(e, dy) {
    if (!dy) return false;
    const C = this.cell, r = e.r;
    const dir = dy > 0 ? 1 : -1;
    const ny = e.y + dy;
    const cellY = Math.floor((ny + dir * r) / C);
    const x0 = Math.floor((e.x - r + 0.5) / C);
    const x1 = Math.floor((e.x + r - 0.5) / C);
    const centerCellY = Math.floor(e.y / C);
    let hit = false;
    for (let cx = x0; cx <= x1; cx++) {
      if (!this.solid(cx, cellY, e)) continue;
      if (cellY !== centerCellY) hit = true;
    }
    if (!hit) { e.y = ny; return false; }
    const limit = dir > 0 ? cellY * C - r : (cellY + 1) * C + r;
    e.y = dir > 0 ? Math.min(ny, Math.max(e.y, limit)) : Math.max(ny, Math.min(e.y, limit));
    return true;
  },

  /* 撞到牆時，慢慢把角色吸回走廊中線（手感關鍵）
     rate = 每秒最多拉幾 px（預設 90） */
  alignTo(e, axis, dt, rate) {
    const C = this.cell;
    const v = axis === 'y' ? e.y : e.x;
    const c = (Math.floor(v / C) + 0.5) * C;
    const d = c - v;
    if (Math.abs(d) < 0.4) return;
    const step = Math.min(Math.abs(d), (rate || 90) * dt);
    if (axis === 'y') e.y += Math.sign(d) * step;
    else e.x += Math.sign(d) * step;
  },

  /* ---------------- BFS 距離場 ---------------- */
  /* Grid.field({ from: {cx,cy} } 或 { cells: [{cx,cy}...] }
                 block: fn(cx,cy) → true 表示這一格不能通過（可選）
                 diagonal: true → 8 方向（自動不切角）
                 maxDist, into（重複使用同一個 Int16Array 省配置））
     回傳 Int16Array：步數，-1 = 走不到；來源格 = 0（來源可以是牆，例如木桶） */
  field(opt) {
    opt = opt || {};
    const W = this.cols, H = this.rows;
    const passTiles = opt.ignoreTiles || null;
    const ent = passTiles ? { passTiles } : null;
    const f = opt.into || new Int16Array(W * H).fill(-1);
    if (opt.into) f.fill(-1);
    const src = opt.cells || (opt.from ? [opt.from] : []);
    const block = opt.block || null;
    const diag = !!opt.diagonal;
    const max = opt.maxDist || 0;
    const NB = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const q = [];
    for (const c of src) {
      if (!c || !this.inside(c.cx, c.cy)) continue;
      const i = this.idx(c.cx, c.cy);
      if (f[i] !== -1) continue;
      f[i] = 0;
      q.push(i);
    }
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const x = cur % W, y = (cur / W) | 0;
      const d = f[cur] + 1;
      if (max && d > max) continue;
      for (let k = 0; k < NB.length; k++) {
        const dx = NB[k][0], dy = NB[k][1];
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny)) continue;
        const ni = ny * W + nx;
        if (f[ni] !== -1) continue;
        if (this.solid(nx, ny, ent)) continue;
        if (block && block(nx, ny)) continue;
        if (dx && dy && (this.solid(x + dx, y, ent) || this.solid(x, y + dy, ent))) continue;  // 不切角
        f[ni] = d;
        q.push(ni);
      }
    }
    return f;
  },

  /* 從這格往「距離比較小」的鄰格走一步；回傳方向 {x,y} 或 null
     opt.avoid = Uint8Array（額外不想走的格子，例如危險區） */
  downhill(field, cx, cy, opt) {
    opt = opt || {};
    const W = this.cols;
    const cur = field[this.idx(cx, cy)];
    if (cur === 0) return null;                 // 已經在目標上
    let bestD = cur < 0 ? 32767 : cur;
    let best = null;
    const diag = !!opt.diagonal;
    const dirs = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (!this.inside(nx, ny)) continue;
      if (this.solid(nx, ny)) continue;
      const ni = ny * W + nx;
      if (opt.avoid && opt.avoid[ni]) continue;
      const d = field[ni];
      if (d >= 0 && d < bestD) { bestD = d; best = { x: dx, y: dy }; }
    }
    return best;
  },

  /* 走出整條路線（沿著距離場一路下坡）→ [{cx, cy}, ...]（不含起點） */
  route(field, cx, cy, opt) {
    opt = opt || {};
    const maxSteps = opt.maxSteps || 64;
    const out = [];
    let x = cx, y = cy;
    for (let i = 0; i < maxSteps; i++) {
      const d = this.downhill(field, x, y, opt);
      if (!d) break;
      x += d.x; y += d.y;
      out.push({ cx: x, cy: y });
      if (field[this.idx(x, y)] === 0) break;
    }
    return out;
  },

  /* 這兩格之間走得到嗎（field 從其中一邊算起） */
  reachable(field, cx, cy) {
    return this.inside(cx, cy) && field[this.idx(cx, cy)] >= 0;
  },

  /* ---------------- 便利函式 ---------------- */
  freeCells() {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.solid(x, y)) out.push({ cx: x, cy: y });
      }
    }
    return out;
  },

  countFree() {
    let n = 0;
    for (let i = 0; i < this.tiles.length; i++) if (!this.tiles[i]) n++;
    return n;
  },

  /* 逐格跑 callback（畫圖 / 檢查都常用） */
  forEach(cb) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) cb(x, y, this.tiles[y * this.cols + x]);
    }
  },
};

/* ---- engine/level.js ---- */
/* ============================================================
   engine/level.js — JSON 關卡（格子資料 + 物件 + 驗證）  v1.6
   ------------------------------------------------------------
   為什麼要有這一支：
     以前的關卡資料寫在遊戲程式碼裡（`const ROADS = [...]`、`LEVELS = [...]`），
     改一格要動 JS、也沒辦法丟給非工程師編。
     Level 把「一張地圖」變成純資料（可以存 JSON、可以給編輯器編、可以上傳）。

   一格 = 一個數字（0 = 可走，其他值的意思由遊戲決定；慣例 1 = 牆／路障）

   兩種寫法都吃：
     A) 機器格式（存檔用）
        { v:1, cols:20, rows:12, cell:16, tiles:[0,0,1,...], objects:[...] }
     B) 手寫格式（人看的）
        { v:1, cols:8, legend:{'.':0,'#':1}, lines:['..#..','...'] }
        （lines 會轉成 tiles，rows 由 lines.length 決定；
          legend 沒給就 '.'=0、其他字元依序 1,2,3…；
          舊寫法 { rows: ['..#..'] } 也吃，但 rows 同時是「列數」容易搞混，建議用 lines）
   ============================================================ */

const Level = {
  v: 1,
  cols: 0,
  rows: 0,
  cell: 16,
  tiles: null,
  objects: [],
  meta: {},

  /* ---------------- 建立 ---------------- */
  /* 回傳「獨立」的關卡物件（多張地圖、測試都靠這個）
     Level.load() / Level.loadSaved() 則是改「Level 自己」這個單例 */
  create(opt) {
    opt = opt || {};
    const lv = Object.create(Level);
    lv.v = 1;
    lv.cols = opt.cols || 16;
    lv.rows = opt.rows || 12;
    lv.cell = opt.cell || 16;
    lv.tiles = new Uint8Array(lv.cols * lv.rows);
    if (opt.fill) lv.tiles.fill(opt.fill);
    lv.objects = [];
    lv.meta = opt.meta ? Object.assign({}, opt.meta) : {};
    return lv;
  },

  /* 從資料直接產生一個獨立關卡（不改動 Level 單例） */
  from(data) {
    const lv = Object.create(Level);
    lv.load(data);
    return lv;
  },

  /* 從 JSON 物件或字串建立（會驗證，壞掉會丟出清楚的錯誤） */
  load(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    if (!d || typeof d !== 'object') throw new Error('[level] 不是物件');
    const lines = Array.isArray(d.lines) ? d.lines : (Array.isArray(d.rows) ? d.rows : null);
    const cols = d.cols | 0;
    const rows = lines ? lines.length : (d.rows | 0);
    if (!(cols > 0 && rows > 0)) throw new Error('[level] cols / rows 不合法');
    this.cols = cols;
    this.rows = rows;
    this.cell = d.cell || 16;
    this.meta = d.meta ? Object.assign({}, d.meta) : {};

    if (lines && lines.length) {
      /* 手寫格式：字串列 */
      const legend = d.legend || null;
      const auto = {};
      let next = 1;
      const mapChar = (ch) => {
        if (legend && legend[ch] != null) return legend[ch] | 0;
        if (!legend) {
          if (ch === '.' || ch === ' ') return 0;
          if (!(ch in auto)) auto[ch] = next++;
          return auto[ch];
        }
        return 0;
      };
      const tiles = new Uint8Array(cols * rows);
      for (let y = 0; y < rows; y++) {
        const line = lines[y] || '';
        if (line.length < cols) {
          throw new Error('[level] 第 ' + y + ' 列只有 ' + line.length + ' 個字（要 ' + cols + '）');
        }
        for (let x = 0; x < cols; x++) tiles[y * cols + x] = mapChar(line[x]);
      }
      this.tiles = tiles;
    } else if (d.tiles) {
      if (d.tiles.length !== cols * rows) {
        throw new Error('[level] tiles 長度 ' + d.tiles.length + '，應該是 ' + (cols * rows));
      }
      this.tiles = Uint8Array.from(d.tiles);
    } else {
      throw new Error('[level] 沒有 tiles 或 rows');
    }

    if (!this.tiles) throw new Error('[level] 沒有 tiles 或 lines');
    this.objects = (d.objects || []).map(o => ({
      type: o.type || 'object',
      cx: o.cx | 0, cy: o.cy | 0,
      data: o.data ? Object.assign({}, o.data) : null,
    }));
    const errs = this.validate();
    const fatal = errs.filter(e => e.level === 'error');
    if (fatal.length) throw new Error('[level] ' + fatal.map(e => e.msg).join('；'));
    return this;
  },

  /* 存成純資料 */
  export() {
    return {
      v: this.v,
      cols: this.cols,
      rows: this.rows,
      cell: this.cell,
      tiles: Array.from(this.tiles),
      objects: this.objects.map(o => ({
        type: o.type, cx: o.cx, cy: o.cy, data: o.data ? Object.assign({}, o.data) : undefined,
      })),
      meta: Object.assign({}, this.meta),
    };
  },

  serialize(pretty) { return JSON.stringify(this.export(), null, pretty ? 2 : 0); },

  /* 人看的格式（手改方便）
     idToChar：{ 0:'.', 1:'#', 2:'~' }（tile 值 → 字元）
     回傳的 legend 會轉成「字元 → tile 值」，可以直接丟回 load()。 */
  exportRows(idToChar) {
    const map = idToChar || { 0: '.' };
    const back = {};
    for (const k in map) back[Number(k)] = map[k];
    const rows = [];
    for (let y = 0; y < this.rows; y++) {
      let line = '';
      for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y * this.cols + x];
        line += back[t] != null ? back[t] : String(t);
      }
      rows.push(line);
    }
    const legend = {};
    for (const k in map) legend[map[k]] = Number(k);
    return { v: this.v, cols: this.cols, cell: this.cell, legend: legend, lines: rows };
  },

  /* ---------------- 讀寫格子 ---------------- */
  idx(cx, cy) { return cy * this.cols + cx; },
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; },
  get(cx, cy) { return this.inside(cx, cy) ? this.tiles[this.idx(cx, cy)] : -1; },
  set(cx, cy, v) {
    if (!this.inside(cx, cy)) return this;
    this.tiles[this.idx(cx, cy)] = v;
    return this;
  },
  fillRect(x0, y0, x1, y1, v) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, v);
    }
    return this;
  },
  fillBorder(v) {
    for (let x = 0; x < this.cols; x++) { this.set(x, 0, v); this.set(x, this.rows - 1, v); }
    for (let y = 0; y < this.rows; y++) { this.set(0, y, v); this.set(this.cols - 1, y, v); }
    return this;
  },
  forEach(cb) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) cb(x, y, this.tiles[y * this.cols + x]);
    }
  },
  counts() {
    const c = {};
    for (let i = 0; i < this.tiles.length; i++) c[this.tiles[i]] = (c[this.tiles[i]] || 0) + 1;
    return c;
  },

  /* 給 Grid 用（非 0 都算擋；也可以指定「哪個值算擋」） */
  grid(opt) {
    opt = opt || {};
    const pass = opt.pass || null;       // 例：{ 2: true } → 2 當可走
    const tiles = new Uint8Array(this.tiles.length);
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      tiles[i] = (!t || (pass && pass[t])) ? 0 : 1;
    }
    const g = Grid.createFromTiles(tiles, this.cols, this.rows, { cell: this.cell });
    if (opt.block) g.setBlock(opt.block);
    return g;
  },

  /* ---------------- 物件 ---------------- */
  addObject(type, cx, cy, data) {
    const o = { type, cx, cy, data: data || null };
    this.objects.push(o);
    return o;
  },
  removeObjectAt(cx, cy, type) {
    const i = this.objects.findIndex(o => o.cx === cx && o.cy === cy && (!type || o.type === type));
    if (i < 0) return null;
    return this.objects.splice(i, 1)[0];
  },
  objectAt(cx, cy, type) {
    return this.objects.find(o => o.cx === cx && o.cy === cy && (!type || o.type === type)) || null;
  },

  /* ---------------- 驗證 ---------------- */
  validate() {
    const out = [];
    if (!this.tiles || this.tiles.length !== this.cols * this.rows) {
      out.push({ level: 'error', msg: 'tiles 數量不對（' + (this.tiles ? this.tiles.length : 0) + '）' });
      return out;
    }
    if (this.cols < 2 || this.rows < 2) out.push({ level: 'error', msg: '地圖太小' });
    for (const o of this.objects) {
      if (!this.inside(o.cx, o.cy)) {
        out.push({ level: 'error', msg: '物件 ' + o.type + ' 在地圖外 (' + o.cx + ',' + o.cy + ')' });
      }
    }
    const counts = this.counts();
    if ((counts[0] || 0) === 0) out.push({ level: 'warn', msg: '整張圖都是牆（沒有可走的地方）' });
    return out;
  },

  /* 兩個格子之間走得通嗎（用 Grid 的 BFS 距離場） */
  connected(a, b, opt) {
    if (!a || !b) return false;
    const g = this.grid(opt);
    const field = g.field({ from: { cx: a.cx, cy: a.cy } });
    return field[this.idx(b.cx, b.cy)] >= 0;
  },

  /* ---------------- localStorage ---------------- */
  save(key) {
    Save.set(key, this.export());
    return this;
  },
  loadSaved(key) {
    const d = Save.get(key, null);
    if (!d) return null;
    this.load(d);
    return this;
  },

  /* ---------------- 建給測試/工具用 ---------------- */
  toGridString(passValue) {
    const rows = [];
    for (let y = 0; y < this.rows; y++) {
      let line = '';
      for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y * this.cols + x];
        line += (!t || t === passValue) ? '.' : '#';
      }
      rows.push(line);
    }
    return rows.join('\n');
  },
};

/* ============================================================
   LevelLib — 關卡庫 + 可分享的「關卡碼」  v1.7
   ------------------------------------------------------------
   目的：
     · 玩家自己編的關卡要能存起來（選單裡挑）
     · 能變成一串短碼傳給朋友（貼上就能玩）

   關卡碼格式：`TL1-<base64(JSON)>`
     壓縮：tiles 用 run-length（`<值36進位><數量36進位>` 串起來）
     內容：名稱、欄列、meta.mode、物件

   用法：
     const code = LevelLib.encode(lv);        // → 'TL1-eyJuIjoi...'
     const lv2  = LevelLib.decode(code);      // → 獨立 Level（壞碼會丟錯）
     LevelLib.share(lv)                       // 產碼 + 複製到剪貼簿（有回傳碼）

     // 關卡庫（存在 localStorage）
     LevelLib.list();                         // [{ id, name, at, code }]
     LevelLib.add(lv, '我的迷宮');             // → entry
     LevelLib.get(id);                        // → 解碼後的 Level
     LevelLib.update(id, lv);                 // 覆蓋
     LevelLib.rename(id, '新名字');
     LevelLib.remove(id);
     LevelLib.importCode(code);               // 驗證 + 存進關卡庫 → entry

   注意：
     · encode 只支援 0~35 的格子值（我們用 0~3），超過會丟錯（避免默默壞掉）
     · decode 會做 validate()，壞碼／版本不對會丟出看得懂的錯誤
   ============================================================ */

const LevelLib = {
  PREFIX: 'TL1-',
  KEY: 'tinyengine-levels',
  MAX: 40,                       // 關卡庫上限（避免 localStorage 爆掉）

  /* ---------- base64（支援中文） ---------- */
  _b64enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  },
  _b64dec(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  },

  /* ---------- 關卡 → 碼 ---------- */
  encode(lv) {
    if (!lv || !lv.tiles) throw new Error('[level] encode 需要一個 Level');
    const W = lv.cols, H = lv.rows;
    if (lv.tiles.length !== W * H) throw new Error('[level] tiles 數量不對');
    // run-length（值用 36 進位單字元）
    let runs = '';
    let prev = lv.tiles[0], n = 0;
    for (let i = 0; i < lv.tiles.length; i++) {
      const t = lv.tiles[i];
      if (t > 35) throw new Error('[level] 格子值必須是 0~35（收到 ' + t + '）');
      if (t === prev) { n++; continue; }
      runs += prev.toString(36) + n.toString(36);
      prev = t; n = 1;
    }
    runs += prev.toString(36) + n.toString(36);

    const meta = lv.meta || {};
    const payload = {
      v: lv.v || 1,
      n: meta.name || '',
      c: W, r: H, cell: lv.cell || 16,
      m: meta.mode || '',
      en: meta.entry || 0,      // 出生點 [cx,cy]
      ex: meta.exit || 0,       // 出口點
      t: runs,
      o: lv.objects.length
        ? lv.objects.map(o => [o.type, o.cx, o.cy, o.data || 0])
        : 0,
    };
    return this.PREFIX + this._b64enc(JSON.stringify(payload));
  },

  /* ---------- 碼 → 關卡 ---------- */
  decode(code) {
    if (typeof code !== 'string') throw new Error('[level] 需要字串');
    const clean = code.replace(/\s+/g, '');
    if (clean.indexOf(this.PREFIX) !== 0) throw new Error('[level] 這不是關卡碼（開頭要 ' + this.PREFIX + '）');
    let data;
    try {
      data = JSON.parse(this._b64dec(clean.slice(this.PREFIX.length)));
    } catch (e) {
      throw new Error('[level] 關卡碼壞掉了（base64/JSON 解析失敗）');
    }
    if (!data || !data.c || !data.r || typeof data.t !== 'string') {
      throw new Error('[level] 關卡碼缺少欄位');
    }
    const W = data.c | 0, H = data.r | 0;
    if (W < 2 || H < 2 || W > 200 || H > 200) throw new Error('[level] 關卡尺寸不合理（' + W + '×' + H + '）');

    // 解 run-length
    const tiles = new Uint8Array(W * H);
    let idx = 0;
    for (let i = 0; i < data.t.length; i += 2) {
      const v = parseInt(data.t[i], 36);
      const n = parseInt(data.t[i + 1], 36);
      if (isNaN(v) || isNaN(n) || n <= 0) throw new Error('[level] 關卡碼的格子資料壞了');
      for (let k = 0; k < n; k++) {
        if (idx >= tiles.length) throw new Error('[level] 格子數量超過 ' + (W * H));
        tiles[idx++] = v;
      }
    }
    if (idx !== tiles.length) throw new Error('[level] 格子數量是 ' + idx + '，應該是 ' + (W * H));

    const lv = Level.create({ cols: W, rows: H, cell: data.cell || 16, meta: data.meta || {} });
    lv.tiles = tiles;
    lv.meta.name = data.n || lv.meta.name || '';
    lv.meta.mode = lv.meta.mode || '';
    if (data.m) lv.meta.mode = data.m;
    if (data.en) lv.meta.entry = data.en;
    if (data.ex) lv.meta.exit = data.ex;
    lv.objects = (data.o || []).map(o => ({
      type: o[0], cx: o[1] | 0, cy: o[2] | 0, data: o[3] || null,
    }));
    const errs = lv.validate().filter(e => e.level === 'error');
    if (errs.length) throw new Error('[level] ' + errs.map(e => e.msg).join('；'));
    return lv;
  },

  /* ---------- 關卡庫（localStorage） ---------- */
  list() {
    const d = Save.get(this.KEY, null);
    return (d && Array.isArray(d.items)) ? d.items : [];
  },
  _write(items) {
    Save.set(this.KEY, { v: 1, items: items.slice(0, this.MAX) });
    return items;
  },
  add(lv, name) {
    const code = this.encode(lv);
    const items = this.list();
    const id = 'lv' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const entry = {
      id,
      name: name || (lv.meta && lv.meta.name) || ('自製關卡 ' + (items.length + 1)),
      mode: (lv.meta && lv.meta.mode) || '',
      cols: lv.cols, rows: lv.rows,
      at: Date.now(),
      code,
    };
    items.unshift(entry);
    this._write(items);
    return entry;
  },
  update(id, lv, name) {
    const items = this.list();
    const e = items.find(it => it.id === id);
    if (!e) return this.add(lv, name);
    e.code = this.encode(lv);
    e.mode = (lv.meta && lv.meta.mode) || '';
    e.cols = lv.cols; e.rows = lv.rows;
    e.at = Date.now();
    if (name) e.name = name;
    this._write(items);
    return e;
  },
  get(id) {
    const e = this.list().find(it => it.id === id);
    return e ? this.decode(e.code) : null;
  },
  entry(id) { return this.list().find(it => it.id === id) || null; },
  rename(id, name) {
    const items = this.list();
    const e = items.find(it => it.id === id);
    if (!e) return null;
    e.name = name;
    this._write(items);
    return e;
  },
  remove(id) {
    const items = this.list().filter(it => it.id !== id);
    this._write(items);
    return items;
  },
  clear() { Save.del(this.KEY); return this; },

  /* 驗證 + 存進關卡庫（匯入用） */
  importCode(code, name) {
    const lv = this.decode(code);
    const clean = code.replace(/\s+/g, '');
    const dup = this.list().find(e => e.code === clean);   // 同一張就不要重複加
    return { level: lv, entry: dup || this.add(lv, name || lv.meta.name || '匯入的關卡'), dup: !!dup };
  },
};

/* ---- engine/edit.js ---- */
/* ============================================================
   engine/edit.js — 格子關卡編輯器（畫格存 JSON）  v1.6
   ------------------------------------------------------------
   給「關卡資料是格子的遊戲」用的最小編輯器：滑鼠塗格子、選色盤、存檔。

   用法（遊戲端）：
     Edit.init({
       level: Level,                     // 要編輯的 Level（會直接改它）
       palette: [                        // 色盤：第一個是「橡皮擦/可走」
         { v: 0, name: '地板', color: '#b8d94a' },
         { v: 1, name: '牆',   color: '#5b6b8a' },
       ],
       cell: 16,                         // 幾 px 一格
       origin: { x: 0, y: 16 },          // 地圖左上角在畫面上的位置
       canvas: 'game',                   // 要吃哪個 canvas 的滑鼠
       onChange: (lv) => {},             // 每次塗完（給遊戲重建 Grid 用）
       onSave: (json) => {},             // 按 S 存檔時（預設存 localStorage + console）
       key: 'tiny-level',                // localStorage key
     });
     Edit.toggle();           // 開 / 關
     Edit.draw();             // 每帧最後呼叫（畫格線、色盤、提示）
     Edit.update(dt);         // 可選（沒有動畫，留給之後）

   操作：
     左鍵塗 / 拖曳連續塗　　右鍵（或 Shift+左鍵）擦成 0
     1~9 選色盤　　滾輪 / Q E 換色　　G 切格線
     Ctrl+Z 復原　　S 存檔（localStorage + console）　　X 匯出 JSON 到 console
     E 或 Esc 關閉編輯器（遊戲端自己決定要不要綁）
   ============================================================ */

const Edit = {
  enabled: false,
  level: null,
  palette: [],
  sel: 0,
  cell: 16,
  origin: { x: 0, y: 0 },
  paletteY: null,        // 色盤的 y（預設貼在畫面底部；會被遊戲 UI 擋到就自己指定）
  markers: null,         // [{ key:'entry', name:'入口', color:'#e5484d' }] → 點了會寫進 level.meta[key]
  objectTypes: null,     // [{ type:'tower', name:'起始塔', color:'#ffd45e' }] → 點格子放/收 Level.objects
  onChange: null,
  onSave: null,
  key: 'tiny-level',
  gridLines: true,
  undoStack: [],
  painting: 0,          // 0 = 沒畫、1 = 塗、-1 = 擦
  lastPaint: null,      // 上一個塗過的格子（避免同一格重複觸發）
  hover: null,

  init(opt) {
    opt = opt || {};
    this.level = opt.level || null;
    this.palette = opt.palette || [{ v: 0, name: '地板', color: '#b8d94a' }];
    this.sel = 0;
    this.cell = opt.cell || 16;
    this.origin = opt.origin || { x: 0, y: 0 };
    this.paletteY = opt.paletteY != null ? opt.paletteY : null;
    this.markers = opt.markers || null;      // 標記（不算格子，存 meta）
    this.objectTypes = opt.objectTypes || null;
    this.onChange = opt.onChange || null;
    this.onSave = opt.onSave || null;
    this.key = opt.key || 'tiny-level';
    this.gridLines = true;
    this.undoStack = [];

    const canvas = typeof opt.canvas === 'string'
      ? document.getElementById(opt.canvas) : opt.canvas;
    this.canvas = canvas || null;
    if (canvas && !this._bound) this.bind(canvas);
    return this;
  },

  bind(canvas) {
    this._bound = true;
    const toCell = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * GAME_W - this.origin.x;
      const y = (e.clientY - r.top) / r.height * GAME_H - this.origin.y;
      return { cx: Math.floor(x / this.cell), cy: Math.floor(y / this.cell) };
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.hitPalette(e)) return;
      this.pushUndo();
      this.painting = (e.button === 2 || e.shiftKey) ? -1 : 1;
      this.lastPaint = null;
      this.paint(toCell(e));
    }, true);

    canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const c = toCell(e);
      this.hover = c;
      if (this.painting) this.paint(c);
    }, true);

    const stop = () => { this.painting = 0; this.lastPaint = null; };
    addEventListener('pointerup', stop);
    addEventListener('pointercancel', stop);
    canvas.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.ctrlKey && e.code === 'KeyZ') { this.undo(); e.preventDefault(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.paletteItems().length) { this.sel = n - 1; return; }
      if (e.code === 'KeyG') { this.gridLines = !this.gridLines; return; }
      if (e.code === 'KeyS') { this.save(); return; }
      if (e.code === 'KeyX') { this.exportJSON(); return; }
      const np = this.paletteItems().length;
      if (e.code === 'KeyQ') { this.sel = (this.sel + np - 1) % np; return; }
      if (e.code === 'KeyE') { this.sel = (this.sel + 1) % np; return; }
    });
  },

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  },

  /* ---------------- 色盤 ---------------- */
  /* 色盤項目 = 格子色 + 標記（標記接在後面） */
  paletteItems() {
    const items = [];
    for (let i = 0; i < this.palette.length; i++) {
      items.push({ kind: 'tile', i, v: this.palette[i].v, name: this.palette[i].name, color: this.palette[i].color });
    }
    if (this.markers) {
      for (const m of this.markers) {
        items.push({ kind: 'mark', key: m.key, name: m.name, color: m.color || '#ffd45e' });
      }
    }
    if (this.objectTypes) {
      for (const o of this.objectTypes) {
        items.push({ kind: 'object', type: o.type, name: o.name, color: o.color || '#ffd45e' });
      }
    }
    return items;
  },

  paletteRect(i) {
    const w = 56, h = 14, gap = 2;
    const y = this.paletteY != null ? this.paletteY : GAME_H - h - 3;
    return { x: 4 + i * (w + gap), y, w, h };
  },

  hitPalette(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * GAME_W;
    const y = (e.clientY - r.top) / r.height * GAME_H;
    const items = this.paletteItems();
    for (let i = 0; i < items.length; i++) {
      const b = this.paletteRect(i);
      if (x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) {
        this.sel = i;
        return true;
      }
    }
    return false;
  },

  /* ---------------- 畫格子 ---------------- */
  pushUndo() {
    if (!this.level) return;
    this.undoStack.push(Uint8Array.from(this.level.tiles));
    if (this.undoStack.length > 60) this.undoStack.shift();
  },

  undo() {
    if (!this.undoStack.length || !this.level) return false;
    this.level.tiles = this.undoStack.pop();
    this.changed();
    return true;
  },

  paint(c) {
    if (!this.level || !this.level.inside(c.cx, c.cy)) return false;
    const item = this.paletteItems()[this.sel] || { kind: 'tile', v: 0 };
    // 物件要能「同一格再點一次收掉」，所以只有格子/標記才擋重複
    if (item.kind !== 'object' && this.lastPaint &&
        this.lastPaint.cx === c.cx && this.lastPaint.cy === c.cy) return false;
    this.lastPaint = c;
    if (item.kind === 'object') {
      // 物件：點一次放、再點同一格收掉（右鍵也可以收）
      const hit = this.level.objectAt(c.cx, c.cy, item.type);
      if (hit) { this.level.removeObjectAt(c.cx, c.cy, item.type); this.changed(); return true; }
      if (this.painting < 0) return false;
      this.level.addObject(item.type, c.cx, c.cy, { from: 'edit' });
      this.changed();
      return true;
    }
    if (item.kind === 'mark') {
      // 標記（入口／出口…）不算格子，寫進 level.meta
      if (this.painting < 0) return false;
      this.level.meta[item.key] = [c.cx, c.cy];
      this.changed();
      return true;
    }
    const v = this.painting < 0 ? 0 : item.v;
    if (this.level.get(c.cx, c.cy) === v) return false;
    this.level.set(c.cx, c.cy, v);
    this.changed();
    return true;
  },

  changed() {
    if (this.onChange) this.onChange(this.level);
  },

  /* ---------------- 存檔 / 匯出 ---------------- */
  save() {
    if (!this.level) return null;
    const data = this.level.export();
    Save.set(this.key, data);
    if (this.onSave) this.onSave(data);
    else {
      console.log('[edit] 已存到 localStorage["' + this.key + '"]');
    }
    if (typeof HUD !== 'undefined' && HUD.toast) HUD.toast('關卡已儲存（localStorage）');
    return data;
  },

  exportJSON() {
    if (!this.level) return '';
    const json = this.level.serialize(true);
    console.log('[edit] 關卡 JSON：\\n' + json);
    if (typeof HUD !== 'undefined' && HUD.toast) HUD.toast('JSON 已印到 console');
    this.lastJSON = json;
    return json;
  },

  /* 下載成檔案（瀏覽器；測試不需要） */
  download(filename) {
    const json = this.exportJSON();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = filename || 'level.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  /* ---------------- 繪製 ---------------- */
  draw() {
    if (!this.enabled || !this.level) return;
    const ctx = G.ctx;
    const T = this.cell, ox = this.origin.x, oy = this.origin.y;

    /* 格子線 */
    if (this.gridLines) {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= this.level.cols; x++) {
        ctx.moveTo(ox + x * T + 0.5, oy);
        ctx.lineTo(ox + x * T + 0.5, oy + this.level.rows * T);
      }
      for (let y = 0; y <= this.level.rows; y++) {
        ctx.moveTo(ox, oy + y * T + 0.5);
        ctx.lineTo(ox + this.level.cols * T, oy + y * T + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* 游標 */
    if (this.hover && this.level.inside(this.hover.cx, this.hover.cy)) {
      const p = this.palette[this.sel];
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = p ? p.color : '#fff';
      ctx.fillRect(ox + this.hover.cx * T + 1, oy + this.hover.cy * T + 1, T - 2, T - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + this.hover.cx * T + 0.5, oy + this.hover.cy * T + 0.5, T - 1, T - 1);
    }

    /* 色盤 */
    for (let i = 0; i < this.palette.length; i++) {
      const p = this.palette[i];
      const b = this.paletteRect(i);
      roundRect(b.x, b.y, b.w, b.h, 3, 'rgba(12,18,14,0.9)', i === this.sel ? '#ffd45e' : '#5d7a52');
      ctx.fillStyle = p.color;
      ctx.fillRect(b.x + 3, b.y + 3, 8, 8);
      text((i + 1) + ' ' + p.name, b.x + 13, b.y + 4, { size: 5.5, color: '#f6ffe6', shadow: false });
    }

    /* 提示 */
    const hint = '編輯模式：左鍵塗 / 右鍵擦　1~9 換色　Ctrl+Z 復原　S 存檔　X 匯出 JSON　G 格線';
    ctx.globalAlpha = 0.8;
    roundRect(4, 2, Math.min(GAME_W - 8, UI.measure(hint, 5.5) + 10), 11, 3, 'rgba(8,14,10,0.85)');
    ctx.globalAlpha = 1;
    text(hint, 9, 4, { size: 5.5, color: '#d6f5a8', shadow: false });
  },
};

/* ---- engine/save.js ---- */
/* ============================================================
   engine/save.js — 存檔與排行榜（localStorage）
   ・Save.get / set / del / reset：任何 JSON 可存的值
   ・Save.addScore / Save.scores：排行榜（自動排序、去重上限）
   ・沒有 localStorage（無痕模式）時安靜地失敗，不會炸
   ============================================================ */

const Save = {
  ns: 'tinyengine',
  available: (() => {
    try {
      const k = '__te__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })(),

  key(k) { return this.ns + ':' + k; },

  get(k, def) {
    if (!this.available) return def;
    try {
      const v = localStorage.getItem(this.key(k));
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },

  set(k, v) {
    if (!this.available) return false;
    try { localStorage.setItem(this.key(k), JSON.stringify(v)); return true; }
    catch (e) { return false; }
  },

  del(k) {
    if (!this.available) return;
    try { localStorage.removeItem(this.key(k)); } catch (e) {}
  },

  /* 清掉這個 namespace 的所有資料 */
  reset() {
    if (!this.available) return;
    try {
      const pre = this.key('');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.indexOf(pre) === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
  },

  /* ---- 離線收益（掛機／陪伴類遊戲用） ----
     用法：每分鐘存一次進度，回來時問「我不在的時候賺了多少」
       Save.offline('idle', { hours: 8, rate: 120 })   // rate = 每小時產量
       → { seconds, hours, gain, capped, first, away }
     ・第一次呼叫只記錄時間，回傳 first=true、gain=0
     ・時鐘往回撥（或換電腦）不會給負數，一律當 0
     ・rate 也可以傳函式 (seconds) => gain，自己算倍率
     ※ 只動 localStorage 的 `<key>:ts`，不會覆蓋你的存檔內容。 */
  offline(key, opt) {
    opt = opt || {};
    const now = Date.now();
    const tsKey = key + ':ts';
    const last = this.get(tsKey, 0);
    const capH = opt.hours != null ? opt.hours : 8;
    this.set(tsKey, now);
    if (!last) return { seconds: 0, hours: 0, gain: 0, capped: false, first: true, away: 0 };
    let sec = (now - last) / 1000;
    if (!isFinite(sec) || sec < 0) sec = 0;          // 時鐘倒退 → 當 0
    const away = sec;
    const capped = sec > capH * 3600;
    if (capped) sec = capH * 3600;
    const gain = typeof opt.rate === 'function'
      ? opt.rate(sec)
      : (opt.rate || 0) * (sec / 3600);
    return { seconds: Math.round(sec), hours: sec / 3600, gain, capped, first: false, away: Math.round(away) };
  },

  /* 存檔版本升級：migrations = { 0: (data)=>…, 1: … }（key 是「舊版號」）
     回傳升級後的資料；沒有存檔時回傳 def。
     有升級過就順手寫回（避免每次載入都重跑；opt.write=false 可關）。 */
  migrate(key, version, migrations, def, opt) {
    const raw = this.get(key, null);
    if (!raw) return def === undefined ? null : def;
    let v = raw.version != null ? raw.version : (raw.v != null ? raw.v : 0);
    let data = raw;
    let changed = false;
    let guard = 0;
    while (v < version && guard++ < 50) {
      const fn = migrations && migrations[v];
      if (!fn) break;
      const out = fn(data);
      if (out) data = out;
      v = (data.version != null) ? data.version : v + 1;
      data.version = v;
      changed = true;
    }
    data.version = v;
    data.v = v;
    if (changed && !(opt && opt.write === false)) this.set(key, data);
    return data;
  },

  /* ---- 排行榜 ---- */
  scores(board, max) {
    return this.get('board:' + board, []).slice(0, max || 10);
  },

  /* 回傳 { rank, best, isRecord }（rank 從 1 開始，沒進榜為 0） */
  addScore(board, score, opt) {
    opt = opt || {};
    const max = opt.max || 10;
    const entry = Object.assign({ score, at: Date.now() }, opt.meta || {});
    const list = this.get('board:' + board, []);
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, max);
    this.set('board:' + board, top);
    const idx = top.indexOf(entry);
    return { rank: idx < 0 ? 0 : idx + 1, best: top[0] ? top[0].score : score, isRecord: idx === 0, list: top };
  },
};

/* ---- engine/scene.js ---- */
/* ============================================================
   engine/scene.js — 場景管理器（v1.3）
   ・Scene.register(name, { enter, exit, update, render, resize, debug })
   ・Scene.go(name, params)          切換（會呼叫上一個的 exit、新的 enter）
   ・Scene.overlay(def)              覆蓋層（面板/選單）：畫在場景之後，模擬不中斷
   ・Scene.attach()                  接上 Loop（update/render 一行搞定）
   ・Scene.beforeUpdate / beforeRender / afterRender 遊戲可掛自己的鉤子

   刻意保持極簡：沒有轉場動畫、沒有資料載入。需要淡入淡出就在
   enter() 裡自己開一個 t 計時器，畫在 render() 裡。
   ============================================================ */

const Scene = {
  list: {},
  name: null,
  def: null,
  params: null,
  t: 0,                 // 進入這個場景後經過的秒數
  syncState: false,     // v1.5：true = 切場景時順便改 G.state（TouchUI 靠它判斷）
  overlayDef: null,     // 覆蓋層（不影響 Scene.update）
  overlayT: 0,
  _attached: false,

  register(name, def) {
    this.list[name] = def || {};
    return this;
  },

  /* 切換場景。回傳 true 表示成功（沒註冊過會 warning 並回 false） */
  go(name, params) {
    const def = this.list[name];
    if (!def) { console.warn('[scene] 沒有註冊這個場景：', name); return false; }
    if (this.def && this.def.exit) this.def.exit(name);
    this.name = name;
    this.def = def;
    this.params = params || {};
    this.t = 0;
    if (this.syncState) G.state = name;      // v1.5：讓 TouchUI / 存檔等機制跟著場景走
    if (def.enter) def.enter(this.params);
    return true;
  },

  /* 重新進入目前場景（例如重玩） */
  restart(params) {
    if (this.name) return this.go(this.name, params);
    return false;
  },

  update(dt) {
    this.t += dt;
    if (this.beforeUpdate) this.beforeUpdate(dt);
    if (this.def && this.def.update) this.def.update(dt, this.t);
    if (this.overlayDef) {
      this.overlayT += dt;
      if (this.overlayDef.update) this.overlayDef.update(dt, this.overlayT);
    }
  },

  render() {
    if (this.beforeRender) this.beforeRender(this.t);   // 例：UI.beginFrame()
    if (this.def && this.def.render) this.def.render(this.t);
    if (this.afterRender) this.afterRender(this.t);
  },

  /* 覆蓋層：例如設定面板、暫停選單。傳 null 關閉 */
  overlay(def) {
    if (this.overlayDef && this.overlayDef.exit) this.overlayDef.exit();
    this.overlayDef = def || null;
    this.overlayT = 0;
    if (this.overlayDef && this.overlayDef.enter) this.overlayDef.enter();
    return this;
  },
  closeOverlay() { return this.overlay(null); },
  hasOverlay() { return !!this.overlayDef; },

  renderOverlay() {
    if (this.overlayDef && this.overlayDef.render) this.overlayDef.render(this.overlayT);
  },

  /* 視窗尺寸變了 → 轉給目前場景（有的場景要重算版面） */
  resize() {
    if (this.def && this.def.resize) this.def.resize();
    if (this.overlayDef && this.overlayDef.resize) this.overlayDef.resize();
  },

  /* 接上主迴圈。可傳入自訂 loop（預設用引擎的 Loop） */
  attach(loop) {
    const L = loop || Loop;
    if (!L) { console.warn('[scene] 找不到 Loop，請先載入 core.js'); return this; }
    L.update = (dt) => this.update(dt);
    L.render = () => { this.render(); this.renderOverlay(); };
    if (!this._attached) {
      this._attached = true;
      addEventListener('resize', () => this.resize());
    }
    return this;
  },

  /* 除錯字串（接 Loop.debugInfo 很方便） */
  debugInfo() {
    return 'scene=' + (this.name || '-') + (this.overlayDef ? '+overlay' : '');
  },
};

/* ---- engine/ui.js ---- */
/* ============================================================
   engine/ui.js — 文字（字型快取）、面板、熱區、按鈕、九宮格
   v1.3：新增 UI.hot / hitAt / pointer / click / button / chip / bar /
         nineSlice / measure / bind（熱區物件會重複使用，不每帧配置）
   ============================================================ */

let _fontCache = '';
function text(str, x, y, opt) {
  opt = opt || {};
  const ctx = G.ctx;
  const size = opt.size || 7;
  const f = `${opt.bold === false ? '' : 'bold '}${size}px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif`;
  if (f !== _fontCache) { ctx.font = f; _fontCache = f; }
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = opt.baseline || 'top';
  if (opt.shadow !== false) {
    ctx.fillStyle = opt.shadowColor || 'rgba(12,14,32,0.85)';
    ctx.fillText(str, x + 1, y + 1);
  }
  ctx.fillStyle = opt.color || '#fff8e7';
  ctx.fillText(str, x, y);
}

function hudPanel(x, y, w, h) {
  const ctx = G.ctx;
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#101426';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

/* 圓角面板（選單/卡片用） */
function panel(x, y, w, h, opt) {
  opt = opt || {};
  const ctx = G.ctx;
  ctx.globalAlpha = opt.alpha != null ? opt.alpha : 0.92;
  ctx.fillStyle = opt.fill || '#161b2e';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.globalAlpha = opt.borderAlpha != null ? opt.borderAlpha : 1;
  ctx.strokeStyle = opt.border || '#ffe9a8';
  ctx.lineWidth = opt.lineWidth || 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = 1;
}

/* 熱區判定（邏輯座標） */
function inRect(rect, lx, ly) {
  return lx >= rect.x && lx <= rect.x + rect.w && ly >= rect.y && ly <= rect.y + rect.h;
}

/* 圓角矩形 */
function roundRect(x, y, w, h, r, fill, stroke, lw) {
  const ctx = G.ctx;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}

/* ---------------- 熱區 / 指標 ---------------- */
const UI = {
  text, hudPanel, panel, inRect, roundRect,
  toWorld: (x, y) => Display.toWorld(x, y),

  hover: null,            // 這一帧滑鼠下的 id
  _hot: [],               // 熱區池（重複使用，避免每帧配置）
  _hotN: 0,
  _mouse: { x: -1, y: -1 },
  _measure: new Map(),    // 文字寬度快取（按鈕一多就有感）

  /* 每帧開頭呼叫：清空熱區（只是把索引歸零，不重建陣列） */
  beginFrame() { this._hotN = 0; },

  /* 註冊熱區：先註冊的優先度低，後註冊的會蓋掉前面的 */
  hot(id, x, y, w, h, opt) {
    let r = this._hot[this._hotN];
    if (!r) { r = this._hot[this._hotN] = {}; }
    r.id = id; r.x = x; r.y = y; r.w = w; r.h = h; r.opt = opt || null;
    this._hotN++;
    return r;
  },

  hitAt(x, y) {
    for (let i = this._hotN - 1; i >= 0; i--) {
      const r = this._hot[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  },

  /* 更新 hover 與游標；回傳目前 hover 的熱區（沒有就 null） */
  pointer(x, y) {
    this._mouse.x = x; this._mouse.y = y;
    this.hover = (x < 0 || y < 0) ? null : this.hitAt(x, y);
    if (G.canvas) G.canvas.style.cursor = this.hover ? 'pointer' : 'default';
    return this.hover;
  },

  /* 回傳被點到的熱區 id（沒有就 null） */
  click(x, y) {
    const r = this.hitAt(x, y);
    return r ? r.id : null;
  },

  /* 把 canvas 的指標事件接到 UI 熱區；onAct(id, point) 只在命中時呼叫 */
  bind(canvas, onAct, opt) {
    opt = opt || {};
    const toWorld = (e) => Display.toWorld(e.clientX, e.clientY);
    canvas.addEventListener('pointermove', (e) => {
      const p = toWorld(e);
      this.pointer(p.x, p.y);
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => this.pointer(-1, -1), { passive: true });
    canvas.addEventListener('pointerdown', (e) => {
      const p = toWorld(e);
      this.pointer(p.x, p.y);
      if (opt.unlock !== false && typeof Sfx !== 'undefined') Sfx.unlock();
      const id = this.click(p.x, p.y);
      if (id != null && onAct) onAct(id, p);
    });
    return this;
  },

  /* ---------------- 小元件 ---------------- */
  /* 文字寬度（有快取；同字串同字級只量一次） */
  measure(str, size) {
    size = size || 7;
    const key = size + '|' + str;
    const hit = this._measure.get(key);
    if (hit != null) return hit;
    const ctx = G.ctx;
    const f = `bold ${size}px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif`;
    const prev = ctx.font;
    ctx.font = f;
    const w = ctx.measureText(str).width;
    ctx.font = prev;
    if (this._measure.size > 600) this._measure.clear();   // 防止無限成長
    this._measure.set(key, w);
    return w;
  },

  /* 標籤（小晶片） */
  chip(x, y, label, opt) {
    opt = opt || {};
    const size = opt.size || 6;
    const pad = opt.pad == null ? 4 : opt.pad;
    const w = Math.ceil(this.measure(label, size)) + pad * 2;
    const h = size + pad * 1.6;
    roundRect(x, y, w, h, 3, opt.fill || 'rgba(16,22,34,0.72)', opt.stroke || 'rgba(255,255,255,0.06)');
    text(label, x + w / 2, y + h / 2, { size, color: opt.color || '#f2e8d5', align: 'center', baseline: 'middle' });
    return w;
  },

  /* 條狀量表 */
  bar(x, y, w, h, pct, color, bg) {
    const ctx = G.ctx;
    ctx.fillStyle = bg || 'rgba(0,0,0,0.42)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color || '#7ec08d';
    ctx.fillRect(x, y, Math.max(0, Math.round(w * U.clamp(pct, 0, 1))), h);
  },

  /* 按鈕：hover / disabled / 熱區 一次搞定
     opt = { size, color, fill, disabled, radius, textAlign, border } */
  button(id, x, y, w, h, label, opt) {
    opt = opt || {};
    const hov = this.hover && this.hover.id === id;
    const fill = opt.disabled ? (opt.fillDisabled || '#1a2230')
      : (hov ? (opt.fillHover || '#2d3b53') : (opt.fill || '#202b3d'));
    const border = opt.disabled ? (opt.borderDisabled || '#2a3344')
      : (hov ? (opt.borderHover || '#5a6f92') : (opt.border || '#38455e'));
    roundRect(x, y, w, h, opt.radius == null ? 3 : opt.radius, fill, border);
    text(label, x + w / 2, y + h / 2 + 0.5, {
      size: opt.size || 6,
      color: opt.disabled ? (opt.colorDisabled || '#5c6779') : (opt.color || '#f2e8d5'),
      align: 'center', baseline: 'middle',
    });
    if (!opt.disabled) this.hot(id, x, y, w, h);
    return this;
  },

  /* 九宮格貼圖（GUI 素材的 32×32 / 16×16 邊框）
     img 可以是 Image 或 { img }（sheet）；slice = 邊角像素 */
  nineSlice(img, slice, x, y, w, h, opt) {
    const ctx = G.ctx;
    const im = img && img.img ? img.img : img;
    if (!im || !im.width) return;
    opt = opt || {};
    const s = slice || 8;
    const iw = im.width, ih = im.height;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const midW = Math.max(0, w - s * 2), midH = Math.max(0, h - s * 2);
    const sw = Math.max(0, iw - s * 2), sh = Math.max(0, ih - s * 2);
    if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
    /* 四角 */
    ctx.drawImage(im, 0, 0, s, s, x, y, s, s);
    ctx.drawImage(im, iw - s, 0, s, s, x + w - s, y, s, s);
    ctx.drawImage(im, 0, ih - s, s, s, x, y + h - s, s, s);
    ctx.drawImage(im, iw - s, ih - s, s, s, x + w - s, y + h - s, s, s);
    /* 四邊 */
    if (midW && sw) {
      ctx.drawImage(im, s, 0, sw, s, x + s, y, midW, s);
      ctx.drawImage(im, s, ih - s, sw, s, x + s, y + h - s, midW, s);
    }
    if (midH && sh) {
      ctx.drawImage(im, 0, s, s, sh, x, y + s, s, midH);
      ctx.drawImage(im, iw - s, s, s, sh, x + w - s, y + s, s, midH);
    }
    /* 中央 */
    if (midW && midH && sw && sh) ctx.drawImage(im, s, s, sw, sh, x + s, y + s, midW, midH);
    if (opt.alpha != null) ctx.globalAlpha = 1;
  },
};

/* ---- engine/touch.js ---- */
/* ============================================================
   touch.js — 手機 / 平板觸控操作（螢幕座標版）
   重點：控制項畫在「遊戲畫布之外」的空白區（letterbox），
        所以橫式時按鈕在左右黑邊、直式時在下方空白，
        遊戲畫面完全不會被按鈕遮住，也順便用掉 4:3 的黑邊。
   ・左半/左下 = 浮動虛擬搖桿
   ・右下角落 = 劍 / 弓 / 盾（＋靠近商店時的「升級」）
   ・標題 / 暫停 / 結束：點畫面任意處
   ============================================================ */

/* 觸控震動回饋（沒有支援的裝置就靜靜略過） */
function buzz(ms) {
  if (typeof TouchUI !== 'undefined' && TouchUI.enabled && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) { /* 忽略 */ }
  }
}

const TouchUI = {
  enabled: false,
  /* ---- 遊戲設定（見 engine/README.md）----
     TouchUI.showIn  = ['play']                     哪個 G.state 要顯示觸控層
     TouchUI.setButtons([ { a:'sword', label:'劍', tint:'#ffd45e', r:42, dx:0, dy:0 }, ... ])
     TouchUI.extra   = { test: () => 條件, action:'interact', label:'升級' }   情境按鈕 */
  showIn: ['play'],
  extra: null,
  buttonDefs: [
    { a: 'a', label: 'A', tint: '#ffd45e', r: 42, dx: 0, dy: 0 },
  ],

  /* dx / dy 以「按鈕叢集中心」為基準、單位是 scale（s） */
  setButtons(list) {
    this.buttonDefs = list || [];
    this.layout();
  },
  ui: null, uiCtx: null,
  dpr: 1,
  joy: { id: null, ox: 0, oy: 0, kx: 0, ky: 0 },
  btns: [],            // {a, x, y, r, label} —— 螢幕 CSS px
  interact: null,      // 商店升級鈕
  layoutT: 0,
  held: new Set(),
  prevHeld: new Set(),
  scale: 1,
  safe: { l: 0, r: 0, t: 0, b: 0 },

  init() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const forced = /[?&]touch=1/.test(location.search);
    const off = /[?&]touch=0/.test(location.search);
    this.enabled = !off && (forced || coarse || hasTouch);
    if (!this.enabled) return;

    document.body.classList.add('touch');
    this.ui = document.getElementById('ui');
    if (this.ui) this.uiCtx = this.ui.getContext('2d');
    this.resize();

    const opts = { passive: false };
    document.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    document.addEventListener('pointermove', (e) => this.onMove(e), opts);
    document.addEventListener('pointerup', (e) => this.onUp(e), opts);
    document.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, opts);
    document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, opts);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());

    this.layout();
  },

  resize() {
    if (!this.ui) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ui.width = Math.round(innerWidth * this.dpr);
    this.ui.height = Math.round(innerHeight * this.dpr);
    this.safe = this.readSafeArea();
    this.layout();
  },

  /* 讀取 iOS 瀏海 / 手勢區的安全邊距 */
  readSafeArea() {
    try {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(d);
      const cs = getComputedStyle(d);
      const v = {
        t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
        b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0,
      };
      d.remove();
      return v;
    } catch (e) { return { l: 0, r: 0, t: 0, b: 0 }; }
  },

  /* 依「遊戲畫布之外的空白」擺放控制項（螢幕 CSS px） */
  layout() {
    const W = innerWidth, H = innerHeight;
    let gr = { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
    if (G.canvas) gr = G.canvas.getBoundingClientRect();
    const s = this.scale = U.clamp(Math.min(W, H) / 520, 0.78, 1.35);

    const barR = W - gr.right;      // 右邊黑邊寬
    const barL = gr.left;           // 左邊黑邊寬
    const barB = H - gr.bottom;     // 下面黑邊高

    /* 右下角：劍 / 弓 / 盾（避開瀏海與手勢區） */
    const cx = W - Math.max(78 * s, this.safe.r + 62 * s);
    const cy = H - Math.max(84 * s, this.safe.b + 70 * s);
    this.btns = this.buttonDefs.map((b) => ({
      a: b.a,
      label: b.label || '',
      tint: b.tint || '#ffffff',
      x: cx + (b.dx || 0) * s,
      y: cy + (b.dy || 0) * s,
      r: (b.r || 32) * s,
    }));

    /* 左下角：搖桿基準位置（浮動，實際會跟著手指跑） */
    this.joyHome = { x: Math.max(82 * s, this.safe.l + 70 * s), y: H - Math.max(86 * s, this.safe.b + 72 * s), r: 56 * s };

    /* 情境按鈕：放在叢集左上方 */
    this.interact = { x: cx, y: cy - 172 * s, r: 30 * s };

    this.bars = { barL, barR, barB };
  },

  /* ---------- 事件 ---------- */
  hit() {
    const t = [];
    for (const b of this.btns) t.push({ type: 'act', w: b });
    return t;
  },

  onDown(e) {
    /* 房號輸入框等 DOM UI：不要攔 */
    if (e.target && e.target.closest && e.target.closest('#netUI')) return;
    if (e.cancelable) e.preventDefault();
    Sfx.unlock();

    /* 非遊戲中（標題 / 區網 / 整備 / 暫停 / 結束）→ 全部交給 G.tap 判斷點到哪 */
    if (G.state !== 'play') {
      if (typeof G.tap === 'function') G.tap(e.clientX, e.clientY);
      return;
    }

    const px = e.clientX, py = e.clientY;

    /* 情境按鈕（由遊戲註冊） */
    if (this.extra && this.extra.test && this.extra.test()) {
      const ib = this.interact;
      if (ib && U.dist(px, py, ib.x, ib.y) < ib.r * 1.3) { Input.pressed[this.extra.action] = true; return; }
    }

    /* 動作按鈕 */
    for (const b of this.btns) {
      if (U.dist(px, py, b.x, b.y) < b.r * 1.25) {
        b.id = e.pointerId;
        this.held.add(b.a);
        Input.down[b.a] = true;
        Input.pressed[b.a] = true;
        return;
      }
    }

    /* 其他區域（非按鈕）→ 浮動搖桿 */
    if (this.joy.id === null) {
      this.joy.id = e.pointerId;
      this.joy.ox = px; this.joy.oy = py;
      this.joy.kx = px; this.joy.ky = py;
    }
  },

  onMove(e) {
    if (e.pointerId !== this.joy.id) return;
    if (e.cancelable) e.preventDefault();
    const r = this.joyHome.r;
    let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > r) { dx = (dx / len) * r; dy = (dy / len) * r; }
    this.joy.kx = this.joy.ox + dx;
    this.joy.ky = this.joy.oy + dy;
  },

  onUp(e) {
    if (e.pointerId === this.joy.id) this.joy.id = null;
    for (const b of this.btns) {
      if (b.id === e.pointerId) { b.id = null; this.held.delete(b.a); }
    }
  },

  /* ---------- 每帧合併狀態 ---------- */
  update() {
    if (!this.enabled) return;

    for (const a of this.prevHeld) {
      if (!this.held.has(a) && !Input.keyDown[a]) Input.down[a] = false;
    }
    this.prevHeld = new Set(this.held);
    for (const a of this.held) Input.down[a] = true;

    /* 搖桿 → 連續方向向量（不吸附 4/8 方向，推多遠走多快） */
    if (this.joy.id !== null) {
      const R = this.joyHome.r;
      const dx = (this.joy.kx - this.joy.ox) / R;
      const dy = (this.joy.ky - this.joy.oy) / R;
      const mag = Math.min(1, Math.hypot(dx, dy));
      Input.touchAxis = mag > 0.12 ? { x: dx, y: dy, mag } : null;
    } else {
      Input.touchAxis = null;
    }
  },

  /* ---------- 繪製（畫在 #ui 這張全螢幕透明畫布上） ---------- */
  draw() {
    if (!this.enabled || !this.uiCtx) return;
    const ctx = this.uiCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (this.showIn.indexOf(G.state) < 0) return;

    const s = this.scale;

    /* --- 搖桿 --- */
    const j = this.joy;
    const ox = j.id !== null ? j.ox : this.joyHome.x;
    const oy = j.id !== null ? j.oy : this.joyHome.y;
    const R = this.joyHome.r;
    const kx = j.id !== null ? j.kx : ox;
    const ky = j.id !== null ? j.ky : oy;

    ctx.globalAlpha = j.id !== null ? 0.5 : 0.32;
    ctx.fillStyle = '#101426';
    ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.stroke();
    // 十字方向提示
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(ox - R * 0.55, oy); ctx.lineTo(ox + R * 0.55, oy);
    ctx.moveTo(ox, oy - R * 0.55); ctx.lineTo(ox, oy + R * 0.55);
    ctx.stroke();

    ctx.globalAlpha = j.id !== null ? 0.85 : 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(kx, ky, R * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    /* --- 動作按鈕 --- */
    for (const b of this.btns) {
      const on = this.held.has(b.a);
      ctx.globalAlpha = on ? 0.85 : 0.6;
      ctx.fillStyle = on ? b.tint : '#101426';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = on ? '#ffffff' : b.tint; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = 'bold ' + Math.round(b.r * 0.66) + 'px "Microsoft JhengHei","PingFang TC",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = on ? '#0b0e1c' : '#fff8e7';
      ctx.fillText(b.label, b.x, b.y + 1);
    }

    /* --- 情境按鈕（遊戲註冊） --- */
    if (this.extra && this.extra.test && this.extra.test() && this.interact) {
      const ib = this.interact;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(ib.x, ib.y, ib.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ib.x, ib.y, ib.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0b0e1c';
      ctx.font = 'bold ' + Math.round(ib.r * 0.52) + 'px "Microsoft JhengHei","PingFang TC",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.extra.label || '', ib.x, ib.y + 1);
    }
  },
};

/* ============================================================
   Screen — 全螢幕切換（DOM 按鈕，確保有真實使用者手勢）
   ・支援 Fullscreen API：真的進全螢幕 + 嘗試鎖定橫向
   ・不支援（iOS Safari / App 內建瀏覽器）：提示原因與解法
   ============================================================ */
const Screen = {
  btn: null,
  toastEl: null,
  toastTimer: 0,

  init() {
    this.btn = document.getElementById('fsBtn');
    this.toastEl = document.getElementById('toast');
    if (!this.btn) return;
    this.btn.classList.add('show');
    this.btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.toggle();
    });
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); });
    ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) =>
      document.addEventListener(ev, () => { this.sync(); setTimeout(() => typeof Display !== 'undefined' && Display.layout(), 120); }));
    this.sync();
  },

  isFull() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
              document.webkitCurrentFullScreenElement);
  },

  /* 瀏海手機的瀏海方向 */
  supported() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
  },

  inAppBrowser() {
    const ua = navigator.userAgent;
    return /Line|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|WeChat|KAKAOTALK|NAVER|Twitter|TikTok|musical_ly/i.test(ua);
  },

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  toggle() {
    if (this.isFull()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      try { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      return;
    }
    if (!this.supported()) { this.explain(); return; }
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => this.lockLandscape()).catch((err) => this.explain(err));
      else this.lockLandscape();
    } catch (err) {
      this.explain(err);
    }
  },

  lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) { /* 略過 */ }
  },

  explain(err) {
    let msg;
    if (this.inAppBrowser()) {
      msg = '這個 App 的內建瀏覽器不支援全螢幕。<br>請點下面的按鈕複製網址，用 <b>Chrome</b> 或 <b>Safari</b> 開啟。';
      this.toast(msg, { copy: true });
      return;
    }
    if (this.isIOS()) {
      msg = 'iPhone 的 Safari 不提供網頁全螢幕。<br>請點「分享」→「加入主畫面」，從主畫面開啟就能全螢幕玩。';
      this.toast(msg);
      return;
    }
    msg = '這個瀏覽器拒絕了全螢幕請求。<br>可以試試：<br>・再按一次按鈕<br>・改用 Chrome<br>・關閉「在 iframe 中開啟」的 App 內建瀏覽器';
    this.toast(msg);
  },

  toast(msg, opt = {}) {
    const el = this.toastEl;
    if (!el) return;
    el.innerHTML = msg + (opt.copy
      ? '<br><button type="button">複製網址</button>'
      : '');
    el.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = location.href;
        const done = () => this.toast('已複製網址，貼到 Chrome / Safari 開啟即可');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(() => this.fallbackCopy(url, done));
        } else {
          this.fallbackCopy(url, done);
        }
      });
    });
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), opt.copy ? 9000 : 6000);
  },

  fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { this.toast('請手動複製網址：' + text); }
    ta.remove();
  },

  sync() {
    if (!this.btn) return;
    this.btn.classList.toggle('is-full', this.isFull());
    this.btn.setAttribute('title', this.isFull() ? '離開全螢幕' : '全螢幕');
    this.btn.setAttribute('aria-label', this.isFull() ? '離開全螢幕' : '全螢幕');
  },
};

/* ---- engine/net.js ---- */
/* ============================================================
   net.js — 區網連線對戰（一主機 + 一加入）
   ・用 tools/serve.py 內建的 WebSocket 中繼（/ws?room=CODE&role=host|peer）
   ・模型：房主跑完整模擬（權威），加入端只送操作 + 畫房主送來的狀態
   ・房主的邏輯高度 GAME_H 會傳給加入端，兩邊場地完全一致
   ============================================================ */

const Net = {
  ws: null,
  role: null,          // 'host' | 'peer'
  room: '',
  active: false,
  ready: false,
  isHost: false,
  isPeer: false,
  status: 'idle',      // idle | connecting | waiting | playing | closed | error
  errMsg: '',
  sendT: 0,
  latch: {},          // 加入端：把 justPressed 鎖住，避免送出間隔漏掉
  snap: null,
  snapAge: 0,
  snapCount: 0,
  lastRecv: 0,
  sentCount: 0,

  /* 加入端 → 房主的輸入 */
  remote: {
    axis: { x: 0, y: 0, mag: 0 },
    down: {},
    pressed: {},
    moveAxis() {
      const a = this.axis;
      return a.mag > 0.06 ? { x: a.x, y: a.y, mag: a.mag } : { x: 0, y: 0, mag: 0 };
    },
    isDown(a) { return !!this.down[a]; },
    justPressed(a) { return !!this.pressed[a]; },
    clearPressed() { this.pressed = {}; },
    set(msg) {
      this.axis = msg.m || { x: 0, y: 0, mag: 0 };
      this.down = msg.d || {};
      const p = msg.p || {};
      for (const k in p) if (p[k]) this.pressed[k] = true;
    },
  },

  /* 診斷列：?debug=1 或加入端超過 1.5 秒沒收到狀態 */
  debugOn() {
    return /[?&]debug=1/.test(location.search) || (this.isPeer && this.snapAge > 1.5);
  },

  /* 目前是否為「房主／加入端」 */
  get host() { return this.role === 'host'; },

  /* ---------- 房號 ---------- */
  makeCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0];
    return s;
  },

  /* ---------- 連線 ---------- */
  connect(role, room) {
    this.close();
    this.role = role;
    this.room = room;
    this.isHost = role === 'host';
    this.isPeer = role === 'peer';
    this.status = 'connecting';
    this.errMsg = '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&role=${role}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.status = 'error'; this.errMsg = '無法建立連線'; return; }
    this.ws = ws;
    this.active = true;

    ws.onopen = () => { this.status = 'waiting'; };
    ws.onerror = () => {
      this.status = 'error';
      this.errMsg = '連不上伺服器（要用 python tools/serve.py 開啟，不能直接雙擊檔案）';
    };
    ws.onclose = () => {
      if (this.status !== 'error') this.status = 'closed';
      this.ready = false;
      if (this.onDrop) this.onDrop('closed');
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
  },

  close() {
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.ws = null;
    this.active = false;
    this.ready = false;
    this.status = 'idle';
    this.snap = null;
  },

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    }
  },

  onMessage(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'sys') {
      if (m.msg === 'room-ready') {
        this.ready = true;
        if (this.onReady) this.onReady();
        if (this.isPeer) this.send({ t: 'need' });     // 立刻要一份狀態
      }
      if (m.msg === 'peer-joined') { this.ready = true; this.onReady(); }
      if (m.msg === 'peer-left') {
        this.ready = false;
        this.snap = null;
        if (this.onDrop) this.onDrop('peer-left');
      }
      return;
    }

    if (m.t === 'hello') {
      this.hostH = m.h;
      if (this.onHello) this.onHello(m);
      return;
    }

    if (m.t === 'i' && this.isHost) {
      this.remote.set(m);
      return;
    }

    if (m.t === 'need' && this.isHost) {
      if (this.produceSnapshot) this.send(this.produceSnapshot());
      return;
    }

    if (m.t === 'need') { /* 加入端的請求，忽略 */ return; }

    if (m.t === 's' && this.isPeer) {
      this.snap = m;
      this.snapAge = 0;
      this.snapCount += 1;
      this.lastRecv = performance.now();
      if (this.onSnapshot) this.onSnapshot(m);
      return;
    }

    if (m.t === 'bye') {
      this.ready = false;
      if (this.onDrop) this.onDrop('bye');
    }
  },

  /* ---- 以下是遊戲要接的鉤子 ---- */
  produceSnapshot: null,     // 房主：() => 要送出的物件
  onSnapshot: null,          // 加入端：(snap) => {}
  onDrop: null,              // 對方離線：(reason) => {}
  onReady: null,             // 兩端都連上
  onHello: null,             // 加入端收到房主的 hello

  /* ---------- 加入端：送操作 ---------- */
  /* 通用：把「這一帧的按鍵狀態」整包送出去（動作名稱由遊戲自己定義） */
  sendInput() {
    const mv = Input.moveAxis();
    this.send({
      t: 'i',
      m: { x: Math.round(mv.x * 100) / 100, y: Math.round(mv.y * 100) / 100, mag: Math.round(mv.mag * 100) / 100 },
      d: Input.down,
      p: this.latch,
    });
    this.latch = {};
  },

  /* ---------- 每帧 ---------- */
  update(dt) {
    if (!this.active) return;
    this.sendT += dt;
    if (this.isHost) {
      if (this.sendT > 0.033) {          // 30Hz 送狀態（只送給已連上的加入端）
        this.sendT = 0;
        if (this.ready && this.produceSnapshot) { this.send(this.produceSnapshot()); this.sentCount += 1; }
      }
    } else if (this.isPeer) {
      /* 每一帧都記下按鍵（justPressed 只存在 16ms，40Hz 送出會漏） */
      for (const a in Input.pressed) if (Input.pressed[a]) this.latch[a] = 1;
      if (this.sendT > 0.025) {          // 40Hz 送操作
        this.sendT = 0;
        this.sendInput();
      }
      if (this.snap) this.snapAge += dt;
    }
  },
};

/* ---- engine/namespace.js ---- */
/* ============================================================
   engine/namespace.js — 命名空間與「撞名」防護  v1.6
   ------------------------------------------------------------
   問題：引擎有一堆全域（G / Display / Camera / Grid / SHEETS …）。
   遊戲也宣告 `const SHEETS = {}` 時，整個檔案直接 SyntaxError
   （tiny-keep 就撞過一次）。

   這一支做三件事：
     1) 把引擎的東西掛到 `TE.` 底下（新專案請用 TE.xxx，避免再撞）
     2) `TE.reserved` 列出所有保留名稱，遊戲端可以自我檢查
     3) `TE.checkGlobals(obj)` 給遊戲在 dev 模式檢查自己的全域有沒有撞名
        （另附 tools/globals.py：不用跑就先用掃的，CI 可用）

   注意：舊寫法（直接用 `Grid.xxx`）完全不受影響，這一支只是「多一個入口」。
   ============================================================ */

const TE = {
  version: typeof TINY_ENGINE_VERSION !== 'undefined' ? TINY_ENGINE_VERSION : '?',
  reserved: [
    /* 核心 */
    'G', 'GAME_W', 'GAME_H', 'SCALE', 'Display', 'Camera', 'Loop', 'Input',
    /* 資源與繪製 */
    'ASSETS', 'SHEETS', 'WHITES', 'assetDef', 'sheetOf', 'loadAll', 'collectSheets',
    'drawSheet', 'drawDirSheet', 'drawCrop', 'drawSprite', 'frameOf', 'drawFrames',
    'shadow', 'Sprite', 'DIR_ROW', 'DIR_NAMES',
    /* 系統 */
    'Sfx', 'Fx', 'Physics', 'Pathfind', 'Grid', 'Level', 'LevelLib', 'Edit', 'Save', 'Scene', 'Net',
    /* UI / 觸控 */
    'UI', 'text', 'hudPanel', 'panel', 'roundRect', 'inRect', 'TouchUI', 'Screen', 'buzz',
    /* 工具 */
    'U', 'DIRV',
    /* 常數 */
    'TINY_ENGINE_VERSION',
  ],

  /* 常用的東西安裝到 TE 底下（沒載入的模組就不會出現）
     注意：引擎的模組是 `const`（在全域詞法環境），不會變成 window 的屬性，
     所以這裡要一個一個明確取用（箭頭函式是為了延後到呼叫時才讀，避免 TDZ）。 */
  install() {
    const refs = {
      G: () => G, Display: () => Display, Camera: () => Camera, Loop: () => Loop,
      Input: () => Input, Sfx: () => Sfx, Fx: () => Fx, Physics: () => Physics,
      Pathfind: () => Pathfind, Grid: () => Grid, Level: () => Level, LevelLib: () => LevelLib, Edit: () => Edit,
      Save: () => Save, Scene: () => Scene, Net: () => Net, Sprite: () => Sprite,
      UI: () => UI, TouchUI: () => TouchUI, Screen: () => Screen,
      U: () => U, DIRV: () => DIRV, ASSETS: () => ASSETS, SHEETS: () => SHEETS,
      text: () => text, roundRect: () => roundRect, panel: () => panel, inRect: () => inRect,
      loadAll: () => loadAll, sheetOf: () => sheetOf, assetDef: () => assetDef,
      drawSheet: () => drawSheet, drawDirSheet: () => drawDirSheet, drawCrop: () => drawCrop,
      drawSprite: () => drawSprite, frameOf: () => frameOf, drawFrames: () => drawFrames,
      shadow: () => shadow, buzz: () => buzz,
    };
    for (const k in refs) {
      try {
        const v = refs[k]();
        if (v !== undefined) this[k] = v;
      } catch (e) { /* 這個模組沒載入 */ }
    }
    return this;
  },

  /* 這個名字是引擎保留的嗎 */
  isReserved(name) { return this.reserved.indexOf(name) >= 0; },

  /* dev 檢查：傳進「遊戲自己的全域表」，回傳撞到的名字
     用法：const bad = TE.checkGlobals({ SHEETS, SRC, Game, Battle });
     （不傳的話就看 window 上有沒有重複宣告——但那通常已經 SyntaxError 了，
       所以建議把遊戲的全域名稱手動列進去，或直接用 tools/globals.py） */
  checkGlobals(map) {
    const hits = [];
    if (map) {
      for (const k in map) if (this.isReserved(k)) hits.push(k);
    }
    return hits;
  },

  /* 給新專案用：TE.ns('MyGame', api => { api.foo = ... })
     回傳一個乾淨的物件（內部用什麼名字都不會污染全域） */
  ns(name, fn) {
    const bag = {};
    if (fn) fn(bag);
    this[name] = bag;
    return bag;
  },
};

TE.install();
