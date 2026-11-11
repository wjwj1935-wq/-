/* 청소용품 상세페이지 제작기 — 움직이는 부분
   사진 한 장 → ① AI가 제품을 보고 글을 써요 ② 원본 사진을 같이 보내 장면 사진을 만들어요 ③ 글자는 프로그램이 얹어 조립해요.
   전략(구역 순서·글 규칙·장면 지시문)은 strategy.js 에 있어요. 여기는 그 전략을 실행만 해요.
   v1 (2026-11-11): 처음 만듦 */
'use strict';
const VER=1,PW=860,LS='wj-clean-v1',GKEY='wj-gk',GBASE='https://generativelanguage.googleapis.com/v1beta';
const ST=window.STRATEGY;
const $=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=()=>'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const getAt=(o,p)=>p.split('.').reduce((a,k)=>a==null?a:a[k],o);
const setAt=(o,p,v)=>{const ks=p.split('.'),l=ks.pop();const t=ks.reduce((a,k)=>a==null?a:a[k],o);if(t!=null)t[l]=v;};

/* ============ 상태 ============ */
const SLOTS=ST.scenes.flatMap(sc=>sc.sheet?Array.from({length:sc.sheet},(_,i)=>({key:sc.key+i,scene:sc.key,label:sc.label.replace(/\s*\(.*\)$/,'')+' '+(i+1)})):[{key:sc.key,scene:sc.key,label:sc.label}]);
const emptyCopy=()=>({kind:'',
  hero:{eyebrow:'',title:'',sub:''},pain:{title:'',items:['','','']},
  solve:{eyebrow:'',title:'',rows:[{pain:'',fix:''},{pain:'',fix:''}]},
  material:{eyebrow:'',title:'',body:''},craft:{eyebrow:'',title:'',body:'',badges:['','','']},
  perform:{eyebrow:'',title:'',body:''},easy:{eyebrow:'',title:'',body:''},check:{title:''},
  places:{eyebrow:'',title:'',body:'',labels:['','','','']},set:{eyebrow:'',title:'',items:[{name:'',desc:''},{name:'',desc:''}]},
  caution:{eyebrow:'',title:'',items:['','']},faq:{title:'자주 묻는 질문',items:[{q:'',a:''},{q:'',a:''}]},foot:{seller:''}});
const blank=()=>({v:1,name:'',facts:Object.fromEntries(ST.facts.map(f=>[f.key,''])),photos:[],copy:emptyCopy(),hints:null,made:false,demo:false,accent:'',accentAuto:true,aiMark:true,img:{}});
let S=blank(),EX=false;
const IMG=new Map();          // 사진 id → {blob,url}
const RUN={};                 // 장면 key → {st:'run'|'err',msg}
const G={key:'',remember:false,img:'gemini-3.1-flash-image',txt:'gemini-2.5-flash',state:'idle',busy:false,ctl:null,made:0,spent:0};

/* 사진은 용량이 커서 브라우저 저장소(IndexedDB)에 따로 둬요. 못 쓰는 환경이면 화면을 닫을 때까지만 기억해요. */
const DB=(()=>{let p;
  const open=()=>p||(p=new Promise((ok,no)=>{const r=indexedDB.open('wj-clean',1);r.onupgradeneeded=()=>r.result.createObjectStore('img');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);}));
  const tx=(mode,f)=>open().then(db=>new Promise((ok,no)=>{const t=db.transaction('img',mode),q=f(t.objectStore('img'));t.oncomplete=()=>ok(q&&q.result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);}));
  const safe=f=>(...a)=>f(...a).catch(()=>undefined);
  return {put:safe((k,b)=>tx('readwrite',s=>s.put(b,k))),get:safe(k=>tx('readonly',s=>s.get(k))),del:safe(k=>tx('readwrite',s=>s.delete(k))),clear:safe(()=>tx('readwrite',s=>s.clear()))};
})();
function keepImg(blob){const id=uid();IMG.set(id,{blob,url:URL.createObjectURL(blob)});DB.put(id,blob);return id;}
function dropImg(id){const it=IMG.get(id);if(it){URL.revokeObjectURL(it.url);IMG.delete(id);}DB.del(id);}
let saveT=0;
const persist=()=>{clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(LS,JSON.stringify(S));}catch(e){}},300);};
async function restore(){
  let o=null;try{o=JSON.parse(localStorage.getItem(LS)||'null');}catch(e){}
  if(!o||o.v!==1)return;
  const b=blank();S=Object.assign(b,o);S.facts=Object.assign(b.facts,o.facts||{});S.copy=norm(o.copy||{});S.img=o.img||{};S.photos=Array.isArray(o.photos)?o.photos:[];
  const ids=new Set(S.photos.concat(Object.values(S.img).map(m=>m&&m.id)));
  await Promise.all(Array.from(ids).filter(Boolean).map(async id=>{const blob=await DB.get(id);if(blob)IMG.set(id,{blob,url:URL.createObjectURL(blob)});}));
  S.photos=S.photos.filter(id=>IMG.has(id));
  for(const k of Object.keys(S.img))if(!S.img[k]||!IMG.has(S.img[k].id))delete S.img[k];
}

/* ============ 작은 도구 ============ */
let toastT=0;
function toast(t,ms){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true;},ms||3600);}
function msg(id,t,cls){const el=$(id);if(!el)return;el.textContent=t||'';el.className='msg'+(cls?' '+cls:'');}
const loadImg=blob=>new Promise((ok,no)=>{const u=URL.createObjectURL(blob),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);ok(im);};im.onerror=()=>{URL.revokeObjectURL(u);no(new Error('사진을 읽지 못했어요'));};im.src=u;});
const toBlob=(cv,type,q)=>new Promise(ok=>cv.toBlob(ok,type||'image/jpeg',q||0.9));
async function fitJpeg(blob,max,q){                       // 긴 변을 max 로 줄인 JPEG
  const im=await loadImg(blob),k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
  const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.naturalWidth*k));cv.height=Math.max(1,Math.round(im.naturalHeight*k));
  const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(im,0,0,cv.width,cv.height);
  return toBlob(cv,'image/jpeg',q||0.9);
}
const b64=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=()=>no(r.error);r.readAsDataURL(blob);});

