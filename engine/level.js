'use strict';
/* ============================================================
   engine/level.js — JSON 關卡（格子資料 + 物件 + 驗證）  v1.6
   ------------------------------------------------------------
   為什麼要有這一支：
     以前的關卡資料寫在遊戲程式碼裡（`const ROADS = [...]`、`LEVELS = [...]`），
     改一格要動 JS、也沒辦法丟給非工程師編。
     Level 把「一張地圖」變成純資料（可以存 JSON、可以給編輯器編、可以上傳）。

   一格 = 一個數字（0 = 可走，其他值的意思由遊戲決定；慣例 1 = 牆／路障）

   兩種寫法都吃：
     A) 機器格式（存檔用）
        { v:1, cols:20, rows:12, cell:16, tiles:[0,0,1,...], objects:[...] }
     B) 手寫格式（人看的）
        { v:1, cols:8, legend:{'.':0,'#':1}, lines:['..#..','...'] }
        （lines 會轉成 tiles，rows 由 lines.length 決定；
          legend 沒給就 '.'=0、其他字元依序 1,2,3…；
          舊寫法 { rows: ['..#..'] } 也吃，但 rows 同時是「列數」容易搞混，建議用 lines）
   ============================================================ */

const Level = {
  v: 1,
  cols: 0,
  rows: 0,
  cell: 16,
  tiles: null,
  objects: [],
  meta: {},

  /* ---------------- 建立 ---------------- */
  /* 回傳「獨立」的關卡物件（多張地圖、測試都靠這個）
     Level.load() / Level.loadSaved() 則是改「Level 自己」這個單例 */
  create(opt) {
    opt = opt || {};
    const lv = Object.create(Level);
    lv.v = 1;
    lv.cols = opt.cols || 16;
    lv.rows = opt.rows || 12;
    lv.cell = opt.cell || 16;
    lv.tiles = new Uint8Array(lv.cols * lv.rows);
    if (opt.fill) lv.tiles.fill(opt.fill);
    lv.objects = [];
    lv.meta = opt.meta ? Object.assign({}, opt.meta) : {};
    return lv;
  },

  /* 從資料直接產生一個獨立關卡（不改動 Level 單例） */
  from(data) {
    const lv = Object.create(Level);
    lv.load(data);
    return lv;
  },

  /* 從 JSON 物件或字串建立（會驗證，壞掉會丟出清楚的錯誤） */
  load(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    if (!d || typeof d !== 'object') throw new Error('[level] 不是物件');
    const lines = Array.isArray(d.lines) ? d.lines : (Array.isArray(d.rows) ? d.rows : null);
    const cols = d.cols | 0;
    const rows = lines ? lines.length : (d.rows | 0);
    if (!(cols > 0 && rows > 0)) throw new Error('[level] cols / rows 不合法');
    this.cols = cols;
    this.rows = rows;
    this.cell = d.cell || 16;
    this.meta = d.meta ? Object.assign({}, d.meta) : {};

    if (lines && lines.length) {
      /* 手寫格式：字串列 */
      const legend = d.legend || null;
      const auto = {};
      let next = 1;
      const mapChar = (ch) => {
        if (legend && legend[ch] != null) return legend[ch] | 0;
        if (!legend) {
          if (ch === '.' || ch === ' ') return 0;
          if (!(ch in auto)) auto[ch] = next++;
          return auto[ch];
        }
        return 0;
      };
      const tiles = new Uint8Array(cols * rows);
      for (let y = 0; y < rows; y++) {
        const line = lines[y] || '';
        if (line.length < cols) {
          throw new Error('[level] 第 ' + y + ' 列只有 ' + line.length + ' 個字（要 ' + cols + '）');
        }
        for (let x = 0; x < cols; x++) tiles[y * cols + x] = mapChar(line[x]);
      }
      this.tiles = tiles;
    } else if (d.tiles) {
      if (d.tiles.length !== cols * rows) {
        throw new Error('[level] tiles 長度 ' + d.tiles.length + '，應該是 ' + (cols * rows));
      }
      this.tiles = Uint8Array.from(d.tiles);
    } else {
      throw new Error('[level] 沒有 tiles 或 rows');
    }

    if (!this.tiles) throw new Error('[level] 沒有 tiles 或 lines');
    this.objects = (d.objects || []).map(o => ({
      type: o.type || 'object',
      cx: o.cx | 0, cy: o.cy | 0,
      data: o.data ? Object.assign({}, o.data) : null,
    }));
    const errs = this.validate();
    const fatal = errs.filter(e => e.level === 'error');
    if (fatal.length) throw new Error('[level] ' + fatal.map(e => e.msg).join('；'));
    return this;
  },

  /* 存成純資料 */
  export() {
    return {
      v: this.v,
      cols: this.cols,
      rows: this.rows,
      cell: this.cell,
      tiles: Array.from(this.tiles),
      objects: this.objects.map(o => ({
        type: o.type, cx: o.cx, cy: o.cy, data: o.data ? Object.assign({}, o.data) : undefined,
      })),
      meta: Object.assign({}, this.meta),
    };
  },

  serialize(pretty) { return JSON.stringify(this.export(), null, pretty ? 2 : 0); },

  /* 人看的格式（手改方便）
     idToChar：{ 0:'.', 1:'#', 2:'~' }（tile 值 → 字元）
     回傳的 legend 會轉成「字元 → tile 值」，可以直接丟回 load()。 */
  exportRows(idToChar) {
    const map = idToChar || { 0: '.' };
    const back = {};
    for (const k in map) back[Number(k)] = map[k];
    const rows = [];
    for (let y = 0; y < this.rows; y++) {
      let line = '';
      for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y * this.cols + x];
        line += back[t] != null ? back[t] : String(t);
      }
      rows.push(line);
    }
    const legend = {};
    for (const k in map) legend[map[k]] = Number(k);
    return { v: this.v, cols: this.cols, cell: this.cell, legend: legend, lines: rows };
  },

  /* ---------------- 讀寫格子 ---------------- */
  idx(cx, cy) { return cy * this.cols + cx; },
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; },
  get(cx, cy) { return this.inside(cx, cy) ? this.tiles[this.idx(cx, cy)] : -1; },
  set(cx, cy, v) {
    if (!this.inside(cx, cy)) return this;
    this.tiles[this.idx(cx, cy)] = v;
    return this;
  },
  fillRect(x0, y0, x1, y1, v) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, v);
    }
    return this;
  },
  fillBorder(v) {
    for (let x = 0; x < this.cols; x++) { this.set(x, 0, v); this.set(x, this.rows - 1, v); }
    for (let y = 0; y < this.rows; y++) { this.set(0, y, v); this.set(this.cols - 1, y, v); }
    return this;
  },
  forEach(cb) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) cb(x, y, this.tiles[y * this.cols + x]);
    }
  },
  counts() {
    const c = {};
    for (let i = 0; i < this.tiles.length; i++) c[this.tiles[i]] = (c[this.tiles[i]] || 0) + 1;
    return c;
  },

  /* 給 Grid 用（非 0 都算擋；也可以指定「哪個值算擋」） */
  grid(opt) {
    opt = opt || {};
    const pass = opt.pass || null;       // 例：{ 2: true } → 2 當可走
    const tiles = new Uint8Array(this.tiles.length);
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      tiles[i] = (!t || (pass && pass[t])) ? 0 : 1;
    }
    const g = Grid.createFromTiles(tiles, this.cols, this.rows, { cell: this.cell });
    if (opt.block) g.setBlock(opt.block);
    return g;
  },

  /* ---------------- 物件 ---------------- */
  addObject(type, cx, cy, data) {
    const o = { type, cx, cy, data: data || null };
    this.objects.push(o);
    return o;
  },
  removeObjectAt(cx, cy, type) {
    const i = this.objects.findIndex(o => o.cx === cx && o.cy === cy && (!type || o.type === type));
    if (i < 0) return null;
    return this.objects.splice(i, 1)[0];
  },
  objectAt(cx, cy, type) {
    return this.objects.find(o => o.cx === cx && o.cy === cy && (!type || o.type === type)) || null;
  },

  /* ---------------- 驗證 ---------------- */
  validate() {
    const out = [];
    if (!this.tiles || this.tiles.length !== this.cols * this.rows) {
      out.push({ level: 'error', msg: 'tiles 數量不對（' + (this.tiles ? this.tiles.length : 0) + '）' });
      return out;
    }
    if (this.cols < 2 || this.rows < 2) out.push({ level: 'error', msg: '地圖太小' });
    for (const o of this.objects) {
      if (!this.inside(o.cx, o.cy)) {
        out.push({ level: 'error', msg: '物件 ' + o.type + ' 在地圖外 (' + o.cx + ',' + o.cy + ')' });
      }
    }
    const counts = this.counts();
    if ((counts[0] || 0) === 0) out.push({ level: 'warn', msg: '整張圖都是牆（沒有可走的地方）' });
    return out;
  },

  /* 兩個格子之間走得通嗎（用 Grid 的 BFS 距離場） */
  connected(a, b, opt) {
    if (!a || !b) return false;
    const g = this.grid(opt);
    const field = g.field({ from: { cx: a.cx, cy: a.cy } });
    return field[this.idx(b.cx, b.cy)] >= 0;
  },

  /* ---------------- localStorage ---------------- */
  save(key) {
    Save.set(key, this.export());
    return this;
  },
  loadSaved(key) {
    const d = Save.get(key, null);
    if (!d) return null;
    this.load(d);
    return this;
  },

  /* ---------------- 建給測試/工具用 ---------------- */
  toGridString(passValue) {
    const rows = [];
    for (let y = 0; y < this.rows; y++) {
      let line = '';
      for (let x = 0; x < this.cols; x++) {
        const t = this.tiles[y * this.cols + x];
        line += (!t || t === passValue) ? '.' : '#';
      }
      rows.push(line);
    }
    return rows.join('\n');
  },
};

