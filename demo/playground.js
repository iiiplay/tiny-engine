'use strict';
/* 光種森林：所有繪製與角色控制都走 TinyEngine，HUD 使用 DOM 保持清晰。 */
const ForestDemo = {
  world: { w: 1280, h: 960 }, map: null, floor: null,
  player: null, creatures: [], seeds: [], trees: [], rocks: [], trails: [],
  time: 0, collected: 0, hits: 0, attacks: 0, dashes: 0, paused: false,
  population: 24, noticeT: 5, field: null, fieldT: 0, debug: false,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  ready: false,
  metrics: { update: 0, draw: 0, frames: 0, started: performance.now(), lastFrame: 0, gaps: [], history: [], fps: 0 },
};

const forestEl = id => document.getElementById(id);
function forestNotice(message, seconds = 3) {
  forestEl('toast').textContent = message;
  ForestDemo.noticeT = seconds;
  forestEl('toast').classList.remove('quiet');
}

function forestLayout() {
  const stage = forestEl('stage');
  const mobile = innerWidth <= 600;
  const w = mobile ? 320 : 640;
  const h = Math.max(mobile ? 300 : 240, Math.round(w * stage.clientHeight / stage.clientWidth));
  Display.fit(forestEl('game'), { w, h, scale: stage.clientWidth / w, dpr: Math.min(devicePixelRatio || 1, 2) });
  G.view = { l: 0, r: w, t: 0, b: h };
  if (TouchUI.enabled) TouchUI.resize();
}

