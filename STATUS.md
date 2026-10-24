# tiny-engine — 目前狀態（給下次接手的人 / 給 AI 讀）

> 最後更新：2026-10-24　版本：**v1.3.0**　repo：https://github.com/iiiplay/tiny-engine （private）

## 這是什麼

自製 2D 像素遊戲引擎（**純 HTML5 Canvas + 原生 JS，零依賴、零 build**）。
定位：**16×16 俯視像素、單一螢幕或小地圖的動作遊戲**。不是 Unity 的替代品。

## 30 秒跑起來

```bash
cd D:/Project/tiny-engine
python tools/serve.py            # → http://localhost:8766/demo/   （手機同一個 Wi-Fi 也能開）
```

| 頁面 | 內容 |
|---|---|
| `/demo/` | 主示範：捲動鏡頭 + A\* 追擊 + 排行榜 + 固定時間步 + 音檔 |
| `/demo/bench.html?n=200&cull=1&w=2400&h=1600` | 效能台（**畫面直接顯示大字 FPS + 折線圖**） |
| `/demo/net.html` | 區網 demo（一台按 1 開房、另一台按 2 加入） |

## 已完成（含驗證）

| 項目 | 狀態 | 驗證 |
|---|---|---|
| 引擎 13 模組（util/core/assets/sprite/input/audio/fx/physics/pathfind/save/ui/touch/net） | ✅ | `node --check` + demo 實跑 |
| 捲動鏡頭 `Camera`（跟隨／邊界／剔除／`cullEnabled`） | ✅ | demo 鏡頭 250→340；bench 同屏 14/200 |
| 固定時間步 `Loop.fixedStep` | ✅ | demo 啟用中，60fps |
| A\* `Pathfind`（8 方向、不切角、平滑） | ✅ | 路徑 `[6,1,1]`，F3 畫得出來 |
| A\* 節流 `Pathfind.request/update` | ✅ | 400 隻 60fps |
| 存檔／排行榜 `Save` | ✅ | 過關寫入、重新載入後仍在 |
| 音檔 `Sfx.loadClip/playClip/loadMusic` | ✅ | demo BGM + 4 音效，`Sfx.play()` 有音檔優先 |
| 觸控（搖桿／按鈕／情境按鈕／全螢幕／震動／安全邊距） | ✅ | tiny-arena 手機實測 |
| 區網 `Net`（房主權威、快照、remote 輸入） | ✅ | `tools/nettest.py` PASS |
| **v1.3** 場景管理器 `Scene`（register/go/overlay/attach） | ✅ | `tools/v13.py` 切換＋覆蓋層不中斷 |
| **v1.3** UI 元件化（熱區池／按鈕／chip／bar／九宮格／文字量測／bind） | ✅ | 200 個按鈕 draw 0.6ms、命中 0.3ms |
| **v1.3** 離線收益 `Save.offline`＋ `Save.migrate` | ✅ | 2h→240、20h→截 8h、時鐘倒退→0 |
| **v1.3** 四方向動畫表 `drawDirSheet`／`assetDef(..., {rows})` | ✅ | 4×4 表解析正確、四方向都畫得出來 |
| **v1.3** 繪製節流 `Loop.renderRate` / `renderPaused` / `watchVisibility` | ✅ | 10 fps 模式 1.2 秒畫 11 次，模擬照跑 |
| **v1.3** 固定邏輯尺寸版面 `Display.fit`（小卡片／桌寵） | ✅ | v13 demo 480×270 卡片 |
| **v1.3** 音量 `Sfx.setMaster` / `Sfx.mute` | ✅ | 靜音時 gain 歸零 |
| **v1.3** 單檔打包 `tools/pack.py` → `engine/dist/tiny-engine.js` | ✅ | 73.5KB、`node --check`、`--check` 同步 |
| 除錯 overlay `F3`（fps/ms/自訂資訊/碰撞框） | ✅ | 各 demo |
| `tools/serve.py`（自動挑埠、QR、`/ws` 中繼、no-store） | ✅ | 兩個專案共用 |
| `tools/new_project.py`（一行開新專案） | ✅ | 產生的專案實跑 |
| `tools/shot.py` / `soak.py` / `bench.py` / `nettest.py` | ✅ | 全部 exit code 正確 |
| GitHub Actions CI | ✅ | https://github.com/iiiplay/tiny-engine/actions |

## 效能（Chromium headless，`tools/bench.py`）

| 案例 | fps | render | 最大帧 | 同屏 |
|---|---|---|---|---|
| 1600×1200 / 100 隻 | 60 | 0.20 ms | ~23 ms | 16/100 |
| 2400×1600 / 200 隻 | 60 | 0.20 ms | ~24 ms | 11/200 |
| 2400×1600 / 200（關剔除） | 60 | 0.30 ms | ~25 ms | 200/200 |
| 3200×2000 / 400 隻 | 60 | 0.10 ms | ~25 ms | 15/400 |

> 最大帧 ~25ms 只出現在**第一帧**（A\* 建圖 + 首次配置），穩定後 60fps。

## 常用指令

```bash
python tools/serve.py                 # 起伺服器（自動挑埠 + QR）
python tools/shot.py  <url>           # 冒煙測試（有 console 錯誤就 exit 1）
python tools/v13.py   <url>           # v1.3 驗收（Scene/UI/離線/節流/成本）
python tools/pack.py                  # 合成單檔 engine/dist/tiny-engine.js
python tools/soak.py 20 <url>         # 亂走 20 秒
python tools/bench.py <url>/bench.html # 效能（fps < 45 失敗）
python tools/nettest.py <url>/net.html # 區網兩人
python tools/new_project.py ../新遊戲  # 開新專案（引擎 + demo 骨架 + serve.py）
python demo/tools/make_art.py         # 重新產生 demo 精靈
python demo/tools/make_audio.py       # 重新產生音效 + BGM
```

## 還沒做（v1.3 候選）

1. **音樂與音效的混音控制**（目前只有 `musicGain` / `clipGain`，沒有音量選單）
2. **場景／房間系統**（目前狀態機由遊戲自己寫；可抽成 `Scene` 管理器）
3. **關卡資料格式**（JSON）＋ 簡易編輯器（`?edit=1`）
4. **打包**：把 13 支檔案合成一支 `tiny-engine.js`（給不想管載入順序的人）
5. **rollback netcode**（固定時間步已經有了，缺輸入預測）

## 已知限制

- 3D／等角／骨骼動畫／shader → 不做
- 物理只有 AABB（沒有旋轉、斜坡、關節）
- 沒有視覺化編輯器、沒有通用腳本語言
- 區網只支援 2 人

## 相關專案

- **tiny-arena**（第一款遊戲，使用本引擎的 submodule）：https://github.com/iiiplay/tiny-arena
