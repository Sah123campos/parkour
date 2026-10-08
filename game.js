'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ============================================================
// Seeded RNG - permite compartilhar uma seed e repetir salas
// ============================================================
class RNG {
  constructor(seed) { this.seed = seed >>> 0; }
  next() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
  range(a,b) { return a + (b-a)*this.next(); }
  int(a,b) { return Math.floor(this.range(a,b+1)); }
  pick(arr) { return arr[Math.floor(this.next()*arr.length)]; }
}

const params = new URLSearchParams(location.search);
const seedFromUrl = params.get('seed');
const baseSeed = seedFromUrl ? hashString(seedFromUrl) : (Date.now() >>> 0);
function hashString(s) { let h=2166136261; for (let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619); return h>>>0; }

const THEMES = [
  { name:'CAVERNA', sky:'#090b18', mid:'#17152e', ground:'#252044', accent:'#a86cff', accent2:'#55eaff', particle:'#cda8ff' },
  { name:'FLORESTA', sky:'#07150e', mid:'#0d2c1c', ground:'#173c29', accent:'#59f28a', accent2:'#c7ff5a', particle:'#9cffb7' },
  { name:'CIDADE NEON', sky:'#080615', mid:'#17102e', ground:'#201a3f', accent:'#ff4fd8', accent2:'#4cf7ff', particle:'#ff8be7' },
  { name:'VULCÃO', sky:'#170705', mid:'#3a0d0a', ground:'#4a1710', accent:'#ff6a2f', accent2:'#ffd447', particle:'#ff9b4a' },
  { name:'GELO', sky:'#07131d', mid:'#103145', ground:'#174c63', accent:'#67e8ff', accent2:'#e4fbff', particle:'#a9f2ff' },
  { name:'ESPAÇO', sky:'#03040e', mid:'#0b1030', ground:'#171b45', accent:'#b27cff', accent2:'#58a6ff', particle:'#d5c2ff' }
];

const EFFECTS = {
  lowGravity: { name:'BAIXA GRAVIDADE', color:'#69d7ff', icon:'🚀' },
  inverted: { name:'GRAVIDADE INVERTIDA', color:'#ff63d6', icon:'🔄' },
  superJump: { name:'SUPER PULO', color:'#ffe45e', icon:'⬆️' },
  speed: { name:'VELOCIDADE AUMENTADA', color:'#55ff8a', icon:'⚡' },
  slow: { name:'CÂMERA LENTA', color:'#bd8cff', icon:'🐌' },
  magnet: { name:'ATRAÇÃO MAGNÉTICA', color:'#ff6d7a', icon:'🧲' },
  dash: { name:'DASH / IMPULSO', color:'#5ef0ff', icon:'💨' }
};

const keys = new Set();
let justPressed = new Set();
addEventListener('keydown', e => {
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  if(!keys.has(e.code)) justPressed.add(e.code);
  keys.add(e.code);
  if(e.code==='KeyP' && gameStarted){ paused=!paused; updatePauseCard(); }
  if(e.code==='KeyR' && gameStarted) resetRoom();
});
addEventListener('keyup', e => keys.delete(e.code));

const player = {
  x:90,y:500,w:28,h:42,vx:0,vy:0,
  grounded:false,onWall:0,coyote:0,buffer:0,jumpHold:0,
  dashTimer:0,dashCooldown:0,spawnX:90,spawnY:500,
  deaths:0
};

let roomIndex=0, room=null, rng=null, particles=[], cameraX=0, totalTime=0, roomTime=0, paused=false;
let activeEffects=[], currentEffect=null, effectFlash=0, shake=0, lastTime=performance.now();
let gameStarted=false, speedrunMode=false, speedrunStart=0, customMode=false;
let audioCtx=null, masterGain=null;
let customRoomData=null;
let multiplayer=null, remotePlayers=new Map();

function makeRoom(index) {
  const r = new RNG((baseSeed ^ Math.imul(index+1, 0x9e3779b9)) >>> 0);
  const theme = THEMES[index % THEMES.length];
  const difficulty = 1 + index*0.14;
  const width = 2600 + Math.min(900, index*80);
  const platforms=[];
  const hazards=[];
  const zones=[];
  const switches=[];
  const blink=[];

  // Base route: always solvable, with increasing vertical variation.
  let x=0, y=600;
  platforms.push({x:-100,y:640,w:430,h:80,type:'solid'});
  for(let i=0;i<11;i++) {
    x += r.int(135,220);
    y = Math.max(300, Math.min(600, y + r.int(-120,120)));
    const w = r.int(120,210);
    platforms.push({x,y,w,h:28,type:'solid'});
    if(i%3===1 && index>0) blink.push({x:x+w+35,y:y+r.int(-100,40),w:r.int(90,150),h:22,on:2000,off:1000,phase:r.int(0,2999)});
    if(i%2===0 && index>1) hazards.push({type:'spike',x:x+w+r.int(10,45),y:y-22,w:28,h:22,phase:r.next()*Math.PI*2});
  }
  platforms.push({x:width-360,y:560,w:430,h:160,type:'exit'});

  const effectKeys = ['lowGravity','superJump','speed','dash','inverted','slow','magnet'];
  const count = Math.min(3, 1 + Math.floor(index/2));
  const used=[];
  for(let i=0;i<count;i++) {
    let fx = r.range(430,width-500);
    let nearest = platforms.reduce((best,p)=>Math.abs(p.x+p.w/2-fx)<Math.abs(best.x+best.w/2-fx)?p:best, platforms[0]);
    let effect = r.pick(effectKeys.filter(k=>!used.includes(k)));
    used.push(effect);
    zones.push({x:fx,y:nearest.y-145,w:170,h:145,effect,phase:r.range(0,Math.PI*2)});
  }

  if(index>=1) switches.push({x:r.range(850,width-700),y:330,w:34,h:34,activeUntil:0});
  if(index>=2) switches.push({x:r.range(1450,width-500),y:280,w:34,h:34,activeUntil:0});
  if(index>=2) hazards.push({type:'laser',x:r.range(700,width-500),y:r.range(280,500),w:12,h:230,phase:r.next()*Math.PI*2});

  return {index,theme,difficulty,width,platforms,hazards,zones,switches,blink,exitX:width-260,stars:Array.from({length:90},()=>({x:r.range(0,width),y:r.range(20,600),s:r.range(.5,2.2),a:r.range(.2,.9)}))};
}