/* ============ 색: 제품 사진에서 가장 눈에 띄는 색을 뽑아 강조 색으로 써요 ============ */
const hex2=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
const toHex=(r,g,b)=>'#'+hex2(r)+hex2(g)+hex2(b);
const fromHex=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'');const n=m?parseInt(m[1],16):0x2f4b7c;return [n>>16&255,n>>8&255,n&255];};
const mix=(a,b,t)=>{const x=fromHex(a),y=fromHex(b);return toHex(x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t);};
function hsl2hex(h,s,l){const f=n=>{const k=(n+h/30)%12,a=s*Math.min(l,1-l);return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));};return toHex(f(0),f(8),f(4));}
async function pickAccent(blob){
  try{
    const im=await loadImg(blob),cv=document.createElement('canvas');cv.width=cv.height=48;
    const x=cv.getContext('2d');x.drawImage(im,0,0,48,48);const d=x.getImageData(0,0,48,48).data;
    const bins=new Array(24).fill(0),hs=new Array(24).fill(0),ss=new Array(24).fill(0);let total=0;
    for(let i=0;i<d.length;i+=4){
      const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,c=mx-mn;
      if(c<0.18||l<0.12||l>0.92)continue;                 // 회색·흰색·검정은 빼요
      let h=mx===r?((g-b)/c)%6:mx===g?(b-r)/c+2:(r-g)/c+4;h=(h*60+360)%360;
      const s=c/(1-Math.abs(2*l-1)),w=c*c,bi=Math.floor(h/15)%24;
      if(h>18&&h<52&&s<0.55)continue;                     // 마룻바닥·나무·살색 같은 흐린 갈색은 배경일 때가 많아 빼요
      bins[bi]+=w;hs[bi]+=h*w;ss[bi]+=s*w;total+=w;
    }
    let bi=0;for(let i=1;i<24;i++)if(bins[i]>bins[bi])bi=i;
    if(total<1.2||bins[bi]<0.6)return '';
    return hsl2hex(hs[bi]/bins[bi],Math.max(0.5,Math.min(0.78,ss[bi]/bins[bi])),0.42);
  }catch(e){return '';}
}
function palette(){
  const ac=/^#[0-9a-f]{6}$/i.test(S.accent)?S.accent:'#2f4b7c';
  return '--ac:'+ac+';--ac-soft:'+mix(ac,'#ffffff',0.9)+';--ac-mid:'+mix(ac,'#ffffff',0.72)+';--ac-light:'+mix(ac,'#ffffff',0.55)+';--dark:'+mix(ac,'#1b1a1c',0.9);
}

