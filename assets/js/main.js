window.addEventListener('error',function(e){var d=document.createElement('div');d.style.cssText='position:fixed;left:0;right:0;top:0;z-index:9999;background:#b00020;color:#fff;padding:10px;font:14px sans-serif';d.textContent='Erro: '+e.message+' (linha '+e.lineno+')';document.body.appendChild(d)});
/* =========================================================
   ESTRUTURA GERAL
   Todo o código fica dentro de (function(){ ... })();
   É uma função que se executa sozinha (IIFE). Ela isola as variáveis,
   para não "vazarem" para o resto da página.
   ========================================================= */
(function(){

/* Atalho: $('id') devolve o elemento HTML que tem aquele id. Evita repetir document.getElementById. */
var $=function(id){return document.getElementById(id)};

/* =========================================================
   CONFIGURAÇÃO DO JOGO
   ========================================================= */

/* Texto de cada comando (também usado na fala). */
var CMD={aperta:'Aperta!',puxa:'Puxa!',gira:'Gira!',desliza:'Desliza!',vira:'Vira!'};

/* Comandos de Fácil e Normal. */
var BASE=['aperta','puxa','gira'];

/* Parâmetros de cada dificuldade:
   pts  = pontos por acerto
   w    = tempo inicial para agir (ms); wd = fator que reduz esse tempo a cada acerto; wm = tempo mínimo
   g    = pausa inicial entre comandos (ms); gd = fator de redução; gm = pausa mínima
   rm   = velocidade máxima da voz; rs = aumento da velocidade da voz por acerto
   glow = true faz a peça certa brilhar
   keys = comandos possíveis (o Difícil acrescenta Desliza e Vira) */
var DIFF={
  facil:{pts:50,w:3200,wd:.97,wm:1100,g:900,gd:.96,gm:350,rm:1.4,rs:.015,glow:true,keys:BASE},
  normal:{pts:100,w:2600,wd:.94,wm:850,g:750,gd:.93,gm:160,rm:1.9,rs:.035,glow:false,keys:BASE},
  dificil:{pts:150,w:2400,wd:.91,wm:720,g:650,gd:.9,gm:120,rm:2.2,rs:.055,glow:false,keys:BASE.concat(['desliza','vira'])}
};

/* Referências aos elementos do brinquedo (guardamos em variáveis para não buscar toda hora). */
var toy=$('toy'),cmdEl=$('cmd'),scEl=$('sc'),btn=$('btn'),pull=$('pull'),hit=$('pullHit'),dial=$('dial'),sl=$('slide'),kn=$('knob'),sw=$('sw');

/* Liga o nome de cada comando à peça correspondente (usado para fazer a peça brilhar). */
var TARGET={aperta:btn,puxa:pull,gira:dial,desliza:sl,vira:sw};

/* ESTADO DO JOGO:
   state   = fase atual: 'idle' (parado), 'ready' (aguardando o 1º clique), 'listening' (esperando a ação), 'gap' (pausa entre comandos)
   score   = pontos da partida; step = quantos acertos seguidos (acelera o jogo)
   current = comando atual; timer = temporizador ativo
   ctx     = contexto de áudio (sons de efeito); voice = voz base do celular
   d       = dificuldade atual; mode = 'audio' (voz) ou 'text' (escrito) */
var state='idle',score=0,step=0,current=null,timer=null,ctx=null,voice=null,d=DIFF.normal,mode='audio';

/* localStorage guarda dados no navegador (permanecem ao fechar a página).
   try/catch evita erro se o navegador bloquear o armazenamento. */
try{mode=localStorage.getItem('apg-mode')==='text'?'text':'audio'}catch(e){}

/* =========================================================
   TELAS
   ========================================================= */

/* show('nome') mostra a tela escolhida e esconde as outras.
   Também atualiza telas que dependem de dados (recompensas, loja e Hall da Fama), guarda a tela atual em "cur"
   (declarada mais abaixo; var permite usar antes por "hoisting") e garante que a música esteja tocando. */
function show(n){['home','diff','set','game','rew','win','shop','login','hall'].forEach(function(k){$('s-'+k).hidden=(k!==n)});if(n==='rew')renderRew();if(n==='shop')renderShop();if(n==='hall')renderHall(false);cur=n;musicPlay()}

/* Salva e destaca o modo de comando escolhido (áudio ou escrita). */
function setMode(m){
  mode=m;
  try{localStorage.setItem('apg-mode',m)}catch(e){}
  document.querySelectorAll('[data-mode]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.mode===m)});
}
setMode(mode);

/* Botões do menu inicial. */
$('go').onclick=function(){show('diff')};
$('open-set').onclick=function(){show('set')};
$('open-rew').onclick=function(){show('rew')};
$('open-shop').onclick=function(){show('shop')};

/* =========================================================
   RECOMPENSAS (BALAS)
   ========================================================= */

/* Melhor pontuação em UMA partida (é ela que vale para as balas). */
var best=0;try{best=+localStorage.getItem('apg-best')||0}catch(e){}
function saveBest(){try{localStorage.setItem('apg-best',best)}catch(e){}}

/* Faixas de recompensa. Para mudar metas, balas ou esperas, edite esta lista:
   p = pontos necessários; n = balas; w = espera em minutos; l = texto da espera. */
var TIERS=[{p:450,n:1,w:10,l:'10m'},{p:675,n:2,w:15,l:'15m'},{p:1010,n:4,w:25,l:'25m'},{p:1515,n:6,w:40,l:'40m'},{p:2270,n:9,w:60,l:'1h'},{p:3000,n:12,w:90,l:'1h e 30m'}],clockT=null,curWait=3600000;

/* Formata números no padrão brasileiro (1010 vira 1.010). */
function fmt(n){return n.toLocaleString('pt-BR')}

/* BLOQUEIO após resgatar: guarda o momento em que o resgate volta a ser liberado. */
var LOCK_MS=3600000,lockUntil=0;
try{lockUntil=+localStorage.getItem('apg-lock')||0}catch(e){}
function setLock(ms){lockUntil=Date.now()+(ms||LOCK_MS);try{localStorage.setItem('apg-lock',lockUntil)}catch(e){}}
function lockLeft(){return Math.max(0,lockUntil-Date.now())}   /* milissegundos que faltam */
function mmss(ms){var t=Math.ceil(ms/1000),m=Math.floor(t/60),x=t%60;return (m<10?'0':'')+m+':'+(x<10?'0':'')+x}

/* A cada 1 segundo, se a tela de recompensas estiver aberta, atualiza a contagem regressiva. */
setInterval(function(){if(!$('s-rew').hidden)renderRew()},1000);

/* Devolve a MAIOR faixa que a melhor pontuação alcançou (ou null). */
function topTier(){var t=null;TIERS.forEach(function(x){if(best>=x.p)t=x});return t}

/* Monta a tabela de faixas na tela de recompensas, uma linha por faixa. */
function buildTab(){
  var h='<table class="table table-dark table-sm table-borderless align-middle mb-0"><thead><tr><th>Pontos</th><th>Recompensa</th></tr></thead><tbody>';
  TIERS.forEach(function(t){h+='<tr><td>'+fmt(t.p)+' pontos</td><td><b>= '+t.n+(t.n>1?' balas':' bala')+'</b><small>(aguarde '+t.l+' para receber qualquer recompensa)</small></td></tr>'});
  $('rtab').innerHTML=h+'</tbody></table>';
}
buildTab();

/* Atualiza a tela de recompensas: melhor pontuação, linhas destacadas, botão e mensagem de status. */
function renderRew(){
  $('best').textContent=fmt(best);
  var rows=$('rtab').querySelectorAll('tbody tr');for(var i=0;i<rows.length;i++)rows[i].classList.toggle('reached',best>=TIERS[i].p);
  var top=topTier(),lk=lockLeft();
  $('redeem-btn').disabled=!top||lk>0;   /* desativa se não há meta alcançada ou se há bloqueio */
  $('rew-st').textContent=lk>0?'Recompensas bloqueadas por mais '+mmss(lk)+'. Você poderá resgatar de novo depois desse tempo.':top?'Você vai receber '+top.n+(top.n>1?' balas':' bala')+'.':'Faltam '+fmt(TIERS[0].p-best)+' pontos para a primeira bala.';
}

/* Um único botão resgata automaticamente a maior faixa alcançada. */
$('redeem-btn').onclick=function(){var t=topTier();if(t&&!lockLeft())redeem(t)};

/* Relógio da tela de comprovação (prova de que a tela está "ao vivo"). */
function tick(){$('win-clock').textContent=new Date().toLocaleTimeString('pt-BR')}

/* Resgate: zera a melhor pontuação (impede resgatar duas vezes), ativa o bloqueio da faixa
   e mostra a tela de comprovação. onbeforeunload pede confirmação se tentarem fechar a aba. */
function redeem(t){
  var pts=best;best=0;saveBest();curWait=t.w*60000;setLock(curWait);
  $('win-t').textContent='Parabéns, você ganhou '+t.n+(t.n>1?' balas':' bala')+'! Vá para a mesa de onde você escaneou o QR code e receba '+(t.n>1?'suas balas':'sua bala')+' conversando com a gente.';
  $('win-pts').textContent=fmt(pts)+' pontos';
  $('win-done').textContent='Já recebi minhas balas';$('win-done').dataset.c='';
  tick();clearInterval(clockT);clockT=setInterval(tick,1000);
  window.onbeforeunload=function(e){e.preventDefault();e.returnValue='';return ''};
  show('win');
}

/* Saída da tela de comprovação exige dois toques (confirmação). No segundo, reforça o bloqueio. */
$('win-done').onclick=function(){
  var b=$('win-done');
  if(!b.dataset.c){b.dataset.c='1';b.textContent='Toque de novo para confirmar';return}
  clearInterval(clockT);window.onbeforeunload=null;setLock(curWait);show('home');
};

/* Liga os botões genéricos: "Voltar" (data-back), escolha de modo (data-mode) e de dificuldade (data-d). */
document.querySelectorAll('[data-back]').forEach(function(b){b.onclick=function(){show('home')}});
document.querySelectorAll('[data-mode]').forEach(function(b){b.onclick=function(){setMode(b.dataset.mode)}});
document.querySelectorAll('[data-d]').forEach(function(b){b.onclick=function(){start(b.dataset.d)}});

/* =========================================================
   SONS DE EFEITO (gerados por código, sem arquivos)
   ========================================================= */

/* Toca um tom simples: frequência (f), duração, tipo de onda, atraso (at) e volume (vol). */
function tone(f,dur,type,at,vol){
  if(!ctx)return;
  var o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+(at||0);
  o.type=type||'square';o.frequency.setValueAtTime(f,t);
  g.gain.setValueAtTime(vol||.12,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);   /* o som vai sumindo */
  o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+dur);
}
function sOk(){tone(660,.09,'square',0);tone(990,.12,'square',.08)}                    /* som de acerto */
function sFail(){tone(220,.25,'sawtooth',0,.18);tone(140,.45,'sawtooth',.2,.18)}      /* som de erro */

/* =========================================================
   LOJA
   Os pontos de cada partida viram "moedas" para personalizar o jogo.
   ========================================================= */

/* coins = saldo; own = itens comprados; sel = itens equipados; shopTab = aba aberta. */
var coins=0,own={},sel={bg:'roxo',toy:'amarelo',font:'padrao',voice:'desenho'},shopTab='bg';
try{coins=+localStorage.getItem('apg-coins')||0;own=JSON.parse(localStorage.getItem('apg-own')||'{}');Object.assign(sel,JSON.parse(localStorage.getItem('apg-sel')||'{}'))}catch(e){}
function saveShop(){try{localStorage.setItem('apg-coins',coins);localStorage.setItem('apg-own',JSON.stringify(own));localStorage.setItem('apg-sel',JSON.stringify(sel))}catch(e){}}

/* CATÁLOGO da Loja. Cada item tem id, nome (n), preço (p) e valores (v):
   bg  = [cor clara do fundo, cor escura, cor dos cartões]
   toy = [luz, cor principal, sombra interna, sombra externa]
   font = nome da fonte em CSS (fs = tamanho da amostra, quando a fonte é larga)
   voice = pitch (tom), rate (velocidade) e k (qual voz do aparelho usar: 'fem' ou 'male')
   Para criar um item novo, basta copiar uma linha e ajustar. Preço 0 = já vem liberado. */
var SHOP={
 bg:{n:'Fundo',items:[
  {id:'roxo',n:'Roxo clássico',p:0,v:['#2a1850','#1b0f38','#3a2570']},
  {id:'oceano',n:'Oceano',p:500,v:['#0d3b66','#06203a','#145a8a']},
  {id:'floresta',n:'Floresta',p:500,v:['#1f5a3a','#0e2d1d','#2a7a4f']},
  {id:'sol',n:'Pôr do sol',p:700,v:['#8a3a2e','#2b1033','#a04a52']},
  {id:'galaxia',n:'Galáxia',p:900,v:['#1a1a2e','#05050a','#2c2c4a']}]},
 toy:{n:'Brinquedo',items:[
  {id:'amarelo',n:'Amarelo',p:0,v:['#ffe27a','#ffc72c','#d99a00','#8f6400']},
  {id:'rosa',n:'Rosa',p:400,v:['#ffb3d9','#ff5fb0','#c2307f','#7a1a50']},
  {id:'azul',n:'Azul',p:400,v:['#9fd8ff','#3d9bff','#1f64c2','#123e7a']},
  {id:'verde',n:'Verde',p:400,v:['#b5f5a0','#52d44a','#2c9a2e','#17621c']},
  {id:'laranja',n:'Laranja',p:400,v:['#ffd199','#ff8a1f','#cc5f00','#7a3a00']}]},
 font:{n:'Fonte',items:[
  {id:'padrao',n:'Padrão',p:0,v:"'Bowlby One','Arial Black',sans-serif"},
  {id:'pacifico',n:'Pacifico',p:300,v:"'Pacifico',cursive"},
  {id:'lobster',n:'Lobster',p:300,v:"'Lobster',cursive"},
  {id:'bungee',n:'Bungee',p:400,fs:15,v:"'Bungee',sans-serif"},
  {id:'marker',n:'Permanent Marker',p:400,v:"'Permanent Marker',cursive"},
  {id:'pixel',n:'Press Start 2P',p:500,fs:11,v:"'Press Start 2P',monospace"},
  {id:'creepster',n:'Creepster',p:600,v:"'Creepster',cursive"}]},
 voice:{n:'Voz',items:[
  {id:'desenho',n:'Desenho (padrão)',p:0,pitch:1.9},
  {id:'feminina',n:'Feminina',p:500,pitch:1.1,rate:1,k:'fem'},
  {id:'esquilo',n:'Esquilo',p:600,pitch:2,rate:1.25},
  {id:'gigante',n:'Gigante',p:600,pitch:.6,rate:.9,k:'male'},
  {id:'robo',n:'Robô',p:800,pitch:.8,rate:.85}]}
};

/* Avisos exibidos só nas abas Fonte e Voz. */
var SHOP_NOTE={font:'Na dificuldade Difícil, qualquer fonte adquirida será exibida com menor intensidade (mais apagada).',voice:'Na dificuldade Difícil, qualquer voz adquirida será reproduzida com ruído de fundo.'};

/* Devolve o item equipado de uma categoria (ou o primeiro, se não achar). */
function pick(c){var l=SHOP[c].items;return l.find(function(x){return x.id===sel[c]})||l[0]}

/* Aplica o visual escolhido: troca as variáveis CSS direto no <html>.
   Como o CSS usa var(--bg), var(--toy)..., a mudança aparece em todo o jogo na hora. */
function applyTheme(){
  var r=document.documentElement.style,b=pick('bg').v,t=pick('toy').v;
  r.setProperty('--bg',b[0]);r.setProperty('--bg2',b[1]);r.setProperty('--card',b[2]);
  r.setProperty('--toy-l',t[0]);r.setProperty('--toy',t[1]);r.setProperty('--toy-d',t[2]);r.setProperty('--toy-s',t[3]);
  r.setProperty('--cmd-font',pick('font').v);
}
applyTheme();

/* Desenha a Loja: abas, itens da aba atual (com amostra, nome e botão) e o aviso da aba. */
function renderShop(){
  $('coins').textContent=fmt(coins);
  var h='';
  Object.keys(SHOP).forEach(function(k){h+='<button class="btn opt" data-tab="'+k+'" aria-pressed="'+(k===shopTab)+'">'+SHOP[k].n+'</button>'});
  $('shop-tabs').innerHTML=h;h='';
  SHOP[shopTab].items.forEach(function(it){
    var owned=it.p===0||own[shopTab+':'+it.id],on=sel[shopTab]===it.id,pv='';   /* owned = já possui; on = equipado; pv = amostra */
    if(shopTab==='bg')pv='<span class="sw-p" style="background:radial-gradient(circle,'+it.v[0]+','+it.v[1]+')"></span>';
    else if(shopTab==='toy')pv='<span class="sw-p" style="background:radial-gradient(circle at 35% 30%,'+it.v[0]+','+it.v[1]+' 50%,'+it.v[2]+')"></span>';
    else if(shopTab==='font')pv='<span class="f-p" style="font-family:'+it.v+(it.fs?';font-size:'+it.fs+'px':'')+'">Aperta!</span>';
    else pv='<button class="btn btn-ghost listen" data-hear="'+it.id+'">🔊 Ouvir</button>';
    h+='<div class="shop-it">'+pv+'<div class="shop-n">'+it.n+'</div>'+(on?'<span class="shop-on">Equipado</span>':'<button class="btn btn-main shop-b" data-buy="'+it.id+'"'+(!owned&&coins<it.p?' disabled':'')+'>'+(owned?'Equipar':'Comprar · '+fmt(it.p))+'</button>')+'</div>';
  });
  $('shop-list').innerHTML=h;
  var nt=$('shop-note'),tx=SHOP_NOTE[shopTab]||'';nt.textContent=tx;nt.hidden=!tx;
}

/* Um único "ouvinte" de clique para toda a Loja (delegação de eventos): como os botões são criados
   dinamicamente, escutamos a tela inteira e descobrimos qual botão foi clicado (closest). */
$('s-shop').addEventListener('click',function(e){
  var b=e.target.closest('[data-tab],[data-buy],[data-hear]');if(!b)return;
  if(b.dataset.tab){shopTab=b.dataset.tab;renderShop();return}                     /* trocar de aba */
  if(b.dataset.hear){say('Aperta!',1,false,b.dataset.hear);return}                 /* ouvir a voz */
  var it=SHOP[shopTab].items.find(function(x){return x.id===b.dataset.buy}),k=shopTab+':'+it.id;
  if(it.p&&!own[k]){if(coins<it.p)return;coins-=it.p;own[k]=1}                    /* comprar, se tiver saldo */
  sel[shopTab]=it.id;saveShop();applyTheme();renderShop();                         /* equipar e atualizar */
});

/* =========================================================
   LOGIN E HALL DA FAMA
   O ranking fica no Firebase (Firestore), compartilhado entre todos os jogadores.
   Se a configuração FB abaixo ficar vazia, o jogo guarda tudo só no aparelho (modo de teste).
   ========================================================= */
var FB={key:'AIzaSyB5o9CSFFYPKM_485Gv5_u0FS98l8rPdNY',project:'bop-it-35ed7'};   /* chave (apiKey) e id do projeto do Firebase */
var RANK_TEST=false;                   /* true só no modo de teste local: mostra o botão "Atualizar agora" */
var FB_ON=!!(FB.key&&FB.project);
var DAY=86400000,user=null,curDiff='normal';   /* DAY = 24 horas em milissegundos; user = nome do jogador */
try{user=localStorage.getItem('apg-user')}catch(e){}
function lsGet(k,df){try{return JSON.parse(localStorage.getItem(k))||df}catch(e){return df}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function nkey(n){return n.toLowerCase()}   /* nomes iguais, mesmo com maiúsculas diferentes, contam como repetidos */
var DIFFS=[['facil','Fácil'],['normal','Normal'],['dificil','Difícil']];

/* --- Armazenamento 1: Firestore (REST). Cada jogador é um documento players/<id>. --- */
var FB_URL='https://firestore.googleapis.com/v1/projects/'+FB.project+'/databases/(default)/documents';
/* fbCall faz uma chamada ao Firestore e devolve {s: status HTTP, j: resposta em JSON}. */
function fbCall(path,o){
  o=o||{};
  var url=FB_URL+path+(path.indexOf('?')<0?'?':'&')+'key='+FB.key+(o.q||'');
  return fetch(url,{method:o.m||'GET',headers:o.b?{'Content-Type':'application/json'}:{},body:o.b?JSON.stringify(o.b):undefined}).then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){return {s:r.status,j:j}});
  });
}
/* O identificador do documento é o nome em minúsculas convertido em hexadecimal: sempre válido e único. */
function pid(k){return 'u_'+Array.prototype.map.call(new TextEncoder().encode(k),function(b){return ('0'+b.toString(16)).slice(-2)}).join('')}
function fInt(f,n){return f&&f[n]&&f[n].integerValue?+f[n].integerValue:0}   /* lê um número inteiro de um documento do Firestore */
var RANK_FB={
  has:function(k){return fbCall('/players/'+pid(k)).then(function(r){if(r.s===200)return true;if(r.s===404)return false;throw new Error(r.s)})},
  /* criar com documentId falha com o código 409 se o nome já existir: é isso que impede nomes repetidos */
  create:function(k,name){
    return fbCall('/players',{m:'POST',q:'&documentId='+pid(k),b:{fields:{name:{stringValue:name},facil:{integerValue:'0'},normal:{integerValue:'0'},dificil:{integerValue:'0'}}}}).then(function(r){if(r.s===200)return true;if(r.s===409)return false;throw new Error(r.s)});
  },
  score:function(k,df,pts){
    var f={};f[df]={integerValue:String(pts)};
    return fbCall('/players/'+pid(k),{m:'PATCH',q:'&updateMask.fieldPaths='+df+'&currentDocument.exists=true',b:{fields:f}}).then(function(r){if(r.s!==200)throw new Error(r.s)});
  },
  top:function(df){   /* os 10 maiores de uma dificuldade (só 10 leituras) */
    return fbCall(':runQuery',{m:'POST',b:{structuredQuery:{from:[{collectionId:'players'}],orderBy:[{field:{fieldPath:df},direction:'DESCENDING'}],limit:10}}}).then(function(r){
      if(r.s!==200)throw new Error(r.s);
      return (r.j||[]).filter(function(x){return x.document}).map(function(x){return {n:x.document.fields.name.stringValue,s:fInt(x.document.fields,df)}}).filter(function(x){return x.s>0});
    });
  },
  getSnap:function(){   /* lê a "fotografia" do ranking (meta/snapshot) */
    return fbCall('/meta/snapshot').then(function(r){
      if(r.s===404)return null;if(r.s!==200)throw new Error(r.s);
      var f=r.j.fields||{},sn=JSON.parse(f.data.stringValue);sn.t=Date.parse(f.t.timestampValue);return sn;
    });
  },
  /* grava a fotografia com a hora do SERVIDOR; as regras recusam se tiver menos de 24h (outro aparelho já atualizou) */
  setSnap:function(sn){
    var d={facil:sn.facil,normal:sn.normal,dificil:sn.dificil};
    return fbCall(':commit',{m:'POST',b:{writes:[{update:{name:'projects/'+FB.project+'/databases/(default)/documents/meta/snapshot',fields:{data:{stringValue:JSON.stringify(d)}}},updateTransforms:[{fieldPath:'t',setToServerValue:'REQUEST_TIME'}]}]}}).then(function(){},function(){});
  }
};

