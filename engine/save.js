'use strict';
/* ============================================================
   engine/save.js — 存檔與排行榜（localStorage）
   ・Save.get / set / del / reset：任何 JSON 可存的值
   ・Save.addScore / Save.scores：排行榜（自動排序、去重上限）
   ・沒有 localStorage（無痕模式）時安靜地失敗，不會炸
   ============================================================ */

const Save = {
  ns: 'tinyengine',
  available: (() => {
    try {
      const k = '__te__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })(),

  key(k) { return this.ns + ':' + k; },

  get(k, def) {
    if (!this.available) return def;
    try {
      const v = localStorage.getItem(this.key(k));
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },

  set(k, v) {
    if (!this.available) return false;
    try { localStorage.setItem(this.key(k), JSON.stringify(v)); return true; }
    catch (e) { return false; }
  },

  del(k) {
    if (!this.available) return;
    try { localStorage.removeItem(this.key(k)); } catch (e) {}
  },

  /* 清掉這個 namespace 的所有資料 */
  reset() {
    if (!this.available) return;
    try {
      const pre = this.key('');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.indexOf(pre) === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
  },

  /* ---- 排行榜 ---- */
  scores(board, max) {
    return this.get('board:' + board, []).slice(0, max || 10);
  },

  /* 回傳 { rank, best, isRecord }（rank 從 1 開始，沒進榜為 0） */
  addScore(board, score, opt) {
    opt = opt || {};
    const max = opt.max || 10;
    const entry = Object.assign({ score, at: Date.now() }, opt.meta || {});
    const list = this.get('board:' + board, []);
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, max);
    this.set('board:' + board, top);
    const idx = top.indexOf(entry);
    return { rank: idx < 0 ? 0 : idx + 1, best: top[0] ? top[0].score : score, isRecord: idx === 0, list: top };
  },
};