/* ============ 상세페이지 그리기 ============ */
const fmtTitle=v=>{const ls=String(v).split('\n');return ls.length<2?esc(v):ls.slice(0,-1).map(esc).join('\n')+'\n<em>'+esc(ls[ls.length-1])+'</em>';};
function E(tag,cls,path,ph){                               // 눌러서 고치는 글자 한 칸
  const v=String(getAt(S,path)||'');
  if(EX&&!v.trim())return '';
  const isT=/\bttl\b/.test(cls);
  return '<'+tag+' class="'+cls+(v.trim()?'':' need')+'" data-p="'+path+'" data-ph="'+esc(ph||'글')+'"'+(isT?' data-t="1"':'')+(EX?'':' contenteditable="plaintext-only" spellcheck="false"')+'>'+(isT?fmtTitle(v):esc(v))+'</'+tag+'>';
}
const hasText=path=>String(getAt(S,path)||'').trim()!=='';
const slotOf=key=>SLOTS.find(s=>s.key===key);
function showable(key){const m=S.img[key];return m&&IMG.has(m.id)&&!(EX&&m.src==='demo')?m:null;}
function pic(key,cls){
  const m=showable(key),sl=slotOf(key);
  if(!m)return EX?'':'<div class="ph '+(cls||'')+'" data-img="'+key+'" role="button" tabindex="0"><b>'+esc(sl.label)+'</b><span>아직 사진이 없어요 · 눌러서 내 사진 넣기</span></div>';
  const cap=m.src==='demo'?'예시 자리':(m.src==='ai'&&S.aiMark?'연출 이미지':'');
  return '<figure class="pic '+(cls||'')+'" data-img="'+key+'"><img src="'+IMG.get(m.id).url+'" alt="'+esc(sl.label)+'">'+(cap?'<figcaption>'+cap+'</figcaption>':'')+'</figure>';
}
const head=(k,ph)=>E('div','eyebrow','copy.'+k+'.eyebrow','짧은 한마디')+E('h2','ttl','copy.'+k+'.title',ph||'제목 (두 줄)');
const SEC={
  hero:()=>E('div','eyebrow','copy.hero.eyebrow','짧은 한마디')+E('h1','ttl','copy.hero.title','제목 (두 줄)')+E('p','body','copy.hero.sub','한 줄 설명')+pic('hero','bleed fade'),
  pain:()=>{const main=S.photos[0]&&IMG.get(S.photos[0]);
    const bubs=S.copy.pain.items.map((_,i)=>E('div','bub b'+i,'copy.pain.items.'+i,'불편했던 점')).join('');
    if(EX&&!main&&!bubs)return '';
    return E('h2','ttl','copy.pain.title','제목 (두 줄)')+'<div class="painbox">'+(main?'<figure class="pic"><img src="'+main.url+'" alt="실제 제품 사진"><figcaption>실제 제품 사진</figcaption></figure>':(EX?'':'<div class="ph" style="margin:0 auto;width:500px" data-pick="1" role="button" tabindex="0"><b>실제 제품 사진</b><span>왼쪽 1번에서 사진을 넣어 주세요</span></div>'))+bubs+'</div>';},
  solve:()=>{const rows=S.copy.solve.rows.map((r,i)=>{if(EX&&!String(r.pain).trim()&&!String(r.fix).trim())return '';const b='copy.solve.rows.'+i+'.';
      return '<div class="prow"><div class="bad"><small>불편</small>'+E('div','','' +b+'pain','불편했던 점')+'</div><div class="arr">→</div><div class="good"><small>해결</small>'+E('div','',b+'fix','이렇게 해결했어요')+'</div></div>';}).join('');
    return head('solve')+(rows?'<div class="rows">'+rows+'</div>':'')+pic('use1');},
  material:()=>head('material')+E('p','body','copy.material.body','설명')+pic('detail'),
  craft:()=>{const bs=S.copy.craft.badges.map((_,i)=>E('div','badge','copy.craft.badges.'+i,'짧은 말')).join('');
    return head('craft')+E('p','body','copy.craft.body','설명')+pic('craft')+(bs?'<div class="badges">'+bs+'</div>':'');},
  perform:()=>head('perform')+E('p','body','copy.perform.body','설명')+pic('floor'),
  easy:()=>head('easy')+E('p','body','copy.easy.body','설명')+pic('use2'),
  check:()=>{const fs=ST.facts.filter(f=>!f.hidden),rows=fs.map(f=>(EX&&!hasText('facts.'+f.key))?'':'<div class="tr"><div class="th2">'+esc(f.label)+'</div>'+E('div','td','facts.'+f.key,'확인된 사실만 적어요 ('+f.ph+')')+'</div>').join('');
    if(EX&&fs.filter(f=>hasText('facts.'+f.key)).length<2)return '';   // 사실이 두 가지도 안 되면 표를 빼요
    return E('h2','ttl','copy.check.title','제목 (두 줄)')+'<div class="tbl">'+rows+'</div>';},
  places:()=>{const cells=[0,1,2,3].map(i=>{const p=pic('places'+i);return p?'<div class="cell">'+E('div','lab','copy.places.labels.'+i,'곳')+p+'</div>':'';}).join('');
    if(EX&&!cells)return '';
    return head('places')+E('p','body','copy.places.body','설명')+'<div class="grid4">'+cells+'</div>';},
  set:()=>{const its=S.copy.set.items.map((it,i)=>{if(EX&&!String(it.name).trim())return '';const b='copy.set.items.'+i+'.';return '<div class="item">'+E('b','',b+'name','구성품 이름')+E('span','',b+'desc','한 줄 설명')+'</div>';}).join('');
    return head('set')+pic('set')+(its?'<div class="items">'+its+'</div>':'');},
  caution:()=>{const its=S.copy.caution.items.map((_,i)=>{const e=E('div','','copy.caution.items.'+i,'미리 알아야 할 점');return e?'<div class="ck"><i>✓</i>'+e+'</div>':'';}).join('');
    if(EX&&!its)return '';
    return '<div class="ccard">'+head('caution')+its+'</div>';},
  faq:()=>{const its=S.copy.faq.items.map((q,i)=>{if(EX&&(!String(q.q).trim()||!String(q.a).trim()))return '';const b='copy.faq.items.'+i+'.';
      return '<div class="qa"><div class="q"><i>Q</i>'+E('div','',b+'q','질문')+'</div>'+E('div','a',b+'a','답')+'</div>';}).join('');
    if(EX&&!its)return '';
    return E('h2','ttl','copy.faq.title','자주 묻는 질문')+its;},
  foot:()=>{const anyAi=SLOTS.some(sl=>{const m=showable(sl.key);return m&&m.src==='ai';});
    return (anyAi&&S.aiMark?'<p>\'연출 이미지\'로 표시한 사진은 이해를 돕기 위해 AI로 만든 장면이에요. 실제 제품은 \'실제 제품 사진\'으로 확인해 주세요.</p>':'')
      +'<p>화면에 따라 색이 실제와 조금 다르게 보일 수 있어요.</p>'+E('div','','copy.foot.seller','판매자·제조사 이름 (선택)');}
};
function renderPage(){
  return ST.sections.map((sc,i)=>{const inner=SEC[sc.key]?SEC[sc.key]():'';
    return inner?'<section class="sec s-'+sc.key+'" data-slice="'+String(i+1).padStart(2,'0')+'_'+sc.key+'">'+inner+'</section>':'';}).join('');
}
function drawPage(){const pg=$('#pg');pg.className='pg edit';pg.setAttribute('style',palette());pg.innerHTML=renderPage();fitStage();}
function fitStage(){const st=$('#stage'),pg=$('#pg');if(!st||!pg)return;const k=Math.min(1,(st.clientWidth-32)/PW);pg.style.zoom=k>0?k:1;}