/* ============================================================
   LevelLib — 關卡庫 + 可分享的「關卡碼」  v1.7
   ------------------------------------------------------------
   目的：
     · 玩家自己編的關卡要能存起來（選單裡挑）
     · 能變成一串短碼傳給朋友（貼上就能玩）

   關卡碼格式：`TL1-<base64(JSON)>`
     壓縮：tiles 用 run-length（`<值36進位><數量36進位>` 串起來）
     內容：名稱、欄列、meta.mode、物件

   用法：
     const code = LevelLib.encode(lv);        // → 'TL1-eyJuIjoi...'
     const lv2  = LevelLib.decode(code);      // → 獨立 Level（壞碼會丟錯）
     LevelLib.share(lv)                       // 產碼 + 複製到剪貼簿（有回傳碼）

     // 關卡庫（存在 localStorage）
     LevelLib.list();                         // [{ id, name, at, code }]
     LevelLib.add(lv, '我的迷宮');             // → entry
     LevelLib.get(id);                        // → 解碼後的 Level
     LevelLib.update(id, lv);                 // 覆蓋
     LevelLib.rename(id, '新名字');
     LevelLib.remove(id);
     LevelLib.importCode(code);               // 驗證 + 存進關卡庫 → entry

   注意：
     · encode 只支援 0~35 的格子值（我們用 0~3），超過會丟錯（避免默默壞掉）
     · decode 會做 validate()，壞碼／版本不對會丟出看得懂的錯誤
   ============================================================ */

