'use strict';
/* ============================================================
   engine/input.js — 鍵盤輸入 → 動作；8 方向移動向量
   ============================================================ */

const Input = {
  down: {},
  pressed: {},
  keyDown: {},   // 只有鍵盤按下的（觸控會參考它，避免互相覆蓋）
  touchAxis: null,

  /* 預設只給最共通的動作；遊戲用 Input.init(自己的 map) 覆寫/擴充 */
  defaultMap: {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Enter: 'confirm', Escape: 'cancel',
    F3: 'debug',
  },
  map: null,

  init(map) {
    this.map = Object.assign({}, this.defaultMap, map || {});
    addEventListener('keydown', (e) => {
      const a = this.map[e.code];
      if (!a) return;
      e.preventDefault();
      Sfx.unlock();
      if (!this.down[a]) this.pressed[a] = true;
      this.keyDown[a] = true;
      this.down[a] = true;
    });
    addEventListener('keyup', (e) => {
      const a = this.map[e.code];
      if (!a) return;
      e.preventDefault();
      this.keyDown[a] = false;
      this.down[a] = false;
    });
    addEventListener('blur', () => { this.down = {}; this.keyDown = {}; });
  },

  /* 取得這一帧的移動向量（鍵盤 8 方向 / 搖桿連續方向），長度 <= 1 */
  moveAxis() {
    const t = this.touchAxis;
    if (t && t.mag > 0.06) {
      return { x: t.x, y: t.y, mag: U.clamp(t.mag / 0.8, 0.25, 1) };
    }
    let x = 0, y = 0;
    if (this.down.left) x -= 1;
    if (this.down.right) x += 1;
    if (this.down.up) y -= 1;
    if (this.down.down) y += 1;
    if (!x && !y) return { x: 0, y: 0, mag: 0 };
    if (x && y) { const k = Math.SQRT1_2; x *= k; y *= k; }   // 對角線不加速
    return { x, y, mag: 1 };
  },

  isDown: (a) => !!Input.down[a],
  justPressed: (a) => !!Input.pressed[a],
  endFrame() { this.pressed = {}; },
};