function forestGround() {
  const c = document.createElement('canvas');
  c.width = ForestDemo.world.w; c.height = ForestDemo.world.h;
  const x = c.getContext('2d'), rand = U.seeded(3801);
  const greens = ['#244135', '#254337', '#264538', '#284739', '#274336'];
  for (let y = 0; y < c.height; y += 16) for (let col = 0; col < c.width; col += 16) {
    x.fillStyle = greens[Math.floor(rand() * greens.length)];
    x.fillRect(col, y, 16, 16);
    x.globalAlpha = .1;
    x.drawImage(ASSETS[FOREST_ART.props.grass.src], col, y);
    x.globalAlpha = 1;
    for (let n = 0; n < 3; n++) {
      x.fillStyle = n ? '#3e594035' : '#122d2a35';
      x.fillRect(col + Math.floor(rand() * 15), y + Math.floor(rand() * 15), 1, 2);
    }
  }
  // 草叢與小花直接使用 PNG，與角色一樣不再逐個拼色塊。
  for (let i = 0; i < 220; i++) {
    const px = Math.floor(rand() * c.width), py = Math.floor(rand() * c.height);
    if (px > 550 && px < 730 && py > 390 && py < 570) continue;
    const art = i % 3 ? FOREST_ART.props.bush : FOREST_ART.props.flower;
    x.drawImage(ASSETS[art.src], px, py);
  }
  // 碎石步道與石環，預先畫入地面快取。
  for (let y = 120; y < 870; y += 13) {
    const px = 640 + Math.sin(y / 95) * 28;
    x.globalAlpha = .45;
    for (let col = 0; col < 2; col++) x.drawImage(ASSETS[FOREST_ART.props.dirt.src], 16, 0, 16, 16, Math.round(px) - 16 + col * 16, y, 16, 13);
    x.globalAlpha = 1;
  }
  for (let row = -4; row <= 4; row++) for (let col = -5; col <= 5; col++) {
    if ((col / 5.7) ** 2 + (row / 4.8) ** 2 > 1) continue;
    const px = 640 + col * 16, py = 480 + row * 16;
    x.fillStyle = ['#526458', '#596a5c', '#4d6255'][Math.floor(rand() * 3)];
    x.fillRect(px - 8, py - 8, 15, 15);
    x.fillStyle = '#a8b28b25'; x.fillRect(px - 7, py - 7, 13, 1);
    if (rand() < .4) { x.fillStyle = '#294737'; x.fillRect(px + 3, py + 3, 3, 4); }
  }
  x.strokeStyle = '#aeb58b55'; x.lineWidth = 2;
  x.beginPath(); x.ellipse(640, 480, 65, 48, 0, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = '#aeb58b28'; x.beginPath(); x.ellipse(640, 480, 59, 42, 0, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#263e35'; x.fillRect(628, 467, 24, 24);
  x.fillStyle = '#a1b18a'; x.fillRect(636, 472, 8, 14); x.fillRect(632, 477, 16, 4);
  // 池塘是碰撞地形。
  for (let row = 0; row < 5; row++) for (let col = 0; col < 8; col++) {
    const px = 384 + col * 16, py = 256 + row * 16;
    if ((col === 0 || col === 7) && (row === 0 || row === 4)) continue;
    ForestDemo.map.setTile(px / 16, py / 16, 1);
    x.fillStyle = '#183c3b'; x.fillRect(px, py, 16, 16);
    x.fillStyle = '#39635a'; x.fillRect(px + 4, py + 7, 8, 1);
  }
  ForestDemo.floor = c;
}

function forestPopulation() {
  const rand = U.seeded(7911);
  ForestDemo.creatures = [];
  for (let i = 0; i < ForestDemo.population; i++) {
    let px, py;
    if (!i) { px = 688; py = 496; }
    else {
      do { px = 96 + rand() * 1088; py = 96 + rand() * 768; }
      while (ForestDemo.map.solid(Math.floor(px / 16), Math.floor(py / 16)) || U.dist(px, py, 640, 488) < 55);
    }
    ForestDemo.creatures.push({ x: px, y: py, r: 5, hp: 2, phase: rand() * 6.28, flash: 0, respawn: 0, moving: false, speed: 14 + rand() * 9 });
  }
  forestEl('population-value').textContent = ForestDemo.population;
}

function forestReset() {
  const d = ForestDemo;
  d.map = Grid.create({ cell: 16, cols: 80, rows: 60 });
  d.trees = []; d.rocks = []; d.trails = []; d.collected = d.hits = d.attacks = d.dashes = d.time = 0;
  d.field = null; d.fieldT = 0; Fx.reset();
  d.player = { x: 640, y: 508, r: 5, aimX: 0, aimY: 1, health: 5, invulnerable: 0, attackT: 0, attackCd: 0, dashT: 0, dashCd: 0, dashX: 1, dashY: 0, walk: 0, anim: new Sprite(), animMode: 'idle', dir: 'down' };
  forestAnimate(0, false);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) if (!x || !y || x === 79 || y === 59) d.map.setTile(x, y, 1);
  const rand = U.seeded(1109);
  const treePoints = [[546, 422], [758, 416], [520, 528], [770, 566], [606, 360], [710, 620], [480, 410], [800, 482], [560, 650], [840, 370]];
  for (let i = 0; i < 165; i++) treePoints.push([32 + Math.floor(rand() * 75) * 16, 48 + Math.floor(rand() * 54) * 16]);
  for (const [px, py] of treePoints) {
    if ((px > 544 && px < 744 && py > 396 && py < 582) || Math.abs(px - 640) < 26) continue;
    if (px > 365 && px < 530 && py > 240 && py < 355) continue;
    d.trees.push({ x: px, y: py, tone: rand() > .5, size: .85 + rand() * .35 });
    d.map.setTile(Math.floor(px / 16), Math.floor(py / 16), 1);
  }
  for (const [px, py] of [[568, 424], [712, 424], [568, 552], [712, 552], [838, 650], [290, 448]]) {
    d.rocks.push({ x: px, y: py }); d.map.setTile(Math.floor(px / 16), Math.floor(py / 16), 1);
  }
  const points = [[676, 508], [650, 390], [788, 452], [810, 610], [600, 650], [468, 564], [468, 382], [644, 274]];
  d.seeds = points.map(([x, y], i) => { d.map.setTile(Math.floor(x / 16), Math.floor(y / 16), 0); return { x, y, taken: false, phase: i }; });
  forestGround(); forestPopulation(); forestPause(false);
  Camera.offsetY = 0; Camera.lerp = 10;
  Camera.follow(d.player, { x: 0, y: 0, w: d.world.w, h: d.world.h });
  Camera.snapTo(d.player.x - GAME_W / 2, d.player.y - GAME_H / 2);
  forestNotice('WASD 移動，空白鍵揮劍。出發吧。', 5);
  forestHUD();
}

function forestPause(value) {
  ForestDemo.paused = value;
  forestEl('pause-overlay').hidden = !value;
  forestEl('pause').textContent = value ? '繼續' : '暫停';
  G.state = value ? 'paused' : 'play';
  if (TouchUI.enabled) {
    TouchUI.held.clear(); TouchUI.joy.id = null; Input.touchAxis = null;
    for (const b of TouchUI.btns) b.id = null;
  }
}

function forestAttack() {
  const d = ForestDemo, p = d.player;
  if (p.attackCd > 0) return;
  p.attackT = .19; p.attackCd = .3; d.attacks++;
  Sfx.play('forestSwing');
  for (const c of d.creatures) {
    if (c.respawn > 0) continue;
    const dx = c.x - p.x, dy = c.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 34 || (dist > 12 && (dx * p.aimX + dy * p.aimY) / dist < -.15)) continue;
    c.hp--; c.flash = .2; d.hits++;
    Fx.burst(c.x, c.y - 5, '#d8e7aa', 9, 42, { grav: 15, size: 1 });
    if (!d.reducedMotion) Camera.shake(1.8, .12);
    Sfx.play('forestHit');
    if (c.hp <= 0) { c.respawn = 5; forestNotice('漂亮的一擊！史萊姆會在幾秒後回來。', 2); }
  }
}

