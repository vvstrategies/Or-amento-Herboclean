(function(root){
  'use strict';
  // Pílulas deslizantes: um indicador por grupo viaja até a opção ativa, inclusive quando o grupo é redesenhado.
  const GROUPS='.seg,.dre-tabs,.dre-mode,.profit-tabs';
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
  const ICONS={'meta-ads':['int-meta.svg','Meta Ads'],meta:['int-meta.svg','Meta Ads'],'google-ads':['int-googleads.svg','Google Ads'],google:['int-googleads.svg','Google Ads'],'google-calendar':['int-googlecalendar.svg','Google Agenda'],'google-drive':['int-googledrive.svg','Google Drive'],'heigit-routes':['int-openstreetmap.svg','Rotas · OpenStreetMap'],asaas:['int-asaas.png','Asaas'],pix:['int-pix.svg','Pix']};
  const brandIcon=(id,size='')=>ICONS[id]?`<span class="brand-chip ${size}" aria-hidden="true"><img src="assets/${ICONS[id][0]}" alt="" loading="lazy"></span>`:'';
  root.EcoIcons={brandIcon,label:id=>ICONS[id]?.[1]||id};
  // Configurações em abas: agrupa as seções existentes sem mudar seus formulários.
  const SETTINGS_TABS=[['company','Empresa'],['integrations','Integrações'],['commercial','Comercial'],['finance','Custos e financeiro'],['data','Dados']];
  function settingsPanelOf(section){
    if(section.matches('#integrations-center'))return 'integrations';
    if(section.matches('#commercial-settings'))return 'commercial';
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
    new MutationObserver(()=>showSettings(settingsTab)).observe(layout,{childList:true});showSettings(settingsTab);
  }
  // Abre a aba certa e rola até a seção pedida (ex.: "Premissas financeiras" no Financeiro).
  function revealSetting(selector){const el=document.querySelector(selector);if(!el)return;const sec=el.closest('.settings-layout>*')||el;showSettings(settingsPanelOf(sec));requestAnimationFrame(()=>el.scrollIntoView({behavior:'smooth',block:'start'}))}
  root.EcoSettings={init:initSettings,show:showSettings,reveal:revealSetting};

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
})(globalThis);