function resetRoom() {
  room=customMode && customRoomData ? cloneRoom(customRoomData) : makeRoom(roomIndex); roomTime=0; particles=[]; cameraX=0;
  player.x=player.spawnX=90; player.y=player.spawnY=500; player.vx=0; player.vy=0; player.dashTimer=0; player.dashCooldown=0;
  currentEffect=null; activeEffects=[]; effectFlash=0;
}
function die() {
  player.deaths++; shake=10; sfx('death');
  localStorage.setItem('neonBestRoom', Math.max(Number(localStorage.getItem('neonBestRoom')||0), roomIndex)); burst(player.x+player.w/2,player.y+player.h/2,room.theme.particle,24,4);
  setTimeout(()=>{ player.x=player.spawnX; player.y=player.spawnY; player.vx=0; player.vy=0; player.dashTimer=0; },80);
}
function nextRoom() {
  if(customMode){ finishCustomRoom(); return; }
  sfx('room');
  roomIndex++;
  if(speedrunMode && roomIndex>=10){
    const finalTime=totalTime;
    const oldBest=Number(localStorage.getItem('neonBestSpeed')||0);
    if(!oldBest || finalTime<oldBest) localStorage.setItem('neonBestSpeed', finalTime.toFixed(3));
    speedrunMode=false;
    gameStarted=false;
    menu.classList.add('active');
    updateRecords();
    alert(`Speedrun concluído! 10 salas em ${formatTime(finalTime)}.`);
    return;
  } room=makeRoom(roomIndex); roomTime=0; particles=[]; player.x=90; player.y=500; player.spawnX=90; player.spawnY=500; player.vx=0; player.vy=0; cameraX=0; currentEffect=null; burst(player.x,player.y,room.theme.accent2,35,5); }
function burst(x,y,color,n=10,speed=2) { for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, s=Math.random()*speed+.5; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:Math.random()*3+1,life:1,color}); } }
function dust(x,y,color){ for(let i=0;i<3;i++) particles.push({x:x+(Math.random()-.5)*18,y,vx:(Math.random()-.5)*1.2,vy:-Math.random()*1.8,r:Math.random()*2+1,life:.55,color}); }

