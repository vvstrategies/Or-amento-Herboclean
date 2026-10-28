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
  let settings={company:M.company(),terms:M.terms()}, q, saved=[], db, timer, toastTimer, version=0, pendingPhotos=0, lastCepLookup='', cepRequest=0, previewMode='a4', tagOptions=[{id:'corporativo',label:'CORPORATIVO'},{id:'residencial',label:'RESIDENCIAL'}], knownClients=[], activeItem=null;
  const M2=['carpete','tapete','persiana','cortina'];
  const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const bdayText=v=>/^\d{2}-\d{2}$/.test(v||'')?v.slice(3)+'/'+v.slice(0,2):'';
  const bdayValue=v=>{const m=String(v||'').match(/^(\d{1,2})\/(\d{1,2})$/);if(!m)return '';const d=+m[1],mo=+m[2];if(mo<1||mo>12||d<1||d>[31,29,31,30,31,30,31,31,30,31,30,31][mo-1])return '';return String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0')};
  function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',5500)}
  settings=await EcoAuth.api('/api/settings');
  M.configure(settings);UniversalBrand.apply(settings.company);
  q=M.quote(settings);
  const database=EcoStore.ready,operation=EcoStore.operation;
  const put=async(store,value)=>{const result=await EcoStore.put(store,structuredClone(value));if(EcoAuth.online&&store==='quotes'){value.revision=result.revision;if(q.id===value.id)q.revision=result.revision}return result};
  const get=EcoStore.get;
  async function refreshSaved(){saved=(await EcoStore.all('quotes')).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));$('#saved-count').textContent=saved.length;renderLibrary()}
  async function saveDraft(){const current=version;try{await put('draft',{id:'current',quote:structuredClone(q)});if(current===version)$('#draft-status').textContent='Rascunho salvo automaticamente'}catch{$('#draft-status').textContent='Não foi possível salvar. Exporte um backup.'}}
  function changed(){q.updatedAt=new Date().toISOString();version++;$('#draft-status').textContent='Salvando rascunho...';clearTimeout(timer);timer=setTimeout(saveDraft,500);renderSoon()}
  function fill(){
    for(const input of $$('#form [name]'))input.value=input.name==='postalCode'?M.formatPostalCode(q.postalCode):input.name==='clientBirthday'?bdayText(q.clientBirthday):Object.hasOwn(q.terms,input.name)?q.terms[input.name]:q[input.name]??'';
    renderChoices();clientMatch();$('#editor-number').textContent=q.number?`${q.number} · rascunho salvo automaticamente`:'';
    for(const input of $$('[data-company]'))input.value=q.company[input.dataset.company]??'';
    $('#logo-preview').hidden=!q.company.logo;$('#logo-preview').src=q.company.logo||'';$('#logo-preview').style.background=q.company.logoBackground==='light'?'#fff':UniversalCompany.theme(q.company).deep;
    renderItems();render();
  }
  function renderItems(){
    $('#items-count').textContent=q.items.length===1?'1 item':q.items.length+' itens';
    $('#items').innerHTML=q.items.map((it,i)=>`<article class="service-card" data-id="${esc(it.id)}"><div class="item-head"><strong>ITEM ${String(i+1).padStart(2,'0')}</strong><button type="button" class="icon-button" data-action="remove" aria-label="Excluir item ${i+1}">×</button></div><label>Serviço<select data-field="service" required>${!M.services.some(s=>s.name===it.service)?`<option value="${esc(it.service)}">${esc(it.service)} (anterior)</option>`:''}${M.services.map(s=>`<option ${s.name===it.service?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><div class="item-values"><label>Quantidade<input type="number" data-field="quantity" min="0.01" max="100000" step="0.01" value="${it.quantity}" required></label><div class="unit-field"><span>Unidade</span><div class="seg unit-seg" role="group" aria-label="Unidade do item ${i+1}"><button type="button" data-unit="un." aria-pressed="${it.unit==='un.'}">un.</button><button type="button" data-unit="m²" aria-pressed="${it.unit==='m²'}">m²</button></div></div><label>Preço PIX por ${esc(it.unit)} (R$)<input type="number" data-field="price" min="0" max="1000000" step="0.01" value="${it.price}" placeholder="0,00" required></label></div><label class="photo-upload" data-drop tabindex="-1"><span class="pu-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-8 8"/></svg></span><span><b>Arraste, clique ou cole as fotos</b><br>Copiou uma imagem? Use <span class="kbd">Ctrl</span> + <span class="kbd">V</span> · até 6 fotos</span><input type="file" data-photo accept="image/png,image/jpeg,image/webp" multiple aria-label="Adicionar fotos ao item ${i+1}"></label><div class="photos">${it.photos.map((p,n)=>`<div class="photo-thumb"><img src="${p}" alt="${esc(it.service)}, foto ${n+1}"><button type="button" data-action="remove-photo" data-photo-index="${n}" aria-label="Remover foto ${n+1}">×</button></div>`).join('')}</div><details class="optional"><summary>Ajustar descrição do serviço</summary><label><textarea data-field="description" maxlength="1500" rows="3">${esc(it.description)}</textarea></label></details><div class="item-total"><span>Total do item no PIX</span><strong data-item-total>${money(Math.round(Math.round(Number(it.price)*100)*Number(it.quantity)))}</strong></div></article>`).join('');
  }
  // Junta várias teclas num só redesenho da prévia por quadro, em vez de redesenhar a cada tecla.
  let renderFrame=0;function renderSoon(){if(!renderFrame)renderFrame=requestAnimationFrame(()=>{renderFrame=0;render()})}
  function render(){cancelAnimationFrame(renderFrame);renderFrame=0;
    let t;
    try{t=M.totals(q)}catch(error){$('#fee-summary').textContent=error.message;$('#proposal').innerHTML=`<div class="sheet doc-body">${esc(error.message)}</div>`;return}
    // Mesmo layout do PDF (public/pdf-renderer.js); cores vêm de EcoProposalPalette.
    const c=q.company,p=EcoProposalPalette(c),validUntil=new Date(q.date+'T12:00:00');validUntil.setDate(validUntil.getDate()+q.terms.validity);
    const vars=`--pp-green:${p.green};--pp-light:${p.light};--pp-deep:${p.deep};--pp-lime:${p.lime};--pp-lime-soft:${p.limeSoft};--pp-lime-border:${p.limeBorder}`;
    const logo=c.logo?`<span class="pp-logo ${c.logoBackground==='light'?'plate':''}"><img src="${c.logo}" alt="${esc(c.name)}"></span>`:`<span class="pp-name">${esc(c.name||UniversalCompany.initials(c.name))}</span>`;
    const cardLine=t.count>1?`no cartão em até ${t.count}x sem juros`:'no cartão em 1x';
    const cardSub=(t.count>1?'Sem juros':'Pagamento em 1x')+' · total '+money(t.total);
    const client=[['CLIENTE',q.client||'Nome do cliente','name'],['ENDEREÇO DO ATENDIMENTO',q.address||'Endereço do atendimento',''],['TELEFONE',q.clientContact,'phone'],...M.corporateDetails(q).map(([label,value])=>[label,value,'corporate'])].filter(x=>String(x[1]||'').trim());
    const photos=it=>it.photos.length===1?`<img class="pp-thumb" src="${it.photos[0]}" alt="${esc(it.service)}">`:it.photos.length?`<div class="pp-thumbs">${it.photos.map(src=>`<img src="${src}" alt="${esc(it.service)}">`).join('')}</div>`:'<span class="pp-thumb pp-nophoto">Sem foto</span>';
    const benefits=c.benefits.split('\n').map(x=>x.trim()).filter(Boolean);
    const foot=[c.name,c.taxId,c.location].filter(Boolean).map(esc).join(' · '),footR=[c.phone,c.email].filter(Boolean).map(esc).join(' · ');
    $('#proposal').innerHTML=`<article class="sheet pp" style="${UniversalBrand.style(c)};${vars}">`
      +`<header class="pp-hero"><div class="pp-brand">${logo}${c.tagline?`<span class="pp-tag">${esc(c.tagline)}</span>`:''}</div><div class="pp-meta"><span class="pp-cap">PROPOSTA COMERCIAL</span><span class="pp-pill">${esc(q.number)}</span><span class="pp-date">Emitida em ${date(q.date)}</span></div></header>`
      +`<div class="pp-body"><h2 class="pp-title">${esc(c.proposalSubtitle||c.proposalTitle)}</h2>${c.intro.trim()?`<p class="pp-intro">${esc(c.intro)}</p>`:''}`
      +(client.length?`<section class="pp-client${M.corporateDetails(q).length?' has-corporate':''}">${client.map(([l,v,k])=>`<div class="${k}"><span class="pp-cap">${l}</span><span class="pp-v">${esc(v)}</span></div>`).join('')}</section>`:'')
      +`<section class="pp-scope"><div class="pp-scope-head"><span class="pp-cap">ESCOPO DOS SERVIÇOS</span><span>${q.items.length} ${q.items.length===1?'item':'itens'}</span></div><table><thead><tr><th>FOTOS</th><th>SERVIÇO</th><th>QTD.</th><th>UNIT. PIX</th><th>TOTAL PIX</th></tr></thead><tbody>${q.items.map((it,i)=>`<tr><td>${photos(it)}</td><td><strong>${esc(it.service)}</strong>${it.description?`<small>${esc(it.description)}</small>`:''}</td><td>${Number(it.quantity).toLocaleString('pt-BR')} ${esc(it.unit)}</td><td>${money(Math.round(Number(it.price)*100))}</td><td><b>${money(t.rows[i])}</b></td></tr>`).join('')}</tbody></table></section>`
      +`<section class="pp-invest"><div><span class="pp-cap">INVESTIMENTO TOTAL</span><span>${cardLine}</span></div><strong>${money(t.total)}</strong></section>`
      +`<section class="pp-pay"><div class="pp-card pix"><span class="pp-ic"><img src="assets/int-pix.svg" alt=""></span><div><span class="pp-cap">VALOR NO PIX</span><strong>${money(t.pix)}</strong><small>${t.saving?`Economize ${money(t.saving)} à vista`:'Pagamento à vista'}</small></div></div><div class="pp-card"><span class="pp-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.6"/><path d="M2.5 10h19M6 15h4.5"/></svg></span><div><span class="pp-cap">CARTÃO DE CRÉDITO</span><strong>${t.count}x de ${money(t.part)}</strong><small>${cardSub}</small></div></div></section>`
      +(benefits.length?`<h3 class="pp-why">Por que escolher a ${esc(c.name)}</h3><ul class="pp-benefits">${benefits.map(x=>`<li>✓ ${esc(x)}</li>`).join('')}</ul>`:'')
      +`<section class="pp-terms ${q.terms.notes.trim()?'':'single'}"><div><span class="pp-cap">VALIDADE DA PROPOSTA</span><b>Até ${validUntil.toLocaleDateString('pt-BR')}</b><small>${q.terms.validity} dias a partir da emissão (${date(q.date)}). Para combinar o atendimento, entre em contato${c.phone?' pelo '+esc(c.phone):' com nossa equipe'}.</small></div>${q.terms.notes.trim()?`<div><span class="pp-cap">CONDIÇÕES DO ATENDIMENTO</span><p>${esc(q.terms.notes)}</p></div>`:''}</section>`
      +`<footer class="pp-foot"><span>${foot}</span><span>${footR}</span></footer></div></article>`;
    if(previewMode==='mobile')renderMobile(t);
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
      }else if(field==='clientCnpj'){q.clientCnpj=M.formatCnpj(e.target.value);e.target.value=q.clientCnpj;changed();
      }else if(field==='clientBirthday'){const value=bdayValue(e.target.value);e.target.setCustomValidity(e.target.value&&!value?'Use DD/MM, por exemplo 18/03.':'');q.clientBirthday=value;changed();
      }else if(field==='client'){q.client=e.target.value;clientMatch();changed();
      }else {if(Object.hasOwn(q.terms,field))q.terms[field]=e.target.type==='number'?Number(e.target.value):e.target.value;else q[field]=e.target.value;changed();}
    }
    const key=e.target.dataset.field;
    if(key){const it=q.items.find(x=>x.id===e.target.closest('[data-id]').dataset.id);it[key]=['quantity','price'].includes(key)?e.target.value===''?'':Number(e.target.value):e.target.value;if(key==='service'){const preset=M.services.find(s=>s.name===it.service);it.unit=preset.unit==='m²'||M2.some(w=>fold(it.service).includes(w))?'m²':'un.';it.description=preset.description;renderItems()}changed()}
  });
  $('#lookup-cep').onclick=()=>{if(M.digits(q.postalCode).length!==8){cepStatus('Informe um CEP com 8 dígitos.','error');return}lastCepLookup='';lookupCep();};
  $('#items').addEventListener('click',e=>{const unit=e.target.closest('[data-unit]');if(unit){const it=q.items.find(x=>x.id===unit.closest('[data-id]').dataset.id);it.unit=unit.dataset.unit;renderItems();changed();return}const action=e.target.dataset.action;if(!action)return;const it=q.items.find(x=>x.id===e.target.closest('[data-id]').dataset.id);if(action==='remove'){if(q.items.length===1)return toast('Mantenha pelo menos um serviço.');q.items=q.items.filter(x=>x!==it)}else it.photos.splice(Number(e.target.dataset.photoIndex),1);renderItems();changed()});
  $('#add').onclick=()=>{if(q.items.length>=100)return toast('Limite de 100 serviços por proposta.');q.items.push(M.item());renderItems();changed()};
  async function readImage(file,logo=false){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Use PNG, JPG ou WebP de até 20 MB.');
    const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,(logo?1400:1000)/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');if(!logo){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)}ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL(logo?'image/png':'image/jpeg',.85)}finally{URL.revokeObjectURL(url)}
  }
  async function addPhotos(it,files){
    files=files.filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type));if(!files.length)return toast('Use imagens PNG, JPG ou WebP.');
    if(it.photos.length+files.length>6)return toast('Use até 6 fotos por serviço.');const current=q;pendingPhotos++;$('#draft-status').textContent='Preparando fotos...';
    try{const images=await Promise.all(files.map(f=>readImage(f)));if(current===q&&q.items.includes(it)){it.photos.push(...images);activeItem=it.id;renderItems();changed();toast(images.length===1?'Foto adicionada ao serviço '+it.service+'.':images.length+' fotos adicionadas.')}}catch(error){toast(error.message)}finally{pendingPhotos--}
  }
  const itemOf=el=>q.items.find(x=>x.id===el?.closest('[data-id]')?.dataset.id);
  $('#items').addEventListener('change',async e=>{if(!e.target.hasAttribute('data-photo'))return;const it=itemOf(e.target);await addPhotos(it,[...e.target.files]);e.target.value=''});
  $('#items').addEventListener('focusin',e=>{const it=itemOf(e.target);if(it)activeItem=it.id});
  $('#items').addEventListener('pointerdown',e=>{const it=itemOf(e.target);if(it)activeItem=it.id});
  for(const type of ['dragenter','dragover'])$('#items').addEventListener(type,e=>{const zone=e.target.closest('[data-drop]');if(!zone||![...(e.dataTransfer?.types||[])].includes('Files'))return;e.preventDefault();zone.classList.add('drop-on')});
  $('#items').addEventListener('dragleave',e=>{const zone=e.target.closest('[data-drop]');if(zone&&!zone.contains(e.relatedTarget))zone.classList.remove('drop-on')});
  $('#items').addEventListener('drop',e=>{const zone=e.target.closest('[data-drop]');if(!zone)return;e.preventDefault();zone.classList.remove('drop-on');addPhotos(itemOf(zone),[...e.dataTransfer.files])});
  // Ctrl+V com imagem copiada: vai para o serviço em foco ou para o último serviço.
  document.addEventListener('paste',e=>{
    if($('#create-view').hidden)return;const files=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(!files.length)return;
    const target=e.target.closest?.('input:not([type=file]),textarea');if(target&&!files.length)return;e.preventDefault();
    const it=q.items.find(x=>x.id===activeItem)||q.items[q.items.length-1];addPhotos(it,files);
  });
  function renderChoices(){
    const tags=q.tags||[];$('#corporate-fields').hidden=!tags.includes('corporativo');$('#quote-tags').innerHTML=tagOptions.map(t=>`<button type="button" data-quote-tag="${esc(t.id)}" aria-pressed="${tags.includes(t.id)}">${esc(t.label)}</button>`).join('');
    $('#quote-origin').innerHTML=Object.entries(M.origins).map(([id,label])=>`<button type="button" data-origin="${id}" aria-pressed="${q.origin===id}">${EcoIcons.brandIcon(id,'sm')}${esc(label)}</button>`).join('');
  }
  function clientMatch(){
    const box=$('#client-match'),name=fold(q.client);if(!box)return;
    const c=name.length>2&&knownClients.find(x=>fold(x.name)===name);
    if(!c){box.hidden=true;return}
    box.hidden=false;box.innerHTML=`<b>Cliente cadastrado</b>${c.quoteCount} orçamento${c.quoteCount===1?'':'s'}${c.lastService?` · último serviço em ${date(c.lastService.date)}`:''}`;
    let touched=false;if(!(q.tags||[]).length&&c.tags?.length){q.tags=[...c.tags];touched=true}if(!q.clientBirthday&&c.birthday){q.clientBirthday=c.birthday;const input=$('#form [name="clientBirthday"]');if(input)input.value=bdayText(c.birthday);touched=true}if(!q.clientContact&&c.phone){q.clientContact=c.phone;const input=$('#form [name="clientContact"]');if(input)input.value=c.phone;touched=true}
    if(touched)renderChoices();
  }
  async function loadClientHints(){if(!EcoAuth.online)return;try{const [tags,clients]=await Promise.all([EcoAuth.api('/api/tags'),EcoAuth.api('/api/clients')]);tagOptions=tags;knownClients=clients;$('#client-suggestions').innerHTML=clients.map(c=>`<option value="${esc(c.name)}"></option>`).join('');renderChoices();clientMatch()}catch{}}
  $('#quote-tags').addEventListener('click',e=>{const b=e.target.closest('[data-quote-tag]');if(!b)return;const id=b.dataset.quoteTag,set=new Set(q.tags||[]);set.has(id)?set.delete(id):set.add(id);q.tags=[...set];renderChoices();changed()});
  $('#quote-origin').addEventListener('click',e=>{const b=e.target.closest('[data-origin]');if(!b)return;q.origin=q.origin===b.dataset.origin?'':b.dataset.origin;renderChoices();changed()});
  function renderMobile(t){
    // Mesmo layout do PDF para celular (EcoRenderMobilePDF).
    const c=q.company,p=EcoProposalPalette(c),validUntil=new Date(q.date+'T12:00:00');validUntil.setDate(validUntil.getDate()+q.terms.validity);
    const vars=`--pp-green:${p.green};--pp-light:${p.light};--pp-deep:${p.deep};--pp-lime:${p.lime};--pp-lime-soft:${p.limeSoft};--pp-lime-border:${p.limeBorder}`;
    const client=[['CLIENTE',q.client||'Nome do cliente','name'],['ENDEREÇO DO ATENDIMENTO',q.address||'Endereço do atendimento',''],['TELEFONE',q.clientContact,''],...M.corporateDetails(q).map(([label,value])=>[label,value,'corporate'])].filter(x=>String(x[1]||'').trim());
    const benefits=c.benefits.split('\n').map(x=>x.trim()).filter(Boolean);
    $('#proposal-mobile').innerHTML=`<div class="mobile-sheet"><div class="mscr pp pp-m" style="${UniversalBrand.style(c)};${vars}">`
      +`<header class="pp-hero">${c.logo?`<span class="pp-logo ${c.logoBackground==='light'?'plate':''}"><img src="${c.logo}" alt="${esc(c.name)}"></span>`:`<span class="pp-name">${esc(c.name||UniversalCompany.initials(c.name))}</span>`}${c.tagline?`<span class="pp-tag">${esc(c.tagline)}</span>`:''}<span class="pp-cap">PROPOSTA COMERCIAL</span><span class="pp-pill">${esc(q.number)}</span><span class="pp-date">Emitida em ${date(q.date)}</span></header>`
      +`<div class="pp-body"><h2 class="pp-title">${esc(c.proposalSubtitle||c.proposalTitle)}</h2>${c.intro.trim()?`<p class="pp-intro">${esc(c.intro)}</p>`:''}`
      +(client.length?`<section class="pp-client${M.corporateDetails(q).length?' has-corporate':''}">${client.map(([l,v,k])=>`<div class="${k}"><span class="pp-cap">${l}</span><span class="pp-v">${esc(v)}</span></div>`).join('')}</section>`:'')
      +`<div class="pp-mscope"><span class="pp-cap">ESCOPO DOS SERVIÇOS</span><span>${q.items.length} ${q.items.length===1?'item':'itens'}</span></div>`
      +q.items.map((it,i)=>`<article class="pp-item">${it.photos.length?`<img class="pp-hero-photo" src="${it.photos[0]}" alt="${esc(it.service)}">`:''}${it.photos.length>1?`<div class="pp-mthumbs">${it.photos.slice(1).map(src=>`<img src="${src}" alt="">`).join('')}</div>`:''}<div class="pp-item-body"><strong>${esc(it.service)}</strong>${it.description?`<small>${esc(it.description)}</small>`:''}<div class="pp-item-foot"><span>${Number(it.quantity).toLocaleString('pt-BR')} ${esc(it.unit)} × ${money(Math.round(Number(it.price)*100))}</span><b>${money(t.rows[i])}</b></div></div></article>`).join('')
      +`<section class="pp-invest"><span class="pp-cap">INVESTIMENTO TOTAL</span><strong>${money(t.total)}</strong><span>${t.count>1?`no cartão em até ${t.count}x sem juros`:'no cartão em 1x'}</span></section>`
      +`<div class="pp-card pix"><span class="pp-ic"><img src="assets/int-pix.svg" alt=""></span><div><span class="pp-cap">VALOR NO PIX</span><strong>${money(t.pix)}</strong><small>${t.saving?`Economize ${money(t.saving)} à vista`:'Pagamento à vista'}</small></div></div>`
      +`<div class="pp-card"><span class="pp-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.6"/><path d="M2.5 10h19M6 15h4.5"/></svg></span><div><span class="pp-cap">CARTÃO DE CRÉDITO</span><strong>${t.count}x de ${money(t.part)}</strong><small>${(t.count>1?'Sem juros':'Pagamento em 1x')+' · total '+money(t.total)}</small></div></div>`
      +(benefits.length?`<h3 class="pp-why">Por que escolher a ${esc(c.name)}</h3><ul class="pp-benefits">${benefits.map(x=>`<li>✓ ${esc(x)}</li>`).join('')}</ul>`:'')
      +`<section class="pp-terms single"><div><span class="pp-cap">VALIDADE DA PROPOSTA</span><b>Até ${validUntil.toLocaleDateString('pt-BR')}</b><small>${q.terms.validity} dias a partir da emissão (${date(q.date)}). Para combinar o atendimento, entre em contato${c.phone?' pelo '+esc(c.phone):' com nossa equipe'}.</small></div></section>`
      +(q.terms.notes.trim()?`<section class="pp-terms single"><div><span class="pp-cap">CONDIÇÕES DO ATENDIMENTO</span><p>${esc(q.terms.notes)}</p></div></section>`:'')
      +`<footer class="pp-foot"><span>${[c.name,c.taxId].filter(Boolean).map(esc).join(' · ')}</span>${c.location?`<span>${esc(c.location)}</span>`:''}<span>${[c.phone,c.email].filter(Boolean).map(esc).join(' · ')}</span></footer></div></div></div>`;
  }
  $('#preview-mode').addEventListener('click',e=>{const b=e.target.closest('[data-preview]');if(!b)return;previewMode=b.dataset.preview;for(const x of $$('#preview-mode [data-preview]'))x.setAttribute('aria-pressed',String(x===b));$('#proposal').hidden=previewMode!=='a4';$('#proposal-mobile').hidden=previewMode!=='mobile';$('#preview-label').textContent=previewMode==='a4'?'A4 · Proposta comercial':'Celular · como o cliente vê no WhatsApp';render()});
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
  const pdfMenu=open=>{$('#pdf-menu').hidden=!open;$('#pdf').setAttribute('aria-expanded',String(open));if(open)$('#pdf-menu button').focus()};
  $('#pdf').onclick=e=>{e.stopPropagation();pdfMenu($('#pdf-menu').hidden)};
  document.addEventListener('click',e=>{if(!e.target.closest('.pdf-split'))pdfMenu(false)});
  $('#pdf-menu').addEventListener('keydown',e=>{const items=[...$$('#pdf-menu button')],i=items.indexOf(document.activeElement);if(e.key==='Escape'){pdfMenu(false);$('#pdf').focus()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus()}});
  $('#pdf-menu').addEventListener('click',async e=>{
    const choice=e.target.closest('[data-pdf-format]');if(!choice)return;pdfMenu(false);
    if(!$('#form').reportValidity())return;
    const button=$('#pdf'),format=choice.dataset.pdfFormat;
    try{
      if(pendingPhotos)return toast('Aguarde o carregamento das fotos.');
      button.disabled=true;button.textContent='Gerando PDF...';
      const document=await generatePDF(q);
      if(format==='mobile'){const blob=await EcoCreatePDFBlob(document.snapshot||q,'mobile');EcoDownloadBlob(blob,M.proposalFilename(q).replace(/\.pdf$/,' - celular.pdf'))}
      else EcoDownloadBlob(document.blob,document.filename);
      await window.EcoWorkspace?.refresh();window.EcoWorkspace?.navigate('quotes');
      toast(format==='mobile'?'Orçamento gerado. PDF para WhatsApp baixado.':'Orçamento gerado com sucesso. PDF baixado.');
    }catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Gerar PDF ▾'}
  });
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
  fill();loadClientHints();window.addEventListener('eco:quotes-changed',()=>loadClientHints());
  try{
    await database;
    if(!EcoAuth.online&&!localStorage.getItem('orcamento-universal-migrated-v1')){const old=JSON.parse(localStorage.getItem('orcamento-universal-legacy-propostas')||'[]');if(Array.isArray(old))for(const p of old){try{await put('quotes',M.normalize(p))}catch{}}localStorage.setItem('orcamento-universal-migrated-v1','1')}
    const draft=await get('draft','current');if(draft?.quote){q=normalize(draft.quote);fill()}
    await refreshSaved();$('#draft-status').textContent=draft?'Continuando o rascunho '+(q.number||'')+' · salvo automaticamente':'Identidade da empresa carregada';
  }catch(error){$('#draft-status').textContent='Armazenamento indisponível. Use o backup.';toast(error.message||'Use o backup para guardar os dados.')}
  window.EcoStudio={openQuote,newQuote,generatePDF,refresh:refreshSaved,notify:toast,getDraft:()=>structuredClone(q)};
  window.dispatchEvent(new CustomEvent('eco:ready'));
  window.addEventListener('beforeunload',e=>{if(pendingPhotos||$('#draft-status').textContent==='Salvando rascunho...'){e.preventDefault();e.returnValue=''}});
})();
