(()=>{"use strict";
const $=id=>document.getElementById(id), canvas=$("game"),ctx=canvas.getContext("2d"),W=960,H=720;
let state="menu",mode="solo",paused=false,peer=null,conn=null,isHost=false,room="",slot=-1,opponent=null,opName="RAKİP",myName="PILOT",players={},lastSend=0,last=0,score=0,wave=1,hp=100,bombs=3,fireCd=0,spawn=0,elapsed=0,raceLeft=180,finish=false;
let player={x:480,y:610,vx:0,vy:0},bullets=[],foes=[],enemyShots=[],stars=[],keys={},particles=[];
for(let i=0;i<130;i++)stars.push({x:Math.random()*W,y:Math.random()*H,s:0.5+Math.random()*2,v:20+Math.random()*80});
function message(t){$("menuMsg").textContent=t}
function status(t){$("netStatus").textContent=t}
function show(which){$("menu").classList.toggle("hidden",which!=="menu");$("lobby").classList.toggle("hidden",which!=="lobby");$("gameWrap").classList.toggle("hidden",which!=="game");state=which}
function reset(){player={x:480,y:610,vx:0,vy:0};bullets=[];foes=[];enemyShots=[];particles=[];score=0;wave=1;hp=100;bombs=mode==="duel"?2:3;fireCd=0;spawn=0;elapsed=0;raceLeft=180;finish=false;paused=false}
function begin(){reset();show("game");$("gameMsg").textContent=mode==="solo"?"":mode==="duel"?"1v1 DÜELLO":"PUAN YARIŞI";last=performance.now();requestAnimationFrame(loop)}
function roomCode(){return Math.random().toString(36).slice(2,6).toUpperCase()}
function send(obj){if(conn&&conn.open)conn.send(obj)}
function attachConnection(c){
 conn=c;
 c.on("open",()=>{
   status("OYUNCUYA BAĞLI");
   if(isHost){
     $("lobbyInfo").textContent="Rakip bağlandı! Oyuncu bilgileri alınıyor...";
   } else {
     c.send({t:"hello",name:myName,mode});
   }
 });
 c.on("data",m=>{
   if(!m||typeof m.t!=="string")return;
   if(m.t==="hello"&&isHost){
     opName=String(m.name||"RAKİP").slice(0,12);
     c.send({t:"start",mode,names:[myName,opName]});
     $("lobbyInfo").textContent="Rakip bulundu! Maç başlatılıyor...";
     setTimeout(()=>{if(state==="lobby")begin()},350);
   }
   if(m.t==="start"&&!isHost){
     mode=m.mode||mode;opName=m.names?.[0]||"RAKİP";
     opponent={x:480,y:100,hp:100,score:0,alive:true};begin();
   }
   if(m.t==="state"){opponent=m.player;opName=m.name||opName}
   if(m.t==="shot"&&mode==="duel")enemyShots.push({x:Number(m.x)||480,y:H-(Number(m.y)||100),vx:0,vy:520});
   if(m.t==="bomb"&&mode==="duel")hp=Math.max(0,hp-20);
   if(m.t==="left"){opponent=null;$("gameMsg").textContent="Rakip bağlantıyı kesti.";$("lobbyInfo").textContent="Rakip ayrıldı."}
 });
 c.on("close",()=>{status("BAĞLANTI KOPTU");if(state==="game")$("gameMsg").textContent="Rakip bağlantıyı kesti."});
 c.on("error",e=>{status("BAĞLANTI HATASI");message("Oyuncu bağlantısı kurulamadı: "+(e?.type||"hata"))});
}
function connect(kind,joinCode){
 mode=kind;isHost=!joinCode;myName=($("playerName").value.trim()||"PILOT").slice(0,12);
 if(!window.Peer){message("PeerJS yüklenemedi. İnternet bağlantını kontrol et.");return}
 status("BAĞLANIYOR");
 if(isHost){
   const roomId="neonvoid-"+Math.random().toString(36).slice(2,8);
   peer=new Peer(roomId);
   peer.on("open",id=>{
     room=id;slot=0;$("roomCode").textContent=room;
     $("lobbyInfo").textContent="Oda hazır. Kodu arkadaşına gönder. Bu sekmeyi açık tut!";
     show("lobby");status("ODA AÇIK · RAKİP BEKLENİYOR");
   });
   peer.on("connection",c=>{
     if(conn){c.close();return}
     attachConnection(c);
   });
   peer.on("error",e=>{
     status("ODA HATASI");
     message(e.type==="unavailable-id"?"Oda kodu çakıştı, tekrar dene.":"Oda açılamadı: "+e.type);
   });
 }else{
   room=String(joinCode||"").trim();
   if(!/^neonvoid-[a-z0-9]{6}$/i.test(room)){message("Oda kodunu eksiksiz gir (neonvoid-xxxxxx).");return}
   peer=new Peer();
   peer.on("open",()=>{const c=peer.connect(room,{reliable:true});attachConnection(c);});
   peer.on("error",e=>{status("BAĞLANTI HATASI");message("Odaya bağlanılamadı: "+e.type+". Oda sahibinin oyunu açık mı?")});
 }
}
$("soloBtn").onclick=()=>{mode="solo";begin()};
$("createDuel").onclick=()=>connect("duel");
$("createRace").onclick=()=>connect("race");
$("joinBtn").onclick=()=>{let c=$("roomInput").value.trim().toUpperCase();if(!c){message("Oda kodunu yaz.");return}connect("join",c)};
$("copyRoom").onclick=()=>navigator.clipboard?.writeText(room).then(()=>$("lobbyInfo").textContent="Oda kodu kopyalandı: "+room).catch(()=>{$("lobbyInfo").textContent="Oda kodun: "+room});
$("leaveLobby").onclick=()=>{send({t:"left"});conn?.close();peer?.destroy();show("menu")};
$("exitBtn").onclick=()=>{send({t:"left"});conn?.close();peer?.destroy();status("ÇEVRİMDIŞI");show("menu")};
$("pauseBtn").onclick=()=>{paused=!paused;$("pauseBtn").textContent=paused?"DEVAM":"DURAKLAT"};
window.addEventListener("keydown",e=>{keys[e.code]=true;if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();if(e.code==="KeyP"&&state==="game")paused=!paused;if(e.code==="KeyB")bomb()});
window.addEventListener("keyup",e=>keys[e.code]=false);
document.querySelectorAll("[data-key]").forEach(b=>{let k=b.dataset.key;const on=e=>{e.preventDefault();keys[k]=true;b.classList.add("active")},off=e=>{e.preventDefault();keys[k]=false;b.classList.remove("active")};b.addEventListener("pointerdown",on);b.addEventListener("pointerup",off);b.addEventListener("pointerleave",off);});
function bomb(){if(state!=="game"||paused||bombs<=0)return;bombs--;enemyShots=[];foes.forEach(f=>{f.hp-=8});score+=enemyShots.length*5;for(let i=0;i<4;i++)particles.push({x:player.x,y:player.y,a:i*Math.PI/2,life:.7});if(mode==="duel")send({t:"bomb"})}
function shoot(){if(fireCd>0)return;fireCd=.18;bullets.push({x:player.x,y:player.y-22,vx:0,vy:-720});if(mode==="duel")send({t:"shot",x:player.x,y:player.y})}
function spawnEnemy(){let tough=Math.random()<Math.min(.35,.08+wave*.012);foes.push({x:70+Math.random()*820,y:-30,r:tough?25:16,hp:tough?5:2,max:tough?5:2,v:70+Math.random()*70+wave*3,t:Math.random()*6,tough})}
function loop(now){if(state!=="game")return;let dt=Math.min(.033,(now-last)/1000||0);last=now;if(!paused&&!finish)update(dt);draw();requestAnimationFrame(loop)}
function update(dt){elapsed+=dt;fireCd=Math.max(0,fireCd-dt);for(let s of stars){s.y+=s.v*dt;if(s.y>H){s.y=0;s.x=Math.random()*W}}
let ax=(keys.ArrowRight||keys.KeyD||keys.right?1:0)-(keys.ArrowLeft||keys.KeyA||keys.left?1:0),ay=(keys.ArrowDown||keys.KeyS?1:0)-(keys.ArrowUp||keys.KeyW?1:0);
player.vx+=(ax*420-player.vx)*Math.min(1,dt*12);player.vy+=(ay*420-player.vy)*Math.min(1,dt*12);player.x=Math.max(25,Math.min(W-25,player.x+player.vx*dt));player.y=Math.max(65,Math.min(H-35,player.y+player.vy*dt));
if(keys.Space||keys.fire)shoot();
if(mode==="solo"||mode==="race"){spawn-=dt;if(spawn<=0){spawn=Math.max(.35,1.1-wave*.025);spawnEnemy()}if(elapsed>25*wave){wave++;elapsed=0;hp=Math.min(100,hp+8)}}
if(mode==="race"){raceLeft-=dt;if(raceLeft<=0)finish=true}
for(let b of bullets)b.y+=b.vy*dt;bullets=bullets.filter(b=>b.y>-20);
for(let f of foes){f.y+=f.v*dt;f.x+=Math.sin(now/600+f.t)*30*dt;for(let b of bullets){if(Math.hypot(f.x-b.x,f.y-b.y)<f.r){f.hp--;b.y=-100;}}}
foes=foes.filter(f=>{if(f.hp<=0){score+=f.tough?400:100;for(let i=0;i<8;i++)particles.push({x:f.x,y:f.y,a:Math.random()*6.28,life:.5});return false}if(f.y>H+30)return false;return true});
if(Math.random()<dt*.6&&foes.length) {let f=foes[Math.floor(Math.random()*foes.length)];enemyShots.push({x:f.x,y:f.y,vx:(player.x-f.x)*.25,vy:210})}
for(let b of enemyShots){b.x+=b.vx*dt;b.y+=b.vy*dt;if(Math.hypot(b.x-player.x,b.y-player.y)<18){b.y=H+20;if(hp>0)hp-=12}}
enemyShots=enemyShots.filter(b=>b.y<H+30);
if(hp<=0){hp=0;finish=true}
particles.forEach(p=>p.life-=dt);particles=particles.filter(p=>p.life>0);
if(mode!=="solo"&&now-lastSend>70){send({t:"state",player:{x:player.x,y:player.y,hp,score,alive:hp>0},name:myName});lastSend=now}
$("score").textContent="SKOR "+score;$("wave").textContent=mode==="race"?"SÜRE "+Math.ceil(raceLeft):"DALGA "+wave;$("hp").textContent="CAN "+hp;$("oppScore").textContent=opponent?"RAKİP "+(opponent.score||0):"RAKİP —";
if(finish)$("gameMsg").textContent=hp<=0?"GEMİN YOK EDİLDİ · MENÜ'YE DÖN":mode==="race"?"SÜRE BİTTİ · SKOR "+score:"MAÇ BİTTİ · SKOR "+score;
}
function glow(x,y,r,color){let g=ctx.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,color);g.addColorStop(1,"transparent");ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function ship(x,y,color,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);glow(0,10,42,color);ctx.fillStyle="#102d51";ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-27);ctx.lineTo(24,18);ctx.lineTo(0,11);ctx.lineTo(-24,18);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#bffaff";ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(5,3);ctx.lineTo(-5,3);ctx.fill();ctx.restore()}
function draw(){ctx.fillStyle="#040714";ctx.fillRect(0,0,W,H);for(let s of stars){ctx.fillStyle=`rgba(130,190,255,${.3+s.s*.2})`;ctx.fillRect(s.x,s.y,s.s,s.s)}
// nebulous glow
glow(240,250,250,"rgba(85,30,150,.15)");glow(750,450,220,"rgba(0,120,180,.12)");
for(let f of foes){glow(f.x,f.y,45,f.tough?"rgba(180,80,255,.4)":"rgba(255,65,140,.35)");ctx.fillStyle=f.tough?"#51216f":"#56203e";ctx.strokeStyle=f.tough?"#cf8aff":"#ff65ae";ctx.lineWidth=2;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,6.28);ctx.fill();ctx.stroke();ctx.fillStyle="#fff";ctx.fillRect(f.x-7,f.y-3,14,6)}
for(let b of bullets){glow(b.x,b.y,18,"rgba(0,220,255,.6)");ctx.fillStyle="#cfffff";ctx.fillRect(b.x-2,b.y-10,4,15)}
for(let b of enemyShots){glow(b.x,b.y,18,"rgba(255,60,130,.6)");ctx.fillStyle="#ff7bb6";ctx.beginPath();ctx.arc(b.x,b.y,5,0,6.28);ctx.fill()}
for(let p of particles){ctx.fillStyle="#75efff";ctx.fillRect(p.x+Math.cos(p.a)*(1-p.life)*45,p.y+Math.sin(p.a)*(1-p.life)*45,3,3)}
ship(player.x,player.y,"#42eaff");
if(opponent){ship(opponent.x,mode==="duel"?H-opponent.y:opponent.y,"#ff4c9b",Math.PI);ctx.fillStyle="#ff9fc9";ctx.font="16px system-ui";ctx.textAlign="center";ctx.fillText(opName,opponent.x,mode==="duel"?H-opponent.y+48:opponent.y-42)}
if(paused||finish){ctx.fillStyle="#030615bb";ctx.fillRect(0,0,W,H);ctx.textAlign="center";ctx.font="bold 58px system-ui";ctx.fillStyle=finish?"#ff6da9":"#8cf5ff";ctx.fillText(finish?"MAÇ TAMAMLANDI":"DURAKLATILDI",W/2,H/2);ctx.font="22px system-ui";ctx.fillStyle="#fff";ctx.fillText(finish?"Menü'ye dönmek için MENÜ düğmesine bas":"P tuşu ile devam et",W/2,H/2+50)}}
})();