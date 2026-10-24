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

  /* ---- 離線收益（掛機／陪伴類遊戲用） ----
     用法：每分鐘存一次進度，回來時問「我不在的時候賺了多少」
       Save.offline('idle', { hours: 8, rate: 120 })   // rate = 每小時產量
       → { seconds, hours, gain, capped, first, away }
     ・第一次呼叫只記錄時間，回傳 first=true、gain=0
     ・時鐘往回撥（或換電腦）不會給負數，一律當 0
     ・rate 也可以傳函式 (seconds) => gain，自己算倍率
     ※ 只動 localStorage 的 `<key>:ts`，不會覆蓋你的存檔內容。 */
  offline(key, opt) {
    opt = opt || {};
    const now = Date.now();
    const tsKey = key + ':ts';
    const last = this.get(tsKey, 0);
    const capH = opt.hours != null ? opt.hours : 8;
    this.set(tsKey, now);
    if (!last) return { seconds: 0, hours: 0, gain: 0, capped: false, first: true, away: 0 };
    let sec = (now - last) / 1000;
    if (!isFinite(sec) || sec < 0) sec = 0;          // 時鐘倒退 → 當 0
    const away = sec;
    const capped = sec > capH * 3600;
    if (capped) sec = capH * 3600;
    const gain = typeof opt.rate === 'function'
      ? opt.rate(sec)
      : (opt.rate || 0) * (sec / 3600);
    return { seconds: Math.round(sec), hours: sec / 3600, gain, capped, first: false, away: Math.round(away) };
  },

  /* 存檔版本升級：migrations = { 0: (data)=>…, 1: … }（key 是「舊版號」）
     回傳升級後的資料；沒有存檔時回傳 def。 */
  migrate(key, version, migrations, def) {
    const raw = this.get(key, null);
    if (!raw) return def === undefined ? null : def;
    let v = raw.version != null ? raw.version : (raw.v != null ? raw.v : 0);
    let data = raw;
    let guard = 0;
    while (v < version && guard++ < 50) {
      const fn = migrations && migrations[v];
      if (!fn) break;
      const out = fn(data);
      if (out) data = out;
      v = (data.version != null) ? data.version : v + 1;
      data.version = v;
    }
    data.version = v;
    data.v = v;
    return data;
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
