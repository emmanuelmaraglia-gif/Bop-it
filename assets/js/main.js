(function(){
var $=function(id){return document.getElementById(id)};
var CMD={aperta:'Aperta!',puxa:'Puxa!',gira:'Gira!',desliza:'Desliza!',vira:'Vira!'};
var BASE=['aperta','puxa','gira'];
var DIFF={
  facil:{pts:50,w:3200,wd:.97,wm:1100,g:900,gd:.96,gm:350,rm:1.4,rs:.015,glow:true,keys:BASE},
  normal:{pts:100,w:2600,wd:.94,wm:850,g:750,gd:.93,gm:160,rm:1.9,rs:.035,glow:false,keys:BASE},
  dificil:{pts:150,w:2400,wd:.91,wm:720,g:650,gd:.9,gm:120,rm:2.2,rs:.055,glow:false,keys:BASE.concat(['desliza','vira'])}
};
var toy=$('toy'),cmdEl=$('cmd'),scEl=$('sc'),btn=$('btn'),pull=$('pull'),hit=$('pullHit'),dial=$('dial'),sl=$('slide'),kn=$('knob'),sw=$('sw');
var TARGET={aperta:btn,puxa:pull,gira:dial,desliza:sl,vira:sw};
var state='idle',score=0,step=0,current=null,timer=null,ctx=null,voice=null,d=DIFF.normal,mode='audio';
try{mode=localStorage.getItem('apg-mode')==='text'?'text':'audio'}catch(e){}

/* telas */
function show(n){['home','diff','set','game','rew','win'].forEach(function(k){$('s-'+k).hidden=(k!==n)});if(n==='rew')renderRew();cur=n;musicPlay()}
function setMode(m){
  mode=m;
  try{localStorage.setItem('apg-mode',m)}catch(e){}
  document.querySelectorAll('[data-mode]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.mode===m)});
}
setMode(mode);
$('go').onclick=function(){show('diff')};
$('open-set').onclick=function(){show('set')};
$('open-rew').onclick=function(){show('rew')};
var best=0;try{best=+localStorage.getItem('apg-best')||0}catch(e){}
function saveBest(){try{localStorage.setItem('apg-best',best)}catch(e){}}
var TIERS=[{p:450,n:1,w:10,l:'10m'},{p:675,n:2,w:15,l:'15m'},{p:1010,n:4,w:25,l:'25m'},{p:1515,n:6,w:40,l:'40m'},{p:2270,n:9,w:60,l:'1h'},{p:3000,n:12,w:90,l:'1h e 30m'}],clockT=null,curWait=3600000;
function fmt(n){return n.toLocaleString('pt-BR')}
var LOCK_MS=3600000,lockUntil=0;
try{lockUntil=+localStorage.getItem('apg-lock')||0}catch(e){}
function setLock(ms){lockUntil=Date.now()+(ms||LOCK_MS);try{localStorage.setItem('apg-lock',lockUntil)}catch(e){}}
function lockLeft(){return Math.max(0,lockUntil-Date.now())}
function mmss(ms){var t=Math.ceil(ms/1000),m=Math.floor(t/60),x=t%60;return (m<10?'0':'')+m+':'+(x<10?'0':'')+x}
setInterval(function(){if(!$('s-rew').hidden)renderRew()},1000);
function topTier(){var t=null;TIERS.forEach(function(x){if(best>=x.p)t=x});return t}
function buildTab(){
  var h='<table class="table table-dark table-sm table-borderless align-middle mb-0"><thead><tr><th>Pontos</th><th>Recompensa</th></tr></thead><tbody>';
  TIERS.forEach(function(t){h+='<tr><td>'+fmt(t.p)+' pontos</td><td><b>= '+t.n+(t.n>1?' balas':' bala')+'</b><small>(aguarde '+t.l+' para receber qualquer recompensa)</small></td></tr>'});
  $('rtab').innerHTML=h+'</tbody></table>';
}
buildTab();
function renderRew(){
  $('best').textContent=fmt(best);
  var rows=$('rtab').querySelectorAll('tbody tr');for(var i=0;i<rows.length;i++)rows[i].classList.toggle('reached',best>=TIERS[i].p);
  var top=topTier(),lk=lockLeft();
  $('redeem-btn').disabled=!top||lk>0;
  $('rew-st').textContent=lk>0?'Recompensas bloqueadas por mais '+mmss(lk)+'. Você poderá resgatar de novo depois desse tempo.':top?'Você vai receber '+top.n+(top.n>1?' balas':' bala')+'.':'Faltam '+fmt(TIERS[0].p-best)+' pontos para a primeira bala.';
}
$('redeem-btn').onclick=function(){var t=topTier();if(t&&!lockLeft())redeem(t)};
function tick(){$('win-clock').textContent=new Date().toLocaleTimeString('pt-BR')}
function redeem(t){
  var pts=best;best=0;saveBest();curWait=t.w*60000;setLock(curWait);
  $('win-t').textContent='Parabéns, você ganhou '+t.n+(t.n>1?' balas':' bala')+'! Vá para a mesa de onde você escaneou o QR code e receba '+(t.n>1?'suas balas':'sua bala')+' conversando com a gente.';
  $('win-pts').textContent=fmt(pts)+' pontos';
  $('win-done').textContent='Já recebi minhas balas';$('win-done').dataset.c='';
  tick();clearInterval(clockT);clockT=setInterval(tick,1000);
  window.onbeforeunload=function(e){e.preventDefault();e.returnValue='';return ''};
  show('win');
}
$('win-done').onclick=function(){
  var b=$('win-done');
  if(!b.dataset.c){b.dataset.c='1';b.textContent='Toque de novo para confirmar';return}
  clearInterval(clockT);window.onbeforeunload=null;setLock(curWait);show('home');
};
document.querySelectorAll('[data-back]').forEach(function(b){b.onclick=function(){show('home')}});
document.querySelectorAll('[data-mode]').forEach(function(b){b.onclick=function(){setMode(b.dataset.mode)}});
document.querySelectorAll('[data-d]').forEach(function(b){b.onclick=function(){start(b.dataset.d)}});

/* áudio */
function tone(f,dur,type,at,vol){
  if(!ctx)return;
  var o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+(at||0);
  o.type=type||'square';o.frequency.setValueAtTime(f,t);
  g.gain.setValueAtTime(vol||.12,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+dur);
}
function sOk(){tone(660,.09,'square',0);tone(990,.12,'square',.08)}
function sFail(){tone(220,.25,'sawtooth',0,.18);tone(140,.45,'sawtooth',.2,.18)}
var toonVoice=null,toonMale=false;
function pickVoice(){
  if(!window.speechSynthesis)return;
  var vs=speechSynthesis.getVoices();
  var pt=vs.filter(function(v){return /^pt/i.test(v.lang)});
    var br=pt.filter(function(v){return /pt[-_]BR/i.test(v.lang)});
    voice=(br.length?br:pt).find(function(v){return /natural|neural|online|google|luciana|francisca|vit[oó]ria/i.test(v.name)})||br[0]||pt[0]||null;
  var male=(br.length?br:pt).find(function(v){return /daniel|felipe|ricardo|ant[oô]nio|donato|jorge|male|masculin/i.test(v.name)});
  toonMale=!!male;toonVoice=male||voice;
}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
var hardMode=false;
var FONTS=["'Pacifico',cursive","'Special Elite','Courier New',monospace","'Rye',serif","'Creepster',cursive","'Bungee',sans-serif","'Press Start 2P',monospace","'Permanent Marker',cursive","'Lobster',cursive","'Caveat',cursive","'Orbitron',sans-serif","'Fredericka the Great',serif","'Chewy',cursive","'Bowlby One','Arial Black',sans-serif","'Times New Roman',serif"];
function clearCmd(){cmdEl.classList.remove('rnd');cmdEl.textContent=''}
var hiss=null,hissBuf=null;
function hissStop(owner){
  if(!hiss||(owner&&hiss.owner!==owner))return;
  var h=hiss;hiss=null;clearTimeout(h.to);
  try{var t=ctx.currentTime;h.g.gain.cancelScheduledValues(t);h.g.gain.setValueAtTime(h.g.gain.value,t);h.g.gain.linearRampToValueAtTime(0,t+.04);h.src.stop(t+.06)}catch(e){}
}
function hissStart(owner,level){
  if(!ctx)return;
  hissStop();
  if(!hissBuf){
    var n=ctx.sampleRate*2,d;hissBuf=ctx.createBuffer(1,n,ctx.sampleRate);d=hissBuf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=Math.random()*2-1;
  }
  var src=ctx.createBufferSource();src.buffer=hissBuf;src.loop=true;
  var hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;
  var lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=7000;
  var g=ctx.createGain(),t=ctx.currentTime;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.03);
  src.connect(hp);hp.connect(lp);lp.connect(g);g.connect(ctx.destination);src.start(t);
  hiss={src:src,g:g,owner:owner,to:setTimeout(function(){hissStop(owner)},4000)};
}
function hardText(t){
  clearCmd();
  t.split('').forEach(function(ch){
    var sp=document.createElement('span');
    sp.textContent=ch===' '?'\u00a0':ch;
    sp.style.cssText='display:inline-block;font-family:'+FONTS[Math.floor(Math.random()*FONTS.length)]+';opacity:'+(.22+Math.random()*.28).toFixed(2)+';transform:rotate('+Math.round(Math.random()*24-12)+'deg);font-size:'+(.8+Math.random()*.4).toFixed(2)+'em;filter:blur(.6px)';
    cmdEl.appendChild(sp);
  });
  cmdEl.classList.add('rnd');
  cmdEl.style.left='0px';cmdEl.style.top='0px';
  var w=cmdEl.offsetWidth,h=cmdEl.offsetHeight,m=10,g=18;
  var tr=toy.getBoundingClientRect(),r1=scEl.getBoundingClientRect(),r2=scEl.nextElementSibling.getBoundingClientRect();
  var boxes=[{l:tr.left-g,r:tr.right+g,t:tr.top-tr.height*.22-g,b:tr.bottom+g},{l:Math.min(r1.left,r2.left)-g,r:Math.max(r1.right,r2.right)+g,t:r1.top-g,b:r2.bottom+g}];
  var x,y,ok=false;
  for(var i=0;i<60&&!ok;i++){
    x=m+Math.random()*Math.max(0,innerWidth-w-2*m);
    y=m+Math.random()*Math.max(0,innerHeight-h-2*m);
    ok=boxes.every(function(k){return x+w<=k.l||x>=k.r||y+h<=k.t||y>=k.b});
  }
  if(!ok){x=Math.max(m,(innerWidth-w)/2);y=Math.max(m,innerHeight-h-m)}
  cmdEl.style.left=Math.round(x)+'px';cmdEl.style.top=Math.round(y)+'px';
}
var TOON={'Aperta!':'Apeeeerta!','Puxa!':'Puuuuxa!','Gira!':'Giiiira!'};
function boing(){
  if(!ctx)return;
  var o=ctx.createOscillator(),v=ctx.createOscillator(),vg=ctx.createGain(),g=ctx.createGain(),t=ctx.currentTime;
  o.type='sine';o.frequency.setValueAtTime(200,t);o.frequency.exponentialRampToValueAtTime(1000,t+.2);
  v.frequency.value=28;vg.gain.value=40;v.connect(vg);vg.connect(o.frequency);
  g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.26);
  o.connect(g);g.connect(ctx.destination);o.start(t);v.start(t);o.stop(t+.28);v.stop(t+.28);
}
function say(text,rate,hard){
  if(!window.speechSynthesis)return;
  try{
    speechSynthesis.cancel();
    var cartoon=!hard&&TOON[text];
    var u=new SpeechSynthesisUtterance(cartoon||text);
    u.lang='pt-BR';u.volume=1;
    if(hard){
      if(voice)u.voice=voice;
      u.pitch=.5+Math.random()*.12;
      u.rate=Math.min(1.7,rate*(.95+Math.random()*.1));
      u.onstart=function(){hissStart(u,.07)};
      u.onend=u.onerror=function(){hissStop(u)};
    }else{
      if(toonVoice)u.voice=toonVoice;
      u.pitch=toonMale?1.8+Math.random()*.2:1+Math.random()*.15;
      u.rate=Math.min(2,rate*(1.08+Math.random()*.12));
      if(cartoon)boing();
    }
    speechSynthesis.speak(u);
  }catch(e){}
}

/* fluxo */
function clearGlow(){Object.keys(TARGET).forEach(function(k){TARGET[k].classList.remove('glow')})}
var bgm=$('bgm'),interacted=false,cur='home';
/* Musica de fundo: toca depois da 1a interacao; na tela do jogo com voz (modo Audio) fica em 10% */
/* Volume da musica: escolhido pelo jogador em Configuracoes (0 a 100%). No jogo por audio ela cai para 20% do escolhido (10% no padrao) */
var GAME_FACTOR=0.2,userVol=0.5;
try{var sv=localStorage.getItem('apg-vol');if(sv!==null&&!isNaN(+sv))userVol=Math.max(0,Math.min(1,+sv))}catch(e){}
function musicVol(){return userVol*((cur==='game'&&mode==='audio')?GAME_FACTOR:1)}
/* iPhone/iPad ignoram bgm.volume: nele o volume passa por um controle de ganho do Web Audio */
var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
var mctx=null,mgain=null;
function musicSetup(){
  if(!isIOS||mgain)return;
  try{
    mctx=new (window.AudioContext||window.webkitAudioContext)();
    var src=mctx.createMediaElementSource(bgm);
    mgain=mctx.createGain();src.connect(mgain);mgain.connect(mctx.destination);
  }catch(e){mgain=null}
}
function applyVol(){
  var v=musicVol();
  if(mgain){mgain.gain.value=v;bgm.volume=1}else{bgm.volume=v}
}
function musicPlay(){
  if(!interacted)return;
  try{
    musicSetup();
    if(mctx&&mctx.state==='suspended')mctx.resume();
    applyVol();
    var p=bgm.play();if(p&&p.catch)p.catch(function(){});
  }catch(e){}
}
/* Destrava e mantem a musica: tenta a cada toque/tecla ate tocar (iPhone so libera audio em touchend/click) */
function musicKick(){
  interacted=true;
  if(bgm.paused||(mctx&&mctx.state!=='running'))musicPlay();
}
['pointerdown','pointerup','touchend','click','keydown'].forEach(function(ev){document.addEventListener(ev,musicKick,true)});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&interacted)musicKick()});
/* controle deslizante de volume (Configuracoes) */
var volEl=$('vol'),volTxt=$('vol-v');
volEl.value=Math.round(userVol*100);volTxt.textContent=volEl.value+'%';
volEl.addEventListener('input',function(){
  userVol=volEl.value/100;volTxt.textContent=volEl.value+'%';
  try{localStorage.setItem('apg-vol',userVol)}catch(e){}
  applyVol();
});
function start(diff){
  d=DIFF[diff];
  pStart=null;pull.style.transition='';pull.style.transform='';
  if(!ctx){try{ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  if(ctx&&ctx.state==='suspended')ctx.resume();
  if(window.speechSynthesis){try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}catch(e){}}
  clearTimeout(timer);score=0;step=0;current=null;
  hardMode=diff==='dificil';
  toy.classList.toggle('hard',hardMode);
  scEl.textContent='0';clearCmd();clearGlow();
  state='ready';
  show('game');
  var msg='Clique no botão vermelho para começar!';
  btn.classList.add('glow');
  if(mode==='audio')say(msg,1);else{cmdEl.classList.add('small');cmdEl.textContent=msg}
}
function begin(){
  clearGlow();cmdEl.classList.remove('small');clearCmd();
  if(window.speechSynthesis)speechSynthesis.cancel();
  state='gap';
  tone(440,.1,'square',0);tone(660,.1,'square',.1);tone(880,.16,'square',.2);
  timer=setTimeout(next,1000);
}
function next(){
  var c;
  do{c=d.keys[Math.floor(Math.random()*d.keys.length)]}while(c===current&&Math.random()<.6);
  current=c;state='listening';
  if(mode==='audio')say(CMD[c],Math.min(d.rm,1+step*d.rs),hardMode);else if(hardMode)hardText(CMD[c]);else cmdEl.textContent=CMD[c];
  if(d.glow)TARGET[c].classList.add('glow');
  timer=setTimeout(fail,Math.max(d.wm,d.w*Math.pow(d.wd,step)));
}
function act(a){
  if(state==='ready'){if(a==='aperta')begin();return}
  if(state!=='listening')return;
  clearTimeout(timer);clearGlow();clearCmd();
  if(a!==current){fail();return}
  score+=d.pts;step++;state='gap';
  scEl.textContent=score;sOk();
  toy.classList.add('ok');setTimeout(function(){toy.classList.remove('ok')},120);
  timer=setTimeout(next,Math.max(d.gm,d.g*Math.pow(d.gd,step)));
}
function fail(){
  if(state==='idle')return;
  clearTimeout(timer);clearGlow();state='idle';
  if(window.speechSynthesis)speechSynthesis.cancel();
  sFail();
  toy.classList.remove('shake');void toy.offsetWidth;toy.classList.add('shake');
  setTimeout(function(){
    if(score>best){best=score;saveBest()}
    var l=$('last');l.hidden=false;l.textContent='Fim de jogo: '+score+' pontos';
    show('home');
  },900);
}

/* aperta */
btn.addEventListener('pointerdown',function(e){e.preventDefault();btn.classList.add('down');act('aperta')});
['pointerup','pointerleave','pointercancel'].forEach(function(ev){btn.addEventListener(ev,function(){btn.classList.remove('down')})});
btn.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();btn.classList.add('down');act('aperta')}});
btn.addEventListener('keyup',function(){btn.classList.remove('down')});

