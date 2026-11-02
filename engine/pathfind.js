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
    const start = idx(s0.x, s0.y);
    const open = [];
    // Entries retain their priority; stale entries are discarded after pop.
    // Search state is local so callbacks can safely invoke find recursively.
    const push = (node, score) => {
      const item = { node, score }; let i = open.length; open.push(item);
      while (i > 0) { const parent = (i - 1) >> 1; if (open[parent].score <= score) break; open[i] = open[parent]; i = parent; }
      open[i] = item;
    };
    const pop = () => {
      const first = open[0], last = open.pop();
      if (open.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= open.length) break;
        if (c + 1 < open.length && open[c + 1].score < open[c].score) c++;
        if (open[c].score >= last.score) break; open[i] = open[c]; i = c; } open[i] = last; }
      return first.node;
    };
    const closed = new Uint8Array(N);
    const goal = idx(t0.x, t0.y);
    const h = (i) => {
      const x = i % W, y = (i / W) | 0;
      const dx = Math.abs(x - t0.x), dy = Math.abs(y - t0.y);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);   // octile
    };
    gScore[start] = 0;
    fScore[start] = h(start);
    push(start, fScore[start]);

    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
                [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let nodes = 0;

    while (open.length && nodes < maxNodes) {
      const cur = pop();
      if (closed[cur]) continue;
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
          push(ni, fScore[ni]);
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

  /* ============================================================
     大量單位用的「節流排程」
     400 隻同時重算會讓某一帧爆量；把重算分散到多個帧就不會頓。
       在每帧 update 呼叫： Pathfind.update(dt)
       找路：               Pathfind.request(agent, targetX, targetY, (path) => { agent.path = path; })
     ・同一個 agent 只保留最新的一筆
     ・同一個 agent 有最短重算間隔（minInterval 秒）
     ・每帧最多算 maxPerStep 條
     ============================================================ */
  queue: [],
  maxPerStep: 2,
  minInterval: 0.35,

  pending() { return this.queue.length; },

  request(agent, tx, ty, onPath, opt) {
    opt = opt || {};
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (agent.__pfLast && now - agent.__pfLast < (opt.interval != null ? opt.interval : this.minInterval) * 1000) {
      return false;                       // 太頻繁，跳過這一帧
    }
    agent.__pfLast = now;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].agent === agent) {       // 已在排隊 → 只更新目標
        this.queue[i].tx = tx; this.queue[i].ty = ty; this.queue[i].onPath = onPath;
        return true;
      }
    }
    this.queue.push({ agent, tx, ty, onPath });
    return true;
  },

  update(dt) {
    if (!this.queue.length) return 0;
    let done = 0;
    while (done < this.maxPerStep && this.queue.length) {
      const job = this.queue.shift();
      const path = this.lineClear(job.agent.x, job.agent.y, job.tx, job.ty)
        ? [{ x: job.tx, y: job.ty }]
        : this.find(job.agent.x, job.agent.y, job.tx, job.ty);
      if (job.onPath) job.onPath(path);
      else job.agent.path = path;
      done++;
    }
    return done;
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
