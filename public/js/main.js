const $=s=>document.querySelector(s);const menu=$('#menu'),game=$('#game'),canvas=$('#canvas'),ctx=canvas.getContext('2d');
let ws=null,myId=null,room=null,world={w:3200,h:2100},players=new Map(),keys={},camera={x:0,y:0},last=performance.now(),particles=[];
const params=new URLSearchParams(location.search);let roomFromLink=params.get('room');
function name(){return $('#name').value.trim().slice(0,18)||'Lumi'}
function wsUrl(code,create=false){const proto=location.protocol==='https:'?'wss':'ws';let u=`${proto}://${location.host}/?room=${encodeURIComponent(code)}`;if(create)u+=`&name=${encodeURIComponent(name())}`;else u+=`&name=${encodeURIComponent(name())}`;return u}
async function loadRooms(){try{const data=await fetch('/api/rooms').then(r=>r.json());$('#rooms').innerHTML=data.map(r=>`<div class="room"><div><strong>${r.name}</strong><small>${r.count}/${r.max} players${r.started?' • LIVE':' • waiting'}</small></div><button data-room="${r.code}">ENTER</button></div>`).join('')||'<div class="room-empty">No worlds online.</div>';document.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>connect(b.dataset.room))}catch{$('#rooms').innerHTML='<div class="room-empty">Server is waking up…</div>'}}
function connect(code,create=false){if(ws)ws.close();ws=new WebSocket(wsUrl(code,create));toast('Connecting…');ws.onopen=()=>{toast('Connected');if(create)history.replaceState({},'',`?room=${encodeURIComponent(code)}`)};ws.onmessage=e=>handle(JSON.parse(e.data));ws.onclose=()=>{if(!game.classList.contains('hidden'))toast('Connection lost — refresh to reconnect')};ws.onerror=()=>toast('Connection error')}
function handle(m){
 if(m.type==='error'){toast(m.message);return}
 if(m.type==='welcome'){myId=m.id;room=m.room;world=m.world;players.clear();room.players.forEach(p=>players.set(p.id,p));showGame();updateUI();return}
 if(m.type==='room-state'){room=m.room;if(room)room.players.forEach(p=>{if(players.has(p.id))Object.assign(players.get(p.id),p);else players.set(p.id,p)});updateUI();return}
 if(m.type==='player-joined'){players.set(m.player.id,m.player);toast(`${m.player.name} joined the world`);updateUI();return}
 if(m.type==='player-left'){players.delete(m.id);updateUI();return}
 if(m.type==='snapshot'){m.players.forEach(p=>{const old=players.get(p.id);if(old){old.tx=p.x;old.ty=p.y;old.x=p.x;old.y=p.y;Object.assign(old,p)}else players.set(p.id,{...p,tx:p.x,ty:p.y})});return}
 if(m.type==='match-start'){room.started=true;toast('The world is awake ✦');$('#startHint').textContent='Explore together • Collect memories • Change the world';return}
 if(m.type==='world-change'){room.phase=m.phase;room.objective=m.objective;toast(`World changed — ${m.objective.label}`);burst(canvas.width/2,canvas.height/2);updateUI();return}
 if(m.type==='chat'){addChat(m.from,m.text,m.color);return}
 if(m.type==='shard'){room.objective.got=m.got;room.objective.need=m.need;toast(`${m.by} found a memory ${m.got}/${m.need}`);burst(canvas.width/2,canvas.height/2);updateUI();return}
}
function showGame(){menu.classList.add('hidden');game.classList.remove('hidden');resize();}
function updateUI(){if(!room)return;$('#objective').textContent=room.started?room.objective.label:'Waiting for another player…';$('#progress').textContent=`${room.objective.got} / ${room.objective.need}`;$('#players').textContent=`✦ ${players.size} explorer${players.size===1?'':'s'}`}
function toast(t){const el=$('#toast');el.textContent=t;el.style.opacity=1;clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.opacity=0,1900)}
function addChat(n,t,c){const d=document.createElement('div');d.className='msg';d.innerHTML=`<b style="color:${c||'#fff'}">${escapeHtml(n)}</b> ${escapeHtml(t)}`;$('#messages').appendChild(d);$('#messages').scrollTop=99999}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
$('#create').onclick=()=>connect('CREATE',true);$('#leave').onclick=()=>{if(ws)ws.close();location.href=location.pathname};
$('#chatForm').onsubmit=e=>{e.preventDefault();const input=$('#chatInput');if(input.value.trim()&&ws?.readyState===1)ws.send(JSON.stringify({type:'chat',text:input.value.trim()}));input.value=''};
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){keys[e.key.toLowerCase()]=true;e.preventDefault()}});addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
document.querySelectorAll('.controls button').forEach(b=>{const k=b.dataset.key;const down=e=>{e.preventDefault();keys[k]=true};const up=e=>{e.preventDefault();keys[k]=false};b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up)});
function sendInput(){if(ws?.readyState!==1)return;ws.send(JSON.stringify({type:'input',u:!!(keys.w||keys.arrowup||keys.u),d:!!(keys.s||keys.arrowdown),l:!!(keys.a||keys.arrowleft),r:!!(keys.d||keys.arrowright),typing:document.activeElement===$('#chatInput')}))}
setInterval(sendInput,50);
function resize(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}addEventListener('resize',resize);resize();
function worldToScreen(x,y){return{x:x-camera.x,y:y-camera.y}}
function draw(){const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);const phase=room?.phase||0;ctx.fillStyle=phase===0?'#09121e':phase===1?'#0b1820':phase===2?'#101525':'#151126';ctx.fillRect(0,0,w,h);camera.x+=(clamp((players.get(myId)?.x||world.w/2)-w/2,0,world.w-w)-camera.x)*.12;camera.y+=(clamp((players.get(myId)?.y||world.h/2)-h/2,0,world.h-h)-camera.y)*.12;
 // grid / roads
 ctx.save();ctx.translate(-camera.x,-camera.y);for(let x=0;x<world.w;x+=80){ctx.strokeStyle='rgba(130,170,210,.035)';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,world.h);ctx.stroke()}for(let y=0;y<world.h;y+=80){ctx.strokeStyle='rgba(130,170,210,.035)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(world.w,y);ctx.stroke()}
 // city blocks
 for(let x=160;x<world.w-160;x+=360)for(let y=160;y<world.h-160;y+=300){ctx.fillStyle='rgba(255,255,255,.025)';ctx.fillRect(x,y,260,180);ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(x+18,y+18,224,10)}
 // water and garden
 ctx.fillStyle='rgba(74,170,210,.08)';ctx.beginPath();ctx.ellipse(2500,500,420,220,0,0,Math.PI*2);ctx.fill();if(phase>=2){ctx.fillStyle='rgba(110,230,160,.11)';ctx.beginPath();ctx.arc(2380,1320,260,0,Math.PI*2);ctx.fill()}
 // beacons
 for(const b of room?.beacons||[]){const active=b.active;ctx.beginPath();ctx.arc(b.x,b.y,active?34:24,0,Math.PI*2);ctx.fillStyle=active?'rgba(116,215,255,.16)':'rgba(255,255,255,.05)';ctx.fill();ctx.strokeStyle=active?'#74d7ff':'#56617a';ctx.stroke();ctx.beginPath();ctx.arc(b.x,b.y,8,0,Math.PI*2);ctx.fillStyle=active?'#fff':'#74809a';ctx.fill()}
 // memory motes
 for(let i=0;i<14;i++){const x=320+(i*431)%2500,y=300+(i*617)%1500;const glow=10+Math.sin(performance.now()/500+i)*3;ctx.shadowBlur=glow;ctx.shadowColor='#74d7ff';ctx.fillStyle='#a9ecff';ctx.fillRect(x,y,4,4)}ctx.shadowBlur=0;
 for(const p of players.values()){const me=p.id===myId;ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(p.x,p.y+18,18,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#07101b';ctx.beginPath();ctx.arc(p.x-5,p.y-3,2.3,0,Math.PI*2);ctx.arc(p.x+5,p.y-3,2.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(me?'YOU':p.name,p.x,p.y-27);}
 ctx.restore();
 for(const q of particles){q.x+=q.vx;q.y+=q.vy;q.life-=.03;ctx.globalAlpha=Math.max(0,q.life);ctx.fillStyle='#9deaff';ctx.fillRect(q.x,q.y,3,3)}ctx.globalAlpha=1;requestAnimationFrame(draw)}
function burst(x,y){for(let i=0;i<24;i++)particles.push({x,y,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:1});particles=particles.slice(-100)}
requestAnimationFrame(draw);
if(roomFromLink)connect(roomFromLink);else loadRooms();setInterval(()=>{if(menu.classList.contains('hidden'))return;loadRooms()},4000);