const LevelLib = {
  PREFIX: 'TL1-',
  KEY: 'tinyengine-levels',
  MAX: 40,                       // 關卡庫上限（避免 localStorage 爆掉）

  /* ---------- base64（支援中文） ---------- */
  _b64enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  },
  _b64dec(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  },

  /* ---------- 關卡 → 碼 ---------- */
  encode(lv) {
    if (!lv || !lv.tiles) throw new Error('[level] encode 需要一個 Level');
    const W = lv.cols, H = lv.rows;
    if (lv.tiles.length !== W * H) throw new Error('[level] tiles 數量不對');
    // run-length（值用 36 進位單字元）
    let runs = '';
    let prev = lv.tiles[0], n = 0;
    for (let i = 0; i < lv.tiles.length; i++) {
      const t = lv.tiles[i];
      if (t > 35) throw new Error('[level] 格子值必須是 0~35（收到 ' + t + '）');
      if (t === prev) { n++; continue; }
      runs += prev.toString(36) + n.toString(36);
      prev = t; n = 1;
    }
    runs += prev.toString(36) + n.toString(36);

    const meta = lv.meta || {};
    const payload = {
      v: lv.v || 1,
      n: meta.name || '',
      c: W, r: H, cell: lv.cell || 16,
      m: meta.mode || '',
      t: runs,
      o: lv.objects.length
        ? lv.objects.map(o => [o.type, o.cx, o.cy, o.data || 0])
        : 0,
    };
    return this.PREFIX + this._b64enc(JSON.stringify(payload));
  },

  /* ---------- 碼 → 關卡 ---------- */
  decode(code) {
    if (typeof code !== 'string') throw new Error('[level] 需要字串');
    const clean = code.replace(/\s+/g, '');
    if (clean.indexOf(this.PREFIX) !== 0) throw new Error('[level] 這不是關卡碼（開頭要 ' + this.PREFIX + '）');
    let data;
    try {
      data = JSON.parse(this._b64dec(clean.slice(this.PREFIX.length)));
    } catch (e) {
      throw new Error('[level] 關卡碼壞掉了（base64/JSON 解析失敗）');
    }
    if (!data || !data.c || !data.r || typeof data.t !== 'string') {
      throw new Error('[level] 關卡碼缺少欄位');
    }
    const W = data.c | 0, H = data.r | 0;
    if (W < 2 || H < 2 || W > 200 || H > 200) throw new Error('[level] 關卡尺寸不合理（' + W + '×' + H + '）');

    // 解 run-length
    const tiles = new Uint8Array(W * H);
    let idx = 0;
    for (let i = 0; i < data.t.length; i += 2) {
      const v = parseInt(data.t[i], 36);
      const n = parseInt(data.t[i + 1], 36);
      if (isNaN(v) || isNaN(n) || n <= 0) throw new Error('[level] 關卡碼的格子資料壞了');
      for (let k = 0; k < n; k++) {
        if (idx >= tiles.length) throw new Error('[level] 格子數量超過 ' + (W * H));
        tiles[idx++] = v;
      }
    }
    if (idx !== tiles.length) throw new Error('[level] 格子數量是 ' + idx + '，應該是 ' + (W * H));

    const lv = Level.create({ cols: W, rows: H, cell: data.cell || 16, meta: data.meta || {} });
    lv.tiles = tiles;
    lv.meta.name = data.n || lv.meta.name || '';
    lv.meta.mode = lv.meta.mode || '';
    if (data.m) lv.meta.mode = data.m;
    lv.objects = (data.o || []).map(o => ({
      type: o[0], cx: o[1] | 0, cy: o[2] | 0, data: o[3] || null,
    }));
    const errs = lv.validate().filter(e => e.level === 'error');
    if (errs.length) throw new Error('[level] ' + errs.map(e => e.msg).join('；'));
    return lv;
  },

  /* ---------- 關卡庫（localStorage） ---------- */
  list() {
    const d = Save.get(this.KEY, null);
    return (d && Array.isArray(d.items)) ? d.items : [];
  },
  _write(items) {
    Save.set(this.KEY, { v: 1, items: items.slice(0, this.MAX) });
    return items;
  },
  add(lv, name) {
    const code = this.encode(lv);
    const items = this.list();
    const id = 'lv' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const entry = {
      id,
      name: name || (lv.meta && lv.meta.name) || ('自製關卡 ' + (items.length + 1)),
      mode: (lv.meta && lv.meta.mode) || '',
      cols: lv.cols, rows: lv.rows,
      at: Date.now(),
      code,
    };
    items.unshift(entry);
    this._write(items);
    return entry;
  },
  update(id, lv, name) {
    const items = this.list();
    const e = items.find(it => it.id === id);
    if (!e) return this.add(lv, name);
    e.code = this.encode(lv);
    e.mode = (lv.meta && lv.meta.mode) || '';
    e.cols = lv.cols; e.rows = lv.rows;
    e.at = Date.now();
    if (name) e.name = name;
    this._write(items);
    return e;
  },
  get(id) {
    const e = this.list().find(it => it.id === id);
    return e ? this.decode(e.code) : null;
  },
  entry(id) { return this.list().find(it => it.id === id) || null; },
  rename(id, name) {
    const items = this.list();
    const e = items.find(it => it.id === id);
    if (!e) return null;
    e.name = name;
    this._write(items);
    return e;
  },
  remove(id) {
    const items = this.list().filter(it => it.id !== id);
    this._write(items);
    return items;
  },
  clear() { Save.del(this.KEY); return this; },

  /* 驗證 + 存進關卡庫（匯入用） */
  importCode(code, name) {
    const lv = this.decode(code);
    return { level: lv, entry: this.add(lv, name || lv.meta.name || '匯入的關卡') };
  },
};
