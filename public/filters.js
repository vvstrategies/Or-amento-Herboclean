(function(root){
  'use strict';
  // Barra de filtros única do topo (Início, Orçamentos, Clientes e Financeiro).
  // Origem, serviço e tipo de cliente são compartilhados entre as telas; período e status são de cada tela.
  // Os filtros combinam entre si: Persiana + Google + Corporativo mostra só o que atende aos três.
  const KEY='hc-filters-v1',tz='America/Sao_Paulo';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const br=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
  const ORIGINS=[['all','Todos'],['meta','Meta'],['google','Google'],['organico','Orgânico'],['indicacao','Indicação'],['cliente','Cliente antigo'],['none','Sem origem']];
  const INLINE_ORIGINS=4;
  const STATUSES=[['generated','Orçamento'],['scheduled','Agendado'],['completed','Concluído'],['cancelled','Cancelado']];
  const PERIOD_LABEL={'7':'7 dias','30':'30 dias',month:'Mês atual',all:'Tudo'};
  const DEFAULTS={home:'30',quotes:'all',clients:'all',finance:'30',sales:'30',traffic:'30'};
  const ORIGIN_ALIASES={google_ads:'google','google-ads':'google',googleads:'google',meta_ads:'meta','meta-ads':'meta',facebook:'meta',facebook_ads:'meta',instagram:'meta'};
  const originKey=v=>{const k=String(v||'').toLowerCase().replace(/\s+/g,'');return ORIGIN_ALIASES[k]||k};

  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return {}}};
  const saved=load();
  const state={origin:typeof saved.origin==='string'?saved.origin:'all',services:Array.isArray(saved.services)?saved.services:[],tags:Array.isArray(saved.tags)?saved.tags:[],periods:saved.periods&&typeof saved.periods==='object'?saved.periods:{},status:saved.status&&typeof saved.status==='object'?saved.status:{}};
  const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
  let options={services:[],tags:[]},optionsPromise=null;
  const bars=new Map();

  function loadOptions(){
    if(optionsPromise)return optionsPromise;
    const api=root.EcoCache?.get||(u=>root.EcoAuth.api(u));
    optionsPromise=Promise.all([api('/api/settings?lite=1').catch(()=>null),api('/api/tags').catch(()=>[])]).then(([settings,tags])=>{
      options={services:(settings?.services||[]).map(s=>s.name).filter(Boolean),tags:(tags||[]).map(t=>({id:t.id,label:t.label.charAt(0)+t.label.slice(1).toLowerCase()}))};
      if(!options.tags.length)options.tags=[{id:'residencial',label:'Residencial'},{id:'corporativo',label:'Corporativo'}];
      root.EcoServices?.setCatalog(options.services);
      for(const bar of bars.values())render(bar);return options;
    });
    return optionsPromise;
  }
  addEventListener('eco:data-changed',()=>{optionsPromise=null;if(bars.size)loadOptions()});

  // Atalhos próprios de uma tela (ex.: Financeiro por mês): [{id,label,range:()=>[from,to]}].
  const CUSTOM_PRESETS={};
  const monthStart=d=>d.slice(0,8)+'01',monthEnd=d=>{const x=new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7),0));return x.toISOString().slice(0,10)};
  const shiftMonth=(d,n)=>{const x=new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1+n,1));return x.toISOString().slice(0,10)};
  const MONTH_PRESETS=[
    {id:'month',label:'Mês atual',range:t=>[monthStart(t),monthEnd(t)]},
    {id:'prev-month',label:'Mês anterior',range:t=>{const p=shiftMonth(t,-1);return [p,monthEnd(p)]}},
    {id:'3m',label:'3 meses',range:t=>[shiftMonth(t,-2),monthEnd(t)]},
    {id:'6m',label:'6 meses',range:t=>[shiftMonth(t,-5),monthEnd(t)]},
    {id:'year',label:'Ano',range:t=>[t.slice(0,4)+'-01-01',monthEnd(t)]}];
  function period(scope){
    const p=state.periods[scope]||{preset:DEFAULTS[scope]||'30'},t=today();
    if(p.preset==='custom'&&p.from&&p.to)return {preset:'custom',from:p.from,to:p.to};
    if(p.preset==='all')return {preset:'all',from:'',to:''};
    const custom=CUSTOM_PRESETS[scope]?.find(x=>x.id===p.preset)||CUSTOM_PRESETS[scope]?.[0];
    if(CUSTOM_PRESETS[scope]&&custom){const [from,to]=custom.range(t);return {preset:custom.id,from,to}}
    // 'month' = mês corrente até hoje; o antigo '90' salvo no navegador vira 'month'.
    if(p.preset==='month'||p.preset==='90')return {preset:'month',from:monthStart(t),to:t};
    const days=Number(p.preset)||30;return {preset:String(days),from:addDays(t,-(days-1)),to:t};
  }
  /** Estado efetivo de uma tela. */
  function get(scope){const p=period(scope);return {origin:state.origin,services:[...state.services],tags:[...state.tags],statuses:[...(state.status[scope]||[])],...p}}
  /** Parâmetros para /api/dashboard e afins. */
  function query(scope,extra={}){const f=get(scope),q=new URLSearchParams();if(f.from)q.set('from',f.from);if(f.to)q.set('to',f.to);if(f.origin!=='all')q.set('origin',f.origin);if(f.services.length)q.set('services',f.services.join(','));if(f.tags.length)q.set('tags',f.tags.join(','));for(const [k,v] of Object.entries(extra))q.set(k,v);return q.toString()}
  /** Um registro passa se atender a todas as dimensões ativas. */
  // {period:false}: ignora o período (ex.: "já comprou alguma vez" em Vendas & Receita).
  function match(scope,{date='',origin='',services=[],tags=[],status=''},{period=true}={}){
    const f=get(scope);
    if(period&&f.from&&(!date||date<f.from||date>f.to))return false;
    const o=originKey(origin);if(f.origin!=='all'&&(f.origin==='none'?!!o:o!==f.origin))return false;
    if(f.services.length&&!services.some(s=>f.services.includes(s)))return false;
    if(f.tags.length&&!(f.tags.includes('__none')&&!tags.length)&&!tags.some(t=>f.tags.includes(t)))return false;
    if(f.statuses.length&&!f.statuses.includes(status))return false;
    return true;
  }
  // Só contam as dimensões que a tela mostra (no Financeiro, a origem escolhida no Início não conta).
  const active=scope=>{const f=get(scope),d=bars.get(scope)?.dims||['origin','period','service','tag','status'];return (d.includes('origin')&&f.origin!=='all')||(d.includes('service')&&f.services.length>0)||(d.includes('tag')&&f.tags.length>0)||(d.includes('status')&&f.statuses.length>0)||(d.includes('period')&&f.preset!==(DEFAULTS[scope]||'30'))};
  function emit(changedScope,shared){persist();for(const bar of bars.values()){if(!bar.host.isConnected)continue;render(bar);if(shared||bar.scope===changedScope)bar.onChange?.(get(bar.scope))}dispatchEvent(new CustomEvent('eco:filters-changed',{detail:{scope:changedScope}}))}

  /* ---------- Ícones ---------- */
  const dots='<span class="fb-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  const originIcon=id=>id==='all'?dots:`<span class="fb-oico fb-o-${esc(id)}">${root.EcoIcons?.optionIcon(id)||''}</span>`;
  const chevron='<svg class="fb-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  // Tipo de cliente: ícone e cor iguais aos selos dos cards (Corporativo verde-escuro, Residencial lima).
  const TAG_ICONS={corporativo:'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h3a1 1 0 0 1 1 1v11M3 21h18M8 7h4M8 11h4M8 15h4',residencial:'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5',__none:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8'};
  const tagIcon=id=>`<span class="fb-mico fb-t-${TAG_ICONS[id]?esc(id):'other'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${TAG_ICONS[id]||'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01'}"/></svg></span>`;
  const serviceIcon=(name,color)=>`<span class="fb-mico fb-svc" style="--svc:${esc(color)}">${root.EcoServices?.icon(name)||''}</span>`;
  const calIcon='<svg class="fb-cal" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

  /* ---------- Render ---------- */
  function menuButton(kind,label,count){return `<button type="button" class="fb-menu-btn${count?' on':''}" data-fb-menu="${kind}" aria-haspopup="true" aria-expanded="false">${esc(label)}${count?` <span class="fb-count">${count}</span>`:''}${chevron}</button>`}
  // Telas por mês mostram "nov 2026" ou "set – nov 2026"; as demais, as datas.
  const MON=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  function rangeLabel(scope,f){
    if(!CUSTOM_PRESETS[scope])return `${br(f.from)} – ${br(f.to)}`;
    const m=d=>MON[+d.slice(5,7)-1],y=d=>d.slice(0,4);
    if(f.from.slice(0,7)===f.to.slice(0,7))return `${m(f.from)} ${y(f.from)}`;
    return y(f.from)===y(f.to)?`${m(f.from)} – ${m(f.to)} ${y(f.to)}`:`${m(f.from)} ${y(f.from)} – ${m(f.to)} ${y(f.to)}`;
  }
  // A barra é um cartão com a linha de filtros e, nas telas que precisam, linhas extras (extraRow).
  // Só a linha de filtros é redesenhada; as extras guardam os controles da tela (busca, funil...) intactos.
  // .fb-tail fica na mesma linha dos filtros, depois deles, e também não é redesenhado (ex.: Realizado/Projetado no Financeiro).
  function scaffold(host){let bar=host.querySelector(':scope>.fbar');if(!bar){host.innerHTML='<div class="fbar" role="toolbar" aria-label="Filtros"><div class="fb-line"><div class="fb-row fb-main"></div><div class="fb-tail"></div></div></div>';bar=host.firstElementChild}return bar}
  const tail=host=>scaffold(host).querySelector('.fb-tail');
  function extraRow(host,key='extra'){
    const bar=scaffold(host);let g=bar.querySelector(`:scope>.fb-grow[data-row="${key}"]`);
    if(!g){g=document.createElement('div');g.className='fb-grow';g.dataset.row=key;g.innerHTML='<div class="fb-inner"><div class="fb-row fb-extra"></div></div>';bar.append(g)}
    return g.querySelector('.fb-extra');
  }
  function render(bar){
    const {host,scope,dims}=bar,f=get(scope),extraOrigin=ORIGINS.slice(INLINE_ORIGINS).find(([id])=>id===f.origin);
    const groups=[];
    if(dims.includes('origin'))groups.push(`<div class="fb-group" role="group" aria-label="Origem" data-seg-key="fb-${scope}-origin">${ORIGINS.slice(0,INLINE_ORIGINS).map(([id,l])=>`<button type="button" class="fb-pill" data-fb-origin="${id}" aria-pressed="${f.origin===id}">${originIcon(id)}${l}</button>`).join('')}${menuButton('origin',extraOrigin?extraOrigin[1]:'Mais',extraOrigin?1:0)}</div>`);
    if(dims.includes('period')){
      const presets=CUSTOM_PRESETS[scope]?CUSTOM_PRESETS[scope].map(x=>[x.id,x.label]):['month','7','30',...(bar.allowAll?['all']:[])].map(id=>[id,PERIOD_LABEL[id]]);
      groups.push(`<div class="fb-group" role="group" aria-label="Período" data-seg-key="fb-${scope}-period">${presets.map(([id,label])=>`<button type="button" class="fb-pill" data-fb-preset="${id}" aria-pressed="${f.preset===id}">${esc(label)}</button>`).join('')}<button type="button" class="fb-pill fb-range${f.preset==='custom'?' on':''}" data-fb-calendar aria-haspopup="dialog" aria-pressed="${f.preset==='custom'}">${calIcon}${f.from?rangeLabel(scope,f):CUSTOM_PRESETS[scope]?'Escolher datas':'<span class="fb-rl"><span>Escolher datas</span><span class="fb-ghost" aria-hidden="true">00/00/0000 – 00/00/0000</span></span>'}</button></div>`);
    }
    const sel=[];
    if(dims.includes('service'))sel.push(menuButton('service',f.services.length===1?f.services[0]:'Serviço',f.services.length>1?f.services.length:f.services.length?1:0));
    if(dims.includes('tag')){const one=options.tags.find(t=>t.id===f.tags[0]);sel.push(menuButton('tag',f.tags.length===1&&one?one.label:'Cliente',f.tags.length))}
    if(dims.includes('status')){const one=STATUSES.find(([id])=>id===f.statuses[0]);sel.push(menuButton('status',f.statuses.length===1&&one?one[1]:'Status',f.statuses.length))}
    if(sel.length)groups.push(`<div class="fb-group" role="group" aria-label="Serviço, tipo de cliente e status">${sel.join('')}</div>`);
    // "Limpar" ocupa sempre o seu espaço (invisível sem filtro ativo): a barra não muda de largura ao filtrar.
    const on=active(scope),clear='<button type="button" class="fb-clear'+(on?'':' is-off')+'" data-fb-clear title="Voltar aos filtros padrão"'+(on?'':' tabindex="-1" aria-hidden="true"')+'>Limpar</button>';
    scaffold(host).querySelector('.fb-main').innerHTML=`${groups.join('<span class="fb-div" aria-hidden="true"></span>')}${clear}`;
  }

  /* ---------- Menus ---------- */
  let openMenu=null;
  function closeMenu(){if(!openMenu)return;openMenu.el.remove();openMenu.button?.setAttribute('aria-expanded','false');openMenu=null}
  function place(el,button){
    const r=button.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight,left=Math.max(8,Math.min(innerWidth-w-8,r.left)),below=r.bottom+8+h<innerHeight;
    el.style.left=left+'px';el.style.top=(below?r.bottom+8:Math.max(8,r.top-h-8))+'px';
  }
  function showMenu(bar,kind,button){
    closeMenu();const f=get(bar.scope);
    const list=kind==='origin'?ORIGINS.slice(INLINE_ORIGINS).map(([id,l])=>({id,label:l,on:f.origin===id,icon:originIcon(id),radio:true}))
      :kind==='service'?(()=>{const c=root.EcoServices?.colors(options.services)||{};return options.services.map(s=>({id:s,label:s,on:f.services.includes(s),icon:serviceIcon(s,c[s]||'')}))})()
      :kind==='tag'?[...options.tags.map(t=>({id:t.id,label:t.label,on:f.tags.includes(t.id),icon:tagIcon(t.id)})),{id:'__none',label:'Sem tipo',on:f.tags.includes('__none'),icon:tagIcon('__none')}]
      :STATUSES.map(([id,l])=>({id,label:l,on:f.statuses.includes(id),dot:id}));
    const el=document.createElement('div');el.className='fb-pop fb-menu fb-menu-'+kind+(list.length>8?' fb-menu-wide':'');el.setAttribute('role','menu');
    el.innerHTML=(list.length?list.map(o=>`<button type="button" role="${o.radio?'menuitemradio':'menuitemcheckbox'}" aria-checked="${o.on}" data-id="${esc(o.id)}">${o.radio?'':'<span class="fb-check" aria-hidden="true"></span>'}${o.icon||''}${o.dot?`<span class="fb-sdot s-${o.dot}"></span>`:''}<span>${esc(o.label)}</span></button>`).join(''):'<p class="fb-empty">Nada para filtrar ainda.</p>')+(kind!=='origin'&&list.some(o=>o.on)?'<button type="button" class="fb-menu-clear" data-clear>Mostrar todos</button>':'');
    document.body.append(el);place(el,button);button.setAttribute('aria-expanded','true');openMenu={el,button};
    el.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.clear!==undefined){if(kind==='service')state.services=[];else if(kind==='tag')state.tags=[];else state.status[bar.scope]=[];closeMenu();emit(bar.scope,kind!=='status');return}
      const id=b.dataset.id;
      if(kind==='origin'){state.origin=id;closeMenu();emit(bar.scope,true);return}
      const arr=kind==='service'?state.services:kind==='tag'?state.tags:(state.status[bar.scope]||=[]),i=arr.indexOf(id);
      if(i<0)arr.push(id);else arr.splice(i,1);b.setAttribute('aria-checked',String(i<0));
      emit(bar.scope,kind!=='status');
      // O menu continua aberto para marcar mais de uma opção; reposiciona no botão redesenhado.
      const again=bar.host.querySelector(`[data-fb-menu="${kind}"]`);if(again&&openMenu){openMenu.button=again;again.setAttribute('aria-expanded','true');place(el,again)}
    });
    el.addEventListener('keydown',e=>{if(e.key==='Escape'){const b=openMenu?.button;closeMenu();b?.focus()}});
    el.querySelector('button')?.focus();
  }

  /* ---------- Calendário (intervalo) ---------- */
  const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  function showCalendar(bar,button){
    closeMenu();const f=get(bar.scope),t=today();
    let start=f.from||addDays(t,-29),end=f.to||t,picking=false,view=(end||t).slice(0,7);
    const el=document.createElement('div');el.className='fb-pop fb-calendar';el.setAttribute('role','dialog');el.setAttribute('aria-label','Escolher período');
    const draw=()=>{
      const [y,m]=view.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)),offset=first.getUTCDay(),gridStart=addDays(view+'-01',-offset);
      let cells='';for(let i=0;i<42;i++){const d=addDays(gridStart,i),out=d.slice(0,7)!==view,lo=start&&end?(start<end?start:end):start,hi=start&&end?(start<end?end:start):start,inRange=lo&&hi&&d>=lo&&d<=hi,edge=d===lo||d===hi;
        cells+=`<button type="button" class="fb-day${out?' out':''}${inRange?' in':''}${edge?' edge':''}${d===t?' today':''}" data-day="${d}" aria-pressed="${!!edge}" aria-label="${br(d)}">${Number(d.slice(8))}</button>`}
      el.innerHTML=`<div class="fb-cal-head"><button type="button" data-nav="-12" aria-label="Ano anterior">«</button><button type="button" data-nav="-1" aria-label="Mês anterior">‹</button><strong>${MONTHS[m-1]} ${y}</strong><button type="button" data-nav="1" aria-label="Próximo mês">›</button><button type="button" data-nav="12" aria-label="Próximo ano">»</button></div>
        <div class="fb-week">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<span>${d}</span>`).join('')}</div><div class="fb-days">${cells}</div>
        <p class="fb-cal-range">${start?br(start<=(end||start)?start:end):'—'} → ${end?br(start<=end?end:start):'escolha o fim'}</p>
        <div class="fb-cal-actions"><button type="button" class="secondary" data-cancel>Cancelar</button><button type="button" class="primary" data-apply ${start&&end?'':'disabled'}>Aplicar</button></div>`;
    };
    draw();document.body.append(el);place(el,button);button.setAttribute('aria-expanded','true');openMenu={el,button};
    el.addEventListener('click',e=>{
      e.stopPropagation();const b=e.target.closest('button');if(!b)return;
      if(b.dataset.nav){const [y,m]=view.split('-').map(Number),d=new Date(Date.UTC(y,m-1+Number(b.dataset.nav),1));view=d.toISOString().slice(0,7);draw();return}
      if(b.dataset.day){const d=b.dataset.day;if(!picking){start=d;end='';picking=true}else{end=d;picking=false;if(end<start)[start,end]=[end,start]}draw();el.querySelector(`[data-day="${d}"]`)?.focus();return}
      if(b.dataset.cancel!==undefined){closeMenu();button.focus();return}
      if(b.dataset.apply!==undefined&&start&&end){state.periods[bar.scope]={preset:'custom',from:start,to:end};closeMenu();emit(bar.scope,false)}
    });
    el.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();button.focus()}});
    el.querySelector('.fb-day.edge,.fb-day')?.focus();
  }
  document.addEventListener('click',e=>{if(openMenu&&!openMenu.el.contains(e.target)&&!openMenu.button.contains(e.target))closeMenu()});
  addEventListener('resize',closeMenu);
  document.addEventListener('scroll',e=>{if(openMenu&&!openMenu.el.contains(e.target))closeMenu()},true);

  /**
   * Monta a barra em `host`. dims: origin, period, service, tag, status.
   * allowAll: inclui "Tudo" no período (Orçamentos e Clientes mostram tudo por padrão).
   */
  function mount(host,{scope,dims=['origin','period','service','tag'],allowAll=false,presets=null,defaultPreset=null,onChange}={}){
    if(!host)return null;
    if(presets==='months')presets=MONTH_PRESETS;
    if(presets){CUSTOM_PRESETS[scope]=presets;DEFAULTS[scope]=defaultPreset||presets[0].id}
    const bar={host,scope,dims,allowAll,onChange};bars.set(scope,bar);render(bar);loadOptions();
    if(!host.dataset.fbBound){host.dataset.fbBound='1';host.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;const cur=bars.get(scope);
      if(b.dataset.fbOrigin){state.origin=b.dataset.fbOrigin;emit(scope,true);return}
      if(b.dataset.fbPreset){state.periods[scope]={preset:b.dataset.fbPreset};emit(scope,false);return}
      if(b.dataset.fbCalendar!==undefined){if(openMenu?.button===b)return closeMenu();showCalendar(cur,b);return}
      if(b.dataset.fbMenu){if(openMenu?.button===b)return closeMenu();showMenu(cur,b.dataset.fbMenu,b);return}
      if(b.dataset.fbClear!==undefined){const d=cur.dims;if(d.includes('origin'))state.origin='all';if(d.includes('service'))state.services=[];if(d.includes('tag'))state.tags=[];state.status[scope]=[];delete state.periods[scope];emit(scope,d.some(x=>['origin','service','tag'].includes(x)))}
    })}
    return bar;
  }
  /** Texto curto do que está filtrado, para subtítulos e exportações. */
  function describe(scope){
    const f=get(scope),parts=[];
    if(f.origin!=='all')parts.push(ORIGINS.find(([id])=>id===f.origin)?.[1]||f.origin);
    if(f.services.length)parts.push(f.services.join(' + '));
    if(f.tags.length)parts.push(f.tags.map(id=>id==='__none'?'Sem tipo':options.tags.find(t=>t.id===id)?.label||id).join(' + '));
    if(f.statuses.length)parts.push(f.statuses.map(id=>STATUSES.find(([s])=>s===id)?.[1]||id).join(' + '));
    return parts.join(' · ');
  }
  root.EcoFilters={mount,extraRow,tail,get,query,match,describe,active,originKey,STATUSES,setStatuses(scope,list){state.status[scope]=[...list];emit(scope,false)}};
})(globalThis);