/* ============ 왼쪽 작업 칸 그리기 ============ */
function drawPhotos(){
  $('#thumbs').innerHTML=S.photos.map((id,i)=>'<div class="th"><img src="'+IMG.get(id).url+'" alt="제품 사진 '+(i+1)+'">'+(i===0?'<em>대표</em>':'')+'<button type="button" data-del="'+esc(id)+'" aria-label="사진 빼기">×</button></div>').join('');
  const main=S.photos[0]&&IMG.get(S.photos[0]);
  $('#origBox').innerHTML=main?'<img src="'+main.url+'" alt="원본 사진"><span><b>원본 사진</b><br>아래 장면들이 이 제품과 같은지 비교해 보세요.</span>':'';
}
function drawFacts(){
  $('#factFields').innerHTML=ST.facts.map(f=>'<label class="fld"><span>'+esc(f.label)+'</span>'+(f.long?'<textarea data-f="'+f.key+'" placeholder="'+esc(f.ph)+'">'+esc(S.facts[f.key])+'</textarea>':'<input type="text" data-f="'+f.key+'" placeholder="'+esc(f.ph)+'" value="'+esc(S.facts[f.key])+'" autocomplete="off">')+'</label>').join('');
}
function drawScenes(){
  $('#scenes').innerHTML=SLOTS.map(sl=>{const m=S.img[sl.key],it=m&&IMG.get(m.id),r=RUN[sl.scene]||{},sheet=slotOf(sl.key).scene!==sl.key;
    const tag=!it?'':m.src==='ai'?'AI':m.src==='own'?'내 사진':'예시';
    const st=r.st==='run'?'만드는 중…':r.st==='err'?r.msg:(it?'':'아직 없어요');
    return '<div class="sc" data-sc="'+sl.key+'"><div class="im">'+(it?'<span class="tag">'+tag+'</span><img src="'+it.url+'" alt="'+esc(sl.label)+'">':esc(sl.label))+'</div><div class="nm">'+esc(sl.label)+'</div><div class="st'+(r.st==='err'?' err':'')+'">'+esc(st||'')+'</div>'
      +'<div class="bt"><button class="btn" type="button" data-regen="'+sl.scene+'"'+(G.busy||r.st==='run'?' disabled':'')+'>'+(sheet?'4칸 다시':(it&&m.src==='ai'?'다시 만들기':'AI로 만들기'))+'</button><button class="btn" type="button" data-own="'+sl.key+'">내 사진</button></div></div>';}).join('');
}
const MPRICE=[[/lite-image/,0.034],[/gemini-3(\.\d+)?-pro-image/,0.134],[/gemini-3(\.\d+)?-flash-image/,0.067],[/gemini-2\.5-flash-image/,0.039]];   // 장당 대략 가격(손잡이 제작기와 같은 표)
const priceOf=m=>{const p=MPRICE.find(x=>x[0].test(m||''));return p?p[1]:0;};
const todoScenes=()=>ST.scenes.filter(sc=>{const ks=SLOTS.filter(sl=>sl.scene===sc.key);return ks.some(sl=>{const m=S.img[sl.key];return !m||!IMG.has(m.id)||m.src==='demo';});});
function drawRun(){
  const n=todoScenes().length,p=priceOf(G.img),first=!S.made||S.demo;
  $('#costLine').innerHTML=(first?'글 쓰기 1번 + ':'남은 ')+'장면 사진 <b>'+n+'장</b>'+(n&&p?' · 예상 약 <b>$'+(p*n).toFixed(2)+'</b> (대략, 구글 요금)':'')+(G.made?'<br>이번에 만든 사진 '+G.made+'장'+(G.spent?' · 약 $'+G.spent.toFixed(2):''):'');
  const b=$('#btnRun');b.textContent=first?'한 번에 만들기':(n?'빈 사진 이어서 만들기 ('+n+'장)':'사진을 다 만들었어요');b.disabled=G.busy||(!first&&!n);
  $('#btnStop').hidden=!G.busy;$('#btnCopy').hidden=first;$('#btnCopy').disabled=G.busy;$('#btnDemo').disabled=G.busy;
}
function drawSide(){drawPhotos();drawScenes();drawRun();$('#fAccent').value=/^#[0-9a-f]{6}$/i.test(S.accent)?S.accent:'#2f4b7c';$('#fAiMark').checked=!!S.aiMark;$('#fName').value=S.name;}
function drawAll(){drawSide();drawFacts();drawPage();}

/* ============ 구글 AI ============ */
const verOf=n=>parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(n)||[])[1])||0;
const bestOf=l=>l.slice().sort((a,b)=>verOf(b)-verOf(a)||(/preview|exp/.test(a)?1:0)-(/preview|exp/.test(b)?1:0)||a.length-b.length)[0]||'';
function pickModels(names){
  const img=names.filter(n=>/image/i.test(n)&&!/imagen|live|tts|audio|embed/i.test(n));
  const std=bestOf(img.filter(n=>/flash-image/.test(n)&&!/lite/.test(n)&&verOf(n)>=3))||bestOf(img.filter(n=>/gemini-2\.5-flash-image/.test(n)))||bestOf(img);
  const txt=names.filter(n=>/^gemini-\d/.test(n)&&!/image|tts|audio|live|embed|lite|nano|robotics|computer|learnlm|gemma/i.test(n));
  return {img:std,txt:bestOf(txt.filter(n=>/flash/.test(n)))||bestOf(txt.filter(n=>/pro/.test(n)))};
}
const gHead=()=>({'x-goog-api-key':G.key.trim(),'Content-Type':'application/json'});
async function gCheck(){
  if(!G.key.trim()){msg('#gMsg','키를 붙여 넣어 주세요.','err');return false;}
  msg('#gMsg','연결을 확인하는 중이에요. 비용이 들지 않아요…');
  try{
    const r=await fetch(GBASE+'/models?pageSize=1000',{headers:{'x-goog-api-key':G.key.trim()}});
    if(r.ok){
      let names=[];try{const d=await r.json();names=(d.models||[]).filter(m=>!m.supportedGenerationMethods||m.supportedGenerationMethods.includes('generateContent')).map(m=>String(m.name||'').replace(/^models\//,''));}catch(e){}
      const pk=pickModels(names);if(pk.img)G.img=pk.img;if(pk.txt)G.txt=pk.txt;G.state='on';
      msg('#gMsg','연결됐어요. 글: '+G.txt+' · 사진: '+G.img+(names.length?'':' (모델 목록은 못 읽어서 기본 이름을 써요)'),'ok');drawRun();return true;
    }
    G.state='off';msg('#gMsg',[400,401,403].includes(r.status)?'키가 맞지 않아요. 다시 복사해서 붙여 넣어 주세요.':'구글에서 오류가 왔어요('+r.status+'). 잠시 뒤 다시 눌러 주세요.','err');return false;
  }catch(e){G.state='off';msg('#gMsg','구글에 연결하지 못했어요. 인터넷 연결과 광고 차단·보안 프로그램을 확인해 주세요.','err');return false;}
}
function gErr(e){
  if(e&&e.name==='AbortError')return '멈췄어요.';
  const st=e&&e.status,m=e&&e.message?' ('+String(e.message).slice(0,120)+')':'';
  if(e&&e.blocked)return '구글이 이 장면을 만들지 않았어요('+e.message+'). 덧붙일 말을 바꾸거나 내 사진을 넣어 주세요.';
  if(st===402||/prepay|credits? (are )?depleted|insufficient (balance|credit|fund)|out of credits?/i.test(String(e&&e.message||'')))return '구글 이용 잔액이 다 떨어졌어요. 구글 AI 스튜디오의 결제에서 충전한 뒤 다시 눌러 주세요. 이미 만든 사진은 그대로 있어요.';
  if(st===400)return '요청이 맞지 않아요. 연결 확인을 다시 눌러 주세요.'+m;
  if(st===401||st===403)return '키가 맞지 않거나 이 모델을 쓸 수 없어요. 결제 설정도 확인해 주세요.'+m;
  if(st===404)return '모델 이름을 찾을 수 없어요. 연결 확인을 다시 눌러 주세요.'+m;
  if(st===429)return '사용 한도에 걸렸어요. 잠시 뒤 다시 눌러 주세요.'+m;
  if(st>=500)return '구글 쪽 오류예요. 잠시 뒤 다시 눌러 주세요.'+m;
  if(e&&e.bad)return e.message;
  return '연결하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'+m;
}
const sleep=(ms,sig)=>new Promise((ok,no)=>{const t=setTimeout(ok,ms);if(sig)sig.addEventListener('abort',()=>{clearTimeout(t);no(Object.assign(new Error('abort'),{name:'AbortError'}));},{once:true});});
async function gPost(model,body,signal){                   // 잠깐 끊기거나 구글이 바쁠 때는 두 번까지 기다렸다 다시 보내요
  for(let a=0;;a++){
    let r;try{r=await fetch(GBASE+'/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',signal,headers:gHead(),body:JSON.stringify(body)});}
    catch(e){if(e&&e.name==='AbortError')throw e;if(a>=2)throw e;await sleep(2000*(a+1),signal);continue;}
    if([429,500,502,503,504].includes(r.status)&&a<2){await sleep(3000*(a+1),signal);continue;}
    if(!r.ok){let t='';try{const d=await r.json();t=d&&d.error&&d.error.message||'';}catch(e){}throw {status:r.status,message:t};}
    return r.json();
  }
}
let REFS={sig:'',val:[]};
async function refs(){                                      // 구글에 같이 보내는 원본 사진(3장까지, 긴 변 1536)
  const ids=S.photos.slice(0,3),sig=ids.join(',');
  if(REFS.sig!==sig)REFS={sig,val:await Promise.all(ids.map(async id=>b64(await fitJpeg(IMG.get(id).blob,1536,0.9))))};
  return REFS.val.map(d=>({inline_data:{mime_type:'image/jpeg',data:d}}));
}
function parseJsonLoose(t){t=String(t||'').replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'');const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a<0||b<=a)throw {bad:true,message:'AI가 글을 형식에 맞지 않게 보냈어요. 다시 눌러 주세요.'};
  try{return JSON.parse(t.slice(a,b+1));}catch(e){throw {bad:true,message:'AI가 글을 형식에 맞지 않게 보냈어요. 다시 눌러 주세요.'};}}