/* puxa */
var pStart=null,pDone=false;
function pMove(dy){pull.style.transform='translate3d(0,'+(-Math.max(0,Math.min(dy,70)))+'px,0)'}
function repaint(el){el.style.display='none';void el.offsetHeight;el.style.display=''}
function pReset(){pull.style.transition='transform .18s';pull.style.transform='translate3d(0,0,0)';setTimeout(function(){pull.style.transition='';pull.style.transform='';repaint(pull)},230)}
hit.addEventListener('pointerdown',function(e){e.preventDefault();hit.setPointerCapture(e.pointerId);pStart=e.clientY;pDone=false});
hit.addEventListener('pointermove',function(e){
  if(pStart===null)return;
  var dy=pStart-e.clientY;pMove(dy);
  if(!pDone&&dy>=45){pDone=true;act('puxa')}
});
function pEnd(){if(pStart===null)return;pStart=null;pReset()}
hit.addEventListener('pointerup',pEnd);hit.addEventListener('pointercancel',pEnd);hit.addEventListener('lostpointercapture',pEnd);
hit.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pMove(60);act('puxa');setTimeout(pReset,150)}});

/* gira */
var dAng=null,dAcc=0,dRot=0,dDone=false;
function angle(e){var r=dial.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI}
dial.addEventListener('pointerdown',function(e){e.preventDefault();dial.setPointerCapture(e.pointerId);dAng=angle(e);dAcc=0;dDone=false});
dial.addEventListener('pointermove',function(e){
  if(dAng===null)return;
  var a=angle(e),df=a-dAng;
  if(df>180)df-=360;if(df<-180)df+=360;
  dAng=a;dAcc+=df;dRot+=df;
  dial.style.transform='rotate('+dRot+'deg)';
  if(!dDone&&Math.abs(dAcc)>=70){dDone=true;act('gira')}
});
function dEnd(){dAng=null}
dial.addEventListener('pointerup',dEnd);dial.addEventListener('pointercancel',dEnd);
dial.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();dRot+=90;dial.style.transform='rotate('+dRot+'deg)';act('gira')}});

/* desliza */
var sX=null,sMax=0,sDone=false;
sl.addEventListener('pointerdown',function(e){e.preventDefault();sl.setPointerCapture(e.pointerId);sX=e.clientX;sDone=false;sMax=sl.clientWidth-kn.offsetWidth});
sl.addEventListener('pointermove',function(e){
  if(sX===null)return;
  var dx=Math.max(0,Math.min(e.clientX-sX,sMax));
  kn.style.transform='translateX('+dx+'px)';
  if(!sDone&&dx>=sMax*.6){sDone=true;act('desliza')}
});
function sEnd(){sX=null;kn.style.transition='transform .2s';kn.style.transform='';setTimeout(function(){kn.style.transition=''},220)}
sl.addEventListener('pointerup',sEnd);sl.addEventListener('pointercancel',sEnd);
sl.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();act('desliza')}});

/* vira */
function flip(){sw.classList.toggle('on');act('vira')}
sw.addEventListener('pointerdown',function(e){e.preventDefault();flip()});
sw.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();flip()}});
})();