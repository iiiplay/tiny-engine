# tiny-engine — 目前狀態（給下次接手的人 / 給 AI 讀）

> 最後更新：2026-11-02　版本：**v1.9.0 候選**（本機功能分支，待獨立驗收與核准合併）　repo：https://github.com/iiiplay/tiny-engine （private）

v1.9 功能、使用方式與相容性見 `CHANGELOG.md` 及 `docs/v19-compatibility.md`；以下保留 v1.8.1 歷史記錄。

## v1.8.1 穩定性整理

- 新增 `/demo/slot.html`（翠光秘庫）：5×3／20 線遊戲幣 Slot、7 張 PNG、Wild／Scatter、免費旋轉、下注、自動 10 局、音效與 FPS。純規則測試含 10,000 局金額守恆，瀏覽器驗收涵蓋重整恢復及防重複派彩。

- 新增可玩展示 `/demo/playground.html`（光種森林）：玩家移動／衝刺／揮劍、8 顆光種、24／80／160 生物，以及即時 FPS 與耗時；`tools/playground.py` 驗證桌面與手機完整操作。
- 展示已換用現有 PNG Sprite：主角四方向 6 格待機／走路／攻擊、史萊姆待機／移動、場景與拾取物；來源與使用範圍見 `demo/assets/forest-sprites/CREDITS.md`。

- 修正固定時間步漏鍵／重複觸發、同方向多鍵互相取消、失焦殘留按鍵及鍵盤／觸控共用狀態。
- 背景補跑保留 60ms 經過時間；變動時間步每步最多 50ms、每次最多 `maxSteps` 步，接納時間上限 `maxDelta=0.25` 秒。
- 主 demo 補畫觸控搖桿；新增 `tools/runtime.py` 驗證桌面／手機操作及搖桿像素。
- CI 接齊 v13～v16、11 項 Node 回歸與錯誤注入測試；v16 不再依賴相鄰 tiny-keep。
- 相容性：API 沿用；`Input.justPressed()` 應在 update 讀取，現在於每次邏輯更新後消耗。
- 長時間停頓仍刻意丟棄超額時間；不保證瀏覽器背景節流時完整追趕現實時間。

本機驗證：主 demo、v13～v16、雙端連線、20 秒 soak 通過；四組 benchmark 為 60 FPS。
桌面 1280×720／手機 375×667 以 Playwright Chromium 驗證，未實測手機硬體。

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
| 引擎 18 模組（含 Scene／Grid／Level／Edit／TE） | ✅ | `node --check` + demo 實跑 |
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
| **v1.3.1** `Save.migrate` 升級後寫回（desktop-hero 接入時發現） | ✅ | v1 存檔 → 版本變 2、資料正確 |
| **v1.4** 圖形變形 `drawSprite` + `flipX`/`flipY`/`rot`/`pivot` | ✅ | `tools/v14.py` 26 項像素級檢查全過 |
| **v1.4** `drawSheet`/`drawDirSheet`/`drawCrop` 都吃變形參數（包裝同一支 `drawSprite`） | ✅ | 同上；不變形時仍是一次 `drawImage` |
| **v1.4** 文件 `docs/api-sprite.md`（參數／軸心語意／90° 佔位互換範例） | ✅ | README / engine/README 互連 |
| **v1.5** 格子世界 `grid.js`（碰撞 / BFS 距離場 / 下坡走位 / 多世界） | ✅ | `tools/v15.py` 39 項 |
| **v1.5** 逐格動畫 `frameOf` / `drawFrames` + manifest 吃純路徑 | ✅ | 同上（像素比對） |
| **v1.5** `Camera.setView` + `Camera.push/pop`（世界捲動 + HUD 不動） | ✅ | 同上（transform 比對） |
| **v1.5** `Scene.syncState`（切場景同步 `G.state`） | ✅ | 同上 |
| **v1.5** 文件 `docs/api-grid.md`（碰撞保證／距離場／3 個範例／效能） | ✅ | README 互連 |
| **v1.5.1** `sheetOf` 快取改成 `src|frames|fw|rows|fh`（同一張圖多種切法不再互相蓋掉） | ✅ | `tools/v15.py` 48 項 |
| **v1.6** JSON 關卡 `Level`（兩種格式／驗證／`grid()`／`connected()`／物件） | ✅ | `tools/v16.py` 30 項 |
| **v1.6** 畫格編輯器 `Edit`（塗格／換色／右鍵擦／拖曳／Ctrl+Z／存檔） | ✅ | 同上（真滑鼠事件） |
| **v1.6** 素材工具 `gen_manifest.py`（自動算 frames／foot、逐格動畫合併） | ✅ | 同上（真實素材 + `node --check`） |
| **v1.6** 撞名檢查 `globals.py` + `TE` 命名空間（50 個保留名稱） | ✅ | 同上（`--check` 對 tiny-keep 乾淨） |
| **v1.7** `LevelLib` 關卡碼（encode/decode）＋ localStorage 關卡庫 | ✅ | `tools/v16.py` 52 項 |
| **v1.7.1** `Edit` 標記（入口/出口寫進 meta）＋關卡碼帶 entry/exit | ✅ | 同上 |
| **v1.8** `Edit` 物件層（`objectTypes` → `Level.objects`） | ✅ | `tools/v16.py` 55 項 |
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
python tools/v14.py   <url>           # v1.4 驗收（翻轉／旋轉／軸心，26 項像素檢查）
python tools/v15.py   <url>           # v1.5 驗收（格子碰撞／BFS／逐格動畫／Camera）
python tools/v16.py   <url>           # v1.6 驗收（JSON 關卡／編輯器／命名空間／工具）
python tools/gen_manifest.py <dir>    # 掃素材 → manifest.js
python tools/globals.py <game> --check # 撞名檢查
python tools/pack.py                  # 合成單檔 engine/dist/tiny-engine.js
python tools/soak.py 20 <url>         # 亂走 20 秒
python tools/bench.py <url>/bench.html # 效能（fps < 45 失敗）
python tools/nettest.py <url>/net.html # 區網兩人
python tools/new_project.py ../新遊戲  # 開新專案（引擎 + demo 骨架 + serve.py）
python demo/tools/make_art.py         # 重新產生 demo 精靈
python demo/tools/make_audio.py       # 重新產生音效 + BGM
```

## 還沒做（v1.6 之後的候選）

1. **混音音量選單**（`Sfx.setMaster` 有了，缺 UI 元件）
2. **BGM 管理**（歌單／淡入淡出；`loadMusic` 有了，缺素材與排程）
3. **`Net` 支援 4 人／重連**（現在硬性 2 人、房主權威）
4. **`Grid` 的加權 A\***（地形有成本）＋轉角成本
5. **編輯器的物件層**（現在只塗格子；`Level.objects` 有資料但 `Edit` 還沒畫/放）
6. **關卡選單 UI**（`Level`／`LevelLib` 都有，選單由各遊戲自己畫；tiny-keep 已示範）

## 已知限制

- 3D／等角／骨骼動畫／shader → 不做
- 物理只有 AABB（沒有旋轉、斜坡、關節）
- 圖形變形只有**鏡像 + 任意角度旋轉**；非 90° 倍數在像素風格下會糊（引擎不阻擋，文件有警告）
- 沒有視覺化編輯器、沒有通用腳本語言
- 區網只支援 2 人

## 相關專案

- **tiny-arena**（第一款遊戲，使用本引擎的 submodule）：https://github.com/iiiplay/tiny-arena
