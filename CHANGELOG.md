# Changelog

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
