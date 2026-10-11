(function(root){
  'use strict';
  // Financeiro: distribuição de lucros entre sócios e resultado das campanhas por canal.
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(c,d=2)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:d,maximumFractionDigits:d}).format((c||0)/100);
  const num=(v,d=2)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=bps=>num(bps/100,bps%100?1:0)+'%';
  const initials=n=>String(n||'?').replace(/&/g,' ').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  const monthName=m=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-15T12:00:00Z'));
  const period=(from,to)=>from===to?monthName(from):monthName(from)+' a '+monthName(to);
  const lastDay=m=>{const d=new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),0));return d.toISOString().slice(0,10)};
  const notify=m=>root.EcoStudio?.notify(m);
  let draft=null;

  async function distribution(el,{from,to,demo}){
    if(demo){el.innerHTML='<p class="dre-note">A distribuição de lucros usa os dados reais da empresa. Saia da demonstração para ver os valores.</p>';return}
    const d=await EcoAuth.api('/api/finance/distribution?'+new URLSearchParams({from,to}));
    draft=d.partners.length?d.partners.map(p=>({...p})):[];
    render(el,d,{from,to});
  }
  function render(el,d,{from,to}){
    const gross=Math.max(1,d.grossCents),bar=(v,bg)=>`<div class="track"><b style="width:${Math.min(100,Math.abs(v)/gross*100).toFixed(1)}%;background:${bg}"></b></div>`;
    const row=(op,cls,label,sub,v,bg)=>`<div class="wfr ${cls}"><span class="op">${op}</span><div class="lb"><b>${esc(label)}</b><small>${esc(sub)}</small></div>${bar(v,bg)}<span class="vv">${op==='−'?'− ':''}${money(Math.abs(v))}</span></div>`;
    const group=(title,rows)=>rows.length?`<div class="grp">${title}</div>`+rows.map(r=>row('−','out',r.label,r.source,r.amountCents,'#e7b3ab')).join(''):'';
    const negative=d.profitCents<0,shares=draft.reduce((s,p)=>s+(p.active!==false?p.shareBps:0),0);
    const amounts=draft.filter(p=>p.active!==false).map((p,i,all)=>{const a=i===all.length-1?d.distributableCents-all.slice(0,-1).reduce((s,x)=>s+Math.round(d.distributableCents*x.shareBps/10000),0):Math.round(d.distributableCents*p.shareBps/10000);return {...p,amountCents:a}});
    const already=d.history.find(h=>h.from===from&&h.to===to);
    el.innerHTML=`<div class="fin-grid">
      <section class="hcard"><div class="ph"><div><h2>Do faturamento ao lucro distribuível</h2><p>Cada custo do período e de onde ele vem</p></div><span class="chip">${esc(period(from,to))}</span></div>
        <div class="wf">${row('+','in','Receita bruta',`${d.serviceCount} serviço${d.serviceCount===1?'':'s'} concluído${d.serviceCount===1?'':'s'}`,d.grossCents,'linear-gradient(90deg,var(--r-accent),var(--r-primary))')}
        ${group('Impostos e taxas',d.taxes)}${group('Custos diretos dos serviços',d.direct)}${group('Despesas operacionais',d.opex)}
        ${row('=','total','Lucro líquido',d.grossCents?num(d.profitCents/d.grossCents*100,1)+'% da receita':'Sem receita no período',d.profitCents,negative?'#e7b3ab':'var(--r-primary)')}
        ${row('−','out','Reserva de caixa ('+pct(d.reserveBps)+')','Fica na empresa',d.reserveCents,'#e0b54a')}
        ${row('=','final','Disponível para distribuir','Dividido entre os sócios',d.distributableCents,'var(--r-accent)')}</div>
        ${d.missingCosts?`<p class="dre-note">${d.missingCosts} serviço(s) ainda sem custo completo. O lucro considera só os custos já informados.</p>`:''}
        ${d.investmentCents?`<p class="dre-note">Investimentos de ${money(d.investmentCents)} não entram no lucro distribuível.</p>`:''}</section>
      <div class="fin-side">
        <section class="hcard camp"><div class="ph"><div><h2>Disponível para distribuir</h2><p>Lucro líquido menos a reserva</p></div></div><div class="spend"><strong>${money(d.distributableCents)}</strong><span>de ${money(d.profitCents)} de lucro líquido</span></div>
          <div class="split">${amounts.map((p,i)=>`<i style="width:${d.distributableCents?(p.amountCents/d.distributableCents*100).toFixed(1):0}%;background:${i?'var(--r-mid)':'var(--r-accent)'}"></i>`).join('')}</div>
          <label class="reserve"><span>Reserva</span><input type="range" min="0" max="5000" step="500" value="${d.reserveBps}" id="dist-reserve" aria-label="Reserva de caixa"><b>${pct(d.reserveBps)}</b></label></section>
        <section class="hcard"><div class="ph"><div><h2>Sócios</h2><p>Participação no lucro distribuível</p></div><button type="button" class="secondary small" id="partner-add">＋ Sócio</button></div>
          <div class="partners">${draft.map((p,i)=>{const a=amounts.find(x=>x.id===p.id);return `<div class="partner"><div class="r"><span class="av">${esc(initials(p.name))}</span><div class="pn"><input value="${esc(p.name)}" data-partner-name="${i}" aria-label="Nome do sócio" maxlength="160"><small>${pct(p.shareBps)} do lucro</small></div><div class="amt2"><strong>${money(a?a.amountCents:0)}</strong><small>a receber</small></div></div><div class="pct"><input type="range" min="0" max="10000" step="500" value="${p.shareBps}" data-partner-share="${i}" aria-label="Participação de ${esc(p.name)}"><span>${pct(p.shareBps)}</span>${draft.length>1?`<button type="button" class="text-button" data-partner-remove="${i}" aria-label="Remover ${esc(p.name)}">Remover</button>`:''}</div></div>`}).join('')||'<p class="hint">Cadastre os sócios para calcular a divisão.</p>'}</div>
          <div class="partner-foot"><span class="okline ${shares===10000?'ok':'bad'}">${shares===10000?'✓ Participações somam 100%':'As participações somam '+pct(shares)+'. Ajuste para 100%.'}</span><button type="button" class="primary" id="partner-save" ${shares!==10000?'disabled':''}>Salvar sócios</button></div></section>
        <section class="hcard"><div class="ph"><div><h2>Distribuições registradas</h2><p>Histórico de pagamentos aos sócios</p></div></div>
          <div class="rowlist">${d.history.map(h=>`<div><span><b>${esc(period(h.from,h.to))}</b><small>${h.partners.map(p=>esc(p.name)+' '+money(p.amountCents)).join(' · ')}</small></span>${h.status==='paid'?`<span class="pill up">Pago ${h.paidAt?h.paidAt.slice(8,10)+'/'+h.paidAt.slice(5,7):''}</span>`:`<span class="dist-actions"><button type="button" class="text-button" data-dist-paid="${esc(h.id)}">Marcar como pago</button><button type="button" class="text-button danger-text" data-dist-delete="${esc(h.id)}">Excluir</button></span>`}<b>${money(h.distributableCents)}</b></div>`).join('')||'<p class="hint">Nenhuma distribuição registrada ainda.</p>'}</div>
          ${already?'':`<button type="button" class="primary" id="dist-record" ${d.distributableCents>0?'':'disabled'}>Registrar distribuição de ${esc(period(from,to))}</button>`}</section>
      </div></div>`;
    const reload=()=>distribution(el,{from,to});
    el.querySelector('#dist-reserve').onchange=async e=>{try{await EcoAuth.api('/api/finance/distribution/settings',{method:'PUT',body:JSON.stringify({reserveBps:Number(e.target.value)})});await reload()}catch(err){notify(err.message)}};
    el.querySelector('#dist-reserve').oninput=e=>{e.target.nextElementSibling.textContent=pct(Number(e.target.value))};
    // O que sobra até 100% é repartido entre os demais sócios na proporção atual, em passos de 1%.
    const rebalance=i=>{const others=draft.map((p,k)=>k).filter(k=>k!==i);if(!others.length)return;const rest=Math.max(0,10000-draft[i].shareBps),base=others.reduce((n,k)=>n+draft[k].shareBps,0);let given=0;others.forEach((k,j)=>{const v=j===others.length-1?rest-given:Math.round((base?draft[k].shareBps/base:1/others.length)*rest/100)*100;draft[k].shareBps=v;given+=v})};
    el.querySelectorAll('[data-partner-share]').forEach(input=>input.oninput=e=>{const i=+e.target.dataset.partnerShare,v=Number(e.target.value);draft[i].shareBps=v;rebalance(i);render(el,d,{from,to});el.querySelector(`[data-partner-share="${i}"]`).focus()});
    el.querySelectorAll('[data-partner-name]').forEach(input=>input.oninput=e=>{draft[+e.target.dataset.partnerName].name=e.target.value});
    el.querySelectorAll('[data-partner-remove]').forEach(b=>b.onclick=()=>{draft.splice(+b.dataset.partnerRemove,1);render(el,d,{from,to})});
    el.querySelector('#partner-add').onclick=()=>{draft.push({name:'Novo sócio',shareBps:0,active:true});render(el,d,{from,to});const inputs=el.querySelectorAll('[data-partner-name]');inputs[inputs.length-1].select()};
    el.querySelector('#partner-save').onclick=async()=>{try{await EcoAuth.api('/api/partners',{method:'PUT',body:JSON.stringify(draft)});notify('Sócios salvos.');await reload()}catch(err){notify(err.message)}};
    el.querySelector('#dist-record')?.addEventListener('click',async()=>{try{await EcoAuth.api('/api/finance/distributions',{method:'POST',body:JSON.stringify({from,to})});notify('Distribuição registrada como pendente.');await reload()}catch(err){notify(err.message)}});
    el.querySelectorAll('[data-dist-delete]').forEach(b=>b.onclick=()=>EcoWorkspace.confirm('Excluir distribuição pendente','O registro sai do histórico. Os valores do período continuam disponíveis para registrar de novo.','Excluir',async()=>{await EcoAuth.api('/api/finance/distributions/'+encodeURIComponent(b.dataset.distDelete),{method:'DELETE'});notify('Distribuição excluída.');await reload()}));
    el.querySelectorAll('[data-dist-paid]').forEach(b=>b.onclick=async()=>{try{await EcoAuth.api('/api/finance/distributions/'+encodeURIComponent(b.dataset.distPaid)+'/paid',{method:'POST',body:'{}'});notify('Distribuição marcada como paga.');await reload()}catch(err){notify(err.message)}});
  }

  // Marketing: custo por orçamento, por fechamento, ROAS e ROI de cada canal no período.
  async function channels(el,{from,to,demo}){
    if(demo||!el)return;
    const d=await EcoAuth.api('/api/dashboard?'+new URLSearchParams({from:from+'-01',to:lastDay(to)}));
    const c=d.current.campaign,box=document.createElement('section');box.className='hcard channel-card';
    const tile=(label,value,formula,dark)=>`<div class="mtile ${dark?'dark':''}"><small>${label}</small><strong>${value}</strong><span class="formula">${formula}</span></div>`;
    const r=v=>num(v/100,0);
    box.innerHTML=`<div class="mstat">${tile('Gasto em campanhas',money(c.spendCents,0),Object.entries(d.spend.providers).map(([k,v])=>(k==='meta-ads'?'Meta ':'Google ')+r(v)).join(' · ')||'sem gasto no período')}${tile('Custo por orçamento',c.costPerQuoteCents==null?'—':money(c.costPerQuoteCents),c.costPerQuoteCents==null?'precisa de gasto e orçamentos':`${r(c.spendCents)} ÷ ${c.quotes} orçamentos`)}${tile('Custo por fechamento',c.costPerCloseCents==null?'—':money(c.costPerCloseCents),c.costPerCloseCents==null?'precisa de gasto e fechamentos':`${r(c.spendCents)} ÷ ${c.closed} concluídos`)}${tile('ROAS · ROI',c.roas==null?'—':`${num(c.roas)}× · ${num(c.roi*100,0)}%`,c.roas==null?'precisa de gasto no período':`receita ${r(c.revenueCents)} ÷ ${r(c.spendCents)}`,true)}</div>
      <div class="ph"><div><h2>Resultado por canal</h2><p>Cada orçamento conta para o canal marcado em "Como chegou até nós"</p></div></div>
      <div class="tblwrap"><table class="channel-table"><thead><tr><th>Canal</th><th>Gasto</th><th>Orçamentos</th><th>Fechamentos</th><th>Receita</th><th>Custo/orç.</th><th>Custo/fech.</th><th>ROAS</th><th>ROI</th></tr></thead><tbody>${d.channels.map(x=>`<tr><td><b class="with-icon">${EcoIcons.brandIcon(x.origin,'sm')}${esc(x.label)}</b></td><td>${x.paid?money(x.spendCents,0):'—'}</td><td>${x.quotes}</td><td>${x.closed}</td><td>${money(x.revenueCents,0)}</td><td>${x.costPerQuoteCents==null?'—':money(x.costPerQuoteCents)}</td><td>${x.costPerCloseCents==null?'—':money(x.costPerCloseCents)}</td><td><b>${x.roas==null?'—':num(x.roas)+'×'}</b></td><td><b class="${x.roi>=0?'up':'down'}">${x.roi==null?(x.paid?'—':'sem custo'):num(x.roi*100,0)+'%'}</b></td></tr>`).join('')||'<tr><td colspan="9" class="hint">Nenhum orçamento no período.</td></tr>'}</tbody></table></div>`;
    el.prepend(box);
  }
  root.UniversalDistribution={render:distribution,channels};
})(globalThis);
