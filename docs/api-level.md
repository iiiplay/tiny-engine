# 關卡資料與編輯器 — `Level` / `Edit` / `gen_manifest.py` / `globals.py`

> tiny-engine **v1.6.0** 新增。實作：`engine/level.js`、`engine/edit.js`、`engine/namespace.js`、
> `tools/gen_manifest.py`、`tools/globals.py`。
> 驗收：`demo/v16.html` + `tools/v16.py`（含真的用滑鼠塗格子）。

## 為什麼要有這些

之前三款遊戲的關卡都寫在程式碼裡：

```js
const ROADS = [[0, 1, 17, 2], ...];      // tiny-keep
const LEVELS = [{ sx:2, sy:1, seed:1101, ... }];   // tiny-bomber
```

改一格要動 JS、要重開頁面、沒辦法丟給非工程師編，也沒辦法存玩家自製關卡。
v1.6 把「一張地圖」變成**純資料**，加上一個**畫格編輯器**和兩個工具：

| 東西 | 解決什麼 |
|---|---|
| `Level` | 關卡的資料模型（JSON 進、JSON 出、驗證、連通性檢查、物件） |
| `Edit` | 滑鼠塗格子的編輯器（色盤、拖曳、右鍵擦、Ctrl+Z、S 存檔、X 匯出 JSON） |
| `tools/gen_manifest.py` | 掃素材資料夾 → 自動產 `SRC` / `ANIM` / `SHEET_DEF`（不用再手量切圖） |
| `tools/globals.py` | 掃「遊戲全域 vs 引擎保留名稱」→ 撞名在跑之前就抓到 |
| `TE`（namespace.js） | `TE.Grid`、`TE.Level`… 新專案用這個入口，`TE.reserved` 可自我檢查 |

---

## `Level`：關卡資料

一格 = 一個數字（**0 = 可走**，其他值的意思由遊戲決定；慣例 1 = 牆／路障）。

```js
// 建一張新的（回傳獨立物件；Level.load() 才是改單例）
const lv = Level.create({ cols: 20, rows: 12, cell: 16 });
lv.fillBorder(1);                       // 外框牆
lv.fillRect(2, 2, 5, 4, 1);             // 一塊牆（含端點）
lv.set(9, 6, 2);                        // 單格

lv.get(9, 6);                           // 2
lv.counts();                            // { 0: 180, 1: 60, 2: 1 }
lv.inside(30, 30);                      // false
```

### JSON 格式（兩種都吃）

```js
// A) 機器格式（存檔用；tiles 是扁平陣列，長度 = cols × rows）
{ "v": 1, "cols": 4, "rows": 3, "cell": 16,
  "tiles": [1,1,1,1, 1,0,0,1, 1,1,1,1],
  "objects": [{ "type": "spawn", "cx": 1, "cy": 1, "data": { "team": "red" } }],
  "meta": { "name": "第一關" } }

// B) 手寫格式（人看的；lines 一行一列）
{ "v": 1, "cols": 4, "cell": 16,
  "legend": { ".": 0, "#": 1 },          // 字元 → tile 值
  "lines": ["####", "#..#", "####"] }
```

`legend` 沒給就自動配：`.`／空白 = 0，其他字元依出現順序 1、2、3…

```js
const lv = Level.create({ cols: 2, rows: 2 }).load(jsonString);  // 回傳 this
const lv2 = Level.from(obj);                                     // 回傳獨立物件
Level.load(data);                                                // 改「Level 自己」這個單例
Level.loadSaved('my-level');                                     // 從 localStorage
```

壞資料會丟出**看得懂的錯誤**（不是 undefined 之後才爆）：

```
[level] tiles 長度 2，應該是 8
[level] 第 1 列只有 2 個字（要 4）
[level] 物件 tower 在地圖外 (5,4)
```

### 進階

