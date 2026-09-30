(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],M=EcoModel,O=EcoOperations,S=EcoStore;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
  const date=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:O.timezone,day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value.length===10?value+'T12:00:00Z':value));
  const shortDate=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:O.timezone,day:'2-digit',month:'short'}).format(new Date(value));
  const notify=message=>window.EcoStudio.notify(message);
  const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',edit:'M14 4l6 6 M3 21l5-1 13-13a2.1 2.1 0 0 0-3-3L5 17z',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',calendar:'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M7 3v4 M17 3v4 M3 11h18 M7 15h2 M13 15h2',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',arrow:'M5 12h14 M14 7l5 5-5 5',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0 M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',document:'M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h6',folder:'M3 6h7l2 3h9v11H3z',shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',check:'M5 12l4 4L19 6',phone:'M7 3l3 5-3 2c1 3 4 6 7 7l2-3 5 3-1 4C10 22 2 14 3 4z',copy:'M8 8h13v13H8z M16 8V3H3v13h5',service:'M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3 M3 10h4v6h10v-6h4v9H3z M5 19v2 M19 19v2'};
  const icon=name=>`<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.document}"></path></svg>`;
  const badge=status=>`<span class="status-badge ${status}">${esc(O.statuses[status])}</span>`;
  const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'OU';
  let pipeline='generated';
  let quotes=[],operations=new Map(),documents=[],demo=false,examples=[],exampleOperations=new Map(),exampleDocs=[],selected=null,view='quotes',refreshSerial=0,viewerURL,review=null,initialized=false;
  const getQuotes=()=>demo?examples:quotes;
  const getOp=id=>O.normalize((demo?exampleOperations:operations).get(id)||{id});
  const getDocs=id=>(demo?exampleDocs:documents).filter(p=>p.proposalId===id).sort((a,b)=>b.version-a.version);
  const findQuote=id=>getQuotes().find(q=>q.id===id);
  function totals(q){try{return M.totals(q)}catch{return null}}
  function hydrateIcons(){for(const element of $$('[data-icon]'))element.innerHTML=icon(element.dataset.icon)}
  function navigate(next,update=true){
    if(next==='quotes'&&view==='create'){pipeline='generated';$('#status-filter').value='';syncPipelines()}
    if(!['quotes','create','settings','finance'].includes(next))next='quotes';view=next;
    for(const name of ['quotes','create','settings','finance'])$('#'+name+'-view').hidden=name!==next;
    for(const el of $$('.nav-item')){const active=el.dataset.nav===next;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')}
    $('#page-location').textContent={quotes:'Orçamentos',create:'Criar orçamento',settings:'Configurações',finance:'Financeiro'}[next];
    const hash={quotes:'orcamentos',create:'criar',settings:'configuracoes',finance:'financeiro'}[next];
    if(update&&location.hash!=='#'+hash)location.hash=hash;
    if(next==='finance')window.UniversalDre?.open();
    if(next==='quotes')refresh().catch(error=>notify(error.message));
    window.scrollTo({top:0,behavior:'instant'});
  }
  function fromHash(){navigate({'#criar':'create','#configuracoes':'settings','#financeiro':'finance'}[location.hash]||'quotes',false)}
  async function refresh(){
    const serial=++refreshSerial;
    const [list,ops,pdfs]=await Promise.all([S.all('quotes'),S.all('operations'),S.all('pdfs')]);
    if(serial!==refreshSerial)return;
    quotes=list.sort((a,b)=>(b.updatedAt||b.date).localeCompare(a.updatedAt||a.date));operations=new Map(ops.map(x=>[x.id,x]));documents=pdfs;
    $('#nav-count').textContent=quotes.length;renderLibrary();
  }
  function filters(){return {search:$('#search').value.trim(),status:$('#status-filter').value,scheduled:$('#schedule-filter').value,from:$('#date-from').value,to:$('#date-to').value}}
  function renderLibrary(){
    const all=getQuotes(),now=Date.now(),week=now+7*86400000;
    const awaiting=all.filter(q=>getOp(q.id).status==='generated').length;
    const upcoming=all.filter(q=>{const o=getOp(q.id);return o.schedule&&['generated','scheduled'].includes(o.status)&&Date.parse(o.schedule.start)>=now&&Date.parse(o.schedule.start)<week}).length;
    $('#overview').innerHTML=[['document','Orçamentos salvos',all.length,'Tudo em um só lugar'],['clock','Orçamentos gerados',awaiting,'Prontos para aprovar e agendar'],['calendar','Próximos 7 dias',upcoming,'Atendimentos confirmados']].map(([i,label,value,note])=>`<div class="overview-card"><span class="feature-icon">${icon(i)}</span><div><span class="overview-label">${label}</span><span class="overview-value">${value}</span><span class="overview-note">${note}</span></div></div>`).join('');
    const f=filters(),invalid=f.from&&f.to&&f.from>f.to;
    $('#filter-error').hidden=!invalid;$('#filter-error').textContent=invalid?'A data inicial deve ser anterior ou igual à data final.':'';
    $('#generated-count').textContent=all.filter(q=>getOp(q.id).status==='generated').length;$('#scheduled-count').textContent=all.filter(q=>getOp(q.id).status==='scheduled').length;
    const filtered=invalid?[]:all.filter(q=>O.matches(q,getOp(q.id),{...f,status:f.status||pipeline}));
    $('#result-count').textContent=filtered.length;$('#demo-banner').hidden=!demo;$('#show-demo').hidden=demo;
    $('#quote-grid').innerHTML=filtered.length?filtered.map(card).join(''):`<div class="empty-library"><span class="feature-icon">${icon(all.length?'search':'folder')}</span><h3>${all.length?'Nenhum orçamento encontrado.':'Seu próximo atendimento começa aqui.'}</h3><p>${all.length?'Ajuste a busca ou os filtros para encontrar a proposta.':'Crie sua primeira proposta com a identidade da empresa. Depois, acompanhe a aprovação e prepare o atendimento por aqui.'}</p><div class="empty-actions">${all.length?'<button class="secondary" data-clear-filters>Limpar filtros</button>':'<button class="primary" data-new>＋ Criar orçamento</button><button class="secondary" data-demo>Explorar exemplos</button>'}</div></div>`;
    $('#library-count-note').textContent=`${filtered.length} de ${all.length} orçamento${all.length===1?'':'s'}${demo?' de demonstração':''}`;
  }
  function card(q){
    const op=getOp(q.id),t=totals(q),photos=q.items.reduce((n,i)=>n+i.photos.length,0),schedule=op.schedule;
    let planned=schedule?`${shortDate(schedule.start)} · ${O.time(schedule.start)}–${O.time(schedule.end)}`:'Sem agendamento';
    if(schedule?.sync==='pending')planned='Pré-agendamento · '+planned;
    return `<button type="button" class="proposal-card" data-detail="${esc(q.id)}" aria-label="Abrir orçamento de ${esc(q.client||'cliente não informado')}"><span class="card-topline"><span class="client-avatar">${esc(initials(q.client))}</span>${badge(op.status)}</span><span class="card-client">${esc(q.client||'Cliente não informado')}</span><span class="card-address">${icon('pin')}<span>${esc(q.address||'Endereço não informado')}</span></span><span class="card-service">${icon('service')}<span class="service-name">${esc(O.summary(q))}</span>${photos?`<span class="card-photo-count">${photos} foto${photos>1?'s':''}</span>`:''}</span><span class="card-value-row"><span><span class="card-value-label">VALOR NO PIX</span><span class="card-value">${t?money(t.pix):'Revisar valores'}</span></span><span class="card-date">${date(q.date)}</span></span><span class="card-schedule ${schedule?.sync==='pending'?'pending':''}">${icon('calendar')}${esc(planned)}</span><span class="card-bottom"><span>${esc(q.number)}</span><span class="card-open">Ver orçamento ${icon('arrow')}</span></span></button>`;
  }
  function contactLinks(contact){
    const digits=String(contact||'').replace(/\D/g,''),phone=/^[\d\s()+-]+$/.test(contact||'')&&digits.length>=10&&digits.length<=13;
    const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact||'');
    return `${phone?`<a class="quick-link" href="tel:${digits}">${icon('phone')}Ligar</a><a class="quick-link" href="https://wa.me/${digits.length<=11?'55':''}${digits}" target="_blank" rel="noopener">WhatsApp</a>`:''}${email?`<a class="quick-link" href="mailto:${encodeURIComponent(contact)}">Enviar e-mail</a>`:''}${contact?`<button class="quick-link" data-copy-contact>${icon('copy')}Copiar contato</button>`:''}`;
  }
  async function openDetail(id){selected=id;await renderDetail();if(!$('#detail-dialog').open)$('#detail-dialog').showModal()}
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
    review=null;$('#schedule-dialog').close();pipeline='scheduled';syncPipelines();renderLibrary();notify(demo?'Agendamento simulado. Nenhum evento foi enviado.':'Proposta aprovada e evento confirmado no Google Agenda.');
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
  function clearFilters(){for(const id of ['search','status-filter','schedule-filter','date-from','date-to'])$('#'+id).value='';renderLibrary()}
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
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.close){$('#'+button.dataset.close).close();return}
    if(button.dataset.pipeline){pipeline=button.dataset.pipeline;$('#status-filter').value='';syncPipelines();renderLibrary();return}
    if(button.dataset.nav){navigate(button.dataset.nav);return}
    if(button.hasAttribute('data-new'))return busy(button,'Abrindo...',async()=>{exitDemo();await EcoStudio.newQuote()});
    if(button.hasAttribute('data-demo'))return enterDemo();
    if(button.hasAttribute('data-clear-filters'))return clearFilters();
    if(button.dataset.detail)return busy(button,'Abrindo...',()=>openDetail(button.dataset.detail));
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
  function syncPipelines(){for(const b of $$('[data-pipeline]')){const active=b.dataset.pipeline===pipeline;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))}}
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
    for(const id of ['search','status-filter','schedule-filter','date-from','date-to'])$('#'+id).addEventListener('input',renderLibrary);
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
    $('#detail-dialog').addEventListener('close',()=>{selected=null});
    // Backup por teclado, sem precisar focar o input file oculto.
    $('#import').parentElement.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#import').click()}});
    window.addEventListener('hashchange',fromHash);
    window.addEventListener('eco:data-changed',()=>refresh().catch(error=>notify(error.message)));
    window.addEventListener('eco:quotes-changed',()=>refresh().catch(error=>notify(error.message)));
    await refresh();hydrateIcons();fromHash();document.body.dataset.workspaceReady='true';window.UniversalFinance?.initSettings();window.UniversalDre?.initSettings();window.UniversalProfit?.initSettings();window.UniversalIntegrations?.init();
  }
  window.EcoWorkspace={navigate,refresh};
  if(window.EcoStudio)init().catch(error=>console.error(error));else window.addEventListener('eco:ready',()=>init().catch(error=>console.error(error)),{once:true});
})();
