(function(){
  'use strict';
  // Layout de celular (≤760px): barra de abas flutuante, topo do Início, faixa de etapas do kanban e resumo de agendados.
  // Só lê o DOM existente; os estilos ficam em mobile.css e não afetam telas maiores.
  if(window.__ecoMobileNav)return;window.__ecoMobileNav=true;
  const $=s=>document.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const remember=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
  const svg=p=>`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
  const I={
    home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    quotes:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/>',
    clients:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    finance:'<path d="M4 20V10M10 20V5M16 20v-7M21 20H3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:'<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>'
  };
  const VIEWS={'#inicio':'home','#orcamentos':'quotes','#clientes':'clients','#financeiro':'finance','#configuracoes':'settings','#criar':'create'};
  const viewNow=()=>VIEWS[location.hash]||(location.hash?'home':'home');
  // Reaproveita o botão "Novo orçamento" do menu: o mesmo ouvinte de [data-new] abre o editor.
  const newQuote=()=>{const b=$('.sidebar-new[data-new]')||$('[data-new]');if(b)b.click()};

  /* ---------- Barra de abas ---------- */
  let tabbar;
  function buildTabbar(){
    if(tabbar||$('.m-tabbar'))return;
    tabbar=document.createElement('nav');tabbar.className='m-tabbar';tabbar.setAttribute('aria-label','Navegação');
    const tab=(hash,view,icon,label)=>`<a class="m-tab" href="${hash}" data-m-view="${view}">${svg(I[icon])}<span>${label}</span></a>`;
    tabbar.innerHTML=tab('#inicio','home','home','Início')+tab('#orcamentos','quotes','quotes','Orçamentos')+`<button type="button" class="m-fab" aria-label="Novo orçamento" title="Novo orçamento"><span class="m-fab-in">${svg(I.plus)}</span></button>`+tab('#clientes','clients','clients','Clientes')+tab('#financeiro','finance','finance','Financeiro');
    tabbar.querySelector('.m-fab').addEventListener('click',newQuote);
    document.body.appendChild(tabbar);
  }
  function syncTabs(){
    const v=viewNow();document.body.dataset.mView=v;
    for(const a of $$('.m-tab')){if(a.dataset.mView===v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}
    syncSummary();
  }

  /* ---------- Ocultar valores ---------- */
  const hidden=()=>document.body.classList.contains('hide-values');
  function setHidden(on){document.body.classList.toggle('hide-values',on);remember('hc-hide-values',on?'1':'0');for(const b of $$('.m-eye')){b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',on?'Mostrar valores':'Ocultar valores');b.innerHTML=svg(on?I.eyeOff:I.eye)}}

  /* ---------- Topo do Início ---------- */
  let homeQueued=false;
  function initials(name){return name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'OU'}
  function buildHome(){
    homeQueued=false;const view=$('#home-view'),top=view&&view.querySelector('.home-top');if(!top)return;
    let box=view.querySelector(':scope>.m-home');
    if(!box){
      box=document.createElement('div');box.className='m-home';
      box.innerHTML=`<section class="mh-hero" aria-label="Resumo"><div class="mh-hero-row"><span class="m-avatar" aria-hidden="true"></span><div class="m-hello"><small></small><strong></strong></div><button type="button" class="m-round m-eye" aria-pressed="false" aria-label="Ocultar valores"></button><a class="m-round m-gear" href="#configuracoes" aria-label="Configurações" title="Configurações">${svg(I.gear)}</a></div><p class="m-cap"></p><div class="mh-hero-num"><strong class="mh-hero-val"></strong><span class="mh-hero-pill"></span></div></section>
        <nav class="m-quick" aria-label="Atalhos"><button type="button" data-m-act="new"><span>${svg(I.plus)}</span>Novo</button><a href="#orcamentos"><span>${svg(I.calendar)}</span>Agenda</a><a href="#clientes"><span>${svg(I.clients)}</span>Clientes</a><a href="#financeiro"><span>${svg(I.finance)}</span>Financeiro</a></nav>`;
      box.querySelector('[data-m-act=new]').addEventListener('click',newQuote);
      box.querySelector('.m-eye').addEventListener('click',()=>setHidden(!hidden()));
      view.insertBefore(box,top);setHidden(hidden());
    }
    const title=($('#home-title')?.textContent||'').trim(),cut=title.indexOf(',');
    const hello=cut>0?title.slice(0,cut+1):'Olá,',name=(cut>0?title.slice(cut+1):title).trim()||($('.topbar-workspace')?.textContent||'').trim();
    const company=($('.topbar-workspace')?.textContent||name).trim();
    const preset=$('#home-preset'),opt=preset&&preset.selectedOptions[0];
    const period=preset&&preset.value==='custom'?($('#home-range')?.textContent||'').trim():(opt?.textContent||'').trim();
    const kpi=view.querySelector('#home-bento .kpi'),val=kpi?.querySelector('.val')?.textContent.trim()||'—',lbl=kpi?.querySelector('.lbl')?.textContent.trim()||'Receita concluída';
    const pill=kpi?.querySelector('.cmp .pill'),pillHTML=pill?pill.outerHTML:'';
    const sig=[hello,name,company,period,val,lbl,pillHTML].join('|');if(box.dataset.sig===sig)return;box.dataset.sig=sig;
    const av=box.querySelector('.m-avatar');
    if(/herboclean/i.test(company)){if(!av.querySelector('img'))av.innerHTML='<img src="assets/herboclean-icon.png" alt="">'}else av.textContent=initials(company);
    box.querySelector('.m-hello small').textContent=hello;box.querySelector('.m-hello strong').textContent=name;
    box.querySelector('.m-cap').textContent=lbl+(period?' · '+period:'');
    box.querySelector('.mh-hero-val').textContent=val;box.querySelector('.mh-hero-pill').innerHTML=pillHTML;
  }
  const queueHome=()=>{if(!homeQueued){homeQueued=true;requestAnimationFrame(buildHome)}};

  /* ---------- Kanban: faixa de etapas e resumo ---------- */
  let strip,summary,active=0,boardQueued=false;
  function money(col){const s=col.querySelector('.kcol-head .sum');return s?[...s.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():''}
  function label(col){const t=col.querySelector('.kcol-head .t');return t?[...t.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():col.getAttribute('aria-label')||''}
  function cols(){return $$('#board > .kcol')}
  function buildBoard(){
    boardQueued=false;const board=$('#board');if(!board)return;
    if(!strip){strip=document.createElement('div');strip.className='m-strip';strip.setAttribute('role','group');strip.setAttribute('aria-label','Etapas');board.before(strip);
      strip.addEventListener('click',e=>{const b=e.target.closest('[data-m-col]');if(!b)return;const col=board.querySelector(`.kcol[data-col="${CSS.escape(b.dataset.mCol)}"]`);if(col)goTo(col)})}
    const list=cols();
    const html=list.map((c,i)=>`<button type="button" class="m-stage" data-m-col="${c.dataset.col}" aria-pressed="${i===active}"><b>${esc(label(c))} <em>${esc(c.querySelector('.kcol-head .c')?.textContent||'0')}</em></b><span class="m-sum">${esc(money(c))}</span></button>`).join('');
    if(strip.dataset.sig!==html){strip.dataset.sig=html;strip.innerHTML=html}
    strip.hidden=!list.length;
    if(active>=list.length)active=0;markActive();syncSummary();
  }
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function goTo(col){const board=$('#board'),pad=parseFloat(getComputedStyle(board).scrollPaddingLeft)||0;
    board.scrollTo({left:board.scrollLeft+col.getBoundingClientRect().left-board.getBoundingClientRect().left-pad,behavior:reduced()?'auto':'smooth'})}
  function markActive(){if(!strip)return;const btns=$$('.m-stage',strip);btns.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===active)));const b=btns[active];
    if(b&&strip.scrollWidth>strip.clientWidth){const left=b.offsetLeft-(strip.clientWidth-b.offsetWidth)/2;strip.scrollTo({left,behavior:reduced()?'auto':'smooth'})}}
  function onBoardScroll(){const board=$('#board'),list=cols();if(!list.length)return;const pad=parseFloat(getComputedStyle(board).scrollPaddingLeft)||0,base=board.getBoundingClientRect().left+pad;
    let best=0,dist=Infinity;list.forEach((c,i)=>{const d=Math.abs(c.getBoundingClientRect().left-base);if(d<dist){dist=d;best=i}});if(best!==active){active=best;markActive()}}
  function syncSummary(){
    const board=$('#board');if(!board)return;
    if(!summary){summary=document.createElement('div');summary.className='m-sumbar';summary.setAttribute('role','status');summary.innerHTML='<div class="m-sum-top"><span>Agendados no período <small class="m-sum-note"></small></span><b class="m-sum-pct">0%</b></div><div class="m-sum-bar" aria-hidden="true"><i></i></div>';document.body.appendChild(summary)}
    const sched=board.querySelector('.kcol[data-col="scheduled"]'),done=board.querySelector('.kcol[data-col="completed"]');
    const total=board.querySelectorAll('.kcol .proposal-card').length,n=(sched?sched.querySelectorAll('.proposal-card').length:0)+(done?done.querySelectorAll('.proposal-card').length:0);
    const show=!!sched&&total>0&&document.body.dataset.mView==='quotes';summary.hidden=!show;document.body.classList.toggle('m-has-sum',show);if(!show)return;
    const pct=Math.round(n/total*100);summary.querySelector('.m-sum-pct').textContent=pct+'%';summary.querySelector('.m-sum-bar i').style.width=pct+'%';
    summary.querySelector('.m-sum-note').textContent=`· ${n} de ${total}`;summary.setAttribute('aria-label',`Agendados no período: ${n} de ${total} orçamentos agendados ou concluídos, ${pct}%`);
  }
  const queueBoard=()=>{if(!boardQueued){boardQueued=true;requestAnimationFrame(buildBoard)}};

  function init(){
    buildTabbar();setHidden(remember('hc-hide-values')==='1');syncTabs();
    window.addEventListener('hashchange',syncTabs);
    const home=$('#home-view');if(home){new MutationObserver(queueHome).observe(home,{childList:true,subtree:true,characterData:true});home.addEventListener('change',e=>{if(e.target.id==='home-preset')queueHome()});queueHome()}
    const board=$('#board');if(board){new MutationObserver(queueBoard).observe(board,{childList:true,subtree:true,characterData:true});board.addEventListener('scroll',onBoardScroll,{passive:true});queueBoard()}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
