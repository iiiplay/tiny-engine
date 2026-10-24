'use strict';
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
