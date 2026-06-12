/* 首页实验台:三块小独立屏平铺(原生渲染,无 iframe;屏内 overflow:hidden 不抢滚轮) */
(function(){
const esc=s=>(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ts=t=>{const d=new Date((t||0)*1000),p=n=>String(n).padStart(2,'0');
  return `<span class="dim">[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]</span> `;};
const pctOf=(a,n)=>n?Math.round(a/n*100):0;

const M1='img/cast/m1.jpg', M2='img/cast/m2.jpg';
const SESSIONS=[
  {who:'法拉第', role:'对照实验员', user:'faraday', subj:[[M1,'夏洛·Claude'],[M2,'米拉·Gemini'],[null,'Codex']], stream:'experimenter/session-1.jsonl'},
  {who:'小号', role:'复验·保险丝', user:'fuse', subj:[[M1,'夏洛·Claude'],[M2,'米拉·Gemini']], stream:'experimenter/session-2.jsonl'},
  {who:'Codex', role:'独立复验位', user:'codex', subj:[[M1,'夏洛·Claude'],[M2,'米拉·Gemini']], stream:'experimenter/session-3.jsonl'},
];

function card(s){
  const subj=s.subj.map(x=>x[0]
    ?`<img src="${x[0]}" alt="${x[1]}" title="${x[1]}">`
    :`<span class="sx" title="${x[1]}">${x[1].split('·')[0]}</span>`).join('');
  return `
  <div class="bplate"><span class="bwho">⬤ ${s.who}</span><span class="brole">${s.role}</span>
    <span class="bsubj">${subj}</span></div>
  <div class="bwin">
    <div class="btbar"><span class="bdots"><i></i><i></i><i></i></span>
      <span class="btitle">${s.user}@labless</span></div>
    <div class="bscreen"></div>
    <div class="bstatus"><span class="bm">[claude-haiku-4.5]</span><span class="bprog">命题 0/0</span><span class="bcost">$0.0000</span><span class="bbar">░░░░░░░░░░</span></div>
  </div>`;
}

function makeTerminal(tile, streamUrl){
  const feed=tile.querySelector('.bscreen');
  const prog=tile.querySelector('.bprog'), costEl=tile.querySelector('.bcost'), bar=tile.querySelector('.bbar');
  let cleared=false, cost=0, total=0;
  function setBar(f){ f=Math.max(0,Math.min(1,f)); const k=Math.round(f*10);
    bar.textContent='█'.repeat(k)+'░'.repeat(10-k); }
  function ln(cls,html){ const d=document.createElement('div'); d.className='bln '+cls; d.innerHTML=html; return d; }
  function render(e){
    if(!cleared){ feed.innerHTML=''; cleared=true; }
    if(e.kind==='start'){ total=e.n_props||0; prog.textContent='命题 0/'+total;
      feed.appendChild(ln('dim',`* 受试 [${(e.subjects||[]).join(', ')}] · 无人值守`));
    } else if(e.kind==='say'){ feed.appendChild(ln('','<span class="bb">●</span> '+esc(e.text)));
    } else if(e.kind==='proposition'){ prog.textContent='命题 '+e.idx+'/'+e.total;
      feed.appendChild(ln('bprop','<span class="bb">●</span> 命题 '+e.idx+'/'+e.total+' · <b>'+esc(e.title)+'</b>'));
    } else if(e.kind==='running'){ feed.appendChild(ln('',ts(e.t)+'<span class="bcode">lab eval "'+esc(e.title)+'" --model='+esc(e.model).toLowerCase()+'</span>'));
    } else if(e.kind==='result'){ cost+=e.cost||0; costEl.textContent='$'+cost.toFixed(4);
      feed.appendChild(ln('','  <span class="bbr">⎿</span> '+esc(e.model)+' '+e.ok+'/'+e.n+' <span class="dim">'+pctOf(e.ok,e.n)+'% $'+(e.cost||0).toFixed(4)+'</span>'));
    } else if(e.kind==='consensus'){
      feed.appendChild(ln('','<span class="bb">●</span> 共识:'+esc(e.text))); if(total) setBar(e.idx/total);
    } else if(e.kind==='done'){ if(e.total_cost!=null) costEl.textContent='$'+Number(e.total_cost).toFixed(4); setBar(1);
      feed.appendChild(ln('dim','* session complete · 共识已落墙'));
    }
    feed.scrollTop=feed.scrollHeight; // overflow:hidden 下程序滚动依然有效
  }
  function reset(){ feed.innerHTML=''; cleared=false; cost=0; total=0; costEl.textContent='$0.0000'; prog.textContent='命题 0/0'; setBar(0); }
  (async function(){
    let ev=[];
    try{ const r=await fetch(streamUrl+'?_='+Date.now(),{cache:'no-store'});
      ev=(await r.text()).split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch(_){return null}}).filter(Boolean);
    }catch(_){ return; }
    if(!ev.length) return;
    while(true){ reset();
      for(let i=0;i<ev.length;i++){ render(ev[i]);
        const nx=ev[i+1]; let d=500; if(nx){ d=Math.max(240,Math.min(1500,(nx.t-ev[i].t)*1000)); }
        await sleep(d); }
      await sleep(4000);
    }
  })();
}

const floor=document.getElementById('benchfloor');
if(floor){ for(const s of SESSIONS){ const t=document.createElement('div'); t.className='btile'; t.innerHTML=card(s); floor.appendChild(t); makeTerminal(t, s.stream); } }
})();

