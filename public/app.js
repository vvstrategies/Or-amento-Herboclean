(async function () {
  'use strict';
  await EcoAuth.ready;
  const normalize=raw=>({...EcoModel.normalize(raw),revision:raw.revision});
  const M=EcoModel, $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
  const quoteAmount=value=>{try{return money(M.totals(value).total)}catch{return 'Confira as condições de pagamento'}};
  const date=v=>new Date(v+'T12:00:00').toLocaleDateString('pt-BR');
  const settingsKey='ecoclean-settings-v2';
  let settings={company:M.company(),terms:M.terms()}, q, saved=[], db, timer, toastTimer, version=0, pendingPhotos=0, lastCepLookup='', cepRequest=0;
  function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',5500)}
  settings=await EcoAuth.api('/api/settings');
  M.configure(settings);UniversalBrand.apply(settings.company);
  q=M.quote(settings);
  const database=EcoStore.ready,operation=EcoStore.operation;
  const put=async(store,value)=>{const result=await EcoStore.put(store,structuredClone(value));if(EcoAuth.online&&store==='quotes'){value.revision=result.revision;if(q.id===value.id)q.revision=result.revision}return result};
  const get=EcoStore.get;
  async function refreshSaved(){saved=(await EcoStore.all('quotes')).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));$('#saved-count').textContent=saved.length;renderLibrary()}
  async function saveDraft(){const current=version;try{await put('draft',{id:'current',quote:structuredClone(q)});if(current===version)$('#draft-status').textContent='Rascunho salvo automaticamente'}catch{$('#draft-status').textContent='Não foi possível salvar. Exporte um backup.'}}
  function changed(){q.updatedAt=new Date().toISOString();version++;$('#draft-status').textContent='Salvando rascunho...';clearTimeout(timer);timer=setTimeout(saveDraft,500);render()}
  function fill(){
    for(const input of $$('#form [name]'))input.value=input.name==='postalCode'?M.formatPostalCode(q.postalCode):Object.hasOwn(q.terms,input.name)?q.terms[input.name]:q[input.name]??'';
    for(const input of $$('[data-company]'))input.value=q.company[input.dataset.company]??'';
    $('#logo-preview').hidden=!q.company.logo;$('#logo-preview').src=q.company.logo||'';$('#logo-preview').style.background=q.company.logoBackground==='light'?'#fff':UniversalCompany.theme(q.company).deep;
    renderItems();render();
  }
  function renderItems(){
    $('#items-count').textContent=q.items.length===1?'1 item':q.items.length+' itens';
    $('#items').innerHTML=q.items.map((it,i)=>`<article class="service-card" data-id="${esc(it.id)}"><div class="item-head"><strong>ITEM ${String(i+1).padStart(2,'0')}</strong><button type="button" class="icon-button" data-action="remove" aria-label="Excluir item ${i+1}">×</button></div><label>Serviço<select data-field="service" required>${!M.services.some(s=>s.name===it.service)?`<option value="${esc(it.service)}">${esc(it.service)} (anterior)</option>`:''}${M.services.map(s=>`<option ${s.name===it.service?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><div class="item-values"><label>Quantidade<input type="number" data-field="quantity" min="0.01" max="100000" step="0.01" value="${it.quantity}" required></label><label>Unidade<select data-field="unit"><option ${it.unit==='un.'?'selected':''}>un.</option><option ${it.unit==='m²'?'selected':''}>m²</option></select></label><label>Preço PIX unit. (R$)<input type="number" data-field="price" min="0" max="1000000" step="0.01" value="${it.price}" placeholder="0,00" required></label></div><label class="photo-upload">＋ Adicionar fotos dos itens<input type="file" data-photo accept="image/png,image/jpeg,image/webp" multiple aria-label="Adicionar fotos ao item ${i+1}"></label><div class="photos">${it.photos.map((p,n)=>`<div class="photo-thumb"><img src="${p}" alt="${esc(it.service)}, foto ${n+1}"><button type="button" data-action="remove-photo" data-photo-index="${n}" aria-label="Remover foto ${n+1}">×</button></div>`).join('')}</div><details class="optional"><summary>Ajustar descrição do serviço</summary><label><textarea data-field="description" maxlength="1500" rows="3">${esc(it.description)}</textarea></label></details><div class="item-total"><span>Total do item no PIX</span><strong data-item-total>${money(Math.round(Math.round(Number(it.price)*100)*Number(it.quantity)))}</strong></div></article>`).join('');
  }
  function footer(){const c=q.company;return `<footer class="doc-footer">${c.logo?`<span class="brand-logo footer-logo ${'custom-logo'}" style="background:${c.logoBackground==='light'?'#fff':UniversalCompany.theme(c).deep}"><img src="${c.logo}" alt="${esc(c.name)}"></span>`:`<span class="company-initials">${esc(UniversalCompany.initials(c.name))}</span>`}<div>${[c.name,c.taxId,c.location,[c.phone,c.email].filter(Boolean).join(' · ')].filter(Boolean).map(esc).join('<br>')}</div></footer>`}
  function render(){
    let t;
    try{t=M.totals(q)}catch(error){$('#fee-summary').textContent=error.message;$('#proposal').innerHTML=`<div class="sheet doc-body">${esc(error.message)}</div>`;return}
    const c=q.company,validUntil=new Date(q.date+'T12:00:00');validUntil.setDate(validUntil.getDate()+q.terms.validity);
    const installment=t.remainder?`${t.remainder} parcela(s) de ${money(t.part+1)} e ${t.count-t.remainder} de ${money(t.part)}`:`${t.count}x de ${money(t.part)} sem juros`;
    $('#proposal').innerHTML=`<article class="sheet" style="${UniversalBrand.style(c)}"><header class="doc-hero ${c.logoBackground==='light'?'light':''}">${c.logo?`<span class="brand-logo hero-logo ${'custom-logo'}" style="background:${c.logoBackground==='light'?'#fff':UniversalCompany.theme(c).deep}"><img src="${c.logo}" alt="${esc(c.name)}"></span>`:`<span class="company-initials">${esc(UniversalCompany.initials(c.name))}</span>`}<p class="company-title">${esc(c.name)}</p><p class="tagline">${esc(c.tagline)}</p></header><div class="doc-body"><div class="doc-kicker">PROPOSTA COMERCIAL</div><div class="doc-meta"><span>${esc(q.number)}</span><span>Emissão: ${date(q.date)}</span></div><h2 class="doc-title">${esc(c.proposalSubtitle||c.proposalTitle)}</h2><div class="doc-client">${esc(q.client||'Nome do cliente')}</div><div class="doc-address">${[q.address,q.clientContact].filter(Boolean).map(esc).join('<br>')||'Endereço do atendimento'}</div><p class="doc-intro">${esc(c.intro)}</p><div class="scope-title"><span>ESCOPO DOS SERVIÇOS</span><span>${q.items.length} ${q.items.length===1?'item':'itens'}</span></div><table class="service-table"><thead><tr><th>FOTOS</th><th>SERVIÇO</th><th>QTD.</th><th>UNIT. PIX</th><th>TOTAL PIX</th></tr></thead><tbody>${q.items.map((it,i)=>`<tr><td>${it.photos.length?`<div class="row-photos ${it.photos.length>1?'multi':''}">${it.photos.map(p=>`<img src="${p}" alt="${esc(it.service)}">`).join('')}</div>`:'<span class="no-photo">Sem foto</span>'}</td><td><strong>${esc(it.service)}</strong><small>${esc(it.description)}</small></td><td>${Number(it.quantity).toLocaleString('pt-BR')} ${esc(it.unit)}</td><td>${money(Math.round(Number(it.price)*100))}</td><td>${money(t.rows[i])}</td></tr>`).join('')}</tbody></table><div class="commercial-summary"><div class="investment"><span class="doc-kicker">SUA PROPOSTA</span><h2>Investimento total</h2><div class="amount">${money(t.total)}</div></div><div class="payments"><div class="payment"><span class="label">VALOR NO PIX</span><strong>${money(t.pix)}</strong><small>${t.saving?`Economize ${money(t.saving)} no pagamento à vista`:'Pagamento à vista'}</small></div><div class="payment"><span class="label">CARTÃO</span><strong>${money(t.part+(t.remainder?1:0))}${t.count>1?' / parcela':''}</strong><small>${t.count>1?installment:'Em 1x'}<br>Total: ${money(t.total)}</small></div></div></div>${c.benefits.trim()?`<h3 class="doc-section-title">Por que escolher a ${esc(c.name)}</h3><ul class="benefits">${c.benefits.split('\n').filter(x=>x.trim()).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${q.terms.notes.trim()?`<h3 class="doc-section-title">Condições do atendimento</h3><div class="doc-notes">${esc(q.terms.notes)}</div>`:''}<div class="validity"><strong>Validade da proposta</strong><br>${q.terms.validity} dias a partir da emissão, até ${validUntil.toLocaleDateString('pt-BR')}.<br>Para combinar o atendimento, entre em contato${c.phone?' pelo '+esc(c.phone):' com nossa equipe'}.</div>${footer()}</div></article>`;
    $('#fee-summary').textContent=`PIX: ${money(t.pix)} · Cartão: ${t.count}x de ${money(t.part)} · Líquido estimado: ${money(t.net)}. ${q.terms.anticipate==='yes'?'Antecipação incluída.':'Sem antecipação.'}`;
    $$('#items [data-item-total]').forEach((el,i)=>el.textContent=money(t.rows[i]));
  }
  const addressFields=new Set(['addressStreet','addressNumber','addressComplement','addressNeighborhood','addressCity','addressState']);
  function cepStatus(message,kind=''){const status=$('#cep-status');status.textContent=message;status.dataset.state=kind;}
  function clearCepAddress(){for(const key of [...addressFields,'addressIbgeCode'])q[key]='';q.address='';}
  function updateStructuredAddress(){const address=M.addressFromFields(q);if(address){q.address=address;const input=$('#form [name="address"]');if(input)input.value=address;}}
  async function lookupCep(){
    const postalCode=M.digits(q.postalCode);if(postalCode.length!==8)return;
    if(lastCepLookup===postalCode)return;
    const request=++cepRequest;lastCepLookup=postalCode;cepStatus('Buscando endereço...','loading');
    try{
      const value=await EcoAuth.api('/api/cep/'+postalCode);if(request!==cepRequest||q.postalCode!==postalCode)return;
      Object.assign(q,{postalCode:value.postalCode,addressStreet:value.street||'',addressNeighborhood:value.neighborhood||'',addressCity:value.city||'',addressState:value.state||'',addressIbgeCode:value.ibgeCode||'',addressSource:'cep'});updateStructuredAddress();fill();cepStatus('Endereço encontrado. Informe o número.','success');changed();
      if(!q.addressNumber)$('#form [name="addressNumber"]')?.focus();
    }catch(error){if(request!==cepRequest)return;lastCepLookup='';cepStatus(error.message||'Não foi possível consultar este CEP. Preencha o endereço manualmente.','error');}
  }
  $('#form').addEventListener('input',e=>{
    const field=e.target.name;
    if(field){
      if(field==='postalCode'){
        const postalCode=M.digits(e.target.value),changedCep=q.postalCode!==postalCode;q.postalCode=postalCode;e.target.value=M.formatPostalCode(postalCode);
        if(changedCep&&q.addressSource!=='manual'){clearCepAddress();q.addressSource='';}
        if(postalCode.length<8){lastCepLookup='';cepRequest++;cepStatus('','');}
        changed();if(postalCode.length===8)lookupCep();
      }else if(addressFields.has(field)){
        q[field]=field==='addressState'?e.target.value.toUpperCase():e.target.value;q.addressSource='manual';updateStructuredAddress();changed();
      }else if(field==='address'){
        q.address=e.target.value;q.addressSource='manual';changed();
      }else {if(Object.hasOwn(q.terms,field))q.terms[field]=e.target.type==='number'?Number(e.target.value):e.target.value;else q[field]=e.target.value;changed();}
    }
    const key=e.target.dataset.field;
    if(key){const it=q.items.find(x=>x.id===e.target.closest('[data-id]').dataset.id);it[key]=['quantity','price'].includes(key)?e.target.value===''?'':Number(e.target.value):e.target.value;if(key==='service'){const preset=M.services.find(s=>s.name===it.service);it.unit=preset.unit;it.description=preset.description;renderItems()}changed()}
  });
  $('#lookup-cep').onclick=()=>{if(M.digits(q.postalCode).length!==8){cepStatus('Informe um CEP com 8 dígitos.','error');return}lastCepLookup='';lookupCep();};
  $('#items').addEventListener('click',e=>{const action=e.target.dataset.action;if(!action)return;const it=q.items.find(x=>x.id===e.target.closest('[data-id]').dataset.id);if(action==='remove'){if(q.items.length===1)return toast('Mantenha pelo menos um serviço.');q.items=q.items.filter(x=>x!==it)}else it.photos.splice(Number(e.target.dataset.photoIndex),1);renderItems();changed()});
  $('#add').onclick=()=>{if(q.items.length>=100)return toast('Limite de 100 serviços por proposta.');q.items.push(M.item());renderItems();changed()};
  async function readImage(file,logo=false){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Use PNG, JPG ou WebP de até 20 MB.');
    const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,(logo?1400:1000)/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');if(!logo){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)}ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL(logo?'image/png':'image/jpeg',.85)}finally{URL.revokeObjectURL(url)}
  }
  $('#items').addEventListener('change',async e=>{if(!e.target.hasAttribute('data-photo'))return;const current=q,it=q.items.find(x=>x.id===e.target.closest('[data-id]').dataset.id),files=[...e.target.files];if(it.photos.length+files.length>6)return toast('Use até 6 fotos por serviço.');pendingPhotos++;$('#draft-status').textContent='Preparando fotos...';try{const images=await Promise.all(files.map(f=>readImage(f)));if(current===q&&q.items.includes(it)){it.photos.push(...images);renderItems();changed()}}catch(error){toast(error.message)}finally{pendingPhotos--;e.target.value=''}});
  $('#company-fields').addEventListener('input',e=>{const key=e.target.dataset.company;if(!key)return;q.company[key]=e.target.value;if(key==='logoBackground')$('#logo-preview').style.background=e.target.value==='light'?'#fff':UniversalCompany.theme(q.company).deep;$('#settings-status').textContent='Alteração aplicada a esta proposta. Salve a identidade para reutilizá-la.';changed()});
  $('#logo-upload').onchange=async e=>{const current=q;if(!e.target.files[0])return;pendingPhotos++;try{const result=await readImage(e.target.files[0],true);if(q===current){q.company.logo=result;$('#logo-preview').src=result;$('#logo-preview').hidden=false;changed();$('#settings-status').textContent='Logo aplicada. Salve a identidade para os próximos orçamentos.'}}catch(error){toast(error.message)}finally{pendingPhotos--;e.target.value=''}};
  async function persistSettings(){settings=await EcoAuth.api('/api/settings',{method:'PUT',body:JSON.stringify(settings)});M.configure(settings);UniversalBrand.apply(settings.company)}
  $('#save-company').onclick=async()=>{if(!$('#company-fields input[type=email]').reportValidity())return;if(!q.company.name.trim())return toast('Informe o nome da empresa.');if(pendingPhotos)return toast('Aguarde o carregamento das imagens.');try{settings.company=M.normalizeCompany(q.company);await persistSettings();$('#settings-status').textContent='Identidade salva para os próximos orçamentos.';toast('Dados da empresa salvos.')}catch{toast('Não foi possível salvar a identidade. Exporte um backup.')}};
  $('#apply-asaas').onclick=()=>{const {validity,notes}=q.terms;q.terms={...M.terms(),validity,notes};fill();changed();toast('Padrão Asaas aplicado. Use Salvar condições para os próximos orçamentos.');};
  $('#remember-terms').onclick=async()=>{for(const el of $$('#form .fee-settings input,#form input[name=installments],#form input[name=validity]'))if(!el.reportValidity())return;try{settings.terms=M.normalizeTerms(q.terms);await persistSettings();toast('Condições salvas para os próximos orçamentos.')}catch{toast('Não foi possível salvar. Exporte um backup.')}};
  $('#restore-brand').onclick=()=>{q.company=structuredClone(settings.company);fill();changed();$('#settings-status').textContent='Identidade salva aplicada a esta proposta.'};
  function meaningful(){return q.client.trim()||q.items.some(i=>i.price!==''||i.photos.length)}
  const revisionConflict=error=>String(error?.message||'').includes('atualizado em outra aba');
  async function preserve({allowRevisionConflict=false}={}){clearTimeout(timer);if(!meaningful())return true;try{await put('quotes',q);return true}catch(error){if(allowRevisionConflict&&revisionConflict(error))return false;throw error}}
  async function newQuote(){
    if(pendingPhotos)throw Error('Aguarde o carregamento das fotos.');
    try{await preserve({allowRevisionConflict:true})}catch(error){
      // A previous agenda operation must not prevent the operator from starting a
      // separate proposal. The existing draft remains available on the server.
      if(!/agendamento terminar|operação deste orçamento está em andamento|operação em andamento/i.test(String(error.message||'')))throw error;
      await saveDraft().catch(()=>null);
    }
    q=M.quote(settings);fill();changed();await refreshSaved();window.EcoWorkspace?.navigate('create');toast('Novo orçamento pronto. Os dados da empresa já estão preenchidos.')
  }
  $('#new').onclick=()=>newQuote().catch(error=>toast(error.message));
  $('#save').onclick=async()=>{try{if(!$('#form').reportValidity())return;M.validate(q);if(pendingPhotos)return toast('Aguarde as fotos.');await put('quotes',q);await saveDraft();await refreshSaved();toast('Orçamento salvo.')}catch(error){toast(error.message||'Não foi possível salvar.')}};
  function renderLibrary(){window.dispatchEvent(new CustomEvent('eco:quotes-changed'))}
  $('#library').onclick=()=>window.EcoWorkspace?.navigate('quotes');
  async function openQuote(id){
    if(pendingPhotos)throw Error('Aguarde o carregamento das fotos.');
    const selected=await get('quotes',id);if(!selected)throw Error('Orçamento não encontrado.');
    await preserve({allowRevisionConflict:true});q=normalize(await get('quotes',id));fill();changed();window.EcoWorkspace?.navigate('create');
  }
  const jobs=new Map();
  async function generatePDF(proposal,force=false){
    const target=structuredClone(proposal);M.validate(target);
    if(jobs.has(target.id))return jobs.get(target.id);
    const job=(async()=>{
      if(EcoAuth.online){const saved=await put('quotes',target);const result=await EcoAuth.api('/api/proposals/'+target.id+'/pdf',{method:'POST',body:JSON.stringify({revision:saved.revision,force})});result.blob=await EcoStore.blob(result);if(q.id===target.id)await saveDraft();await refreshSaved();return result;}
      const fingerprint=await EcoStore.fingerprint(target),documents=await EcoStore.pdfs(target.id);
      const current=documents.sort((a,b)=>b.version-a.version)[0];
      if(!force&&current?.fingerprint===fingerprint)return current;
      let blob;
      if(location.protocol==='file:')blob=await EcoCreatePDFBlob(target);
      else{
        const response=await fetch('/api/gerar-orcamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(target)});
        const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível gerar o PDF.');
        const file=await fetch(data.caminhoOrcamento);if(!file.ok)throw Error('Não foi possível recuperar o PDF gerado.');blob=new Blob([await file.arrayBuffer()],{type:'application/pdf'});
      }
      const result=await EcoStore.savePDF(target,blob,fingerprint);await refreshSaved();return result;
    })();
    jobs.set(target.id,job);try{return await job}finally{jobs.delete(target.id)}
  }
  $('#pdf').onclick=async()=>{
    if(!$('#form').reportValidity())return;
    const button=$('#pdf');
    try{
      if(pendingPhotos)return toast('Aguarde o carregamento das fotos.');
      button.disabled=true;button.textContent='Gerando PDF...';
      const document=await generatePDF(q);EcoDownloadBlob(document.blob,document.filename);
      await window.EcoWorkspace?.refresh();window.EcoWorkspace?.navigate('quotes');
      toast('Orçamento gerado com sucesso. PDF baixado.');
    }catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Gerar PDF ↗'}
  };
  $('#backup').onclick=async()=>{
    try{
      if(pendingPhotos)throw Error('Aguarde as fotos antes de exportar.');
      $('#backup').disabled=true;await refreshSaved();
      if(EcoAuth.online){await preserve();await saveDraft();const payload=await EcoAuth.api('/api/backup');EcoDownloadBlob(new Blob([JSON.stringify(payload)],{type:'application/json'}),`orcamento-backup-${M.today()}.json`);toast('Backup completo exportado.');return;}
      const proposals=[q,...saved.filter(x=>x.id!==q.id)],extras=await EcoStore.exportExtras(proposals.map(x=>x.id));
      const payload={version:3,settings,proposals,...extras};
      EcoDownloadBlob(new Blob([JSON.stringify(payload)],{type:'application/json'}),`orcamento-backup-${M.today()}.json`);
      toast('Backup gerado com propostas, fotos, status, pré-agendamentos e PDFs.');
    }catch(error){toast('Não foi possível exportar: '+error.message)}finally{$('#backup').disabled=false}
  };
  $('#import').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(pendingPhotos)throw Error('Aguarde o carregamento das fotos.');
      if(file.size>100*1024*1024)throw Error('O backup deve ter até 100 MB.');
      const data=JSON.parse(await file.text());
      if(EcoAuth.online){const result=await EcoAuth.api('/api/import',{method:'POST',body:JSON.stringify(data)});settings=await EcoAuth.api('/api/settings');await refreshSaved();toast(result.imported+' orçamento(s) importado(s).');return;}
      if(![1,2,3,4].includes(data.version)||!Array.isArray(data.proposals)||!data.proposals.length||data.proposals.length>500||!Array.isArray(data.operations||[])||!Array.isArray(data.documents||[]))throw Error('Arquivo de backup inválido.');
      const idMap=new Map();
      const incoming=data.proposals.map(raw=>{const id=crypto.randomUUID();idMap.set(raw.id,id);return M.normalize({...raw,id})});
      await preserve();await EcoStore.importBatch(incoming,data,idMap);
      // A importação não altera a configuração desta instalação.
      q=incoming[0];fill();changed();await refreshSaved();toast('Backup importado. O histórico anterior foi preservado.');
    }catch(error){toast('Falha na importação: '+error.message)}finally{e.target.value=''}
  };
  document.querySelector('#edit-company-profile').onclick=()=>EcoAuth.editCompany();
  fill();
  try{
    await database;
    if(!EcoAuth.online&&!localStorage.getItem('orcamento-universal-migrated-v1')){const old=JSON.parse(localStorage.getItem('orcamento-universal-legacy-propostas')||'[]');if(Array.isArray(old))for(const p of old){try{await put('quotes',M.normalize(p))}catch{}}localStorage.setItem('orcamento-universal-migrated-v1','1')}
    const draft=await get('draft','current');if(draft?.quote){q=normalize(draft.quote);fill()}
    await refreshSaved();$('#draft-status').textContent=draft?'Rascunho anterior recuperado':'Identidade da empresa carregada';
  }catch(error){$('#draft-status').textContent='Armazenamento indisponível. Use o backup.';toast(error.message||'Use o backup para guardar os dados.')}
  window.EcoStudio={openQuote,newQuote,generatePDF,refresh:refreshSaved,notify:toast,getDraft:()=>structuredClone(q)};
  window.dispatchEvent(new CustomEvent('eco:ready'));
  window.addEventListener('beforeunload',e=>{if(pendingPhotos||$('#draft-status').textContent==='Salvando rascunho...'){e.preventDefault();e.returnValue=''}});
})();
