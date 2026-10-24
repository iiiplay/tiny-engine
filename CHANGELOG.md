# Changelog

## v1.4.0 — 2026-10-24

> 主題：**圖形變形（翻轉／旋轉）進引擎**。來自 tiny-home「家具不能左右或顛倒擺」的需求 ——
> 以前只能在遊戲層自己寫 `ctx.save/rotate`，現在全引擎共用一份實作。

### 新增 `drawSprite()`（`engine/assets.js`）
- `drawSprite(img, sx, sy, sw, sh, dx, dy, dw, dh, opt)`
- `opt.flipX` / `opt.flipY`：左右鏡像 / 上下顛倒
- `opt.rot`：任意弧度（順時針；`Math.PI/2` = 90°）
- `opt.pivot`：軸心 `{x,y}`（絕對座標）或 `'center'`（預設＝目標矩形中心）
- `opt.alpha` / `opt.target`（離屏或第二畫布）
- **不變形時走原本的 `drawImage` 直路**，零額外 state 切換；有變形才 `save/rotate/restore`

### 既有的三個繪製函式一起吃變形
- `drawSheet(s, frame, x, y, opt, ctx)`：多了 `flipX` / `flipY` / `rot` / `pivot`
  · 預設軸心是「圖框中心」（繞腳底轉 180° 會讓角色沉到地板下，所以不這樣做）
- `drawDirSheet(s, dir, frame, x, y, opt)`：同上（可拿「左走」那列鏡像成「右走」）
- `drawCrop(def, ..., opt)`：同上（預設繞矩形中心）
- `Sprite.draw(x, y, opt)` 自動透傳

### 文件（這次的重點）
- **新檔 [`docs/api-sprite.md`](docs/api-sprite.md)**：完整參數表、軸心語意圖解、
  「90° 旋轉後佔用格子互換」的可複製範例、像素遊戲注意事項（只有 90° 倍數不會糊、
  整數座標、影子另外畫、深度排序用實際佔用底邊、8 種朝向＝rot×flipX）、效能、行為細節
- `README.md`「四個最常用的細節」加第 4 個範例；`engine/README.md` 的模組表同步

### 驗收
- `demo/v14.html` + `tools/v14.py`：**26 項像素級檢查全過**
  · 不變形時逐位元等於舊行為、flipX/flipY 對應像素、rot90 不糊不溢位、
    `flipX+flipY == rot180`、`pivot` 真的生效、`drawSheet` 錨點與圖框不位移、
    `drawDirSheet` 與 `drawSprite` 等價、alpha 生效且復原、空圖不丟錯
- `tools/pack.py` 重新打包（14 支 → 76.3 KB）、`--check` OK
- 第一個採用者：**tiny-home**（家具 ⇄ / ⇅ / ⟳，地毯類支援四向旋轉）

## v1.3.1 — 2026-10-24

> 修 desktop-hero 實際接入時抓到的問題（v1.3.0 發版後 1 小時內）

### 修正
- `Save.migrate()`：升級後**沒有寫回**存檔，導致每次載入都重跑遷移、版本號永遠停在舊的
  · 現在只要跑過遷移就 `set()` 寫回；`Save.migrate(key, ver, map, def, { write:false })` 可關
  · 實測：v1 存檔（`{v:1, gold:77, lvl:3}`）載入後 → 存檔版本變 2、資料正確
- `TINY_ENGINE_VERSION` 改由 util.js 提供並同步版號（`'1.3.1'`）

### 驗證
- `tools/v13.py` PASS、`tools/shot.py` PASS、bench 60fps
- desktop-hero 接入：離線 2 小時 → +90 金、專注模式 renderRate 4、v1→v2 遷移通過

## v1.3.0 — 2026-10-24

> 主題：**把「桌寵／掛機／小卡片」需要的東西補進引擎**（來自 desktop-hero 專案的實戰需求）

