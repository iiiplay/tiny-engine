# TinyEngine

給「**16×16 俯視像素、單一螢幕或小地圖、動作遊戲**」用的極簡 2D 引擎。
**純 HTML5 Canvas + 原生 JS，零依賴、零 build** —— 雙擊 `index.html` 就能玩。

```bash
python tools/serve.py        # 本機 + 手機（同一個 Wi-Fi）都能玩
# → http://localhost:8766/demo/
```

> 它不是 Unity / Godot 的替代品。刻意的取捨：**把一種遊戲做到順手，其他一律不做。**

---

## Demo（跑起來看最快）

**Slot 展示：[翠光秘庫](demo/slot.html)** — 啟動伺服器後開啟 `http://localhost:8766/demo/slot.html`。
5 軸 × 3 列、20 線，使用 PNG 素材；支援 Wild／Scatter、免費旋轉、下注調整、自動 10 局、快速模式、音效及 FPS。
初始贈送 2,000 遊戲幣；按空白鍵旋轉、A 開關自動旋轉、M 靜音。玩法按鈕內含賠付表、權重與全部連線。
核心規則與存檔復原放在 `demo/slot-rules.js`，不依賴畫面；驗收：`node --test tests/slot.test.cjs`、`python tools/slot.py <url>`。
素材來源見 [`demo/assets/slot/CREDITS.md`](demo/assets/slot/CREDITS.md)。

**新增可玩展示：[光種森林](demo/playground.html)** — 啟動伺服器後開啟
`http://localhost:8766/demo/playground.html`。WASD／方向鍵移動、Shift 衝刺、Space／J 攻擊；
手機提供搖桿與雙按鈕。常駐顯示實際 FPS、幀時間曲線、更新／繪製耗時，右上可切換 24／80／160 隻生物。
目標是收集 8 顆光種；`P` 暫停、`R` 重來。驗收：`python tools/playground.py <url>`。

Sprite 版使用 31 張現有 PNG：主角四方向待機／走路／揮劍、史萊姆逐格動畫、樹木與拾取物等。
第三方素材來源與使用範圍見 [`demo/assets/forest-sprites/CREDITS.md`](demo/assets/forest-sprites/CREDITS.md)，不屬於引擎 MIT 授權。

`demo/` 是一個 300 行的完整小遊戲，示範引擎的每一項核心能力：

- **捲動鏡頭**：世界 900×620，畫面 400×自動高，鏡頭平滑跟隨並卡在世界邊界內
- **A\* 尋路**：3 隻追擊者繞過障礙物追你（`F3` 會畫出路徑）
- **固定時間步**：`Loop.fixedStep = 1/60`（物理決定性）
- **排行榜**：過關時間自動存 localStorage，破紀錄會顯示「新紀錄」
- **精靈動畫**：6 格走近動畫（素材是 `demo/tools/make_art.py` 程式產生的，沒有授權問題）
- **v1.3 驗收頁**：`demo/v13.html`（Scene / UI 按鈕 / 離線收益 / 四方向 / 繪製節流）
- **v1.4 驗收頁**：`demo/v14.html`（`drawSprite` 的翻轉 ⇄ / 顛倒 ⇅ / 旋轉 ⟳ + 軸心 pivot）
- **v1.5 驗收頁**：`demo/v15.html`（格子碰撞 / BFS 距離場 / 逐格動畫 / Camera.push）
- **v1.6 驗收頁**：`demo/v16.html`（JSON 關卡 / 畫格編輯器 / `TE` 命名空間 / 關卡碼 `LevelLib`）
- **碰撞 / 粒子 / 合成音效 / 觸控搖桿 / 除錯 overlay**

---

## 安裝到你的專案

```bash
# 方法 1：一行開新專案（引擎 + demo 骨架 + 工具）
python tools/new_project.py ../我的遊戲

# 方法 2：手動複製
cp -r engine/ ../我的遊戲/engine/
```

`index.html` 依序載入（順序不能換）：

