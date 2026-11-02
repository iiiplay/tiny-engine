'use strict';
/* TinyEngine 管理繪製與音效；SlotRules 管理抽樣、扣款與結算。 */
const SLOT_WELCOME = [[0,1,2],[3,4,0],[5,2,1],[6,0,3],[1,4,6]];
const SlotDemo = {
  state: null, board: SLOT_WELCOME.map(col => col.slice()),
  art: [], reels: [], spinning: false, time: 0, result: null,
  autoRemaining: 0, nextAt: 0, fast: false, ready: false, history: [],
  random: Math.random, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  metrics: { frames: 0, since: performance.now(), fps: 0 },
};
const slotEl = id => document.getElementById(id);
const slotNumber = n => n.toLocaleString('en-US');

function slotSave() {
  const ok = Save.set('session', SlotDemo.state);
  slotEl('save-status').textContent = ok ? '進度自動保存在本機' : '目前使用本次工作階段進度';
}
function slotMessage(message, win = false) {
  slotEl('message').textContent = message;
  slotEl('message').classList.toggle('win', win);
}
function slotLayout() {
  const width = document.querySelector('.reel-window').clientWidth;
  Display.fit(slotEl('game'), { w: 640, h: 312, scale: width / 640, dpr: Math.min(devicePixelRatio || 1, 2) });
}
function slotUI() {
  const d = SlotDemo, s = d.state, locked = d.spinning || s.freeRemaining > 0;
  slotEl('balance').textContent = slotNumber(s.balance);
  slotEl('win').textContent = slotNumber(d.spinning ? 0 : s.lastWin);
  slotEl('free').innerHTML = String(s.freeRemaining).padStart(2, '0') + ' <small>次</small>';
  slotEl('bet').textContent = slotNumber(s.freeRemaining ? s.freeBet : s.bet);
  slotEl('bet-minus').disabled = locked || s.bet === SlotRules.bets[0];
  slotEl('bet-plus').disabled = locked || s.bet === SlotRules.bets[SlotRules.bets.length - 1];
  slotEl('spin').disabled = d.spinning || (!s.freeRemaining && s.balance < s.bet);
  slotEl('spin').classList.toggle('free', s.freeRemaining > 0 && !d.spinning);
  slotEl('spin-label').innerHTML = d.spinning ? '運轉中<small>GOOD LUCK</small>' : s.freeRemaining ? '免費旋轉<small>FREE SPIN</small>' : '旋轉<small>SPIN</small>';
  slotEl('mode').textContent = (s.pending && s.pending.free) || s.freeRemaining ? 'FREE SPINS' : 'BASE GAME';
  slotEl('reset').disabled = d.spinning;
  slotEl('fast').disabled = d.spinning;
  slotEl('fast').setAttribute('aria-pressed', String(d.fast));
  slotEl('fast-state').textContent = d.fast ? '開' : '關';
  slotEl('auto').setAttribute('aria-pressed', String(d.autoRemaining > 0));
  slotEl('auto-count').textContent = d.autoRemaining ? '停止 ' + d.autoRemaining : '10';
  slotEl('gift').disabled = d.spinning || s.gifted || s.freeRemaining > 0;
  slotEl('gift-note').textContent = s.gifted ? '體驗贈送已領取，祝你玩得開心' : '每次重置可領一次體驗贈送';
  slotEl('spins').textContent = s.totalSpins + ' SPINS';
  slotEl('sound').textContent = Sfx.muted ? '音效 關' : '音效 開';
  slotEl('sound').setAttribute('aria-pressed', String(Sfx.muted));
  slotEl('sound').setAttribute('aria-label', Sfx.muted ? '開啟音效' : '關閉音效');
}