async function gText(prompt,signal){
  const d=await gPost(G.txt,{contents:[{parts:[{text:prompt}].concat(await refs())}],generationConfig:{responseMimeType:'application/json',temperature:0.8}},signal);
  const parts=(d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts)||[];
  return parseJsonLoose(parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join(''));
}
async function gImage(prompt,aspect,signal){
  const d=await gPost(G.img,{contents:[{parts:[{text:prompt}].concat(await refs())}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:aspect},candidateCount:1}},signal);
  const parts=(d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts)||[],part=parts.find(x=>x.inlineData||x.inline_data);
  if(!part)throw {blocked:true,message:(d.promptFeedback&&d.promptFeedback.blockReason)||(d.candidates&&d.candidates[0]&&d.candidates[0].finishReason)||'빈 응답'};
  const id=part.inlineData||part.inline_data,bin=atob(id.data),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
  return new Blob([u8],{type:id.mimeType||id.mime_type||'image/png'});
}

/* ============ 글 쓰기 ============ */
const str=(v,max)=>String(v==null?'':v).replace(/\\n/g,'\n').replace(/\r/g,'').trim().slice(0,max||400);
const arr=(v,n,f)=>{const a=Array.isArray(v)?v.slice(0,n):[];return a.map(f);};
function norm(p){                                            // AI가 보낸 글을 틀에 맞춰 다듬어요(빠진 칸은 빈칸)
  p=p&&typeof p==='object'?p:{};const c=emptyCopy(),o=k=>(p[k]&&typeof p[k]==='object')?p[k]:{};
  c.kind=str(p.kind,40);
  for(const k of ['hero','material','craft','perform','easy','places','set','caution','solve'])if('eyebrow' in c[k])c[k].eyebrow=str(o(k).eyebrow,24);
  for(const k of Object.keys(c))if(c[k]&&typeof c[k]==='object'&&'title' in c[k])c[k].title=str(o(k).title,60)||c[k].title;
  c.hero.sub=str(o('hero').sub,120);
  for(const k of ['material','craft','perform','easy','places'])c[k].body=str(o(k).body,160);
  const fill=(a,n,mk)=>{while(a.length<n)a.push(mk());return a;};
  c.pain.items=fill(arr(o('pain').items,3,x=>str(x,40)),3,()=>'');
  c.solve.rows=fill(arr(o('solve').rows,3,r=>({pain:str(r&&r.pain,40),fix:str(r&&r.fix,60)})),2,()=>({pain:'',fix:''}));
  c.craft.badges=fill(arr(o('craft').badges,3,x=>str(x,16)),3,()=>'');
  c.places.labels=fill(arr(o('places').labels,4,x=>str(x,10)),4,()=>'');
  c.set.items=fill(arr(o('set').items,4,r=>({name:str(r&&r.name,24),desc:str(r&&r.desc,50)})),2,()=>({name:'',desc:''}));
  c.caution.items=fill(arr(o('caution').items,4,x=>str(x,90)),2,()=>'');
  c.faq.items=fill(arr(o('faq').items,4,r=>({q:str(r&&r.q,70),a:str(r&&r.a,200)})),2,()=>({q:'',a:''}));
  c.foot.seller=str(o('foot').seller,80);
  return c;
}
function normHints(h){h=h&&typeof h==='object'?h:{};const d=ST.sceneDefault,en=(v,f)=>{const s=String(v==null?'':v).replace(/[\r\n]+/g,' ').trim().slice(0,160);return s||f;};
  const pl=Array.isArray(h.places)?h.places:[];
  return {subject:en(h.subject,d.subject),action:en(h.action,d.action),part:en(h.part,d.part),places:[0,1,2,3].map(i=>en(pl[i],d.places[i])),setItems:en(h.setItems,d.setItems)};}