function forestAnimate(dt, moving) {
  const p = ForestDemo.player;
  p.dir = Math.abs(p.aimX) > Math.abs(p.aimY) ? (p.aimX < 0 ? 'left' : 'right') : (p.aimY < 0 ? 'up' : 'down');
  p.animMode = p.attackT > 0 ? 'attack' : moving || p.dashT > 0 ? 'walk' : 'idle';
  const def = FOREST_ART.hero[p.animMode][p.dir];
  p.anim.set(sheetOf(def), p.animMode === 'attack' ? 6 / .19 : p.animMode === 'walk' ? 11 : 6, p.animMode !== 'attack');
  p.anim.update(ForestDemo.reducedMotion && p.animMode === 'idle' ? 0 : dt);
}

function forestUpdate(dt) {
  const start = performance.now(), d = ForestDemo, p = d.player;
  if (Input.justPressed('pause') || Input.justPressed('cancel')) forestPause(!d.paused);
  if (Input.justPressed('restart')) { forestReset(); return; }
  if (Input.justPressed('debug')) d.debug = !d.debug;
  if (d.paused) return;
  d.time += dt; G.time += dt;
  for (const key of ['invulnerable', 'attackT', 'attackCd', 'dashT', 'dashCd']) p[key] = Math.max(0, p[key] - dt);
  const mv = Input.moveAxis(), moving = mv.mag > .01;
  if (moving && p.dashT <= 0) { p.aimX = mv.x; p.aimY = mv.y; }
  if (Input.justPressed('dash') && p.dashCd <= 0) {
    const length = Math.hypot(p.aimX, p.aimY) || 1;
    p.dashX = p.aimX / length; p.dashY = p.aimY / length;
    p.dashT = .15; p.dashCd = 1.1; p.invulnerable = Math.max(.2, p.invulnerable); d.dashes++;
    Sfx.play('forestDash');
  }
  const dx = p.dashT > 0 ? p.dashX * 245 * dt : mv.x * mv.mag * 84 * dt;
  const dy = p.dashT > 0 ? p.dashY * 245 * dt : mv.y * mv.mag * 84 * dt;
  // 衝刺仍走格子碰撞，不穿過樹木或池塘。
  d.map.moveX(p, dx); d.map.moveY(p, dy);
  p.walk += moving || p.dashT > 0 ? dt * 10 : dt * 2;
  if (p.dashT > 0 && !d.reducedMotion) d.trails.push({ x: p.x, y: p.y, life: .17 });
  for (let i = d.trails.length - 1; i >= 0; i--) { d.trails[i].life -= dt; if (d.trails[i].life <= 0) d.trails.splice(i, 1); }
  if (Input.justPressed('attack')) forestAttack();
  forestAnimate(dt, moving);
  for (const seed of d.seeds) if (!seed.taken && U.dist(seed.x, seed.y, p.x, p.y) < 13) {
    seed.taken = true; d.collected++; Sfx.play('forestSeed');
    Fx.burst(seed.x, seed.y - 7, '#f4d98b', 16, 35, { grav: -10, size: 1 });
    if (d.collected === 8) forestNotice('八顆光種集齊，石環甦醒了！按 R 再探索一次。', 10);
    else forestNotice('找到光種 ' + d.collected + ' / 8。沿著森林繼續探索。', 2.4);
  }
  d.fieldT -= dt;
  if (d.fieldT <= 0) { d.fieldT = .3; d.field = d.map.field({ from: d.map.snapToCell(p.x, p.y) }); }
  for (const c of d.creatures) {
    c.flash = Math.max(0, c.flash - dt);
    if (c.respawn > 0) { c.respawn -= dt; if (c.respawn <= 0) c.hp = 2; continue; }
    const distance = U.dist(c.x, c.y, p.x, p.y);
    c.moving = distance < 155 && distance > 20;
    if (distance < 155 && distance > 20) {
      const cell = d.map.snapToCell(c.x, c.y), dir = d.map.downhill(d.field, cell.cx, cell.cy);
      if (dir) {
        const tx = d.map.center(cell.cx + dir.x), ty = d.map.center(cell.cy + dir.y);
        const len = Math.hypot(tx - c.x, ty - c.y) || 1;
        d.map.moveX(c, (tx - c.x) / len * c.speed * dt); d.map.moveY(c, (ty - c.y) / len * c.speed * dt);
      }
    }
    if (distance < 12 && p.invulnerable <= 0) {
      p.health--; p.invulnerable = 1.5;
      Fx.burst(p.x, p.y - 7, '#e7b990', 10, 40, { size: 1 });
      if (!d.reducedMotion) Camera.shake(2, .16);
      if (p.health <= 0) { p.x = 640; p.y = 508; p.health = 5; forestNotice('石環恢復了你的生命。再試著用衝刺閃避！', 4); }
    }
  }
  d.noticeT -= dt;
  if (d.noticeT <= 0) forestEl('toast').classList.add('quiet');
  d.metrics.update = d.metrics.update * .9 + (performance.now() - start) * .1;
}