function slotSpin() {
  const d = SlotDemo;
  if (!d.ready || d.spinning || slotEl('rules').open) return false;
  Sfx.unlock();
  if (!SlotRules.start(d.state, d.random)) {
    d.autoRemaining = 0; slotMessage('遊戲幣不足。請降低下注，或重置進度再玩一次。'); slotUI(); return false;
  }
  // 開始時寫入已扣款的 pending；重整後只補結算，不重抽或重扣。
  slotSave(); d.spinning = true; d.result = null;
  const base = d.reducedMotion ? .12 : d.fast ? .38 : .9;
  const stagger = d.reducedMotion ? .025 : d.fast ? .07 : .18;
  d.reels = Array.from({ length: 5 }, (_, col) => {
    const filler = Array.from({ length: d.fast ? 9 + col : 20 + col * 4 }, () => SlotRules.pick());
    return { strip: [...d.board[col], ...filler, ...d.state.pending.board[col]], elapsed: 0, duration: base + col * stagger, stopped: false };
  });
  slotMessage(d.state.pending.free ? '免費旋轉中。這一局不扣遊戲幣。' : '轉輪運轉中。讓秘庫揭曉答案。');
  Sfx.play('slotSpin'); slotUI(); return true;
}

function slotFinish() {
  const d = SlotDemo, result = SlotRules.settle(d.state);
  if (!result) return;
  d.board = result.board; d.result = result; d.spinning = false; d.nextAt = d.time + 1.2;
  slotSave();
  if (result.freeAward) slotMessage('秘庫開啟！贏得 ' + slotNumber(result.total) + ' 枚，追加 ' + result.freeAward + ' 次免費旋轉。', true);
  else if (result.total) slotMessage(result.wins.length + ' 條連線中獎 · 贏得 ' + slotNumber(result.total) + ' 枚遊戲幣', true);
  else slotMessage(d.state.freeRemaining ? '還有 ' + d.state.freeRemaining + ' 次免費旋轉，繼續探索秘庫。' : '這次沒有連線。下一轉，新的可能。');
  if (result.total) {
    Sfx.play('slotWin');
    if (!d.reducedMotion) {
      const cells = result.wins.length ? result.wins[0].cells : result.scatterCells;
      for (const [col, row] of cells) Fx.burst(68 + col * 126, 58 + row * 98, '#edd491', 8, 50, { grav: 40, size: 2 });
    }
  }
  d.history.unshift({ total: result.total, free: result.free, lines: result.wins.length, scatter: result.scatterWin, count: d.state.totalSpins });
  d.history = d.history.slice(0, 3);
  slotEl('results').innerHTML = d.history.map(item => '<div class="result-row"><span>' + (item.free ? '免費旋轉' : '第 ' + item.count + ' 局') + '<small>' + (item.lines ? item.lines + ' 條中獎線' : item.scatter ? 'SCATTER 中獎' : '未中獎') + '</small></span><b>+' + slotNumber(item.total) + '</b></div>').join('');
  slotUI();
}

function slotAuto() {
  const d = SlotDemo;
  if (!d.ready || slotEl('rules').open) return;
  if (d.autoRemaining) { d.autoRemaining = 0; slotUI(); return; }
  d.autoRemaining = 10;
  if (!d.spinning) { d.autoRemaining--; slotSpin(); }
  slotUI();
}
function slotReset() {
  const d = SlotDemo;
  if (d.spinning) return;
  d.autoRemaining = 0; d.state = SlotRules.fresh(); d.result = null; d.history = []; Fx.reset();
  d.board = SLOT_WELCOME.map(col => col.slice());
  slotEl('results').innerHTML = '<p class="empty">每條連線的小驚喜，<br>都會記錄在這裡。</p>';
  slotSave(); slotMessage('已重置，贈送 2,000 枚遊戲幣。祝你玩得開心。'); slotUI();
}

function slotUpdate(dt) {
  const d = SlotDemo; d.time += dt;
  if (!slotEl('rules').open) {
    if (Input.justPressed('spin')) slotSpin();
    if (Input.justPressed('auto')) slotAuto();
  }
  if (Input.justPressed('mute')) { Sfx.mute(); slotUI(); }
  if (d.spinning) {
    for (const reel of d.reels) {
      reel.elapsed += dt;
      if (!reel.stopped && reel.elapsed >= reel.duration) { reel.stopped = true; Sfx.play('slotStop'); }
    }
    if (d.reels.every(reel => reel.stopped)) slotFinish();
  } else if (d.autoRemaining && d.time >= d.nextAt && !slotEl('rules').open && !document.hidden) {
    d.autoRemaining--; slotSpin();
  }
}