function planPrompt(){
  const facts=ST.facts.map(f=>'- '+f.label+': '+(S.facts[f.key].trim()||'(적지 않음)')).join('\n');
  return '당신은 한국 온라인 쇼핑몰의 청소용품 상세페이지를 쓰는 카피라이터입니다. 첨부한 사진의 제품을 잘 보고, 아래 형식의 JSON 한 개만 출력하세요.\n\n'
    +'[제품 이름] '+(S.name.trim()||'(적지 않음 — 사진을 보고 판단)')+'\n[판매자가 확인해 준 사실]\n'+facts+'\n\n[규칙]\n'+ST.copyRules.map((r,i)=>(i+1)+'. '+r).join('\n')+'\n\n'
    +'[JSON 형식]\n{"kind":"제품 종류(예: 빗자루 세트)",'
    +'"hero":{"eyebrow":"짧은 한마디(12자 안쪽)","title":"첫줄\\n둘째줄","sub":"한 문장"},'
    +'"pain":{"title":"첫줄\\n둘째줄","items":["불편1","불편2","불편3"]},'
    +'"solve":{"eyebrow":"","title":"첫줄\\n둘째줄","rows":[{"pain":"불편","fix":"해결"}]},'
    +'"material":{"eyebrow":"","title":"첫줄\\n둘째줄","body":"가까이에서 본 모습 설명"},'
    +'"craft":{"eyebrow":"","title":"첫줄\\n둘째줄","body":"만듦새 설명","badges":["짧은말","짧은말","짧은말"]},'
    +'"perform":{"eyebrow":"","title":"첫줄\\n둘째줄","body":"쓰고 난 결과 설명"},'
    +'"easy":{"eyebrow":"","title":"첫줄\\n둘째줄","body":"쓰기 편한 점 설명"},'
    +'"check":{"title":"첫줄\\n둘째줄"},'
    +'"places":{"eyebrow":"","title":"첫줄\\n둘째줄","body":"한 문장","labels":["곳1","곳2","곳3","곳4"]},'
    +'"set":{"eyebrow":"","title":"첫줄\\n둘째줄","items":[{"name":"구성품 이름","desc":"한 줄 설명"}]},'
    +'"caution":{"eyebrow":"","title":"첫줄\\n둘째줄","items":["미리 알 점"]},'
    +'"faq":{"title":"자주 묻는 질문","items":[{"q":"질문","a":"답"}]},'
    +'"scene":{"subject":"English: the product exactly as seen (colors, materials, number of parts)","action":"English: using it, e.g. sweeping dust on a wooden floor with the broom","part":"English: its working part, e.g. broom bristles","places":["English place 1","place 2","place 3","place 4 (same order as places.labels)"],"setItems":"English: every part included"}}';
}
async function writeCopy(signal){
  msg('#runMsg','AI가 제품을 보고 글을 쓰는 중이에요…');
  const p=await gText(planPrompt(),signal),keepSeller=S.copy.foot.seller;
  S.copy=norm(p);if(keepSeller)S.copy.foot.seller=keepSeller;S.hints=normHints(p.scene);
  if(!S.name.trim()&&S.copy.kind){S.name=S.copy.kind;}
  if(S.demo){for(const k of Object.keys(S.img))if(S.img[k].src==='demo'){dropImg(S.img[k].id);delete S.img[k];}S.demo=false;}
  S.made=true;persist();drawAll();
}

/* ============ 장면 사진 만들기 ============ */
async function sliceSheet(blob,n){                           // 2×2 한 장 → 네 칸(가장자리 흰 줄을 조금 잘라 내요)
  const im=await loadImg(blob),w=im.naturalWidth/2,h=im.naturalHeight/2,pad=Math.round(Math.min(w,h)*0.02),out=[];
  for(let i=0;i<n;i++){const cv=document.createElement('canvas'),side=Math.round(Math.min(w,h)-pad*2);cv.width=cv.height=side;
    cv.getContext('2d').drawImage(im,(i%2)*w+pad,Math.floor(i/2)*h+pad,w-pad*2,h-pad*2,0,0,side,side);out.push(await toBlob(cv,'image/jpeg',0.92));}
  return out;
}
function putImg(key,blob,src){const old=S.img[key];if(old)dropImg(old.id);S.img[key]={id:keepImg(blob),src};}
async function makeScene(sc,signal,note){
  RUN[sc.key]={st:'run'};drawScenes();
  try{
    const h=S.hints||normHints(null);
    const prompt=ST.sceneBase+'\n'+sc.prompt(h)+(S.photos.length>1?'\nThe attached photos are the same product from different angles.':'')+(note?'\nExtra request from the seller: '+note.slice(0,200):'');
    const blob=await gImage(prompt,sc.aspect,signal);
    G.made++;G.spent+=priceOf(G.img);
    if(sc.sheet){const parts=await sliceSheet(blob,sc.sheet);parts.forEach((b,i)=>putImg(sc.key+i,b,'ai'));}else putImg(sc.key,blob,'ai');
    delete RUN[sc.key];persist();
  }catch(e){if(e&&e.name==='AbortError'){delete RUN[sc.key];throw e;}RUN[sc.key]={st:'err',msg:gErr(e)};}
  drawScenes();drawRun();drawPage();
}
function ready(){
  if(!S.photos.length){toast('먼저 제품 사진을 한 장 넣어 주세요.');$('#drop').scrollIntoView({block:'center'});return false;}
  if(!G.key.trim()){toast('구글 AI 키를 붙여 넣어 주세요. (2번 칸)');$('#fKey').focus();return false;}
  return true;
}
async function busy(f){
  if(G.busy)return;G.busy=true;G.ctl=new AbortController();drawScenes();drawRun();
  try{await f(G.ctl.signal);}catch(e){msg('#runMsg',gErr(e),e&&e.name==='AbortError'?'':'err');}
  finally{G.busy=false;G.ctl=null;drawScenes();drawRun();}
}
async function runAll(){
  if(!ready())return;
  await busy(async signal=>{
    if(!S.made||S.demo)await writeCopy(signal);
    const list=todoScenes();let i=0,done=0;
    const next=async()=>{while(i<list.length){const sc=list[i++];msg('#runMsg','장면 사진을 만드는 중이에요… ('+done+'/'+list.length+')');await makeScene(sc,signal);done++;}};
    await Promise.all([next(),next(),next()]);                // 세 장씩 같이 만들어요
    const bad=list.filter(sc=>RUN[sc.key]&&RUN[sc.key].st==='err').length;
    msg('#runMsg',bad?'다 돌았어요. '+bad+'장은 만들지 못했어요. 아래 4번에서 그 장만 다시 눌러 주세요.':'다 만들었어요. 아래 4번에서 원본과 같은 제품인지 확인해 주세요.',bad?'err':'ok');
  });
}
async function runCopy(){
  if(!ready())return;
  if(!confirm('글을 새로 쓸까요? 지금 고쳐 둔 글은 바뀌어요. (사진은 그대로예요)'))return;
  await busy(async signal=>{await writeCopy(signal);msg('#runMsg','글을 새로 썼어요.','ok');});
}
async function regen(sceneKey){
  if(!ready())return;const sc=ST.scenes.find(x=>x.key===sceneKey);if(!sc)return;
  await busy(async signal=>{msg('#runMsg','\''+sc.label+'\' 사진을 만드는 중이에요…');await makeScene(sc,signal,$('#fNote').value.trim());msg('#runMsg',RUN[sc.key]?'':'\''+sc.label+'\' 사진을 만들었어요.','ok');});
}

