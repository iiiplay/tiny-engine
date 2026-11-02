'use strict';
/* ============================================================
   engine/grid.js — 格子世界（tile 碰撞 + BFS 距離場 + 加權 A* 尋路）
   v1.5：碰撞 / BFS 距離場 / 下坡走位 / 多世界
   v1.9：新增地形權重 setCost/setCosts、加權尋路 findPath（含轉角成本 turnCost）、
         Dijkstra 加權距離場 weightedField
   ============================================================ */

const Grid = {
  cell: 16,
  cols: 0,
  rows: 0,
  tiles: null,      // Uint8Array：0 = 可走（非 0 的意義由遊戲決定）
  block: null,      // fn(cx, cy, e) → true 表示「對這個實體也算擋」
  costs: null,      // { tileVal: cost }：設定為 >0 的非 0 tile 會視為「可走但有地形耗時」
  _qBuf: null,

  /* ---------------- 建立 ---------------- */
  /* Grid.setup({ cell: 16, cols: 20, rows: 13, fill: 0, costs: { 2: 3 } }) */
  setup(opt) {
    opt = opt || {};
    this.cell = opt.cell || 16;
    this.cols = opt.cols || 1;
    this.rows = opt.rows || 1;
    this.tiles = new Uint8Array(this.cols * this.rows);
    if (opt.fill) this.tiles.fill(opt.fill);
    this.block = null;
    this.costs = opt.costs ? Object.assign({}, opt.costs) : null;
    return this;
  },

  /* 直接吃一張既有的地圖（tiles 長度要 = cols × rows） */
  fromTiles(tiles, cols, rows, opt) {
    opt = opt || {};
    this.cell = opt.cell || 16;
    this.cols = cols;
    this.rows = rows;
    this.tiles = tiles;
    this.block = opt.block || null;
    this.costs = opt.costs ? Object.assign({}, opt.costs) : null;
    return this;
  },

  /* 產生一個獨立的地圖（不會蓋掉 Grid 本身） */
  create(opt) {
    const g = Object.create(Grid);
    g.setup(opt);
    return g;
  },

  createFromTiles(tiles, cols, rows, opt) {
    const g = Object.create(Grid);
    g.fromTiles(tiles, cols, rows, opt);
    return g;
  },

  /* 設定臨時障礙：fn(cx, cy, e) → true = 擋（例如炸彈） */
  setBlock(fn) { this.block = fn; return this; },

  /* ---------------- 地形移動成本（v1.9） ---------------- */
  /* 設定單一 tile 的移動成本（cost > 0 代表可通行，例如泥沼=3、淺水=5；0 或 null 代表維持牆壁） */
  setCost(tileVal, cost) {
    if (!this.costs) this.costs = {};
    if (cost == null || cost <= 0) delete this.costs[tileVal];
    else this.costs[tileVal] = cost;
    return this;
  },

  /* 批次設定地形移動成本：grid.setCosts({ 0: 1, 2: 3, 3: 5 }) */
  setCosts(map) {
    this.costs = map ? Object.assign({}, map) : null;
    return this;
  },

  /* 查詢進入 (cx, cy) 的步數成本（預設 1） */
  costAt(cx, cy, customCost) {
    if (!this.inside(cx, cy)) return Infinity;
    const t = this.tiles[this.idx(cx, cy)];
    if (typeof customCost === 'function') {
      const c = customCost(cx, cy, t);
      return c != null ? c : 1;
    }
    if (customCost && customCost[t] != null) return customCost[t];
    if (this.costs && this.costs[t] != null) return this.costs[t];
    return 1;
  },

  /* ---------------- 座標 ---------------- */
  idx(cx, cy) { return cy * this.cols + cx; },
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; },
  tileAt(cx, cy) { return this.inside(cx, cy) ? this.tiles[this.idx(cx, cy)] : 1; },
  setTile(cx, cy, v) {
    if (!this.inside(cx, cy)) return this;
    this.tiles[this.idx(cx, cy)] = v;
    return this;
  },
  cellOf(v) { return Math.floor(v / this.cell); },
  center(cx) { return (cx + 0.5) * this.cell; },
  snapToCell(x, y) { return { cx: Math.floor(x / this.cell), cy: Math.floor(y / this.cell) }; },

  /* 實體對齊到最近的格子中心 */
  snap(e) {
    e.x = Math.round(e.x / this.cell - 0.5) * this.cell + this.cell / 2;
    e.y = Math.round(e.y / this.cell - 0.5) * this.cell + this.cell / 2;
    return e;
  },

  /* ---------------- 碰撞 ---------------- */
  /* 擋不擋？e 可以有：
       e.passTiles = [2]  → 這幾種 tile 對它來說可以走（例如飛行敵人穿木桶）
       若該 tile 在 this.costs 中設有 > 0 的成本，也視為可走地形（例如草叢/泥沼） */
  solid(cx, cy, e) {
    if (!this.inside(cx, cy)) return true;
    const t = this.tiles[this.idx(cx, cy)];
    if (t) {
      const canPass = (e && e.passTiles && e.passTiles.indexOf(t) >= 0) ||
                      (this.costs && this.costs[t] > 0 && isFinite(this.costs[t]));
      if (!canPass) return true;
    }
    return !!(this.block && this.block(cx, cy, e));
  },

  /* 分軸移動：回傳 true = 撞到東西
     重點（tiny-bomber 實戰學到的）：
       ・被擋住時只往前夾，絕對不往回彈（往回彈 = 穿牆）
       ・「自己已經在的那一格」不算擋 → 站在炸彈上不會被鎖死 */
  moveX(e, dx) {
    if (!dx) return false;
    const C = this.cell, r = e.r;
    const dir = dx > 0 ? 1 : -1;
    const nx = e.x + dx;
    const cellX = Math.floor((nx + dir * r) / C);
    const y0 = Math.floor((e.y - r + 0.5) / C);
    const y1 = Math.floor((e.y + r - 0.5) / C);
    const centerCellX = Math.floor(e.x / C);
    let hit = false;
    for (let cy = y0; cy <= y1; cy++) {
      if (!this.solid(cellX, cy, e)) continue;
      if (cellX !== centerCellX) hit = true;
    }
    if (!hit) { e.x = nx; return false; }
    const limit = dir > 0 ? cellX * C - r : (cellX + 1) * C + r;
    e.x = dir > 0 ? Math.min(nx, Math.max(e.x, limit)) : Math.max(nx, Math.min(e.x, limit));
    return true;
  },

  moveY(e, dy) {
    if (!dy) return false;
    const C = this.cell, r = e.r;
    const dir = dy > 0 ? 1 : -1;
    const ny = e.y + dy;
    const cellY = Math.floor((ny + dir * r) / C);
    const x0 = Math.floor((e.x - r + 0.5) / C);
    const x1 = Math.floor((e.x + r - 0.5) / C);
    const centerCellY = Math.floor(e.y / C);
    let hit = false;
    for (let cx = x0; cx <= x1; cx++) {
      if (!this.solid(cx, cellY, e)) continue;
      if (cellY !== centerCellY) hit = true;
    }
    if (!hit) { e.y = ny; return false; }
    const limit = dir > 0 ? cellY * C - r : (cellY + 1) * C + r;
    e.y = dir > 0 ? Math.min(ny, Math.max(e.y, limit)) : Math.max(ny, Math.min(e.y, limit));
    return true;
  },

  /* 撞到牆時，慢慢把角色吸回走廊中線（手感關鍵）
     rate = 每秒最多拉幾 px（預設 90） */
  alignTo(e, axis, dt, rate) {
    const C = this.cell;
    const v = axis === 'y' ? e.y : e.x;
    const c = (Math.floor(v / C) + 0.5) * C;
    const d = c - v;
    if (Math.abs(d) < 0.4) return;
    const step = Math.min(Math.abs(d), (rate || 90) * dt);
    if (axis === 'y') e.y += Math.sign(d) * step;
    else e.x += Math.sign(d) * step;
  },

  /* ---------------- BFS 距離場 ---------------- */
  /* Grid.field({ from: {cx,cy} } 或 { cells: [{cx,cy}...] }
                 block: fn(cx,cy) → true 表示這一格不能通過（可選）
                 diagonal: true → 8 方向（自動不切角）
                 maxDist, into（重複使用同一個 Int16Array 省配置））
     回傳 Int16Array：步數，-1 = 走不到；來源格 = 0（來源可以是牆，例如木桶） */
  field(opt) {
    opt = opt || {};
    const W = this.cols, H = this.rows, N = W * H;
    const passTiles = opt.ignoreTiles || null;
    const ent = passTiles ? { passTiles } : null;
    const f = opt.into || new Int16Array(N).fill(-1);
    if (opt.into) f.fill(-1);
    const src = opt.cells || (opt.from ? [opt.from] : []);
    const block = opt.block || null;
    const diag = !!opt.diagonal;
    const max = opt.maxDist || 0;
    const NB = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];

    // Callbacks may recursively query the same grid; use a per-call queue.
    const q = new Int32Array(N);
    let head = 0, tail = 0;
    for (const c of src) {
      if (!c || !this.inside(c.cx, c.cy)) continue;
      const i = this.idx(c.cx, c.cy);
      if (f[i] !== -1) continue;
      f[i] = 0;
      q[tail++] = i;
    }
    while (head < tail) {
      const cur = q[head++];
      const x = cur % W, y = (cur / W) | 0;
      const d = f[cur] + 1;
      if (max && d > max) continue;
      for (let k = 0; k < NB.length; k++) {
        const dx = NB[k][0], dy = NB[k][1];
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny)) continue;
        const ni = ny * W + nx;
        if (f[ni] !== -1) continue;
        if (this.solid(nx, ny, ent)) continue;
        if (block && block(nx, ny)) continue;
        if (dx && dy && (this.solid(x + dx, y, ent) || this.solid(x, y + dy, ent))) continue;  // 不切角
        f[ni] = d;
        q[tail++] = ni;
      }
    }
    return f;
  },

  /* ---------------- Dijkstra 加權距離場（v1.9） ---------------- */
  /* 與 field() 用法相同，但會把每格的移動成本（this.costs 或 opt.cost）算進去。
     回傳 Float32Array：累積成本，-1 = 走不到；來源格 = 0。
     可直接丟進 Grid.downhill() 與 Grid.route()！ */
  weightedField(opt) {
    opt = opt || {};
    const W = this.cols, H = this.rows, N = W * H;
    const passTiles = opt.ignoreTiles || null;
    const ent = passTiles ? { passTiles } : null;
    const f = opt.into || new Float32Array(N).fill(-1);
    if (opt.into) f.fill(-1);
    const src = opt.cells || (opt.from ? [opt.from] : []);
    const block = opt.block || null;
    const diag = !!opt.diagonal;
    const maxCost = opt.maxCost || opt.maxDist || 0;
    const customCost = opt.cost || null;
    const NB = diag
      ? [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
         [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
      : [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];

    const heap = [];
    const push = (idx, cost) => {
      heap.push({ idx, cost });
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p].cost <= heap[k].cost) break;
        const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp;
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let k = 0;
        const len = heap.length;
        while (true) {
          let l = (k << 1) + 1, r = l + 1, sm = k;
          if (l < len && heap[l].cost < heap[sm].cost) sm = l;
          if (r < len && heap[r].cost < heap[sm].cost) sm = r;
          if (sm === k) break;
          const tmp = heap[k]; heap[k] = heap[sm]; heap[sm] = tmp;
          k = sm;
        }
      }
      return top;
    };

    for (const c of src) {
      if (!c || !this.inside(c.cx, c.cy)) continue;
      const i = this.idx(c.cx, c.cy);
      if (f[i] === 0) continue;
      f[i] = 0;
      push(i, 0);
    }

    while (heap.length) {
      const cur = pop();
      const ci = cur.idx;
      if (f[ci] >= 0 && cur.cost > f[ci] + 1e-5) continue;
      const x = ci % W, y = (ci / W) | 0;
      for (let k = 0; k < NB.length; k++) {
        const dx = NB[k][0], dy = NB[k][1], mult = NB[k][2];
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny)) continue;
        if (this.solid(nx, ny, ent)) continue;
        if (block && block(nx, ny)) continue;
        if (dx && dy && (this.solid(x + dx, y, ent) || this.solid(x, y + dy, ent))) continue;
        const stepCost = this.costAt(nx, ny, customCost) * mult;
        if (!(stepCost > 0 && isFinite(stepCost))) continue;
        const nc = cur.cost + stepCost;
        if (maxCost && nc > maxCost) continue;
        const ni = ny * W + nx;
        if (f[ni] < 0 || nc < f[ni] - 1e-5) {
          f[ni] = nc;
          push(ni, nc);
        }
      }
    }
    return f;
  },

  /* ---------------- 加權 A* 尋路 + 轉角成本（v1.9） ---------------- */
  /* Grid.findPath(from, to, opt)
       from: { cx, cy }
       to:   { cx, cy }
       opt:
         cost:       fn(cx, cy, tileVal) 或 { tileVal: cost }（預設用 this.costs）
         turnCost:   轉彎額外成本（預設 0；設 > 0 如 0.6 可讓路徑減少無謂轉折、走直線）
         diagonal:   true = 8 方向（自動不切角）
         ignoreTiles:[2, ...] 額外視為可通行的 tile
         block:      fn(cx, cy) → true 視為不可走
         maxNodes:   搜尋上限（預設 8000）
     回傳：[{ cx, cy, cost }, ...]（不含起點；找不到回傳 []），
           陣列上附帶 path.totalCost（總耗時）與 path.turns（轉彎次數） */
  findPath(from, to, opt) {
    if (!from || !to) return [];
    const sx = from.cx | 0, sy = from.cy | 0;
    const tx = to.cx | 0, ty = to.cy | 0;
    if (!this.inside(sx, sy) || !this.inside(tx, ty)) return [];
    if (sx === tx && sy === ty) {
      const empty = [];
      empty.totalCost = 0;
      empty.turns = 0;
      return empty;
    }

    opt = opt || {};
    const W = this.cols, H = this.rows, N = W * H;
    const diag = !!opt.diagonal;
    const turnCost = opt.turnCost || 0;
    const customCost = opt.cost || null;
    const block = opt.block || null;
    const maxNodes = opt.maxNodes || 8000;
    const ent = opt.ignoreTiles ? { passTiles: opt.ignoreTiles } : null;

    const NB = diag
      ? [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
         [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
      : [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];
    const D = NB.length;
    const S = turnCost > 0 ? (D + 1) : 1;     // 有 turnCost 時狀態包含進入方向（0..D-1，D=起點）
    const startDir = turnCost > 0 ? D : 0;

    const totalStates = N * S;
    const gScore = new Float32Array(totalStates).fill(Infinity);
    const cameState = new Int32Array(totalStates).fill(-1);
    const closed = new Uint8Array(totalStates);

    // A user-defined cost can be less than one, so unit-distance heuristics
    // are not admissible. Dijkstra's zero heuristic preserves optimality.
    const heur = () => 0;

    const heap = [];
    const push = (st, f) => {
      heap.push({ st, f });
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p].f <= heap[k].f) break;
        const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp;
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let k = 0;
        const len = heap.length;
        while (true) {
          let l = (k << 1) + 1, r = l + 1, sm = k;
          if (l < len && heap[l].f < heap[sm].f) sm = l;
          if (r < len && heap[r].f < heap[sm].f) sm = r;
          if (sm === k) break;
          const tmp = heap[k]; heap[k] = heap[sm]; heap[sm] = tmp;
          k = sm;
        }
      }
      return top;
    };

    const startCell = sy * W + sx;
    const goalCell = ty * W + tx;
    const startState = startCell * S + startDir;
    gScore[startState] = 0;
    push(startState, heur(sx, sy));

    let nodes = 0;
    let goalState = -1;

    while (heap.length && nodes < maxNodes) {
      const cur = pop();
      const st = cur.st;
      if (closed[st]) continue;
      closed[st] = 1;
      const cell = (st / S) | 0;
      const prevDir = st % S;
      if (cell === goalCell) { goalState = st; break; }
      nodes++;

      const x = cell % W, y = (cell / W) | 0;
      const curG = gScore[st];

      for (let d = 0; d < D; d++) {
        const dx = NB[d][0], dy = NB[d][1], mult = NB[d][2];
        const nx = x + dx, ny = y + dy;
        if (!this.inside(nx, ny)) continue;
        const nCell = ny * W + nx;
        if (nCell !== goalCell) {
          if (this.solid(nx, ny, ent)) continue;
          if (block && block(nx, ny)) continue;
        } else {
          if (this.solid(nx, ny, ent) && !(opt.allowSolidGoal)) continue;
          if (block && block(nx, ny)) continue;
        }
        if (dx && dy && (this.solid(x + dx, y, ent) || this.solid(x, y + dy, ent))) continue;

        const baseCost = this.costAt(nx, ny, customCost) * mult;
        if (!(baseCost > 0 && isFinite(baseCost))) continue;
        const turnPenalty = (turnCost > 0 && prevDir < D && prevDir !== d) ? turnCost : 0;
        const ng = curG + baseCost + turnPenalty;
        const nSt = nCell * S + (turnCost > 0 ? d : 0);
        if (closed[nSt]) continue;
        if (ng < gScore[nSt] - 1e-6) {
          gScore[nSt] = ng;
          cameState[nSt] = st;
          push(nSt, ng + heur(nx, ny));
        }
      }
    }

    if (goalState < 0) return [];
    const out = [];
    let cur = goalState;
    while (cur !== -1 && cur !== startState) {
      const c = (cur / S) | 0;
      out.push({ cx: c % W, cy: (c / W) | 0, cost: Math.round(gScore[cur] * 1000) / 1000 });
      cur = cameState[cur];
    }
    out.reverse();

    /* 計算實際轉彎次數 */
    let turns = 0;
    let pdx = 0, pdy = 0;
    let px = sx, py = sy;
    for (let i = 0; i < out.length; i++) {
      const dx = out[i].cx - px, dy = out[i].cy - py;
      if (i > 0 && (dx !== pdx || dy !== pdy)) turns++;
      pdx = dx; pdy = dy;
      px = out[i].cx; py = out[i].cy;
    }
    out.totalCost = out.length ? out[out.length - 1].cost : 0;
    out.turns = turns;
    return out;
  },

  /* 從這格往「距離比較小」的鄰格走一步；回傳方向 {x,y} 或 null
     opt.avoid = Uint8Array（額外不想走的格子，例如危險區） */
  downhill(field, cx, cy, opt) {
    opt = opt || {};
    const W = this.cols;
    const cur = field[this.idx(cx, cy)];
    if (cur === 0) return null;                 // 已經在目標上
    let bestD = cur < 0 ? Infinity : cur;
    let best = null;
    const diag = !!opt.diagonal;
    const dirs = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (!this.inside(nx, ny)) continue;
      if (this.solid(nx, ny)) continue;
      if (dx && dy && (this.solid(cx + dx, cy) || this.solid(cx, cy + dy))) continue;
      const ni = ny * W + nx;
      if (opt.avoid && opt.avoid[ni]) continue;
      const d = field[ni];
      if (d >= 0 && d < bestD) { bestD = d; best = { x: dx, y: dy }; }
    }
    return best;
  },

  /* 走出整條路線（沿著距離場一路下坡）→ [{cx, cy}, ...]（不含起點） */
  route(field, cx, cy, opt) {
    opt = opt || {};
    const maxSteps = opt.maxSteps || 64;
    const out = [];
    let x = cx, y = cy;
    for (let i = 0; i < maxSteps; i++) {
      const d = this.downhill(field, x, y, opt);
      if (!d) break;
      x += d.x; y += d.y;
      out.push({ cx: x, cy: y });
      if (field[this.idx(x, y)] === 0) break;
    }
    return out;
  },

  /* 這兩格之間走得到嗎（field 從其中一邊算起） */
  reachable(field, cx, cy) {
    return this.inside(cx, cy) && field[this.idx(cx, cy)] >= 0;
  },

  /* ---------------- 便利函式 ---------------- */
  freeCells() {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.solid(x, y)) out.push({ cx: x, cy: y });
      }
    }
    return out;
  },

  countFree() {
    let n = 0;
    for (let i = 0; i < this.tiles.length; i++) if (!this.tiles[i]) n++;
    return n;
  },

  /* 逐格跑 callback（畫圖 / 檢查都常用） */
  forEach(cb) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) cb(x, y, this.tiles[y * this.cols + x]);
    }
  },
};
