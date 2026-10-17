(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const field=(label,name,value='',type='text',max=240)=>`<label>${label}<input name="${name}" type="${type}" maxlength="${max}" value="${esc(value)}" ${name==='name'?'required':''}></label>`;
  const customRow=(c={})=>`<div class="chat-custom-row"><input maxlength="60" placeholder="Campo" aria-label="Nome do campo personalizado" value="${esc(c.label)}"><input maxlength="500" placeholder="Valor" aria-label="Valor do campo personalizado" value="${esc(c.value)}"><button type="button" class="chat-icon" data-custom-remove aria-label="Remover campo personalizado">×</button></div>`;
  function render({container,client:c,tags,onSave,onView,onQuote,onError}){
    const birthday=c.birthday?c.birthday.slice(3)+'/'+c.birthday.slice(0,2):'';
    container.innerHTML=`<div class="chat-profile-avatar">${esc(c.name.split(/\s+/).slice(0,2).map(x=>x[0]).join(''))}</div><form class="chat-profile-form">
      ${field('Nome','name',c.name)}<div class="chat-field-row">${field('WhatsApp','phone',c.phone,'tel',60)}${field('Aniversário (DD/MM)','birthday',birthday,'text',5)}</div>
      <div class="chat-field-row">${field('E-mail','email',c.email,'email')}${field('Contato na empresa','contactName',c.contactName)}</div>
      <label>Endereço<textarea name="address" rows="3" maxlength="800">${esc(c.address)}</textarea></label>
      <fieldset class="chat-client-choices"><legend>Tipo de cliente</legend><div>${tags.map(t=>`<button type="button" data-client-tag="${esc(t.id)}" aria-pressed="${(c.tags||[]).includes(t.id)}">${esc(t.label)}</button>`).join('')}</div></fieldset>
      <fieldset class="chat-client-choices"><legend>Origem do cliente</legend><div>${Object.entries(EcoModel.origins).map(([id,label])=>`<button type="button" data-client-origin="${id}" aria-pressed="${c.origin===id}">${esc(label)}</button>`).join('')}</div><small>Selecione o canal de origem; clique novamente para limpar.</small></fieldset>
      <label>Observações<textarea name="notes" rows="3" maxlength="3000">${esc(c.notes)}</textarea></label>
      <div class="chat-custom-fields"><h3>Campos personalizados</h3><p>Responsável, melhor horário, pet em casa…</p><div class="chat-custom-rows">${(c.custom?.length?c.custom:[{}]).map(customRow).join('')}</div><button type="button" class="chat-link" data-custom-add>+ Campo personalizado</button></div>
      <button class="chat-primary" type="submit">Salvar ficha</button></form>
      <section class="chat-history"><h3>Orçamentos <span>${c.quoteCount}</span></h3>${c.history.map(q=>`<button type="button" class="chat-quote-card" data-client-quote="${esc(q.id)}"><strong>${esc(q.number)}</strong><span>${(q.pixCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span><small>${esc(q.services.join(', '))} · ${esc(EcoOperations.statuses[q.status]||q.status)}</small><small>Visualizar orçamento →</small></button>`).join('')||'<p>Ainda sem orçamento. Crie o primeiro sem sair da conversa.</p>'}<button class="chat-secondary" type="button" data-client-new>Novo orçamento</button></section>`;
    container.onclick=e=>{const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-client-tag'))b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));
      if(b.hasAttribute('data-client-origin')){const was=b.getAttribute('aria-pressed')==='true';for(const option of container.querySelectorAll('[data-client-origin]'))option.setAttribute('aria-pressed','false');b.setAttribute('aria-pressed',String(!was))}
      if(b.hasAttribute('data-custom-remove'))b.closest('.chat-custom-row').remove();
      if(b.hasAttribute('data-custom-add')){const rows=container.querySelector('.chat-custom-rows');if(rows.children.length>=20)return onError('Use até 20 campos personalizados.');rows.insertAdjacentHTML('beforeend',customRow());rows.lastElementChild.querySelector('input').focus()}
      if(b.dataset.clientQuote)onView(b.dataset.clientQuote).catch(e=>onError(e.message));
      if(b.hasAttribute('data-client-new'))onQuote().catch(e=>onError(e.message));
    };
    container.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=e.submitter,data=Object.fromEntries(new FormData(form));
      data.tags=[...form.querySelectorAll('[data-client-tag][aria-pressed=true]')].map(b=>b.dataset.clientTag);
      data.origin=form.querySelector('[data-client-origin][aria-pressed=true]')?.dataset.clientOrigin||'';
      data.custom=[...form.querySelectorAll('.chat-custom-row')].map(row=>({label:row.children[0].value,value:row.children[1].value})).filter(c=>c.label.trim());
      button.disabled=true;try{await onSave(data)}catch(error){onError(error.message)}finally{button.disabled=false}
    };
  }
  root.EcoChatCustomer={render};
})(window);
