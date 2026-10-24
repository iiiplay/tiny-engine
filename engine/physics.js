'use strict';
/* ============================================================
   engine/physics.js — AABB 碰撞、軸分離滑動、重疊判定
   ============================================================ */

function Physics() {}

/* 場上的靜態碰撞矩形（由關卡在 build 時填入） */
Physics.solids = [];
/* 可活動範圍；null = 用畫面可見範圍 G.view（單螢幕遊戲）
   捲動世界請設成整個世界的邊界，例如 { l:8, r:worldW-8, t:8, b:worldH-8 } */
Physics.bounds = null;
Physics.clear = function () { this.solids.length = 0; };
Physics.add = function (x, y, w, h) {
  const s = { x, y, w, h };
  this.solids.push(s);
  return s;
};
Physics.hit = function (box) {
  const list = this.solids;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (box.x < s.x + s.w && box.x + box.w > s.x && box.y < s.y + s.h && box.y + box.h > s.y) return true;
  }
  return false;
};
Physics.overlap = function (a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
};

/* 只沿單軸移動（有牆就停），回傳是否真的動了 */
Physics.moveAxis = function (e, dx, dy, opt) {
  const o = opt || {};
  const bw = o.bw != null ? o.bw : 8;
  const bh = o.bh != null ? o.bh : 6;
  const by = o.by != null ? o.by : -6;      // 判定框上緣（相對腳底）
  const m = o.margin || 0;
  let moved = false;
  if (dx) {
    const b = { x: e.x - bw / 2 + dx, y: e.y + by, w: bw, h: bh };
    if (!this.hit(b)) { e.x += dx; moved = true; }
  }
  if (dy) {
    const b = { x: e.x - bw / 2, y: e.y + by + dy, w: bw, h: bh };
    if (!this.hit(b)) { e.y += dy; moved = true; }
  }
  const v = this.bounds || G.view;
  e.x = U.clamp(e.x, v.l + m, v.r - m);
  e.y = U.clamp(e.y, v.t + m, v.b - m);
  return moved;
};
