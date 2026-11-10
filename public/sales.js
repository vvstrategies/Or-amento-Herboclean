(function(root){
  'use strict';
  // Vendas & Receita (item 4): receita do período e os clientes que compraram, com a ficha editável ao lado.
  // Duas visões alternáveis: Lista (compradores em tabela) e Quadro (reabordagem por tempo desde a última compra).
  const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>[...p.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(c,d=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:d,maximumFractionDigits:d}).format((c||0)/100);
  const tz='America/Sao_Paulo',today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const br=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—',brShort=d=>d?d.slice(8,10)+'/'+d.slice(5,7):'—';
  const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  const ORIGIN={meta:'Meta',google:'Google',organico:'Orgânico',indicacao:'Indicação',cliente:'Cliente antigo'};
  const remember=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
  let view=remember('hc-sales-view')||'list',quick='all',query='',selected=null,detail=null,data={dash:null,clients:[],tags:[]},serial=0,bound=false;
  const notify=m=>root.EcoStudio?.notify(m);

  const tagLabel=id=>{const t=data.tags.find(t=>t.id===id);return t?t.label.charAt(0)+t.label.slice(1).toLowerCase():id};
  const done=c=>(c.facets||[]).filter(x=>x.status==='completed'&&x.completedAt);
  const passes=(c,x)=>EcoFilters.match('sales',{origin:x.origin,services:x.services,tags:c.tags||[]},{period:false});
  const f=()=>EcoFilters.get('sales');
  // Compradores do período: ao menos um atendimento concluído no período que atende aos filtros.
  const buyers=()=>{const {from,to}=f();return data.clients.filter(c=>done(c).some(x=>x.completedAt>=from&&x.completedAt<=to&&passes(c,x)))};
  const anyMatch=c=>done(c).some(x=>passes(c,x));
  const daysSince=d=>d?Math.round((Date.parse(today()+'T12:00:00Z')-Date.parse(d+'T12:00:00Z'))/86400000):null;
  const toReach=c=>c.closedCount>0&&!c.nextServiceDate&&daysSince(c.lastServiceDate)>90&&anyMatch(c);
  const birthdayMonth=c=>c.birthday&&c.birthday.slice(0,2)===today().slice(5,7)&&anyMatch(c);
  const lastDone=c=>done(c).sort((a,b)=>b.completedAt.localeCompare(a.completedAt))[0]||null;
  const originOf=c=>lastDone(c)?.origin||c.origin||'';

  function shell(){
    const v=$('#sales-view');
    v.innerHTML=`<h1 class="sr-only">Vendas e receita</h1><div class="page-heading page-heading-bar"><div class="fbar-slot" id="sales-filters"></div></div>
      <div class="sales-kpis" id="sales-kpis" aria-live="polite"></div>
      <div class="sales-layout"><section class="hcard sales-main" id="sales-main"></section><aside class="hcard sales-profile" id="sales-profile" aria-live="polite"></aside></div>`;
    EcoFilters.mount($('#sales-filters'),{scope:'sales',dims:['origin','period','service','tag'],onChange:()=>load()});
    v.addEventListener('click',onClick);v.addEventListener('input',e=>{if(e.target.id==='sales-search'){query=e.target.value.trim().toLowerCase();renderMain()}});
    v.addEventListener('focusout',onBlur);v.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-client]')){e.preventDefault();select(e.target.dataset.client)}});
  }
  async function load(){
    if(!$('#sales-main'))shell();
    if(!root.EcoAuth?.online){$('#sales-main').innerHTML='<p class="hint">Abra pelo servidor para ver as vendas.</p>';return}
    const id=++serial;
    try{
      const [dash,clients,tags]=await Promise.all([EcoAuth.api('/api/dashboard?'+EcoFilters.query('sales')),EcoCache.get('/api/clients'),EcoCache.get('/api/tags').catch(()=>[])]);
      if(id!==serial)return;data={dash,clients,tags:tags||[]};
      renderKpis();renderMain();
      const list=view==='list'?listRows():boardRows();
      if(!selected||!list.some(c=>c.id===selected))selected=list[0]?.id||null;
      if(selected)await select(selected,true);else renderProfile();
    }catch(error){if(id===serial)$('#sales-main').innerHTML=`<p class="hint">Não foi possível carregar: ${esc(error.message)}</p>`}
  }
  function delta(cur,prev){if(cur==null||prev==null)return '';if(!prev)return cur?'<span class="pill up">novo</span>':'';const d=(cur-prev)/prev*100;return `<span class="pill ${d>=0?'up':'down'}">${d>=0?'+':'−'}${Math.abs(d).toLocaleString('pt-BR',{maximumFractionDigits:0})}%</span>`}
  function renderKpis(){
    const c=data.dash.current,p=data.dash.previous,b=buyers(),{from}=f(),repeat=b.filter(x=>done(x).some(y=>y.completedAt<from)).length;
    const scheduled=data.dash.toReceiveCount||0,overdue=data.dash.overdueCount||0;
    const receiveSub=`${scheduled} agendado${scheduled===1?'':'s'} a partir de hoje${overdue?` · ${overdue} com horário vencido`:''}`;
    const kpi=(label,val,sub,extra='',hero=false)=>`<div class="sk${hero?' hero':''}"><small>${label}</small><strong>${val}</strong>${extra}<span>${sub}</span></div>`;
    $('#sales-kpis').innerHTML=kpi('Receita no período',money(c.revenueCents),`vs. período anterior (${money(p.revenueCents)})`,delta(c.revenueCents,p.revenueCents),true)
      +kpi('Vendas',c.closed,'atendimentos concluídos')+kpi('Ticket médio',c.ticketCents==null?'—':money(c.ticketCents),'receita ÷ vendas')
      +kpi('Clientes que compraram',b.length,repeat?`${repeat} já tinham comprado antes`:'nenhum recorrente no período')
      +kpi('A receber',money(data.dash.toReceiveCents),receiveSub);
  }
  function listRows(){
    const base=quick==='reach'?data.clients.filter(toReach):quick==='birthday'?data.clients.filter(birthdayMonth):buyers();
    return base.filter(c=>!query||[c.name,c.phone,c.neighborhood,c.city].join(' ').toLowerCase().includes(query)).sort((a,b)=>String(b.lastServiceDate||'').localeCompare(String(a.lastServiceDate||'')));
  }
  const avatar=c=>`<span class="av">${esc(initials(c.name))}${EcoAuth.online?EcoAvatar.img('clients',c.id):''}</span>`;
  const originCell=c=>{const o=originOf(c);return o?`<span class="so">${EcoIcons.optionIcon(o)}${esc(ORIGIN[o]||o)}</span>`:'<span class="muted">—</span>'};
  const tagCell=c=>(c.tags||[]).map(id=>`<span class="tag t${data.tags.findIndex(t=>t.id===id)<0?3:Math.min(3,data.tags.findIndex(t=>t.id===id))}">${esc(tagLabel(id))}</span>`).join('')||'<span class="muted">—</span>';
  const switcher=()=>`<div class="seg view-switch" role="group" aria-label="Visão"><button type="button" data-sales-view="list" aria-pressed="${view==='list'}">Lista</button><button type="button" data-sales-view="board" aria-pressed="${view==='board'}">Quadro</button></div>`;
  function renderMain(){
    const box=$('#sales-main');if(!box||!data.dash)return;
    $$('[data-sales-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.salesView===view)));
    box.classList.toggle('board',view==='board');
    if(view==='board')return renderBoard(box);
    const b=buyers(),counts={all:b.length,reach:data.clients.filter(toReach).length,birthday:data.clients.filter(birthdayMonth).length},rows=listRows();
    box.innerHTML=`<div class="ph"><div><h2>Clientes que compraram</h2><p>${quick==='reach'?'Sem compra há mais de 90 dias e sem atendimento agendado.':quick==='birthday'?'Fazem aniversário neste mês.':'Concluíram ao menos um atendimento no período. Clique para abrir a ficha.'}</p></div>${switcher()}</div>
      <div class="sales-tools"><div class="seg" role="group" aria-label="Atalhos">${[['all','Todos'],['reach','Reabordar'],['birthday','Aniversário no mês']].map(([id,l])=>`<button type="button" data-quick="${id}" aria-pressed="${quick===id}">${l} <span class="n">${counts[id]}</span></button>`).join('')}</div>
      <label class="search-control"><span class="sr-only">Buscar nome ou telefone</span><input id="sales-search" type="search" placeholder="Buscar nome ou telefone" value="${esc(query)}"></label></div>
      <div class="sales-table-wrap"><table class="sales-table"><thead><tr><th>Cliente</th><th>Origem</th><th class="num">Compras</th><th class="num">Total (histórico)</th><th>Última compra</th><th>Próximo</th></tr></thead><tbody>
      ${rows.length?rows.map(c=>`<tr data-client="${esc(c.id)}" tabindex="0" class="${c.id===selected?'sel':''}" aria-selected="${c.id===selected}"><td><div class="who2">${avatar(c)}<div><b>${esc(c.name)}</b><small>${esc([c.neighborhood,c.city].filter(Boolean).join(' · ')||c.phone||'')}</small></div><span class="st-tags">${tagCell(c)}</span></div></td><td>${originCell(c)}</td><td class="num">${c.closedCount}</td><td class="num"><b>${money(c.closedCents)}</b></td><td>${br(c.lastServiceDate)}</td><td>${c.nextServiceDate?`<span class="chip">${br(c.nextServiceDate)}</span>`:'—'}</td></tr>`).join(''):`<tr><td colspan="6" class="hint">${quick==='all'?'Nenhum cliente concluiu atendimento com estes filtros.':'Ninguém nesta lista agora.'}</td></tr>`}
      </tbody></table></div><p class="sales-foot">${b.length} cliente${b.length===1?'':'s'} · ${money(data.dash.current.revenueCents)} no período. “Reabordar” = sem compra há mais de 90 dias e sem atendimento agendado.</p>`;
  }
  // Quadro: colunas por tempo desde a última compra (os filtros de origem, serviço e tipo continuam valendo).
  // Clientes do quadro, do mais recente ao mais antigo (a ordem em que as colunas aparecem).
  const boardRows=()=>data.clients.filter(c=>c.closedCount>0&&anyMatch(c)&&(!query||[c.name,c.phone].join(' ').toLowerCase().includes(query))).sort((a,b)=>String(b.lastServiceDate||'').localeCompare(String(a.lastServiceDate||'')));
  function renderBoard(box){
    const cols=[['Últimos 3 meses',0,90],['Há 3 a 6 meses',91,180],['Há 6 a 12 meses',181,365],['Mais de 1 ano',366,1e9]];
    const all=boardRows();
    box.innerHTML=`<div class="ph"><div><h2>Reabordagem</h2><p>Clientes pelo tempo desde a última compra. “Reabordar” abre a ficha ao lado.</p></div><div class="sb-tools">${switcher()}<label class="search-control"><span class="sr-only">Buscar</span><input id="sales-search" type="search" placeholder="Buscar nome ou telefone" value="${esc(query)}"></label></div></div>
      <div class="sales-board">${cols.map(([label,min,max],i)=>{const list=all.filter(c=>{const d=daysSince(c.lastServiceDate);return d!=null&&d>=min&&d<=max}).sort((a,b)=>String(b.lastServiceDate).localeCompare(String(a.lastServiceDate)));
        return `<section class="sb-col${i===0?' fresh':''}"><header><b>${label}</b><span class="n">${list.length}</span></header><div class="sb-list">${list.map(c=>{const last=lastDone(c),bd=c.birthday&&c.birthday.slice(0,2)===today().slice(5,7);
          return `<article class="sb-card${c.id===selected?' sel':''}" data-client="${esc(c.id)}" tabindex="0"><div class="who2">${avatar(c)}<div><b>${esc(c.name)}</b><small>${brShort(c.lastServiceDate)} · ${esc((last?.services||[]).slice(0,2).join(' + ')||'serviço')}</small></div></div><div class="sb-tags">${tagCell(c)}${bd?`<span class="chip bd">Aniversário ${c.birthday.slice(3)}/${c.birthday.slice(0,2)}</span>`:''}${c.nextServiceDate?`<span class="chip">Agendado ${brShort(c.nextServiceDate)}</span>`:''}</div>${i>0&&!c.nextServiceDate?`<button type="button" class="sb-reach" data-client-open="${esc(c.id)}">Reabordar</button>`:''}</article>`}).join('')||'<p class="hint">Ninguém aqui.</p>'}</div></section>`}).join('')}</div>`;
  }
  async function select(id,quiet){
    selected=id;if(!quiet)$$('[data-client]').forEach(el=>{const on=el.dataset.client===id;el.classList.toggle('sel',on);if(el.tagName==='TR')el.setAttribute('aria-selected',String(on))});
    try{detail=await EcoAuth.api('/api/clients/'+encodeURIComponent(id));if(selected===id)renderProfile()}catch(error){notify(error.message)}
  }
  function renderProfile(){
    const box=$('#sales-profile');if(!box)return;const c=detail;
    if(!c){box.innerHTML='<p class="hint">Escolha um cliente para ver a ficha.</p>';return}
    const since=c.firstDate?new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(c.firstDate+'T12:00:00Z')).replace('.',''):'';
    const o=originOf(data.clients.find(x=>x.id===c.id)||c),ticket=c.closedCount?Math.round(c.closedCents/c.closedCount):null;
    const bdDays=(()=>{if(!c.birthday)return null;const t=today(),y=+t.slice(0,4);for(const year of [y,y+1]){const n=daysSince(year+'-'+c.birthday);if(n<=0)return -n}return null})();
    const custom=(c.custom||[]).filter(x=>x.label||x.value);
    box.innerHTML=`<div class="sp-head">${avatar(c)}<div><h2>${esc(c.name)}</h2><p>${esc([ORIGIN[o]||'',since&&'cliente desde '+since].filter(Boolean).join(' · '))}</p></div>${tagCell(c)}</div>
      <div class="sp-stats"><div><small>Compras</small><b>${c.closedCount}</b></div><div><small>Total</small><b>${money(c.closedCents)}</b></div><div><small>Ticket</small><b>${ticket==null?'—':money(ticket)}</b></div></div>
      <form class="sp-form" id="sales-form" data-id="${esc(c.id)}" autocomplete="off">
        <label>Telefone<input name="phone" maxlength="60" inputmode="tel" value="${esc(c.phone)}"></label>
        <label><span>Aniversário <small>DD/MM${bdDays!=null?` · em ${bdDays} dia${bdDays===1?'':'s'}`:''}</small></span><input name="birthday" maxlength="5" placeholder="14/11" value="${esc(c.birthday?c.birthday.slice(3)+'/'+c.birthday.slice(0,2):'')}"></label>
        <label class="wide">E-mail<input name="email" type="email" maxlength="240" value="${esc(c.email)}"></label>
        <label class="wide">Observações<textarea name="notes" rows="3" maxlength="3000" placeholder="Preferências, animais, tecido, horário…">${esc(c.notes)}</textarea></label>
        <div class="wide sp-custom"><span>Campos personalizados</span>${custom.map((x,i)=>`<div class="sp-cf"><input data-cf-label="${i}" maxlength="60" value="${esc(x.label)}" aria-label="Nome do campo"><input data-cf-value="${i}" maxlength="240" value="${esc(x.value)}" aria-label="Valor"></div>`).join('')}<button type="button" class="text-button" data-add-field>+ Adicionar campo</button></div>
      </form>
      <p class="sp-status" id="sales-status" role="status">Salva ao sair do campo</p>
      <div class="sp-history"><h3>Histórico</h3>${(c.history||[]).map(h=>`<button type="button" class="sp-h" data-open-quote="${esc(h.id)}"><span><b>${esc(h.services.slice(0,3).join(' + ')||h.number)}</b><small>${br(h.serviceDate||h.date)} · ${({generated:'orçamento',scheduled:'agendado',completed:'concluído',cancelled:'cancelado'})[h.status]||h.status}</small></span><b>${money(h.pixCents)}</b></button>`).join('')||'<p class="hint">Sem orçamentos ainda.</p>'}</div>
      <div class="sp-actions">${c.phone?'<button type="button" class="secondary" data-copy-phone>Copiar telefone</button>':''}<button type="button" class="primary" data-new>＋ Novo orçamento</button></div>`;
  }
  // Salva o campo ao sair dele (sem botão). Campos personalizados vão juntos.
  async function onBlur(e){
    const form=e.target.closest('#sales-form');if(!form||!e.target.matches('input,textarea'))return;
    const body={phone:form.phone.value,birthday:form.birthday.value,email:form.email.value,notes:form.notes.value,custom:$$('[data-cf-label]',form).map(el=>({label:el.value.trim(),value:$(`[data-cf-value="${el.dataset.cfLabel}"]`,form).value.trim()})).filter(x=>x.label||x.value)};
    const key=JSON.stringify(body);if(form.dataset.saved===key)return;
    const status=$('#sales-status');status.textContent='Salvando…';
    try{const saved=await EcoAuth.api('/api/clients/'+encodeURIComponent(form.dataset.id),{method:'PUT',body:JSON.stringify(body)});form.dataset.saved=key;detail={...detail,...saved};status.textContent='Salvo ✓';status.className='sp-status ok';EcoCache.clear();const i=data.clients.findIndex(c=>c.id===saved.id);if(i>=0)data.clients[i]={...data.clients[i],...saved}}
    catch(error){status.textContent=error.message;status.className='sp-status warn'}
  }
  function onClick(e){
    const b=e.target.closest('button,[data-client]');if(!b)return;
    if(b.dataset.salesView){view=b.dataset.salesView;remember('hc-sales-view',view);renderMain();return}
    if(b.dataset.quick){quick=b.dataset.quick;renderMain();return}
    if(b.dataset.clientOpen){select(b.dataset.clientOpen);$('#sales-profile').scrollIntoView({block:'nearest',behavior:'smooth'});return}
    if(b.dataset.client){select(b.dataset.client);return}
    if(b.hasAttribute('data-add-field')){const form=$('#sales-form'),i=$$('[data-cf-label]',form).length;b.insertAdjacentHTML('beforebegin',`<div class="sp-cf"><input data-cf-label="${i}" maxlength="60" placeholder="Ex.: Animais" aria-label="Nome do campo"><input data-cf-value="${i}" maxlength="240" placeholder="Ex.: 2 gatos" aria-label="Valor"></div>`);$(`[data-cf-label="${i}"]`,form).focus();return}
    if(b.hasAttribute('data-copy-phone')){navigator.clipboard?.writeText(detail?.phone||'').then(()=>notify('Telefone copiado.'),()=>notify(detail?.phone||''));return}
    if(b.dataset.openQuote){root.EcoWorkspace?.openDetail(b.dataset.openQuote).catch(err=>notify(err.message))}
  }
  addEventListener('eco:data-changed',()=>{if(!$('#sales-view')?.hidden)load()});
  root.EcoSales={open:()=>{if(!$('#sales-main'))shell();load()}};
})(globalThis);
