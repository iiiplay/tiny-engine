# 圖形變形 API — `drawSprite` / `flipX` / `flipY` / `rot` / `pivot`

> tiny-engine **v1.4.0** 起提供。實作在 `engine/assets.js`、`engine/sprite.js`。
> 驗收頁：`demo/v14.html`；測試：`python tools/v14.py`（26 項像素級檢查）。

## 為什麼要有這支

v1.3 以前，引擎只會 `ctx.drawImage` —— 角色朝向靠**素材本身的四方向圖**，
**沒有任何翻轉或旋轉能力**。要做「沙發換邊靠牆」「地毯轉 90°」就得在遊戲裡自己寫
`ctx.save/translate/rotate/restore`，每款遊戲重寫一次、也容易寫錯軸心。

v1.4 把這件事收進引擎：**所有繪製都走同一支 `drawSprite()`**，
`drawSheet` / `drawDirSheet` / `drawCrop` 的 `opt` 都多了 `flipX` / `flipY` / `rot` / `pivot`。

---

## 一分鐘上手

```js
// 1) 角色：左右鏡像（素材只有一種朝向時很好用）
drawSheet(hero, frame, x, y, { flipX: facingLeft });

// 2) 四方向動畫表：用「左走」那列當「右走」
drawDirSheet(heroSheet, 'left', frame, x, y, { flipX: true });

// 3) 地毯轉 90°（繞圖框中心）
drawSprite(carpetImg, sx, sy, sw, sh, dx, dy, sw, sh, { rot: Math.PI / 2 });

// 4) 繞指定軸心轉（例如把手繞底座）
drawSprite(handle, sx, sy, sw, sh, dx, dy, sw, sh, { rot: t, pivot: { x: baseX, y: baseY } });
```

---

## `drawSprite(img, sx, sy, sw, sh, dx, dy, dw, dh, opt)`

最底層的「畫一塊圖」。其他函式都是它的包裝，所以變形行為**全引擎只有一份實作**。

| 參數 | 說明 |
|---|---|
| `img` | `Image` 或 `canvas`（`null` 直接 return，不會丟錯） |
| `sx, sy, sw, sh` | 來源圖要裁的範圍（像素） |
| `dx, dy` | 目標矩形**左上角**（這是「未變形前」的位置） |
| `dw, dh` | 目標寬高；省略 = `sw` / `sh` |
| `opt` | 見下表，可省略 |

`opt`：

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `flipX` | bool | `false` | 左右鏡像（以軸心為鏡面） |
| `flipY` | bool | `false` | 上下顛倒（以軸心為鏡面） |
| `rot` | number | `0` | 旋轉弧度，**順時針**；`Math.PI / 2` = 轉 90° |
| `pivot` | `{x, y}` \| `'center'` | `'center'` | 旋轉／鏡像的軸心。「絕對座標」＝**目前 transform 底下的座標**（通常就是邏輯像素座標） |
| `alpha` | number | `undefined` | `0~1`。沒給就不碰 `globalAlpha`（見下方注意事項） |
| `target` | `CanvasRenderingContext2D` | `G.ctx` | 要畫到哪個畫布（離屏預覽、小地圖很好用） |

### 軸心（pivot）是重點

```
pivot 預設 = 目標矩形的中心
   ┌──────────┐
   │          │
   │     ●────┼──  ← 以這裡為軸翻／轉，矩形本身「不會位移」
   │          │
   └──────────┘
```

- 鏡像時矩形範圍不變 → **不會出現「翻了之後跑掉半格」**。
- 90°／270° 旋轉時，若矩形不是正方形，**內容會超出你給的矩形**（長寬互換），
  但「中心點」仍然鎖在原本矩形的中心 → 需要互換框的時候，見下面「家具轉 90°」範例。
- 想繞「腳底」「門軸」「把手」等特定點轉：給 `pivot: { x, y }`（絕對座標）。

---

## 其他繪製函式

### `drawSheet(sheet, frame, x, y, opt, ctx)`

`(x, y)` 是**腳底中心**（跟以前一樣），`opt` 多了：

```js
drawSheet(sheet, 0, x, y, {
  scale: 2,
  flipX: true,          // 左右鏡像
  flipY: false,         // 上下顛倒
  rot: 0,               // 弧度（預設繞「圖框中心」，所以腳底線不會跑掉）
  pivot: { x, y },      // 想繞腳底轉就給這個（覆寫預設）
  alpha: 0.5,
});
```

> 預設軸心刻意選「圖框中心」而不是腳底：繞腳底轉 180° 會讓角色整個沉到地板下面。

### `drawDirSheet(sheet, dir, frame, x, y, opt)`

四方向動畫表，`opt` 同上（`target` 也在 `opt` 裡）。常見用法：

```js
// 素材只畫了「面向左」，要顯示「面向右」→ 直接鏡像
drawDirSheet(hero, 'left', f, x, y, { flipX: true });

// 被吹飛、翻滾之類的效果
drawDirSheet(hero, 'down', f, x, y, { rot: spin, pivot: { x, y: y - 8 } });
```

### `drawCrop(def, sx, sy, sw, sh, dx, dy, alpha, target, opt)`

從 tileset 裁一塊 prefab 貼圖（`dx, dy` 會四捨五入，像素對齊）。
`opt` 同 `drawSprite`，**預設繞矩形中心**。

