const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
function setup(){const events={},c=vm.createContext({GAME_W:320,GAME_H:180,addEventListener(){}});
  for(const f of ['level','edit'])vm.runInContext(fs.readFileSync(`engine/${f}.js`,'utf8'),c);
  vm.runInContext('this.E=Edit;this.L=Level.create({cols:4,rows:4,cell:16})',c);
  const canvas={addEventListener:(n,f)=>events[n]=f,getBoundingClientRect:()=>({left:0,top:0,width:320,height:180})};
  c.E.init({level:c.L,canvas,markers:[{key:'entry',name:'Entry'}],objectTypes:[{type:'hero',name:'Hero'}]});c.E.enabled=true;return {...c,events};}
test('undo restores tiles, nested metadata and objects',()=>{const {E,L}=setup();L.meta.entry=[1,2];L.objects.push({type:'hero',cx:2,cy:2});E.pushUndo();L.tiles[0]=1;L.meta.entry[0]=3;L.objects[0].cx=3;assert.equal(E.undo(),true);assert.equal(L.tiles[0],0);assert.equal(L.meta.entry[0],1);assert.equal(L.objects[0].cx,2)});
test('pointer outside map and palette is left to the game',()=>{const {events}=setup();let prevented=false;events.pointerdown({clientX:200,clientY:60,button:0,preventDefault(){prevented=true},stopPropagation(){prevented=true}});assert.equal(prevented,false)});
test('right click removes existing marker',()=>{const {E,L}=setup();E.sel=1;E.painting=1;E.paint({cx:1,cy:1});assert.equal(L.meta.entry[0],1);E.lastPaint=null;E.painting=-1;E.paint({cx:1,cy:1});assert.equal(L.meta.entry,undefined)});
