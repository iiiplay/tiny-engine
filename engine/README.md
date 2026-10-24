# TinyEngine — 自製 2D 像素遊戲引擎（HTML5 Canvas）

給「**16×16 俯視像素、單一螢幕、動作遊戲**」用的極簡引擎。
沒有依賴、沒有 build、沒有編輯器 —— 全部就是幾支 JS 檔，複製資料夾就能在新專案用。

> 這不是通用引擎。刻意的取捨：**只做一種遊戲做得好**，其他一律不做。

---

## 檔案與 API

| 檔案 | 負責 | 主要 API |
|---|---|---|
| `util.js` | 世界尺寸、小工具、方向表 | `GAME_W` / `GAME_H`、`U.clamp/rand/lerp/dist/overlap/seeded`、`DIRV` |
| `core.js` | App 物件、畫面配置、主迴圈、鏡頭 | `G`（canvas/ctx/scale/safe/view/state/time）、`Display.init/layout/toWorld`、`Loop.start/step/fixedStep/toggleDebug`、`Camera.follow/apply/visible/toScreen` |
| `assets.js` | 資源載入、sprite sheet 分析 | `loadAll(manifest, onProgress)`、`sheetOf(def)`、`assetDef(src, frames, foot)`、`drawSheet(s, frame, x, y, opt, ctx)`、`drawCrop(def, ...)`、`shadow()` |
| `sprite.js` | 動畫播放器 | `new Sprite(fps, loop)` → `.set(sheet, fps, loop)`、`.update(dt)`、`.draw(x, y, opt)`、`.frame`、`.done` |
| `input.js` | 鍵盤 → 動作 | `Input.init(map)`（沒給就用預設 WASD/方向鍵/Enter/Escape/F3）、`isDown(a)`、`justPressed(a)`、`moveAxis()`、`touchAxis`、`endFrame()` |
| `audio.js` | WebAudio 合成音效 + 音檔 | `Sfx.tone/noise`、`Sfx.register({...})`、`Sfx.play(name)`、`Sfx.loadClip/playClip`、`Sfx.loadMusic/playMusic/stopMusic` |
| `fx.js` | 粒子 / 震動 / hitstop | `Fx.burst/dust/spark/shake/hitstop/update/draw/reset` |
| `physics.js` | AABB 碰撞 | `Physics.add/clear/hit/overlap/moveAxis(e, dx, dy, opt)`、`Physics.bounds`（活動邊界，捲動世界必設） |
| `pathfind.js` | 格子 A* | `Pathfind.build({cell,w,h,pad})`、`.find(x1,y1,x2,y2)`、`.lineClear()`、`.smooth()` |
| `save.js` | 存檔 / 排行榜 | `Save.get/set/del/reset`、`Save.addScore(board, score)`、`Save.scores(board)` |
| `ui.js` | 文字與面板 | `text()`（字型快取）、`hudPanel()`、`panel()`、`inRect()`、`UI` |
| `touch.js` | 手機觸控 + 全螢幕 | `TouchUI.init/update/draw/resize`、`TouchUI.showIn`、`TouchUI.setButtons([...])`、`TouchUI.extra`（情境按鈕）、`Screen.init`、`buzz()` |
| `net.js` | 區網連線（房主權威） | `Net.connect/close/send/update`、`Net.remote`（加入端輸入）、`Net.produceSnapshot / onSnapshot / onDrop / onReady / onHello` |

**約定**：`G` 是引擎的全域 App 物件，`GAME_W` / `GAME_H` 是世界尺寸。遊戲自己的狀態請另開物件（範例用 `GS`），不要塞進 `G`。

---

## 用這個引擎開新遊戲（最小骨架）

```html
<!-- index.html -->
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<canvas id="game"></canvas><canvas id="ui"></canvas>
<script src="game/manifest.js"></script>
<script src="engine/util.js"></script>
<script src="engine/core.js"></script>
<script src="engine/assets.js"></script>
<script src="engine/sprite.js"></script>
<script src="engine/input.js"></script>
<script src="engine/audio.js"></script>
<script src="engine/fx.js"></script>
<script src="engine/physics.js"></script>
<script src="engine/ui.js"></script>
<script src="engine/touch.js"></script>
<script src="engine/net.js"></script>
<script src="game/main.js"></script>
```

```js
// game/main.js
GAME_W = 320;          // 想改世界寬度就在載入前覆寫（util.js 的預設是 480）

const GS = { things: [] };

function update(dt) {
  const mv = Input.moveAxis();                    // 8 方向 / 搖桿連續角度
  if (mv.x) player.x += mv.x * 60 * dt;
  Physics.moveAxis(player, dx, dy, { bw: 8, bh: 6, by: -6 });
  if (Input.justPressed('sword')) Sfx.swing();
  Fx.update(dt);
}

function render() {
  const ctx = G.ctx;
  ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);
  drawSheet(pgSheet, 0, player.x, player.y, {});   // (x, y) = 腳底中心，自動對齊
  Fx.draw();
  text('HP 6', 8, 8, { size: 8 });
}

window.addEventListener('load', async () => {
  Display.init(document.getElementById('game'));
  Input.init({ KeyJ: 'sword', KeyK: 'bow' });      // 覆寫/擴充引擎預設按鍵
  await loadAll(myManifest);                       // 也可用 window.MANIFEST
  Screen.init();
  TouchUI.showIn = ['play'];                       // 哪個 state 顯示觸控層
  TouchUI.setButtons([                             // 按鈕由遊戲定義
    { a: 'sword', label: '劍', tint: '#ffd45e', r: 42, dx: 0, dy: 0 },
    { a: 'bow', label: '弓', tint: '#8fe36a', r: 27, dx: -66, dy: -10 },
  ]);
  TouchUI.init();                                  // 桌機會自動略過
  Loop.update = update;
  Loop.render = render;
  Loop.start();
});
```