function slotSymbol(symbol, col, y, dim = false) {
  const ctx = G.ctx, meta = SlotRules.symbols[symbol], x = 68 + col * 126;
  const s = sheetOf(SlotDemo.art[symbol]);
  if (dim) ctx.globalAlpha = .55;
  const glow = ctx.createRadialGradient(x, y - 8, 2, x, y - 8, 41);
  glow.addColorStop(0, meta.color + '18'); glow.addColorStop(1, meta.color + '00');
  ctx.fillStyle = glow; ctx.fillRect(x - 43, y - 47, 86, 80);
  const scale = Math.min(8, Math.max(1, Math.floor(46 / Math.max(s.fw, s.h))));
  drawSheet(s, 0, x, y + 14, { scale, alpha: dim ? .55 : 1 });
  ctx.globalAlpha = dim ? .55 : 1;
  ctx.font = symbol >= 5 ? 'bold 9px Consolas,monospace' : '9px "Microsoft JhengHei",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = symbol >= 5 ? meta.color : '#8da28b';
  ctx.fillText(meta.name, x, y + 34);
  if (symbol >= 5) {
    ctx.strokeStyle = meta.color + '45'; ctx.lineWidth = .7; ctx.strokeRect(x - 48, y - 44, 96, 88);
  }
  ctx.globalAlpha = 1;
}
function slotRender() {
  const d = SlotDemo, ctx = G.ctx;
  ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);
  ctx.fillStyle = '#0b1b17'; ctx.fillRect(0, 0, 640, 312);
  for (let col = 0; col < 5; col++) {
    const x = 10 + col * 126;
    ctx.fillStyle = col % 2 ? '#10261f' : '#12291f'; ctx.fillRect(x, 9, 116, 294);
    ctx.strokeStyle = '#c4bc8b18'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, 9.5, 115, 293);
    ctx.fillStyle = '#ffffff03'; ctx.fillRect(x + 1, 107, 114, 98);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 1, 10, 114, 292); ctx.clip();
    if (d.spinning) {
      const reel = d.reels[col], t = Math.min(1, reel.elapsed / reel.duration);
      const progress = d.reducedMotion ? (t === 1 ? 1 : 0) : 1 - (1 - t) ** 3;
      const offset = (reel.strip.length - 3) * 98 * progress;
      const first = Math.floor(offset / 98);
      for (let i = first; i < Math.min(reel.strip.length, first + 4); i++) slotSymbol(reel.strip[i], col, 58 + i * 98 - offset, !reel.stopped);
    } else {
      for (let row = 0; row < 3; row++) slotSymbol(d.board[col][row], col, 58 + row * 98);
    }
    ctx.restore();
    const shadow = ctx.createLinearGradient(0, 9, 0, 303);
    shadow.addColorStop(0, '#020e0960'); shadow.addColorStop(.16, '#020e0900'); shadow.addColorStop(.84, '#020e0900'); shadow.addColorStop(1, '#020e0960');
    ctx.fillStyle = shadow; ctx.fillRect(x, 9, 116, 294);
  }
  if (!d.spinning && d.result) {
    const win = d.result.wins[Math.floor(d.time / 1.2) % Math.max(1, d.result.wins.length)];
    const cells = win ? win.cells : d.result.scatterWin ? d.result.scatterCells : [];
    ctx.strokeStyle = '#e3cc8d'; ctx.lineWidth = 1.8;
    for (const [col, row] of cells) ctx.strokeRect(13 + col * 126, 12 + row * 98, 110, 92);
    if (win) {
      ctx.save(); ctx.shadowColor = '#eed59b'; ctx.shadowBlur = 6; ctx.strokeStyle = '#f2dda4aa'; ctx.lineWidth = 1.5;
      ctx.beginPath(); win.cells.forEach(([col,row],i)=>{ if (!i) ctx.moveTo(68+col*126,58+row*98); else ctx.lineTo(68+col*126,58+row*98); }); ctx.stroke(); ctx.restore();
    }
  }
  Fx.draw();
  const m = d.metrics, now = performance.now(); m.frames++;
  if (now - m.since >= 500) { m.fps = Math.round(m.frames * 1000 / (now - m.since)); m.frames = 0; m.since = now; slotEl('fps').textContent = m.fps; }
}