```js
lv.validate();                 // [{level:'error'|'warn', msg}]
lv.grid();                     // 轉成 Grid（非 0 = 擋）
lv.grid({ pass: { 2: true } });// 2 這種 tile 當可走（例如木桶給飛行怪）
lv.connected({cx:1,cy:1}, {cx:8,cy:6});   // 兩格走不走得到（BFS）
lv.export();                   // 純資料（存檔用）
lv.serialize(true);            // JSON 字串（縮排 2）
lv.exportRows({ 0:'.', 1:'#', 2:'~' });   // 人看的格式（legend 會轉成「字元→值」可直接丟回 load）
lv.save('my-level');           // 存 localStorage
lv.addObject('tower', 3, 4, { kind: 'archer' });
lv.objectAt(3, 4, 'tower');    // 查
lv.removeObjectAt(3, 4);       // 刪
```

> ⚠️ `Level` 自己也是一個單例（`Level.load(...)` 會改它）。
> 要多張地圖／寫測試請用 `Level.create()` / `Level.from()`，兩者都回傳**獨立物件**。

---

## `Edit`：畫格編輯器

```js
Edit.init({
  level: lv,                         // 要編輯的 Level（直接改它）
  cell: 16,
  origin: { x: 0, y: 16 },           // 地圖左上角在畫面上的位置
  palette: [
    { v: 0, name: '地板', color: '#b8d94a' },
    { v: 1, name: '牆',   color: '#5b6b8a' },
    { v: 2, name: '水',   color: '#4fa4b8' },
  ],
  canvas: 'game',                    // 要吃哪個 canvas 的滑鼠（id 或元素）
  key: 'my-level',                   // 存 localStorage 的 key
  onChange: (lv) => rebuildGrid(lv), // 每次塗完（重建碰撞/尋路）
  onSave: (json) => {},              // 自訂存檔行為（預設存 localStorage）
});

Edit.toggle();       // 開 / 關（關掉就完全不干擾遊戲）
Edit.draw();         // 每帧最後呼叫：格線 + 游標 + 色盤 + 提示
```

| 操作 | 動作 |
|---|---|
| 左鍵 / 拖曳 | 塗成目前選的色盤 |
| 右鍵 / `Shift`+左鍵 | 擦成 0 |
| `1`~`9`、點色盤、`Q`/`E` | 換色 |
| `Ctrl+Z` | 復原（保留 60 步） |
| `G` | 開關格線 |
| `S` | 存到 localStorage（或 `onSave`） |
| `X` | 把 JSON 印到 console（`Edit.lastJSON`） |

**接進遊戲的方式**（重點：編輯模式要「吃掉」原本的操作）

```js
// 1) 每帧最後畫
Loop.render = () => { game.render(); Edit.draw(); };

// 2) 遊戲自己的點擊要讓路
canvas.addEventListener('pointerdown', (e) => {
  if (Edit.enabled) return;            // 編輯器在畫格子，不要蓋塔
  ...
});

// 3) 開關（例如 URL 參數或按鍵）
if (location.search.includes('edit=1')) Edit.toggle();
```

---

## `LevelLib`：關卡庫 + 可分享的「關卡碼」（v1.7）

```js
const code = LevelLib.encode(lv);      // 'TL1-eyJuIjoi...'（很短，可以直接貼給朋友）
const lv2  = LevelLib.decode(code);    // 獨立 Level；壞碼會丟出看得懂的錯誤
```

| 方法 | 說明 |
|---|---|
| `encode(level)` | 關卡 → 字串碼（tiles 用 run-length，再 base64） |
| `decode(code)` | 字串碼 → `Level`（會 `validate()`，壞碼／尺寸不合理會丟錯） |
| `add(level, name)` | 存進關卡庫（localStorage）→ entry `{id, name, mode, cols, rows, at, code}` |
| `update(id, level, name)` | 覆蓋既有的關卡 |
| `list()` / `entry(id)` / `get(id)` | 列出／查 entry／取出解碼後的 Level |
| `rename(id, name)` / `remove(id)` / `clear()` | 改名／刪除／清空 |
| `importCode(code, name)` | 驗證 + 存進庫 → `{ level, entry }` |

- 關卡碼格式：`TL1-<base64(JSON)>`，內容是 `{n,c,r,cell,m,t,o}`（名稱／欄列／模式／RLE 格子／物件）
- **格子值只支援 0~35**（我們都用 0~3），超過 `encode` 會直接丟錯（不會默默壞掉）
- 上限 40 張，避免 localStorage 爆掉
- 範例：6×4 的小關卡約 **170 字**；20×12 的迷宮約 **250 字**