/* --- Armazenamento 2: só neste aparelho (modo de teste, sem Firebase). --- */
var RANK_LOCAL={
  has:function(k){return Promise.resolve(!!lsGet('apg-players',{})[k])},
  create:function(k,name){var p=lsGet('apg-players',{});if(p[k])return Promise.resolve(false);p[k]={name:name,facil:0,normal:0,dificil:0};lsSet('apg-players',p);return Promise.resolve(true)},
  score:function(k,df,pts){var p=lsGet('apg-players',{});if(p[k]&&pts>p[k][df]){p[k][df]=pts;lsSet('apg-players',p)}return Promise.resolve()},
  top:function(df){var p=lsGet('apg-players',{});return Promise.resolve(Object.keys(p).map(function(k){return {n:p[k].name,s:p[k][df]}}).filter(function(x){return x.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,10))},
  getSnap:function(){return Promise.resolve(lsGet('apg-snap',null))},
  setSnap:function(sn){lsSet('apg-snap',sn);return Promise.resolve()}
};
/* RANK é o armazenamento em uso: Firestore se a configuração FB estiver preenchida, senão o local. */
var RANK=FB_ON?RANK_FB:RANK_LOCAL;

/* --- Login --- */
var nameIn=$('name-in'),nameMsg=$('name-msg'),nameBtn=$('name-ok'),nameStep=0;   /* nameStep: 0 = 1º toque, 1 = aguardando confirmação */
function nameSay(t,w){nameMsg.textContent=t;nameMsg.hidden=!t;nameMsg.className='name-msg'+(w?' warn2':'')}
function nameReset(){nameStep=0;nameBtn.textContent='Continuar';nameSay('')}
function netErr(){nameSay('Não foi possível conectar ao servidor. Verifique a internet e tente novamente.')}
nameIn.addEventListener('input',function(){$('name-count').textContent=nameIn.value.length;if(nameStep)nameReset()});   /* editar o nome recomeça a confirmação */
nameBtn.onclick=function(){
  var n=nameIn.value.replace(/\s+/g,' ').trim(),k=nkey(n);
  if(n.length<2){nameSay('Informe um nome com pelo menos 2 caracteres.');return}
  if(!/^[\p{L}\p{N} ._-]+$/u.test(n)){nameSay('Utilize apenas letras, números, espaços, ponto, hífen e sublinhado.');return}
  if(nameStep===0){   /* 1º toque: valida e avisa que o nome não poderá ser trocado */
    RANK.has(k).then(function(t){
      if(t){nameSay('Este nome de usuário já está em uso. Escolha outro.');return}
      nameStep=1;nameBtn.textContent='Confirmar nome';
      nameSay('Atenção: após a confirmação, o nome de usuário não poderá ser alterado. Toque novamente para confirmar.',true);
    }).catch(netErr);
  }else{              /* 2º toque: cria o jogador (a criação confere o nome de novo) */
    RANK.create(k,n).then(function(ok){
      if(!ok){nameReset();nameSay('Este nome de usuário já está em uso. Escolha outro.');return}
      user=n;try{localStorage.setItem('apg-user',n)}catch(e){}
      show('home');
    }).catch(netErr);
  }
};

/* --- Hall da Fama --- */
function dt(t){return new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
/* Desenha as 3 seções (Fácil, Normal e Difícil). O 1º recebe a classe gold, o 2º silver, o 3º bronze e os demais white. */
function drawHall(sn){
  $('hall-info').textContent='Ranking atualizado a cada 24 horas. Última atualização: '+dt(sn.t)+'. Próxima: '+dt(sn.t+DAY)+'.';
  var box=$('hall');box.textContent='';
  DIFFS.forEach(function(d){
    var sec=document.createElement('div');sec.className='hall-sec';
    var h=document.createElement('h3');h.textContent='Top 10 · '+d[1];sec.appendChild(h);
    var list=sn[d[0]]||[];
    if(!list.length){var e=document.createElement('p');e.className='hall-empty';e.textContent='Nenhum jogador pontuou nesta dificuldade até o momento.';sec.appendChild(e)}
    list.forEach(function(x,i){
      var row=document.createElement('div'),ps=document.createElement('span'),nm=document.createElement('span'),pt=document.createElement('span');
      row.className='hall-row';ps.className='hall-pos';ps.textContent=(i+1)+'º';
      nm.className='hall-name '+(['gold','silver','bronze'][i]||'white');nm.textContent=x.n+(user&&x.n===user?' (você)':'');   /* textContent: o nome nunca vira HTML */
      pt.className='hall-pts';pt.textContent=fmt(x.s);
      row.appendChild(ps);row.appendChild(nm);row.appendChild(pt);sec.appendChild(row);
    });
    box.appendChild(sec);
  });
}
/* Mostra a fotografia guardada. Se ela tiver 24h ou mais, monta uma nova com os 10 melhores de cada dificuldade. */
function renderHall(force){
  $('hall-info').textContent='Carregando...';
  RANK.getSnap().then(function(sn){
    if(sn&&!force&&Date.now()-sn.t<DAY)return sn;   /* ainda vale a fotografia atual */
    return Promise.all(DIFFS.map(function(d){return RANK.top(d[0])})).then(function(l){   /* passou 24h: nova fotografia */
      var nw={t:Date.now(),facil:l[0],normal:l[1],dificil:l[2]};
      return RANK.setSnap(nw).then(function(){return RANK.getSnap()}).then(function(s2){return s2||nw});
    });
  }).then(drawHall).catch(function(){$('hall-info').textContent='Não foi possível carregar o ranking. Verifique a conexão com a internet.'});
}
$('open-hall').onclick=function(){show('hall')};
$('hall-test').hidden=!(RANK_TEST&&!FB_ON);$('hall-test').onclick=function(){renderHall(true)};

/* Registro da pontuação no fim da partida (só envia se for maior que a melhor já enviada nesta dificuldade). */
function rankSend(df,pts){
  var mine=lsGet('apg-mine',{facil:0,normal:0,dificil:0});
  if(!user||pts<=(mine[df]||0))return;
  RANK.score(nkey(user),df,pts).then(function(){mine[df]=pts;lsSet('apg-mine',mine)}).catch(function(){});
}

/* =========================================================
   VOZES DO APARELHO (síntese de fala)
   Cada celular tem vozes diferentes, por isso o som pode variar de um aparelho para outro.
   ========================================================= */
var toonVoice=null,toonMale=false,femVoice=null,maleVoice=null;

/* Procura vozes em português do Brasil: uma base, uma masculina e uma feminina. */
function pickVoice(){
  if(!window.speechSynthesis)return;
  var vs=speechSynthesis.getVoices();
  var pt=vs.filter(function(v){return /^pt/i.test(v.lang)});
    var br=pt.filter(function(v){return /pt[-_]BR/i.test(v.lang)});
    voice=(br.length?br:pt).find(function(v){return /natural|neural|online|google|luciana|francisca|vit[oó]ria/i.test(v.name)})||br[0]||pt[0]||null;
  var male=(br.length?br:pt).find(function(v){return /daniel|felipe|ricardo|ant[oô]nio|donato|jorge|male|masculin/i.test(v.name)});
  toonMale=!!male;toonVoice=male||voice;
  femVoice=(br.length?br:pt).find(function(v){return /luciana|francisca|vit[oó]ria|female|feminin/i.test(v.name)})||null;maleVoice=male||null;
}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}   /* a lista de vozes pode carregar depois */

var hardMode=false;   /* true quando a dificuldade é Difícil */

/* Fontes aleatórias usadas no texto do Difícil (quando o jogador está com a fonte Padrão). */
var FONTS=["'Pacifico',cursive","'Special Elite','Courier New',monospace","'Rye',serif","'Creepster',cursive","'Bungee',sans-serif","'Press Start 2P',monospace","'Permanent Marker',cursive","'Lobster',cursive","'Caveat',cursive","'Orbitron',sans-serif","'Fredericka the Great',serif","'Chewy',cursive","'Bowlby One','Arial Black',sans-serif","'Times New Roman',serif"];

/* Limpa o texto do comando. */
function clearCmd(){cmdEl.classList.remove('rnd');cmdEl.textContent=''}

/* CHIADO (ruído de fundo do Difícil): só toca enquanto a voz fala.
   hissStart liga um ruído branco filtrado; hissStop desliga com um fade curto. */
var hiss=null,hissBuf=null;
function hissStop(owner){
  if(!hiss||(owner&&hiss.owner!==owner))return;
  var h=hiss;hiss=null;clearTimeout(h.to);
  try{var t=ctx.currentTime;h.g.gain.cancelScheduledValues(t);h.g.gain.setValueAtTime(h.g.gain.value,t);h.g.gain.linearRampToValueAtTime(0,t+.04);h.src.stop(t+.06)}catch(e){}
}
function hissStart(owner,level){
  if(!ctx)return;
  hissStop();
  if(!hissBuf){   /* cria uma vez 2 segundos de ruído aleatório e reaproveita */
    var n=ctx.sampleRate*2,d;hissBuf=ctx.createBuffer(1,n,ctx.sampleRate);d=hissBuf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=Math.random()*2-1;
  }
  var src=ctx.createBufferSource();src.buffer=hissBuf;src.loop=true;
  var hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;     /* corta os graves */
  var lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=7000;     /* corta os agudos extremos */
  var g=ctx.createGain(),t=ctx.currentTime;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.03);
  src.connect(hp);hp.connect(lp);lp.connect(g);g.connect(ctx.destination);src.start(t);
  /* trava de segurança: se a fala não avisar que terminou, o chiado desliga sozinho após 4s */
  hiss={src:src,g:g,owner:owner,to:setTimeout(function(){hissStop(owner)},4000)};
}