function slotRulesPanel() {
  slotEl('paytable').innerHTML = SlotRules.symbols.slice(0, 6).map(s => '<tr><td>' + (s.id === 'chest' ? '<span class="chest-icon"></span>' : '<img src="assets/slot/' + s.id + '.png" alt="">') + s.name + '</td>' + s.pays.map(n=>'<td>'+n+'×</td>').join('') + '</tr>').join('');
  slotEl('line-map').innerHTML = SlotRules.lines.map((line,i)=>'<div><svg viewBox="0 0 60 28" aria-label="第 '+(i+1)+' 線"><path d="M0 4H60M0 14H60M0 24H60" stroke="#60806630"/><polyline points="'+line.map((row,col)=>(col*14+2)+','+(row*10+4)).join(' ')+'" fill="none" stroke="#d6c083" stroke-width="1.5"/></svg><small>'+String(i+1).padStart(2,'0')+'</small></div>').join('');
}

window.addEventListener('load', async () => {
  Save.ns = 'tinyengine:slot:v1';
  SlotDemo.state = SlotRules.restore(Save.get('session', null));
  if (SlotDemo.state.lastBoard) SlotDemo.board = SlotDemo.state.lastBoard.map(col => col.slice());
  SlotDemo.art = SlotRules.symbols.map(s => assetDef('assets/slot/' + s.id + '.png', s.id === 'chest' ? 6 : 1, undefined, s.id === 'chest' ? 16 : undefined));
  G.canvas = slotEl('game'); slotLayout();
  slotEl('spin').disabled = true; slotMessage('正在開啟秘庫，載入 PNG 素材…');
  await loadAll(SlotDemo.art);
  Input.init({ Space: 'spin', KeyA: 'auto', KeyM: 'mute' });
  Sfx.setMaster(.16);
  Sfx.register({
    slotSpin() { this.tone(220, 440, .1, 'sine', .12); },
    slotStop() { this.tone(400, 240, .045, 'triangle', .12); },
    slotWin() { this.tone(660, 660, .14, 'sine', .15); this.tone(880, 880, .14, 'sine', .12, .09); this.tone(1320, 1320, .3, 'sine', .12, .18); },
  });
  slotEl('spin').addEventListener('click', slotSpin);
  slotEl('auto').addEventListener('click', slotAuto);
  for (const [id, direction] of [['bet-minus',-1],['bet-plus',1]]) slotEl(id).addEventListener('click', () => { SlotRules.changeBet(SlotDemo.state,direction); slotSave(); slotUI(); });
  slotEl('fast').addEventListener('click', () => { SlotDemo.fast=!SlotDemo.fast; slotUI(); });
  slotEl('sound').addEventListener('click', () => { Sfx.unlock(); Sfx.mute(); slotUI(); });
  slotEl('reset').addEventListener('click', slotReset);
  slotEl('gift').addEventListener('click', () => {
    if (SlotRules.gift(SlotDemo.state)) { slotSave(); slotUI(); slotMessage('體驗贈送：8 次免費旋轉。按旋轉開始，不扣遊戲幣。',true); }
  });
  slotRulesPanel();
  slotEl('rules-button').addEventListener('click', () => slotEl('rules').showModal());
  slotEl('rules-close').addEventListener('click', () => slotEl('rules').close());
  slotEl('rules').addEventListener('click', e => { if(e.target===slotEl('rules')) { const r=e.target.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close(); } });
  addEventListener('resize', slotLayout);
  addEventListener('blur', () => { SlotDemo.autoRemaining=0; slotUI(); });
  document.addEventListener('visibilitychange', () => { if(document.hidden) { SlotDemo.autoRemaining=0; slotUI(); } });
  SlotDemo.ready = true; slotUI(); slotSave();
  if (SlotDemo.state.pending) slotFinish();
  else slotMessage(SlotDemo.state.freeRemaining ? '還有 '+SlotDemo.state.freeRemaining+' 次免費旋轉，按旋轉繼續。' : '秘庫已開啟。讓好運開始流轉。');
  SlotDemo.metrics.since = performance.now();
  Loop.fixedStep = 0; Loop.update=slotUpdate; Loop.render=slotRender; Loop.start();
});
