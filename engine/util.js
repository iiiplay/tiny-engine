'use strict';
/* ============================================================
   engine/util.js — 世界尺寸、小工具、方向表
   ============================================================ */

const TINY_ENGINE_VERSION = '1.9.0';

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