/* TEXTO DO DIFÍCIL: cada letra vira um <span> com opacidade baixa, rotação, desfoque e TAMANHO aleatórios.
   Tamanho: cada letra recebe um valor entre 0,55 e 1,7 vezes o tamanho normal, e o sorteio garante que
   duas letras seguidas tenham tamanhos bem diferentes (diferença mínima de 0,3).
   Fonte: com a fonte Padrão, cada letra usa uma fonte sorteada; com fonte da Loja, todas usam a escolhida.
   Depois sorteia uma posição na tela que não colida com o brinquedo nem com o placar. */
function hardText(t){
  clearCmd();
  var prev=1;   /* tamanho da letra anterior */
  t.split('').forEach(function(ch){
    var z;do{z=.55+Math.random()*1.15}while(Math.abs(z-prev)<.3);prev=z;   /* sorteia até ficar bem diferente da letra vizinha */
    var sp=document.createElement('span');
    sp.textContent=ch===' '?'\u00a0':ch;
    sp.style.cssText='display:inline-block;font-family:'+(sel.font==='padrao'?FONTS[Math.floor(Math.random()*FONTS.length)]:pick('font').v)+';opacity:'+(.22+Math.random()*.28).toFixed(2)+';transform:rotate('+Math.round(Math.random()*24-12)+'deg);font-size:'+z.toFixed(2)+'em;filter:blur(.6px)';
    cmdEl.appendChild(sp);
  });
  cmdEl.classList.add('rnd');
  cmdEl.style.left='0px';cmdEl.style.top='0px';
  var w=cmdEl.offsetWidth,h=cmdEl.offsetHeight,m=10,g=18;   /* tamanho do texto, margem da tela (m) e folga (g) */
  var tr=toy.getBoundingClientRect(),r1=scEl.getBoundingClientRect(),r2=scEl.nextElementSibling.getBoundingClientRect();
  /* áreas proibidas: o brinquedo (com espaço extra para a alça) e o placar */
  var boxes=[{l:tr.left-g,r:tr.right+g,t:tr.top-tr.height*.22-g,b:tr.bottom+g},{l:Math.min(r1.left,r2.left)-g,r:Math.max(r1.right,r2.right)+g,t:r1.top-g,b:r2.bottom+g}];
  var x,y,ok=false;
  for(var i=0;i<60&&!ok;i++){   /* tenta até 60 posições aleatórias */
    x=m+Math.random()*Math.max(0,innerWidth-w-2*m);
    y=m+Math.random()*Math.max(0,innerHeight-h-2*m);
    ok=boxes.every(function(k){return x+w<=k.l||x>=k.r||y+h<=k.t||y>=k.b});
  }
  if(!ok){x=Math.max(m,(innerWidth-w)/2);y=Math.max(m,innerHeight-h-m)}   /* se não achou, usa o centro embaixo */
  cmdEl.style.left=Math.round(x)+'px';cmdEl.style.top=Math.round(y)+'px';
}

