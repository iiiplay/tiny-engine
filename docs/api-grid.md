# 格子世界 API — `Grid`（tile 碰撞 + BFS 距離場）

> tiny-engine **v1.5.0** 新增。實作：`engine/grid.js`。
> 驗收頁：`demo/v15.html`；測試：`python tools/v15.py`（39 項）。

## 為什麼要有這支

炸彈人、倉庫番、吃豆人、Roguelike 這類「一格一格」的遊戲，每一款都會重寫同一段程式：

```js
// 每一款遊戲都寫過一次的東西
if (dx > 0) { ...檢查右邊兩角... 撞牆就把 x 夾在牆邊... }
const field = bfs(...)                       // 敵人追逐
const dir = downhill(field, cx, cy)          // 往目標走
```

`tiny-bomber` 手寫了 200 行，而且踩了兩個經典坑（撞牆「往回彈」害角色穿牆、
每帧被吸回格心導致敵人完全不會動）。這些一次抽進引擎，之後每款格子遊戲都受益。

---

## 建立

```js
// A) 單例（跟 Physics / Pathfind 一樣，整個遊戲一個世界）
Grid.setup({ cell: 16, cols: 30, rows: 13 });
Grid.setTile(3, 1, 1);                  // 1 = 牆（值的意義由遊戲決定）

// B) 多個獨立地圖（編輯器、分割畫面、同時算兩張圖）—— 推薦
const world = Grid.create({ cell: 16, cols: 60, rows: 26 });
const test  = Grid.create({ cell: 8,  cols: 20, rows: 20 });   // 互不影響

// C) 直接吃既有地圖（例如關卡產生器的 Uint8Array）
const g = Grid.createFromTiles(tiles, cols, rows, { cell: 16 });
```

> ⚠️ `Grid.setup()` 跟 `Physics.add()` 一樣是**單例**：第二次呼叫會蓋掉前一個世界。
> 需要兩個以上就用 `Grid.create()`（回傳獨立物件，方法相同）。

| 參數 | 說明 |
|---|---|
| `cell` | 一格幾 px（預設 16） |
| `cols`, `rows` | 幾欄 × 幾列 |
| `fill` | 初始 tile 值（預設 0 = 可走） |

---

## 碰撞

tile 陣列裡 **0 = 可走、非 0 = 擋**（值本身由遊戲定義：1 牆、2 木桶…）。

```js
Grid.solid(cx, cy)          // 這格擋不擋
Grid.tileAt(cx, cy)         // 這格的值
Grid.setTile(cx, cy, 2)     // 改 tile（炸掉木桶）
Grid.setBlock(fn)           // 臨時障礙：fn(cx, cy, e) → true 表示對 e 也算擋（炸彈、NPC）
```

每個實體可以有自己的通行規則（例如「飛行敵人穿木桶」）：

```js
const fly = { x, y, r: 5, passTiles: [2] };   // 對 fly 來說 2 不是牆
Grid.solid(cx, cy, fly);                      // false
```

### 移動：`moveX` / `moveY`

```js
const e = { x: 40, y: 40, r: 6 };     // r = 半個碰撞框（12px 寬 < 16px 格）
const hitX = Grid.moveX(e, speed * dt);   // true = 撞到東西（e.x 已經被夾好）
const hitY = Grid.moveY(e, speed * dt);
```

兩條**關鍵保證**（都是 tiny-bomber 實際踩過的坑）：

1. **撞牆只往前夾，不會往回彈** —— 以前的寫法在人剛好站在障礙格裡時，
   會把角色「夾」到另一側（= 直接穿牆）。
2. **人已經在自己那一格時，那一格不算擋** —— 剛放下的炸彈就在腳下，
   玩家仍然走得出去，不會被鎖死在實心格裡。

搭配走廊的「自動對齊」（走偏了會被慢慢吸回格子中線，手感才不會卡）：

```js
Grid.alignTo(e, 'y', dt);       // 水平移動撞牆時，把 y 吸回中線
Grid.alignTo(e, 'x', dt, 120);  // 自訂每秒最多拉幾 px（預設 90）
Grid.snap(e);                   // 直接對齊最近的格子中心
```

---

## 尋路：BFS 距離場

```js
// 以玩家所在格為 0，算出「每一格還要走幾步」
const field = Grid.field({ from: { cx: 14, cy: 6 } });
field[Grid.idx(14, 6)];        // 0
field[Grid.idx(16, 6)];        // 2
field[Grid.idx(0, 0)];         // -1 = 走不到
```

| option | 說明 |
|---|---|
| `from: {cx, cy}` | 單一來源 |
| `cells: [{cx,cy}, ...]` | **多來源**（例如「所有木桶」「所有安全格」） |
| `block: fn(cx, cy)` | 額外不能通過的格子（危險區、禁止區） |
| `diagonal: true` | 8 方向（會自動檢查「不切角」） |
| `maxDist` | 只算到幾步（省時間） |
| `into: Int16Array` | 重複使用同一個陣列，零配置（每帧算的時候很有用） |

