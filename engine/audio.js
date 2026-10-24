'use strict';
/* ============================================================
   engine/audio.js — WebAudio 即時合成（不需音檔）+ 音效註冊表
   ============================================================ */

const Sfx = {
  ctx: null,
  master: 0.5,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = this.master;
        this.gain.connect(this.ctx.destination);
      } catch (e) { /* 忽略 */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f0, f1, dur, type = 'square', vol = 0.25, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.gain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, freq = 1200, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(this.gain);
    src.start(t);
  },
  /* ---- 音檔（不想用合成音效時）----
     Sfx.loadClip('hit', 'assets/sfx/hit.wav') → Sfx.playClip('hit', {rate:1.2})
     Sfx.loadMusic('assets/music/bgm.mp3')     → Sfx.playMusic() / stopMusic() */
  clips: {},
  music: null,
  musicGain: 0.5,
  clipGain: 0.8,

  loadClip(name, src) {
    return new Promise((res) => {
      const a = new Audio();
      a.preload = 'auto';
      a.src = src;
      a.oncanplaythrough = () => res(a);
      a.onerror = () => { console.warn('[audio] 載入失敗', src); res(null); };
      this.clips[name] = a;
    });
  },

  loadClips(map) {
    return Promise.all(Object.keys(map).map((k) => this.loadClip(k, map[k])));
  },

  playClip(name, opt) {
    const base = this.clips[name];
    if (!base) return null;
    opt = opt || {};
    try {
      const a = base.cloneNode(true);
      a.volume = Math.min(1, (opt.volume != null ? opt.volume : 1) * this.clipGain);
      a.playbackRate = opt.rate || 1;
      a.play().catch(() => {});
      return a;
    } catch (e) { return null; }
  },

  loadMusic(src, opt) {
    opt = opt || {};
    const a = new Audio();
    a.src = src;
    a.loop = opt.loop !== false;
    a.volume = Math.min(1, (opt.volume != null ? opt.volume : 1) * this.musicGain);
    a.preload = 'auto';
    this.music = a;
    return a;
  },

  playMusic() {
    if (!this.music) return;
    this.music.currentTime = this.music.currentTime || 0;
    this.music.play().catch(() => {});
  },

  stopMusic() { if (this.music) { this.music.pause(); } },
  setMusicVolume(v) { if (this.music) this.music.volume = Math.max(0, Math.min(1, v)); },

  /* 遊戲用：Sfx.register({ swing(){...}, hit(){...} })
     → 可用 Sfx.swing() 或 Sfx.play('swing') */
  defs: {},
  register(list) {
    for (const k in list) {
      this.defs[k] = list[k].bind(this);
      this[k] = this.defs[k];
    }
  },
  play(name) { const f = this.defs[name]; if (f) f(); },
};