/* Versão "esticada" das palavras para a voz Desenho. */
var TOON={'Aperta!':'Apeeeerta!','Puxa!':'Puuuuxa!','Gira!':'Giiiira!'};

/* Efeito sonoro "boing" (oscilador com vibrato), tocado antes dos comandos da voz Desenho. */
function boing(){
  if(!ctx)return;
  var o=ctx.createOscillator(),v=ctx.createOscillator(),vg=ctx.createGain(),g=ctx.createGain(),t=ctx.currentTime;
  o.type='sine';o.frequency.setValueAtTime(200,t);o.frequency.exponentialRampToValueAtTime(1000,t+.2);
  v.frequency.value=28;vg.gain.value=40;v.connect(vg);vg.connect(o.frequency);
  g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.26);
  o.connect(g);g.connect(ctx.destination);o.start(t);v.start(t);o.stop(t+.28);v.stop(t+.28);
}

/* Escolhe qual voz do aparelho usar para um estilo da Loja. */
function styleVoice(st){return st.k==='fem'?(femVoice||voice):st.k==='male'?(maleVoice||voice):st.id==='desenho'?toonVoice:voice}

/* FALA um texto com o estilo de voz equipado (ou o indicado em sid, usado no botão "Ouvir").
   Em qualquer voz, na dificuldade Difícil (hard=true) o tom é mais grosso e há chiado de fundo. */