```html
<script src="engine/util.js"></script>
<script src="engine/core.js"></script>
<script src="engine/assets.js"></script>
<script src="engine/sprite.js"></script>
<script src="engine/input.js"></script>
<script src="engine/audio.js"></script>
<script src="engine/fx.js"></script>
<script src="engine/physics.js"></script>
<script src="engine/pathfind.js"></script>
<script src="engine/save.js"></script>
<script src="engine/scene.js"></script>
<script src="engine/ui.js"></script>
<script src="engine/touch.js"></script>
<script src="engine/net.js"></script>
<script src="game.js"></script>          <!-- 你的遊戲 -->
```

最小啟動骨架：

```js
GAME_W = 400;                            // 畫面邏輯寬度（高度自動依螢幕比例）
Camera.enabled = false;                  // 單螢幕遊戲不用鏡頭
Loop.fixedStep = 0;                      // 0 = 真實 dt；1/60 = 固定步長

function update(dt) {
  const mv = Input.moveAxis();           // 8 方向 / 搖桿連續角度
  Physics.moveAxis(player, dx, dy, { bw: 8, bh: 6, by: -6 });
  if (Input.justPressed('sword')) Sfx.play('swing');
}

function render() {
  const ctx = G.ctx;
  Camera.apply(ctx, G.scale);            // 沒開鏡頭時等於 (0,0)
  drawSheet(sheet, frame, x, y, {});     // (x, y) = 腳底中心
  Fx.draw();
  text('HP 6', 8, 8, { size: 8 });
}

window.addEventListener('load', async () => {
  Display.init(document.getElementById('game'));
  Input.init({ KeyJ: 'sword' });         // 覆寫/擴充按鍵
  await loadAll(MANIFEST);
  Screen.init();
  TouchUI.showIn = ['play'];
  TouchUI.setButtons([{ a: 'sword', label: '劍', tint: '#ffd45e', r: 42, dx: 0, dy: 0 }]);
  TouchUI.init();
  Loop.update = update;
  Loop.render = render;
  Loop.start();
});
```

---

## API 一覽

### 核心
| 檔案 | API |
|---|---|
| `util.js` | `GAME_W` / `GAME_H`、`U.clamp/rand/lerp/dist/overlap/seeded/pick`、`DIRV` |
| `core.js` | **`G`**（canvas/ctx/scale/safe/view/state/time）、**`Display.init/layout/toWorld`**、**`Camera`**、**`Loop`** |
| `assets.js` | `loadAll(manifest, onProgress)`、`sheetOf(def)`、`assetDef(src, frames, foot)`、**`drawSprite(img, sx,sy,sw,sh, dx,dy,dw,dh, opt)`**、`drawSheet(s, frame, x, y, opt, ctx)`、`drawCrop`、`shadow()` |
| `sprite.js` | `new Sprite(fps, loop)` → `.set/.update/.draw`、`.frame`、`.done`、`drawDirSheet(sheet, dir, frame, x, y, opt)` |
| `input.js` | `Input.init(map)`、`isDown`、`justPressed`、`moveAxis()`、`touchAxis`、`endFrame()` |
| `audio.js` | `Sfx.tone/noise`（合成）、`Sfx.register({...})`、`Sfx.play(name)`、`Sfx.loadClip/playClip`、`Sfx.loadMusic/playMusic/stopMusic` |
| `fx.js` | `Fx.burst/dust/spark/shake/hitstop/update/draw` |
| `physics.js` | `Physics.add/clear/hit/overlap/moveAxis(e, dx, dy, opt)`、`Physics.bounds` |
| `grid.js` | **`Grid.setup/create`**、`solid/setBlock/moveX/moveY/alignTo`、**`field`**（BFS 距離場）、`downhill/route`、`freeCells` |
| `level.js` | **`Level.create/from/load/save`**、`get/set/fillRect/fillBorder`、`grid()`、`connected()`、`addObject/objectAt`、`validate()`、`exportRows()`、**`LevelLib.encode/decode`**（關卡碼）+ `add/list/get/importCode`（關卡庫） |
| `edit.js` | **`Edit.init({level, palette, cell, origin, onChange})`**、`toggle()`、`draw()`、`save()`、`exportJSON()`、`undo()` |
| `namespace.js` | **`TE`**（`TE.Grid` / `TE.Level` …）、`TE.reserved`、`TE.isReserved()`、`TE.checkGlobals()`、`TE.ns()` |
| `pathfind.js` | `Pathfind.build({ cell, w, h, pad })`、`.find(x1,y1,x2,y2)`、`.lineClear()` |
| `save.js` | `Save.get/set/del/reset`、`Save.addScore(board, score)`、`Save.scores(board)` |
| `ui.js` | `text()`（字型快取）、`hudPanel()`、`panel()`、`inRect()`、`UI` |
| `touch.js` | `TouchUI.showIn / setButtons / extra`、`init/update/draw/resize`、`Screen`、`buzz()` |
| `net.js` | `Net.connect/close/send/update`、`Net.remote`、`produceSnapshot / onSnapshot / onDrop / onReady / onHello` |

