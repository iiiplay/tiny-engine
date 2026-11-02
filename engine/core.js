'use strict';
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
    if (this._fitOpt) { this.fit(G.canvas, this._fitOpt); return; }
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
    this._fitOpt = { ...opt };
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
    G.ctx.imageSmoothingEnabled = !!opt.smooth;
    G.ctx.textRendering = 'geometricPrecision';
    return s;
  },

  init(canvas) {
    this._fitOpt = null;
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
    if (typeof Sfx !== 'undefined' && Sfx.update) Sfx.update(d);
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