**來源格可以是牆**（例如「所有木桶」就是牆）—— 這點對「往最近的目標走」很重要。

### 下坡與路線

```js
// 走一步（回傳方向 {x,y}，例如 {x:-1,y:0}）
const d = Grid.downhill(field, cx, cy, { avoid: dangerMap });

// 走出整條路線（不含起點）→ 跟著它跑就不會繞路
const route = Grid.route(field, cx, cy, { maxSteps: 32 });
for (const c of route) { /* 依序走到每個格子中心 */ }
```

`avoid` 是 `Uint8Array`（1 = 不想走），不會影響 `field()` 算出來的距離，
只影響「這一步要選哪個鄰格」 → 很適合「沿著最短路線、但不要踩進危險區」。

```js
Grid.reachable(field, cx, cy)   // 走得到嗎
Grid.freeCells()                // 所有可走的格子
Grid.countFree()
Grid.forEach((cx, cy, v) => {})
```

---

## 範例 1：敵人追逐（10 行）

```js
// 每 0.18 秒重算一次就夠（一次 1560 格 ≈ 0.13ms）
this.navT -= dt;
if (this.navT <= 0) {
  this.navT = 0.18;
  this.field = Map.field({ from: playerCell, block: (x, y) => !!bombAt(x, y) });
}
const e = enemy;
const cx = Grid.cellOf(e.x), cy = Grid.cellOf(e.y);
if (atCenter(e)) {
  const d = Grid.downhill(this.field, cx, cy, { avoid: fireMap });
  if (d) e.dir = d;            // 沒有就亂走
}
Grid.moveX(e, e.dir.x * e.speed * dt);
Grid.moveY(e, e.dir.y * e.speed * dt);
Grid.alignTo(e, e.dir.x ? 'y' : 'x', dt);   // 走偏了吸回中線
```

## 範例 2：往「最近的目標」走（多來源）

```js
// 目標可能有很多個（木桶、道具、出口）→ 全部丟進去當來源
const field = Grid.field({ cells: barrelCells });
const d = Grid.downhill(field, cx, cy);
```

## 範例 3：算「放了炸彈之後跑不跑得掉」

```js
// 1) 目標 = 所有「不在爆炸範圍」的格子
const safeCells = [];
Grid.forEach((x, y) => { if (!blast[y * Grid.cols + x]) safeCells.push({ cx: x, cy: y }); });

// 2) 從安全格反推距離場，再從腳下往下坡走 → 就是撤退路線
const saveField = Grid.field({ cells: safeCells, block: (x, y) => blocked(x, y) });
const route = Grid.route(saveField, cx, cy, { maxSteps: 7 });
if (route.length === 0) return;     // 跑不掉，別放
```

---

## 效能（Chromium 實測）

| 操作 | 成本 |
|---|---|
| `field()`：60×26＝1560 格、30% 是牆 | **0.126 ms** |
| `moveX + moveY` 一組 | **0.065 µs** |
| `Grid.setup()` 配置 | 一次性 |

→ 60fps 下一帧只有 16.6ms，算 4 張距離場（敵人／危險／撤退路線）也才 0.5ms。
多來源、`block` callback、8 方向都不會改變量級。

---

## 注意事項

- **`Grid.setup()` 是單例**；要兩個世界請用 `Grid.create()` / `Grid.createFromTiles()`。
- 座標單位一律是**格子**（`cx, cy`）；像素座標只在 `moveX/moveY`（實體的 x,y）與
  `center(cx)`、`cellOf(px)` 之間換算。
- `field()` 的來源格即使本身是牆也會是 0 —— 這是刻意的（「往最近的木桶走」）。
- `diagonal: true` 時**不切角**（兩側有一側是牆就不能斜走），所以路徑一定走得通。
- `downhill()` 的比較是嚴格遞減；如果你自己改過 field（例如加上權重），
  記得維持「越靠近目標數字越小」。
- BFS 用的是 4 方向或 8 方向距離，**不是直線距離** —— 牆後面的格子會比直線遠很多，
  這正是你要的行為。

---

## 驗收與版本

| 版本 | 內容 |
|---|---|
| **v1.5.0** | 新增 `Grid`：碰撞（不反彈／不卡死）、`field` 距離場、`downhill` / `route`、`create()` 多世界；`demo/v15.html` + `tools/v15.py`（39 項） |

```bash
python tools/serve.py                                     # → /demo/v15.html
python tools/v15.py http://localhost:8766/demo/v15.html    # 39 項全過才 PASS
python tools/pack.py --check                              # dist 是否最新
```

第一個採用者：**tiny-bomber**（移動／敵人追逐／Bot 全部改用 `Grid`）。
