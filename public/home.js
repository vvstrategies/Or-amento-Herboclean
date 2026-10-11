(function(root){
  'use strict';
  // Início: painel comercial por período e por canal de aquisição.
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(c,d=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:d,maximumFractionDigits:d}).format((c||0)/100);
  const num=(v,d=2)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const tz='America/Sao_Paulo';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const fmtDay=(d,opt={day:'numeric',month:'short'})=>new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',...opt}).format(new Date(d+'T12:00:00Z')).replace('.','');
  const PRESETS=[['today','Hoje'],['7','Últimos 7 dias'],['30','Últimos 30 dias'],['month','Mês atual'],['prev-month','Mês anterior'],['custom','Personalizado']];
  const CHANNELS=[['all','Todos'],['meta','Meta'],['google','Google']];
  const remember=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
  let state={preset:remember('hc-home-preset')||'30',from:'',to:'',channel:'all'},data=null,serial=0,bound=false,observer=null;

  function range(preset){
    const t=today();
    if(preset==='today')return [t,t];
    if(preset==='7')return [addDays(t,-6),t];
    if(preset==='month')return [t.slice(0,8)+'01',t];
    if(preset==='prev-month'){const first=t.slice(0,8)+'01',end=addDays(first,-1);return [end.slice(0,8)+'01',end]}
    if(preset==='custom'&&state.from&&state.to)return [state.from,state.to];
    return [addDays(t,-29),t];
  }
  const ICONS={sofa:'<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4H3z"/><path d="M5 17v2M19 17v2"/>',
    cadeira:'<path d="M7 3h10v8H7z"/><path d="M6 11h12v4H6zM7 15l-1 6M17 15l1 6"/>',colchao:'<rect x="3" y="8" width="18" height="9" rx="2.5"/><path d="M3 12h18M7 8v4M12 8v4M17 8v4"/>',
    tapete:'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h6v10H9z"/>',imper:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5l1.8 1.8 3.4-3.6"/>',
    cortina:'<path d="M3 3h18M5 3v18M19 3v18M5 3c3 5 3 12 0 18M19 3c-3 5-3 12 0 18"/>',carro:'<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>',
    poltrona:'<path d="M6 12V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M4 12a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4z"/><path d="M6 17v2M18 17v2"/>',outro:'<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>'};
  function iconFor(name){const n=String(name).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const k=/sofa/.test(n)?'sofa':/cadeira/.test(n)?'cadeira':/colch/.test(n)?'colchao':/tapete|carpete/.test(n)?'tapete':/imperme/.test(n)?'imper':/cortina|persiana/.test(n)?'cortina':/automot|carro|banco/.test(n)?'carro':/poltrona/.test(n)?'poltrona':'outro';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`}
  function delta(cur,prev,kind='pct'){
    if(cur==null||prev==null)return '<span class="pill">—</span>';
    if(kind==='pp'){const d=(cur-prev)*100;return `<span class="pill ${d>=0?'up':'down'}">${d>=0?'↑':'↓'} ${num(Math.abs(d),1)} p.p.</span>`}
    if(!prev)return cur?'<span class="pill up">novo</span>':'<span class="pill">—</span>';
    const d=(cur-prev)/prev*100;return `<span class="pill ${d>=0?'up':'down'}">${d>=0?'↑':'↓'} ${num(Math.abs(d),1)}%</span>`;
  }
  function greeting(){const h=Number(new Intl.DateTimeFormat('pt-BR',{timeZone:tz,hour:'numeric',hour12:false}).format(new Date()));return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}
  function companyName(){return document.querySelector('.topbar-workspace')?.textContent?.trim()||'equipe'}

  function shell(){
    const v=$('#home-view');
    v.innerHTML=`<div class="home-top"><div><h1 id="home-title">${greeting()}, ${esc(companyName())}</h1><p>Desempenho de <span id="home-range"></span><b id="home-channel"></b>, comparado ao período anterior</p></div>
      <div class="home-tools"><div class="home-period"><label class="sr-only" for="home-preset">Período</label><select id="home-preset">${PRESETS.map(([id,l])=>`<option value="${id}">${l}</option>`).join('')}</select></div>
      <div id="home-custom" class="home-custom" hidden><label>De<input type="date" id="home-from"></label><label>Até<input type="date" id="home-to"></label><button type="button" class="secondary" id="home-apply">Aplicar</button></div>
      <button type="button" class="primary" id="home-export">Exportar CSV</button></div></div>
      <div class="bento" id="home-bento" aria-busy="true"><div class="skeleton-grid" aria-label="Carregando o painel"><i></i><i></i><i></i><i></i><i class="wide"></i></div></div>`;
    $('#home-preset').value=state.preset;
    $('#home-preset').addEventListener('change',e=>{state.preset=e.target.value;remember('hc-home-preset',state.preset==='custom'?'30':state.preset);$('#home-custom').hidden=state.preset!=='custom';if(state.preset!=='custom')load();else{const [f,t]=range('30');$('#home-from').value=state.from||f;$('#home-to').value=state.to||t;$('#home-from').focus()}});
    $('#home-apply').addEventListener('click',()=>{const f=$('#home-from').value,t=$('#home-to').value;if(!f||!t||f>t)return root.EcoStudio?.notify('Escolha uma data inicial anterior à final.');state.from=f;state.to=t;load()});
    $('#home-export').addEventListener('click',exportCSV);
    $('#home-bento').addEventListener('click',e=>{const b=e.target.closest('[data-channel]');if(b){state.channel=b.dataset.channel;load();return}const d=e.target.closest('[data-open-quote]');if(d)root.EcoWorkspace?.openDetail(d.dataset.openQuote).catch(err=>root.EcoStudio?.notify(err.message));const n=e.target.closest('[data-go]');if(n)root.EcoWorkspace?.navigate(n.dataset.go)});
  }
  async function load(){
    if(!$('#home-bento'))shell();
    const [from,to]=range(state.preset),id=++serial;
    $('#home-range').textContent=from===to?fmtDay(from,{day:'numeric',month:'short',year:'numeric'}):`${fmtDay(from)} – ${fmtDay(to,{day:'numeric',month:'short',year:'numeric'})}`;
    $('#home-channel').textContent=state.channel==='all'?'':' · origem '+(state.channel==='meta'?'Meta Ads':'Google Ads');
    if(!root.EcoAuth?.online){$('#home-bento').innerHTML='<div class="home-empty"><h2>Abra pelo servidor para ver o painel.</h2><p>O Início usa os dados guardados no espaço da empresa. Abra o sistema pelo endereço do servidor.</p></div>';return}
    try{const d=await EcoAuth.api(`/api/dashboard?from=${from}&to=${to}&channel=${state.channel}`);if(id!==serial)return;data=d;$('#home-bento').removeAttribute('aria-busy');render()}catch(error){if(id===serial)$('#home-bento').innerHTML=`<div class="home-empty"><h2>Não foi possível carregar o painel.</h2><p>${esc(error.message)}</p></div>`}
  }
  function render(){
    const d=data,c=d.current,p=d.previous,camp=c.campaign,hasSpend=camp.spendCents>0,connected=d.spend.connected.length>0;
    const kpi=(nav,ic,label,val,cmp)=>`<button type="button" class="hcard kpi" data-nav="${nav}" title="Abrir ${nav==='finance'?'Financeiro':'Orçamentos'}"><span class="ic">${ic}</span><span class="body"><span class="lbl">${label}</span><span class="val">${val}</span><span class="cmp">${cmp}</span></span></button>`;
    const svg=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
    const funnelMax=Math.max(1,c.generated);
    const stepRow=(label,n,bg)=>`<div class="fstep"><span>${label}</span><div class="bar"><b style="width:${(n/funnelMax*100).toFixed(1)}%;background:${bg}"></b></div><em>${n}</em></div>`;
    const topService=d.services[0]?.revenueCents||1,svcTotal=d.services.reduce((s,x)=>s+x.revenueCents,0)||1;
    const providers=Object.entries(d.spend.providers),spendTotal=providers.reduce((s,[,v])=>s+v,0);
    const metric=(label,value,formula,hi)=>`<div class="${hi?'hi':''}"><small>${label}</small><strong>${value}</strong><span class="formula">${formula}</span></div>`;
    const reais=v=>num(v/100,0),paid=camp.paidRevenueCents??c.revenueCents;
    $('#home-bento').innerHTML=`
      ${kpi('finance',svg('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),'Receita concluída',money(c.revenueCents),`${delta(c.revenueCents,p.revenueCents)}vs ${money(p.revenueCents)}`)}
      ${kpi('quotes',svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/>'),'Orçamentos gerados',c.generated,`${delta(c.generated,p.generated)}vs ${p.generated}`)}
      ${kpi('quotes',svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'),'Conversão em serviço',c.conversion==null?'—':num(c.conversion*100,1)+'<small>%</small>',`${delta(c.conversion,p.conversion,'pp')}vs ${p.conversion==null?'—':num(p.conversion*100,1)+'%'}`)}
      ${kpi('finance',svg('<path d="M3 9h18l-2 11H5z"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/>'),'Ticket médio',c.ticketCents==null?'—':money(c.ticketCents),`${delta(c.ticketCents,p.ticketCents)}vs ${p.ticketCents==null?'—':money(p.ticketCents)}`)}
      <section class="hcard s7 chart-card"><div class="ph"><div><h2>Receita acumulada</h2><p class="chart-hero"><strong>${money(c.revenueCents)}</strong>${delta(c.revenueCents,p.revenueCents)}<span>vs ${money(p.revenueCents)}</span></p></div><div class="legend"><span><i class="cur"></i>Este período</span><span><i class="prev"></i>Anterior</span></div></div><div class="chartbox" id="home-chartbox"><svg id="home-chart" role="img" aria-label="Receita acumulada: ${esc(money(c.revenueCents))} neste período contra ${esc(money(p.revenueCents))} no anterior"></svg><div class="chart-tip" id="home-tip" hidden></div></div></section>
      <section class="hcard s5 camp"><div class="ph"><div><h2>Campanhas</h2><p>${state.channel==='all'?'Gasto dividido pelos resultados do período':'Só orçamentos com origem '+(state.channel==='meta'?'Meta Ads':'Google Ads')}</p></div><div class="seg on-dark" role="group" aria-label="Canal">${CHANNELS.map(([id,l])=>`<button type="button" data-channel="${id}" aria-pressed="${state.channel===id}">${id==='all'?'':EcoIcons.brandIcon(id,'sm')}${l}</button>`).join('')}</div></div>
        <div class="spend"><strong>${money(camp.spendCents)}</strong><span>${hasSpend?(state.channel==='all'?'investidos · '+providers.map(([k,v])=>(k==='meta-ads'?'Meta ':'Google ')+money(v)).join(' · '):`investidos · ${c.generated} orçamentos e ${c.closed} fechamentos vieram daqui`):connected?'sem gasto registrado no período':'conecte Google Ads ou Meta Ads para medir o gasto'}</span></div>
        <div class="split" aria-hidden="true">${state.channel==='all'&&spendTotal?providers.map(([k,v])=>`<i style="width:${(v/spendTotal*100).toFixed(1)}%;background:${k==='meta-ads'?'var(--r-accent)':'var(--r-mid)'}"></i>`).join(''):`<i style="width:100%;background:${hasSpend?(state.channel==='google'?'var(--r-mid)':'var(--r-accent)'):'transparent'}"></i>`}</div>
        ${hasSpend?`<div class="mx">${metric('Custo por orçamento',camp.costPerQuoteCents==null?'—':money(camp.costPerQuoteCents,2),`R$ ${reais(camp.spendCents)} ÷ ${c.generated}`)}${metric('Custo por fechamento',camp.costPerCloseCents==null?'—':money(camp.costPerCloseCents,2),`R$ ${reais(camp.spendCents)} ÷ ${c.closed}`)}${metric(state.channel==='all'?'ROAS · Meta + Google':'ROAS',camp.roas==null?'—':num(camp.roas)+'×',`R$ ${reais(paid)} ÷ R$ ${reais(camp.spendCents)}`+(state.channel==='all'&&camp.roasTotal!=null?` · geral ${num(camp.roasTotal)}×`:''),true)}${metric('ROI',camp.roi==null?'—':num(camp.roi*100,0)+'%',`(R$ ${reais(paid)} − R$ ${reais(camp.spendCents)}) ÷ R$ ${reais(camp.spendCents)}`,true)}</div>`
          :`<div class="camp-empty"><p>${connected?'Assim que houver gasto no período, o custo por orçamento, o custo por fechamento, o ROAS e o ROI aparecem aqui.':'O custo por orçamento, o ROAS e o ROI usam o gasto real das campanhas. Conecte as contas em Configurações.'}</p>${connected?'':'<button type="button" class="secondary" data-go="settings">Conectar contas</button>'}</div>`}
      </section>
      <section class="hcard s4"><div class="ph"><div><h2>Do orçamento ao serviço</h2><p>Dos orçamentos criados no período, quantos avançaram</p></div></div>
        <div class="funnel">${stepRow('Gerados',c.generated,'linear-gradient(90deg,color-mix(in srgb,var(--r-primary) 20%,#fff),color-mix(in srgb,var(--r-primary) 28%,#fff))')}${stepRow('Chegaram a agendar',c.reachedSchedule??c.scheduled,'linear-gradient(90deg,color-mix(in srgb,var(--r-primary) 45%,#fff),color-mix(in srgb,var(--r-primary) 55%,#fff))')}${stepRow('Concluídos',c.completed??c.completedFromCreated,'linear-gradient(90deg,var(--r-bright),var(--r-primary))')}${stepRow('Cancelados',c.cancelled,'#e7b3ab')}</div>
        <div class="conv"><div><small>Gerado → agendado</small><strong>${c.generated?num((c.reachedSchedule??c.scheduled)/c.generated*100,1)+'%':'—'}</strong></div><div><small>A receber · agendados</small><strong>${money(d.toReceiveCents??d.forecastCents)}</strong></div></div></section>
      <section class="hcard s4"><div class="ph"><div><h2>Próximos atendimentos</h2><p>Próximos 7 dias</p></div><span class="chip">${d.upcoming.length} confirmado${d.upcoming.length===1?'':'s'}</span></div>
        <div class="list">${d.upcoming.length?d.upcoming.map(u=>{const day=new Intl.DateTimeFormat('pt-BR',{timeZone:tz,day:'2-digit'}).format(new Date(u.start)),wd=new Intl.DateTimeFormat('pt-BR',{timeZone:tz,weekday:'short'}).format(new Date(u.start)).replace('.',''),hour=new Intl.DateTimeFormat('pt-BR',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(new Date(u.start)).replace(':00','h').replace(':','h');
          return `<button type="button" class="row" data-open-quote="${esc(u.id)}"><span class="when"><b>${day}</b><small>${esc(wd)}</small></span><span class="who"><b>${esc(u.client)}</b><span>${esc(hour)} · ${esc(u.services.join(' + '))}</span></span><span class="amt">${money(u.pixCents)}<small>${esc(u.place)}</small></span></button>`}).join(''):'<p class="list-empty">Nenhum atendimento agendado para os próximos 7 dias.</p>'}</div></section>
      <section class="hcard s4"><div class="ph"><div><h2>Receita por serviço</h2><p>Concluídos no período</p></div></div>
        <div class="list">${d.services.length?d.services.map(s=>`<div class="svc"><span class="t">${iconFor(s.service)}${esc(s.service)}</span><span class="v">${money(s.revenueCents)}</span><div class="m"><div class="bar"><b style="width:${(s.revenueCents/topService*100).toFixed(1)}%"></b></div><span>${s.count} ${s.count>1?'serviços':'serviço'} · ${num(s.revenueCents/svcTotal*100,1)}%</span></div></div>`).join(''):'<p class="list-empty">Nenhum serviço concluído no período.</p>'}</div></section>`;
    draw();
    if(!observer){observer=new ResizeObserver(()=>draw())}observer.disconnect();const box=$('#home-chartbox');if(box)observer.observe(box);
  }
  let drawnKey='';
  function draw(){
    const box=$('#home-chartbox'),svg=$('#home-chart'),tip=$('#home-tip');if(!box||!svg||!data)return;const W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    const cur=data.series.current,prev=data.series.previous,n=Math.max(1,cur.length-1),peak=Math.max(cur.at(-1)||0,prev.at(-1)||0,10000);
    const reais=peak/100,mag=Math.pow(10,Math.floor(Math.log10(reais))),max=[1,2,2.5,4,5,8,10].map(k=>k*mag).find(k=>k>=reais)*100,step=max/4;
    const L=58,R=16,T=16,B=26,x=i=>L+(W-L-R)*i/n,y=v=>T+(H-T-B)*(1-v/max);
    const fmt=v=>v>=100000?'R$ '+num(v/100000,v%100000?1:0)+' mil':money(v);
    const key=data.from+data.to+data.channel+cur.at(-1),animate=key!==drawnKey;drawnKey=key;
    let h=`<defs><linearGradient id="home-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--r-primary)" stop-opacity=".3"/><stop offset=".55" stop-color="var(--r-accent)" stop-opacity=".12"/><stop offset="1" stop-color="var(--r-accent)" stop-opacity="0"/></linearGradient><linearGradient id="home-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--r-mid)"/><stop offset="1" stop-color="var(--r-primary)"/></linearGradient><filter id="home-glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5"/></filter></defs>`;
    for(let v=0;v<=max;v+=step)h+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--r-line)" stroke-dasharray="${v?'3 5':'0'}"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end">${v?fmt(v):'0'}</text>`;
    const ticks=n<3?[0,n]:[0,Math.round(n/3),Math.round(2*n/3),n];
    for(const i of ticks)h+=`<text x="${x(i)}" y="${H-6}" text-anchor="${i===0?'start':i===n?'end':'middle'}">${fmtDay(addDays(data.from,i))}</text>`;
    const pc=cur.map((v,i)=>[x(i),y(v)]),pp=prev.map((v,i)=>[x(i),y(v)]),line=EcoChart.smooth(pc),pline=EcoChart.smooth(pp),cls=animate?' class="draw" pathLength="1"':'';
    h+=`<path${animate?' class="rise"':''} d="${line} L${x(n)} ${y(0)} L${x(0)} ${y(0)} Z" fill="url(#home-g)"/><path${cls} d="${pline}" fill="none" stroke="var(--r-accent)" stroke-width="2" stroke-dasharray="${animate?'':'6 6'}" stroke-linecap="round" opacity=".9"/><path d="${line}" fill="none" stroke="var(--r-accent)" stroke-width="7" opacity=".3" filter="url(#home-glow)"/><path${cls} d="${line}" fill="none" stroke="url(#home-s)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    h+=`<g id="home-hover" hidden><line y1="${T}" y2="${y(0)}" stroke="var(--r-primary)" stroke-opacity=".25" stroke-dasharray="3 4"/><circle class="hp" r="4" fill="#fff" stroke="var(--r-accent)" stroke-width="2"/><circle class="hc" r="10" fill="var(--r-accent)" fill-opacity=".3"/><circle class="hc2" r="5.5" fill="var(--r-primary)" stroke="#fff" stroke-width="2.5"/></g><g id="home-end"><circle cx="${x(n)}" cy="${y(cur.at(-1)||0)}" r="10" fill="var(--r-accent)" fill-opacity=".3"/><circle cx="${x(n)}" cy="${y(cur.at(-1)||0)}" r="5.5" fill="var(--r-primary)" stroke="#fff" stroke-width="2.5"/></g><rect x="${L}" y="0" width="${W-L-R}" height="${H}" fill="transparent" id="home-hit"/>`;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML=h;
    if(animate)setTimeout(()=>svg.querySelectorAll('.draw').forEach((el,i)=>{el.removeAttribute('pathLength');if(i===0)el.setAttribute('stroke-dasharray','6 6');el.classList.remove('draw')}),1300);
    const hover=svg.querySelector('#home-hover'),end=svg.querySelector('#home-end');
    const show=e=>{const r=svg.getBoundingClientRect(),i=Math.max(0,Math.min(n,Math.round((e.clientX-r.left-L)/(W-L-R)*n))),cx=x(i),cy=y(cur[i]||0);
      hover.removeAttribute('hidden');end.setAttribute('hidden','');hover.querySelector('line').setAttribute('x1',cx);hover.querySelector('line').setAttribute('x2',cx);
      for(const c of hover.querySelectorAll('.hc,.hc2')){c.setAttribute('cx',cx);c.setAttribute('cy',cy)}const hp=hover.querySelector('.hp');hp.setAttribute('cx',cx);hp.setAttribute('cy',y(prev[i]||0));
      tip.hidden=false;const label=fmtDay(addDays(data.from,i),{weekday:'short',day:'numeric',month:'short'}).replace(/\.$/,'');tip.innerHTML=`<b>${esc(label.charAt(0).toUpperCase()+label.slice(1))}</b><span><strong>${esc(money(cur[i]||0))}</strong> acumulado</span><span class="m">anterior ${esc(money(prev[i]||0))}</span>`;
      tip.style.left=Math.min(W-90,Math.max(90,cx))+'px';tip.style.top=Math.max(52,cy)+'px'};
    const hide=()=>{hover.setAttribute('hidden','');end.removeAttribute('hidden');tip.hidden=true};
    const hit=svg.querySelector('#home-hit');hit.addEventListener('pointermove',show);hit.addEventListener('pointerleave',hide);
  }
  function exportCSV(){
    if(!data)return;const c=data.current,p=data.previous,camp=c.campaign,safe=x=>{const t=String(x??'');return /^[=+\-@\t\r]/.test(t)&&!/^-?\d/.test(t)?"'"+t:t},row=(...v)=>v.map(x=>`"${safe(x).replace(/"/g,'""')}"`).join(';');
    const lines=[row('Indicador','Período atual','Período anterior'),row('Período',`${data.from} a ${data.to}`,`${p.from} a ${p.to}`),row('Canal',data.channel,data.channel),row('Receita concluída (R$)',c.revenueCents/100,p.revenueCents/100),row('Orçamentos gerados',c.generated,p.generated),row('Fechamentos',c.closed,p.closed),row('Conversão (%)',c.conversion==null?'':(c.conversion*100).toFixed(1),p.conversion==null?'':(p.conversion*100).toFixed(1)),row('Ticket médio (R$)',c.ticketCents==null?'':c.ticketCents/100,p.ticketCents==null?'':p.ticketCents/100),row('Gasto em campanhas (R$)',camp.spendCents/100,p.campaign.spendCents/100),row('Custo por orçamento (R$)',camp.costPerQuoteCents==null?'':camp.costPerQuoteCents/100,''),row('Custo por fechamento (R$)',camp.costPerCloseCents==null?'':camp.costPerCloseCents/100,''),row('ROAS',camp.roas==null?'':camp.roas.toFixed(2),''),row('ROI (%)',camp.roi==null?'':(camp.roi*100).toFixed(1),''),'',row('Serviço','Receita (R$)','Quantidade'),...data.services.map(s=>row(s.service,s.revenueCents/100,s.count))];
    root.EcoDownloadBlob(new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),`painel-comercial-${data.from}-a-${data.to}.csv`);
  }
  function open(){if(!$('#home-bento'))shell();$('#home-title').textContent=`${greeting()}, ${companyName()}`;load()}
  window.addEventListener('eco:data-changed',()=>{if(!$('#home-view')?.hidden)load()});
  root.EcoHome={open,load};
})(globalThis);