### 七個最常用的細節

```js
// 1) 鏡頭（捲動世界）
Camera.follow(player, { x: 0, y: 0, w: 900, h: 620 });   // 平滑跟隨 + 邊界夾住
Camera.apply(G.ctx, G.scale);                            // render 時套用
Camera.visible(x, y, w, h);                              // 粗剔除，畫之前先問

// 2) 固定時間步（決定性 / 連線 / 重播）
Loop.fixedStep = 1 / 60;      // >0 啟用；落後時最多補跑 Loop.maxSteps 次
Loop.maxDelta = 0.25;        // 單次最多接納 250ms；超額時間捨棄，避免停頓後無限追趕
// justPressed 在一次邏輯更新後消耗；零次更新時保留，多次補跑時不重複觸發。
// 變動時間步（fixedStep=0）也會拆成每步最多 50ms，仍受 maxSteps 限制。

// 3) 尋路（8 方向 A*，不切角、自動平滑）
Pathfind.build({ cell: 8, w: WORLD.w, h: WORLD.h });      // 場地變了要重建
const path = Pathfind.find(e.x, e.y, player.x, player.y); // [{x,y}, ...]
if (path[0]) { /* 往 path[0] 走，到了就 shift() */ }

// 4) 格子遊戲（v1.5）：碰撞 + 追逐用同一支
Grid.setup({ cell: 16, cols: 30, rows: 13 });
const f = Grid.field({ from: { cx: px, cy: py } });        // 以玩家為 0 的距離場
const d = Grid.downhill(f, ex, ey);                        // 敵人往下坡走
Grid.moveX(enemy, d.x * spd); Grid.moveY(enemy, d.y * spd);

// 5) 逐格動畫（一格一張 PNG）
drawFrames(SRC.bomb, t, 10, x, y, { anchor: 'center' });

// 6) 關卡變成資料（v1.6）+ 內建編輯器
const lv = Level.create({ cols: 20, rows: 12, cell: 16 }).fillBorder(1);
if (location.search.includes('edit=1')) {
  Edit.init({ level: lv, cell: 16, origin: { x: 0, y: 16 },
    palette: [{ v: 0, name: '地板', color: '#b8d94a' }, { v: 1, name: '牆', color: '#5b6b8a' }] });
  Edit.toggle();
}
// 每帧最後：Edit.draw()；遊戲的點擊前面加 if (Edit.enabled) return;

// 7) 翻轉 / 旋轉（v1.4；素材只有單一朝向時很好用）
drawSheet(hero, f, x, y, { flipX: true });                        // 左右鏡像
drawSprite(img, sx, sy, sw, sh, dx, dy, sw, sh, { rot: Math.PI / 2 });  // 轉 90°
drawSprite(img, sx, sy, sw, sh, dx, dy, sw, sh, { rot: t, pivot: { x: px, y: py } });  // 繞指定軸心
```

