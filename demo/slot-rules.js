'use strict';
/* 純規則層：隨機來源由呼叫端注入，不依賴畫面、時鐘或 localStorage。 */
const SlotRules = (() => {
  const symbols = [
    { id: 'coin', name: '金幣', weight: 26, color: '#e5c677', pays: [4, 12, 40] },
    { id: 'jade', name: '翡翠', weight: 22, color: '#86d6a2', pays: [5, 18, 60] },
    { id: 'ruby', name: '紅玉', weight: 18, color: '#e99c9a', pays: [8, 25, 100] },
    { id: 'heart', name: '生命之心', weight: 14, color: '#e7839b', pays: [10, 40, 150] },
    { id: 'chest', name: '寶箱', weight: 10, color: '#d7b681', pays: [15, 60, 250] },
    { id: 'wild', name: 'WILD', weight: 6, color: '#c1dfbc', pays: [20, 100, 500] },
    { id: 'scatter', name: 'SCATTER', weight: 4, color: '#c7b3ed', pays: [] },
  ];
  const lines = [
    [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
    [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [0,1,1,1,0],
    [2,1,1,1,2], [1,0,1,2,1], [1,2,1,0,1], [0,1,0,1,0], [2,1,2,1,2],
    [1,1,0,1,1], [1,1,2,1,1], [0,2,0,2,0], [2,0,2,0,2], [0,2,1,2,0],
  ];
  const bets = [20, 40, 100, 200, 500];
  function validBoard(board) {
    return Array.isArray(board) && board.length === 5 && board.every(col => Array.isArray(col) && col.length === 3 && col.every(n => Number.isInteger(n) && n >= 0 && n < symbols.length));
  }
  function pick(random = Math.random) {
    const value = random();
    if (!(value >= 0 && value < 1)) throw new Error('隨機值必須介於 0（含）與 1（不含）之間');
    let n = value * 100;
    for (let i = 0; i < symbols.length; i++) { n -= symbols[i].weight; if (n < 0) return i; }
    return symbols.length - 1;
  }
  function generate(random = Math.random) {
    return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => pick(random)));
  }
  function evaluate(board, bet) {
    if (!validBoard(board) || !bets.includes(bet)) throw new Error('轉輪或下注資料無效');
    const wins = [], unit = bet / lines.length;
    lines.forEach((line, lineIndex) => {
      let best = null;
      // 對每個候選符號試算，選最高派彩；前三個 Wild 不會錯過較高的 Wild 賠付。
      for (let symbol = 0; symbol < 6; symbol++) {
        let count = 0;
        for (let col = 0; col < 5; col++) {
          const current = board[col][line[col]];
          if (current !== symbol && current !== 5) break;
          count++;
        }
        if (count < 3) continue;
        const amount = symbols[symbol].pays[count - 3] * unit;
        if (!best || amount > best.amount) best = { line: lineIndex, symbol, count, amount, cells: line.slice(0, count).map((row, col) => [col, row]) };
      }
      if (best) wins.push(best);
    });
    const scatterCells = [];
    board.forEach((col, x) => col.forEach((symbol, y) => { if (symbol === 6) scatterCells.push([x, y]); }));
    const scatterCount = scatterCells.length;
    const bonusIndex = Math.min(5, scatterCount) - 3;
    const freeAward = scatterCount >= 3 ? [8, 12, 20][bonusIndex] : 0;
    const scatterWin = scatterCount >= 3 ? [2, 5, 10][bonusIndex] * bet : 0;
    const total = wins.reduce((sum, win) => sum + win.amount, 0) + scatterWin;
    return { wins, scatterCount, scatterCells, freeAward, scatterWin, total };
  }
  function fresh() {
    return { version: 1, balance: 2000, bet: 20, freeBet: 20, freeRemaining: 0, lastWin: 0, lastBoard: null, totalSpins: 0, serial: 0, gifted: false, pending: null };
  }
  function restore(raw) {
    const state = fresh();
    if (!raw || raw.version !== 1) return state;
    for (const field of ['balance', 'lastWin', 'totalSpins', 'serial']) {
      if (Number.isSafeInteger(raw[field]) && raw[field] >= 0) state[field] = raw[field];
    }
    if (bets.includes(raw.bet)) state.bet = raw.bet;
    if (bets.includes(raw.freeBet)) state.freeBet = raw.freeBet;
    if (validBoard(raw.lastBoard)) state.lastBoard = raw.lastBoard.map(col => col.slice());
    if (Number.isInteger(raw.freeRemaining) && raw.freeRemaining >= 0 && raw.freeRemaining <= 10000) state.freeRemaining = raw.freeRemaining;
    state.gifted = raw.gifted === true;
    if (raw.pending && validBoard(raw.pending.board) && bets.includes(raw.pending.bet)) {
      state.pending = { board: raw.pending.board.map(col => col.slice()), bet: raw.pending.bet, free: raw.pending.free === true, serial: state.serial };
    }
    return state;
  }
  function start(state, random = Math.random) {
    if (state.pending) return false;
    const free = state.freeRemaining > 0;
    const bet = free ? state.freeBet : state.bet;
    if (!free && state.balance < bet) return false;
    // 先生成並驗證，再扣款；失敗的隨機來源不能讓遊戲幣憑空減少。
    const board = generate(random);
    if (free) state.freeRemaining--; else state.balance -= bet;
    state.serial++;
    state.pending = { board, bet, free, serial: state.serial };
    return true;
  }
  function settle(state) {
    if (!state.pending) return null;
    const pending = state.pending, result = evaluate(pending.board, pending.bet);
    state.balance += result.total;
    state.lastWin = result.total;
    state.lastBoard = pending.board.map(col => col.slice());
    state.totalSpins++;
    if (result.freeAward) { state.freeBet = pending.bet; state.freeRemaining += result.freeAward; }
    state.pending = null;
    return { ...result, board: pending.board, bet: pending.bet, free: pending.free };
  }
  function changeBet(state, direction) {
    if (state.pending || state.freeRemaining) return false;
    const i = bets.indexOf(state.bet), next = Math.max(0, Math.min(bets.length - 1, i + direction));
    state.bet = bets[next]; return next !== i;
  }
  function gift(state) {
    if (state.pending || state.freeRemaining || state.gifted) return false;
    state.gifted = true; state.freeBet = state.bet; state.freeRemaining = 8;
    return true;
  }
  return { symbols, lines, bets, validBoard, pick, generate, evaluate, fresh, restore, start, settle, changeBet, gift };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SlotRules;
