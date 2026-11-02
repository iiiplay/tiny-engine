# v1.9 使用與相容性

此版基於 v1.8.1，參考 Gemini v1.9 後選擇與改寫。完整行為變更見 CHANGELOG 的「相容性」。

## 格子與關卡

```js
const g = Grid.create({cols: 8, rows: 6, costs: {2: 3}});
g.setTile(3, 2, 2); // tile 2 可走，移動成本 3
const path = g.findPath({cx:0, cy:0}, {cx:7, cy:5}, {diagonal:true, turnCost:0.5});
const field = g.weightedField({from:{cx:7, cy:5}});
const dir = g.downhill(field, 0, 0, {diagonal:true});
const grid = level.grid({costs: {2:3}});
const code = LevelLib.share(level); // 同步回傳關卡碼，支援時嘗試寫入剪貼簿
```

`findPath` 回傳不含起點的格子陣列，附 `totalCost` 與 `turns`；無路為空陣列。搜尋使用零啟發式，確保低於 1 的正成本也不高估。`weightedField` 回傳 `Float32Array`，不可達是 -1。地形 cost 對應非零 tile 才會改變原本的牆壁判定。`downhill` 對角線不能穿過相鄰牆角；舊遊戲如有依賴切角須調整地圖。

## 畫面、編輯器與聲音

`Display.fit(canvas,{w:220,h:130,smooth:true})` 開啟平滑；預設 false。`drawSprite` / `drawSheet` 的 `opt.smooth` 只影響本次繪圖。`Edit.undo()` 現同時還原 tiles、meta 和 objects；右鍵可移除點中的 marker，地圖與色盤之外的 pointerdown 交給遊戲。

```js
Sfx.addTracks({camp:'camp.ogg', boss:'boss.ogg'});
Sfx.playlist(['camp','boss'], {loop:true});
Sfx.crossfade('boss', 1);
Sfx.setSfx(.8); Sfx.setBgm(.5); Sfx.savePrefs();
// Loop.step 已呼叫 Sfx.update(dt)；自行驅動的程式須自行呼叫。
UI.slider('volume', 10, 20, 120, 12, .5, {onChange: v => Sfx.setBgm(v)});
```

舊 `setMusicVolume` 仍直接設定播放元素音量；新 `setBgm` 同時設定基準音量與播放音量。靜音解除時恢復最近音樂音量，不再固定恢復舊 `musicGain`。`UI.bind` 執行熱區 callback 後仍呼叫既有 `onAct`。詳見 `engine/audio.js` 和 `engine/ui.js` 的參數註解。

## 區網

`Net.connect('host', room)` 與 `Net.connect('peer', room)` 的舊用法仍可使用；房間最多一位房主、三位加入者。房主用 `Net.peer(1..3)` 取得個別輸入，`Net.remote` 保留 `peer(1)` 別名。`Net.create()` 可建立獨立實例；設定 `autoReconnect: true` 才啟用自動重連，例如 `Net.connect('peer', room, {autoReconnect:true})`。

新版 `tools/serve.py` 以伺服器指派的座位覆寫 peer 的 JSON `id`，並拒絕 peer 偽造 `sys` 訊息；clientId 只供座位續接，不是使用者身分驗證，連線也未加密。請只在可信的區域網路使用，不能將此機制當作公開服務的安全驗證。搭配舊版 relay 無法得到新版座位保護。

## 檢查

```sh
node --test
python tools/pack.py --check
python tools/nettest.py http://localhost:8766/demo/net.html
python tests/net-browser.py http://localhost:8766/demo/net.html
```

瀏覽器工具預設 headless。`net-browser.py` 需要先啟動自己的測試用 `tools/serve.py`，驗證四人、額滿、座位偽造與重連。未加入 Iso、Gemini demo、美術或其一次性腳本。
