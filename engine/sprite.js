'use strict';
/* ============================================================
   engine/sprite.js — 動畫播放器（單張水平 sprite sheet）
   ============================================================ */

/* 面向 → 列（Tiny Adventure Pack 慣例：0 下、1 左、2 上、3 右） */
const DIR_ROW = { down: 0, left: 1, up: 2, right: 3 };
const DIR_NAMES = ['down', 'left', 'up', 'right'];

/* 2D 動畫表：cols（影格）× rows（面向）
   用法：
     const S = sheetOf(assetDef('hero.png', 4, 16, 16, { rows: 4 }));
     drawDirSheet(S, 'right', 2, x, y, { scale: 1.5 });
   (x, y) 一樣是「腳底中心」，所以四方向動畫不會抖動。 */
function drawDirSheet(s, dir, frame, x, y, o) {
  if (!s) return;
  o = o || {};
  const ctx = o.target || G.ctx;
  const sc = o.scale || 1;
  const fw = s.fw, fh = s.h;
  const row = typeof dir === 'number' ? dir : (DIR_ROW[dir] != null ? DIR_ROW[dir] : 0);
  const n = s.frames || 1;
  const f = ((frame | 0) % n + n) % n;
  const img = o.white ? s.white : s.img;
  const px = Math.round(x - (fw * sc) / 2 + (o.ox || 0));
  const py = Math.round(y - (s.foot != null ? s.foot : fh) * sc + (o.oy || 0));
  const a = o.alpha != null ? o.alpha : 1;
  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(img, f * fw, row * fh, fw, fh, px, py, Math.ceil(fw * sc), Math.ceil(fh * sc));
  if (a !== 1) ctx.globalAlpha = 1;
}

class Sprite {
  constructor(fps = 8, loop = true) {
    this.fps = fps; this.loop = loop;
    this.s = null; this.t = 0; this.frame = 0; this.done = false;
  }
  set(s, fps = this.fps, loop = this.loop) {
    if (this.s === s && this.fps === fps && this.loop === loop) return;
    this.s = s; this.fps = fps; this.loop = loop;
    this.t = 0; this.frame = 0; this.done = false;
  }
  update(dt) {
    if (!this.s) return;
    this.t += dt;
    const n = this.s.frames;
    let f = Math.floor(this.t * this.fps);
    if (this.loop) {
      this.frame = n ? f % n : 0;
    } else if (f >= n) {
      this.frame = n - 1;
      this.done = true;
    } else {
      this.frame = f;
    }
  }
  draw(x, y, o) { drawSheet(this.s, this.frame, x, y, o); }
}
