'use strict';
/* ============================================================
   engine/edit.js — 格子關卡編輯器（畫格 / 標記 / 物件 / 存 JSON）
   v1.6：塗格、色盤、Ctrl+Z、存檔
   v1.7.1：markers（入口/出口寫進 meta）
   v1.8：objectTypes（點格子放/收 Level.objects）
   v1.9：Edit.draw() 完整繪製標記、物件與全色盤；Ctrl+Z 同步復原格子、標記與物件
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
      if (this.hitPalette(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const c = toCell(e);
      if (!this.level || !this.level.inside(c.cx, c.cy)) return;
      e.preventDefault();
      e.stopPropagation();
      this.pushUndo();
      this.painting = (e.button === 2 || e.shiftKey) ? -1 : 1;
      this.lastPaint = null;
      this.paint(c);
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
  /* 色盤項目 = 格子色 + 標記 + 物件 */
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
    const n = Math.max(1, this.paletteItems().length);
    const gap = 2;
    const maxW = Math.floor((GAME_W - 8 - (n - 1) * gap) / n);
    const w = Math.max(26, Math.min(56, maxW));
    const h = 14;
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

  /* ---------------- 畫格子 / 復原 ---------------- */
  pushUndo() {
    if (!this.level) return;
    this.undoStack.push({
      tiles: Uint8Array.from(this.level.tiles),
      meta: JSON.parse(JSON.stringify(this.level.meta || {})),
      objects: JSON.parse(JSON.stringify(this.level.objects || [])),
    });
    if (this.undoStack.length > 60) this.undoStack.shift();
  },

  undo() {
    if (!this.undoStack.length || !this.level) return false;
    const snap = this.undoStack.pop();
    if (snap instanceof Uint8Array) {
      this.level.tiles = snap;
    } else {
      this.level.tiles = snap.tiles;
      this.level.meta = snap.meta || {};
      this.level.objects = snap.objects || [];
    }
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
      // 標記（入口／出口…）不算格子，寫進 level.meta；右鍵點同位置可清除標記
      if (this.painting < 0) {
        const cur = this.level.meta[item.key];
        if (cur && cur[0] === c.cx && cur[1] === c.cy) {
          delete this.level.meta[item.key];
          this.changed();
          return true;
        }
        return false;
      }
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
    console.log('[edit] 關卡 JSON：\n' + json);
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

    /* 物件層（Level.objects） */
    if (this.level.objects && this.level.objects.length) {
      const objDefs = this.objectTypes || [];
      for (const o of this.level.objects) {
        if (!this.level.inside(o.cx, o.cy)) continue;
        const def = objDefs.find(d => d.type === o.type);
        const col = (def && def.color) || '#ffd45e';
        const label = ((def && def.name) || o.type || '?').slice(0, 2);
        const px = ox + o.cx * T + T / 2;
        const py = oy + o.cy * T + T / 2;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(3, T * 0.34), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0b0f18';
        ctx.lineWidth = 1;
        ctx.stroke();
        text(label, px, py + 0.5, { size: 5, color: '#0b0f18', align: 'center', baseline: 'middle', shadow: false });
      }
    }

    /* 標記層（level.meta[key] = [cx, cy]） */
    if (this.markers && this.level.meta) {
      for (const m of this.markers) {
        const pt = this.level.meta[m.key];
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const cx = pt[0], cy = pt[1];
        if (!this.level.inside(cx, cy)) continue;
        const px = ox + cx * T, py = oy + cy * T;
        ctx.strokeStyle = m.color || '#e5484d';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
        roundRect(px + 1, py + 1, T - 2, 7, 2, m.color || '#e5484d');
        text((m.name || m.key).slice(0, 2), px + T / 2, py + 4.5, {
          size: 4.8, color: '#ffffff', align: 'center', baseline: 'middle', shadow: false,
        });
      }
    }

    /* 游標 */
    const items = this.paletteItems();
    if (this.hover && this.level.inside(this.hover.cx, this.hover.cy)) {
      const p = items[this.sel];
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = p ? p.color : '#fff';
      ctx.fillRect(ox + this.hover.cx * T + 1, oy + this.hover.cy * T + 1, T - 2, T - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + this.hover.cx * T + 0.5, oy + this.hover.cy * T + 0.5, T - 1, T - 1);
    }

    /* 色盤（含格子、標記、物件） */
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const b = this.paletteRect(i);
      roundRect(b.x, b.y, b.w, b.h, 3, 'rgba(12,18,14,0.9)', i === this.sel ? '#ffd45e' : '#5d7a52');
      ctx.fillStyle = p.color;
      if (p.kind === 'object') {
        ctx.beginPath();
        ctx.arc(b.x + 7, b.y + 7, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'mark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x + 3.5, b.y + 3.5, 7, 7);
      } else {
        ctx.fillRect(b.x + 3, b.y + 3, 8, 8);
      }
      text((i + 1) + ' ' + p.name, b.x + 13, b.y + 4, { size: 5, color: '#f6ffe6', shadow: false });
    }

    /* 提示 */
    const hint = '編輯模式：左鍵塗 / 右鍵擦　1~9 換色　Ctrl+Z 復原　S 存檔　X 匯出 JSON　G 格線';
    ctx.globalAlpha = 0.8;
    roundRect(4, 2, Math.min(GAME_W - 8, UI.measure(hint, 5.5) + 10), 11, 3, 'rgba(8,14,10,0.85)');
    ctx.globalAlpha = 1;
    text(hint, 9, 4, { size: 5.5, color: '#d6f5a8', shadow: false });
  },
};