function forestTree(tree) {
  const x = Math.round(tree.x), y = Math.round(tree.y);
  shadow(x + 1, y, 18, 6, .25);
  drawSheet(sheetOf(FOREST_ART.props.tree), 0, x, y, { scale: 1 });
}

function forestHero(x, y, alpha = 1) {
  const p = ForestDemo.player;
  x = Math.round(x); y = Math.round(y);
  if (alpha === 1) shadow(x, y, 8, 3, .3);
  p.anim.draw(x, y, { scale: 1.5, alpha });
}

function forestCreature(c) {
  const ctx = G.ctx, x = Math.round(c.x), y = Math.round(c.y);
  shadow(x, y, 8, 3, .23);
  const list = FOREST_ART.slime[c.moving ? 'run' : 'idle'];
  const t = ForestDemo.reducedMotion && !c.moving ? c.phase : ForestDemo.time + c.phase;
  const frame = Math.floor(t * (c.moving ? 10 : 6)) % list.length;
  drawSheet(sheetOf({ src: list[frame], frames: 1 }), 0, x, y, { scale: 1.5, oy: 1.5, flipX: ForestDemo.player.x < c.x, white: c.flash > 0 });
  if (c.hp < 2) { ctx.fillStyle = '#283e31'; ctx.fillRect(x - 7, y - 17, 14, 2); ctx.fillStyle = '#d6c47e'; ctx.fillRect(x - 7, y - 17, 7, 2); }
}

