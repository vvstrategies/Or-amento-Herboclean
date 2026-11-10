(function financeUI(){
'use strict';
const $=(s,p=document)=>p.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const number=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v);
const when=v=>new Date(v).toLocaleString('pt-BR');
const scaled=(v,d=2)=>v==null?'':(v/10**d).toFixed(d).replace('.',',');
function parse(v,d=2,optional=false){const t=String(v??'').trim().replace(',','.');if(!t&&optional)return null;if(!new RegExp('^\\d+(?:\\.\\d{1,'+d+'})?$').test(t))throw Error('Use valores positivos com até '+d+' casas decimais.');const [whole,fraction='']=t.split('.'),n=Number(whole+fraction.padEnd(d,'0'));if(!Number.isSafeInteger(n))throw Error('Valor muito grande.');return n;}
const field=(name,label,value=null,hint='',digits=2)=>`<label>${esc(label)}<input name="${name}" inputmode="decimal" value="${esc(scaled(value,digits))}" placeholder="Não informado">${hint?`<small>${esc(hint)}</small>`:''}</label>`;
const notify=s=>window.EcoStudio?.notify(s);
// Configurações › Custos e financeiro (item 16). Duas visões do MESMO formulário, alternáveis:
// "Grade" (A): cinco cards na tela; "Seções" (B): menu lateral com um assunto por vez e a simulação fixa ao lado.
// Um só "Salvar premissas" grava custos dos atendimentos (/api/financial-settings) e premissas da DRE (/api/finance/settings).
const COMPONENTS={maintenance:'Manutenção',tires:'Pneus',oil:'Óleo',insurance:'Seguro',tax:'IPVA',depreciation:'Depreciação'};
const loose=v=>{if(!String(v??'').trim())return null;const n=Number(String(v??'').trim().replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:null};
let costView=(()=>{try{return localStorage.getItem('hc-costs-view')}catch{return null}})()||'grid',costSection='materials';
async function initSettings(){
 const slot=$('#financial-settings-slot');if(!slot)return;
 try{
  const [data,dre]=await Promise.all([EcoAuth.api('/api/financial-settings'),EcoAuth.api('/api/finance/settings')]),s=data.settings,v=s.vehicle;
  const svcOpts=data.services.map(it=>`<option value="${esc(it.name)}">${esc(it.name)}</option>`).join('');
  slot.innerHTML=`<form id="financial-settings-form" class="cs cs-v-${costView}" novalidate>
  <div class="cs-head"><div class="cs-title"><h2>Custos e financeiro</h2><span class="finance-private">Uso interno · não aparece no PDF</span></div>
   <div class="cs-actions"><div class="seg view-switch" role="group" aria-label="Visão"><button type="button" data-cs-view="grid" aria-pressed="${costView==='grid'}">Grade</button><button type="button" data-cs-view="sections" aria-pressed="${costView==='sections'}">Seções</button></div><button id="finance-demo" class="text-button" type="button">Ver demonstração</button><button id="financial-export" class="secondary" type="button">Exportar histórico</button><button class="primary" type="submit">Salvar premissas</button></div></div>
  <p id="financial-settings-message" class="cs-msg" role="status"></p>
  <div class="cs-body">
  <nav class="cs-nav" aria-label="Assuntos">${[['materials','Materiais','cs-sum-mat'],['travel','Deslocamento','cs-sum-travel'],['vehicle','Veículo','cs-sum-veh'],['dre','Impostos e DRE','cs-sum-dre'],['export','Exportação','']].map(([id,l,sum])=>`<button type="button" data-cs-sec="${id}" aria-pressed="${costSection===id}"><b>${l}</b><small id="${sum}">${id==='export'?'JSON':''}</small></button>`).join('')}</nav>
  <div class="cs-grid">
   <section class="cs-card" data-sec="materials"><h3>Materiais</h3><p class="cs-sub">Quanto da venda vai em produto</p>
    ${field('materialRate','Custo médio de materiais (% da venda)',s.defaultMaterialBps)}<p class="cs-hint" id="cs-mat-hint"></p>
    <p class="cs-label">Por serviço · opcional <small>em branco = padrão da empresa</small></p>
    <div class="cs-rates">${data.services.map(it=>`<label><span>${esc(it.name)}</span><input inputmode="decimal" data-service-rate="${esc(it.name)}" value="${esc(scaled(s.serviceMaterialBps[it.name]))}" placeholder="padrão"><i>%</i></label>`).join('')}</div></section>
   <section class="cs-card" data-sec="travel"><h3>Deslocamento</h3><p class="cs-sub">De onde a equipe sai</p>
    <p class="cs-chip ${data.routes.configured?'ok':''}">${data.routes.configured?'Rotas automáticas ativas':'Rotas automáticas não configuradas · distância manual funciona'}</p>
    <label>Endereço de saída<select name="originMode"><option value="company">Usar endereço da empresa</option><option value="custom">Usar outro endereço</option></select></label>
    <p class="hint cs-addr">${esc(data.companyLocation||'Configure a localização da empresa.')}</p>
    ${data.routes.configured?`<div class="finance-geo-company"><p class="hint" id="finance-company-geo">Verificando como a saída foi localizada no mapa...</p><button id="finance-company-geo-refresh" class="text-button" type="button">Recalcular localização</button></div>`:''}
    <label id="finance-origin-field">Endereço de saída personalizado<input name="originAddress" maxlength="800" value="${esc(s.originAddress)}" placeholder="Rua, número, bairro, cidade, UF e CEP"></label>
    <label class="finance-check"><input name="roundTrip" type="checkbox" ${s.roundTrip?'checked':''}> Considerar ida e volta automaticamente</label></section>
   <section class="cs-card" data-sec="vehicle"><h3>Veículo</h3><p class="cs-sub">Custo por km rodado</p>
    <p class="cs-big"><strong id="cs-km">—</strong><small>por km</small></p>
    <div class="cs-two"><label>Nome do veículo<input name="vehicleName" maxlength="120" value="${esc(v.name)}" placeholder="Ex.: Fiat Mobi"></label><label>Combustível<select name="fuelType"><option value="gasoline">Gasolina</option><option value="ethanol">Etanol</option><option value="diesel">Diesel</option><option value="flex">Flex</option></select></label>
    ${field('consumption','Consumo (km/L)',v.consumptionCentiKmL)}${field('fuelPrice','Combustível (R$/L)',v.fuelPriceCents)}</div>
    ${field('operatingCost','Adicional por km (R$) · manutenção, pneus e desgaste',v.additionalCostPerKmCents)}<p class="cs-hint" id="cs-km-hint"></p></section>
   <section class="cs-card cs-sim" data-sec="sim"><h3>Simulação de um atendimento</h3><p class="cs-sub">Exemplo com as premissas acima · não altera nada</p>
    <div class="cs-two"><label>Serviço<select id="cs-sim-service">${svcOpts}</select></label><label>Venda (R$)<input id="cs-sim-sale" inputmode="decimal" value="450,00"></label></div>
    <label>Distância até o cliente (km)<input id="cs-sim-km" inputmode="decimal" value="18"></label>
    <dl class="cs-sim-rows" id="cs-sim-rows"></dl><p class="cs-hint" id="cs-sim-hint"></p></section>
   <section class="cs-card" data-sec="dre"><h3>DRE · impostos e veículo</h3><p class="cs-sub">Premissas usadas no Financeiro</p>
    <label>Imposto estimado sobre a receita (%)<input name="taxRate" inputmode="decimal" value="${esc(scaled(dre.taxRateBps))}" required></label>
    <p class="cs-label">O que já está no custo adicional por km</p><div class="cs-checks">${Object.entries(COMPONENTS).map(([id,n])=>`<label class="finance-check"><input type="checkbox" name="components" value="${id}" ${dre.vehicleComponents.includes(id)?'checked':''}> ${n}</label>`).join('')}</div>
    <p class="cs-hint">Avisa se uma despesa lançada parecer duplicar esses itens.</p>
    <label>Composição / observações<textarea name="vehicleNotes" maxlength="500" rows="2">${esc(dre.vehicleNotes||'')}</textarea></label></section>
   <section class="cs-card" data-sec="export"><h3>Exportação</h3><p class="cs-sub">Histórico financeiro interno em JSON, para consulta e guarda.</p><p class="hint">Privado: não envie este arquivo ao cliente.</p><button type="button" class="secondary" data-export-again>Exportar histórico financeiro</button></section>
  </div></div></form>`;
  const form=$('form',slot);form.elements.originMode.value=s.originMode;form.elements.fuelType.value=v.fuelType;
  const origin=()=>{$('#finance-origin-field',form).hidden=form.elements.originMode.value==='company';};form.elements.originMode.onchange=origin;origin();
  // Cálculos ao vivo: custo por km, materiais e simulação, a partir dos campos (antes de salvar).
  const live=()=>{
   const rate=loose(form.elements.materialRate.value),cons=loose(form.elements.consumption.value),fuel=loose(form.elements.fuelPrice.value),add=loose(form.elements.operatingCost.value)||0;
   const perKm=cons&&fuel!=null?fuel/cons+add:null,fmt=n=>n==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
   $('#cs-km').textContent=fmt(perKm);$('#cs-km-hint').textContent=perKm==null?'Informe consumo e preço do combustível.':`${fmt(fuel/cons)} de combustível + ${fmt(add)} de manutenção, pneus e desgaste.`;
   $('#cs-mat-hint').textContent=rate==null?'Sem padrão: cada serviço precisa de um percentual.':`${fmt(rate)} de materiais a cada R$ 100 vendidos.`;
   const svc=$('#cs-sim-service').value,own=form.querySelector(`[data-service-rate="${CSS.escape(svc)}"]`),r=loose(own?.value)??rate,sale=loose($('#cs-sim-sale').value)||0,km=loose($('#cs-sim-km').value)||0,total=km*(form.elements.roundTrip.checked?2:1);
   const mat=r==null?null:sale*r/100,trip=perKm==null?null:total*perKm,margin=mat==null||trip==null?null:sale-mat-trip;
   $('#cs-sim-rows').innerHTML=`<div><dt>Venda</dt><dd>${fmt(sale)}</dd></div><div><dt>− Materiais (${r==null?'—':String(r).replace('.',',')+'%'})</dt><dd>${fmt(mat)}</dd></div><div><dt>− Deslocamento (${String(total).replace('.',',')} km)</dt><dd>${fmt(trip)}</dd></div><div class="cs-margin"><dt>= Margem</dt><dd>${fmt(margin)}</dd></div>`;
   $('#cs-sim-hint').textContent=margin==null?'Complete materiais e veículo para ver a margem.':`Margem de contribuição de ${(sale?margin/sale*100:0).toLocaleString('pt-BR',{maximumFractionDigits:1})}%. Despesas fixas e impostos ficam na DRE.`;
   $('#cs-sum-mat').textContent=rate==null?'sem padrão':String(rate).replace('.',',')+'% · '+data.services.length+' serviços';
   $('#cs-sum-travel').textContent=form.elements.originMode.value==='company'?(data.companyLocation||'').split(/[,-]/).slice(-2,-1)[0]?.trim()||'empresa':'outro endereço';
   $('#cs-sum-veh').textContent=perKm==null?'—':fmt(perKm)+'/km';$('#cs-sum-dre').textContent=(form.elements.taxRate.value||'0')+'%';
  };
  form.addEventListener('input',live);form.addEventListener('change',live);live();
  form.addEventListener('click',e=>{const b=e.target.closest('[data-cs-view],[data-cs-sec],[data-export-again]');if(!b)return;
   if(b.dataset.csView){costView=b.dataset.csView;try{localStorage.setItem('hc-costs-view',costView)}catch{}form.className='cs cs-v-'+costView;form.querySelectorAll('[data-cs-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));return}
   if(b.dataset.csSec){costSection=b.dataset.csSec;form.dataset.sec=costSection;form.querySelectorAll('[data-cs-sec]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));return}
   $('#financial-export',form).click();});
  form.dataset.sec=costSection;
  form.onsubmit=async e=>{
   e.preventDefault();const button=$('button[type=submit]',form),msg=$('#financial-settings-message',form);button.disabled=true;msg.textContent='';msg.className='cs-msg';
   try{
    const val=n=>form.elements[n].value,rates={...s.serviceMaterialBps};
    form.querySelectorAll('[data-service-rate]').forEach(el=>{const value=parse(el.value,2,true);if(value===null)delete rates[el.dataset.serviceRate];else Object.defineProperty(rates,el.dataset.serviceRate,{value,enumerable:true,configurable:true,writable:true});});
    const payload={...s,defaultMaterialBps:parse(val('materialRate'),2,true),serviceMaterialBps:rates,originMode:val('originMode'),originAddress:val('originAddress'),roundTrip:form.elements.roundTrip.checked,
     vehicle:{id:'default',name:val('vehicleName'),fuelType:val('fuelType'),consumptionCentiKmL:parse(val('consumption'),2,true),fuelPriceCents:parse(val('fuelPrice'),2,true),additionalCostPerKmCents:parse(val('operatingCost')||'0')}};
    await EcoAuth.api('/api/financial-settings',{method:'PUT',body:JSON.stringify(payload)});
    await EcoAuth.api('/api/finance/settings',{method:'PUT',body:JSON.stringify({taxRateBps:parse(val('taxRate')),vehicleComponents:[...form.querySelectorAll('[name=components]:checked')].map(x=>x.value),vehicleNotes:val('vehicleNotes')})});
    msg.className='cs-msg ok';msg.textContent='Premissas salvas. Novos orçamentos passam a usar estes valores; estimativas e meses já abertos ficam preservados.';
   }catch(error){msg.className='cs-msg warn';msg.textContent=error.message}finally{button.disabled=false}
  };
  $('#financial-export',form).onclick=async()=>{try{const data=await EcoAuth.api('/api/financial-export');EcoDownloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'financeiro-interno-'+EcoModel.today()+'.json')}catch(e){notify(e.message)}};
  $('#finance-demo',form).onclick=showDemo;
  const geo=$('#finance-company-geo',form);
  if(geo){
   const show=l=>{
    if(!l){geo.textContent='A saída ainda não foi localizada no mapa. Ela é localizada no primeiro cálculo de rota.';return;}
    const vague=PRECISION_TEXT[l.precision];
    geo.innerHTML=`Entendido pelo mapa como: <b>${esc(l.label||'—')}</b>${vague?`<br><span class="finance-geo-warn">Localizado ${vague}. Inclua o CEP e o número no endereço da empresa e recalcule.</span>`:''}${l.current===false?'<br>Localização feita pela versão anterior; recalcule para conferir.':''}`;
   };
   EcoAuth.api('/api/finance/company-location').then(r=>show(r.location)).catch(()=>{geo.textContent='';});
   $('#finance-company-geo-refresh',form).onclick=async e=>{e.target.disabled=true;geo.textContent='Localizando...';try{show({...await EcoAuth.api('/api/finance/company-location/refresh',{method:'POST'}),current:true});}catch(error){geo.textContent=error.message;}finally{e.target.disabled=false}};
   if(!/\d{5}-?\d{3}/.test(data.companyLocation||'')&&s.originMode==='company')geo.insertAdjacentHTML('afterend','<p class="hint finance-geo-warn">Inclua o CEP no endereço da empresa para mais precisão.</p>');
  }
 }catch(error){slot.innerHTML='<h2>Custos e financeiro</h2><p class="hint">'+esc(error.message)+'</p>';}
}
function metrics(view){
 const r=view.latest?.result,invalid=view.stale&&view.editable,display=invalid?null:r;
 const labels={generated:'Receita orçada · base PIX',scheduled:'Receita contratada · base PIX',completed:'Receita operacional · base PIX',cancelled:'Valor orçado · cancelado'};
 return '<div class="finance-metrics">'+[
  [labels[view.status]||'Receita estimada · base PIX',money(invalid?view.currentRevenue:r?.revenue??view.currentRevenue)],
  ['Custo direto estimado',money(display?.totalDirectCost)],
  ['Margem de contribuição',money(display?.contributionMargin)],
  ['Margem estimada',display?.contributionMarginPercent==null?'—':number(display.contributionMarginPercent)+'%']
 ].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')+'</div>';
}
function composition(e){
 const r=e.result,a=e.assumptions;
 return `<details class="finance-composition"><summary>Ver composição e premissas</summary><dl>${[
 ['Materiais'+(r.materialSource==='manual'?' · manual':''),r.materialCost],['Combustível',r.fuelCost],['Custo operacional do veículo',r.vehicleOperatingCost],['Pedágio',r.tollCost],['Estacionamento',r.parkingCost],['Outros deslocamentos',r.otherTravelCost],['Outros custos diretos',r.otherDirectCosts],['Taxa financeira nesta fase',r.paymentFeeCost],['Total direto estimado',r.totalDirectCost]
 ].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${money(value)}</dd></div>`).join('')}</dl>
 ${r.materialSource==='manual'?`<p class="hint">Referência automática de materiais: ${money(r.estimatedMaterialCost)}. O valor manual não apaga essa referência.</p>`:''}
 <ul class="finance-material-items">${r.materialItems.map(i=>`<li>${esc(i.service)} · ${i.rateBps===null?'percentual pendente':number(i.rateBps/100)+'%'} · ${money(i.estimatedCost)}</li>`).join('')}</ul>
 ${e.inputs.otherDirectCosts.length?`<p class="hint">${e.inputs.otherDirectCosts.map(c=>esc(c.description)+' · '+money(c.amountCents)).join('<br>')}</p>`:''}
 <p class="hint">Origem usada: ${esc(a.originAddressSnapshot||'Não informada')}<br>Destino usado: ${esc(e.destinationAddressSnapshot)}<br>
 Veículo: ${esc(a.vehicle.name||'Não informado')} · ${a.vehicle.consumptionCentiKmL===null?'consumo pendente':number(a.vehicle.consumptionCentiKmL/100)+' km/L'}<br>
 Combustível: ${money(a.vehicle.fuelPriceCents)}/L · Veículo: ${money(a.vehicle.additionalCostPerKmCents)}/km<br>
 Materiais padrão: ${a.defaultMaterialBps===null?'não informado':number(a.defaultMaterialBps/100)+'%'}</p>
 <p class="hint">Receita baseada no PIX. O preço do cartão já compensa taxas; nenhuma taxa é descontada novamente aqui. A estimativa não representa dinheiro recebido nem lucro líquido.</p></details>`;
}
// Como o geocodificador entendeu cada ponta da rota. Ponto só no bairro/cidade deixa a distância errada.
const PRECISION_TEXT={neighbourhood:'só pelo bairro',city:'só pela cidade',region:'só pela região'};
function understood(e){
 const s=e.routeSnapshot;if(!s||e.result.distanceSource!=='automatic'||(!s.originGeocodeLabel&&!s.destinationGeocodeLabel))return '';
 const vague=[['origin','a saída da equipe'],['destination','o endereço do cliente']].filter(([k])=>PRECISION_TEXT[s[k+'Precision']]);
 const warn=vague.length?`<p class="finance-geo-warn" role="status">Atenção: ${vague.map(([k,label])=>`${label} foi localizado ${PRECISION_TEXT[s[k+'Precision']]}`).join(' e ')}. A distância pode estar errada. Confira o endereço${vague.some(([k])=>k==='origin')?' da empresa em Configurações › Custos e financeiro (inclua o CEP)':' do cliente'} e clique em Recalcular, ou informe a distância manualmente.</p>`:'';
 return `<p class="finance-geo hint">Saída entendida como: <b>${esc(s.originGeocodeLabel||'—')}</b><br>Cliente entendido como: <b>${esc(s.destinationGeocodeLabel||'—')}</b></p>${warn}`;
}
function distance(e){
 const r=e.result;if(!e.inputs.considerTravel)return '<p class="finance-distance">Deslocamento não considerado neste atendimento.</p>';
 return distanceLine(e,r)+understood(e);
}
function distanceLine(e,r){
 return `<div class="finance-distance"><strong>${r.distanceMeters===null?'Distância pendente':number(r.distanceMeters/1000)+' km até o cliente · '+number(r.totalDistanceMeters/1000)+' km considerados'}</strong><span>${r.distanceSource==='automatic'?'Calculado automaticamente · openrouteservice / HeiGIT':r.distanceSource==='manual'?'Distância informada manualmente':'Informe ou calcule o trajeto'}${r.durationSeconds===null?'':' · aprox. '+Math.round(r.durationSeconds/60)+' min por trecho'}</span></div>`;
}
async function mount(slot,q,{demo=false}={}){
 slot.innerHTML='<h3>Rentabilidade estimada <span class="finance-private">Uso interno</span></h3><p class="hint">Atualizando custos e rentabilidade...</p>';
 if(demo){slot.innerHTML='<h3>Rentabilidade estimada</h3><p class="hint">Este card é fictício. Em Configurações, use “Ver demonstração” para explorar o cálculo completo.</p>';return;}
 try{
  let view=await EcoAuth.api('/api/proposals/'+encodeURIComponent(q.id)+'/finance');
  if(view.editable&&(!view.latest||view.stale||view.routeNeedsRefresh)){slot.innerHTML='<h3>Rentabilidade estimada <span class="finance-private">Uso interno</span></h3><p class="hint">Calculando automaticamente com as premissas, rota e valores atuais...</p>';view=await EcoAuth.api('/api/proposals/'+encodeURIComponent(q.id)+'/finance/refresh',{method:'POST'});}
  if(slot.isConnected)render(slot,q,view);
 }catch(error){if(slot.isConnected)slot.innerHTML='<h3>Rentabilidade estimada</h3><p class="hint">'+esc(error.message)+'</p>';}
}
function render(slot,q,view){
 const e=view.latest,r=e?.result;
 slot.innerHTML=`<div class="finance-heading"><h3>Rentabilidade estimada</h3><span class="finance-private">Uso interno</span></div><p class="hint">Custos diretos e margem deste atendimento. Estas informações não entram no PDF.</p>
 ${view.stale?`<p class="finance-alert">${view.addressChanged?'O endereço do atendimento mudou.':'Os itens ou valores do orçamento mudaram.'} ${view.editable?'A atualização automática será tentada ao abrir este detalhe; se a rota estiver indisponível, use os ajustes abaixo.':'A estimativa histórica abaixo foi preservada.'}</p>`:''}
 ${view.routeNeedsRefresh?`<p class="finance-alert">A rota automática retornou 0 km para endereços diferentes. Confira a origem e o endereço do cliente; o sistema tentará atualizar o deslocamento automaticamente.</p>`:''}
 ${view.autoRouteError?`<p class="finance-alert">A rota automática não foi concluída: ${esc(view.autoRouteError)}. Revise a origem e o endereço; a próxima atualização tentará novamente.</p>`:view.routeNeedsRefresh&&view.autoRouteIssue?`<p class="finance-alert">A rota não pôde ser refeita automaticamente: ${esc(view.autoRouteIssue)}</p>`:''}
 ${metrics(view)}
 ${e?`<p class="finance-caption">Estimativa v${e.version} · ${when(e.calculatedAt)}${view.editable?'':' · Histórico preservado'}</p>
 ${!view.stale||!view.editable?distance(e):''}
 ${r.warnings.length?`<p class="finance-alert">${r.warnings.map(esc).join('<br>')}</p>`:''}
 ${view.stale&&view.editable?`<details><summary>Ver estimativa anterior, desatualizada</summary>${distance(e)}${composition(e)}</details>`:composition(e)}`:'<p class="hint">Ainda não há estimativa salva. Confira as premissas e informe o deslocamento.</p>'}
 ${view.previous?`<details class="finance-history"><summary>Versão anterior · ${when(view.previous.calculatedAt)}</summary><p class="hint">v${view.previous.version} · receita ${money(view.previous.result.revenue)} · custo ${money(view.previous.result.totalDirectCost)} · margem ${money(view.previous.result.contributionMargin)}</p>${composition(view.previous)}</details>`:''}
 ${!view.editable?'<p class="finance-note">Estimativas de atendimentos agendados, concluídos ou cancelados ficam preservadas. O recálculo está disponível apenas enquanto o orçamento estiver em elaboração.</p>':'<div class="finance-edit-slot"></div>'}`;
 if(view.editable)editor($('.finance-edit-slot',slot),slot,q,view);
}
function editor(target,slot,q,view){
 const e=view.latest,a=e?.assumptions||view.defaults;
 const i=e?structuredClone(e.inputs):{considerTravel:true,materialOverrideCents:null,distanceMode:'manual',manualDistanceMeters:null,routeId:null,tollCents:0,parkingCents:0,otherTravelCents:0,otherDirectCosts:[]};
 let route=view.addressChanged||view.routeNeedsRefresh?null:e?.routeSnapshot||null,confirmedDistance=false;
 if(view.addressChanged){i.manualDistanceMeters=null;i.routeId=null;i.distanceMode='manual';}
 target.innerHTML=`<details class="finance-edit" ${!e||view.stale?'open':''}><summary>${e?'Ajustar estimativa':'Configurar estimativa'}</summary>
 <form class="finance-estimate-form"><label class="finance-check"><input name="useCurrent" type="checkbox" ${!e?'checked':''}> Recalcular usando configurações atuais</label><p class="hint">Se desmarcado, preserva as premissas da última estimativa. Cada cálculo salva uma nova versão.</p>
 <label class="finance-check"><input name="considerTravel" type="checkbox" ${i.considerTravel?'checked':''}> Considerar deslocamento</label>
 <div class="finance-travel-fields"><p class="hint finance-origin-summary"></p><div class="fields"><label>Distância<select name="distanceMode"><option value="manual">Informada manualmente</option><option value="automatic">Automática</option></select></label>${field('distanceKm','Distância de ida (km)',i.manualDistanceMeters,'Informe apenas a ida; o cálculo aplica a configuração de ida e volta.',3)}</div>
 <div class="finance-actions"><button class="secondary finance-route-button" type="button">Calcular deslocamento</button><span class="finance-route-result" role="status"></span></div><p class="hint">${view.routes.configured?'A consulta automática usa openrouteservice / HeiGIT. Somente endereços e coordenadas necessárias são enviados.':'Rotas não configuradas. Informe a distância manualmente para continuar.'}</p></div>
 <div class="fields">${field('materialOverride','Material manual (R$) · opcional',i.materialOverrideCents,'Deixe em branco para aplicar os percentuais das premissas.')}${field('toll','Pedágio (R$)',i.tollCents)}${field('parking','Estacionamento (R$)',i.parkingCents)}${field('otherTravel','Outros deslocamentos (R$)',i.otherTravelCents)}</div>
 <div class="finance-cost-list"></div><button class="text-button finance-add-cost" type="button">＋ Outro custo direto</button><p class="finance-estimate-message" role="status"></p><button class="primary finance-save" type="submit">Salvar ajustes</button></form></details>`;
 const form=$('form',target),el=n=>form.elements[n],costList=$('.finance-cost-list',form);
 el('distanceMode').value=i.distanceMode;
 function addCost(v={description:'',amountCents:0}){
  const row=document.createElement('div');row.className='finance-cost-row';row.innerHTML=`<label>Descrição<input data-cost-description maxlength="240" value="${esc(v.description)}" placeholder="Ex.: auxiliar eventual"></label><label>Valor (R$)<input inputmode="decimal" data-cost-amount value="${scaled(v.amountCents)}"></label><button class="text-button" type="button" aria-label="Remover custo">Remover</button>`;
  $('button',row).onclick=()=>row.remove();costList.appendChild(row);
 }
 i.otherDirectCosts.forEach(addCost);$('.finance-add-cost',form).onclick=()=>{if(costList.children.length<30)addCost();};
 function currentOrigin(){return el('useCurrent').checked?view.currentOrigin:e?.assumptions.originAddressSnapshot||view.currentOrigin;}
 function display(){
  $('.finance-travel-fields',form).hidden=!el('considerTravel').checked;el('distanceKm').parentElement.hidden=el('distanceMode').value!=='manual';
  const s=el('useCurrent').checked?view.defaults:a;
  $('.finance-origin-summary',form).textContent='Saída: '+(currentOrigin()||'não informada')+' · '+(s.roundTrip?'Ida e volta':'Somente ida');
  $('.finance-route-result',form).textContent=route?number(route.distanceMeters/1000)+' km · openrouteservice / HeiGIT':'Nenhuma rota calculada para estes endereços.';
 }
 el('considerTravel').onchange=display;el('distanceMode').onchange=display;el('distanceKm').oninput=()=>{confirmedDistance=true;};
 el('useCurrent').onchange=()=>{route=null;if(currentOrigin()!==(e?.assumptions.originAddressSnapshot||view.currentOrigin)){el('distanceKm').value='';confirmedDistance=false;}display();};
 const envelope=()=>({proposalRevision:q.revision,expectedVersion:e?.version||0,useCurrentSettings:el('useCurrent').checked});
 const setBusy=value=>form.querySelectorAll('button').forEach(b=>b.disabled=value);
 $('.finance-route-button',form).onclick=async()=>{
  setBusy(true);const msg=$('.finance-estimate-message',form);msg.textContent='Calculando trajeto...';
  try{route=await EcoAuth.api('/api/proposals/'+encodeURIComponent(q.id)+'/finance/route',{method:'POST',body:JSON.stringify(envelope())});el('distanceMode').value='automatic';display();msg.textContent=route.cached?'Rota armazenada reutilizada. Salve os ajustes se desejar mantê-los.':'Rota calculada. Salve os ajustes se desejar mantê-los.';}
  catch(error){el('distanceMode').value='manual';display();msg.textContent=error.message;}finally{setBusy(false)}
 };
 form.onsubmit=async event=>{
  event.preventDefault();setBusy(true);const msg=$('.finance-estimate-message',form);msg.textContent='';
  try{
   const inputs={considerTravel:el('considerTravel').checked,materialOverrideCents:parse(el('materialOverride').value,2,true),distanceMode:el('distanceMode').value,
    manualDistanceMeters:parse(el('distanceKm').value,3,true),routeId:route?.id||null,tollCents:parse(el('toll').value||'0'),parkingCents:parse(el('parking').value||'0'),otherTravelCents:parse(el('otherTravel').value||'0'),
    otherDirectCosts:[...costList.children].map(row=>({description:$('[data-cost-description]',row).value,amountCents:parse($('[data-cost-amount]',row).value)}))};
   const next=await EcoAuth.api('/api/proposals/'+encodeURIComponent(q.id)+'/finance',{method:'PUT',body:JSON.stringify({...envelope(),confirmDistance:confirmedDistance,inputs})});
   if(slot.isConnected){render(slot,q,next);const profitSlot=document.querySelector('[data-profit-id="'+q.id+'"]');if(profitSlot)window.UniversalProfit?.mount(profitSlot,q);}notify('Estimativa salva. A proposta comercial não foi alterada.');
  }catch(error){msg.textContent=error.message}finally{if(form.isConnected)setBusy(false)}
 };
 display();
}
async function showDemo(){
 try{
  const view=await EcoAuth.api('/api/financial-demo');let dialog=$('#finance-demo-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='finance-demo-dialog';dialog.className='finance-demo-dialog';document.body.appendChild(dialog);}
  dialog.innerHTML=`<div class="dialog-head"><div><span class="finance-private">Demonstração · dados fictícios</span><h2>demonstração · atendimento em Osasco</h2></div><button type="button" class="icon-button" aria-label="Fechar exemplo">×</button></div><p class="hint">Origem em Carapicuíba. Distância simulada de 18 km por trecho; nenhuma API externa é consultada.</p>${metrics(view)}${distance(view.latest)}${composition(view.latest)}<p class="finance-note">Este exemplo não cria orçamento, não altera suas configurações e não entra no seu histórico.</p>`;
  $('button',dialog).onclick=()=>dialog.close();dialog.showModal();
 }catch(error){notify(error.message)}
}
window.UniversalFinance={initSettings,mount};
})();
