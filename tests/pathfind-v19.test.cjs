const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() {
  const c = vm.createContext({U:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),dist:Math.hypot}, Physics:{solids:[],hit:()=>false}});
  vm.runInContext(fs.readFileSync('engine/pathfind.js','utf8')+'\nthis.P=Pathfind;',c);
  c.P.cell=1; c.P.w=8; c.P.h=8; c.P.grid=new Uint8Array(64); c.P.smooth=p=>p;
  return c.P;
}
function shortest(g) {
  const ds=Array(64).fill(Infinity);ds[0]=0;const seen=new Set();
  for(let n=0;n<64;n++) { let u=-1; for(let i=0;i<64;i++)if(!seen.has(i)&&(u<0||ds[i]<ds[u]))u=i;
    if(!Number.isFinite(ds[u]))break; if(u===63)return ds[u];seen.add(u);
    const x=u%8,y=Math.floor(u/8);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const a=x+dx,b=y+dy;if(a<0||a>=8||b<0||b>=8||g[b*8+a]||(dx&&dy&&(g[y*8+a]||g[b*8+x])))continue;
      ds[b*8+a]=Math.min(ds[b*8+a],ds[u]+(dx&&dy?Math.SQRT2:1));
    }
  } return Infinity;
}
test('random maps have optimal path length and preserve endpoints',()=>{
  let seed=7;for(let n=0;n<80;n++) {const p=load();for(let i=1;i<63;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;p.grid[i]=(seed>>>24)<55?1:0;}
    const best=shortest(p.grid), route=p.find(.5,.5,7.5,7.5);if(!Number.isFinite(best)){assert.equal(route.length,0);continue;}
    let prev={x:.5,y:.5},len=0;for(const q of route){len+=Math.hypot(q.x-prev.x,q.y-prev.y);prev=q;}
    assert.ok(Math.abs(len-best)<1e-5,`${n}: ${len} vs ${best}`);assert.equal(prev.x,7.5);assert.equal(prev.y,7.5);
  }
});
test('nested queries on the same pathfinder do not corrupt the outer search',()=>{
  const p=load(), orig=p.blocked;let nested=false;
  p.blocked=function(x,y){if(!nested){nested=true;assert.ok(this.find(.5,.5,4.5,4.5).length);}return orig.call(this,x,y)};
  assert.ok(p.find(.5,.5,7.5,7.5).length);
});
