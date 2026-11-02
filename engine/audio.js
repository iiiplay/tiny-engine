'use strict';
/* ============================================================
   engine/audio.js — WebAudio 即時合成 + 音效註冊表 + BGM 排程/淡入淡出
   v1.9：新增 setSfx / setBgm / savePrefs / loadPrefs、
         BGM 歌單 playlist / nextTrack、淡入淡出 fadeMusic / crossfade
   ============================================================ */

const Sfx = {
  ctx: null,
  master: 0.5,
  sfxVol: 1,
  bgmVol: 0.5,
  muted: false,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = this.muted ? 0 : this.master;
        this.gain.connect(this.ctx.destination);
      } catch (e) { /* 忽略 */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  /* 主音量（0..1）。靜音時 gain 直接歸零，但 oscillator 照常排程（成本極低） */
  setMaster(v) {
    this.master = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.master;
    this._applyMusicVol();
    return this;
  },
  /* 音效音量（0..1）：同時控制合成音效與音檔 clipGain */
  setSfx(v) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    this.clipGain = 0.8 * this.sfxVol;
    return this;
  },
  /* BGM 音量（0..1）：同時更新 musicGain 與播放中的音樂 */
  setBgm(v) {
    this.bgmVol = Math.max(0, Math.min(1, v));
    this.musicGain = this.bgmVol;
    this._trackVol = this.musicGain;
    this._applyMusicVol();
    return this;
  },
  /* 靜音切換：Sfx.mute(true) / Sfx.mute() 反轉 / Sfx.mute(false) */
  mute(on) {
    this.muted = (on == null) ? !this.muted : !!on;
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.master;
    this._applyMusicVol();
    return this.muted;
  },
  /* 存取音量偏好（搭配 Save） */
  savePrefs(key) {
    if (typeof Save === 'undefined') return this;
    Save.set(key || 'te-audio', {
      master: this.master, sfx: this.sfxVol, bgm: this.bgmVol, muted: this.muted,
    });
    return this;
  },
  loadPrefs(key) {
    if (typeof Save === 'undefined') return this;
    const d = Save.get(key || 'te-audio', null);
    if (!d) return this;
    if (d.master != null) this.setMaster(d.master);
    if (d.sfx != null) this.setSfx(d.sfx);
    if (d.bgm != null) this.setBgm(d.bgm);
    if (d.muted != null) this.mute(d.muted);
    return this;
  },
  tone(f0, f1, dur, type = 'square', vol = 0.25, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const peak = Math.max(0.0002, vol * this.sfxVol);
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.gain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
    const g = this.ctx.createGain(); g.gain.value = vol * this.sfxVol;
    src.connect(bp); bp.connect(g); g.connect(this.gain);
    src.start(t);
  },
  /* ---- 音檔（不想用合成音效時）----
     Sfx.loadClip('hit', 'assets/sfx/hit.wav') → Sfx.playClip('hit', {rate:1.2})
     Sfx.loadMusic('assets/music/bgm.mp3')     → Sfx.playMusic() / stopMusic() */
  clips: {},
  tracks: {},             // name -> { src, volume, loop }
  currentTrack: null,     // 目前曲名或 src
  music: null,
  musicGain: 0.5,
  clipGain: 0.8,
  _trackVol: 1,           // 單曲相對音量
  _fadeVal: 1,            // 淡入淡出倍率（0..1）
  _fadeFrom: 1,
  _fadeTo: 1,
  _fadeT: 0,
  _fadeDur: 0,
  _fadeNext: null,        // crossfade 淡出後要接的 { target, dur, opt }
  _playlist: [],
  _playIdx: 0,
  _playOpt: {},

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
      const eff = (opt.volume != null ? opt.volume : 1) * this.clipGain;
      a.volume = Math.max(0, Math.min(1, eff));
      a.playbackRate = opt.rate || 1;
      a.play().catch(() => {});
      return a;
    } catch (e) { return null; }
  },

  /* 註冊多首 BGM：Sfx.addTracks({ camp: 'bgm1.wav', boss: { src: 'bgm2.wav', volume: 0.8 } }) */
  addTracks(map) {
    for (const k in map) {
      const v = map[k];
      this.tracks[k] = typeof v === 'string'
        ? { src: v, volume: 1, loop: true }
        : { src: v.src, volume: v.volume != null ? v.volume : 1, loop: v.loop !== false };
    }
    return this;
  },

  _applyMusicVol() {
    if (!this.music) return;
    if (this.muted) { this.music.volume = 0; return; }
    const v = this._trackVol * this._fadeVal;
    this.music.volume = Math.max(0, Math.min(1, v));
  },

  loadMusic(srcOrName, opt) {
    opt = opt || {};
    const reg = this.tracks[srcOrName];
    const src = reg ? reg.src : srcOrName;
    const a = new Audio();
    a.src = src;
    a.loop = opt.loop != null ? opt.loop : (reg ? reg.loop !== false : true);
    this._trackVol = (opt.volume != null ? opt.volume : (reg && reg.volume != null ? reg.volume : 1)) * this.musicGain;
    this._fadeVal = opt.fadeIn ? 0 : 1;
    a.preload = 'auto';
    a.onended = () => {
      if (!a.loop && this._playlist.length) this.nextTrack();
    };
    this.music = a;
    this.currentTrack = srcOrName;
    this._applyMusicVol();
    if (opt.fadeIn) this.fadeMusic(1, opt.fadeIn);
    return a;
  },

  playMusic(nameOrSrc, opt) {
    if (nameOrSrc && nameOrSrc !== this.currentTrack) {
      this.stopMusic();
      this.loadMusic(nameOrSrc, opt);
    }
    if (!this.music) return;
    this.music.currentTime = this.music.currentTime || 0;
    this._applyMusicVol();
    this.music.play().catch(() => {});
  },

  stopMusic() {
    if (this.music) { this.music.pause(); }
  },
  setMusicVolume(v) {
    this._trackVol = Math.max(0, Math.min(1, v));
    this._applyMusicVol();
  },

  /* BGM 淡入淡出：targetVol (0..1)，dur 秒 */
  fadeMusic(targetVol, dur) {
    const to = Math.max(0, Math.min(1, targetVol));
    if (!dur || dur <= 0) {
      this._fadeVal = to;
      this._fadeDur = 0;
      this._applyMusicVol();
      return this;
    }
    this._fadeFrom = this._fadeVal;
    this._fadeTo = to;
    this._fadeT = 0;
    this._fadeDur = dur;
    return this;
  },

  /* 平滑切歌：先用 dur/2 淡出舊歌，再載入新歌用 dur/2 淡入 */
  crossfade(nameOrSrc, dur = 0.6, opt) {
    opt = opt || {};
    if (!this.music || this.music.paused || dur <= 0) {
      this.stopMusic();
      this.loadMusic(nameOrSrc, Object.assign({}, opt, { fadeIn: dur > 0 ? dur : 0 }));
      this.playMusic();
      return this;
    }
    if (this.currentTrack === nameOrSrc) return this;
    const half = Math.max(0.05, dur / 2);
    this._fadeNext = { target: nameOrSrc, dur: half, opt };
    this.fadeMusic(0, half);
    return this;
  },

  /* 歌單排程：Sfx.playlist(['camp', 'battle'], { loop: true, shuffle: false, fade: 0.4 }) */
  playlist(list, opt) {
    this._playlist = Array.isArray(list) ? list.slice() : [];
    this._playOpt = opt || {};
    this._playIdx = -1;
    if (this._playlist.length && this._playOpt.autoPlay !== false) this.nextTrack();
    return this;
  },

  nextTrack() {
    if (!this._playlist.length) return null;
    if (this._playOpt.shuffle && this._playlist.length > 1) {
      let n = this._playIdx;
      while (n === this._playIdx) n = (Math.random() * this._playlist.length) | 0;
      this._playIdx = n;
    } else {
      this._playIdx++;
      if (this._playIdx >= this._playlist.length) {
        if (this._playOpt.loop === false) { this.stopMusic(); return null; }
        this._playIdx = 0;
      }
    }
    const name = this._playlist[this._playIdx];
    const loopSingle = this._playlist.length === 1 && this._playOpt.loop !== false;
    if (this._playOpt.fade) {
      this.crossfade(name, this._playOpt.fade, { loop: loopSingle });
    } else {
      this.stopMusic();
      this.loadMusic(name, { loop: loopSingle });
      this.playMusic();
    }
    return name;
  },

  /* 每帧更新淡入淡出（Loop.step 會自動呼叫；測試也可手動 Sfx.update(dt)） */
  update(dt) {
    if (this._fadeDur <= 0) return;
    this._fadeT += dt;
    const p = Math.min(1, this._fadeT / this._fadeDur);
    this._fadeVal = this._fadeFrom + (this._fadeTo - this._fadeFrom) * p;
    this._applyMusicVol();
    if (p >= 1) {
      this._fadeDur = 0;
      if (this._fadeNext) {
        const nxt = this._fadeNext;
        this._fadeNext = null;
        this.stopMusic();
        this.loadMusic(nxt.target, Object.assign({}, nxt.opt, { fadeIn: nxt.dur }));
        this.playMusic();
      } else if (this._fadeTo <= 0.001 && this.music) {
        this.music.pause();
      }
    }
  },

  /* 遊戲用：Sfx.register({ swing(){...}, hit(){...} })
     → 可用 Sfx.swing() 或 Sfx.play('swing') */
  defs: {},
  register(list) {
    for (const k in list) {
      this.defs[k] = list[k].bind(this);
      this[k] = this.defs[k];
    }
  },
  /* 有同名音檔就播音檔，否則用註冊的合成音效 */
  play(name, opt) {
    if (this.clips[name]) return this.playClip(name, opt);
    const f = this.defs[name];
    if (f) f();
    return null;
  },
};
