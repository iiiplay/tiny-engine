'use strict';
/* ============================================================
   engine/ui.js — 文字（字型快取）、面板、熱區、按鈕、九宮格、拉桿、混音器、關卡選單
   v1.3：新增 UI.hot / hitAt / pointer / click / button / chip / bar /
         nineSlice / measure / bind（熱區物件會重複使用，不每帧配置）
   v1.9：新增 UI.slider / UI.mixer（混音音量選單）/ UI.levelMenu（關卡庫選單）/ UI.act
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
  _dragId: null,          // 正在拖曳的 slider id
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

  findHot(id) {
    for (let i = this._hotN - 1; i >= 0; i--) {
      if (this._hot[i].id === id) return this._hot[i];
    }
    return null;
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
    if (this._dragId) {
      const dr = this.findHot(this._dragId);
      if (dr && dr.opt && dr.opt.kind === 'slider') {
        const v = U.clamp((x - dr.x) / Math.max(1, dr.w), 0, 1);
        if (dr.opt.onChange) dr.opt.onChange(v);
      }
    }
    return this.hover;
  },

  /* 回傳被點到的熱區 id（沒有就 null） */
  click(x, y) {
    const r = this.hitAt(x, y);
    return r ? r.id : null;
  },

  /* 點擊並觸發熱區內建行為（如 slider / mixer / levelMenu 的 callback）；回傳命中的 id */
  act(x, y) {
    const r = this.hitAt(x, y);
    if (!r) return null;
    if (r.opt) {
      if (r.opt.kind === 'slider') {
        this._dragId = r.id;
        const v = U.clamp((x - r.x) / Math.max(1, r.w), 0, 1);
        if (r.opt.onChange) r.opt.onChange(v);
      } else if (r.opt.onClick) {
        r.opt.onClick(r.id);
      }
    }
    return r.id;
  },

  /* 把 canvas 的指標事件接到 UI 熱區；onAct(id, point) 只在命中時呼叫 */
  bind(canvas, onAct, opt) {
    opt = opt || {};
    const toWorld = (e) => Display.toWorld(e.clientX, e.clientY);
    canvas.addEventListener('pointermove', (e) => {
      const p = toWorld(e);
      this.pointer(p.x, p.y);
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => {
      this._dragId = null;
      this.pointer(-1, -1);
    }, { passive: true });
    addEventListener('pointerup', () => { this._dragId = null; }, { passive: true });
    addEventListener('pointercancel', () => { this._dragId = null; }, { passive: true });
    canvas.addEventListener('pointerdown', (e) => {
      const p = toWorld(e);
      this.pointer(p.x, p.y);
      if (opt.unlock !== false && typeof Sfx !== 'undefined') Sfx.unlock();
      const id = this.act(p.x, p.y);
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
     opt = { size, color, fill, disabled, radius, textAlign, border, onClick } */
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
    if (!opt.disabled) this.hot(id, x, y, w, h, opt.onClick ? { onClick: opt.onClick } : null);
    return this;
  },

  /* 橫向拉桿（0..1）：支援點擊與拖曳
     opt = { label, showPct, color, bg, onChange: (v) => {} } */
  slider(id, x, y, w, h, val, opt) {
    opt = opt || {};
    const ctx = G.ctx;
    const pct = U.clamp(val || 0, 0, 1);
    const hov = (this.hover && this.hover.id === id) || this._dragId === id;
    const trackH = Math.max(4, Math.min(h - 4, 6));
    const ty = y + (h - trackH) / 2;

    if (opt.label) {
      text(opt.label, x, y - 8, { size: opt.size || 5.5, color: opt.labelColor || '#b9c8df' });
    }
    if (opt.showPct !== false) {
      text(Math.round(pct * 100) + '%', x + w, y - 8, {
        size: opt.size || 5.5, color: '#ffd45e', align: 'right',
      });
    }

    roundRect(x, ty, w, trackH, 2, opt.bg || '#111827', hov ? '#6384b3' : '#2d3b53');
    const fw = Math.round(w * pct);
    if (fw > 0) {
      roundRect(x, ty, fw, trackH, 2, opt.color || '#61afef');
    }
    const kx = x + fw;
    const ky = y + h / 2;
    ctx.fillStyle = hov ? '#ffe9a8' : '#f2e8d5';
    ctx.beginPath();
    ctx.arc(kx, ky, Math.max(3.5, trackH * 0.75), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#101426';
    ctx.lineWidth = 1;
    ctx.stroke();

    this.hot(id, x, y, w, h, { kind: 'slider', onChange: opt.onChange || null });
    return this;
  },

  /* 內建混音器選單（一行畫出 Master / BGM / SFX 音量拉桿 + 靜音按鈕）
     opt = { title: '音效與音樂', saveKey: 'te-audio', onClose: () => {} } */
  mixer(x, y, w, opt) {
    opt = opt || {};
    if (typeof Sfx === 'undefined') return this;
    const h = opt.h || 104;
    const saveKey = opt.saveKey || 'te-audio';
    panel(x, y, w, h, { fill: opt.fill || '#141c2b', border: opt.border || '#4b6184' });
    text(opt.title || '混音音量設定', x + 8, y + 6, { size: 6.5, color: '#9fd0ff' });

    const muteLabel = Sfx.muted ? '🔇 已靜音' : '🔊 正常';
    this.button('mixer:mute', x + w - 48, y + 5, 42, 13, muteLabel, {
      size: 5.2,
      fill: Sfx.muted ? '#4a222a' : '#213529',
      border: Sfx.muted ? '#e5484d' : '#58a65c',
      onClick: () => { Sfx.mute(); Sfx.savePrefs(saveKey); },
    });

    const sx = x + 10, sw = w - 20;
    this.slider('mixer:master', sx, y + 29, sw, 10, Sfx.master, {
      label: '主音量 Master', color: '#ffd45e',
      onChange: (v) => { Sfx.setMaster(v); Sfx.savePrefs(saveKey); },
    });
    this.slider('mixer:bgm', sx, y + 54, sw, 10, Sfx.bgmVol, {
      label: '音樂 BGM', color: '#61afef',
      onChange: (v) => { Sfx.setBgm(v); Sfx.savePrefs(saveKey); },
    });
    this.slider('mixer:sfx', sx, y + 79, sw, 10, Sfx.sfxVol, {
      label: '音效 SFX', color: '#7ec08d',
      onChange: (v) => { Sfx.setSfx(v); Sfx.savePrefs(saveKey); },
    });
    return this;
  },

  /* 內建關卡選單 UI（搭配 LevelLib 列出已儲存關卡：點選遊玩 / 分享碼 / 刪除）
     opt = { title, items, selectedId, onSelect: (lv, entry) => {}, onShare: (code, entry) => {}, onDelete: (entry) => {} } */
  levelMenu(x, y, w, h, opt) {
    opt = opt || {};
    panel(x, y, w, h, { fill: opt.fill || '#141c2b', border: opt.border || '#4b6184' });
    const items = opt.items || (typeof LevelLib !== 'undefined' ? LevelLib.list() : []);
    text(opt.title || ('關卡庫（' + items.length + '）'), x + 8, y + 6, { size: 6.5, color: '#9fd0ff' });

    const rowH = 18;
    const maxRows = Math.max(1, Math.floor((h - 24) / rowH));
    if (!items.length) {
      text('尚無儲存的關卡', x + w / 2, y + h / 2, {
        size: 6, color: '#64718a', align: 'center', baseline: 'middle',
      });
      return this;
    }

    for (let i = 0; i < Math.min(items.length, maxRows); i++) {
      const it = items[i];
      const ry = y + 21 + i * rowH;
      const isSel = opt.selectedId && opt.selectedId === it.id;
      roundRect(x + 6, ry, w - 12, rowH - 2, 2,
        isSel ? 'rgba(65,98,145,0.45)' : 'rgba(24,34,52,0.75)',
        isSel ? '#9fd0ff' : 'rgba(255,255,255,0.06)');
      const info = (it.name || '未命名') + ' (' + it.cols + '×' + it.rows + ')';
      text(info, x + 10, ry + 4, { size: 5.5, color: '#f2e8d5' });

      const bx = x + w - 74;
      this.button('level:play:' + it.id, bx, ry + 2, 26, 12, '遊玩', {
        size: 5, fill: '#244034', border: '#58a65c',
        onClick: () => {
          if (opt.onSelect && typeof LevelLib !== 'undefined') {
            const lv = LevelLib.get(it.id);
            if (lv) opt.onSelect(lv, it);
          }
        },
      });
      this.button('level:code:' + it.id, bx + 28, ry + 2, 22, 12, '碼', {
        size: 5,
        onClick: () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(it.code).catch(() => {});
          }
          if (opt.onShare) opt.onShare(it.code, it);
        },
      });
      this.button('level:del:' + it.id, bx + 52, ry + 2, 14, 12, '×', {
        size: 5, fill: '#3d2026', border: '#a84248',
        onClick: () => {
          if (typeof LevelLib !== 'undefined') LevelLib.remove(it.id);
          if (opt.onDelete) opt.onDelete(it);
        },
      });
    }
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