```js
drawCrop(tiles, 0, 0, 16, 16, x, y, 0.5, null, { flipX: true });
```

### `new Sprite(fps, loop).draw(x, y, opt)`

只是把 `opt` 原封不動傳給 `drawSheet`，所以 `.draw()` 一樣吃 `flipX / rot / pivot`。

---

## 範例：家具佔用格子會互換的 90° 旋轉

這是「擺設類遊戲」最常踩的坑：旋轉後**佔的格數**要跟著換（`3 寬 × 2 深` → `2 寬 × 3 深`）。

```js
const T = 16;                        // 一格 16px
const cellW = 3, cellH = 2;          // 素材原始佔用（未轉）
const r = 1;                         // 轉 90°（0~3）
const odd = r % 2 === 1;
const sp = odd ? { w: cellH, h: cellW } : { w: cellW, h: cellH };  // 實際佔用

const boxX = x + 0, boxY = y + 0;                       // 這件家具「實際佔用」的左上角
const cenX = boxX + sp.w * T / 2;                       // 兩種朝向共用同一個中心
const cenY = boxY + sp.h * T / 2;
const bw = cellW * T, bh = cellH * T;                   // 未轉的框（旋轉前）

drawSprite(img, sx, sy, sw, sh,
  Math.round(cenX - bw / 2),                            // 未轉框的左上角
  Math.round(cenY + bh / 2 - sh),                       // 貼齊未轉框的底邊
  sw, sh, {
    rot: r * Math.PI / 2,
    pivot: { x: cenX, y: cenY },
    flipX: mirrored,
  });
```

判定「可不可以放」時也必須用 `sp.w` / `sp.h`，不要用素材原始的 `cellW / cellH`。

---

## 像素遊戲注意事項

1. **只有 90° 的倍數不會糊**。引擎已設 `imageSmoothingEnabled = false`，
   但 `rot: 0.3` 這種角度在低解析度下仍然是「扭過去的馬賽克」——像素遊戲請用
   `0 / PI/2 / PI / 3PI/2`。
2. **座標盡量整數**。變形前把 `dx, dy` 取整（`Math.round`）可以避免半像素縫。
   90° 旋轉 + 整數座標時，輸出仍然是硬邊像素（`tools/v14.py` 的 D 案例就在驗這個）。
3. **影子和本體要分開畫**。影子通常是橢圓、不該跟著轉，畫在本體之前即可。
4. **深度排序用「實際佔用」的底邊**：`y + sp.h * T`，不是素材高度。
5. **8 種朝向**：`rot`（0~3）× `flipX`（左右）＝ 8 種；`flipX + flipY` 等於 `rot: PI`
   （測試 E 就是驗這件事），所以不需要再另外存「轉 180°」的狀態。
6. **素材限制才是真正的限制**。3/4 俯視的沙發／床轉 90° 會變成「躺著的沙發」——
   那是美術問題，不是引擎問題。俯視圖（地毯、地板貼片、光暈）才適合 90° 旋轉。

---

## 效能

| 情況 | 成本 |
|---|---|
| 不翻不轉（預設） | 和以前完全一樣：一次 `drawImage`，**沒有多餘的 state 切換** |
| 有翻／有轉 | 多一次 `save/translate/rotate/scale/restore`；Canvas 2D 下等同一次變換矩陣乘法 |

實測（v1.4 驗收頁）：同時畫 6 個變形方塊 + 一個每帧旋轉的方塊仍跑滿 60fps；
`tools/bench.py` 的 200 單位壓力測試沒有變化（變形只在需要時才進 `save/restore`）。

如果同一個 sprite 每帧都用**同一個**翻轉／旋轉，不必快取：上面的成本已經是可忽略等級。
真正貴的是「每帧重建 Image／canvas」，那和這支 API 無關。

---

## 注意事項（行為細節）

- `alpha` 是**方便的捷徑**：給了就設 `globalAlpha`、畫完設回 `1`。
  如果你在外層自己用 `ctx.globalAlpha` 疊透明度，**不要**再用 `opt.alpha`
  （會被覆蓋成 1）；直接讓外層的 `globalAlpha` 生效即可（本函式不會碰它）。
- `pivot` 是**絕對座標**，不是相對矩形的比例。`pivot: 'center'` 等於不給。
- `img` 是 `null`、`sheet` 是 `null`、`drawCrop` 給了不存在的圖 → 全部安靜 return，
  不會丟錯（測試 K）。
- 本 API **不改動你的 transform**：`save()/restore()` 成對，呼叫前後 `ctx` 的
  平移／縮放狀態不變（`Camera` 開著也安全）。

---

## 驗收與版本

| 版本 | 內容 |
|---|---|
| **v1.4.0** | 新增 `drawSprite()`；`drawSheet` / `drawDirSheet` / `drawCrop` 支援 `flipX` / `flipY` / `rot` / `pivot`；`demo/v14.html` + `tools/v14.py`（26 項像素級驗收） |

```bash
python tools/serve.py                                   # → http://localhost:8766/demo/v14.html
python tools/v14.py http://localhost:8766/demo/v14.html  # 26 項全過才 PASS
python tools/pack.py --check                            # dist 是否最新（CI 用）
```

第一個採用者：**tiny-home**（家具 ⇄ / ⇅ / ⟳ 90°，地毯類支援四向旋轉）。
