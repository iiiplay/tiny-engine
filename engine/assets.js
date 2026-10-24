'use strict';
/* ============================================================
   engine/assets.js — 資源載入、sprite sheet 分析、腳底對齊繪製、白色剪影
   ============================================================ */

/* ---------------- 資源 ---------------- */
const ASSETS = {};   // src -> Image
const SHEETS = {};   // src -> {img, frames, fw, h, foot, white}

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

/* 手寫素材表用：A.def(src, frames, foot) */
function assetDef(src, frames, foot, fw) {
  return { src, frames: frames || 1, foot: foot, fw: fw };
}

function sheetOf(def) {
  if (!def || !def.src) return null;
  let s = SHEETS[def.src];
  if (!s) {
    const img = ASSETS[def.src];
    if (!img) return null;
    s = SHEETS[def.src] = {
      src: def.src,
      img,
      frames: def.frames || 1,
      fw: def.fw || Math.floor(img.width / (def.frames || 1)),
      h: def.h || img.height,
      foot: def.foot != null ? def.foot : img.height,
      white: makeWhite(img),
    };
  }
  return s;
}

function collectSheets(manifest) {
  const out = {};
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
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
/* (x,y) = 角色「腳底中心」；所有動畫都用同一錨點 → 不會抖動 */
function drawSheet(s, frame, x, y, o, target) {
  if (!s) return;
  const ctx = target || G.ctx;
  o = o || {};
  const sc = o.scale || 1;
  const fw = s.fw, fh = s.h;
  const img = o.white ? s.white : s.img;
  const px = Math.round(x - (fw * sc) / 2 + (o.ox || 0));
  const py = Math.round(y - s.foot * sc + (o.oy || 0));
  const a = o.alpha != null ? o.alpha : 1;
  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(img, (frame | 0) * fw, 0, fw, fh, px, py, Math.ceil(fw * sc), Math.ceil(fh * sc));
  if (a !== 1) ctx.globalAlpha = 1;
}

/* 從 tileset 裁一塊 prefab 貼圖 */
function drawCrop(def, sx, sy, sw, sh, dx, dy, alpha, target) {
  const t = sheetOf(def);
  if (!t) return;
  const ctx = target || G.ctx;
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(t.img, sx, sy, sw, sh, Math.round(dx), Math.round(dy), sw, sh);
  if (alpha != null) ctx.globalAlpha = 1;
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