```js
// 分享 → 貼上就能玩
const code = LevelLib.encode(MapData.level);
navigator.clipboard.writeText(code);

// 收到朋友的碼
try {
  const { level, entry } = LevelLib.importCode(code, '朋友的關卡');
  playLevel(level);
} catch (e) {
  alert(e.message);          // '[level] 關卡碼壞掉了…'
}
```

---

## `tools/gen_manifest.py`：素材表自動產生

```bash
python tools/gen_manifest.py assets/pack --fw 16 --out game/manifest.gen.js
python tools/gen_manifest.py assets/pack --fw 16 --rows 4 --json
```

它會：

1. 遞迴找 `.png`
2. `Foo_f0.png`、`Foo_f1.png`… → 合成 `ANIM.foo = [path, path, ...]`（逐格動畫）
3. 寬度是 `--fw` 整數倍 → 當 sprite sheet，自動算 `frames`、`fh`、`foot`
4. 產出 `SRC`（圖路徑）、`ANIM`（動畫陣列）、`SHEET_DEF`（`sheetOf(assetDef(...))` 的參數）、`MANIFEST`

```js
// 產出的檔案長這樣
const SRC = { grass: 'assets/pack/grass.png', ... };
const ANIM = { bomb: ['assets/pack/bomb_f0.png', 'assets/pack/bomb_f1.png'] };
const SHEET_DEF = { goblin_walk_right: { src: '...', frames: 6, fw: 16, rows: 1, fh: 17, foot: 17 } };
const MANIFEST = {}; for (const k in SRC) MANIFEST[SRC[k]] = { src: SRC[k] };
```

> 參數說明：`--rows` 是「一張表有幾列」（四方向表通常 4）；`--foot` 預設 = 每格高度
> （腳底對齊），要「整張圖底對齊」就自己指定。

---

## `tools/globals.py`：撞名檢查（CI 用）

```bash
python tools/globals.py D:/Project/tiny-keep            # 只報告
python tools/globals.py D:/Project/tiny-keep --check    # 撞名就 exit 1
```

```
引擎保留名稱：50 個　遊戲宣告：30 個

沒有撞名 ✓

提醒（全大寫命名，容易哪天撞到）：
  ! ANIM             manifest.js
  ! CFG              config.js
```

為什麼需要：引擎有一堆全域（`G`、`Grid`、`SHEETS`…），遊戲如果也宣告
`const SHEETS = {}`，整個檔案會直接 **SyntaxError**（tiny-keep 真的撞過）。
這支工具在「跑起來之前」就把它抓出來。

---

## `TE`：命名空間

```js
TE.version;                 // '1.6.0'
TE.Grid === Grid;           // true（沒載入的模組就不會出現）
TE.Level; TE.Edit; TE.Save; TE.UI; TE.drawSprite; ...
TE.reserved;                // 引擎保留的 50 個名稱
TE.isReserved('SHEETS');    // true
TE.checkGlobals({ SHEETS: {} });   // ['SHEETS']

// 新專案：把自己的東西塞進一個袋子，不污染全域
TE.ns('MyGame', (api) => {
  api.state = 'title';
  api.start = () => {};
});
Game.MyGame.start();        // 或 TE.MyGame.start()
```

舊寫法（直接用 `Grid.xxx`）完全不受影響；`TE` 只是**多一個入口 + 保留名稱清單**。

---

## 驗收

```bash
python tools/serve.py                                     # → /demo/v16.html
python tools/v16.py http://localhost:8766/demo/v16.html    # 30 項（含真的滑鼠塗格子）
python tools/globals.py ../tiny-keep --check               # 專案撞名檢查
```

`tools/v16.py` 會做：

- **Python 端**：拿真實素材跑 `gen_manifest`（驗證動畫合併、sheet frames、`node --check`）
- **Python 端**：跑 `globals.py --check`
- **瀏覽器端**：Level 的建立／JSON 往返／手寫格式／錯誤訊息／`connected()`／物件／存檔
- **瀏覽器端**：`Edit` 的塗格、換色、右鍵擦、拖曳連塗、`Ctrl+Z`、`S` 存檔（全用真滑鼠事件）

第一個採用者：**tiny-keep**（迷宮模式的關卡就是 `Level` JSON，按 `E` 直接編輯）。
