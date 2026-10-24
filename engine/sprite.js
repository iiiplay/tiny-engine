'use strict';
/* ============================================================
   engine/sprite.js — 動畫播放器（單張水平 sprite sheet）
   ============================================================ */

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
