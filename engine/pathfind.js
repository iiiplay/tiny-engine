'use strict';
/* ============================================================
   engine/pathfind.js — 格子 A*（8 方向，不切角）
   ・Pathfind.build({ cell: 8 })  用 Physics.solids 建格子圖（世界變了就重建）
   ・Pathfind.find(x1, y1, x2, y2) → [{x,y}, ...] 世界座標路徑（平滑過）
   ・Pathfind.lineClear(x1,y1,x2,y2) 兩點間有沒有障礙（可直線走就不繞路）
   ============================================================ */

const Pathfind = {
  cell: 8,
  w: 0, h: 0,
  grid: null,          // Uint8Array：1 = 不可走
  version: 0,

  build(opt) {
    opt = opt || {};
    this.cell = opt.cell || 8;
    // 預設用畫面大小；捲動世界請傳 { w: 世界寬, h: 世界高 }
    this.w = Math.ceil((opt.w || GAME_W) / this.cell);
    this.h = Math.ceil((opt.h || GAME_H) / this.cell);
    const grid = new Uint8Array(this.w * this.h);
    const pad = opt.pad != null ? opt.pad : 1;    // 讓實體不會貼牆
    for (const s of Physics.solids) {
      const x0 = Math.max(0, Math.floor((s.x - pad) / this.cell));
      const x1 = Math.min(this.w - 1, Math.floor((s.x + s.w + pad) / this.cell));
      const y0 = Math.max(0, Math.floor((s.y - pad) / this.cell));
      const y1 = Math.min(this.h - 1, Math.floor((s.y + s.h + pad) / this.cell));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * this.w + x] = 1;
    }
    this.grid = grid;
    this.version += 1;
    return this;
  },

  blocked(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return true;
    return this.grid[cy * this.w + cx] === 1;
  },

  /* 是否可以直接走直線（用 Physics.hit 取樣） */
  lineClear(x1, y1, x2, y2) {
    const d = U.dist(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(d / 6));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (Physics.hit({ x: x - 3, y: y - 4, w: 6, h: 6 })) return false;
    }
    return true;
  },

  /* A*；找不到回傳 [] */
  find(x1, y1, x2, y2, opt) {
    if (!this.grid) this.build();
    opt = opt || {};
    const maxNodes = opt.maxNodes || 3000;
    const S = this.cell;
    const sx = U.clamp(Math.floor(x1 / S), 0, this.w - 1);
    const sy = U.clamp(Math.floor(y1 / S), 0, this.h - 1);
    let tx = U.clamp(Math.floor(x2 / S), 0, this.w - 1);
    let ty = U.clamp(Math.floor(y2 / S), 0, this.h - 1);

    /* 起點或終點在牆裡 → 找最近的空位 */
    const nearFree = (cx, cy) => {
      if (!this.blocked(cx, cy)) return { x: cx, y: cy };
      for (let r = 1; r <= 4; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            if (!this.blocked(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
          }
        }
      }
      return null;
    };
    const s0 = nearFree(sx, sy);
    const t0 = nearFree(tx, ty);
    if (!s0 || !t0) return [];
    if (s0.x === t0.x && s0.y === t0.y) return [{ x: x2, y: y2 }];

    const W = this.w, N = W * this.h;
    const idx = (x, y) => y * W + x;
    const gScore = new Float32Array(N).fill(Infinity);
    const fScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const open = [idx(s0.x, s0.y)];
    const inOpen = new Uint8Array(N);
    const closed = new Uint8Array(N);
    const goal = idx(t0.x, t0.y);
    const h = (i) => {
      const x = i % W, y = (i / W) | 0;
      const dx = Math.abs(x - t0.x), dy = Math.abs(y - t0.y);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);   // octile
    };
    gScore[open[0]] = 0;
    fScore[open[0]] = h(open[0]);
    inOpen[open[0]] = 1;

    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
                [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let nodes = 0;

    while (open.length && nodes < maxNodes) {
      /* 取 f 最小的（節點數不多，線性掃描就夠） */
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      inOpen[cur] = 0;
      if (cur === goal) return this.trace(came, cur, x2, y2);
      closed[cur] = 1;
      nodes++;

      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy, cost] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (this.blocked(nx, ny)) continue;
        /* 斜走不切角 */
        if (dx && dy && (this.blocked(cx + dx, cy) || this.blocked(cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        if (closed[ni]) continue;
        const g = gScore[cur] + cost;
        if (g < gScore[ni]) {
          gScore[ni] = g;
          fScore[ni] = g + h(ni);
          came[ni] = cur;
          if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
        }
      }
    }
    return [];
  },

  trace(came, goal, tx, ty) {
    const out = [];
    let c = goal;
    while (c !== -1) {
      out.push({ x: (c % this.w) * this.cell + this.cell / 2, y: ((c / this.w) | 0) * this.cell + this.cell / 2 });
      c = came[c];
    }
    out.reverse();
    out.shift();                       // 去掉起點
    out.push({ x: tx, y: ty });        // 終點用真實座標
    return this.smooth(out);
  },

  /* 去掉共線點 + 用 lineClear 走捷徑 */
  smooth(path) {
    if (path.length <= 2) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = Math.min(path.length - 1, i + 8);
      while (j > i + 1 && !this.lineClear(path[i].x, path[i].y, path[j].x, path[j].y)) j--;
      out.push(path[j]);
      i = j;
    }
    return out;
  },
};