function say(text,rate,hard,sid){
  if(!window.speechSynthesis)return;
  try{
    speechSynthesis.cancel();   /* interrompe qualquer fala anterior */
    var st=sid?SHOP.voice.items.find(function(x){return x.id===sid}):pick('voice');
    var cartoon=!hard&&st.id==='desenho'&&TOON[text];
    var u=new SpeechSynthesisUtterance(cartoon||text);
    u.lang='pt-BR';u.volume=1;
    var vv=styleVoice(st);if(vv)u.voice=vv;
    if(hard){
      u.pitch=Math.max(.35,Math.min(.62,st.pitch*.45+Math.random()*.06));   /* tom grave */
      u.rate=Math.min(1.7,rate*(.95+Math.random()*.1)*(st.rate||1));
      u.onstart=function(){hissStart(u,.07)};          /* liga o chiado quando a fala começa */
      u.onend=u.onerror=function(){hissStop(u)};       /* desliga quando termina ou dá erro */
    }else{
      u.pitch=st.id==='desenho'?(toonMale?1.8+Math.random()*.2:1+Math.random()*.15):st.pitch;
      u.rate=Math.min(2,rate*(st.id==='desenho'?1.08+Math.random()*.12:st.rate));
      if(cartoon)boing();
    }
    speechSynthesis.speak(u);
  }catch(e){}
}

