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

素材為團隊原創，著作權屬 iiiplay，與程式碼同樣以 MIT 授權釋出，全文見根目錄 `LICENSE`。
