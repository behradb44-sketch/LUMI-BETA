import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.join(__dirname,'..','public');
const PORT=Number(process.env.PORT||10000);
const HOST='0.0.0.0';
const MAX_PLAYERS=16;
const TICK=20;
const rooms=new Map();
const permanentCodes=Array.from({length:10},(_,i)=>`LUMI-${String(i+1).padStart(2,'0')}`);

const world={w:3200,h:2100};
const COLORS=['#74d7ff','#ff8ab7','#b7ff79','#c8a7ff','#ffd166','#7fffd4','#ff9f68','#9db7ff'];
const SPAWNS=[{x:500,y:500},{x:760,y:500},{x:1020,y:500},{x:1280,y:500},{x:500,y:760},{x:760,y:760},{x:1020,y:760},{x:1280,y:760}];

function uid(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4)}
function code(){return 'L-'+Math.random().toString(36).slice(2,7).toUpperCase()}
function cleanName(n){return String(n||'Lumi').replace(/[<>]/g,'').trim().slice(0,18)||'Lumi'}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

class Room{
 constructor(code,name,permanent=false){
  this.code=code;this.name=name;this.permanent=permanent;this.players=new Map();this.started=false;this.phase=0;this.shards=new Set();this.objective={need:3,got:0,label:'Restore the first Memory Beacon'};this.created=Date.now();this.startedAt=0;this.hostId=null;this.lastActivity=Date.now();
  this.beacons=[{x:820,y:900,active:false},{x:1600,y:620,active:false},{x:2380,y:1320,active:false}];
 }
 add(p){if(!this.hostId)this.hostId=p.id;this.players.set(p.id,p);this.lastActivity=Date.now();}
 remove(id){this.players.delete(id);if(this.hostId===id)this.hostId=this.players.values().next().value?.id||null;this.lastActivity=Date.now()}
 start(){if(this.started)return;this.started=true;this.startedAt=Date.now();this.broadcast({type:'match-start',phase:this.phase,objective:this.objective})}
 snapshot(){return [...this.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,color:p.color,face:p.face,typing:p.typing}))}
 state(){return {code:this.code,name:this.name,permanent:this.permanent,started:this.started,phase:this.phase,objective:this.objective,players:this.snapshot(),hostId:this.hostId,beacons:this.beacons}}
 broadcast(msg,except=null){const s=JSON.stringify(msg);for(const p of this.players.values()){if(p.id!==except&&p.ws.readyState===1)p.ws.send(s)}}
 addShard(p){if(!this.started)return;const key=Math.floor(p.x/120)+':'+Math.floor(p.y/120);if(this.shards.has(key))return;this.shards.add(key);this.objective.got++;this.broadcast({type:'shard',x:p.x,y:p.y,by:p.name,got:this.objective.got,need:this.objective.need});if(this.objective.got>=this.objective.need){this.phase=Math.min(3,this.phase+1);this.objective={need:3+this.phase,got:0,label:['Restore the next Memory Beacon','Wake the sleeping district','Open the hidden garden'][this.phase-1]||'Discover the final memory'};const b=this.beacons[this.phase-1];if(b)b.active=true;this.broadcast({type:'world-change',phase:this.phase,objective:this.objective});}}
 tick(){
  if(!this.started && this.players.size>=2)this.start();
  if(this.started){for(const p of this.players.values()){if(p.input){const speed=230/TICK;let dx=0,dy=0;if(p.input.l)dx--;if(p.input.r)dx++;if(p.input.u)dy--;if(p.input.d)dy++;if(dx&&dy){dx*=.7071;dy*=.7071}p.x=clamp(p.x+dx*speed,80,world.w-80);p.y=clamp(p.y+dy*speed,80,world.h-80);if(dx||dy)p.face=Math.atan2(dy,dx);}}
   if(Math.random()<0.035){const arr=[...this.players.values()];if(arr.length)this.addShard(arr[Math.floor(Math.random()*arr.length)])}
  }
  if(this.players.size===0&&!this.permanent&&Date.now()-this.lastActivity>10*60*1000)return 'delete';
 }
}

for(let i=0;i<10;i++)rooms.set(permanentCodes[i],new Room(permanentCodes[i],`LUMI DISTRICT ${i+1}`,true));

function publicList(){return [...rooms.values()].filter(r=>!r.name.startsWith('_')).map(r=>({code:r.code,name:r.name,count:r.players.size,max:MAX_PLAYERS,permanent:r.permanent,started:r.started,phase:r.phase}));}

const server=http.createServer((req,res)=>{
 const u=new URL(req.url,`http://${req.headers.host}`);
 if(u.pathname==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return}
 if(u.pathname==='/api/rooms'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(publicList()));return}
 let p=decodeURIComponent(u.pathname);if(p==='/' )p='/index.html';
 const file=path.join(ROOT,p);if(!file.startsWith(ROOT)){res.writeHead(403);res.end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return}const ext=path.extname(file);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':'no-cache'});res.end(data)})
});

const wss=new WebSocketServer({server});
wss.on('connection',(ws,req)=>{
 const u=new URL(req.url,`http://${req.headers.host}`);let roomCode=u.searchParams.get('room');let room=roomCode?rooms.get(roomCode.toUpperCase()):null;
 if(roomCode==='CREATE'){room=new Room(code(),cleanName(u.searchParams.get('name')),u.searchParams.get('private')==='1');rooms.set(room.code,room)}
 if(!room){ws.send(JSON.stringify({type:'error',message:'Room not found'}));ws.close();return}
 if(room.players.size>=MAX_PLAYERS){ws.send(JSON.stringify({type:'error',message:'Room is full'}));ws.close();return}
 const id=uid();const spawn=SPAWNS[room.players.size%SPAWNS.length];const p={id,name:cleanName(u.searchParams.get('name')),color:COLORS[room.players.size%COLORS.length],x:spawn.x,y:spawn.y,face:0,typing:false,input:{},ws};room.add(p);
 ws.send(JSON.stringify({type:'welcome',id,room:room.state(),world}));room.broadcast({type:'player-joined',player:{id:p.id,name:p.name,color:p.color,x:p.x,y:p.y}},id);room.broadcast({type:'room-state',room:room.state()});
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw.toString())}catch{return}if(m.type==='input'){p.input={u:!!m.u,d:!!m.d,l:!!m.l,r:!!m.r};p.typing=!!m.typing}else if(m.type==='chat'){const text=String(m.text||'').replace(/[<>]/g,'').trim().slice(0,160);if(text)room.broadcast({type:'chat',from:p.name,color:p.color,text},null)}else if(m.type==='ping'){ws.send(JSON.stringify({type:'pong',t:m.t}))}else if(m.type==='join-start'){room.start()}});
 ws.on('close',()=>{room.remove(id);room.broadcast({type:'player-left',id});room.broadcast({type:'room-state',room:room.state()})});
});

setInterval(()=>{for(const [k,r] of rooms){if(r.tick()==='delete')rooms.delete(k);else if(r.started&&r.players.size)r.broadcast({type:'snapshot',players:r.snapshot(),phase:r.phase,objective:r.objective})}},1000/TICK);
setInterval(()=>{for(const r of rooms.values()){if(r.players.size)r.broadcast({type:'room-state',room:r.state()})}},1000);
setInterval(()=>{for(const ws of wss.clients){if(ws.readyState===1)ws.ping()}},25000);
server.listen(PORT,HOST,()=>console.log(`LUMI REBORN listening on ${HOST}:${PORT}`));