/* =========================================================
   MÚSICA DE FUNDO
   ========================================================= */

/* Remove o brilho de todas as peças. */
function clearGlow(){Object.keys(TARGET).forEach(function(k){TARGET[k].classList.remove('glow')})}

/* bgm = elemento <audio>; interacted = o jogador já tocou na página?; cur = tela atual.
   Navegadores só liberam som depois de uma interação do usuário. */
var bgm=$('bgm'),interacted=false,cur='home';

/* Volume escolhido pelo jogador (0 a 1). No jogo por áudio, a música cai para 20% desse valor
   (10% no padrão) para não atrapalhar a voz. Para mudar isso, altere GAME_FACTOR. */
var GAME_FACTOR=0.2,userVol=0.5;
try{var sv=localStorage.getItem('apg-vol');if(sv!==null&&!isNaN(+sv))userVol=Math.max(0,Math.min(1,+sv))}catch(e){}
function musicVol(){return userVol*((cur==='game'&&mode==='audio')?GAME_FACTOR:1)}

/* iPhone e iPad ignoram o volume do <audio>. Neles o volume passa por um "controle de ganho" do Web Audio. */
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

/* Aplica o volume calculado (pelo ganho no iPhone; pelo volume normal nos demais). */
function applyVol(){
  var v=musicVol();
  if(mgain){mgain.gain.value=v;bgm.volume=1}else{bgm.volume=v}
}

