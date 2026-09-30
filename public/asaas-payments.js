(function(){
'use strict';
const $=(s,p=document)=>p.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0)/100);
const api=(url,body,method=body?'POST':'GET')=>EcoAuth.api(url,{method,...(body?{body:JSON.stringify(body)}:{})});
const label={PENDING:'Aguardando pagamento',AWAITING_PAYMENT:'Aguardando pagamento',OVERDUE:'Vencida',RECEIVED:'Recebida',CONFIRMED:'Confirmada',RECEIVED_IN_CASH:'Recebida',DELETED:'Cancelada',REFUNDED:'Estornada',REFUND_REQUESTED:'Estorno solicitado',CHARGEBACK_REQUESTED:'Contestação recebida',CHARGEBACK_DISPUTE:'Em contestação'};
const active=status=>['PENDING','AWAITING_PAYMENT','OVERDUE'].includes(String(status));
let serial=0;
function safeUrl(value){try{const url=new URL(value);return url.protocol==='https:'?url.toString():''}catch{return ''}}
function status(payment){return '<span class="asaas-status '+(active(payment.status)?'pending':'')+'">'+esc(label[payment.status]||payment.status)+'</span>'}
function paymentRow(payment){
 const title=payment.kind==='pix'?'PIX à vista':'Cartão de crédito',subtitle=payment.kind==='pix'?'Valor com desconto à vista':payment.installmentCount>1?payment.installmentCount+'x de '+money(Math.round(payment.amountCents/payment.installmentCount))+' · sem juros':'À vista no cartão',url=safeUrl(payment.invoiceUrl);
 return '<article class="asaas-payment"><div><strong>'+title+'</strong><p>'+subtitle+' · vencimento '+esc(payment.dueDate.split('-').reverse().join('/'))+'</p></div><div class="asaas-payment-value"><strong>'+money(payment.amountCents)+'</strong>'+status(payment)+'</div><div class="asaas-payment-actions">'+(url&&active(payment.status)?'<a class="text-button" href="'+esc(url)+'" target="_blank" rel="noopener">Abrir link ↗</a><button class="text-button" type="button" data-asaas-copy="'+esc(payment.id)+'">Copiar link</button><button class="text-button danger-button" type="button" data-asaas-cancel="'+esc(payment.id)+'">Cancelar</button>':'')+'</div></article>';
}
function dialog(){let d=$('#asaas-payment-dialog');if(d)return d;d=document.createElement('dialog');d.id='asaas-payment-dialog';d.className='dre-dialog asaas-dialog';document.body.append(d);return d;}
function openIssue(quote,onDone){
 const d=dialog();d.innerHTML='<header><h2>Gerar links de pagamento</h2><button type="button" class="icon-button" data-close aria-label="Fechar">×</button></header><form class="dre-form"><p class="dre-note wide">O CPF ou CNPJ é enviado somente à Asaas para identificar o pagador. Ele não é incluído no PDF, no orçamento ou no backup comercial.</p><label class="wide">Nome do pagador<input name="name" maxlength="255" required value="'+esc(quote.client||'')+'"></label><label>CPF ou CNPJ<input name="cpfCnpj" inputmode="numeric" autocomplete="off" maxlength="18" required></label><label>E-mail <small>opcional</small><input name="email" type="email" maxlength="255"></label><label class="wide">Celular <small>opcional</small><input name="mobilePhone" inputmode="tel" maxlength="20"></label><p class="dre-error wide" role="alert"></p><footer><button class="primary" type="submit">Gerar PIX e cartão</button></footer></form>';
 $('[data-close]',d).onclick=()=>d.close();const f=$('form',d);f.onsubmit=async event=>{event.preventDefault();const b=$('[type=submit]',f),error=$('.dre-error',f);b.disabled=true;error.textContent='';try{const result=await api('/api/proposals/'+encodeURIComponent(quote.id)+'/payments',{name:f.elements.name.value,cpfCnpj:f.elements.cpfCnpj.value,email:f.elements.email.value,mobilePhone:f.elements.mobilePhone.value});d.close();await onDone(result);EcoStudio.notify(result.partial?(result.warning||'Um dos links não pôde ser emitido; tente gerar novamente.'):'Links de pagamento gerados.');}catch(err){error.textContent=err.message;}finally{b.disabled=false;}};if(!d.open)d.showModal();
}
async function copy(text){try{await navigator.clipboard.writeText(text);EcoStudio.notify('Link copiado.');}catch{EcoStudio.notify('Não foi possível copiar o link neste navegador.');}}
async function mount(host,quote,{demo=false}={}){
 const current=++serial;host.classList.add('asaas-detail');
 if(demo){host.innerHTML='<h3>Links de pagamento</h3><p class="hint">Cobranças Asaas não são criadas nos exemplos.</p>';return;}
 host.innerHTML='<h3>Pagamento</h3><p class="hint">Verificando a integração Asaas...</p>';
 try{
  const [setup,data]=await Promise.all([api('/api/asaas/status'),api('/api/proposals/'+encodeURIComponent(quote.id)+'/payments')]);if(current!==serial||!host.isConnected)return;
  const relevant=(data.payments||[]).filter(x=>x.revision===quote.revision),hasLinks=relevant.some(x=>active(x.status));
  host.innerHTML='<h3>Pagamento</h3><p class="hint">'+esc(setup.message)+'</p>'+(setup.webhookURL?'<p class="asaas-webhook">Webhook: <code>'+esc(setup.webhookURL)+'</code></p>':'')+(relevant.length?'<div class="asaas-payment-list">'+relevant.map(paymentRow).join('')+'</div>':'')+'<div class="asaas-issue-actions">'+(hasLinks?'<button type="button" class="secondary" data-asaas-issue>Ver dados para novos links</button>':'<button type="button" class="primary" data-asaas-issue '+(!setup.configured?'disabled':'')+'>Gerar links PIX e cartão</button>')+'</div>';
  $('[data-asaas-issue]',host)?.addEventListener('click',()=>openIssue(quote,async()=>mount(host,quote,{demo})));
  host.querySelectorAll('[data-asaas-copy]').forEach(button=>button.addEventListener('click',()=>{const payment=relevant.find(x=>x.id===button.dataset.asaasCopy);if(payment)copy(payment.invoiceUrl)}));
  host.querySelectorAll('[data-asaas-cancel]').forEach(button=>button.addEventListener('click',async()=>{const payment=relevant.find(x=>x.id===button.dataset.asaasCancel);if(!payment||!confirm('Cancelar este link de pagamento? O cliente não poderá mais utilizá-lo.'))return;button.disabled=true;try{await api('/api/proposals/'+encodeURIComponent(quote.id)+'/payments/'+encodeURIComponent(payment.id)+'/cancel',{},'POST');EcoStudio.notify('Link de pagamento cancelado.');await mount(host,quote,{demo});}catch(error){EcoStudio.notify(error.message);button.disabled=false;}}));
 }catch(error){if(current===serial&&host.isConnected)host.innerHTML='<h3>Pagamento</h3><p class="inline-error">'+esc(error.message)+'</p>';}
}
window.HerbocleanAsaas={mount};
})();
