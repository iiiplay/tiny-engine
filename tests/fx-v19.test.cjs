const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
test('expired particles are recycled without skipping live particles',()=>{
  const c=vm.createContext({U:{rand:()=>0.3}}); vm.runInContext(fs.readFileSync('engine/fx.js','utf8')+'\nthis.fx=Fx',c);
  const p=(life)=>({life,x:0,y:0,vx:1,vy:0,grav:0});const dead=p(.1),alive=p(2),dead2=p(.1);
  c.fx.parts=[dead,alive,dead2];c.fx.update(.2);
  assert.equal(c.fx.parts.length,1);assert.equal(c.fx.parts[0],alive);assert.equal(alive.x,.2);assert.equal(c.fx.pool.length,2);
  c.fx.burst(0,0,'red',2);assert.equal(c.fx.pool.length,0);assert.equal(c.fx.parts.length,3);
});