→ 完整參數、軸心語意、像素注意事項：**[`docs/api-sprite.md`](docs/api-sprite.md)**
→ 格子碰撞與 BFS 距離場：**[`docs/api-grid.md`](docs/api-grid.md)**
→ 關卡 JSON、編輯器、素材表工具、撞名檢查：**[`docs/api-level.md`](docs/api-level.md)**

---

## 區網 demo（2 人）

`demo/net.html`：房主權威 + 加入端瘦客戶端的最小範例。

```
兩台裝置開同一頁 → 一台按 1（開房間 TEDEMO）、另一台按 2（加入）
加入端用方向鍵移動方塊 → 房主端算 → 加入端看到同步結果
```

```bash
python tools/nettest.py http://localhost:8766/demo/net.html   # 兩個分頁端到端測試（CI 也會跑）
```

實測：`房主 sent 36 / 加入端 snap 37、延遲 33ms / 加入端按 → 讓房主端方塊 180→252`

## A\* 節流（大量單位）

400 隻同時重算會讓某一帧爆量。用排程把重算分散：

```js
// 每帧 update：
Pathfind.update(dt);                                    // 每帧最多算 maxPerStep 條

// 找路（同一個單位只保留最新一筆、有最短間隔）：
Pathfind.request(chaser, player.x, player.y, (path) => { chaser.path = path; });

Pathfind.maxPerStep = 2;      // 每帧上限
Pathfind.minInterval = 0.35;  // 同一單位最短重算間隔（秒）
```

bench 已改用這個模式：**3200×2000 / 400 隻仍 60fps**（最大帧 ~23ms 只出現在第一帧的 A\* 建圖）。

## 效能台（會顯示 FPS）

```
http://<你的IP>:8766/demo/bench.html?n=200&cull=1&w=2400&h=1600
```

畫面上會直接看到 **大字 FPS + 折線圖**、同屏實體數、render/update 成本。
`?cull=0` 可以關掉剔除做對照。跑 3 秒後結果會寫進 `window.__bench`。

```bash
python tools/bench.py http://localhost:8766/demo/bench.html    # CI 會用這支把關（fps < 45 就失敗）
```

| 案例（世界大小 / 實體數） | fps | render | 同屏 |
|---|---|---|---|
| 1600×1200 / 100 | 60 | 0.20 ms | 16 / 100 |
| 2400×1600 / 200 | 60 | 0.20 ms | 14 / 200 |
| 2400×1600 / 200（關閉剔除） | 60 | 0.30 ms | 200 / 200 |
| 3200×2000 / 400 | 60 | 0.10 ms | 18 / 400 |

## 音檔（可選）

`demo/tools/make_audio.py` 會用**純 Python 標準庫**產生音效與 4 秒循環 BGM（沒有任何第三方素材）：

```
demo/assets/sfx/coin.wav  hit.wav  bump.wav  win.wav
demo/assets/bgm.wav
```

```js
await Sfx.loadClips({ coin: 'assets/sfx/coin.wav' });   // 載入
Sfx.loadMusic('assets/bgm.wav', { loop: true, volume: 0.5 });
Sfx.playMusic();                                        // 第一次點擊/按鍵之後才播（瀏覽器規則）
Sfx.play('coin');       // 有同名音檔就用音檔，沒有就退回合成音效
Sfx.stopMusic();        // demo 裡按 M 可以開關
```

## CI

`.github/workflows/test.yml`：每次 push 會自動跑

