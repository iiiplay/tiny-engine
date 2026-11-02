const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function grid() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync('engine/grid.js', 'utf8') + '\nthis.Grid = Grid;', ctx);
  return ctx.Grid.create({cols: 5, rows: 3});
}
test('weighted paths avoid expensive terrain and accept fractional costs', () => {
  const g = grid(); g.setCosts({2: 10});
  for (let x = 1; x < 4; x++) g.setTile(x, 1, 2);
  const p = g.findPath({cx:0,cy:1},{cx:4,cy:1});
  assert.equal(p.totalCost, 6);
  const q = g.findPath({cx:0,cy:1},{cx:4,cy:1}, {cost:(x,y) => y === 0 ? 0.1 : 1});
  assert.ok(q.totalCost < 3);
});
test('weighted field, costs, maxNodes, and isolated maps', () => {
  const g = grid(); g.setTile(1, 0, 2).setCost(2, 3);
  assert.equal(g.solid(1,0), false);
  assert.equal(g.weightedField({from:{cx:0,cy:0}})[g.idx(1,0)], 3);
  assert.equal(g.findPath({cx:0,cy:0},{cx:4,cy:2},{maxNodes:1}).length, 0);
  assert.equal(grid().solid(1,0), false);
});
test('diagonal paths and downhill do not cut blocked corners', () => {
  const g = grid(); g.setTile(1,0,1); g.setTile(0,1,1);
  assert.equal(g.findPath({cx:0,cy:0},{cx:1,cy:1},{diagonal:true}).length, 0);
  const f = new Float32Array(15).fill(-1); f[g.idx(1,1)] = 0;
  assert.equal(g.downhill(f,0,0,{diagonal:true}), null);
});
test('turn cost counts changes in direction', () => {
  const g = grid(); const p = g.findPath({cx:0,cy:0},{cx:3,cy:2},{turnCost:2});
  assert.equal(p.turns, 1); assert.equal(p.totalCost, 7);
});