### 場景管理器 `engine/scene.js`（新）
- `Scene.register(name, { enter, exit, update, render, resize })`
- `Scene.go(name, params)`／`Scene.restart()`／`Scene.t`（進場秒數）
- `Scene.overlay(def)`：覆蓋層（面板／暫停選單），**模擬不中斷**、`closeOverlay()`
- `Scene.attach()`：一行接上 `Loop`；`beforeUpdate` / `beforeRender` / `afterRender` 鉤子
- `Scene.debugInfo()` 可直接給 `Loop.debugInfo`

### UI 元件化 `engine/ui.js`
- 熱區池：`UI.beginFrame()` / `UI.hot()` / `UI.hitAt()` / `UI.pointer()` / `UI.click()`
  · **熱區物件重複使用**，每帧 0 配置；後註冊的優先度高（大卡片 + 小按鈕）
- `UI.button()`（hover／disabled／熱區一次搞定）、`UI.chip()`、`UI.bar()`、`UI.roundRect()`
- `UI.nineSlice(img, slice, x, y, w, h)`：GUI 素材九宮格邊框
- `UI.measure(str, size)`：文字寬度快取（>600 筆自動清）
- `UI.bind(canvas, onAct)`：滑鼠／觸控 → 熱區，含游標變化與 `Sfx.unlock`

### 離線收益 `engine/save.js`
- `Save.offline(key, { hours, rate })` → `{ seconds, hours, gain, capped, first, away }`
  · rate 可為數字（每小時）或函式；**時鐘倒退視為 0**；上限預設 8 小時
- `Save.migrate(key, version, migrations, def)`：存檔版本升級

### 四方向動畫表
- `assetDef(src, frames, foot, fw, { rows })`；`sheetOf()` 會推出 `rows` / `fh`
- `drawDirSheet(sheet, dir, frame, x, y, opt)`＋`DIR_ROW`（下／左／上／右，Tiny Adventure Pack 慣例）

### 繪製節流（省電）
- `Loop.renderRate`（>0 = 每秒最多畫幾次）、`Loop.renderPaused`、`Loop.renderCount`
- `Loop.watchVisibility()`＋`autoPauseWhenHidden`：分頁隱藏自動停畫（模擬照跑）

### 小卡片版面
- `Display.fit(canvas, { w, h, scale })`：固定邏輯尺寸＋指定倍率，不再假設填滿視窗

### 音量
- `Sfx.setMaster(v)`、`Sfx.mute(on)`；靜音時 gain 歸零、不排程音訊

### 打包與測試
- `tools/pack.py`：14 支合成 `engine/dist/tiny-engine.js`（73.5 KB）；`--check` 給 CI 用
- `demo/v13.html` + `demo/v13.js`：驗收頁（Scene 切換／覆蓋層／離線／四方向／節流／UI 成本）
- `tools/v13.py`：端到端測試
- **效能（實測）**：200 個按鈕 0.6 ms 繪製、0.3 ms 命中；10 fps 節流模式 1.2 秒畫 11 次；
  demo 仍 60 fps、bench 全部 PASS、`shot`／`soak` PASS
- CI 新增 `tools/v13.py` 與 `tools/pack.py --check` 兩關

## v1.2.0 — 2026-10-24

### A\* 節流（大量單位）
- `Pathfind.request(agent, tx, ty, onPath)`：把找路工作排進佇列
  · 同一個 agent 只保留最新一筆 · 有最短重算間隔（`minInterval`）
- `Pathfind.update(dt)`：每帧最多處理 `maxPerStep` 條
- `Pathfind.pending()`：佇列長度（除錯用）
- bench 改用節流：3200×2000 / 400 隻仍 60fps

### 區網 demo
- `demo/net.html` + `demo/net.js`：房主權威 + 加入端瘦客戶端（按 1 開房、2 加入）
  · 加入端送輸入、房主算、加入端看快照；畫面上顯示角色、快照數、延遲