function rectsOverlap(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
function isDown(...codes){ return codes.some(c=>keys.has(c)); }
function pressed(...codes){ return codes.some(c=>justPressed.has(c)); }

function getEffectAtPlayer() {
  for(const z of room.zones) {
    if(player.x+player.w/2>z.x && player.x<z.x+z.w && player.y+player.h/2>z.y && player.y<z.y+z.h) return z.effect;
  }
  return null;
}

function update(dt) {
  if(paused) return;
  totalTime += dt; roomTime += dt;
  const slowFactor = currentEffect==='slow' ? .48 : 1;
  const tdt=dt*slowFactor;
  effectFlash=Math.max(0,effectFlash-tdt);

  const newEffect=getEffectAtPlayer();
  if(newEffect!==currentEffect){ currentEffect=newEffect; effectFlash=1; if(newEffect) { burst(player.x+player.w/2,player.y+player.h/2,EFFECTS[newEffect].color,20,3); sfx('zone'); } }

  let speed=270, gravity=1500, jump=-590;
  if(currentEffect==='speed') speed*=1.75;
  if(currentEffect==='lowGravity') gravity*=.43;
  if(currentEffect==='superJump') jump=-880;
  if(currentEffect==='inverted') gravity*=-1;
  if(currentEffect==='slow') speed*=.72;
  if(currentEffect==='magnet') gravity*=.72;

  const left=isDown('ArrowLeft','KeyA'), right=isDown('ArrowRight','KeyD');
  const dir=(right?1:0)-(left?1:0);
  const accel=dir ? 1700 : 2100;
  player.vx += dir*accel*tdt;
  if(!dir) player.vx *= Math.pow(.0008,tdt);
  player.vx=Math.max(-speed,Math.min(speed,player.vx));

  player.coyote=Math.max(0,player.coyote-tdt);
  player.buffer=Math.max(0,player.buffer-tdt);
  if(pressed('Space','ArrowUp','KeyW')) player.buffer=.14;

  if(player.grounded) player.coyote=.11;
  const jumpAllowed=player.buffer>0 && (player.grounded || player.coyote>0);
  if(jumpAllowed){
    player.vy=jump; sfx('jump'); player.grounded=false; player.buffer=0; player.jumpHold=.16; burst(player.x+player.w/2,player.y+player.h,room.theme.particle,10,2.2);
  }
  if(player.jumpHold>0 && isDown('Space','ArrowUp','KeyW')) { player.vy -= 850*tdt; player.jumpHold-=tdt; }
  else player.jumpHold=0;

  // Wall slide / wall jump
  if(!player.grounded && player.onWall!==0 && player.vy>0) player.vy=Math.min(player.vy,210);
  if(pressed('Space','ArrowUp','KeyW') && !player.grounded && player.onWall!==0){ player.vy=-650; player.vx=-player.onWall*480; burst(player.x+player.w/2,player.y+player.h/2,room.theme.accent2,12,3); }

  if(player.dashCooldown>0) player.dashCooldown-=tdt;
  if(player.dashTimer>0){ player.dashTimer-=tdt; player.vx*=.99; }
  if(pressed('ShiftLeft','ShiftRight','KeyK') && player.dashCooldown<=0){ player.dashTimer=.18; sfx('dash'); player.dashCooldown=.8; player.vx=(dir||1)*950; player.vy*=.25; burst(player.x,player.y+player.h/2,EFFECTS.dash.color,18,4); }

  if(currentEffect==='magnet'){
    const near=room.platforms.filter(p=>Math.abs((p.x+p.w/2)-(player.x+player.w/2))<180 && Math.abs((p.y+p.h/2)-(player.y+player.h/2))<260)[0];
    if(near){ const dx=(near.x+near.w/2)-(player.x+player.w/2), dy=(near.y+near.h/2)-(player.y+player.h/2); player.vx+=Math.sign(dx)*120*tdt; player.vy+=Math.sign(dy)*80*tdt; }
  }
  player.vy += gravity*tdt;
  if(currentEffect==='inverted' && player.vy>850) player.vy=850;
  player.vy=Math.max(-1300,Math.min(1300,player.vy));

  const oldY=player.y, oldX=player.x;
  player.x += player.vx*tdt;
  player.y += player.vy*tdt;
  player.grounded=false; player.onWall=0;

  // World boundaries
  if(player.x<0){player.x=0;player.vx=0;}
  if(player.x+player.w>room.width){player.x=room.width-player.w;player.vx=0;}

  // Platforms
  const solids=[...room.platforms,...room.blink.filter(b=>isBlinkOn(b)).map(b=>({...b,type:'solid'}))];
  for(const p of solids){
    if(!rectsOverlap(player,p)) continue;
    const fromAbove=oldY+player.h<=p.y+8 && player.y+player.h>=p.y;
    const fromBelow=oldY>=p.y+p.h-8 && player.y<=p.y+p.h;
    if(fromAbove && player.vy>=0){ player.y=p.y-player.h; player.vy=0; player.grounded=currentEffect!=='inverted'; if(currentEffect==='inverted'){player.y=p.y+p.h;player.vy=0;} }
    else if(fromBelow && player.vy<0){ player.y=p.y+p.h; player.vy=0; }
    else if(oldX+player.w<=p.x+8 && player.x+player.w>=p.x){player.x=p.x-player.w;player.vx=0;player.onWall=-1;}
    else if(oldX>=p.x+p.w-8 && player.x<=p.x+p.w){player.x=p.x+p.w;player.vx=0;player.onWall=1;}
  }
  if(player.grounded && Math.abs(player.vx)>90 && Math.random()<dt*10) dust(player.x+player.w/2,player.y+player.h,room.theme.particle);

  // Hazards
  for(const h of room.hazards){
    const active=h.type==='spike' || Math.sin(roomTime*2.2+h.phase)>-.25;
    if(!active) continue;
    const box=h.type==='laser'?{x:h.x-5,y:h.y,w:h.w+10,h:h.h}:h.type==='moving'?{x:h.x,y:h.y+Math.sin(roomTime*2+h.phase)*h.range,w:h.w,h:h.h}:{x:h.x,y:h.y,w:h.w,h:h.h};
    if(rectsOverlap(player,box)) die();
  }

  // Blink platforms are visual/physical cycle 2s on, 1s off.
  // Switches temporarily enable nearby blink platforms.
  for(const s of room.switches){
    if(rectsOverlap(player,s)){ s.activeUntil=roomTime+4; burst(s.x+s.w/2,s.y+s.h/2,room.theme.accent2,16,3); }
  }

  if(player.y>H+250 || player.y<-250) die();
  if(player.x>room.exitX){ nextRoom(); }

  // Particles
  for(const p of particles){p.x+=p.vx*tdt*60;p.y+=p.vy*tdt*60;p.vy+=1.8*tdt;p.life-=tdt*1.8;}
  particles=particles.filter(p=>p.life>0);

  const target=Math.max(0,player.x-W*.38);
  cameraX += (target-cameraX)*Math.min(1,tdt*7);
  cameraX=Math.max(0,Math.min(room.width-W,cameraX));
  shake=Math.max(0,shake-tdt*18);
}

function isBlinkOn(b){
  const cycle=b.on+b.off; return ((roomTime*1000+b.phase)%cycle)<b.on;
}

function draw() {
  const th=room.theme;
  ctx.clearRect(0,0,W,H);
  // Gradient sky
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,th.sky);g.addColorStop(1,th.mid);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

  // Parallax stars/geometry
  ctx.save();
  ctx.translate(-cameraX*.18,0);
  for(const s of room.stars){ctx.globalAlpha=s.a;ctx.fillStyle=th.accent2;ctx.fillRect(s.x,s.y,s.s,s.s);}
  ctx.globalAlpha=1;
  drawParallax(th, cameraX*.32, 430, 70);
  ctx.restore();

  const sx=(Math.random()-.5)*shake, sy=(Math.random()-.5)*shake; ctx.save();ctx.translate(-cameraX+sx,sy);
  drawWorld(th);
  drawRemotePlayers(th);
  drawPlayer(th);
  ctx.restore();

  drawUI(th);
  if(paused){ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 48px Arial';ctx.fillText('PAUSADO',W/2,H/2);ctx.font='16px Arial';ctx.fillText('Pressione P para continuar',W/2,H/2+35);}
}
function drawParallax(th,offset,y,h){
  ctx.fillStyle=th.ground; for(let x=-offset%180-180;x<W+180;x+=180){ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x+40,y+20);ctx.lineTo(x+95,y+80);ctx.lineTo(x+140,y);ctx.lineTo(x+180,y+h);ctx.closePath();ctx.fill();}
}
function drawWorld(th){
  for(const z of room.zones){
    const e=EFFECTS[z.effect], pulse=.6+.4*Math.sin(totalTime*4+z.phase);
    ctx.globalAlpha=.11+.05*pulse;ctx.fillStyle=e.color;ctx.fillRect(z.x,z.y,z.w,z.h);ctx.globalAlpha=1;
    ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.setLineDash([8,8]);ctx.strokeRect(z.x,z.y,z.w,z.h);ctx.setLineDash([]);
    for(let i=0;i<4;i++){ctx.fillStyle=e.color;ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(z.x+z.w*(.2+i*.2),z.y+z.h*.5+Math.sin(totalTime*2+i)*20,4,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    ctx.fillStyle=e.color;ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillText(e.name,z.x+z.w/2,z.y+z.h-10);
  }
  // Platforms
  for(const p of room.platforms){
    ctx.fillStyle=p.type==='exit'?th.accent2:th.ground;ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.fillStyle=th.accent;ctx.fillRect(p.x,p.y,p.w,5);
    if(p.type==='exit'){ctx.globalAlpha=.22;ctx.fillStyle=th.accent2;ctx.fillRect(p.x,p.y-80,p.w,80);ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.font='bold 18px Arial';ctx.fillText('SAÍDA',p.x+40,p.y-25);}
  }
  for(const b of room.blink){
    if(isBlinkOn(b)){ctx.fillStyle=th.accent2;ctx.globalAlpha=.8;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.fillRect(b.x+8,b.y+6,b.w-16,3);}
    else {ctx.strokeStyle=th.accent2;ctx.globalAlpha=.18;ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.globalAlpha=1;}
  }
  // Hazards
  for(const h of room.hazards){
    if(h.type==='moving'){
      const my=h.y+Math.sin(roomTime*2+h.phase)*h.range;
      ctx.fillStyle='#ffb52e'; ctx.fillRect(h.x,my,h.w,h.h); ctx.fillStyle='#fff0a6'; ctx.fillRect(h.x+8,my+10,10,h.h-20);
    } else if(h.type==='spike'){ctx.fillStyle='#ff435f';ctx.beginPath();ctx.moveTo(h.x,h.y+h.h);ctx.lineTo(h.x+h.w/2,h.y);ctx.lineTo(h.x+h.w,h.y+h.h);ctx.closePath();ctx.fill();}
    else {const on=Math.sin(roomTime*2.2+h.phase)>-.25;ctx.globalAlpha=on?.85:.12;ctx.fillStyle='#ff315d';ctx.fillRect(h.x,h.y,h.w,h.h);ctx.globalAlpha=1;}
  }
  for(const s of room.switches){ctx.fillStyle=roomTime<s.activeUntil?'#5cff9a':th.accent;ctx.fillRect(s.x,s.y,s.w,s.h);ctx.fillStyle='#101018';ctx.fillRect(s.x+8,s.y+8,18,18);ctx.fillStyle='#fff';ctx.font='12px Arial';ctx.fillText('E',s.x+10,s.y+21);}
  for(const p of particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
}
function drawPlayer(th){
  ctx.save();
  const glow=currentEffect?EFFECTS[currentEffect].color:th.accent2;
  ctx.shadowBlur=18;ctx.shadowColor=glow;ctx.fillStyle='#fff';ctx.fillRect(player.x,player.y,player.w,player.h);
  ctx.shadowBlur=0;ctx.fillStyle=glow;ctx.fillRect(player.x+4,player.y+7,player.w-8,8);ctx.fillStyle='#111';ctx.fillRect(player.x+7,player.y+22,5,5);ctx.fillRect(player.x+18,player.y+22,5,5);
  if(multiplayer){
    ctx.fillStyle='#fff';ctx.font='bold 11px Arial';ctx.textAlign='center';
    ctx.fillText(multiplayer.name,player.x+player.w/2,player.y-9);
  }
  ctx.restore();
}
function drawRemotePlayers(th){
  if(!multiplayer) return;
  for(const remote of remotePlayers.values()){
    if(remote.roomIndex!==roomIndex) continue;
    ctx.save();
    ctx.globalAlpha=.72;
    ctx.shadowBlur=16;
    ctx.shadowColor=th.accent2;
    ctx.fillStyle=th.accent2;
    ctx.fillRect(remote.x,remote.y,player.w,player.h);
    ctx.shadowBlur=0;
    ctx.fillStyle='#fff';
    ctx.font='bold 11px Arial';
    ctx.textAlign='center';
    ctx.fillText(remote.name||'Jogador',remote.x+player.w/2,remote.y-9);
    ctx.restore();
  }
}
function drawUI(th){
  ctx.fillStyle='rgba(5,5,15,.72)';ctx.fillRect(18,16,430,92);
  ctx.fillStyle='#fff';ctx.font='bold 20px Arial';ctx.fillText(`NEON RIFT • SALA ${roomIndex+1}`,34,43);
  ctx.font='13px Arial';ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillText(`Ambiente: ${th.name}   •   Mortes: ${player.deaths}`,34,66);
  ctx.fillText(`Tempo da sala: ${roomTime.toFixed(1)}s   •   Seed: ${seedLabel}`,34,88);
  if(speedrunMode){ ctx.fillStyle='#ffe45e'; ctx.fillText(`SPEEDRUN: ${formatTime(totalTime)} • META: 10 SALAS`,34,105); }
  if(currentEffect){const e=EFFECTS[currentEffect];ctx.fillStyle=e.color;ctx.fillRect(W-340,18,320,64);ctx.fillStyle='#fff';ctx.font='bold 16px Arial';ctx.fillText(`${e.icon} ${e.name}`,W-320,46);ctx.font='12px Arial';ctx.fillText('Efeito de física ativo',W-320,67);}
  else {ctx.fillStyle='rgba(255,255,255,.65)';ctx.font='13px Arial';ctx.fillText('Entre nas zonas coloridas para alterar a física',W-340,42);}
  const progress=Math.max(0,Math.min(1,player.x/room.exitX));ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(W/2-190,H-32,380,8);ctx.fillStyle=th.accent2;ctx.fillRect(W/2-190,H-32,380*progress,8);
}

function loop(now){ const dt=Math.min(.033,(now-lastTime)/1000);lastTime=now; if(gameStarted) update(dt); if(multiplayer) sendMultiplayerState(now); if(room) draw(); justPressed.clear(); requestAnimationFrame(loop); }

// ============================================================
// Menu, speedrun, áudio e editor
// ============================================================
const menu=document.getElementById('menu');
const editor=document.getElementById('editor');
const pauseCard=document.getElementById('pauseCard');
const seedInput=document.getElementById('seedInput');
const playerNameInput=document.getElementById('playerNameInput');
let seedLabel=seedFromUrl || 'NEON-RIFT';
seedInput.value=seedLabel;
playerNameInput.value=localStorage.getItem('neonPlayerName')||'';

function formatTime(seconds){ const m=Math.floor(seconds/60); const s=seconds%60; return `${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`; }
function updateRecords(){
  document.getElementById('bestRoom').textContent=localStorage.getItem('neonBestRoom')||'0';
  const best=Number(localStorage.getItem('neonBestSpeed')||0);
  document.getElementById('bestSpeed').textContent=best?formatTime(best):'--:--.--';
}
function showMenu(){ gameStarted=false; paused=false; menu.classList.add('active'); editor.classList.remove('active'); pauseCard.classList.add('hidden'); updateRecords(); }
function startGame(isSpeedrun=false){
  seedLabel=(seedInput.value.trim() || 'NEON-RIFT');
  window.location.hash='';
  window.__baseSeed=hashString(seedLabel);
  speedrunMode=isSpeedrun; speedrunStart=performance.now(); customMode=false; customRoomData=null; roomIndex=0; player.deaths=0; totalTime=0;
  // makeRoom reads the original baseSeed, so temporarily expose a new deterministic seed.
  currentBaseSeed=hashString(seedLabel);
  gameStarted=true; menu.classList.remove('active'); editor.classList.remove('active'); paused=false; updatePauseCard(); initAudio(); resetRoom();
}
let currentBaseSeed=baseSeed;
function makeRoomForSeed(index){ const old=currentBaseSeed; const result=makeRoom(index); currentBaseSeed=old; return result; }
// Re-define deterministic room seed without changing the original function body.
const originalMakeRoom=makeRoom;
makeRoom=function(index){
  const saved=baseSeed;
  // originalMakeRoom closes over baseSeed, therefore create the same room algorithm using a temporary seed is not possible by reassignment.
  // Hashing the user seed into the room index is handled by a deterministic offset below.
  const oldRngSeed = (currentBaseSeed ^ Math.imul(index+1, 0x9e3779b9)) >>> 0;
  const previous = baseSeed;
  // The original function's only random source is its local RNG; reproduce by temporarily using a proxy global through roomSeedOverride.
  roomSeedOverride=oldRngSeed;
  const result=originalMakeRoom(index);
  roomSeedOverride=null;
  return result;
};
let roomSeedOverride=null;
// Patch the room generator's first RNG seed by wrapping RNG construction.
const OriginalRNG=RNG;
// The generator above already works for the default URL seed; for menu seeds, reload-like deterministic behavior is achieved by rebuilding with a local generator.
function deterministicRoom(index){
  const saved=currentBaseSeed;
  const tempBase=currentBaseSeed;
  // Build using the existing generator source by emulating the same seed formula and then cloning via a controlled URL is unnecessary; use custom deterministic room below.
  const r=new OriginalRNG((tempBase ^ Math.imul(index+1,0x9e3779b9))>>>0);
  return buildProceduralRoom(index,r);
}
// Replace room generation with an equivalent generator that supports arbitrary seeds.
function buildProceduralRoom(index,r){
  const theme=THEMES[index%THEMES.length], difficulty=1+index*.14, width=2600+Math.min(900,index*80);
  const platforms=[{x:-100,y:640,w:430,h:80,type:'solid'}], hazards=[], zones=[], switches=[], blink=[];
  let x=0,y=600;
  for(let i=0;i<11;i++){ x+=r.int(135,220); y=Math.max(300,Math.min(600,y+r.int(-120,120))); const w=r.int(120,210); platforms.push({x,y,w,h:28,type:'solid'}); if(i%3===1&&index>0) blink.push({x:x+w+35,y:y+r.int(-100,40),w:r.int(90,150),h:22,on:2000,off:1000,phase:r.int(0,2999)}); if(i%2===0&&index>1) hazards.push({type:'spike',x:x+w+r.int(10,45),y:y-22,w:28,h:22,phase:r.next()*Math.PI*2}); }
  platforms.push({x:width-360,y:560,w:430,h:160,type:'exit'});
  const effectKeys=Object.keys(EFFECTS), count=Math.min(4,1+Math.floor(index/2)), used=[];
  for(let i=0;i<count;i++){ let fx=r.range(430,width-500); let nearest=platforms.reduce((best,p)=>Math.abs(p.x+p.w/2-fx)<Math.abs(best.x+best.w/2-fx)?p:best,platforms[0]); let effect=r.pick(effectKeys.filter(k=>!used.includes(k))); used.push(effect); zones.push({x:fx,y:nearest.y-145,w:170,h:145,effect,phase:r.range(0,Math.PI*2)}); }
  if(index>=1) switches.push({x:r.range(850,width-700),y:330,w:34,h:34,activeUntil:0}); if(index>=2) switches.push({x:r.range(1450,width-500),y:280,w:34,h:34,activeUntil:0});
  if(index>=2) hazards.push({type:'laser',x:r.range(700,width-500),y:r.range(280,500),w:12,h:230,phase:r.next()*Math.PI*2});
  if(index>=3){ for(let i=0;i<Math.min(3,index-1);i++) hazards.push({type:'moving',x:r.range(700,width-450),y:r.range(260,520),w:26,h:90,phase:r.range(0,6.28),range:r.int(70,150)}); }
  return {index,theme,difficulty,width,platforms,hazards,zones,switches,blink,exitX:width-260,stars:Array.from({length:90},()=>({x:r.range(0,width),y:r.range(20,600),s:r.range(.5,2.2),a:r.range(.2,.9)}))};
}
function cloneRoom(r){ return JSON.parse(JSON.stringify(r)); }

// Use the seed-aware generator whenever a new room starts.
function getGeneratedRoom(index){ return customMode&&customRoomData?cloneRoom(customRoomData):deterministicRoom(index); }
function resetRoomEnhanced(){ room=getGeneratedRoom(roomIndex); roomTime=0; particles=[]; cameraX=0; player.x=player.spawnX=90; player.y=player.spawnY=500; player.vx=0; player.vy=0; player.dashTimer=0; player.dashCooldown=0; currentEffect=null; effectFlash=0; }
resetRoom=resetRoomEnhanced;

function initAudio(){ if(audioCtx) return; audioCtx=new (window.AudioContext||window.webkitAudioContext)(); masterGain=audioCtx.createGain(); masterGain.gain.value=.055; masterGain.connect(audioCtx.destination); }
function sfx(type){ if(!audioCtx||!masterGain) return; const now=audioCtx.currentTime; const osc=audioCtx.createOscillator(), gain=audioCtx.createGain(); const data={jump:[420,.08,'triangle'],dash:[90,.14,'sawtooth'],zone:[620,.12,'sine'],death:[110,.3,'square'],room:[740,.2,'triangle']}; const d=data[type]||data.jump; osc.type=d[2]; osc.frequency.setValueAtTime(d[0],now); if(type==='dash') osc.frequency.exponentialRampToValueAtTime(380,now+d[1]); if(type==='room') osc.frequency.exponentialRampToValueAtTime(1200,now+d[1]); gain.gain.setValueAtTime(.001,now); gain.gain.exponentialRampToValueAtTime(.6,now+.01); gain.gain.exponentialRampToValueAtTime(.001,now+d[1]); osc.connect(gain); gain.connect(masterGain); osc.start(now); osc.stop(now+d[1]+.02); }

function updatePauseCard(){ pauseCard.classList.toggle('hidden',!gameStarted||!paused); }
function finishCustomRoom(){ customMode=false; showMenu(); alert('Sala customizada concluída!'); }

const roomCodeInput=document.getElementById('roomCodeInput');
const multiplayerStatus=document.getElementById('multiplayerStatus');
const createRoomBtn=document.getElementById('createRoomBtn');
const joinRoomBtn=document.getElementById('joinRoomBtn');
const onlineControls=document.getElementById('onlineControls');
const onlineRoomLabel=document.getElementById('onlineRoomLabel');
const roomCodePattern=/^[A-Z0-9]{6}$/;
let remotePlayersListener=null;

function setMultiplayerStatus(message){ multiplayerStatus.textContent=message; }
function createRoomCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
}
function isFirebaseConfigured(){
  const config=window.firebaseConfig;
  return config && config.apiKey && !config.apiKey.startsWith('YOUR_') &&
    config.projectId && !config.projectId.startsWith('YOUR_') &&
    config.databaseURL && !config.databaseURL.includes('YOUR_');
}
async function getFirebaseUser(){
  if(!isFirebaseConfigured()) throw new Error('Configure firebase-config.js seguindo os passos do README.md.');
  if(!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  const auth=firebase.auth();
  const credential=auth.currentUser?null:await auth.signInAnonymously();
  return {db:firebase.database(),user:auth.currentUser||(credential&&credential.user)};
}
function showOnlineControls(code){
  onlineRoomLabel.textContent=`SALA ${code}`;
  onlineControls.classList.remove('hidden');
}
async function enterMultiplayerRoom(create){
  createRoomBtn.disabled=true;
  joinRoomBtn.disabled=true;
  setMultiplayerStatus('Conectando ao Firebase...');
  try{
    if(multiplayer) await leaveMultiplayerRoom(false);
    const {db,user}=await getFirebaseUser();
    if(!user) throw new Error('Não foi possível autenticar no Firebase.');
    const seed=seedInput.value.trim()||'NEON-RIFT';
    const playerName=playerNameInput.value.trim().slice(0,20)||'Jogador';
    playerNameInput.value=playerName;
    localStorage.setItem('neonPlayerName',playerName);
    let code=create?createRoomCode():roomCodeInput.value.trim().toUpperCase();
    if(!create&&!roomCodePattern.test(code)) throw new Error('Digite um código de sala com 6 letras ou números.');

    let roomRef=db.ref(`rooms/${code}`);
    let roomSeed;
    if(create){
      let created=false;
      for(let attempt=0;attempt<5;attempt++){
        const result=await roomRef.child('seed').transaction(current=>current===null?seed:undefined);
        if(result.committed){ created=true; break; }
        code=createRoomCode();
        roomRef=db.ref(`rooms/${code}`);
      }
      if(!created) throw new Error('Não foi possível reservar um código de sala. Tente novamente.');
      roomSeed=seed;
    }else{
      const seedSnapshot=await roomRef.child('seed').once('value');
      roomSeed=seedSnapshot.val();
      if(typeof roomSeed!=='string'||!roomSeed) throw new Error('Sala não encontrada. Confira o código.');
    }

    const playerRef=roomRef.child(`players/${user.uid}`);
    const playersRef=roomRef.child('players');
    const state={db,user,code,seed:roomSeed,name:playerName,roomRef,playerRef,playersRef,lastSent:0};
    multiplayer=state;
    remotePlayers.clear();
    remotePlayersListener=snapshot=>{
      const players=snapshot.val()||{};
      remotePlayers=new Map(Object.entries(players)
        .filter(([id,value])=>id!==user.uid&&value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&Number.isFinite(value.roomIndex))
        .map(([id,value])=>[id,value]));
    };
    playersRef.on('value',remotePlayersListener,error=>setMultiplayerStatus(`Erro de sincronização: ${error.message}`));
    await playerRef.onDisconnect().remove();
    seedInput.value=roomSeed;
    roomCodeInput.value=code;
    await playerRef.set({x:90,y:500,roomIndex:0,name:playerName,color:'#62efff'});
    startGame(false);
    setMultiplayerStatus(`Conectado à sala ${code}. Compartilhe o código com seus amigos.`);
    showOnlineControls(code);
  }catch(error){
    if(multiplayer) await leaveMultiplayerRoom(false);
    gameStarted=false;
    menu.classList.add('active');
    onlineControls.classList.add('hidden');
    setMultiplayerStatus(error.message||'Falha ao conectar ao multiplayer.');
    createRoomBtn.disabled=false;
    joinRoomBtn.disabled=false;
  }
}
async function leaveMultiplayerRoom(returnToMenu=true){
  const state=multiplayer;
  multiplayer=null;
  remotePlayers.clear();
  if(state){
    state.playersRef.off('value',remotePlayersListener);
    try{ await state.playerRef.remove(); }
    catch(error){ setMultiplayerStatus(`Não foi possível sair da sala: ${error.message}`); }
  }
  onlineControls.classList.add('hidden');
  createRoomBtn.disabled=false;
  joinRoomBtn.disabled=false;
  if(returnToMenu) showMenu();
  else setMultiplayerStatus('Saiu da sala anterior.');
}
function sendMultiplayerState(now){
  if(multiplayer.sendFailed||now-multiplayer.lastSent<100) return;
  multiplayer.lastSent=now;
  multiplayer.playerRef.update({x:player.x,y:player.y,roomIndex}).catch(error=>{
    if(multiplayer){ multiplayer.sendFailed=true; setMultiplayerStatus(`Erro ao enviar posição: ${error.message}`); }
  });
}
document.getElementById('createRoomBtn').onclick=()=>enterMultiplayerRoom(true);
document.getElementById('joinRoomBtn').onclick=()=>enterMultiplayerRoom(false);
roomCodeInput.addEventListener('input',()=>{roomCodeInput.value=roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);});
playerNameInput.addEventListener('input',()=>{playerNameInput.value=playerNameInput.value.slice(0,20);});
document.getElementById('onlineCopyRoom').onclick=async()=>{
  try{ await navigator.clipboard.writeText(multiplayer.code); setMultiplayerStatus(`Código ${multiplayer.code} copiado.`); }
  catch(error){ setMultiplayerStatus(`Não foi possível copiar o código: ${error.message}`); }
};
document.getElementById('onlineLeaveRoom').onclick=()=>leaveMultiplayerRoom(true);
document.getElementById('playBtn').onclick=()=>startGame(false);
document.getElementById('speedrunBtn').onclick=()=>startGame(true);
document.getElementById('randomSeed').onclick=()=>{ seedInput.value=Math.random().toString(36).slice(2,10).toUpperCase(); };
setMultiplayerStatus(isFirebaseConfigured()?'Crie uma sala ou entre com um código.':'Configure o Firebase para jogar online.');

// Editor
const ec=document.getElementById('editorCanvas'), ex=ec.getContext('2d'); let editorTool='platform';
const editorGrid={cols:18,rows:9,cellW:50,cellH:40}; let editorItems=[];
document.querySelectorAll('.tool').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active'));btn.classList.add('active');editorTool=btn.dataset.tool;});
function drawEditor(){ ex.clearRect(0,0,ec.width,ec.height); ex.fillStyle='#070716';ex.fillRect(0,0,ec.width,ec.height); for(let x=0;x<=900;x+=50){ex.strokeStyle='rgba(255,255,255,.05)';ex.beginPath();ex.moveTo(x,0);ex.lineTo(x,360);ex.stroke();} for(let y=0;y<=360;y+=40){ex.beginPath();ex.moveTo(0,y);ex.lineTo(900,y);ex.stroke();} editorItems.forEach(i=>{ex.fillStyle=i.type==='spike'?'#ff435f':i.type==='zone'?'#62efff':i.type==='blink'?'#ffe45e':'#743cff'; if(i.type==='spike'){ex.beginPath();ex.moveTo(i.x,i.y+40);ex.lineTo(i.x+25,i.y);ex.lineTo(i.x+50,i.y+40);ex.closePath();ex.fill();}else ex.fillRect(i.x,i.y,50,30);}); ex.fillStyle='#fff';ex.font='12px Arial';ex.fillText('INÍCIO',10,350);ex.fillText('SAÍDA →',820,350); }
ec.addEventListener('click',e=>{const r=ec.getBoundingClientRect(); const x=Math.floor((e.clientX-r.left)/(r.width/18))*50, y=Math.floor((e.clientY-r.top)/(r.height/9))*40; const idx=editorItems.findIndex(i=>i.x===x&&i.y===y); if(editorTool==='erase'){if(idx>=0)editorItems.splice(idx,1);}else{if(idx>=0)editorItems[idx].type=editorTool;else editorItems.push({x,y,type:editorTool});} drawEditor();});
document.getElementById('editorBtn').onclick=()=>{menu.classList.remove('active');editor.classList.add('active');drawEditor();};
document.getElementById('backMenu').onclick=showMenu;
document.getElementById('clearEditor').onclick=()=>{editorItems=[];drawEditor();};
document.getElementById('playCustom').onclick=()=>{ customRoomData={index:0,theme:THEMES[2],difficulty:1,width:900,exitX:760,platforms:[],hazards:[],zones:[],switches:[],blink:[],stars:Array.from({length:60},(_,i)=>({x:(i*73)%900,y:(i*47)%300,s:1,a:.5}))}; editorItems.forEach(i=>{if(i.type==='platform')customRoomData.platforms.push({x:i.x,y:i.y+30,w:50,h:30,type:'solid'}); if(i.type==='spike')customRoomData.hazards.push({type:'spike',x:i.x,y:i.y+8,w:50,h:32,phase:0}); if(i.type==='zone')customRoomData.zones.push({x:i.x,y:i.y-70,w:50,h:100,effect:'superJump',phase:0}); if(i.type==='blink')customRoomData.blink.push({x:i.x,y:i.y,w:50,h:22,on:2000,off:1000,phase:0});}); customRoomData.platforms.push({x:0,y:350,w:150,h:30,type:'solid'},{x:800,y:350,w:100,h:30,type:'exit'}); customMode=true; roomIndex=0; player.deaths=0; seedLabel='CUSTOM'; totalTime=0; speedrunMode=false; gameStarted=true; editor.classList.remove('active'); initAudio(); resetRoom(); };

updateRecords();
if(seedFromUrl){ seedInput.value=seedFromUrl; startGame(false); }
requestAnimationFrame(loop);
