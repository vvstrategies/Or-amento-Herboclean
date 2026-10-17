(function(){
  'use strict';
  const root=document.getElementById('chat-view'),api=EcoAuth.api,M=EcoModel;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>(Number(c)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const clock=v=>new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const initials=v=>v.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/><path d="M7 9h9M7 13h6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',send:'<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',back:'<path d="m14 5-7 7 7 7"/>',file:'<path d="M5 3h9l5 5v13H5ZM14 3v5h5M9 13h6M9 17h4"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',plus:'<path d="M12 5v14M5 12h14"/>'}[name]||''}</svg>`;
  let enabled=false,started=false,threads=[],active=null,pane=null,filter='all',query='',busy=false,serial=0;
  const drafts=new Map(),texts=new Map();let timer,tags=[],pendingPhotos=0,selectedQuoteId=null,quoteViewToken=0;
  const $=s=>root.querySelector(s),base=id=>'/api/chat-pilot/conversations/'+encodeURIComponent(id),current=()=>threads.find(t=>t.id===active);
  function notice(text,error=false){const el=$('.chat-notice');if(!el)return;el.textContent=text;el.classList.toggle('error',error)}
  const guard=fn=>async e=>{try{await fn(e)}catch(error){notice(error.message,true)}};
  function shell(){
    root.innerHTML=`<header class="chat-page-head"><a class="chat-exit" href="#inicio" aria-label="Voltar ao início">${icon('back')}</a><div><div class="chat-eyebrow">PERTO DO CLIENTE, DO PRIMEIRO OLÁ AO SERVIÇO</div><h1>Atendimento</h1></div><span class="chat-pilot-badge"><i></i> Piloto local · simulação</span></header>
    <div class="chat-notice" role="status">Mensagens de demonstração. Nada é enviado ao WhatsApp.</div>
    <div class="chat-layout"><aside class="chat-inbox" aria-label="Conversas"><div class="chat-inbox-top"><h2>Conversas <span class="chat-count"></span></h2><span class="chat-channel">${icon('chat')}</span></div><label class="chat-search">${icon('search')}<input type="search" id="chat-search" placeholder="Buscar nome ou telefone" aria-label="Buscar conversa"></label><div class="chat-filters"><button data-filter="all" aria-pressed="true">Todas</button><button data-filter="unread" aria-pressed="false">Não lidas</button></div><div class="chat-list"></div><div class="chat-inbox-footer">Herboclean · atendimento integrado</div></aside>
    <section class="chat-room" aria-label="Chat"><div class="chat-empty">${icon('chat')}<h2>Uma conversa, tudo à mão.</h2><p>Selecione um contato para conversar,<br>consultar seus dados e criar um orçamento.</p><span>Ambiente de teste · dados fictícios</span></div></section>
    <aside class="chat-pane" hidden aria-label="Dados e orçamento do cliente"></aside></div>`;
    $('#chat-search').oninput=e=>{query=e.target.value;renderList()};
    root.addEventListener('click',guard(async e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.thread)await select(b.dataset.thread);
      if(b.dataset.filter){filter=b.dataset.filter;renderList()}
      if(b.dataset.action==='profile')await openPane('profile');
      if(b.dataset.action==='quote')await openPane('quote',true);
      if(b.dataset.action==='quotes')await showQuotes();
      if(b.dataset.viewQuote)await showQuotes(b.dataset.viewQuote);
      if(b.dataset.scheduleQuote){await flush();await EcoWorkspace.scheduleQuote(b.dataset.scheduleQuote)}
      if(b.dataset.chatPdf)await EcoWorkspace.viewPDF(b.dataset.chatPdf);
      if(b.dataset.chatPhoto){const [i,n]=b.dataset.chatPhoto.split(':').map(Number);previewPhoto(drafts.get(active).quote.items[i].photos[n])}
      if(b.dataset.removePhoto){if(pendingPhotos)return notice('Aguarde as fotos terminarem de carregar.',true);collect();const [i,n]=b.dataset.removePhoto.split(':').map(Number);drafts.get(active).quote.items[i].photos.splice(n,1);renderQuote();queueSave()}
      if(b.dataset.action==='close-pane')await closePane();
      if(b.dataset.action==='back'){await closePane();active=null;$('.chat-layout').classList.remove('has-chat');renderList()}
      if(b.dataset.action==='add-item'){if(pendingPhotos)return;await flush();drafts.get(active).quote.items.push(M.item());renderQuote();queueSave()}
      if(b.dataset.remove!==undefined){if(pendingPhotos)return;const d=drafts.get(active);d.quote.items.splice(Number(b.dataset.remove),1);renderQuote();queueSave()}
      if(b.dataset.action==='new-draft'){const d=await api(base(active)+'/draft/new',{method:'POST',body:'{}'});drafts.set(active,d);renderQuote()}
      if(b.dataset.action==='attach')await attachQuote();
      if(b.dataset.action==='simulate')await simulate();
    }));
  }
  function renderList(){
    const search=query.toLocaleLowerCase('pt-BR'),digits=query.replace(/\D/g,'');
    const rows=threads.filter(t=>(filter!=='unread'||t.unread)&&(t.client.name.toLocaleLowerCase('pt-BR').includes(search)||(digits&&t.client.phone.replace(/\D/g,'').includes(digits))||!search));
    $('.chat-count').textContent=threads.length;
    for(const b of root.querySelectorAll('[data-filter]')){b.setAttribute('aria-pressed',String(b.dataset.filter===filter));b.textContent=b.dataset.filter==='unread'?'Não lidas'+(threads.some(t=>t.unread)?' · '+threads.filter(t=>t.unread).length:''):'Todas'}
    $('.chat-list').innerHTML=rows.map(t=>{const m=t.messages.at(-1);return `<button class="chat-contact ${active===t.id?'selected':''}" data-thread="${esc(t.id)}" ${active===t.id?'aria-current="true"':''}><span class="chat-avatar">${esc(initials(t.client.name))}</span><span class="chat-contact-main"><span class="chat-contact-line"><strong>${esc(t.client.name)}</strong><time>${m?clock(m.at):''}</time></span><span class="chat-preview">${m?.direction==='out'?'Você: ':''}${esc(m?.text||'Comece a conversa')}</span><span class="chat-contact-bottom"><span>${t.client.quoteCount?t.client.quoteCount+' orçamento'+(t.client.quoteCount>1?'s':''):'Sem orçamento'}</span>${t.unread?`<b>${t.unread}</b>`:''}</span></span></button>`}).join('')||'<p class="chat-no-results">Nenhuma conversa encontrada.</p>';
  }
  async function refresh(){
    threads=await api('/api/chat-pilot/conversations');threads.sort((a,b)=>(b.messages.at(-1)?.at||'').localeCompare(a.messages.at(-1)?.at||''));renderList();
  }
  async function select(id){
    if(busy||pendingPhotos)return notice('Aguarde a operação terminar.',true);await flush();const token=++serial;selectedQuoteId=null;pane=null;$('.chat-pane').hidden=true;$('.chat-layout').classList.remove('has-pane');
    active=id;await api(base(id)+'/read',{method:'POST',body:'{}'});if(token!==serial)return;await refresh();if(token!==serial)return;renderRoom();
  }
  function renderRoom(){
    const t=current();if(!t)return;$('.chat-layout').classList.add('has-chat');
    $('.chat-room').innerHTML=`<header class="chat-room-head"><button class="chat-icon chat-mobile-back" data-action="back" aria-label="Voltar às conversas">${icon('back')}</button><button class="chat-person" data-action="profile" title="Ver perfil do cliente"><span class="chat-avatar">${esc(initials(t.client.name))}</span><span><strong>${esc(t.client.name)}</strong><small>${esc(t.client.phone)} · Ver perfil</small></span></button><div class="chat-header-actions">${headerActions(t)}</div></header>
    <div class="chat-messages" role="log" aria-label="Mensagens da conversa" aria-live="polite"></div>
    <div class="chat-demo-tools"><span>Conversa simulada</span><button data-action="simulate">+ Simular mensagem recebida</button></div>
    <form class="chat-composer"><label class="sr-only" for="chat-message">Mensagem</label><textarea id="chat-message" rows="1" maxlength="4000" placeholder="Escreva uma mensagem…">${esc(texts.get(active)||'')}</textarea><button class="chat-send" type="submit" title="Enviar na simulação" aria-label="Enviar na simulação">${icon('send')}</button></form>`;
    renderMessages();const input=$('#chat-message');input.oninput=()=>texts.set(active,input.value);
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!matchMedia('(max-width:760px)').matches){e.preventDefault();$('.chat-composer').requestSubmit()}};
    $('.chat-composer').onsubmit=guard(async e=>{e.preventDefault();const text=input.value.trim(),id=active;if(!text)return;const b=e.target.querySelector('button');b.disabled=true;try{await send(id,text,'out');if(active===id){input.value='';texts.delete(id);input.focus()}}finally{b.disabled=false}});
  }
  function renderMessages(){
    const box=$('.chat-messages'),t=current();if(!box||!t)return;
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100||!box.childElementCount;let day='';
    box.innerHTML=t.messages.map(m=>{const date=new Date(m.at).toLocaleDateString('pt-BR'),label=date!==day?`<div class="chat-day">${date}</div>`:'';day=date;return label+`<div class="chat-bubble ${m.direction==='out'?'out':'in'}">${m.pdfId?`<a class="chat-pdf" target="_blank" rel="noopener" href="/api/pdfs/${encodeURIComponent(m.pdfId)}">${icon('file')}<span>Orçamento em PDF<br><small>Abrir documento</small></span></a>`:''}<p>${esc(m.text)}</p><span class="chat-message-meta">${m.direction==='out'?esc(m.author||'Você')+' · ':''}${clock(m.at)}${m.direction==='out'?' · simulado':''}</span></div>`}).join('');
    if(nearBottom)box.scrollTop=box.scrollHeight;
  }
  async function send(id,text,direction,pdfId){await api(base(id)+'/messages',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),text,direction,pdfId})});await refresh();if(active===id){if(direction==='in'){await api(base(id)+'/read',{method:'POST',body:'{}'});current().unread=0;renderList()}renderMessages();$('.chat-messages').scrollTop=$('.chat-messages').scrollHeight}}
  async function simulate(){
    const id=active,dialog=document.createElement('dialog');dialog.className='chat-sim-dialog';dialog.innerHTML='<form><h2>Mensagem do cliente</h2><p>Escolha o que chega nesta conversa de teste.</p><label>Mensagem<textarea required maxlength="4000" rows="4">Olá! Pode me enviar o orçamento por aqui?</textarea></label><div><button type="button">Voltar</button><button type="submit" class="chat-primary">Simular recebimento</button></div></form>';
    document.body.appendChild(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('form').onsubmit=guard(async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await send(id,dialog.querySelector('textarea').value,'in');dialog.close()}finally{b.disabled=false}});dialog.showModal();
  }
  function paneHead(title,sub){return `<header class="chat-pane-head"><div><h2>${title}</h2><p>${sub}</p></div><button class="chat-icon" data-action="close-pane" aria-label="Fechar painel">${icon('close')}</button></header>`}
  async function openPane(mode,fresh=false){
    if(busy||pendingPhotos)return notice('Aguarde a operação terminar.',true);await flush();const id=active;pane=mode;
    if(mode==='quote'){let d=await api(base(id)+'/draft');if(fresh&&d.generated)d=await api(base(id)+'/draft/new',{method:'POST',body:'{}'});if(active!==id)return;drafts.set(id,d)}
    $('.chat-pane').hidden=false;$('.chat-layout').classList.add('has-pane');mode==='profile'?renderProfile():renderQuote();$('.chat-pane').querySelector('button')?.focus();
  }
  async function closePane(){if(busy||pendingPhotos)return notice('Aguarde a operação terminar.',true);await flush();pane=null;$('.chat-pane').hidden=true;$('.chat-layout').classList.remove('has-pane');$('.chat-person')?.focus()}
  const field=(label,name,value,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='email'?'autocomplete="email"':''}></label>`;
  function renderProfile(){
    const id=active,c=current().client;
    $('.chat-pane').innerHTML=paneHead('Perfil do cliente','A mesma ficha disponível na aba Clientes.')+'<div class="chat-pane-body"></div>';
    EcoChatCustomer.render({container:$('.chat-pane-body'),client:c,tags,onError:text=>notice(text,true),onQuote:()=>openPane('quote',true),onView:showQuotes,onSave:async data=>{
      await api(base(id)+'/client',{method:'PUT',body:JSON.stringify(data)});await refresh();renderRoom();window.dispatchEvent(new Event('eco:data-changed'));notice('Ficha do cliente atualizada.');
    }});
  }
  function headerActions(t){
    const list=t.client.history||[],latest=list.find(q=>q.id===selectedQuoteId)||list[0],plan=latest&&['generated','scheduled'].includes(latest.status);
    if(!latest)return `<button class="chat-primary chat-create" data-action="quote">${icon('plus')}<span>Gerar orçamento</span></button>`;
    return `<button class="chat-secondary" data-action="quotes">${icon('file')}<span>Ver orçamento${list.length>1?'s':''}</span></button>${plan?`<button class="chat-primary chat-create" data-schedule-quote="${esc(latest.id)}">${latest.status==='scheduled'?'Reagendar':'Agendar'}</button>`:''}<button class="chat-icon" data-action="quote" aria-label="Novo orçamento" title="Novo orçamento">${icon('plus')}</button>`;
  }
  async function showQuotes(id){
    if(busy||pendingPhotos)return notice('Aguarde a operação terminar.',true);
    await flush();const t=current(),list=t.client.history;if(!list.length)return openPane('quote');
    const q=list.find(q=>q.id===(id||selectedQuoteId))||list[0];selectedQuoteId=q.id;pane='quotes';const token=++quoteViewToken,threadId=active;
    $('.chat-pane').hidden=false;$('.chat-layout').classList.add('has-pane');$('.chat-pane').innerHTML=paneHead('Orçamentos do cliente','Consulte a proposta e agende sem sair do chat.')+'<div class="chat-pane-body">Carregando orçamento…</div>';
    const proposal=await api('/api/proposals/'+encodeURIComponent(q.id));if(active!==threadId||pane!=='quotes'||token!==quoteViewToken)return;
    const total=M.totals(proposal),op=q.operation,schedule=op.schedule;
    $('.chat-pane').innerHTML=paneHead('Orçamentos do cliente','Consulte a proposta e agende sem sair do chat.')+`<div class="chat-pane-body chat-saved-quote"><label>Orçamento<select class="chat-quote-select">${list.map(x=>`<option value="${esc(x.id)}" ${x.id===q.id?'selected':''}>${esc(x.number)} · ${esc(EcoOperations.statuses[x.status])}</option>`).join('')}</select></label><span class="chat-saved-status">${esc(EcoOperations.statuses[q.status])}</span><h3>${esc(proposal.client)}</h3><p>${esc(proposal.address)}</p><p>${esc(proposal.clientContact)}${proposal.clientEmail?' · '+esc(proposal.clientEmail):''}</p>${proposal.items.map((item,i)=>`<section class="chat-saved-item"><strong>${esc(item.service)}</strong><p>${esc(item.description)}</p><small>${item.quantity} ${esc(item.unit)} × ${money(Math.round(Number(item.price)*100))}</small><b>${money(total.rows[i])}</b><div class="chat-photo-thumbs">${item.photos.map(src=>`<img src="${src}" alt="Foto de ${esc(item.service)}">`).join('')}</div></section>`).join('')}<div class="chat-saved-total"><span>Total no PIX</span><strong>${money(total.pix)}</strong></div><small>${total.count}× de ${money(total.part)} no cartão</small>${schedule?`<div class="chat-saved-schedule"><strong>${new Date(schedule.start).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})} · ${EcoOperations.time(schedule.start)}–${EcoOperations.time(schedule.end)}</strong><small>Horário de Brasília · agendamento local simulado</small></div>`:''}<div class="chat-saved-actions">${q.pdfId?`<button class="chat-secondary" data-chat-pdf="${esc(q.pdfId)}">${icon('file')} Visualizar PDF</button>`:''}${['generated','scheduled'].includes(q.status)?`<button class="chat-primary" data-schedule-quote="${esc(q.id)}">${q.status==='scheduled'?'Reagendar':'Aprovar e agendar'}</button>`:''}<button class="chat-link" data-action="quote">+ Novo orçamento</button></div></div>`;
    $('.chat-quote-select').onchange=guard(e=>showQuotes(e.target.value));$('.chat-header-actions').innerHTML=headerActions(t);
  }
  function photosMarkup(it,i){return `<div class="chat-item-photos"><span>Fotos do serviço <small>${it.photos.length}/6</small></span><div class="chat-photo-thumbs">${it.photos.map((src,n)=>`<div><button type="button" data-chat-photo="${i}:${n}" aria-label="Ampliar foto ${n+1} do item ${i+1}"><img src="${src}" alt="Foto ${n+1} de ${esc(it.service)}"></button><button type="button" class="chat-remove-photo" data-remove-photo="${i}:${n}" aria-label="Remover foto ${n+1} do item ${i+1}">×</button></div>`).join('')}</div>${it.photos.length<6?`<label class="chat-photo-upload">+ Anexar imagens<input type="file" data-chat-upload="${i}" accept="image/jpeg,image/png,image/webp" multiple aria-label="Anexar imagens ao item ${i+1}"></label>`:''}<small>Até 6 fotos · JPG, PNG ou WebP · 20 MB por arquivo</small></div>`}
  async function uploadPhotos(input){
    const files=[...input.files],d=drafts.get(active),item=d.quote.items[Number(input.dataset.chatUpload)];if(!files.length)return;
    if(item.photos.length+files.length>6)throw Error('Use até 6 fotos por serviço.');collect();pendingPhotos++;
    notice('Preparando fotos…');const submit=$('.chat-quote-form [type="submit"]');if(submit)submit.disabled=true;
    try{const images=await Promise.all(files.map(file=>EcoStudio.readImage(file)));item.photos.push(...images);renderQuote();await flush();notice('Fotos anexadas ao serviço e salvas no rascunho.')}finally{pendingPhotos--;if(submit?.isConnected)submit.disabled=false;input.value=''}
  }
  function previewPhoto(src){const dialog=document.createElement('dialog');dialog.className='chat-photo-preview';dialog.innerHTML=`<button type="button" aria-label="Fechar foto">×</button><img src="${src}" alt="Foto do serviço">`;dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.appendChild(dialog);dialog.showModal()}
  function renderQuote(){
    const d=drafts.get(active),q=d.quote,g=d.generated;
    if(g){$('.chat-pane').innerHTML=paneHead('Orçamento pronto','Os dados já estão no cadastro do cliente.')+`<div class="chat-pane-body chat-success"><span class="chat-success-icon">✓</span><h3>${esc(g.number)}</h3><p>Gerado neste ambiente de teste.</p><strong>${money(g.pixCents)}</strong><a class="chat-secondary" href="/api/pdfs/${encodeURIComponent(g.pdfId)}" target="_blank" rel="noopener">${icon('file')} Abrir PDF</a><button class="chat-secondary" data-view-quote="${esc(g.id)}">Ver orçamento gerado</button><button class="chat-primary" data-schedule-quote="${esc(g.id)}">Agendar</button><button class="chat-secondary" data-action="attach">Adicionar PDF à conversa</button><small>O anexo aparece somente nesta simulação.</small><button class="chat-link" data-action="new-draft">Criar outro orçamento</button></div>`;return}
    $('.chat-pane').innerHTML=paneHead('Novo orçamento','Converse e prepare a proposta por aqui.')+`<form class="chat-quote-form"><div class="chat-pane-body"><div class="chat-draft-meta"><span>${esc(q.number)}</span><span class="chat-save-status" role="status">Rascunho salvo</span></div><h3>Cliente</h3>${field('Nome','client',q.client,'text',true)}<div class="chat-field-row">${field('Telefone','clientContact',q.clientContact,'tel')}${field('E-mail','clientEmail',q.clientEmail,'email')}</div><label>Endereço completo<textarea name="address" rows="2" required>${esc(q.address)}</textarea></label><h3>Serviços</h3><div class="chat-items">${q.items.map((it,i)=>`<fieldset class="chat-item" data-item="${i}"><legend>Item ${i+1}</legend><div class="chat-item-top"><label>Serviço<select name="service">${M.services.map(s=>`<option ${s.name===it.service?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>${q.items.length>1?`<button type="button" data-remove="${i}" class="chat-icon" aria-label="Remover item ${i+1}">${icon('close')}</button>`:''}</div><div class="chat-field-row"><label>Quantidade (${esc(it.unit)})<input type="number" name="quantity" min="0.01" max="100000" step="0.01" required value="${it.quantity}"></label><label>Valor unitário (R$)<input type="number" name="price" min="0" max="1000000" step="0.01" required value="${esc(it.price)}"></label></div><label>Descrição<textarea name="description" rows="2">${esc(it.description)}</textarea></label>${photosMarkup(it,i)}</fieldset>`).join('')}</div><button type="button" data-action="add-item" class="chat-link">+ Adicionar serviço</button><details class="chat-terms"><summary>Condições da proposta</summary><div class="chat-field-row">${field('Validade (dias)','validity',q.terms.validity,'number',true)}${field('Parcelas','installments',q.terms.installments,'number',true)}</div><label>Observações<textarea name="notes" rows="2">${esc(q.terms.notes)}</textarea></label></details></div><footer class="chat-quote-footer"><div><span>Total no PIX</span><strong class="chat-total"></strong></div><p class="chat-credit"></p><button class="chat-primary" type="submit">${icon('file')} Gerar orçamento e PDF</button><small>Nome, telefone, e-mail e endereço serão atualizados no cliente.</small></footer></form>`;
    const form=$('.chat-quote-form');form.oninput=e=>{if(e.target.type==='file')return;collect();queueSave();renderTotals()};form.onchange=guard(async e=>{if(e.target.hasAttribute('data-chat-upload')){await uploadPhotos(e.target);return}if(e.target.name==='service'){const index=Number(e.target.closest('[data-item]').dataset.item),item=M.item(e.target.value);Object.assign(d.quote.items[index],{service:item.service,description:item.description,unit:item.unit});renderQuote();queueSave()}});
    form.onsubmit=guard(async e=>{e.preventDefault();if(pendingPhotos)throw Error('Aguarde as fotos terminarem de carregar.');if(busy)return;collect();M.validate(d.quote);busy=true;const controls=[...form.querySelectorAll('input,textarea,select,button')];controls.forEach(c=>c.disabled=true);const b=e.submitter;b.disabled=true;b.textContent='Gerando PDF…';try{await flush(true);const g=await api(base(active)+'/quote',{method:'POST',body:JSON.stringify({revision:d.revision})});d.generated=g;await refresh();renderRoom();renderQuote();window.dispatchEvent(new Event('eco:data-changed'));notice('Orçamento gerado. Cadastro atualizado e PDF disponível.')}finally{busy=false;controls.forEach(c=>c.disabled=false);if(b.isConnected){b.disabled=false;b.textContent='Gerar orçamento e PDF'}}});renderTotals();
  }
  function collect(){
    if(pane!=='quote')return;const form=$('.chat-quote-form');if(!form)return;const q=drafts.get(active).quote;
    for(const name of ['client','clientContact','clientEmail','address'])q[name]=form.elements[name].value;
    for(const name of ['validity','installments'])q.terms[name]=Number(form.elements[name].value);q.terms.notes=form.elements.notes.value;
    for(const row of form.querySelectorAll('[data-item]')){const it=q.items[Number(row.dataset.item)];for(const name of ['quantity','price'])it[name]=row.querySelector(`[name="${name}"]`).value;it.description=row.querySelector('[name="description"]').value;it.service=row.querySelector('[name="service"]').value}
  }
  function renderTotals(){try{const t=M.totals(drafts.get(active).quote);$('.chat-total').textContent=money(t.pix);$('.chat-credit').textContent=`Ou ${t.count}× de ${money(t.part)} no cartão`;}catch(error){$('.chat-credit').textContent=error.message}}
  function queueSave(){clearTimeout(timer);const el=$('.chat-save-status');if(el)el.textContent='Salvando…';timer=setTimeout(()=>flush(true).catch(e=>notice(e.message,true)),600)}
  let saving=Promise.resolve();
  async function flush(force=false){
    clearTimeout(timer);const id=active,d=drafts.get(id);if(!d||d.generated||pane!=='quote'){await saving;return}
    const quote=structuredClone(d.quote);
    saving=saving.catch(()=>{}).then(async()=>{const value=await api(base(id)+'/draft',{method:'PUT',body:JSON.stringify({quote,revision:d.revision})});d.revision=value.revision;if(active===id){const el=$('.chat-save-status');if(el)el.textContent='Rascunho salvo';if($('.chat-notice')?.classList.contains('error'))notice('Rascunho salvo. Mensagens somente nesta simulação.')}});
    await saving;
  }
  async function attachQuote(){const g=drafts.get(active).generated;await send(active,`Segue o orçamento ${g.number}. Valor no PIX: ${money(g.pixCents)}.`,'out',g.pdfId);notice('PDF adicionado à conversa simulada. Nenhum envio externo.');}
  async function open(){await ready;if(!enabled){root.innerHTML='<p>O atendimento está disponível somente no piloto local.</p>';return}if(!started){started=true;shell()}try{await refresh();if(active)renderMessages()}catch(e){notice(e.message,true)}}
  const ready=EcoAuth.ready.then(async()=>{const config=await api('/api/chat-pilot');enabled=config.enabled;if(!enabled)return;tags=await api('/api/tags');document.getElementById('chat-nav').hidden=false;const mobile=document.createElement('a');mobile.href='#atendimento';mobile.className='chat-mobile-entry';mobile.innerHTML=icon('chat')+'<span>Atendimento</span>';document.body.appendChild(mobile);if(location.hash==='#atendimento')open()}).catch(e=>console.error('Atendimento:',e));
  window.EcoChat={open,simulationEnabled:()=>enabled,refresh:async()=>{if(!started)return;await refresh();if(active){renderRoom();if(pane==='quotes')await showQuotes(selectedQuoteId);else if(pane==='profile')renderProfile()}}};
  setInterval(async()=>{if(!enabled||!started||root.hidden||document.hidden||busy)return;try{const before=current()?.messages.at(-1)?.id;await refresh();if(active&&before!==current()?.messages.at(-1)?.id)renderMessages()}catch{}},5000);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pane&&!root.hidden)closePane().catch(error=>notice(error.message,true))});
})();
