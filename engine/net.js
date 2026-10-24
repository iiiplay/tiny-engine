'use strict';
/* ============================================================
   net.js — 區網連線對戰（一主機 + 一加入）
   ・用 tools/serve.py 內建的 WebSocket 中繼（/ws?room=CODE&role=host|peer）
   ・模型：房主跑完整模擬（權威），加入端只送操作 + 畫房主送來的狀態
   ・房主的邏輯高度 GAME_H 會傳給加入端，兩邊場地完全一致
   ============================================================ */

const Net = {
  ws: null,
  role: null,          // 'host' | 'peer'
  room: '',
  active: false,
  ready: false,
  isHost: false,
  isPeer: false,
  status: 'idle',      // idle | connecting | waiting | playing | closed | error
  errMsg: '',
  sendT: 0,
  latch: {},          // 加入端：把 justPressed 鎖住，避免送出間隔漏掉
  snap: null,
  snapAge: 0,
  snapCount: 0,
  lastRecv: 0,
  sentCount: 0,

  /* 加入端 → 房主的輸入 */
  remote: {
    axis: { x: 0, y: 0, mag: 0 },
    down: {},
    pressed: {},
    moveAxis() {
      const a = this.axis;
      return a.mag > 0.06 ? { x: a.x, y: a.y, mag: a.mag } : { x: 0, y: 0, mag: 0 };
    },
    isDown(a) { return !!this.down[a]; },
    justPressed(a) { return !!this.pressed[a]; },
    clearPressed() { this.pressed = {}; },
    set(msg) {
      this.axis = msg.m || { x: 0, y: 0, mag: 0 };
      this.down = msg.d || {};
      const p = msg.p || {};
      for (const k in p) if (p[k]) this.pressed[k] = true;
    },
  },

  /* 診斷列：?debug=1 或加入端超過 1.5 秒沒收到狀態 */
  debugOn() {
    return /[?&]debug=1/.test(location.search) || (this.isPeer && this.snapAge > 1.5);
  },

  /* 目前是否為「房主／加入端」 */
  get host() { return this.role === 'host'; },

  /* ---------- 房號 ---------- */
  makeCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0];
    return s;
  },

  /* ---------- 連線 ---------- */
  connect(role, room) {
    this.close();
    this.role = role;
    this.room = room;
    this.isHost = role === 'host';
    this.isPeer = role === 'peer';
    this.status = 'connecting';
    this.errMsg = '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&role=${role}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.status = 'error'; this.errMsg = '無法建立連線'; return; }
    this.ws = ws;
    this.active = true;

    ws.onopen = () => { this.status = 'waiting'; };
    ws.onerror = () => {
      this.status = 'error';
      this.errMsg = '連不上伺服器（要用 python tools/serve.py 開啟，不能直接雙擊檔案）';
    };
    ws.onclose = () => {
      if (this.status !== 'error') this.status = 'closed';
      this.ready = false;
      if (this.onDrop) this.onDrop('closed');
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
  },

  close() {
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.ws = null;
    this.active = false;
    this.ready = false;
    this.status = 'idle';
    this.snap = null;
  },

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    }
  },

  onMessage(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'sys') {
      if (m.msg === 'room-ready') {
        this.ready = true;
        if (this.onReady) this.onReady();
        if (this.isPeer) this.send({ t: 'need' });     // 立刻要一份狀態
      }
      if (m.msg === 'peer-joined') { this.ready = true; this.onReady(); }
      if (m.msg === 'peer-left') {
        this.ready = false;
        this.snap = null;
        if (this.onDrop) this.onDrop('peer-left');
      }
      return;
    }

    if (m.t === 'hello') {
      this.hostH = m.h;
      if (this.onHello) this.onHello(m);
      return;
    }

    if (m.t === 'i' && this.isHost) {
      this.remote.set(m);
      return;
    }

    if (m.t === 'need' && this.isHost) {
      if (this.produceSnapshot) this.send(this.produceSnapshot());
      return;
    }

    if (m.t === 'need') { /* 加入端的請求，忽略 */ return; }

    if (m.t === 's' && this.isPeer) {
      this.snap = m;
      this.snapAge = 0;
      this.snapCount += 1;
      this.lastRecv = performance.now();
      if (this.onSnapshot) this.onSnapshot(m);
      return;
    }

    if (m.t === 'bye') {
      this.ready = false;
      if (this.onDrop) this.onDrop('bye');
    }
  },

  /* ---- 以下是遊戲要接的鉤子 ---- */
  produceSnapshot: null,     // 房主：() => 要送出的物件
  onSnapshot: null,          // 加入端：(snap) => {}
  onDrop: null,              // 對方離線：(reason) => {}
  onReady: null,             // 兩端都連上
  onHello: null,             // 加入端收到房主的 hello

  /* ---------- 加入端：送操作 ---------- */
  /* 通用：把「這一帧的按鍵狀態」整包送出去（動作名稱由遊戲自己定義） */
  sendInput() {
    const mv = Input.moveAxis();
    this.send({
      t: 'i',
      m: { x: Math.round(mv.x * 100) / 100, y: Math.round(mv.y * 100) / 100, mag: Math.round(mv.mag * 100) / 100 },
      d: Input.down,
      p: this.latch,
    });
    this.latch = {};
  },

  /* ---------- 每帧 ---------- */
  update(dt) {
    if (!this.active) return;
    this.sendT += dt;
    if (this.isHost) {
      if (this.sendT > 0.033) {          // 30Hz 送狀態（只送給已連上的加入端）
        this.sendT = 0;
        if (this.ready && this.produceSnapshot) { this.send(this.produceSnapshot()); this.sentCount += 1; }
      }
    } else if (this.isPeer) {
      /* 每一帧都記下按鍵（justPressed 只存在 16ms，40Hz 送出會漏） */
      for (const a in Input.pressed) if (Input.pressed[a]) this.latch[a] = 1;
      if (this.sendT > 0.025) {          // 40Hz 送操作
        this.sendT = 0;
        this.sendInput();
      }
      if (this.snap) this.snapAge += dt;
    }
  },
};