1. 所有 `engine/*.js`、`demo/*.js` 的 `node --check`
2. 所有工具的 Python 語法檢查
3. `node --test tests/runtime.test.cjs`（單次按鍵／多鍵／背景時間／時鐘交接）
4. `tools/pack.py --check`（單檔產物與來源同步）
5. `tests/tool_failures.py`（注入 console.error／頁面例外，確認驗收回傳失敗）
6. 起伺服器 → `tools/shot.py`、`tools/soak.py`（冒煙測試與亂走 8 秒）
7. `tools/runtime.py`（1280×720 桌面、375×667 手機：雙鍵／觸控／搖桿可見）
8. `tools/nettest.py`、`tools/v13.py`～`tools/v16.py`（雙端連線與全部版本驗收）
9. `tools/bench.py`（大地圖 + 剔除，**fps < 45 或瀏覽器錯誤就失敗**）

驗收腳本遇到 JS 例外、`console.error` 或偵測到的載入失敗時回傳非零 exit code。
v1.6 工具測試自行產生圖片與遊戲程式，不依賴相鄰遊戲專案或第三方素材。

## 效能（實測，Chromium headless）

| 敵人數 | 桌機 render / update | 手機 render / update |
|---|---|---|
| 10 | 0.90 / 0.03 ms | 1.62 / 0.03 ms |
| 60 | 1.24 / 0.09 ms | 4.18 / 0.08 ms |
| 200 | 2.16 / 0.32 ms | 7.89 / 0.36 ms |

- 60 fps 預算 16.6 ms，兩邊都還很寬；手機瓶頸是**地面 fill rate**，不是角色數
- 引擎內建：靜態層預烘焙（`drawGround` 自己烤）、粒子物件池、字型快取、暗角貼圖
- `F3` 除錯 overlay：fps / 每帧成本 / 自訂資訊 / 碰撞框

---

## 引擎幫你處理掉的坑

1. **腳底對齊**：sprite sheet 高度不一（16/17/18/21/23px）→ 每格算 `foot`，換動作不抖
2. **滿版縮放**：世界高度依螢幕比例生成、`cover` 不裁切、`G.safe`/`G.view` 自動內縮
3. **白閃受擊**：`source-in` 預先合成白色剪影（沒有受擊動畫也能做打擊感）
4. **靜態層預烘焙**：地面/暗角畫一次，每帧只 blit
5. **觸控**：浮動搖桿、可設定按鈕、多點觸控、安全邊距、震動、全螢幕（含失敗提示）
6. **背景分頁**：RAF 被暫停時用 timer 補跑（連線遊戲的房主必須）
7. **區網**：`Net` 只負責傳輸與時序，快照內容由遊戲決定

## 刻意不做的

- 3D、等角視角、骨骼動畫、shader
- 帶旋轉/斜坡/關節的物理（只有 AABB）
- 視覺化編輯器、通用腳本語言
- 3 人以上連線、rollback netcode

需要上面這些 → 用 Godot / Unity / Phaser。
這個引擎的定位：**一款 2D 像素小遊戲，從零到能玩，不用裝任何東西。**

---

## 依賴

- 執行：任何支援 ES2017 + Canvas 2D 的瀏覽器（Chrome / Safari / Edge / Firefox）
- 工具：`python tools/serve.py` 只需要 Python 3（區網中繼用標準庫實作）
- 選用：`pip install segno`（產生 QR）、`pip install playwright`（跑測試）

## 狀態文件

- [`STATUS.md`](STATUS.md) — 目前版本、已完成/待辦、效能數據、常用指令（**接手先看這個**）
- [`CHANGELOG.md`](CHANGELOG.md) — 每個版本做了什麼
- [`docs/api-level.md`](docs/api-level.md) — JSON 關卡 / 編輯器 / `gen_manifest` / `globals` / `TE`
- [`docs/api-grid.md`](docs/api-grid.md) — 格子世界 API（碰撞 / BFS 距離場 / 下坡走位）
- [`docs/api-sprite.md`](docs/api-sprite.md) — 圖形變形與逐格動畫 API

## 第一款正式遊戲

[`tiny-arena`](../tiny-arena) —— 舉盾競技場：波次生存、整備三選一、陷阱、夥伴、區網兩人。
它把 `engine/` 原封不動複製進去使用，可以當成「引擎實際長成什麼樣」的參考。
