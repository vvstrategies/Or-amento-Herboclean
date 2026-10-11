(function(){
  'use strict';
  if(new URLSearchParams(location.search).has('atualizado'))history.replaceState(null,'',location.pathname+location.hash);
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],M=EcoModel,O=EcoOperations,S=EcoStore;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
  const date=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:O.timezone,day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value.length===10?value+'T12:00:00Z':value));
  const shortDate=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:O.timezone,day:'2-digit',month:'short'}).format(new Date(value));
  const notify=message=>window.EcoStudio.notify(message);
  const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',edit:'M14 4l6 6 M3 21l5-1 13-13a2.1 2.1 0 0 0-3-3L5 17z',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',calendar:'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M7 3v4 M17 3v4 M3 11h18 M7 15h2 M13 15h2',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',arrow:'M5 12h14 M14 7l5 5-5 5',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0 M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',document:'M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h6',folder:'M3 6h7l2 3h9v11H3z',shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',check:'M5 12l4 4L19 6',phone:'M7 3l3 5-3 2c1 3 4 6 7 7l2-3 5 3-1 4C10 22 2 14 3 4z',copy:'M8 8h13v13H8z M16 8V3H3v13h5',service:'M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3 M3 10h4v6h10v-6h4v9H3z M5 19v2 M19 19v2',home:'M4 4h7v8H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 14h7v6H4z',money:'M12 2.5v19 M17 6.5c-.9-1.3-2.7-2-5-2-2.9 0-4.8 1.4-4.8 3.6 0 5 9.8 2.6 9.8 7.8 0 2.2-2 3.6-5 3.6-2.5 0-4.4-.9-5.3-2.4',users:'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7 M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.5a3.5 3.5 0 0 1 0 7 M18 14a6 6 0 0 1 3.5 6',chart:'M4 20V10 M10 20V5 M16 20v-7 M21 20H3'};
  const icon=name=>`<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.document}"></path></svg>`;
  const badge=status=>`<span class="status-badge ${status}">${esc(O.statuses[status])}</span>`;
  const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'OU';
  let pipeline='generated',funnel='comercial',tagFilter='',showCancelled=false,tagList=[],clientIndex=new Map(),settled=null,lastCounts={};
  let quotes=[],operations=new Map(),documents=[],demo=false,examples=[],exampleOperations=new Map(),exampleDocs=[],selected=null,view='quotes',refreshSerial=0,viewerURL,review=null,initialized=false;
  const getQuotes=()=>demo?examples:quotes;
  const getOp=id=>O.normalize((demo?exampleOperations:operations).get(id)||{id});
  const getDocs=id=>(demo?exampleDocs:documents).filter(p=>p.proposalId===id).sort((a,b)=>b.version-a.version);
  const findQuote=id=>getQuotes().find(q=>q.id===id);
  function totals(q){try{return M.totals(q)}catch{return null}}
  function hydrateIcons(){for(const element of $$('[data-icon]'))element.innerHTML=icon(element.dataset.icon)}
  function navigate(next,update=true){
    const views=['home','quotes','clients','create','settings','finance'];
    if(!views.includes(next))next='home';view=next;
    for(const name of views){const el=$('#'+name+'-view'),show=name===next;if(show&&el.hidden){el.classList.remove('view-enter');void el.offsetWidth;el.classList.add('view-enter')}el.hidden=!show}
    for(const el of $$('.nav-item')){const active=el.dataset.nav===next;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')}
    $('#page-location').textContent={home:'Início',quotes:'Orçamentos',clients:'Clientes',create:'Novo orçamento',settings:'Configurações',finance:'Financeiro'}[next];
    const hash={home:'inicio',quotes:'orcamentos',clients:'clientes',create:'criar',settings:'configuracoes',finance:'financeiro'}[next];
    if(update&&location.hash!=='#'+hash)location.hash=hash;
    if(next==='finance')window.UniversalDre?.open();
    if(next==='quotes')refresh().catch(error=>notify(error.message));
    if(next==='home')window.EcoHome?.open();
    if(next==='clients')window.EcoClients?.open();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function fromHash(){navigate({'#orcamentos':'quotes','#clientes':'clients','#criar':'create','#configuracoes':'settings','#financeiro':'finance'}[location.hash]||'home',false)}
  async function refresh(){
    const serial=++refreshSerial;
    const [list,ops,pdfs,tags,clients]=await Promise.all([S.summaries?S.summaries():S.all('quotes'),S.all('operations'),S.all('pdfs'),EcoAuth.online?EcoCache.get('/api/tags').catch(()=>null):null,EcoAuth.online?EcoCache.get('/api/clients').catch(()=>[]):[]]);
    if(serial!==refreshSerial)return;
    tagList=tags||[{id:'corporativo',label:'CORPORATIVO'},{id:'residencial',label:'RESIDENCIAL'}];clientIndex=new Map();for(const c of clients||[])for(const id of c.proposalIds||[])clientIndex.set(id,c);if($('#nav-clients'))$('#nav-clients').textContent=(clients||[]).length;
    quotes=list.sort((a,b)=>(b.updatedAt||b.date).localeCompare(a.updatedAt||a.date));operations=new Map(ops.map(x=>[x.id,x]));documents=pdfs;
    $('#nav-count').textContent=quotes.length;renderLibrary();
  }
  function filters(){return {search:$('#search').value.trim(),status:'',scheduled:'',from:$('#date-from').value,to:$('#date-to').value}}
  const FUNNELS={
    comercial:[['generated','Gerados'],['scheduled','Agendados'],['completed','Concluídos'],['cancelled','Cancelados']],
    follow:[['f1','1º contato · D+2'],['f2','2º contato · D+7'],['f3','Última tentativa · D+15'],['lost','Perdidos']],
    pos:[['p1','Agradecimento'],['p2','Avaliação solicitada'],['p3','Indicação / recompra'],['p4','Reabordagem']]};
  const COLORS={generated:'color-mix(in srgb,var(--r-primary) 22%,#fff)',scheduled:'color-mix(in srgb,var(--r-primary) 50%,#fff)',completed:'var(--r-primary)',cancelled:'#e7b3ab',f1:'color-mix(in srgb,var(--r-primary) 22%,#fff)',f2:'color-mix(in srgb,var(--r-primary) 50%,#fff)',f3:'#e0b54a',lost:'#e7b3ab',p1:'var(--r-accent)',p2:'color-mix(in srgb,var(--r-primary) 50%,#fff)',p3:'var(--r-primary)',p4:'#8a6fd1'};
  const dayMs=86400000,todayISO=()=>O.localDate();
  const daysSince=day=>day?Math.floor((Date.parse(todayISO()+'T12:00:00Z')-Date.parse(day.slice(0,10)+'T12:00:00Z'))/dayMs):0;
  const ddmm=day=>day?day.slice(8,10)+'/'+day.slice(5,7):'';
  function upcomingBirthday(c){if(!c?.birthday)return null;const t=todayISO(),y=+t.slice(0,4);for(const year of [y,y+1]){const d=year+'-'+c.birthday;const n=-daysSince(d);if(n>=0&&n<=30)return {days:n,label:c.birthday.slice(3)+'/'+c.birthday.slice(0,2)}}return null}
  function stageOf(q,op){
    if(funnel==='comercial')return op.status;
    if(funnel==='follow'){if(op.status!=='generated')return null;const manual=op.crm?.follow?.stage;if(manual)return manual;const age=daysSince(q.date);return age<2?null:age<7?'f1':age<15?'f2':'f3'}
    if(op.status!=='completed')return null;const manual=op.crm?.pos?.stage;if(manual)return manual;const done=op.serviceCompletedAt||op.completionRecordedAt?.slice(0,10);if(daysSince(done)>=180||upcomingBirthday(clientIndex.get(q.id)))return 'p4';return daysSince(done)>=3?'p2':'p1';
  }
  function tagLabel(id){return tagList.find(t=>t.id===id)?.label||id.toUpperCase()}
  function tagClass(id){const i=tagList.findIndex(t=>t.id===id);return 't'+(i<0?3:Math.min(i,3))}
  function cardMeta(q,op,stage){
    const schedule=op.schedule;
    if(funnel==='comercial'){
      if(schedule&&['generated','scheduled'].includes(op.status)){const planned=`${shortDate(schedule.start)} · ${O.time(schedule.start)}`;return `<span class="kc-meta ${schedule.sync==='pending'?'pending':''}"><b>${esc(schedule.sync==='pending'?'Pré-agendado · ':'')}${esc(planned)}</b></span>`}
      if(op.status==='completed')return `<span class="kc-meta">Concluído ${esc(ddmm(op.serviceCompletedAt||''))}</span>`;
      return `<span class="kc-meta">${date(q.date)}</span>`;
    }
    if(funnel==='follow'){if(stage==='lost')return `<span class="kc-meta">${esc(op.crm?.follow?.note||'Perdido')}</span>`;return `<span class="kc-meta">Gerado ${esc(ddmm(q.date))}</span>`}
    const bd=upcomingBirthday(clientIndex.get(q.id));if(stage==='p4'&&bd)return `<span class="kc-meta"><b>🎂 ${esc(bd.label)}</b></span>`;
    return `<span class="kc-meta">Concluído ${esc(ddmm(op.serviceCompletedAt||''))}</span>`;
  }
  function cardAlert(q,op,stage){
    if(funnel==='follow'&&stage!=='lost'){const age=daysSince(q.date);if(age>=2)return `<span class="kc-alert">Sem resposta há ${age} dias</span>`}
    if(funnel==='pos'&&stage==='p4'){const bd=upcomingBirthday(clientIndex.get(q.id));if(bd)return `<span class="kc-alert">${bd.days===0?'Aniversário hoje':'Aniversário em '+bd.days+' dia'+(bd.days>1?'s':'')}</span>`;const done=op.serviceCompletedAt;if(done&&daysSince(done)>=180)return `<span class="kc-alert">${Math.floor(daysSince(done)/30)} meses desde o serviço</span>`}
    if(funnel==='comercial'&&op.pendingAction)return `<span class="kc-alert">Agendamento pendente</span>`;
    if(funnel==='comercial'&&op.status==='scheduled'&&op.schedule&&Date.parse(op.schedule.end)<Date.now())return `<span class="kc-alert due">Horário passou · arraste para Concluídos</span>`;
    return '';
  }
  function card(q,stage){
    const op=getOp(q.id),t=totals(q),photos=q.items.reduce((n,i)=>n+(i.photoCount??i.photos?.length??0),0),place=q.addressNeighborhood||q.addressCity||q.address||'Endereço não informado';
    return `<article class="proposal-card${q.id===settled?' settle':''}" tabindex="0" role="button" data-detail="${esc(q.id)}" data-stage="${esc(stage)}" aria-label="Abrir orçamento de ${esc(q.client||'cliente não informado')}. Alt e setas movem de etapa."><span class="kc-h"><span class="kc-av">${esc(initials(q.client||'?'))}</span><span class="kc-nm"><b>${esc(q.client||'Cliente não informado')}</b><span>${esc(place)}</span></span></span>${(q.tags||[]).length?`<span class="kc-tags">${q.tags.map(id=>`<span class="tag ${tagClass(id)}">${esc(tagLabel(id))}</span>`).join('')}</span>`:''}<span class="kc-svc">${esc(O.summary(q))}${photos?`<small>${photos} foto${photos>1?'s':''}</small>`:''}</span>${cardAlert(q,op,stage)}<span class="kc-f"><span class="kc-v"><small>VALOR NO PIX</small>${t?money(t.pix):'Revisar valores'}</span>${cardMeta(q,op,stage)}</span></article>`;
  }
  function visible(){
    const all=getQuotes(),f=filters(),invalid=f.from&&f.to&&f.from>f.to;
    $('#filter-error').hidden=!invalid;$('#filter-error').textContent=invalid?'A data inicial deve ser anterior ou igual à data final.':'';
    if(invalid)return [];
    return all.filter(q=>{const op=getOp(q.id);return O.matches(q,op,{...f,status:op.status})&&(!tagFilter||(tagFilter==='__none'?!(q.tags||[]).length:(q.tags||[]).includes(tagFilter)))});
  }
  function renderLibrary(){
    const all=getQuotes(),list=visible();
    $('#demo-banner').hidden=!demo;$('#show-demo').hidden=demo;
    const counts={comercial:list.filter(q=>getOp(q.id).status!=='cancelled').length,follow:0,pos:0},saved=funnel;
    for(const name of ['follow','pos']){funnel=name;counts[name]=list.filter(q=>stageOf(q,getOp(q.id))).length}funnel=saved;
    for(const name of ['comercial','follow','pos'])$('#count-'+name).textContent=counts[name];
    $('#tag-filter').innerHTML=[['','Todas'],...tagList.map(t=>[t.id,t.label.charAt(0)+t.label.slice(1).toLowerCase()]),...(all.some(q=>!(q.tags||[]).length)?[['__none','Sem tag']]:[])].map(([id,label])=>`<button type="button" data-tag-filter="${esc(id)}" aria-pressed="${tagFilter===id}">${esc(label)}</button>`).join('');
    $('#show-cancelled').hidden=funnel!=='comercial';$('#show-cancelled').setAttribute('aria-pressed',String(showCancelled));
    const cols=FUNNELS[funnel].filter(([id])=>id!=='cancelled'||showCancelled);
    if(!all.length){$('#board').innerHTML=`<div class="empty-library"><span class="feature-icon">${icon('folder')}</span><h3>Seu próximo atendimento começa aqui.</h3><p>Crie sua primeira proposta com a identidade da empresa. Depois, acompanhe a aprovação e prepare o atendimento por aqui.</p><div class="empty-actions"><button class="primary" data-new>＋ Criar orçamento</button><button class="secondary" data-demo>Explorar exemplos</button></div></div>`;$('#library-count-note').textContent='';return}
    $('#board').innerHTML=cols.map(([id,label])=>{const cards=list.filter(q=>stageOf(q,getOp(q.id))===id),sum=cards.reduce((n,q)=>n+(totals(q)?.pix||0),0);
      return `<section class="kcol" data-col="${id}" aria-label="${esc(label)}"><div class="kcol-head"><div class="t"><i class="dot" style="background:${COLORS[id]}"></i>${esc(label)}<span class="c${lastCounts[funnel+id]!==undefined&&lastCounts[funnel+id]!==cards.length?' bump':''}">${cards.length}</span></div><div class="sum">${money(sum)}<small>no PIX</small></div></div><div class="kcol-body">${cards.map(q=>card(q,id)).join('')||'<p class="kcol-empty">Nenhum orçamento nesta etapa</p>'}</div></section>`}).join('');
    for(const [id] of cols)lastCounts[funnel+id]=list.filter(q=>stageOf(q,getOp(q.id))===id).length;settled=null;
    const shown=list.filter(q=>cols.some(([id])=>stageOf(q,getOp(q.id))===id)).length;$('#library-count-note').textContent=`${shown} orçamento${shown===1?'':'s'} neste funil · ${all.length} no total${demo?' (demonstração)':''}`;
  }
  // Regras de movimentação entre colunas do funil comercial seguem o fluxo operacional.
  function moveRule(q,to){
    const op=getOp(q.id),from=stageOf(q,op);if(from===to)return {ok:false,silent:true};
    if(funnel!=='comercial')return {ok:true};
    if(from==='generated'&&to==='scheduled')return {ok:true,action:'schedule'};
    if(from==='scheduled'&&to==='completed')return op.schedule&&Date.parse(op.schedule.end)<=Date.now()?{ok:true,action:'complete'}:{ok:false,message:'Só dá para concluir depois do horário agendado.'};
    if(from==='generated'&&to==='cancelled')return op.schedule?{ok:false,message:'Cancele o agendamento antes de cancelar o orçamento.'}:{ok:true,action:'cancel'};
    if(from==='cancelled'&&to==='generated')return {ok:true,action:'reopen'};
    if(from==='completed')return {ok:false,message:'Atendimento concluído não volta de etapa.'};
    if(from==='scheduled'&&to==='generated')return {ok:false,message:'Use Cancelar agendamento no detalhe do orçamento.'};
    return {ok:false,message:'Esse movimento não é permitido.'};
  }
  async function moveCard(id,to){
    const q=await hydrate(id);if(!q)return;const rule=moveRule(q,to);
    if(!rule.ok){if(!rule.silent)notify(rule.message);return}
    selected=id;
    if(funnel!=='comercial'){
      const name=funnel==='follow'?'follow':'pos';
      const save=async note=>{if(demo){const raw=exampleOperations.get(id)||{id,status:'generated'};exampleOperations.set(id,{...raw,crm:{...(raw.crm||{}),[name]:{stage:to,note:note||'',updatedAt:new Date().toISOString()}}});renderLibrary()}else{await EcoAuth.api('/api/proposals/'+encodeURIComponent(id)+'/crm',{method:'POST',body:JSON.stringify({funnel:name,stage:to,note})});await refresh()}notify('Orçamento movido para '+FUNNELS[funnel].find(c=>c[0]===to)[1]+'.')};
      if(to==='lost'){$('#stage-note').value='';$('#stage-dialog').showModal();$('#stage-form').onsubmit=e=>{e.preventDefault();const note=$('#stage-note').value.trim();if(!note)return;busy($('#stage-save'),'Salvando...',async()=>{await save(note);$('#stage-dialog').close()})};return}
      return save('');
    }
    if(rule.action==='schedule')return openSchedule();
    if(rule.action==='complete'){if(demo)return mutate(id,raw=>O.changeStatus(raw,'completed'));return window.UniversalDre.complete(id,getOp(id),async()=>{await refresh()})}
    if(rule.action==='cancel')return confirmAction('Cancelar orçamento',`A proposta de ${q.client} e seus PDFs serão preservados no histórico.`,'Cancelar orçamento',async()=>{await mutate(id,raw=>O.changeStatus(raw,'cancelled'));notify('Orçamento cancelado.')});
    if(rule.action==='reopen')return confirmAction('Reabrir orçamento','A proposta voltará a aguardar a confirmação do cliente.','Reabrir orçamento',async()=>{await mutate(id,raw=>O.changeStatus(raw,'generated'));notify('Orçamento reaberto.')});
  }
  // Arrastar com eventos de ponteiro: mouse começa após 6 px, toque após segurar 260 ms; funciona igual em qualquer navegador.
  function bindBoard(){
    const board=$('#board');let drag=null,frame=0,blockClick=false;
    const columnAt=(x,y)=>document.elementFromPoint(x,y)?.closest?.('#board .kcol')||null;
    const clear=()=>$$('#board .kcol').forEach(c=>c.classList.remove('over','deny'));
    function mark(col){
      for(const c of $$('#board .kcol'))if(c!==col)c.classList.remove('over','deny');
      drag.target=col;if(!col)return;const q=findQuote(drag.id),rule=q?moveRule(q,col.dataset.col):{ok:false};
      col.classList.toggle('over',rule.ok);col.classList.toggle('deny',!rule.ok&&!rule.silent);
    }
    function start(){
      const r=drag.card.getBoundingClientRect(),ghost=drag.card.cloneNode(true);
      ghost.className='proposal-card kc-ghost';ghost.removeAttribute('tabindex');ghost.setAttribute('aria-hidden','true');ghost.style.width=r.width+'px';
      drag.dx=drag.x-r.left;drag.dy=drag.y-r.top;drag.ghost=ghost;drag.active=true;document.body.append(ghost);place();
      drag.card.classList.add('dragging');document.body.classList.add('kanban-dragging');navigator.vibrate?.(8);frame=requestAnimationFrame(tick);
    }
    function place(){drag.ghost.style.left=(drag.x-drag.dx)+'px';drag.ghost.style.top=(drag.y-drag.dy)+'px'}
    function tick(){
      if(!drag?.active)return;const b=board.getBoundingClientRect(),edge=48;
      if(drag.x<b.left+edge)board.scrollLeft-=14;else if(drag.x>b.right-edge)board.scrollLeft+=14;
      const body=drag.target?.querySelector('.kcol-body');if(body){const r=body.getBoundingClientRect();if(drag.y<r.top+edge)body.scrollTop-=10;else if(drag.y>r.bottom-edge)body.scrollTop+=10}
      frame=requestAnimationFrame(tick);
    }
    function finish(drop){
      if(!drag)return;const d=drag;drag=null;clearTimeout(d.timer);cancelAnimationFrame(frame);
      if(!d.active)return;blockClick=true;setTimeout(()=>blockClick=false);
      d.ghost.remove();d.card.classList.remove('dragging');document.body.classList.remove('kanban-dragging');clear();
      if(drop&&d.target){settled=d.id;moveCard(d.id,d.target.dataset.col).catch(error=>notify(error.message))}
    }
    board.addEventListener('pointerdown',e=>{
      const c=e.target.closest('.proposal-card');if(!c||e.button!==0||c.classList.contains('kc-ghost'))return;
      drag={id:c.dataset.detail,card:c,x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,touch:e.pointerType!=='mouse',active:false};
      if(drag.touch)drag.timer=setTimeout(()=>{if(drag&&!drag.active)start()},260);
    });
    document.addEventListener('pointermove',e=>{
      if(!drag)return;drag.x=e.clientX;drag.y=e.clientY;const moved=Math.hypot(drag.x-drag.x0,drag.y-drag.y0);
      if(!drag.active){if(drag.touch){if(moved>8){clearTimeout(drag.timer);drag=null}}else if(moved>6)start();return}
      e.preventDefault();place();mark(columnAt(drag.x,drag.y));
    });
    document.addEventListener('touchmove',e=>{if(drag?.active)e.preventDefault()},{passive:false});
    document.addEventListener('pointerup',()=>finish(true));
    document.addEventListener('pointercancel',()=>finish(false));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag?.active){e.preventDefault();finish(false)}});
    board.addEventListener('contextmenu',e=>{if(e.target.closest('.proposal-card')&&e.pointerType!=='mouse')e.preventDefault()});
    board.addEventListener('click',e=>{if(blockClick&&e.target.closest('.proposal-card')){e.stopPropagation();e.preventDefault()}},true);
    board.addEventListener('keydown',e=>{
      const c=e.target.closest('.proposal-card');if(!c||e.target!==c)return;
      if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(c.dataset.detail).catch(error=>notify(error.message));return}
      if(e.altKey&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){
        e.preventDefault();const ids=[...$$('#board .kcol')].map(col=>col.dataset.col),i=ids.indexOf(c.dataset.stage),to=ids[i+(e.key==='ArrowRight'?1:-1)];
        if(to){settled=c.dataset.detail;moveCard(c.dataset.detail,to).then(()=>$(`#board .proposal-card[data-detail="${CSS.escape(c.dataset.detail)}"]`)?.focus()).catch(error=>notify(error.message))}
      }
    });
  }
  function contactLinks(contact){
    const digits=String(contact||'').replace(/\D/g,''),phone=/^[\d\s()+-]+$/.test(contact||'')&&digits.length>=10&&digits.length<=13;
    const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact||'');
    return `${phone?`<a class="quick-link" href="tel:${digits}">${icon('phone')}Ligar</a><a class="quick-link" href="https://wa.me/${digits.length<=11?'55':''}${digits}" target="_blank" rel="noopener">WhatsApp</a>`:''}${email?`<a class="quick-link" href="mailto:${encodeURIComponent(contact)}">Enviar e-mail</a>`:''}${contact?`<button class="quick-link" data-copy-contact>${icon('copy')}Copiar contato</button>`:''}`;
  }
  // A lista do kanban vem sem fotos; antes de abrir o detalhe ou agir no orçamento, troca pelo orçamento completo.
  async function hydrate(id){
    const q=findQuote(id);if(!q||demo||!EcoAuth.online||q.items.every(i=>Array.isArray(i.photos)))return q;
    const full=await S.get('quotes',id),i=quotes.findIndex(x=>x.id===id);if(i>=0)quotes[i]=full;return full;
  }
  let detailOpener=null;
  async function openDetail(id){selected=id;detailOpener=document.activeElement;await hydrate(id);await renderDetail();if(!$('#detail-dialog').open)$('#detail-dialog').showModal()}
  async function renderDetail(){
    const id=selected,q=findQuote(id);if(!q){$('#detail-content').innerHTML='<p class="drawer-empty">Orçamento não encontrado.</p>';$('#detail-actions').innerHTML='';return}
    const op=getOp(id),t=totals(q),schedule=op.schedule;let pdfs=getDocs(id),latest=pdfs[0],hash=latest?await S.fingerprint(q):'';const proposalVersions=demo?[]:await EcoAuth.api('/api/proposals/'+encodeURIComponent(id)+'/versions').catch(()=>[]);if(id!==selected)return;
    if(latest&&latest.fingerprint!==hash&&!demo&&op.status==='generated'){try{const refreshed=await EcoAuth.api('/api/proposals/'+encodeURIComponent(id)+'/document/refresh',{method:'POST'});documents=[refreshed,...documents.filter(pdf=>pdf.id!==refreshed.id)];pdfs=getDocs(id);latest=pdfs[0];hash=latest?await S.fingerprint(q):'';}catch{}}
    if(id!==selected)return;const outdated=latest&&latest.fingerprint!==hash;
    const until=new Date(q.date+'T12:00:00Z');until.setUTCDate(until.getUTCDate()+Number(q.terms.validity));
    $('#detail-content').innerHTML=`<div class="detail-body"><div class="detail-heading"><div><span class="detail-meta">${esc(q.number)} · ${date(q.date)}</span><h2 id="detail-title">${esc(q.client||'Cliente não informado')}</h2><div class="detail-status">${badge(op.status)}${demo?'<span class="demo-tag">Exemplo fictício</span>':''}</div></div><div class="client-avatar">${esc(initials(q.client))}</div></div><div><span class="detail-label">ENDEREÇO DO ATENDIMENTO</span><p class="detail-address">${esc(q.address||'Não informado')}</p><span class="detail-label">CONTATO</span><p class="detail-address">${esc(q.clientContact||'Não informado')}</p><div class="quick-links">${q.address?`<a class="quick-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.address)}" target="_blank" rel="noopener">${icon('pin')}Abrir no mapa</a>`:''}${contactLinks(q.clientContact)}</div></div><section class="detail-section"><h3>Serviços <span class="detail-meta">(${q.items.length})</span></h3>${q.items.map((item,i)=>`<div class="detail-service"><div><strong>${esc(item.service)}</strong><p>${esc(item.description)}</p></div><div class="item-pricing">${t?money(t.rows[i]):'Revisar'}<small>${Number(item.quantity).toLocaleString('pt-BR')} ${esc(item.unit)} × ${money(Math.round(Number(item.price)*100))}</small></div>${item.photos.length?`<div class="detail-photos">${item.photos.map((photo,p)=>`<button type="button" class="photo-button" data-view-photo="${i}:${p}" aria-label="Ampliar foto ${p+1} de ${esc(item.service)}"><img src="${photo}" alt="${esc(item.service)}"></button>`).join('')}</div>`:''}</div>`).join('')}</section><section class="detail-section"><h3>Condições da proposta</h3>${t?`<div class="detail-prices"><div class="detail-price"><span class="detail-label">VALOR NO PIX</span><strong>${money(t.pix)}</strong><small>Pagamento à vista</small></div><div class="detail-price"><span class="detail-label">CARTÃO DE CRÉDITO</span><strong>${t.count}x ${money(t.part)}</strong><small>Sem juros · Total ${money(t.total)}</small></div></div>`:'<p class="inline-error">Revise os valores no editor.</p>'}${q.terms.notes?`<p class="detail-notes">${esc(q.terms.notes)}</p>`:''}<p class="detail-validity">Validade de ${q.terms.validity} dias · até ${date(until.toISOString())}</p></section><section class="detail-section"><h3>Documento</h3>${pdfs.length?`${outdated?'<p class="version-note">O orçamento foi editado após a última versão do PDF. O documento guardado continua intacto; gere uma nova versão para incluir as alterações.</p>':''}${pdfs.map((p,i)=>`<div class="pdf-version"><span class="feature-icon">${icon('document')}</span><div><strong>Proposta · versão ${p.version}${i===0?' · mais recente':''}</strong><small>Gerada em ${date(p.generatedAt)} às ${O.time(p.generatedAt)}</small></div><span class="pdf-version-actions"><button class="text-button" data-view-pdf="${esc(p.id)}">Visualizar</button><button class="text-button" data-download-pdf="${esc(p.id)}">Baixar</button></span></div>`).join('')}<button class="text-button" data-generate-pdf>Gerar nova versão do PDF</button>`:'<div class="document-empty"><p>Nenhum PDF guardado para este orçamento.</p><button class="secondary" data-generate-pdf>Gerar e guardar PDF</button></div>'}</section><section class="detail-section"><h3>Agendamento</h3>${op.pendingAction?`<p class="version-note">${esc(op.pendingAction.error||'Operação em andamento. Aguarde antes de tentar novamente.')} A nova tentativa recupera o mesmo evento.<button class="text-button" data-cancel-schedule>Cancelar tentativa e remover evento</button></p>`:''}<div class="detail-schedule">${schedule?`<span class="schedule-label">${schedule.sync==='pending'?'PRÉ-AGENDAMENTO LOCAL · PENDENTE DE ENVIO':demo?'AGENDAMENTO DE DEMONSTRAÇÃO':'GOOGLE AGENDA'}</span><strong>${date(schedule.start)} · ${O.time(schedule.start)} às ${O.time(schedule.end)}</strong><p>${Math.round((Date.parse(schedule.end)-Date.parse(schedule.start))/60000)} minutos · Horário de Brasília</p>${schedule.sync==='pending'?'<p class="schedule-warning">O Google ainda não está conectado. Nenhum evento foi criado e o orçamento permanece aprovado.</p>':''}${safeEventURL(schedule.eventUrl)?`<a class="quick-link" target="_blank" rel="noopener" href="${esc(schedule.eventUrl)}">Abrir evento no Google Agenda ↗</a>`:''}`:`<strong>${op.status==='generated'?'Aguardando a confirmação do cliente':op.status==='approved'?'Vamos preparar o atendimento?':'Sem agendamento'}</strong><p>${op.status==='generated'?'Use Aprovar e agendar para confirmar o atendimento em uma única ação.':'As informações do orçamento preenchem o agendamento automaticamente.'}</p>`}</div></section></div>`;
    if(proposalVersions.length){
      const history=document.createElement('section');history.className='detail-section version-history';
      const editableVersions=!['scheduled','completed'].includes(op.status);
      history.innerHTML=`<h3>Histórico de versões</h3><p class="detail-history-note">A versão atual é usada nos valores e cálculos deste atendimento.</p>${proposalVersions.map(version=>{const quote=version.snapshot,amount=totals(quote),docs=pdfs.filter(document=>document.proposalVersionId===version.id),document=docs[0];return `<div class="pdf-version proposal-version"><span class="feature-icon">${icon('document')}</span><div><strong>Versão ${version.sequence}${version.current?' · Atual':''}</strong><small>${date(version.createdAt)} · ${amount?money(amount.pix):'Valores a revisar'}${document?' · PDF disponível':' · PDF não gerado'}</small></div><span class="pdf-version-actions">${document?`<button class="text-button" data-view-pdf="${esc(document.id)}">Visualizar</button><button class="text-button" data-download-pdf="${esc(document.id)}">Baixar</button>`:''}${editableVersions?`<button class="text-button danger" data-delete-version="${esc(version.id)}">Excluir</button>`:''}</span></div>`;}).join('')}${editableVersions?'':'<p class="version-note">O atendimento está agendado ou concluído. As versões foram preservadas para manter o histórico operacional e o evento no Google Agenda.</p>'}`;
      const documentSection=[...$('#detail-content .detail-body').querySelectorAll('.detail-section')].find(section=>section.querySelector('h3')?.textContent==='Documento');documentSection?.before(history);
    }
    const financeSlot=document.createElement('section');financeSlot.className='detail-section finance-detail';$('#detail-content .detail-body').appendChild(financeSlot);window.UniversalFinance?.mount(financeSlot,q,{demo});
    const profitSlot=document.createElement('section');profitSlot.className='detail-section';financeSlot.after(profitSlot);window.UniversalProfit?.mount(profitSlot,q,{demo});
    const paymentSlot=document.createElement('section');paymentSlot.className='detail-section';profitSlot.after(paymentSlot);window.HerbocleanAsaas?.mount(paymentSlot,q,{demo});
    const actions=[];
    actions.push(`<button class="secondary" data-edit>${demo?'Ver gerador':'Editar orçamento'}</button>`);
    
    if(['generated','scheduled'].includes(op.status))actions.push(`<button class="primary" data-schedule>${schedule?'Reagendar':'Aprovar e agendar'}</button>`);
    if(schedule&&['generated','scheduled'].includes(op.status)&&Date.parse(schedule.end)<=Date.now())actions.push('<button class="primary" data-status="completed">Marcar como concluído</button>');
    if(schedule&&['generated','scheduled'].includes(op.status))actions.push('<button class="text-button" data-cancel-schedule>Cancelar agendamento</button>');
    if(!schedule&&['generated'].includes(op.status))actions.push('<button class="text-button danger" data-status="cancelled">Cancelar orçamento</button>');
    if(op.status==='cancelled')actions.push('<button class="text-button" data-status="generated">Reabrir orçamento</button>');
    if(!demo&&['cancelled','completed'].includes(op.status))actions.push('<button class="text-button danger" data-delete-permanently>Excluir definitivamente</button>');
    $('#detail-actions').innerHTML=actions.join('');
  }
  function safeEventURL(value){try{const url=new URL(value);return url.protocol==='https:'&&['calendar.google.com','www.google.com'].includes(url.hostname)}catch{return false}}
  async function mutate(id,fn){
    if(demo){const next=fn(exampleOperations.get(id)||{id,status:'generated'});exampleOperations.set(id,{...next,updatedAt:new Date().toISOString()});renderLibrary()}
    else {await S.mutateOperation(id,fn);await refresh()}
    await renderDetail();
  }
  async function busy(button,label,action){
    if(button.disabled)return;const old=button.innerHTML;button.disabled=true;button.textContent=label;
    try{return await action()}catch(error){notify(error.message)}finally{button.disabled=false;button.innerHTML=old}
  }
  function confirmAction(title,description,label,action){
    $('#confirm-title').textContent=title;$('#confirm-description').textContent=description;$('#confirm-action').textContent=label;
    $('#confirm-action').onclick=()=>busy($('#confirm-action'),'Salvando...',async()=>{await action();$('#confirm-dialog').close()});
    $('#confirm-dialog').showModal();
  }
  function openSchedule(){
    const q=findQuote(selected),op=getOp(selected);if(!q)return;
    if(!['generated','scheduled'].includes(op.status))return;
    const prior=op.pendingAction?.values||op.schedule||op.suggestedSchedule;
    review=null;$('#schedule-form').hidden=false;$('#schedule-review').hidden=true;$('#schedule-error').hidden=true;
    $('#schedule-title').textContent=op.schedule?'Reagendar serviço':'Aprovar e agendar';
    $('#schedule-context').innerHTML=`<div class="schedule-context"><strong>${esc(q.client)}</strong><p>${esc(q.address)}</p><p>${esc(O.summary(q))}</p><p>${esc(q.clientContact||'Contato não informado')}</p><div class="schedule-context-value"><span>${esc(q.number)}</span><b>${totals(q)?money(totals(q).pix):'Revisar valores'} no PIX</b></div></div>`;
    $('#schedule-date').min=O.localDate();$('#schedule-date').value=prior?O.localDate(new Date(prior.start)):'';
    $('#schedule-time').value=prior?O.time(prior.start):'09:00';
    const minutes=prior?Math.round((Date.parse(prior.end)-Date.parse(prior.start))/60000):120;
    const known=[60,90,120,180,240,360,480].includes(minutes);
    $('#schedule-duration').value=known?String(minutes):'custom';$('#schedule-custom').value=minutes;$('#custom-duration-label').hidden=known;
    $('#schedule-dialog').showModal();
  }
  function reviewSchedule(e){
    e.preventDefault();
    try{
      const q=findQuote(selected),op=getOp(selected),dateValue=$('#schedule-date').value,timeValue=$('#schedule-time').value,duration=$('#schedule-duration').value==='custom'?$('#schedule-custom').value:$('#schedule-duration').value;
      const values=O.scheduleInput(dateValue,timeValue,duration),t=totals(q);if(!t)throw Error('Confira os valores do orçamento antes de agendar.');
      review={key:crypto.randomUUID(),proposalId:q.id,values,dateValue,timeValue,duration,operationVersion:op.updatedAt||'',quoteUpdatedAt:q.updatedAt,wasDemo:demo};
      $('#schedule-form').hidden=true;$('#schedule-review').hidden=false;
      $('#schedule-review').innerHTML=`<h3 class="review-heading">Confira antes de confirmar.</h3><dl class="review-data"><div><dt>Cliente</dt><dd>${esc(q.client)}</dd></div><div><dt>Quando</dt><dd>${date(values.start)} · ${O.time(values.start)} às ${O.time(values.end)}<br>Horário de Brasília</dd></div><div><dt>Endereço</dt><dd>${esc(q.address)}</dd></div><div><dt>Serviços</dt><dd>${q.items.map(it=>`${Number(it.quantity).toLocaleString('pt-BR')} ${esc(it.unit)} · ${esc(it.service)}`).join('<br>')}</dd></div><div><dt>Valor PIX</dt><dd>${money(t.pix)}</dd></div><div><dt>Documento</dt><dd>${getDocs(q.id).length?'PDF disponível na biblioteca':'PDF ainda não gerado'}</dd></div></dl><p class="review-notice">${demo?'Demonstração: a confirmação altera apenas estes exemplos fictícios.':'Ao confirmar, a proposta será aprovada e agendada no Google Agenda, com o PDF anexado pelo Drive.'}<br>Nenhum convite será enviado ao cliente.</p><div class="review-actions"><button class="secondary" id="review-back">Ajustar</button><button class="primary" id="confirm-schedule">${demo?'Confirmar simulação':'Confirmar aprovação e agendamento'}</button></div>`;
      $('#review-back').onclick=()=>{$('#schedule-review').hidden=true;$('#schedule-form').hidden=false;review=null};
      $('#confirm-schedule').onclick=()=>busy($('#confirm-schedule'),'Salvando...',commitSchedule);
    }catch(error){$('#schedule-error').hidden=false;$('#schedule-error').textContent=error.message}
  }
  async function commitSchedule(){
    if(!review)return;const checked=review,q=findQuote(checked.proposalId);
    if(!q||q.updatedAt!==checked.quoteUpdatedAt||demo!==checked.wasDemo)throw Error('O orçamento mudou. Feche o agendamento e revise novamente.');
    const values=O.scheduleInput(checked.dateValue,checked.timeValue,checked.duration);
    if(demo)await mutate(q.id,raw=>({...raw,status:'scheduled',schedule:{id:raw.schedule?.id||crypto.randomUUID(),...values,sync:'confirmed'}}));
    else {
      if(!EcoAuth.online)throw Error('Abra http://localhost:3000 para conectar o Google e confirmar o agendamento.');
      try{await EcoAuth.api('/api/proposals/'+q.id+'/schedule',{method:'POST',body:JSON.stringify({key:checked.key,date:checked.dateValue,time:checked.timeValue,duration:checked.duration,revision:q.revision})});}finally{await refresh();await renderDetail()}
    }
    review=null;$('#schedule-dialog').close();funnel='comercial';syncPipelines();renderLibrary();notify(demo?'Agendamento simulado. Nenhum evento foi enviado.':'Proposta aprovada e evento confirmado no Google Agenda.');
  }

  async function generateFromDetail(button){
    const q=findQuote(selected);if(!q)return;
    await busy(button,'Gerando PDF...',async()=>{
      if(demo){const blob=await EcoCreatePDFBlob(q);exampleDocs.push({id:crypto.randomUUID(),proposalId:q.id,version:getDocs(q.id).length+1,filename:M.proposalFilename(q),generatedAt:new Date().toISOString(),fingerprint:await S.fingerprint(q),blob,snapshot:structuredClone(q)})}
      else await EcoStudio.generatePDF(q,true);
      await refresh();await renderDetail();notify('PDF pronto. A versão foi guardada junto ao orçamento.');
    });
  }
  function documentById(id){return (demo?exampleDocs:documents).find(p=>p.id===id)}
  async function showPDF(id){
    const document=documentById(id);if(!document)return notify('Documento não encontrado.');
    if(viewerURL)URL.revokeObjectURL(viewerURL);viewerURL=URL.createObjectURL(document.blob||await S.blob(document));
    $('#pdf-view-title').textContent=`${document.snapshot.number} · versão ${document.version}`;
    $('#pdf-view-actions').innerHTML=`<span>Documento guardado em ${date(document.generatedAt)}</span><button class="secondary" data-download-pdf="${esc(id)}">Baixar PDF</button><a href="${viewerURL}" target="_blank" rel="noopener">Abrir em outra aba ↗</a>`;
    $('#pdf-frame').src=viewerURL;$('#pdf-dialog').showModal();
  }
  function clearFilters(){for(const id of ['search','date-from','date-to'])$('#'+id).value='';tagFilter='';renderLibrary()}
  function makeExamples(){
    if(examples.length)return;
    const today=new Date(O.localDate()+'T12:00:00Z');
    const settings=window.EcoStudio.getDraft();
    const configurations=Array.from({length:9},(_,i)=>['Cliente exemplo '+(i+1),'Endereço de demonstração',M.services[i%M.services.length].name,i+1,100,['generated','generated','scheduled','generated','completed','cancelled','scheduled','scheduled','generated'][i],[null,null,2,null,-3,null,4,1,null][i]]);
    examples=configurations.map(([name,city,service,quantity,price,status,offset],i)=>{
      const q=M.quote(settings);q.id='demo-'+i;q.number='ORC-EXEMPLO-'+String(i+1).padStart(3,'0');q.client=name;q.address=`Rua de exemplo, ${120+i*30} · ${city}`;q.clientContact='Contato de demonstração';
      const issued=new Date(today);issued.setUTCDate(issued.getUTCDate()-i);q.date=issued.toISOString().slice(0,10);q.updatedAt=issued.toISOString();q.items=[{...M.item(service),quantity,price}];
      if([0,7].includes(i))q.items.push({...M.item(M.services[(i+1)%M.services.length].name),quantity:1,price:190});
      const op={id:q.id,status,schedule:null,updatedAt:today.toISOString()};
      if(offset!==null){const start=new Date(today);start.setUTCDate(start.getUTCDate()+offset);start.setUTCHours(i===7?17:12,0,0,0);op.schedule={id:'demo-schedule-'+i,start:start.toISOString(),end:new Date(start.getTime()+2*3600000).toISOString(),timezone:O.timezone,sync:'confirmed',eventId:null,eventUrl:null}}
      exampleOperations.set(q.id,op);return q;
    });
  }
  function enterDemo(){makeExamples();demo=true;selected=null;clearFilters();navigate('quotes');renderLibrary()}
  function exitDemo(){demo=false;selected=null;if($('#detail-dialog').open)$('#detail-dialog').close();clearFilters();renderLibrary()}
  async function onClick(e){
    const button=e.target.closest('button,.proposal-card');if(!button)return;
    if(button.dataset.close){$('#'+button.dataset.close).close();return}
    if(button.dataset.funnel){funnel=button.dataset.funnel;syncPipelines();renderLibrary();return}
    if(button.dataset.tagFilter!==undefined){tagFilter=button.dataset.tagFilter;renderLibrary();return}
    if(button.id==='show-cancelled'){showCancelled=!showCancelled;renderLibrary();return}
    if(button.id==='sidebar-toggle'){setCollapsed(!document.body.classList.contains('sidebar-collapsed'));return}
    if(button.dataset.nav){navigate(button.dataset.nav);return}
    if(button.hasAttribute('data-new'))return busy(button,'Abrindo...',async()=>{exitDemo();await EcoStudio.newQuote()});
    if(button.hasAttribute('data-demo'))return enterDemo();
    if(button.hasAttribute('data-clear-filters'))return clearFilters();
    if(button.dataset.detail)return openDetail(button.dataset.detail);
    if(button.hasAttribute('data-edit'))return busy(button,'Abrindo...',async()=>{if(demo)navigate('create');else await EcoStudio.openQuote(selected);$('#detail-dialog').close()});
    if(button.hasAttribute('data-delete-permanently')){
      const id=selected,q=findQuote(id);if(!q)return;
      const completed=getOp(id).status==='completed';
      confirmAction('Excluir definitivamente',completed?'Esta ação remove o atendimento concluído, o evento de teste no Google Agenda, PDFs e dados financeiros locais. Não pode ser desfeita.':'Esta ação remove o orçamento cancelado, seus PDFs e dados financeiros locais. Não pode ser desfeita.','Excluir definitivamente',async()=>{await EcoAuth.api('/api/proposals/'+encodeURIComponent(id),{method:'DELETE'});selected=null;if($('#detail-dialog').open)$('#detail-dialog').close();await refresh();notify('Orçamento excluído definitivamente do sistema local.');});return;
    }
    if(button.dataset.deleteVersion){
      const id=selected,versions=await EcoAuth.api('/api/proposals/'+encodeURIComponent(id)+'/versions'),target=versions.find(version=>version.id===button.dataset.deleteVersion);if(!target)return;
      const only=versions.length===1,isCurrent=target.current;
      const description=only?'Este é o único orçamento ativo deste cliente. Ele será arquivado da listagem, com PDFs e histórico preservados para auditoria.':isCurrent?'Esta é a versão atual. A versão válida anterior passará a ser usada nos valores, custos e rentabilidade, com o snapshot financeiro já guardado.':'Esta versão deixará de aparecer no histórico ativo, nos PDFs e nos cálculos. A versão atual não será recalculada.';
      confirmAction(only?'Arquivar único orçamento':'Excluir versão do orçamento',description,only?'Arquivar orçamento':'Excluir versão',async()=>{const result=await EcoAuth.api('/api/proposals/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent(target.id),{method:'DELETE'});if(result.archived){selected=null;if($('#detail-dialog').open)$('#detail-dialog').close();await refresh();notify('Orçamento arquivado da listagem ativa.');return;}await refresh();await renderDetail();notify(result.promotedVersionId?'Versão anterior promovida como orçamento atual.':'Versão excluída do histórico ativo.');});return;
    }
    if(button.hasAttribute('data-schedule'))return openSchedule();
    if(button.hasAttribute('data-generate-pdf'))return generateFromDetail(button);
    if(button.dataset.viewPdf)return showPDF(button.dataset.viewPdf);
    if(button.dataset.downloadPdf){const doc=documentById(button.dataset.downloadPdf);if(doc)EcoDownloadBlob(doc.blob||await S.blob(doc),M.proposalFilename(doc.snapshot));return}
    if(button.hasAttribute('data-copy-contact'))return busy(button,'Copiando...',async()=>{await navigator.clipboard.writeText(findQuote(selected).clientContact);notify('Contato copiado.')});
    if(button.dataset.status){
      const id=selected,next=button.dataset.status,q=findQuote(id);if(!q)return;
      if(next==='completed'&&!demo)return window.UniversalDre.complete(id,getOp(id),async()=>{await refresh();await renderDetail()});
      const descriptions={approved:['Confirmar aprovação',`Marcar a proposta de ${q.client} como aprovada pelo cliente?`,'Marcar como aprovado'],cancelled:['Cancelar orçamento',`A proposta de ${q.client} e seus PDFs serão preservados no histórico.`,'Cancelar orçamento'],completed:['Concluir atendimento',`Confirmar que o atendimento de ${q.client} foi realizado?`,'Marcar como concluído'],generated:['Reabrir orçamento','A proposta voltará a aguardar a confirmação do cliente.','Reabrir orçamento']};
      confirmAction(...descriptions[next],async()=>{await mutate(id,raw=>O.changeStatus(raw,next));notify('Status do orçamento atualizado.')});return;
    }
    if(button.hasAttribute('data-cancel-schedule')){
      const id=selected;confirmAction('Cancelar agendamento','O evento será removido do Google Agenda. O orçamento e seus PDFs serão preservados em Orçamentos gerados.','Cancelar agendamento',async()=>{if(demo)await mutate(id,raw=>({...raw,status:'generated',schedule:null}));else {await EcoAuth.api('/api/proposals/'+id+'/schedule/cancel',{method:'POST',body:JSON.stringify({key:crypto.randomUUID()})});await refresh();await renderDetail()}notify('Agendamento cancelado. Orçamento preservado.')});return;
    }
    if(button.dataset.viewPhoto){const [i,p]=button.dataset.viewPhoto.split(':').map(Number),photo=findQuote(selected)?.items[i]?.photos[p];if(photo){$('#photo-preview').src=photo;$('#photo-dialog').showModal()}}
  }
  function syncPipelines(){for(const b of $$('[data-funnel]'))b.setAttribute('aria-pressed',String(b.dataset.funnel===funnel))}
  const remember=(key,value)=>{try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value)}catch{return null}};
  function setCollapsed(collapsed){document.body.classList.toggle('sidebar-collapsed',collapsed);const label=collapsed?'Expandir menu':'Recolher menu',t=$('#sidebar-toggle');t.setAttribute('aria-label',label);t.title=label;t.setAttribute('aria-expanded',String(!collapsed));remember('hc-sidebar-collapsed',collapsed?'1':'0')}
  function bindSidebar(){
    const width=Number(remember('hc-sidebar-width'));if(width>=200&&width<=340)document.body.style.setProperty('--sidebar-open',width+'px');
    if(remember('hc-sidebar-collapsed')==='1')setCollapsed(true);
    const grip=$('#sidebar-grip');
    grip.addEventListener('pointerdown',e=>{grip.setPointerCapture(e.pointerId);grip.classList.add('on');document.body.classList.add('sidebar-dragging');
      const move=ev=>document.body.style.setProperty('--sidebar-open',Math.max(200,Math.min(340,ev.clientX-16))+'px');
      const up=()=>{grip.classList.remove('on');document.body.classList.remove('sidebar-dragging');grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',up);remember('hc-sidebar-width',String(parseInt(document.body.style.getPropertyValue('--sidebar-open'))||244))};
      grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',up)});
    grip.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const now=parseInt(document.body.style.getPropertyValue('--sidebar-open'))||244,next=Math.max(200,Math.min(340,now+(e.key==='ArrowRight'?16:-16)));document.body.style.setProperty('--sidebar-open',next+'px');remember('hc-sidebar-width',String(next))});grip.tabIndex=0;
  }
  async function refreshGoogle(){
    if(!EcoAuth.online){$('#google-hint').textContent='Abra http://localhost:3000 para usar a agenda e o armazenamento do servidor.';$('#connect-google').onclick=()=>notify('Abra http://localhost:3000 para conectar a conta Google.');$('#logout').hidden=true;$('#migrate-local').hidden=true;return}
    const g=await EcoAuth.api('/api/google/status');$('#google-account').textContent=g.email||'Nenhuma conta';$('#google-badge').textContent=g.connected?'Conectado':g.needsReconnect?'Reconectar':'Desconectado';$('#connect-google').textContent=g.connected?'Desconectar Google':g.needsReconnect?'Reconectar Google':'Conectar Google';
    $('#google-hint').textContent=g.configured?'A confirmação cria o evento com o PDF anexado. Nenhum convite é enviado ao cliente.':'Falta cadastrar o aplicativo Google no servidor. Consulte docs/CONEXAO-GOOGLE.md na pasta do sistema.';
    $('#connect-google').onclick=()=>busy($('#connect-google'),'Conectando...',async()=>{if(g.connected)confirmAction('Desconectar Google','Os eventos existentes serão preservados. Reconecte a mesma conta para reagendá-los ou cancelá-los.','Desconectar',async()=>{const result=await EcoAuth.api('/api/google/disconnect',{method:'POST',body:'{}'});await refreshGoogle();if(result.revocationSkipped)notify('Acesso local removido. A revogação no Google ficou manual para preservar Google Ads.');});else {const result=await EcoAuth.api('/api/google/connect',{method:'POST',body:'{}'});location.href=result.url}});
  }
  async function init(){
    if(initialized)return;initialized=true;
    const identity=$('#settings');identity.open=true;$('#identity-slot').appendChild(identity);
    const photo=document.createElement('dialog');photo.id='photo-dialog';photo.innerHTML='<div class="dialog-head"><h2>Foto do serviço</h2><button class="icon-button" data-close="photo-dialog" aria-label="Fechar foto">×</button></div><img id="photo-preview" class="photo-dialog-image" alt="Foto do item orçado">';document.body.appendChild(photo);
    document.addEventListener('click',e=>onClick(e).catch(error=>notify(error.message)));
    $('.skip-link').onclick=e=>{e.preventDefault();$('#content-start').focus();$('#content-start').scrollIntoView()};
    let typing=0;$('#search').addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(renderLibrary,120)});for(const id of ['date-from','date-to'])$('#'+id).addEventListener('input',renderLibrary);bindBoard();bindSidebar();
    $('#period-toggle').onclick=()=>{const expanded=$('#period-toggle').getAttribute('aria-expanded')==='true';$('#period-toggle').setAttribute('aria-expanded',String(!expanded));$('#period-fields').hidden=expanded};
    $('#clear-filters').onclick=clearFilters;$('#show-demo').onclick=enterDemo;$('#exit-demo').onclick=exitDemo;
    await refreshGoogle();
    $('#logout').onclick=()=>confirmAction('Sair do espaço','Salve as alterações antes de sair.','Sair',async()=>{await EcoAuth.api('/api/logout',{method:'POST',body:'{}'});location.reload()});
    $('#migrate-local').onclick=()=>confirmAction('Importar dados deste navegador','As propostas, fotos, PDFs locais serão copiados para o servidor. Os originais serão preservados. Agendamentos antigos precisarão de nova confirmação.','Importar meus dados',async()=>{
      const list=(await EcoLocalStore.all('quotes')).map(q=>M.normalize(q)),draft=await EcoLocalStore.get('draft','current');
      if(draft?.quote&&(draft.quote.client||draft.quote.items?.some(i=>i.photos?.length))){const index=list.findIndex(q=>q.id===draft.quote.id);if(index<0)list.push(M.normalize(draft.quote));else if((draft.quote.updatedAt||'')>(list[index].updatedAt||''))list[index]=M.normalize(draft.quote)}
      if(!list.length){notify('Não há propostas neste navegador. Se usava o arquivo index.html, exporte o backup por ele e importe aqui.');return}
      const extras=await EcoLocalStore.exportExtras(list.map(q=>q.id)),settings=null;
      const result=await EcoAuth.api('/api/import?migration=yes',{method:'POST',body:JSON.stringify({version:3,proposals:list,settings,...extras})});await refresh();notify(result.imported+' orçamento(s) importado(s).');
    });
    const params=new URLSearchParams(location.search);if(params.has('google')){notify(params.get('google')==='connected'?'Google conectado. Você já pode aprovar e agendar.':params.get('reason')||'Não foi possível conectar o Google.');history.replaceState(null,'',location.pathname+location.hash)}

    $('#schedule-form').onsubmit=reviewSchedule;$('#schedule-duration').onchange=()=>{$('#custom-duration-label').hidden=$('#schedule-duration').value!=='custom'};
    $('#schedule-dialog').addEventListener('close',()=>{review=null});
    $('#pdf-dialog').addEventListener('close',()=>{$('#pdf-frame').src='about:blank';if(viewerURL){URL.revokeObjectURL(viewerURL);viewerURL=null}});
    $('#detail-dialog').addEventListener('close',()=>{const id=selected;selected=null;const back=detailOpener?.isConnected?detailOpener:id&&$(`#board [data-detail="${CSS.escape(id)}"]`);detailOpener=null;back?.focus?.({preventScroll:true})});
    // Backup por teclado, sem precisar focar o input file oculto.
    $('#import').parentElement.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#import').click()}});
    window.addEventListener('hashchange',fromHash);
    window.addEventListener('eco:data-changed',()=>refresh().catch(error=>notify(error.message)));
    window.addEventListener('eco:quotes-changed',()=>refresh().catch(error=>notify(error.message)));
    await refresh();hydrateIcons();fromHash();document.body.dataset.workspaceReady='true';window.UniversalFinance?.initSettings();window.UniversalDre?.initSettings();window.UniversalProfit?.initSettings();window.UniversalIntegrations?.init();window.EcoSettings?.init();
  }
  window.EcoWorkspace={navigate,refresh,openDetail,icon,money,confirm:confirmAction};
  if(window.EcoStudio)init().catch(error=>console.error(error));else window.addEventListener('eco:ready',()=>init().catch(error=>console.error(error)),{once:true});
})();
