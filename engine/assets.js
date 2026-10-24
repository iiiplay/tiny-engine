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

/* 手寫素材表用：assetDef(src, frames, foot, fw, { rows, fh })
   rows > 1 代表「N 列 × frames 欄」的動畫表（例如 4 方向 × 4 影格） */
function assetDef(src, frames, foot, fw, opt) {
  opt = opt || {};
  return { src, frames: frames || 1, foot: foot, fw: fw, rows: opt.rows || 1, fh: opt.fh };
}

function sheetOf(def) {
  if (!def || !def.src) return null;
  let s = SHEETS[def.src];
  if (!s) {
    const img = ASSETS[def.src];
    if (!img) return null;
    const rows = def.rows || 1;
    const fh = def.fh || (rows > 1 ? Math.floor(img.height / rows) : img.height);
    s = SHEETS[def.src] = {
      src: def.src,
      img,
      frames: def.frames || 1,
      fw: def.fw || Math.floor(img.width / (def.frames || 1)),
      h: fh,
      rows,
      fh,
      foot: def.foot != null ? def.foot : fh,
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
