# Changelog

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