/* Toca a música (só depois da primeira interação). */
function musicPlay(){
  if(!interacted)return;
  try{
    musicSetup();
    if(mctx&&mctx.state==='suspended')mctx.resume();
    applyVol();
    var p=bgm.play();if(p&&p.catch)p.catch(function(){});   /* ignora a recusa do navegador */
  }catch(e){}
}

/* Destrava e mantém a música: tenta a cada toque/tecla até começar (o iPhone só libera em touchend/click).
   O "true" no final faz o ouvinte rodar na fase de captura, antes dos demais. */
function musicKick(){
  interacted=true;
  if(bgm.paused||(mctx&&mctx.state!=='running'))musicPlay();
}
['pointerdown','pointerup','touchend','click','keydown'].forEach(function(ev){document.addEventListener(ev,musicKick,true)});
/* Se o jogador volta para a página (ex.: depois de bloquear a tela), retoma a música. */
document.addEventListener('visibilitychange',function(){if(!document.hidden&&interacted)musicKick()});

/* Controle deslizante de volume nas Configurações: atualiza, salva e aplica na hora. */
var volEl=$('vol'),volTxt=$('vol-v');
volEl.value=Math.round(userVol*100);volTxt.textContent=volEl.value+'%';
volEl.addEventListener('input',function(){
  userVol=volEl.value/100;volTxt.textContent=volEl.value+'%';
  try{localStorage.setItem('apg-vol',userVol)}catch(e){}
  applyVol();
});

/* =========================================================
   FLUXO DA PARTIDA
   ========================================================= */

/* Prepara e abre uma partida. Depois mostra "Clique no botão vermelho" e espera o jogador começar.
   curDiff guarda a dificuldade para registrar a pontuação no ranking.
   (pStart é declarada mais abaixo; var permite usá-la aqui.) */
function start(diff){
  d=DIFF[diff];curDiff=diff;
  pStart=null;pull.style.transition='';pull.style.transform='';   /* garante a alça no lugar */
  if(!ctx){try{ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  if(ctx&&ctx.state==='suspended')ctx.resume();
  /* "destrava" a fala do navegador com uma fala silenciosa */
  if(window.speechSynthesis){try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}catch(e){}}
  clearTimeout(timer);score=0;step=0;current=null;
  hardMode=diff==='dificil';
  toy.classList.toggle('hard',hardMode);   /* mostra ou esconde as peças extras */
  scEl.textContent='0';clearCmd();clearGlow();
  state='ready';
  show('game');
  var msg='Clique no botão vermelho para começar!';
  btn.classList.add('glow');
  if(mode==='audio')say(msg,1);else{cmdEl.classList.add('small');cmdEl.textContent=msg}
}

/* Começa de verdade (após o clique no botão vermelho): toca a vinheta e agenda o 1º comando. */
function begin(){
  clearGlow();cmdEl.classList.remove('small');clearCmd();
  if(window.speechSynthesis)speechSynthesis.cancel();
  state='gap';
  tone(440,.1,'square',0);tone(660,.1,'square',.1);tone(880,.16,'square',.2);
  timer=setTimeout(next,1000);
}

/* Sorteia e anuncia o próximo comando (evita repetir o anterior na maior parte das vezes).
   Se o tempo acabar antes da ação, chama fail(). O tempo diminui a cada acerto (Math.pow). */
function next(){
  var c;
  do{c=d.keys[Math.floor(Math.random()*d.keys.length)]}while(c===current&&Math.random()<.6);
  current=c;state='listening';
  if(mode==='audio')say(CMD[c],Math.min(d.rm,1+step*d.rs),hardMode);else if(hardMode)hardText(CMD[c]);else cmdEl.textContent=CMD[c];
  if(d.glow)TARGET[c].classList.add('glow');
  timer=setTimeout(fail,Math.max(d.wm,d.w*Math.pow(d.wd,step)));
}

/* Chamada sempre que o jogador faz uma ação (aperta, puxa, gira, desliza ou vira). */
function act(a){
  if(state==='ready'){if(a==='aperta')begin();return}   /* antes de começar, só o botão vermelho vale */
  if(state!=='listening')return;                        /* ignora ações fora do momento certo */
  clearTimeout(timer);clearGlow();clearCmd();
  if(a!==current){fail();return}                        /* ação errada = fim de jogo */
  score+=d.pts;step++;state='gap';                      /* acerto: soma pontos e acelera */
  scEl.textContent=score;sOk();
  toy.classList.add('ok');setTimeout(function(){toy.classList.remove('ok')},120);
  timer=setTimeout(next,Math.max(d.gm,d.g*Math.pow(d.gd,step)));
}

/* Fim de jogo: toca o som de erro, treme o brinquedo, guarda a melhor pontuação,
   soma os pontos ao saldo da Loja, envia a pontuação ao ranking e volta ao menu. */
function fail(){
  if(state==='idle')return;
  clearTimeout(timer);clearGlow();state='idle';
  if(window.speechSynthesis)speechSynthesis.cancel();
  sFail();
  toy.classList.remove('shake');void toy.offsetWidth;toy.classList.add('shake');   /* o "void offsetWidth" reinicia a animação */
  setTimeout(function(){
    if(score>best){best=score;saveBest()}
    coins+=score;saveShop();
    rankSend(curDiff,score);
    var l=$('last');l.hidden=false;l.textContent='Fim de jogo: '+score+' pontos'+(score?' (+'+fmt(score)+' na Loja)':'');
    show('home');
  },900);
}

/* =========================================================
   CONTROLES DO BRINQUEDO
   Usam "pointer events" (funcionam com dedo, mouse e caneta).
   ========================================================= */

/* APERTA: botão vermelho. A classe "down" faz o botão afundar. */
btn.addEventListener('pointerdown',function(e){e.preventDefault();btn.classList.add('down');act('aperta')});
['pointerup','pointerleave','pointercancel'].forEach(function(ev){btn.addEventListener(ev,function(){btn.classList.remove('down')})});
btn.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();btn.classList.add('down');act('aperta')}});
btn.addEventListener('keyup',function(){btn.classList.remove('down')});