/* ============ 예시로 보기(무료): 키 없이 흐름만 보여 줘요. 사진 자리는 회색 판으로 채워요 ============ */
async function demoBlob(label,aspect){
  const [a,b]=aspect.split(':').map(Number),w=860,h=Math.round(w*b/a),cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const x=cv.getContext('2d'),g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#efe8dd');g.addColorStop(1,'#ddd3c4');x.fillStyle=g;x.fillRect(0,0,w,h);
  x.fillStyle='#8a8178';x.textAlign='center';x.textBaseline='middle';x.font='700 40px "Noto Sans KR",sans-serif';x.fillText(label,w/2,h/2-18);
  x.font='400 24px "Noto Sans KR",sans-serif';x.fillText('장면 사진이 들어갈 자리',w/2,h/2+30);
  return toBlob(cv,'image/jpeg',0.85);
}
async function runDemo(){
  if(S.made&&!S.demo&&!confirm('예시 글로 바꿀까요? 지금 만든 글이 예시로 바뀌어요.'))return;
  const keepSeller=S.copy.foot.seller;S.copy=norm(ST.sample);S.copy.foot.seller=keepSeller;S.hints=normHints(ST.sample.scene);S.demo=true;S.made=true;
  if(S.accentAuto&&!S.photos.length)S.accent='#c9432e';
  for(const sl of SLOTS){const m=S.img[sl.key];if(m&&IMG.has(m.id)&&m.src!=='demo')continue;const sc=ST.scenes.find(x=>x.key===sl.scene);putImg(sl.key,await demoBlob(sl.label,sc.sheet?'1:1':sc.aspect),'demo');}
  persist();drawAll();msg('#runMsg','예시 글과 사진 자리를 넣었어요. 사진을 넣고 \'한 번에 만들기\'를 누르면 내 제품으로 바뀌어요.','ok');
}

/* ============ 사진 넣기 ============ */
async function addPhotos(files){
  const list=Array.from(files||[]).filter(f=>/^image\//.test(f.type));if(!list.length)return;
  for(const f of list.slice(0,6-S.photos.length)){try{S.photos.push(keepImg(await fitJpeg(f,2000,0.92)));}catch(e){toast('읽지 못한 사진이 있어요. 다른 사진으로 해 보세요.');}}
  if(S.accentAuto&&S.photos[0]){const c=await pickAccent(IMG.get(S.photos[0]).blob);if(c)S.accent=c;}
  persist();drawAll();
}
let swapKey='';
async function swapOwn(file){
  if(!file||!swapKey)return;
  try{putImg(swapKey,await fitJpeg(file,1720,0.92),'own');delete RUN[slotOf(swapKey).scene];persist();drawScenes();drawRun();drawPage();}catch(e){toast('사진을 읽지 못했어요.');}
}

/* ============ 이미지로 저장: 구역마다 한 장씩 + 전체 한 장을 zip 으로 ============ */
function veil(on,t){$('#veil').hidden=!on;if(t!==undefined)$('#veilMsg').textContent=t;}
async function runExport(){
  if(!window.html2canvas||!window.JSZip){toast('저장 도구를 아직 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.');return;}
  if(!S.made){toast('먼저 상세페이지를 만들어 주세요.');return;}
  veil(true,'준비하는 중…');
  const box=document.createElement('div');box.style.cssText='position:absolute;left:-12000px;top:0;width:'+PW+'px;pointer-events:none';   // 화면 밖에 진짜 크기(860)로 한 번 더 그려서 찍어요
  try{
    EX=true;let html;try{html=renderPage();}finally{EX=false;}
    box.innerHTML='<div class="pg" style="'+palette()+'">'+html+'</div>';document.body.appendChild(box);
    try{await document.fonts.load('800 40px "Noto Sans KR"','가나다라마바사 0123');await document.fonts.load('400 20px "Noto Sans KR"','가나다라마바사');await document.fonts.load('400 40px "Nanum Pen Script"','가나다라마바사');await document.fonts.ready;}catch(e){}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await Promise.all($$('img',box).map(im=>im.decode?im.decode().catch(()=>{}):0));
    const secs=$$('.sec',box),zip=new JSZip(),cvs=[];
    if(!secs.length)throw new Error('저장할 내용이 없어요.');
    for(let i=0;i<secs.length;i++){
      veil(true,'구역 '+(i+1)+' / '+secs.length);
      const cv=await html2canvas(secs[i],{scale:1,backgroundColor:'#ffffff',useCORS:true,logging:false,imageTimeout:0,width:PW,windowWidth:PW,scrollX:0,scrollY:0,ignoreElements:n=>n.id==='app'||n.id==='veil'||n.id==='toast'});
      cvs.push(cv);zip.file(secs[i].dataset.slice+'.jpg',await toBlob(cv,'image/jpeg',0.92));
    }
    const total=cvs.reduce((a,c)=>a+c.height,0);
    if(total<=30000){const all=document.createElement('canvas');all.width=PW;all.height=total;const x=all.getContext('2d');let y=0;for(const c of cvs){x.drawImage(c,0,y);y+=c.height;}
      const b=await toBlob(all,'image/jpeg',0.9);if(b)zip.file('00_all.jpg',b);}
    zip.file('read-me.txt','청소용품 상세페이지 (가로 '+PW+'px)\r\n\r\n00_all.jpg  : 전체를 한 장으로 붙인 것\r\n01~ 번호 파일 : 구역마다 자른 것 (쇼핑몰에는 번호 순서대로 올리세요)\r\n\r\n\'연출 이미지\' 표시가 있는 사진은 AI로 만든 장면입니다. 쇼핑몰의 AI 이미지 표시 규칙을 확인해 주세요.\r\n');
    veil(true,'파일로 묶는 중…');
    const out=await zip.generateAsync({type:'blob'}),a=document.createElement('a'),d=new Date(),pad=n=>String(n).padStart(2,'0');
    a.href=URL.createObjectURL(out);a.download='cleaning-detail-'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+'.zip';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),20000);
    toast('저장했어요. 내려받은 zip 파일을 풀어서 번호 순서대로 올리세요.',5000);
  }catch(e){toast('저장하지 못했어요. '+(e&&e.message?e.message:'다시 눌러 주세요.'),6000);}
  finally{box.remove();veil(false);}
}

