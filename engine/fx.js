'use strict';
/* ============================================================
   engine/fx.js — 粒子池、鏡頭震動、hitstop
   ============================================================ */

const Fx = {
  parts: [],
  pool: [],
  shakeT: 0, shakeMag: 0,
  freezeT: 0,      // 命中定格（hit-stop）
  burst(x, y, color, n = 8, spd = 70, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = opt.dir != null ? opt.dir + U.rand(0.9, -0.9) : U.rand(Math.PI * 2);
      const v = spd * U.rand(1.2, 0.35);
      const pt = this.pool.pop() || {};
      pt.x = x; pt.y = y;
      pt.vx = Math.cos(a) * v; pt.vy = Math.sin(a) * v;
      pt.life = pt.max = U.rand(0.45, 0.2);
      pt.color = color; pt.size = opt.size || 2;
      pt.grav = opt.grav != null ? opt.grav : 90;
      this.parts.push(pt);
    }
  },
  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(Math.PI * 2);
      const pt = this.pool.pop() || {};
      pt.x = x; pt.y = y - 1;
      pt.vx = Math.cos(a) * U.rand(22, 6); pt.vy = Math.sin(a) * U.rand(12, 3) - 6;
      pt.life = pt.max = U.rand(0.4, 0.18);
      pt.color = '#c9d78d'; pt.size = 1; pt.grav = -10;
      this.parts.push(pt);
    }
  },
  spark(x, y, color = '#ffe9a8') { this.burst(x, y, color, 5, 90, { size: 1, grav: 20 }); },
  shake(mag, t) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
  },
  hitstop(t) { this.freezeT = Math.max(this.freezeT, t); },
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        const last = this.parts.length - 1;
        if (i !== last) this.parts[i] = this.parts[last];
        this.parts.pop();
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
  },
  draw() {
    const ctx = G.ctx;
    for (const p of this.parts) {
      ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  },
  reset() { this.parts.length = 0; this.pool.length = 0; this.shakeT = 0; this.shakeMag = 0; this.freezeT = 0; },
};
