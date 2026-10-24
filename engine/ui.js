'use strict';
/* ============================================================
   engine/ui.js — 文字（字型快取）、面板、按鈕命中判定
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

const UI = { text, hudPanel, panel, inRect, toWorld: (x, y) => Display.toWorld(x, y) };