/* ============ 버튼·입력 연결 ============ */
function wire(){
  $('#verNo').textContent=VER;
  $('#fPhoto').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value='';});
  const drop=$('#drop');
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
  drop.addEventListener('drop',e=>addPhotos(e.dataTransfer&&e.dataTransfer.files));
  $('#thumbs').addEventListener('click',async e=>{const b=e.target.closest('[data-del]');if(!b)return;const id=b.dataset.del;S.photos=S.photos.filter(x=>x!==id);dropImg(id);
    if(S.accentAuto&&S.photos[0]){const c=await pickAccent(IMG.get(S.photos[0]).blob);if(c)S.accent=c;}persist();drawAll();});
  $('#fName').addEventListener('input',e=>{S.name=e.target.value;persist();});
  $('#factFields').addEventListener('input',e=>{const k=e.target.dataset.f;if(!k)return;S.facts[k]=e.target.value;persist();
    const el=$('#pg [data-p="facts.'+k+'"]');if(el&&document.activeElement!==el){el.textContent=e.target.value;el.classList.toggle('need',!e.target.value.trim());}});
  $('#fKey').addEventListener('input',e=>{G.key=e.target.value;G.state='idle';saveKey();});
  $('#fRemember').addEventListener('change',e=>{G.remember=e.target.checked;saveKey();});
  $('#btnCheck').addEventListener('click',gCheck);
  $('#btnRun').addEventListener('click',runAll);
  $('#btnStop').addEventListener('click',()=>{if(G.ctl)G.ctl.abort();});
  $('#btnCopy').addEventListener('click',runCopy);
  $('#btnDemo').addEventListener('click',runDemo);
  $('#btnExport').addEventListener('click',runExport);
  $('#btnNew').addEventListener('click',async()=>{if(G.busy)return;if(!confirm('새 제품을 시작할까요? 지금 만든 것은 지워져요. (저장하려면 먼저 \'이미지로 저장\'을 눌러 주세요)'))return;
    for(const it of IMG.values())URL.revokeObjectURL(it.url);IMG.clear();await DB.clear();for(const k of Object.keys(RUN))delete RUN[k];REFS={sig:'',val:[]};S=blank();persist();drawAll();msg('#runMsg','');});
  $('#scenes').addEventListener('click',e=>{const r=e.target.closest('[data-regen]'),o=e.target.closest('[data-own]');
    if(r)regen(r.dataset.regen);else if(o){swapKey=o.dataset.own;$('#fSwap').click();}});
  $('#fSwap').addEventListener('change',e=>{swapOwn(e.target.files[0]);e.target.value='';});
  $('#fAccent').addEventListener('input',e=>{S.accent=e.target.value;S.accentAuto=false;persist();$('#pg').setAttribute('style',palette());fitStage();});
  $('#fAiMark').addEventListener('change',e=>{S.aiMark=e.target.checked;persist();drawPage();});
  /* 미리보기: 글자를 눌러 고치고, 사진을 누르면 왼쪽 4번의 그 사진 칸으로 가요 */
  const pg=$('#pg');
  pg.addEventListener('focusout',e=>{const el=e.target.closest('[data-p]');if(!el)return;
    const v=el.innerText.replace(/ /g,' ').replace(/\n+$/,'').trim();setAt(S,el.dataset.p,v);persist();
    if(el.dataset.t)el.innerHTML=fmtTitle(v);else el.textContent=v;el.classList.toggle('need',!v);
    if(el.dataset.p.indexOf('facts.')===0){const f=$('#factFields [data-f="'+el.dataset.p.slice(6)+'"]');if(f)f.value=v;}});
  pg.addEventListener('paste',e=>{const el=e.target.closest('[data-p]');if(!el)return;e.preventDefault();const t=(e.clipboardData||window.clipboardData).getData('text');document.execCommand('insertText',false,t);});
  pg.addEventListener('click',e=>{if(e.target.closest('[data-p]'))return;const im=e.target.closest('[data-img]'),pk=e.target.closest('[data-pick]');
    if(pk){$('#fPhoto').click();return;}if(!im)return;const key=im.dataset.img;
    if(im.classList.contains('ph')){swapKey=key;$('#fSwap').click();return;}
    const card=$('#scenes [data-sc="'+key+'"]');if(card){card.scrollIntoView({block:'center',behavior:'smooth'});card.classList.add('flash');setTimeout(()=>card.classList.remove('flash'),1600);}});
  window.addEventListener('resize',fitStage);
}
/* 키는 '기억하기'를 켰을 때만 이 컴퓨터에 남겨요(손잡이 제작기와 같은 자리). 끄면 지워요. */
function saveKey(){try{if(G.remember&&G.key.trim())localStorage.setItem(GKEY,G.key.trim());else if(!G.remember)localStorage.removeItem(GKEY);}catch(e){}}

/* ============ 새 버전 알림 ============ */
async function checkUpdate(){
  if(!/^https?:$/.test(location.protocol))return;
  try{const r=await fetch('version.json?'+Date.now(),{cache:'no-store'}),d=await r.json();
    if(d&&d.v>VER){const c=$('#updChip');c.hidden=false;c.onclick=()=>{try{localStorage.setItem(LS,JSON.stringify(S));}catch(e){}location.href=location.pathname+'?v='+d.v+'&t='+Date.now();};}}catch(e){}
}

(async function start(){
  try{const k=localStorage.getItem(GKEY);if(k){G.key=k;G.remember=true;}}catch(e){}
  await restore();
  wire();$('#fKey').value=G.key;$('#fRemember').checked=G.remember;
  if(G.key)msg('#gMsg','기억해 둔 키를 쓰고 있어요. 처음 한 번은 \'연결 확인\'을 눌러 모델을 맞춰 주세요(무료).');
  drawAll();
  checkUpdate();setInterval(checkUpdate,10*60*1000);
})();
