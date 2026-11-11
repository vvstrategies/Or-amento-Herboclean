(function(root){
  'use strict';
  // Pílulas deslizantes: um indicador por grupo viaja até a opção ativa, inclusive quando o grupo é redesenhado.
  const GROUPS='.seg,.dre-tabs,.dre-mode,.profit-tabs,.fbar .fb-group';
  const ACTIVE=':scope>button[aria-pressed="true"],:scope>button[aria-selected="true"]';
  const last=new Map();let frame=0;
  const sizes=new ResizeObserver(()=>schedule());
  const keyOf=g=>g.dataset.segKey||(g.id||g.closest('[id]')?.id||'')+'|'+g.className;
  function sync(g){
    const active=g.querySelector(ACTIVE);let ind=g.querySelector(':scope>.seg-ind');
    if(!active||!g.offsetWidth){if(ind)ind.style.opacity='0';return}
    if(!ind){ind=document.createElement('span');ind.className='seg-ind';ind.setAttribute('aria-hidden','true');g.prepend(ind);g.classList.add('has-ind');sizes.observe(g);const prev=last.get(keyOf(g));if(prev){place(ind,prev,false);void ind.offsetWidth}}
    const box={x:active.offsetLeft,y:active.offsetTop,w:active.offsetWidth,h:active.offsetHeight};
    place(ind,box,true);last.set(keyOf(g),box);
  }
  function place(ind,b,animate){ind.style.transition=animate?'':'none';ind.style.opacity='1';ind.style.width=b.w+'px';ind.style.height=b.h+'px';ind.style.transform=`translate(${b.x}px,${b.y}px)`}
  function syncAll(){frame=0;document.querySelectorAll(GROUPS).forEach(sync)}
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(syncAll)};
  new MutationObserver(list=>{for(const m of list){const t=m.target;if(m.attributeName==='hidden'||(m.type==='attributes'?t.parentElement?.matches?.(GROUPS):t.matches?.(GROUPS)||t.querySelector?.(GROUPS)))return schedule()}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','aria-selected','hidden']});
  addEventListener('resize',schedule);document.fonts?.ready.then(schedule);
  root.EcoSegment={sync:schedule};
  // Cache curto (3 s) com deduplicação: telas que pedem a mesma lista ao mesmo tempo fazem uma requisição só.
  const cache=new Map();
  // ttl 0: só junta pedidos simultâneos; o resultado não é reaproveitado depois que chega.
  function cached(url,ttl=3000){const hit=cache.get(url);if(hit&&(hit.pending||Date.now()-hit.at<ttl))return hit.promise;const entry={at:Date.now(),pending:true};entry.promise=root.EcoAuth.api(url).then(v=>{entry.pending=false;entry.at=Date.now();if(!ttl)cache.delete(url);return v},error=>{cache.delete(url);throw error});cache.set(url,entry);return entry.promise}
  const clearCache=()=>cache.clear();
  for(const name of ['eco:data-changed','eco:quotes-changed'])addEventListener(name,clearCache);
  root.EcoCache={get:cached,clear:clearCache};
  // Ícones oficiais das integrações (arquivos locais; a CSP só permite imagens do próprio servidor).
  const ICONS={'meta-ads':['int-meta.svg','Meta Ads'],meta:['int-meta.svg','Meta Ads'],'google-ads':['int-googleads-color.svg','Google Ads'],google:['int-googleads-color.svg','Google Ads'],'google-calendar':['int-googlecalendar.svg','Google Agenda'],'google-drive':['int-googledrive.svg','Google Drive'],'google-contacts':['int-contacts.svg','Google Contatos'],'heigit-routes':['int-openstreetmap.svg','Rotas · OpenStreetMap'],asaas:['int-asaas.png','Asaas'],pix:['int-pix.svg','Pix']};
  const brandIcon=(id,size='')=>ICONS[id]?`<span class="brand-chip ${size}" aria-hidden="true"><img src="assets/${ICONS[id][0]}" alt="" loading="lazy"></span>`:'';
  // Ícones das origens que não são plataformas (traço no padrão da marca) e da tag.
  const LINE={indicacao:'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 19a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0 0-6M17.5 14c2.4.5 4 2.3 4 5',organico:'M5 19c0-8 6-13 14-14-1 8-6 14-14 14zM5 19c3-4 6-6 9-8',cliente:'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',none:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8',tag:'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01'};
  const optionIcon=id=>ICONS[id]?brandIcon(id,'sm'):LINE[id]?`<svg class="opt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${LINE[id]}"/></svg>`:'';
  root.EcoIcons={brandIcon,optionIcon,label:id=>ICONS[id]?.[1]||id};
  // Cada serviço com seu ícone e sua cor, iguais no menu de filtro, no Início e em Vendas.
  // As cores são distribuídas sobre o catálogo inteiro (não só sobre o que aparece na tela), para não mudarem de uma tela para outra.
  const SVC_ICONS={sofa:'<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4H3z"/><path d="M5 17v2M19 17v2"/>',
    cadeira:'<path d="M7 3h10v8H7z"/><path d="M6 11h12v4H6zM7 15l-1 6M17 15l1 6"/>',colchao:'<rect x="3" y="8" width="18" height="9" rx="2.5"/><path d="M3 12h18M7 8v4M12 8v4M17 8v4"/>',
    tapete:'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h6v10H9z"/>',carpete:'<path d="M4 7a3 3 0 0 1 6 0v12H4z"/><path d="M10 9h10v10H7"/><circle cx="7" cy="7" r="1"/>',
    imper:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5l1.8 1.8 3.4-3.6"/>',
    cortina:'<path d="M3 3h18M5 3v18M19 3v18M5 3c3 5 3 12 0 18M19 3c-3 5-3 12 0 18"/>',persiana:'<path d="M3 3h18M5 3v15h14V3M5 7h14M5 11h14M5 15h14M12 18v3"/>',
    carro:'<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>',
    poltrona:'<path d="M6 12V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M4 12a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4z"/><path d="M6 17v2M18 17v2"/>',outro:'<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>'};
  const SVC_COLORS={sofa:'#1c7ed6',tapete:'#e8590c',carpete:'#b35c00',cortina:'#7048e8',persiana:'#9c36b5',colchao:'#0ca678',cadeira:'#f08c00',imper:'#1098ad',carro:'#e03131',poltrona:'#d6336c',outro:'#5c940d'};
  const SVC_PALETTE=['#1c7ed6','#e8590c','#7048e8','#0ca678','#f08c00','#1098ad','#e03131','#d6336c','#5c940d','#9c36b5','#b35c00','#495057'];
  const svcKey=name=>{const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return /sofa/.test(n)?'sofa':/cadeira/.test(n)?'cadeira':/colch/.test(n)?'colchao':/carpete/.test(n)?'carpete':/tapete/.test(n)?'tapete':/imperme/.test(n)?'imper':/persiana/.test(n)?'persiana':/cortina/.test(n)?'cortina':/automot|carro|banco/.test(n)?'carro':/poltrona/.test(n)?'poltrona':'outro'};
  let svcCatalog=[];
  function svcColors(names){
    const all=[...new Set([...svcCatalog,...names])],used=new Set(),out={};
    // Primeiro quem tem cor própria, depois os demais com as cores que sobraram.
    for(const n of all){const c=SVC_COLORS[svcKey(n)];if(c&&!used.has(c)){used.add(c);out[n]=c}}
    for(const n of all)if(!out[n]){const c=SVC_PALETTE.find(p=>!used.has(p))||SVC_PALETTE[all.indexOf(n)%SVC_PALETTE.length];used.add(c);out[n]=c}
    return out;
  }
  root.EcoServices={key:svcKey,icon:name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${SVC_ICONS[svcKey(name)]}</svg>`,colors:svcColors,color:name=>svcColors([name])[name],setCatalog(list){svcCatalog=[...list]}};
  // Configurações em abas: agrupa as seções existentes sem mudar seus formulários.
  const SETTINGS_TABS=[['company','Empresa'],['integrations','Integrações'],['commercial','Comercial'],['finance','Custos e financeiro'],['intelligence','Inteligência e precificação'],['data','Dados']];
  function settingsPanelOf(section){
    if(section.dataset.panel)return section.dataset.panel;
    if(section.matches('#integrations-center'))return 'integrations';
    if(section.matches('#commercial-settings'))return 'commercial';
    if(section.matches('#profit-settings-slot'))return 'intelligence';
    if(section.matches('#financial-settings-slot,#dre-settings-slot,.profit-private'))return 'finance';
    if(section.matches('.backup-card')||section.querySelector('#migrate-local'))return 'data';
    return 'company';
  }
  let settingsTab=(()=>{try{return localStorage.getItem('hc-settings-tab')}catch{return null}})()||'company';
  function showSettings(tab){
    const view=document.getElementById('settings-view'),layout=view?.querySelector('.settings-layout');if(!layout)return;settingsTab=tab;try{localStorage.setItem('hc-settings-tab',tab)}catch{}
    for(const sec of layout.children){if(sec.matches('section,.settings-card'))sec.hidden=settingsPanelOf(sec)!==tab}
    view.querySelectorAll('[data-settings-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.settingsTab===tab)));
  }
  function initSettings(){
    const view=document.getElementById('settings-view');if(!view||view.querySelector('.settings-tabs'))return;
    const layout=view.querySelector('.settings-layout');if(!layout)return;
    const bar=document.createElement('div');bar.className='seg settings-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Seções das configurações');
    bar.innerHTML=SETTINGS_TABS.map(([id,label])=>`<button type="button" role="tab" data-settings-tab="${id}" aria-selected="false">${label}</button>`).join('');
    layout.before(bar);bar.addEventListener('click',e=>{const b=e.target.closest('[data-settings-tab]');if(b)showSettings(b.dataset.settingsTab)});
    bar.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;const ids=SETTINGS_TABS.map(t=>t[0]),i=ids.indexOf(settingsTab),next=ids[(i+(e.key==='ArrowRight'?1:ids.length-1))%ids.length];showSettings(next);bar.querySelector(`[data-settings-tab="${next}"]`).focus()});
    const wizard=document.getElementById('edit-company-profile'),identity=document.getElementById('identity-slot');
    if(wizard&&identity){const card=wizard.closest('section');wizard.className='secondary';wizard.textContent='Assistente completo: cores e catálogo de serviços';const row=document.createElement('p');row.className='identity-wizard';row.append(wizard);identity.prepend(row);if(card&&card!==identity)card.remove()}
    new MutationObserver(()=>showSettings(settingsTab)).observe(layout,{childList:true});showSettings(settingsTab);paintSummary();
  }
  // Abre a aba certa e rola até a seção pedida (ex.: "Premissas financeiras" no Financeiro).
  function revealSetting(selector){const el=document.querySelector(selector);if(!el)return;const sec=el.closest('.settings-layout>*')||el;showSettings(settingsPanelOf(sec));requestAnimationFrame(()=>el.scrollIntoView({behavior:'smooth',block:'start'}))}
  // Resumo no cabeçalho: integrações ativas e o último backup exportado neste navegador.
  function paintSummary(){
    const rows=[...document.querySelectorAll('#integrations-center .int-row')],on=rows.filter(r=>r.querySelector('.int-pill.on')).length,i=document.querySelector('#sum-integrations b');
    if(i&&rows.length)i.textContent=on+' de '+rows.length;
    const b=document.querySelector('#sum-backup b');if(!b)return;let at=null;try{at=localStorage.getItem('hc-last-backup')}catch{}
    if(!at){b.textContent='nenhum neste navegador';return}const days=Math.floor((Date.now()-Date.parse(at))/86400000);b.textContent=days<=0?'hoje':days===1?'ontem':'há '+days+' dias';
  }
  addEventListener('click',e=>{if(e.target.closest?.('#backup')){try{localStorage.setItem('hc-last-backup',new Date().toISOString())}catch{}setTimeout(paintSummary)}});
  root.EcoSettings={init:initSettings,show:showSettings,reveal:revealSetting,summary:paintSummary};

  // Curva monotônica: suave sem passar dos valores reais (acumulado nunca "desce" no desenho).
  function smooth(P){
    if(P.length<2)return P.length?`M${P[0][0]} ${P[0][1]}`:'';
    const d=[],m=[];for(let i=0;i<P.length-1;i++)d.push((P[i+1][1]-P[i][1])/(P[i+1][0]-P[i][0]));
    m[0]=d[0];for(let i=1;i<P.length-1;i++)m[i]=d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2;m[P.length-1]=d.at(-1);
    for(let i=0;i<d.length;i++){if(!d[i]){m[i]=m[i+1]=0;continue}const a=m[i]/d[i],b=m[i+1]/d[i],q=a*a+b*b;if(q>9){const t=3/Math.sqrt(q);m[i]=t*a*d[i];m[i+1]=t*b*d[i]}}
    let s=`M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
    for(let i=0;i<P.length-1;i++){const h=(P[i+1][0]-P[i][0])/3;s+=` C${(P[i][0]+h).toFixed(1)} ${(P[i][1]+m[i]*h).toFixed(1)} ${(P[i+1][0]-h).toFixed(1)} ${(P[i+1][1]-m[i+1]*h).toFixed(1)} ${P[i+1][0].toFixed(1)} ${P[i+1][1].toFixed(1)}`}
    return s;
  }
  root.EcoChart={smooth};
  // Foto do cliente nas bolinhas de iniciais: some sozinha quando não há foto (204) e as iniciais aparecem.
  let avatarRev=0;
  root.EcoAvatar={
    src:(kind,id)=>'/api/'+kind+'/'+encodeURIComponent(id)+'/avatar?r='+avatarRev,
    img:(kind,id)=>'<img class="av-photo" src="'+root.EcoAvatar.src(kind,id)+'" alt="" loading="lazy" decoding="async">',
    bump(){avatarRev++}
  };
  addEventListener('error',e=>{if(e.target?.classList?.contains('av-photo'))e.target.remove()},true);
})(globalThis);
