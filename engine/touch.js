'use strict';
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