/* ── 人物谱考场:每位角色肖像正下方一台小考屏(按被试过滤真日志;没上台的挂候考室) ── */
(function(){
const esc=s=>(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function ln(feed,cls,html){ const d=document.createElement('div'); d.className='bln '+cls; d.innerHTML=html; feed.appendChild(d); feed.scrollTop=feed.scrollHeight; }
async function castConsole(el, model){
  const feed=el.querySelector('.bscreen');
  let ev=[];
  try{ const r=await fetch('experimenter/session-1.jsonl?_='+Date.now(),{cache:'no-store'});
    ev=(await r.text()).split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch(_){return null}}).filter(Boolean);
  }catch(_){ return idle(el, model); }
  const mine=ev.filter(e=>
    e.kind==='proposition' || e.kind==='done' ||
    (e.kind==='running' && (e.model||'').toLowerCase()===model) ||
    (e.kind==='result' && (e.model||'').toLowerCase()===model));
  if(!mine.some(e=>e.kind==='result')) return idle(el, model);
  while(true){ feed.innerHTML='';
    ln(feed,'dim','* 被试席 · 直播回放');
    for(const e of mine){
      if(e.kind==='proposition') ln(feed,'bprop','<span class="bb">●</span> 命题 '+e.idx+'/'+e.total+' · <b>'+esc(e.title)+'</b>');
      else if(e.kind==='running') ln(feed,'','<span class="bcode">lab eval --model='+model+'</span>');
      else if(e.kind==='result') ln(feed,'','  <span class="bbr">⎿</span> '+e.ok+'/'+e.n+' <span class="dim">$'+(e.cost||0).toFixed(4)+'</span>');
      else if(e.kind==='done') ln(feed,'dim','* 本场考毕 · 等下一批命题');
      await sleep(700);
    }
    await sleep(4500);
  }
}
function idle(el, model){
  const feed=el.querySelector('.bscreen');
  feed.innerHTML='';
  ln(feed,'dim','* 候考室');
  ln(feed,'','<span class="bb">●</span> 本场未上台');
  ln(feed,'dim','  下一批命题排期中…');
  ln(feed,'','<span class="dim">❯</span> <span class="ccur">&nbsp;</span>');
}
document.querySelectorAll('.cterm').forEach(el=>{
  const m=el.getAttribute('data-model');
  if(m==='claude'||m==='gemini') castConsole(el,m); else idle(el,m);
});
})();