---

## 用模板開新專案（建議）

```bash
cd tiny-arena
python tools/new_project.py ../我的新遊戲 --title "我的新遊戲"
cd ../我的新遊戲 && python tools/serve.py
```

會複製 `engine/` + `templates/project/`（index.html、game/ 骨架、tools/）+ `assets/`，
產生的專案**完全獨立**。只要改 `game/game.js`。

## 已驗證：可跑的最小範例

```
templates/minimal/     ← 只用到 engine/，沒有任何 game/ 的程式
  index.html             ~40 行
  game.js                ~150 行：8 方向移動、吃金幣、石頭碰撞、F3 除錯
```

開 `http://<你的IP>:8766/templates/minimal/` 就能玩。
**這就是「新遊戲可以直接用這個引擎」的證明** —— 複製 `engine/` + 寫一支 game.js 就有遊戲。

---

## 常用配方

```js
// 捲動世界（世界比畫面大）
Physics.bounds = { l: 8, r: WORLD.w - 8, t: 8, b: WORLD.h - 8 };
Pathfind.build({ cell: 8, w: WORLD.w, h: WORLD.h });
Camera.follow(player, { x: 0, y: 0, w: WORLD.w, h: WORLD.h });
// render 內：
Camera.apply(G.ctx, G.scale);
if (Camera.visible(x, y, w, h)) { /* 只畫看得到的 */ }

// 固定時間步（決定性 / 連線 / 重播）
Loop.fixedStep = 1 / 60;

// A* 追擊
c.repathT -= dt;
if (c.repathT <= 0) {
  c.repathT = 0.45;
  c.path = Pathfind.lineClear(c.x, c.y, p.x, p.y) ? [{ x: p.x, y: p.y }]
                                                  : Pathfind.find(c.x, c.y, p.x, p.y);
}
if (c.path[0]) { /* 往 c.path[0] 走；到了就 shift() */ }

// 存檔 / 排行榜
Save.set('unlocked', 3);
const r = Save.addScore('best-time', -seconds, { max: 5 });   // 越小越好用負數
if (r.isRecord) text('新紀錄！', ...);

// 音檔（不想用合成音效時）
await Sfx.loadClips({ hit: 'assets/sfx/hit.wav' });
Sfx.playClip('hit', { rate: 1.2 });
Sfx.loadMusic('assets/bgm.mp3', { loop: true }); Sfx.playMusic();
```

## 引擎幫你處理掉的事（都是踩過的坑）

1. **腳底對齊**：sprite sheet 高度不一（16/17/18/21/23px），`gen_manifest` 算好 `foot`，所有動畫同一個錨點 → 換動作不抖。
2. **白色剪影**：`source-in` 預先合成，沒有受擊動畫也能閃白。
3. **滿版縮放**：`Display.layout()` 依螢幕比例算世界高度，`cover` 鋪滿但限制裁切；`G.safe`（被裁掉多少）、`G.view`（可活動範圍）。
4. **靜態層預烘焙**：地面與暗角畫一次到離屏 canvas，每帧只 blit（實測 render 快 3～5 倍）。
5. **粒子物件池 + 字型快取**。
6. **觸控**：浮動搖桿、圓形按鈕、多點觸控、安全邊距、震動、全螢幕按鈕與失敗提示。
7. **背景分頁不中斷**：RAF 被暫停時用 timer 補跑（區網房主必須持續送狀態）。
8. **區網**：`Net` 只負責傳輸與時序，快照內容由遊戲決定（`produceSnapshot` / `onSnapshot`）。
9. **除錯 overlay**：`F3` → fps / 每帧成本 / 自訂資訊 / 碰撞框。
10. **捲動鏡頭**：`Camera.follow()` 平滑跟隨 + 邊界夾住 + `visible()` 剔除。
11. **固定時間步**：`Loop.fixedStep`，落後時最多補跑 `maxSteps` 次，不會雪崩。
12. **A\* 尋路**：格子化 `Physics.solids`，8 方向不切角、路徑平滑、可直線就不繞路。
13. **存檔 / 排行榜**：localStorage，無痕模式會安靜失敗（不會炸）。

---

## 引擎不提供什麼（刻意的）

- 3D、骨骼動畫、粒子編輯器
- 完整物理（剛體、關節、四元數）
- 視覺化關卡編輯器 / IDE
- 通用腳本語言

需要這些就該用 Godot / Unity / Phaser，不要自己養。
這個引擎的定位是：**一款 2D 像素小遊戲，從零到能玩，不用裝任何東西。**