function forestRender() {
  const start = performance.now(), d = ForestDemo, ctx = G.ctx, p = d.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, G.canvas.width, G.canvas.height);
  Camera.apply(ctx, G.scale);
  ctx.drawImage(d.floor, 0, 0);
  // 從石環向外散開的柔光，不影響碰撞或畫面更新。
  const glow = ctx.createRadialGradient(640, 480, 10, 640, 480, 145);
  glow.addColorStop(0, d.collected === 8 ? '#e6d88a30' : '#b9d69915'); glow.addColorStop(1, '#a3c38100');
  ctx.fillStyle = glow; ctx.fillRect(495, 335, 290, 290);
  for (const seed of d.seeds) if (!seed.taken && Camera.visible(seed.x - 12, seed.y - 20, 24, 30)) {
    const bob = d.reducedMotion ? 0 : Math.sin(d.time * 2.4 + seed.phase) * 2;
    shadow(seed.x, seed.y + 1, 5, 2, .2);
    ctx.fillStyle = '#e9cd7430'; ctx.beginPath(); ctx.arc(seed.x, seed.y - 10 + bob, 9, 0, 6.28); ctx.fill();
    drawSheet(sheetOf(FOREST_ART.props.seed), 0, seed.x, seed.y - 5 + bob, { scale: 1.5 });
  }
  for (const trail of d.trails) forestHero(trail.x, trail.y, trail.life * 1.5);
  const visible = [];
  for (const t of d.trees) if (Camera.visible(t.x - 24, t.y - 54, 48, 58)) visible.push({ y: t.y, draw: () => forestTree(t) });
  for (const r of d.rocks) if (Camera.visible(r.x - 12, r.y - 24, 24, 30)) visible.push({ y: r.y, draw: () => {
    shadow(r.x, r.y, 10, 4, .2);
    drawSheet(sheetOf(FOREST_ART.props.rock), 0, r.x, r.y, { scale: 1.5 });
  } });
  for (const c of d.creatures) if (c.respawn <= 0 && Camera.visible(c.x - 12, c.y - 20, 24, 24)) visible.push({ y: c.y, draw: () => forestCreature(c) });
  visible.push({ y: p.y, draw: () => forestHero(p.x, p.y, p.invulnerable > 0 && Math.floor(d.time * 12) % 2 ? .5 : 1) });
  visible.sort((a, b) => a.y - b.y); for (const item of visible) item.draw();
  if (p.attackT > 0) {
    const aim = Math.atan2(p.aimY, p.aimX), swing = (1 - p.attackT / .19) * 1.8 - .9;
    ctx.save(); ctx.translate(p.x, p.y - 9); ctx.rotate(aim + swing);
    ctx.strokeStyle = '#e5e8bf'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 25, -.7, .65); ctx.stroke();
    ctx.strokeStyle = '#c2d59860'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 21, -.9, .4); ctx.stroke(); ctx.restore();
  }
  Fx.draw();
  // 只有離散的螢光粒子，低動態偏好時保持靜止。
  for (let i = 0; i < 28; i++) {
    const t = d.reducedMotion ? 0 : d.time;
    const x = (i * 173 + 40 + Math.sin(t * .3 + i) * 12) % d.world.w;
    const y = (i * 97 + 80 + Math.cos(t * .5 + i) * 8) % d.world.h;
    ctx.globalAlpha = .3 + Math.sin(t + i) * .2; ctx.fillStyle = '#e2d18b'; ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
  if (d.debug) {
    ctx.strokeStyle = '#efc68588'; ctx.lineWidth = .5;
    for (const t of d.trees) ctx.strokeRect(Math.floor(t.x / 16) * 16, Math.floor(t.y / 16) * 16, 16, 16);
    ctx.strokeStyle = '#a9e5d5'; ctx.strokeRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  // 名牌明確標示可操作角色。
  ctx.font = '5px Consolas,monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#cddfb9'; ctx.fillText('YOU', p.x, p.y - 31);
  const vignette = ctx.createRadialGradient(p.x, p.y, GAME_W * .2, p.x, p.y, GAME_W * .8);
  vignette.addColorStop(0, '#0b1e1700'); vignette.addColorStop(1, '#091c1855');
  ctx.fillStyle = vignette; ctx.fillRect(Camera.x, Camera.y, GAME_W, GAME_H);
  TouchUI.draw();
  const m = d.metrics;
  m.draw = m.draw * .9 + (performance.now() - start) * .1;
  if (m.lastFrame) { m.gaps.push(start - m.lastFrame); if (m.gaps.length > 120) m.gaps.shift(); }
  m.lastFrame = start; m.frames++;
  if (start - m.started >= 250) {
    m.fps = Math.round(m.frames * 1000 / (start - m.started)); m.frames = 0; m.started = start;
    m.history.push(m.fps); if (m.history.length > 48) m.history.shift();
    forestHUD();
  }
}

function forestHUD() {
  const d = ForestDemo, p = d.player, m = d.metrics;
  forestEl('fps').textContent = m.fps || '—';
  const avgGap = m.gaps.length ? m.gaps.reduce((a, b) => a + b, 0) / m.gaps.length : 0;
  forestEl('frame-ms').textContent = avgGap ? avgGap.toFixed(1) + ' ms / frame' : '量測中';
  forestEl('update-ms').textContent = m.update.toFixed(2) + ' ms';
  forestEl('draw-ms').textContent = m.draw.toFixed(2) + ' ms';
  forestEl('fps-chart').setAttribute('points', m.history.map((fps, i) => (i * 168 / 47).toFixed(1) + ',' + (32 - Math.min(120, fps) / 120 * 30).toFixed(1)).join(' '));
  forestEl('entities').textContent = d.creatures.filter(c => c.respawn <= 0).length + ' 生物';
  forestEl('seeds').textContent = String(d.collected).padStart(2, '0');
  forestEl('objective').textContent = d.collected === 8 ? '石環甦醒了' : '找回散落的光種';
  forestEl('seed-dots').innerHTML = d.seeds.map(s => '<i' + (s.taken ? ' class="found"' : '') + '></i>').join('');
  forestEl('hearts').innerHTML = Array.from({ length: 5 }, (_, i) => '<i' + (i >= p.health ? ' class="empty"' : '') + '></i>').join('');
  forestEl('hearts').setAttribute('aria-label', '生命值 ' + p.health + ' / 5');
  forestEl('dash-fill').style.width = Math.round((1 - p.dashCd / 1.1) * 100) + '%';
  forestEl('position').textContent = Math.round(p.x) + ' / ' + Math.round(p.y);
  forestEl('hits').textContent = '命中 ' + d.hits;
}

window.addEventListener('load', async () => {
  G.canvas = forestEl('game'); forestLayout();
  forestEl('objective').textContent = '載入森林素材…';
  await loadAll(FOREST_ART);
  // 載入錯誤明確顯示，避免使用者看到空白場景。
  const failed = Object.values(ASSETS).some(img => !img.complete || !img.naturalWidth);
  if (failed) { forestEl('objective').textContent = '素材載入失敗，請重新整理'; return; }
  Input.init({ Space: 'attack', KeyJ: 'attack', ShiftLeft: 'dash', ShiftRight: 'dash', KeyR: 'restart', KeyP: 'pause' });
  Loop.fixedStep = 1 / 60;
  Sfx.setMaster(.22);
  Sfx.register({
    forestSwing() { this.noise(.05, .06); },
    forestHit() { this.tone(180, 70, .08, 'triangle', .15); },
    forestDash() { this.tone(220, 440, .09, 'sine', .08); },
    forestSeed() { this.tone(740, 1100, .12, 'sine', .16); this.tone(1100, 1480, .12, 'sine', .1, .07); },
  });
  TouchUI.showIn = ['play'];
  TouchUI.setButtons([{ a: 'attack', label: '擊', tint: '#edcf8d', r: 34, dx: 8, dy: 0 }, { a: 'dash', label: '衝', tint: '#b9d5b3', r: 28, dx: -71, dy: -5 }]);
  TouchUI.init();
  for (const button of document.querySelectorAll('button')) button.addEventListener('pointerdown', e => e.stopPropagation());
  forestEl('pause').addEventListener('click', () => forestPause(!ForestDemo.paused));
  forestEl('reset').addEventListener('click', forestReset);
  forestEl('population').addEventListener('click', () => {
    const options = [24, 80, 160]; ForestDemo.population = options[(options.indexOf(ForestDemo.population) + 1) % options.length];
    forestPopulation(); forestHUD(); forestNotice('場上生物切換為 ' + ForestDemo.population + ' 隻。', 2);
  });
  addEventListener('resize', forestLayout);
  addEventListener('blur', () => forestPause(true));
  forestReset();
  ForestDemo.ready = true;
  Loop.update = forestUpdate; Loop.render = forestRender; Loop.start();
});
