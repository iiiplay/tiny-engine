'use strict';
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
