import importlib.util, json
spec=importlib.util.spec_from_file_location('serve','tools/serve.py')
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
class Conn:
    def __init__(self): self.alive=True; self.messages=[]
    def send(self, data): self.messages.append(json.loads(data))
r=mod.Rooms
h=Conn(); a=Conn(); b=Conn(); c=Conn(); extra=Conn()
assert r.join('T','host',h,'host') is not False
for n,p in enumerate([a,b,c],1):
    assert r.join('T','peer',p,'peer'+str(n)) is not False
    assert p.peer_id==n
assert r.join('T','peer',extra,'extra') is False
assert extra.messages[-1]['msg']=='room-full'
assert r.relay('T','peer',json.dumps({'t':'i','id':3,'m':{}}),a)
assert h.messages[-1]['id']==1
assert not r.relay('T','peer',json.dumps({'t':'sys','msg':'peer-left'}),a)
assert not r.relay('T','peer',json.dumps({'t':'i','id':3}),extra)
r.leave('T','peer',b); b.alive=False
b2=Conn(); assert r.join('T','peer',b2,'peer2') is not False
assert b2.peer_id==2 and b2.messages[0]['reconnected']
for role,p in [('peer',a),('peer',b2),('peer',c),('host',h)]:r.leave('T',role,p)
assert not r._rooms
