'use strict';
/* ============================================================
   engine/grid.js — 格子世界（tile 碰撞 + BFS 距離場）  v1.5
   ------------------------------------------------------------
   為什麼要有這一支：
     炸彈人 / 倉庫番 / 吃豆人 這類「一格一格」的遊戲，每一款都會重寫
     同一段程式：分軸移動、撞牆夾住、走廊對齊、BFS 找路、往距離場下坡走。
     tiny-bomber 就手寫了 200 行；抽進來之後遊戲只要描述「哪格是牆」。

   三件事：
     1) 碰撞：Grid.solid() / moveX() / moveY() / alignTo()
        · 牆用 tiles 陣列（0 = 可走，其他值由遊戲定義）
        · 臨時障礙（炸彈、NPC）用 block callback
        · 撞牆時「只往前夾、不往回彈」；人已經在障礙格裡時不算擋（不會卡死）
     2) 尋路：Grid.field() 一次算出「每格離目標幾步」
        多個目標、多來源都可以；8 方向時自動不切角
     3) 走位：Grid.downhill() 往下坡走一步、Grid.route() 走出整條路線
   ============================================================ */

const Grid = {
  cell: 16,
  cols: 0,
  rows: 0,
  tiles: null,      // Uint8Array：0 = 可走（非 0 的意義由遊戲決定）
  block: null,      // fn(cx, cy, e) → true 表示「對這個實體也算擋」

  /* ---------------- 建立 ---------------- */
  /* 兩種用法：
     A) 單例（跟 Physics / Pathfind 一樣）→ 只會有一個世界
          Grid.setup({ cell: 16, cols: 20, rows: 13 });
     B) 多個獨立的地圖（編輯器、分割畫面、同時算兩張圖）
          const a = Grid.create({ cell: 16, cols: 20, rows: 13 });
          const b = Grid.createFromTiles(tiles, 30, 26);
     兩者都是同一個 API；create() 出來的互不影響。 */

  /* Grid.setup({ cell: 16, cols: 20, rows: 13, fill: 0 }) */
  setup(opt) {
    opt = opt || {};
    this.cell = opt.cell || 16;
    this.cols = opt.cols || 1;
    this.rows = opt.rows || 1;
    this.tiles = new Uint8Array(this.cols * this.rows);
    if (opt.fill) this.tiles.fill(opt.fill);
    this.block = null;
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
       e.passTiles = [2]  → 這幾種 tile 對它來說可以走（例如飛行敵人穿木桶） */
  solid(cx, cy, e) {
    if (!this.inside(cx, cy)) return true;
    const t = this.tiles[this.idx(cx, cy)];
    if (t && !(e && e.passTiles && e.passTiles.indexOf(t) >= 0)) return true;
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
    const W = this.cols, H = this.rows;
    const passTiles = opt.ignoreTiles || null;
    const ent = passTiles ? { passTiles } : null;
    const f = opt.into || new Int16Array(W * H).fill(-1);
    if (opt.into) f.fill(-1);
    const src = opt.cells || (opt.from ? [opt.from] : []);
    const block = opt.block || null;
    const diag = !!opt.diagonal;
    const max = opt.maxDist || 0;
    const NB = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const q = [];
    for (const c of src) {
      if (!c || !this.inside(c.cx, c.cy)) continue;
      const i = this.idx(c.cx, c.cy);
      if (f[i] !== -1) continue;
      f[i] = 0;
      q.push(i);
    }
    let head = 0;
    while (head < q.length) {
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
        q.push(ni);
      }
    }
    return f;
  },

  /* 從這格往「距離比較小」的鄰格走一步；回傳方向 {x,y} 或 null
     opt.avoid = Uint8Array（額外不想走的格子，例如危險區） */
  downhill(field, cx, cy, opt) {
    opt = opt || {};
    const W = this.cols;
    const cur = field[this.idx(cx, cy)];
    if (cur === 0) return null;                 // 已經在目標上
    let bestD = cur < 0 ? 32767 : cur;
    let best = null;
    const diag = !!opt.diagonal;
    const dirs = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (!this.inside(nx, ny)) continue;
      if (this.solid(nx, ny)) continue;
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
