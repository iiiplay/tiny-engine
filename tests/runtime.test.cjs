// 輸入與時間步回歸：使用真實引擎程式，控制時鐘與瀏覽器事件。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime() {
  const events = {};
  const context = vm.createContext({
    performance: { now: () => 1000 },
    addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    Sfx: { unlock() {} }, Fx: { freezeT: 0, update() {} },
    TouchUI: { enabled: false, held: new Set(), update() {} },
  });
  for (const name of ['util', 'core', 'input']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../engine', name + '.js'), 'utf8'), context);
  }
  const run = code => vm.runInContext(code, context);
  run('Input.init(); Camera.update = () => {}; Loop._last = 1000;');
  function event(type, code) {
    for (const fn of events[type] || []) fn({ code, preventDefault() {} });
  }
  return { run, event };
}

test('零次固定更新保留按鍵，下一次更新只觸發一次', () => {
  const { run, event } = runtime();
  run("Loop.fixedStep = 1 / 60; let presses = 0; Loop.update = () => { if (Input.justPressed('confirm')) presses++; };");
  event('keydown', 'Enter');
  run('Loop.tick(1008); Loop.tick(1017);');
  assert.equal(run('presses'), 1);
});

test('同畫面補跑多次更新，單次按鍵只觸發一次', () => {
  const { run, event } = runtime();
  run("Loop.fixedStep = 1 / 60; let presses = 0; Loop.update = () => { if (Input.justPressed('confirm')) presses++; };");
  event('keydown', 'Enter');
  run('Loop.tick(1034);');
  assert.equal(run('presses'), 1);
  assert.equal(run("Input.isDown('confirm')"), true);
});

test('同方向兩個鍵放開其中一個，仍保持移動', () => {
  const { run, event } = runtime();
  event('keydown', 'ArrowRight'); event('keydown', 'KeyD');
  event('keyup', 'KeyD');
  assert.equal(run("Input.isDown('right') && Input.keyDown.right"), true);
  event('keyup', 'ArrowRight');
  assert.equal(run("Input.isDown('right')"), false);
});

test('鍵盤放開時保留仍按住的觸控按鈕', () => {
  const { run, event } = runtime();
  run("TouchUI.enabled = true; TouchUI.held.add('confirm'); Input.down.confirm = true;");
  event('keydown', 'Enter'); event('keyup', 'Enter');
  assert.equal(run("Input.isDown('confirm')"), true);
  assert.equal(run('Input.keyDown.confirm'), false);
});

test('失焦會清除尚未消耗的單次鍵與實體鍵', () => {
  const { run, event } = runtime();
  event('keydown', 'Enter'); event('blur');
  assert.equal(run("Input.justPressed('confirm') || Input.isDown('confirm')"), false);
  event('keydown', 'Enter');
  assert.equal(run("Input.justPressed('confirm')"), true);
});

for (const fixedStep of [0, 1 / 60]) {
  test(`60ms 背景補跑維持時間速率（fixedStep=${fixedStep}）`, () => {
    const { run } = runtime();
    run(`Loop.fixedStep = ${fixedStep}; let elapsed = 0, largest = 0; Loop.update = dt => { elapsed += dt; largest = Math.max(largest, dt); };`);
    for (let i = 1; i <= 100; i++) run(`Loop.tick(${1000 + i * 60});`);
    assert.ok(Math.abs(run('elapsed') - 6) < 0.017);
    assert.ok(run('largest') <= 0.05);
  });
}

test('長時間停頓仍限制補跑成本，時間倒退不產生負 dt', () => {
  const { run } = runtime();
  run('let elapsed = 0, smallest = 1; Loop.update = dt => { elapsed += dt; smallest = Math.min(smallest, dt); }; Loop.tick(11000); Loop.tick(10999);');
  assert.ok(run('elapsed') <= 0.25 + 1e-9);
  assert.ok(run('smallest') >= 0);
});

test('timer 與 rAF 交接不會重複計算較舊時間戳', () => {
  const { run } = runtime();
  run('let elapsed = 0; Loop.update = dt => elapsed += dt; Loop.tick(1060); Loop.tick(1055); Loop.tick(1070);');
  assert.ok(Math.abs(run('elapsed') - 0.07) < 1e-9);
});

test('變動時間步補跑多步也只消耗一次按鍵', () => {
  const { run, event } = runtime();
  run("let presses = 0; Loop.update = () => { if (Input.justPressed('confirm')) presses++; };");
  event('keydown', 'Enter');
  run('Loop.tick(1120);');
  assert.equal(run('presses'), 1);
});

test('鍵盤自動重複事件不產生第二次單次鍵', () => {
  const { run, event } = runtime();
  run("let presses = 0; Loop.update = () => { if (Input.justPressed('confirm')) presses++; };");
  event('keydown', 'Enter'); run('Loop.tick(1017);');
  event('keydown', 'Enter'); run('Loop.tick(1034);');
  assert.equal(run('presses'), 1);
  event('keyup', 'Enter'); event('keydown', 'Enter'); run('Loop.tick(1051);');
  assert.equal(run('presses'), 2);
});
