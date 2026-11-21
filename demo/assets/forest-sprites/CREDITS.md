# 光種森林 Sprite 素材

本資料夾 31 張 PNG 全部是本專案團隊原創，2026-11-21 以 Python／Pillow 程式逐像素繪製。沒有描摹、換色或取用任何第三方素材包，也沒有使用 AI 生圖結果當像素來源。

| 檔案 | 產生腳本（`demo/tools/art-src/`） |
|---|---|
| `hero-idle-*`、`hero-walk-*`、`hero-attack-*`（12 張，四方向 6 格） | `forest-hero-slime-dir4-r3-source.py` |
| `slime-idle-0..5`、`slime-run-0..5`（12 檔，5 個獨特畫面） | `slime-r4-source.py` |
| `tree`、`rock`、`bush`、`grass`、`flower`、`seed`、`dirt` | `props-slot-r2-source.py` |

- 尺寸、格數與腳底錨點沿用原 demo 的引用規格（見 `demo/playground-assets.js`）。
- 這些腳本是保存下來的創作紀錄，輸出路徑寫死在原圖包的資料夾結構，在 repo 內不能直接重跑。

## 授權

著作權屬本 repo 擁有者（iiiplay）。素材授權與程式碼授權分開處理：根目錄 `LICENSE`（MIT）只涵蓋 `engine/` 與 `tools/` 的程式碼。素材要採用哪種授權，還待擁有者決定。
