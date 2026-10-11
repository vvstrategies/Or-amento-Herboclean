(function(root){
  'use strict';
  // Clientes: criados a cada orçamento; a ficha guarda dados para reabordagem.
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((c||0)/100);
  const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  const tz='America/Sao_Paulo',today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const br=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
  const bday=b=>b?b.slice(3)+'/'+b.slice(0,2):'—';
  const STATUS={generated:['Gerado','g'],scheduled:['Agendado','s'],completed:['Concluído','c'],cancelled:['Cancelado','x']};
  let clients=[],tags=[],filter='all',query='',selected=null,detail=null,editing=false,serial=0;
  const notify=m=>root.EcoStudio?.notify(m);
  function daysToBirthday(b){if(!b)return null;const t=today(),y=+t.slice(0,4);for(const year of [y,y+1]){const n=Math.round((Date.parse(year+'-'+b+'T12:00:00Z')-Date.parse(t+'T12:00:00Z'))/86400000);if(n>=0)return n}return null}
  const tagLabel=id=>tags.find(t=>t.id===id)?.label||String(id).toUpperCase();
  const tagClass=id=>{const i=tags.findIndex(t=>t.id===id);return 't'+(i<0?3:Math.min(i,3))};
  const tagChips=list=>(list||[]).map(id=>`<span class="tag ${tagClass(id)}">${esc(tagLabel(id))}</span>`).join('');
  function shell(){
    $('#clients-view').innerHTML=`<div class="page-heading"><div><h1>Clientes</h1><p>Criados automaticamente a cada orçamento. Complete a ficha para reabordar depois.</p></div><div class="page-actions"><button type="button" class="primary" id="client-new">＋ Novo cliente</button></div></div>
      <div class="board-tools"><label class="search-control"><span class="sr-only">Buscar cliente</span><span data-icon="search"></span><input id="client-search" type="search" placeholder="Buscar por nome, telefone ou bairro"></label><div class="seg" id="client-filter" role="group" aria-label="Filtrar clientes"></div></div>
      <div class="clients-layout"><div class="clients-table-wrap"><table class="clients-table"><thead><tr><th>Cliente</th><th>Tipo</th><th>Orçamentos</th><th>Total fechado</th><th>Último serviço</th><th>Aniversário</th></tr></thead><tbody id="client-rows"><tr><td colspan="6" class="hint">Carregando clientes...</td></tr></tbody></table></div><aside class="client-profile" id="client-profile" aria-live="polite"></aside></div>`;
    const icon=root.EcoWorkspace?.icon;if(icon)for(const el of $('#clients-view').querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon);
    $('#client-search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderList()});
    $('#client-filter').addEventListener('click',e=>{const b=e.target.closest('button');if(b){filter=b.dataset.f;renderList()}});
    $('#client-rows').addEventListener('click',e=>{if(e.target.closest('[data-retry-clients]'))return load().catch(()=>null);const tr=e.target.closest('tr[data-id]');if(tr)select(tr.dataset.id)});
    $('#client-rows').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-id]')){e.preventDefault();select(e.target.dataset.id)}});
    $('#client-new').addEventListener('click',()=>{selected=null;detail=null;editing=true;renderProfile()});
    $('#client-profile').addEventListener('click',onProfileClick);
    $('#client-profile').addEventListener('submit',onSave);
  }
  async function load(){
    if(!root.EcoAuth?.online){$('#client-rows').innerHTML='<tr><td colspan="6" class="hint">Abra o sistema pelo endereço do servidor para ver os clientes.</td></tr>';return}
    const id=++serial;let list,t;try{[list,t]=await Promise.all([EcoCache.get('/api/clients'),EcoCache.get('/api/tags').catch(()=>[])])}catch(error){if(id===serial)$('#client-rows').innerHTML=`<tr><td colspan="6" class="hint">Não foi possível carregar os clientes: ${esc(error.message)} <button type="button" class="text-button" data-retry-clients>Tentar de novo</button></td></tr>`;return}if(id!==serial)return;
    clients=list;tags=t||[];if($('#nav-clients'))$('#nav-clients').textContent=clients.length;
    if(!selected&&clients.length&&!editing)selected=clients[0].id;
    renderList();if(selected)await select(selected,true);else renderProfile();
  }
  function matches(c){
    const hay=[c.name,c.phone,c.email,c.neighborhood,c.city,c.address].join(' ').toLowerCase();if(query&&!hay.includes(query))return false;
    if(filter==='birthday'){const n=daysToBirthday(c.birthday);return n!==null&&n<=30}
    if(filter!=='all')return (c.tags||[]).includes(filter);return true;
  }
  function renderList(){
    const counts={all:clients.length,birthday:clients.filter(c=>{const n=daysToBirthday(c.birthday);return n!==null&&n<=30}).length};for(const t of tags)counts[t.id]=clients.filter(c=>(c.tags||[]).includes(t.id)).length;
    $('#client-filter').innerHTML=[['all','Todos'],...tags.map(t=>[t.id,t.label.charAt(0)+t.label.slice(1).toLowerCase()]),['birthday','Aniversariantes']].map(([id,l])=>`<button type="button" data-f="${esc(id)}" aria-pressed="${filter===id}">${esc(l)} <span class="n">${counts[id]||0}</span></button>`).join('');
    const list=clients.filter(matches);
    $('#client-rows').innerHTML=list.length?list.map(c=>{const n=daysToBirthday(c.birthday);return `<tr data-id="${esc(c.id)}" tabindex="0" class="${c.id===selected?'sel':''}" aria-selected="${c.id===selected}"><td><div class="who2"><span class="av">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>${esc(c.neighborhood||c.city||c.phone||'')}</small></div></div></td><td>${tagChips(c.tags)||'<span class="muted">—</span>'}</td><td>${c.quoteCount}</td><td><b>${c.closedCents?money(c.closedCents):'—'}</b></td><td>${c.lastServiceDate?br(c.lastServiceDate):'—'}${c.nextServiceDate?`<small class="muted next">próximo ${br(c.nextServiceDate)}</small>`:''}</td><td>${n!==null&&n<=30?'<span class="bday" title="Aniversário em breve" aria-label="Aniversário em breve">🎂</span> ':''}${bday(c.birthday)}</td></tr>`}).join(''):`<tr><td colspan="6" class="hint">${clients.length?'Nenhum cliente encontrado.':'Os clientes aparecem aqui assim que você salvar o primeiro orçamento.'}</td></tr>`;
  }
  async function select(id,quiet){
    selected=id;editing=false;if(!quiet)renderList();
    try{detail=await EcoAuth.api('/api/clients/'+encodeURIComponent(id));if(selected!==id)return;renderProfile()}catch(error){notify(error.message)}
  }
  function form(c={}){
    const custom=(c.custom||[]).concat([{label:'',value:''}]);
    return `<form class="hcard client-form" id="client-form"><div class="ph"><div><h2>${c.id?'Editar ficha':'Novo cliente'}</h2><p>${c.id?'Essas informações ajudam na reabordagem e no pós-venda.':'Cadastre um cliente antes do primeiro orçamento.'}</p></div></div>
      <label>Nome<input name="name" required maxlength="240" value="${esc(c.name)}"></label>
      <div class="form-grid"><label>WhatsApp<input name="phone" maxlength="60" value="${esc(c.phone)}" inputmode="tel"></label><label>Aniversário <small>DD/MM</small><input name="birthday" maxlength="5" placeholder="18/03" value="${esc(c.birthday?bday(c.birthday):'')}"></label>
      <label>E-mail<input name="email" type="email" maxlength="240" value="${esc(c.email)}"></label><label>Contato na empresa<input name="contactName" maxlength="240" value="${esc(c.contactName)}"></label></div>
      <label>Endereço<input name="address" maxlength="800" value="${esc(c.address)}"></label>
      <div class="field-group"><span>Tipo de cliente</span><div class="choice" id="client-tags">${tags.map(t=>`<button type="button" data-tag="${esc(t.id)}" aria-pressed="${(c.tags||[]).includes(t.id)}">${esc(t.label)}</button>`).join('')}</div></div>
      <label>Observações<textarea name="notes" rows="3" maxlength="3000">${esc(c.notes)}</textarea></label>
      <div class="field-group"><span>Campos personalizados <em>ex.: responsável, melhor horário, pet em casa</em></span><div id="client-custom">${custom.map((f,i)=>`<div class="custom-row"><input data-custom-label="${i}" maxlength="60" placeholder="Campo" value="${esc(f.label)}" aria-label="Nome do campo"><input data-custom-value="${i}" maxlength="500" placeholder="Valor" value="${esc(f.value)}" aria-label="Valor do campo"></div>`).join('')}</div><button type="button" class="text-button" data-add-custom>＋ Campo personalizado</button></div>
      <div class="form-actions">${c.id||clients.length?'<button type="button" class="secondary" data-cancel-edit>Cancelar</button>':''}<button type="submit" class="primary">Salvar ficha</button></div></form>`;
  }
  function renderProfile(){
    const box=$('#client-profile');
    if(editing){box.innerHTML=form(detail||{});box.querySelector('input[name=name]').focus();return}
    if(!detail){box.innerHTML=`<div class="hcard"><p class="hint">${clients.length?'Selecione um cliente para ver a ficha.':'Nenhum cliente ainda.'}</p></div>`;return}
    const c=detail,n=daysToBirthday(c.birthday),done=c.history.filter(h=>h.status==='completed').length;
    box.innerHTML=`<div class="client-hero"><div class="r"><span class="av">${esc(initials(c.name))}</span><div><h3>${esc(c.name)}</h3><p>${esc([c.neighborhood||c.city,c.firstDate?'cliente desde '+br(c.firstDate).slice(3):''].filter(Boolean).join(' · '))}</p></div></div>
      <div class="stats"><div><small>Orçamentos</small><strong>${c.quoteCount}</strong></div><div><small>Total fechado</small><strong>${c.closedCents?money(c.closedCents):'—'}</strong></div><div><small>Ticket médio</small><strong>${done?money(Math.round(c.closedCents/done)):'—'}</strong></div></div></div>
      <div class="hcard"><div class="ph"><div><h2>Ficha</h2><p>Informações adicionais para reabordagem</p></div><button type="button" class="secondary small" data-edit-client>Editar</button></div>
      ${c.birthday?`<div class="bday"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21h16M5 21v-7h14v7M12 14V9M12 6.5c1-1 1-2 0-3-1 1-1 2 0 3z"/></svg></span><div><b>Aniversário em ${bday(c.birthday)}</b><small>${n===0?'É hoje! Ótimo momento para reabordar.':n<=30?`Daqui a ${n} dia${n>1?'s':''} · aparece no funil de pós-venda`:'Aparece no funil de pós-venda 30 dias antes'}</small></div></div>`:'<button type="button" class="bday empty" data-edit-client><span class="ic">+</span><div><b>Adicionar aniversário</b><small>Use para reabordar o cliente no pós-venda</small></div></button>'}
      <dl class="kv"><dt>Tipo</dt><dd>${tagChips(c.tags)||'—'}</dd><dt>WhatsApp</dt><dd>${esc(c.phone||'—')}</dd>${c.email?`<dt>E-mail</dt><dd>${esc(c.email)}</dd>`:''}${c.contactName?`<dt>Contato</dt><dd>${esc(c.contactName)}</dd>`:''}${c.address?`<dt>Endereço</dt><dd>${esc(c.address)}</dd>`:''}${(c.custom||[]).map(f=>`<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}<dt>Observações</dt><dd>${c.notes?esc(c.notes):'<span class="muted">Nenhuma ainda</span>'}</dd></dl></div>
      <div class="hcard"><div class="ph"><div><h2>Histórico</h2><p>Todos os orçamentos deste cliente</p></div></div><div class="hist">${c.history.map(h=>`<button type="button" data-open-quote="${esc(h.id)}"><b>${esc(h.services.join(' + '))}</b><b class="v">${money(h.pixCents)}</b><small>${esc(h.number)} · ${br(h.serviceDate||h.date)}</small><span class="st ${STATUS[h.status]?.[1]||'g'}">${STATUS[h.status]?.[0]||h.status}</span></button>`).join('')||'<p class="hint">Sem orçamentos ainda.</p>'}</div></div>`;
  }
  function onProfileClick(e){
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-edit-client')){editing=true;renderProfile();return}
    if(b.hasAttribute('data-cancel-edit')){editing=false;renderProfile();return}
    if(b.dataset.tag){b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));return}
    if(b.hasAttribute('data-add-custom')){const box=$('#client-custom'),i=box.children.length;box.insertAdjacentHTML('beforeend',`<div class="custom-row"><input data-custom-label="${i}" maxlength="60" placeholder="Campo" aria-label="Nome do campo"><input data-custom-value="${i}" maxlength="500" placeholder="Valor" aria-label="Valor do campo"></div>`);box.lastElementChild.firstElementChild.focus();return}
    if(b.dataset.openQuote)root.EcoWorkspace?.openDetail(b.dataset.openQuote).catch(error=>notify(error.message));
  }
  async function onSave(e){
    e.preventDefault();const f=e.target,data=Object.fromEntries(new FormData(f));
    data.tags=[...f.querySelectorAll('#client-tags [aria-pressed=true]')].map(b=>b.dataset.tag);
    data.custom=[...f.querySelectorAll('.custom-row')].map(r=>({label:r.children[0].value,value:r.children[1].value})).filter(x=>x.label.trim());
    const button=f.querySelector('[type=submit]');button.disabled=true;
    try{const saved=detail?.id?await EcoAuth.api('/api/clients/'+encodeURIComponent(detail.id),{method:'PUT',body:JSON.stringify(data)}):await EcoAuth.api('/api/clients',{method:'POST',body:JSON.stringify(data)});selected=saved.id;editing=false;await load();notify('Ficha do cliente salva.')}catch(error){notify(error.message)}finally{button.disabled=false}
  }
  async function settings(){
    const box=$('#commercial-settings');if(!box||!root.EcoAuth?.online)return;
    const [list,f]=await Promise.all([EcoAuth.api('/api/tags'),EcoAuth.api('/api/crm/funnels')]);tags=list;
    const draw=()=>{box.innerHTML=`<div class="settings-card-heading"><div><h2>Tags e funis</h2><p>Classificação dos clientes e etapas do follow-up e pós-venda.</p></div></div>
      <div class="field-group"><span>Tags dos orçamentos</span><div class="tag-editor">${tags.map((t,i)=>`<span class="tag ${tagClass(t.id)}">${esc(t.label)}${tags.length>1?`<button type="button" data-tag-remove="${i}" aria-label="Remover ${esc(t.label)}">×</button>`:''}</span>`).join('')}<form id="tag-add" class="tag-add"><input maxlength="24" placeholder="Nova tag" aria-label="Nova tag" required><button class="secondary small" type="submit">Adicionar</button></form></div></div>
      <div class="funnel-cfg">${[['follow','Follow-up · orçamentos sem resposta'],['pos','Pós-venda · após o atendimento']].map(([k,l])=>`<div><b>${l}</b>${f.funnels[k].map(s=>`<span class="stage-row"><i></i>${esc(s.label)}<small>${s.days==null?(s.id==='lost'?'com motivo':'manual'):k==='follow'?s.days+' dias após gerar':s.id==='p4'?'6 meses ou aniversário':s.days+' dia'+(s.days>1?'s':'')+' após concluir'}</small></span>`).join('')}</div>`).join('')}</div>`;
      box.querySelector('#tag-add').onsubmit=async e=>{e.preventDefault();const v=e.target.querySelector('input').value.trim();if(!v)return;try{tags=await EcoAuth.api('/api/tags',{method:'PUT',body:JSON.stringify([...tags,{label:v}])});draw();notify('Tag adicionada.')}catch(err){notify(err.message)}};
      box.querySelectorAll('[data-tag-remove]').forEach(b=>b.onclick=async()=>{const next=tags.filter((_,i)=>i!==+b.dataset.tagRemove);try{tags=await EcoAuth.api('/api/tags',{method:'PUT',body:JSON.stringify(next)});draw();notify('Tag removida. Orçamentos antigos mantêm a marcação.')}catch(err){notify(err.message)}});};
    draw();
  }
  window.addEventListener('hashchange',()=>{if(location.hash==='#configuracoes')settings().catch(()=>null)});
  Promise.resolve(root.EcoAuth?.ready).then(()=>settings()).catch(()=>null);
  function open(){if(!$('#client-rows'))shell();load().catch(error=>notify(error.message))}
  window.addEventListener('eco:data-changed',()=>{if(!$('#clients-view')?.hidden)load().catch(()=>null)});
  root.EcoClients={open,load,settings};
})(globalThis);