/* PUXA: arrastar a alça para cima. pStart guarda onde o dedo começou; ao subir 45px, conta como puxada. */
var pStart=null,pDone=false;
/* translate3d move a alça para cima, até 70px. */
function pMove(dy){pull.style.transform='translate3d(0,'+(-Math.max(0,Math.min(dy,70)))+'px,0)'}
/* Força o navegador a redesenhar o elemento (esconde e mostra) para eliminar resíduos visuais. */
function repaint(el){el.style.display='none';void el.offsetHeight;el.style.display=''}
/* Devolve a alça ao lugar com animação suave e, no fim, limpa e redesenha. */
function pReset(){pull.style.transition='transform .18s';pull.style.transform='translate3d(0,0,0)';setTimeout(function(){pull.style.transition='';pull.style.transform='';repaint(pull)},230)}
hit.addEventListener('pointerdown',function(e){e.preventDefault();hit.setPointerCapture(e.pointerId);pStart=e.clientY;pDone=false});   /* setPointerCapture: continua recebendo o movimento mesmo se o dedo sair da área */
hit.addEventListener('pointermove',function(e){
  if(pStart===null)return;
  var dy=pStart-e.clientY;pMove(dy);
  if(!pDone&&dy>=45){pDone=true;act('puxa')}
});
/* Ao soltar (ou perder o toque), devolve a alça. O teste evita executar duas vezes. */
function pEnd(){if(pStart===null)return;pStart=null;pReset()}
hit.addEventListener('pointerup',pEnd);hit.addEventListener('pointercancel',pEnd);hit.addEventListener('lostpointercapture',pEnd);
hit.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pMove(60);act('puxa');setTimeout(pReset,150)}});

/* GIRA: gira o disco. Calcula o ângulo do dedo em relação ao centro do disco (Math.atan2) e
   soma a variação. Com 70 graus acumulados, conta como giro. */
var dAng=null,dAcc=0,dRot=0,dDone=false;
function angle(e){var r=dial.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI}
dial.addEventListener('pointerdown',function(e){e.preventDefault();dial.setPointerCapture(e.pointerId);dAng=angle(e);dAcc=0;dDone=false});
dial.addEventListener('pointermove',function(e){
  if(dAng===null)return;
  var a=angle(e),df=a-dAng;
  if(df>180)df-=360;if(df<-180)df+=360;   /* corrige a virada de 180 para -180 graus */
  dAng=a;dAcc+=df;dRot+=df;
  dial.style.transform='rotate('+dRot+'deg)';
  if(!dDone&&Math.abs(dAcc)>=70){dDone=true;act('gira')}
});
function dEnd(){dAng=null}
dial.addEventListener('pointerup',dEnd);dial.addEventListener('pointercancel',dEnd);
dial.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();dRot+=90;dial.style.transform='rotate('+dRot+'deg)';act('gira')}});

/* DESLIZA (Difícil): arrasta a bolinha pela barra. sMax é o percurso máximo; com 60% dele, conta. */
var sX=null,sMax=0,sDone=false;
sl.addEventListener('pointerdown',function(e){e.preventDefault();sl.setPointerCapture(e.pointerId);sX=e.clientX;sDone=false;sMax=sl.clientWidth-kn.offsetWidth});
sl.addEventListener('pointermove',function(e){
  if(sX===null)return;
  var dx=Math.max(0,Math.min(e.clientX-sX,sMax));
  kn.style.transform='translateX('+dx+'px)';
  if(!sDone&&dx>=sMax*.6){sDone=true;act('desliza')}
});
/* Ao soltar, a bolinha volta ao início com animação. */
function sEnd(){sX=null;kn.style.transition='transform .2s';kn.style.transform='';setTimeout(function(){kn.style.transition=''},220)}
sl.addEventListener('pointerup',sEnd);sl.addEventListener('pointercancel',sEnd);
sl.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();act('desliza')}});

/* VIRA (Difícil): um toque alterna a chave (classe "on") e registra a ação. */
function flip(){sw.classList.toggle('on');act('vira')}
sw.addEventListener('pointerdown',function(e){e.preventDefault();flip()});
sw.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();flip()}});

/* PRIMEIRO ACESSO: se o jogador ainda não tem nome de usuário, mostra a tela de login antes do menu. */
if(!user)show('login');

})();   /* fim da função que envolve todo o código */