- `tools/nettest.py`：兩個分頁的端到端測試（加入端按 → 房主端方塊要動）

### 效能台
- 多量測「最大帧時間」與 p99（`maxFrameMs` / `p99FrameMs`），畫面上也顯示
- 顯示 A\* 佇列長度

### CI
- 加上 `tools/nettest.py` 一關

## v1.1.0 — 2026-10-24

### 音檔（實測）
- `demo/tools/make_audio.py`：用純 Python 標準庫產生 4 個音效 + 4 秒循環 BGM
- `Sfx.play(name)` 改成「有同名音檔就用音檔，否則用合成音效」（呼叫端不用改）
- demo 載入音檔並在開始時播 BGM、按 `M` 開關音樂
- 驗證：`Sfx.clips` 全部載入、`playClip` 正常、`music.paused === false`

### 效能台（會顯示 FPS）
- 新增 `demo/bench.html` + `demo/bench.js`：`?n=200&cull=1&w=2400&h=1600`
- 畫面直接顯示**大字 FPS + 折線圖**、同屏實體數、render/update 成本，跑完顯示結果框
- `Camera.cullEnabled` 可關閉剔除做對照
- 新增 `tools/bench.py`（CI 把關：fps < 45 失敗）
- 實測：2400×1600 / 200 隻 → 60fps、render 0.20ms、同屏 14/200（關剔除則 200/200）

### CI
- `.github/workflows/test.yml`：node --check → Python 語法 → 起伺服器 → shot → soak → bench
- `tools/shot.py` 遇到 JS 錯誤 / 資源 404 會 `exit 1`（CI 真的會紅）

### 其他
- `tools/serve.py`：專案根目錄有 `index.html` 或 `demo/` 就服務專案本身
- 修 demo/bench 的素材路徑（`assets/hero.png`）

## v1.0.0 — 2026-10-24

第一個可用版本。

### 引擎（engine/）
- `util` 世界尺寸與小工具
- `core` G / Display（滿版縮放、safe/view）／Loop（dt 上限、背景 timer、fps·ms、除錯 overlay）／
  **Camera**（平滑跟隨、邊界夾住、剔除）
- `assets` 載入、sprite sheet 分析（格數 / 腳底 foot）、`drawSheet`、白閃剪影
- `sprite` 動畫播放器
- `input` 鍵盤 → 動作（可設定 map）、8 方向移動向量、觸控軸合併
- `audio` WebAudio 合成器 + 音效註冊表 + **音檔 clip／背景音樂**
- `fx` 粒子池、鏡頭震動、hitstop
- `physics` AABB、軸分離滑動、**可自訂活動邊界**
- `pathfind` **格子 A\***（8 方向、不切角、路徑平滑、`lineClear`）
- `save` **localStorage 存檔 + 排行榜**
- `ui` 文字（字型快取）、面板、熱區判定
- `touch` 浮動搖桿、可設定按鈕、情境按鈕、全螢幕、震動、安全邊距
- `net` WebSocket 連線、遠端輸入、快照收送（內容由遊戲決定）
- `Loop.fixedStep` 固定時間步

### Demo（demo/）
- 捲動鏡頭（世界 900×620）＋ A\* 追擊者＋排行榜＋固定時間步＋除錯 overlay
- 精靈由 `demo/tools/make_art.py` 程式產生

### 工具
- `tools/serve.py`（本機／手機／區網中繼、自動挑埠、QR、no-store）
- `tools/new_project.py`（一行開新專案）
- `tools/shot.py` / `tools/soak.py`（冒煙測試／自動遊玩）

### 驗證
- demo 與 new_project 產生的專案都通過 Playwright 實測（載入、移動、鏡頭捲動、A\*、排行榜持久化、0 JS 錯誤）
- 200 個實體 render 2.16ms（桌機）／7.89ms（手機），皆 60fps
