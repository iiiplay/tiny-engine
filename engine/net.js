'use strict';
/* ============================================================
   net.js — 區網連線對戰（1 房主 + 最多 3 加入端＝4 人，支援斷線自動重連）
   ・用 tools/serve.py 內建的 WebSocket 中繼（/ws?room=CODE&role=host|peer&cid=ID）
   ・模型：房主跑完整模擬（權威），加入端只送操作 + 畫房主送來的狀態
   ・v1.9：支援最多 4 人（Host + Peer 1..3，Net.peers[1..3]；Net.remote = Net.peers[1] 相容 2 人）、
           斷線自動重連（autoReconnect / clientId 保留原座位）、Net.create() 多實例
   ============================================================ */

const Net = {
  _makeRemoteSlot(id) {
    return {
      id: id || 1,
      connected: false,
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
        this.connected = true;
        this.axis = msg.m || { x: 0, y: 0, mag: 0 };
        this.down = msg.d || {};
        const p = msg.p || {};
        for (const k in p) if (p[k]) this.pressed[k] = true;
      },
      reset() {
        this.connected = false;
        this.axis = { x: 0, y: 0, mag: 0 };
        this.down = {};
        this.pressed = {};
      },
    };
  },
  ws: null,
  role: null,          // 'host' | 'peer'
  room: '',
  peerId: 0,           // host = 0；peer = 1, 2, 3（對應 P2, P3, P4）
  maxPeers: 3,         // 最多 3 個加入端（共 4 人）
  clientId: '',        // 斷線重連識別碼（確保重連拿回同一個 peerId）
  active: false,
  ready: false,
  isHost: false,
  isPeer: false,
  status: 'idle',      // idle | connecting | waiting | playing | reconnecting | closed | error
  errMsg: '',
  sendT: 0,
  latch: {},           // 加入端：把 justPressed 鎖住，避免送出間隔漏掉
  snap: null,
  snapAge: 0,
  snapCount: 0,
  lastRecv: 0,
  sentCount: 0,
  connectedPeers: [],  // 目前連線中的 peerId 陣列，例 [1, 2]

  /* 斷線自動重連設定（v1.9） */
  autoReconnect: false,
  maxRetries: 5,
  retryDelay: 0.6,     // 秒
  retryCount: 0,
  reconnectedCount: 0,
  _manualClose: false,
  _retryTimer: null,

  /* 加入端 → 房主的輸入（peers[1..3]；remote 指向 peers[1] 保持 100% 向下相容） */
  peers: null,
  remote: null,

  _initPeers() {
    this.peers = {
      1: this._makeRemoteSlot(1),
      2: this._makeRemoteSlot(2),
      3: this._makeRemoteSlot(3),
    };
    this.remote = this.peers[1];
    this.connectedPeers = [];
    if (!this.clientId) {
      this.clientId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID() : 'c_' + this.makeCode() + '_' + Math.random().toString(36).slice(2);
    }
    return this;
  },

  /* 產生獨立的 Net 實例（同頁多連線測試或分割畫面用） */
  create() {
    const n = Object.create(Net);
    n.ws = null;
    n.role = null;
    n.room = '';
    n.peerId = 0;
    n.clientId = '';
    n.active = false;
    n.ready = false;
    n.isHost = false;
    n.isPeer = false;
    n.status = 'idle';
    n.errMsg = '';
    n.sendT = 0;
    n.latch = {};
    n.snap = null;
    n.snapAge = 0;
    n.snapCount = 0;
    n.lastRecv = 0;
    n.sentCount = 0;
    n.retryCount = 0;
    n.reconnectedCount = 0;
    n._manualClose = false;
    n._retryTimer = null;
    n._initPeers();
    return n;
  },

  /* 取得指定加入端（1..3）的輸入狀態 */
  peer(id) {
    if (!this.peers) this._initPeers();
    return this.peers[id || 1] || this.peers[1];
  },

  /* 清空所有加入端的單帧按鍵（房主每帧結束時可呼叫） */
  clearAllPressed() {
    if (!this.peers) return;
    for (const k in this.peers) this.peers[k].clearPressed();
  },

  /* 目前房間總人數（含房主，1 ~ 4） */
  playerCount() {
    if (!this.active) return 0;
    return 1 + (this.connectedPeers ? this.connectedPeers.length : 0);
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
  connect(role, room, opt) {
    opt = opt || {};
    if (!this.peers) this._initPeers();
    if (!opt._isRetry) {
      this.close();
      this.retryCount = 0;
      if (opt.autoReconnect != null) this.autoReconnect = !!opt.autoReconnect;
    }
    this._manualClose = false;
    this.role = role;
    this.room = room;
    this.isHost = role === 'host';
    this.isPeer = role === 'peer';
    if (this.isHost) this.peerId = 0;
    this.status = opt._isRetry ? 'reconnecting' : 'connecting';
    this.errMsg = '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&role=${role}&cid=${encodeURIComponent(this.clientId)}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.status = 'error'; this.errMsg = '無法建立連線'; return; }
    this.ws = ws;
    this.active = true;

    ws.onopen = () => {
      this.status = 'waiting';
    };
    ws.onerror = () => {
      if (!this.autoReconnect || this.retryCount >= this.maxRetries) {
        this.status = 'error';
        this.errMsg = '連不上伺服器（要用 python tools/serve.py 開啟，不能直接雙擊檔案）';
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ready = false;
      if (!this._manualClose && this.autoReconnect && this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.status = 'reconnecting';
        clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => {
          if (!this._manualClose && this.room && this.role) {
            this.connect(this.role, this.room, { _isRetry: true });
          }
        }, Math.round(this.retryDelay * 1000));
        return;
      }
      if (this.status !== 'error') this.status = 'closed';
      if (this.onDrop) this.onDrop('closed');
    };
    ws.onmessage = (ev) => { if (this.ws === ws) this.onMessage(ev.data); };
  },

  /* 手動立即重連 */
  reconnect() {
    if (!this.role || !this.room) return false;
    clearTimeout(this._retryTimer);
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.close(); } catch (e) {}
    }
    this.connect(this.role, this.room, { _isRetry: true });
    return true;
  },

  /* 模擬網路瞬斷（測試自動重連用） */
  simulateDrop() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  },

  close() {
    this._manualClose = true;
    clearTimeout(this._retryTimer);
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.close(); } catch (e) {}
    }
    this.active = false;
    this.ready = false;
    this.status = 'idle';
    this.snap = null;
    this.connectedPeers = [];
    if (this.peers) {
      for (const k in this.peers) this.peers[k].reset();
    }
  },

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    }
  },

  _syncPeerList(list) {
    if (!Array.isArray(list)) return;
    this.connectedPeers = list.slice();
    if (this.peers) {
      for (const k in this.peers) {
        this.peers[k].connected = this.connectedPeers.indexOf(Number(k)) >= 0;
      }
    }
  },

  onMessage(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'sys') {
      if (m.peers) this._syncPeerList(m.peers);
      if (m.msg === 'assigned') {
        this.peerId = m.peerId || 1;
        if (m.reconnected) {
          this.reconnectedCount++;
          if (this.onReconnect) this.onReconnect(this.peerId);
        }
        return;
      }
      if (m.msg === 'room-full') {
        this._manualClose = true;
        this.status = 'error';
        this.errMsg = '房間已滿（上限 4 人）';
        if (this.onDrop) this.onDrop('room-full');
        return;
      }
      if (m.msg === 'room-ready') {
        this.retryCount = 0;
        if (m.peerId && this.isPeer) this.peerId = m.peerId;
        this.ready = true;
        this.status = 'playing';
        if (this.onReady) this.onReady(m.peerId || 1);
        if (this.isPeer) this.send({ t: 'need', id: this.peerId || 1 });     // 立刻要一份狀態
      }
      if (m.msg === 'peer-joined') {
        const pid = m.peerId || 1;
        if (this.connectedPeers.indexOf(pid) < 0) this.connectedPeers.push(pid);
        if (this.peers && this.peers[pid]) this.peers[pid].connected = true;
        this.ready = true;
        this.status = 'playing';
        if (m.reconnected) {
          this.reconnectedCount++;
          if (this.onReconnect) this.onReconnect(pid);
        }
        if (this.onReady) this.onReady(pid);
      }
      if (m.msg === 'peer-left') {
        const pid = m.peerId || 1;
        if (m.role === 'host') {
          this.ready = false;
          this.snap = null;
          if (this.onDrop) this.onDrop('peer-left', 0);
        } else {
          if (!m.peers) {
            this.connectedPeers = this.connectedPeers.filter(x => x !== pid);
          }
          if (this.peers && this.peers[pid]) this.peers[pid].reset();
          this.ready = this.connectedPeers.length > 0;
          if (!this.ready) this.snap = null;
          if (this.onDrop) this.onDrop('peer-left', pid);
        }
      }
      return;
    }

    if (m.t === 'hello') {
      this.hostH = m.h;
      if (this.onHello) this.onHello(m);
      return;
    }

    if (m.t === 'i' && this.isHost) {
      const pid = m.id || 1;
      if (Number.isInteger(pid) && pid >= 1 && pid <= 3) this.peer(pid).set(m);
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
  onDrop: null,              // 對方離線：(reason, peerId) => {}
  onReady: null,             // 連上：(peerId) => {}
  onReconnect: null,         // 斷線後重連成功：(peerId) => {}
  onHello: null,             // 加入端收到房主的 hello

  /* ---------- 加入端：送操作 ---------- */
  /* 通用：把「這一帧的按鍵狀態」整包送出去（動作名稱由遊戲自己定義，帶上自己的 peerId） */
  sendInput(customInput) {
    const src = customInput || (typeof Input !== 'undefined' ? Input : null);
    const mv = src && src.moveAxis ? src.moveAxis() : { x: 0, y: 0, mag: 0 };
    this.send({
      t: 'i',
      id: this.peerId || 1,
      m: { x: Math.round(mv.x * 100) / 100, y: Math.round(mv.y * 100) / 100, mag: Math.round(mv.mag * 100) / 100 },
      d: (src && src.down) || {},
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
      if (typeof Input !== 'undefined' && Input.pressed) {
        for (const a in Input.pressed) if (Input.pressed[a]) this.latch[a] = 1;
      }
      if (this.sendT > 0.025) {          // 40Hz 送操作
        this.sendT = 0;
        this.sendInput();
      }
      if (this.snap) this.snapAge += dt;
    }
  },
};

Net._initPeers();
