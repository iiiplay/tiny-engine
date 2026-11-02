// 規則測試只依賴 Node；包含 Wild 邊界、免費旋轉、重整恢復及重複結算。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../demo/slot-rules.js');
const empty = () => [[0,6,6],[1,6,6],[2,6,6],[3,6,6],[4,6,6]];

test('20 條線都合法且沒有重複', () => {
  assert.equal(R.lines.length, 20);
  assert.equal(new Set(R.lines.map(JSON.stringify)).size, 20);
  assert.ok(R.lines.every(line => line.length === 5 && line.every(row => row >= 0 && row <= 2)));
});
test('五個金幣每線 40 倍，下注 20 時共 800', () => {
  const result = R.evaluate(Array.from({length:5},()=>[0,0,0]), 20);
  assert.equal(result.total, 800); assert.equal(result.wins.length, 20);
});
test('Wild 可替代普通符號，Scatter 不可替代', () => {
  const board = empty(); [0,5,0,1,2].forEach((s,i)=>board[i][1]=s);
  const win = R.evaluate(board,20).wins.find(w=>w.line===0);
  assert.equal(win.symbol,0); assert.equal(win.count,3); assert.equal(win.amount,4);
  board[1][1]=6;
  assert.equal(R.evaluate(board,20).wins.some(w=>w.line===0),false);
});
test('前三個 Wild 取最高派彩，不會強迫採用較低的後續符號', () => {
  const board=empty(); [5,5,5,0,1].forEach((s,i)=>board[i][1]=s);
  const win=R.evaluate(board,20).wins.find(w=>w.line===0);
  assert.equal(win.symbol,5); assert.equal(win.amount,20); assert.equal(win.count,3);
});
test('連線從最左軸連續起算，不計右側單獨三連', () => {
  const board=empty(); [1,2,0,0,0].forEach((s,i)=>board[i][1]=s);
  assert.equal(R.evaluate(board,20).wins.some(w=>w.line===0),false);
});
test('3／4／5 Scatter 分別送 8／12／20 次並支付總下注倍數', () => {
  for(const [count,free,mult] of [[3,8,2],[4,12,5],[5,20,10]]) {
    const board=Array.from({length:5},(_,i)=>[i%5,(i+1)%5,(i+2)%5]);
    for(let i=0;i<count;i++) board[i][0]=6;
    const result=R.evaluate(board,40);
    assert.equal(result.freeAward,free);assert.equal(result.scatterWin,mult*40);
  }
});
test('連點只扣款一次，結算只派彩一次', () => {
  const state=R.fresh(); assert.equal(R.start(state,()=>0),true);
  assert.equal(state.balance,1980);assert.equal(R.start(state,()=>0),false);
  assert.equal(R.settle(state).total,800);assert.equal(state.balance,2780);
  assert.equal(R.settle(state),null);assert.equal(state.balance,2780);assert.equal(state.totalSpins,1);
});
test('免費旋轉不扣款，保留觸發時下注且可再次觸發', () => {
  const state=R.fresh();state.bet=100;assert.equal(R.gift(state),true);
  assert.equal(R.changeBet(state,1),false);state.bet=20;
  assert.equal(R.start(state,()=>.99),true);assert.equal(state.balance,2000);
  assert.equal(state.pending.bet,100);assert.equal(state.freeRemaining,7);
  const result=R.settle(state);assert.equal(result.freeAward,20);assert.equal(state.freeRemaining,27);
});
test('未完成的旋轉可從存檔恢復，已扣款不再重扣', () => {
  const state=R.fresh();R.start(state,()=>0);
  const restored=R.restore(JSON.parse(JSON.stringify(state)));
  R.settle(restored);assert.equal(restored.balance,2780);assert.equal(restored.totalSpins,1);
  const again=R.restore(JSON.parse(JSON.stringify(restored)));assert.equal(R.settle(again),null);
  assert.deepEqual(again.lastBoard,Array.from({length:5},()=>[0,0,0]));
});
test('體驗贈送只領一次，且不能覆蓋進行中的免費旋轉', () => {
  const state=R.fresh();assert.equal(R.gift(state),true);assert.equal(R.gift(state),false);
  state.freeRemaining=0;assert.equal(R.gift(state),false);
  const pending=R.fresh();R.start(pending,()=>0);assert.equal(R.gift(pending),false);
});
test('餘額不足或不合法亂數不改變狀態', () => {
  const state=R.fresh();state.balance=0;assert.equal(R.start(state),false);assert.equal(state.pending,null);
  state.balance=2000;assert.throws(()=>R.start(state,()=>1));assert.equal(state.balance,2000);assert.equal(state.pending,null);
});
test('防守性讀取存檔與轉輪格式', () => {
  const state=R.restore({version:1,balance:-1,bet:33,freeRemaining:-2,pending:{board:[[99]],bet:20}});
  assert.equal(state.balance,2000);assert.equal(state.bet,20);assert.equal(state.pending,null);
  assert.throws(()=>R.evaluate([[0]],20));assert.throws(()=>R.evaluate(R.generate(()=>0),21));
});
test('多種種子連續遊玩，金額守恆且派彩皆為整數', () => {
  for(let seed=1;seed<=20;seed++) {
    let n=seed, expected=200000;
    const random=()=>{ n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296; };
    const state=R.fresh();state.balance=expected;
    for(let i=0;i<500;i++) {
      const free=state.freeRemaining>0, wager=free?state.freeBet:state.bet;
      assert.equal(R.start(state,random),true);
      const result=R.settle(state);expected+=result.total-(free?0:wager);
      assert.equal(state.balance,expected);assert.ok(Number.isSafeInteger(result.total));assert.ok(state.freeRemaining>=0);
    }
  }
});
