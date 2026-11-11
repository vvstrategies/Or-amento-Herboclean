(function(root){
  'use strict';
  // Tráfego pago (item 11): saiu do Financeiro e virou entrada própria no menu.
  // Visão "Indicadores" (A): KPIs + tabela de campanhas + custo por tag. Visão "Canais" (B): Meta, Google e
  // orgânico lado a lado, com receita × investido. Receita atribuída = orçamentos com origem Meta/Google, não cliques.
  const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>[...p.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(c,d=2)=>c==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:d,maximumFractionDigits:d}).format(c/100);
  const int=v=>v==null?'—':Number(v).toLocaleString('pt-BR');
  const num=(v,d=2)=>v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>v==null?'—':(v>=0?'+':'−')+Math.abs(v*100).toLocaleString('pt-BR',{maximumFractionDigits:0})+'%';
  const remember=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
  const PROVIDER={meta:'meta-ads',google:'google-ads'},LABEL={'meta-ads':'Meta Ads','google-ads':'Google Ads'};
  let view=remember('hc-traffic-view')||'kpis',tagMode='summary',sort={key:'spendCents',dir:-1},data=null,serial=0;
  const notify=m=>root.EcoStudio?.notify(m);
  const platform=()=>{const o=EcoFilters.get('traffic').origin;return PROVIDER[o]?o:'all'};

  function shell(){
    const v=$('#traffic-view');
    v.innerHTML=`<h1 class="sr-only">Tráfego pago</h1><div class="page-heading page-heading-bar"><div class="fbar-slot" id="traffic-filters"></div><div class="seg view-switch" role="group" aria-label="Visão"><button type="button" data-traffic-view="kpis" aria-pressed="${view==='kpis'}">Indicadores</button><button type="button" data-traffic-view="channels" aria-pressed="${view==='channels'}">Canais</button></div></div><div id="traffic-body" class="traffic-body"></div>`;
    EcoFilters.mount($('#traffic-filters'),{scope:'traffic',dims:['origin','period'],onChange:()=>load()});
    v.addEventListener('click',onClick);v.addEventListener('change',onChange);
  }
  async function load(){
    if(!$('#traffic-body'))shell();
    if(!root.EcoAuth?.online){$('#traffic-body').innerHTML='<p class="hint">Abra pelo servidor para ver o tráfego pago.</p>';return}
    const id=++serial,f=EcoFilters.get('traffic'),p=platform();
    try{
      const [dash,marketing,tags]=await Promise.all([EcoAuth.api('/api/dashboard?'+new URLSearchParams({from:f.from,to:f.to,...(p!=='all'?{origin:p}:{})})),EcoAuth.api('/api/finance/marketing?'+new URLSearchParams({from:f.from,to:f.to})),EcoCache.get('/api/tags').catch(()=>[])]);
      if(id!==serial)return;data={dash,marketing,tags:tags||[]};render();
    }catch(error){if(id===serial)$('#traffic-body').innerHTML=`<p class="hint">Não foi possível carregar: ${esc(error.message)}</p>`}
  }
  const synced=()=>{const t=(data.marketing.campaigns||[]).map(c=>c.lastSyncedAt).filter(Boolean).sort().at(-1);if(!t)return 'Sem sincronização no período';const d=new Date(t),same=d.toDateString()===new Date().toDateString();return 'Sincronizado '+(same?'hoje':d.toLocaleDateString('pt-BR'))+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})};
  function campaigns(){
    const p=platform(),map=Object.fromEntries((data.dash.byTag?.campaigns||[]).map(c=>[c.provider+':'+c.campaignId,c.tag]));
    return (data.marketing.campaigns||[]).filter(c=>c.currency==='BRL'&&(p==='all'||c.provider===PROVIDER[p])).map(c=>{
      const conv=Array.isArray(c.platformConversions)?c.platformConversions.reduce((a,b)=>a+Number(b||0),0):null;
      return {...c,key:c.provider+':'+c.campaignId,tag:map[c.provider+':'+c.campaignId]||'',ctr:c.impressions?c.clicks/c.impressions:null,cpc:c.clicks?c.spendCents/c.clicks:null,conversions:c.provider==='google-ads'?conv:null};
    }).sort((a,b)=>((a[sort.key]??-1)>(b[sort.key]??-1)?1:(a[sort.key]??-1)<(b[sort.key]??-1)?-1:0)*sort.dir);
  }
  function render(){
    $$('[data-traffic-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.trafficView===view)));
    const body=$('#traffic-body');body.className='traffic-body '+view;
    const connected=data.dash.spend.connected.length>0,hasSpend=(data.marketing.spendCents||0)>0;
    if(!connected&&!hasSpend){body.innerHTML='<section class="hcard tr-empty"><h2>Conecte o Google Ads ou o Meta Ads</h2><p>O investimento, o ROAS e o custo por venda usam o gasto real das campanhas, importado das plataformas (somente leitura).</p><button type="button" class="primary" data-go="settings">Conectar contas</button></section>';body.innerHTML='<div class="tr-layout">'+body.innerHTML+tagCard()+'</div>';return}
    body.innerHTML=view==='channels'?channelsView():kpisView();
  }
  /* ---------- A · Indicadores ---------- */
  function kpisView(){
    const c=data.dash.current.campaign,p=platform(),label=p==='all'?'Meta + Google':p==='meta'?'Meta':'Google',closed=c.closed,quotes=c.quotes;
    const k=(l,v,s,hero)=>`<div class="sk${hero?' hero':''}"><small>${l}</small><strong>${v}</strong><span>${s}</span></div>`;
    const list=campaigns(),tot=list.reduce((a,x)=>({spend:a.spend+x.spendCents,imp:a.imp+(x.impressions||0),clk:a.clk+(x.clicks||0),conv:a.conv+(x.conversions||0)}),{spend:0,imp:0,clk:0,conv:0});
    const th=(key,l,cls='')=>`<th class="${cls}"><button type="button" data-sort="${key}" aria-label="Ordenar por ${l}">${l}${sort.key===key?(sort.dir<0?' ↓':' ↑'):''}</button></th>`;
    return `<div class="sales-kpis tr-kpis">${k('Investido · '+label,money(c.spendCents),synced(),true)+k('Receita atribuída',money(c.paidRevenueCents,0),`${closed} venda${closed===1?'':'s'} com origem ${label}`)+k('ROAS',c.roas==null?'—':num(c.roas)+'×','receita ÷ investido')+k('ROI',pct(c.roi),'(receita − investido) ÷ investido')+k('Custo por venda',money(c.costPerCloseCents),`investido ÷ ${closed} venda${closed===1?'':'s'}`)+k('Custo por orçamento',money(c.costPerQuoteCents),`investido ÷ ${quotes} orçamento${quotes===1?'':'s'}`)}</div>
      <div class="tr-layout"><section class="hcard tr-campaigns"><div class="ph"><div><h2>Campanhas · ${p==='all'?'todas as plataformas':label}</h2><p>Números das plataformas no período. Clique no título da coluna para ordenar.</p></div><span class="chip">Fonte: APIs do Meta e do Google Ads</span></div>
        <div class="tr-table-wrap"><table class="tr-table"><thead><tr>${th('campaignName','Campanha')}${th('spendCents','Gasto','num')}${th('impressions','Impressões','num')}${th('clicks','Cliques','num')}${th('ctr','CTR','num')}${th('cpc','CPC','num')}${th('conversions','Conv.*','num')}</tr></thead><tbody>
        ${list.length?list.map(x=>`<tr><td class="tr-name"><div class="tr-camp" title="${LABEL[x.provider]||x.provider}">${EcoIcons.brandIcon(x.provider,'sm')}<div><b title="${esc(x.campaignName)}">${esc(x.campaignName)}</b><small>${LABEL[x.provider]||''} · ${esc(x.campaignId)}</small></div></div></td><td class="num"><b>${money(x.spendCents)}</b></td><td class="num">${int(x.impressions)}</td><td class="num">${int(x.clicks)}</td><td class="num">${x.ctr==null?'—':num(x.ctr*100)+'%'}</td><td class="num">${money(x.cpc==null?null:Math.round(x.cpc))}</td><td class="num">${x.conversions==null?'—':num(x.conversions,0)}</td></tr>`).join(''):'<tr><td colspan="7" class="hint">Sem gasto de campanha no período.</td></tr>'}
        </tbody>${list.length?`<tfoot><tr><td>Total · ${list.length} campanha${list.length===1?'':'s'}</td><td class="num">${money(tot.spend)}</td><td class="num">${int(tot.imp)}</td><td class="num">${int(tot.clk)}</td><td class="num">${tot.imp?num(tot.clk/tot.imp*100)+'%':'—'}</td><td class="num">${tot.clk?money(Math.round(tot.spend/tot.clk)):'—'}</td><td class="num">${num(tot.conv,0)}</td></tr></tfoot>`:''}</table></div>
        <p class="tr-note">* Conversões contadas pelo Google Ads (o Meta não envia esse número). Não são vendas: vendas e receita vêm dos orçamentos do sistema, pela origem marcada em “Como chegou até nós”.</p></section>
        ${tagCard()}</div>`;
  }
  /* ---------- Custo por tag (nas duas visões) ---------- */
  function tagCard(){
    // Tag e origem já vêm do orçamento (marcadas ao gerar): o card só resume. Investimento e custo por venda
    // aparecem apenas se alguma campanha já tiver sido ligada a uma tag antes; sem isso, as colunas somem.
    const t=data.dash.byTag||{rows:[]},rows=t.rows.filter(r=>r.attributable||r.paidQuotes||r.paidClosed),inv=rows.some(r=>r.attributable);
    const sum=rows.reduce((a,r)=>({q:a.q+r.paidQuotes,v:a.v+r.paidClosed,rev:a.rev+r.revenueCents,inv:a.inv+(r.investmentCents||0)}),{q:0,v:0,rev:0,inv:0});
    const label=r=>r.tag?esc(r.label.charAt(0)+r.label.slice(1).toLowerCase()):'Sem tipo';
    const cols=inv?6:4;
    const body=`<div class="tr-table-wrap"><table class="tr-table compact"><thead><tr><th>Tipo</th><th class="num" title="Orçamentos com origem Meta/Google">Orç.</th><th class="num">Vendas</th><th class="num">Receita</th>${inv?'<th class="num">Invest.</th><th class="num" title="Custo por venda">C./venda</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td><b>${label(r)}</b></td><td class="num">${r.paidQuotes}</td><td class="num">${r.paidClosed}</td><td class="num">${money(r.revenueCents,0)}</td>${inv?`<td class="num">${r.attributable?money(r.investmentCents,0):'—'}</td><td class="num">${money(r.costPerCloseCents)}</td>`:''}</tr>`).join('')||`<tr><td colspan="${cols}" class="hint">Nenhum orçamento de Meta ou Google no período.</td></tr>`}</tbody>${rows.length?`<tfoot><tr><td>Total</td><td class="num">${sum.q}</td><td class="num">${sum.v}</td><td class="num">${money(sum.rev,0)}</td>${inv?`<td class="num">${money(sum.inv,0)}</td><td class="num">${sum.v&&sum.inv?money(Math.round(sum.inv/sum.v)):'—'}</td>`:''}</tr></tfoot>`:''}</table></div>`;
    return `<section class="hcard tr-tags"><div class="ph"><div><h2>Por tipo de cliente</h2><p>Orçamentos e vendas de Meta e Google, pelo tipo marcado no orçamento</p></div></div>${body}
      <p class="tr-note">Orçamento sem tipo próprio usa o tipo da ficha do cliente. “Sem tipo” são os que não têm tipo nem no orçamento nem na ficha.</p></section>`;
  }
  /* ---------- B · Canais ---------- */
  function channelsView(){
    const ch=data.dash.channels||[],by=o=>ch.find(x=>x.origin===o)||{spendCents:0,closed:0,revenueCents:0,paidRevenueCents:0,roas:null,roi:null,costPerCloseCents:null};
    const organic=ch.filter(x=>!x.paid).reduce((a,x)=>({closed:a.closed+x.closed,revenueCents:a.revenueCents+x.revenueCents}),{closed:0,revenueCents:0});
    const paidCard=(id,label)=>{const x=by(id),low=x.roas!=null&&x.roas<1;return `<section class="hcard tr-ch tr-ch-${id}"><div class="tr-ch-h"><span class="so">${EcoIcons.brandIcon(id,'sm')}<b>${label}</b></span><span class="tp-pill ${x.roi==null?'':x.roi>=0?'up':'down'}">ROI ${pct(x.roi)}</span></div><p class="tr-roas${low?' low':''}">${x.roas==null?'—':num(x.roas)+'×'}<small>ROAS · receita ÷ investido</small></p><div class="tr-bars" aria-hidden="true">${bars(x.revenueCents,x.spendCents)}</div><dl><div><dt>Vendas</dt><dd>${x.closed}</dd></div><div><dt>Receita</dt><dd>${money(x.revenueCents,0)}</dd></div><div><dt>Investido</dt><dd>${money(x.spendCents,0)}</dd></div><div><dt>Custo/venda</dt><dd>${money(x.costPerCloseCents)}</dd></div></dl><button type="button" class="text-button" data-open-platform="${id}">Ver campanhas</button></section>`};
    const rows=[['Meta',by('meta')],['Google',by('google')],['Orgânico e indicação',{revenueCents:organic.revenueCents,spendCents:0}]],max=Math.max(1,...rows.map(([,x])=>Math.max(x.revenueCents||0,x.spendCents||0)));
    return `<div class="tr-channels">${paidCard('meta','Meta')}${paidCard('google','Google')}
      <section class="hcard tr-ch tr-ch-org"><div class="tr-ch-h"><span class="so"><span class="fb-oico fb-o-organico">${EcoIcons.optionIcon('organico')}</span><b>Orgânico e indicação</b></span><span class="chip">sem mídia</span></div><p class="tr-roas">${money(organic.revenueCents,0)}<small>receita · sem investimento em anúncio</small></p><div class="tr-bars" aria-hidden="true">${bars(organic.revenueCents,0)}</div><dl><div><dt>Vendas</dt><dd>${organic.closed}</dd></div><div><dt>Ticket médio</dt><dd>${organic.closed?money(Math.round(organic.revenueCents/organic.closed),0):'—'}</dd></div></dl></section></div>
      <div class="tr-layout"><section class="hcard tr-compare"><div class="ph"><div><h2>Receita × investido por canal</h2><p>Receita das vendas (sistema) e gasto das plataformas no período</p></div><div class="mc-legend"><span><i class="tr-i-rev"></i>Receita</span><span><i class="tr-i-inv"></i>Investido</span></div></div>
        <div class="tr-hbars">${rows.map(([l,x])=>`<div class="tr-hrow"><span>${l}</span><div><i class="tr-i-rev" style="--w:${((x.revenueCents||0)/max*100).toFixed(1)}%"></i><b>${money(x.revenueCents||0,0)}</b></div><div><i class="tr-i-inv" style="--w:${((x.spendCents||0)/max*100).toFixed(1)}%"></i><b>${money(x.spendCents||0,0)}</b></div></div>`).join('')}</div>
        <table class="sr-only"><caption>Receita e investido por canal</caption><tbody>${rows.map(([l,x])=>`<tr><th>${l}</th><td>${money(x.revenueCents||0)}</td><td>${money(x.spendCents||0)}</td></tr>`).join('')}</tbody></table></section>${tagCard()}</div>`;
  }
  const bars=(rev,inv)=>{const m=Math.max(1,rev||0,inv||0);return `<i class="tr-i-rev" style="--w:${((rev||0)/m*100).toFixed(1)}%"></i><i class="tr-i-inv" style="--w:${((inv||0)/m*100).toFixed(1)}%"></i>`};
  async function onChange(e){
    const s=e.target.closest('[data-campaign-tag]');if(!s)return;s.disabled=true;
    try{await EcoAuth.api('/api/finance/campaign-tags',{method:'PUT',body:JSON.stringify({[s.dataset.campaignTag]:s.value})});notify('Vínculo da campanha salvo.');await load()}catch(error){notify(error.message);s.disabled=false}
  }
  function onClick(e){
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.trafficView){view=b.dataset.trafficView;remember('hc-traffic-view',view);render();return}
    if(b.dataset.tagMode){tagMode=b.dataset.tagMode;render();return}
    if(b.dataset.sort){sort={key:b.dataset.sort,dir:sort.key===b.dataset.sort?-sort.dir:-1};render();return}
    if(b.dataset.openPlatform){view='kpis';remember('hc-traffic-view',view);$(`#traffic-filters [data-fb-origin="${b.dataset.openPlatform}"]`)?.click();return}
    if(b.dataset.go)root.EcoWorkspace?.navigate(b.dataset.go);
  }
  root.EcoTraffic={open:()=>{if(!$('#traffic-body'))shell();load()}};
})(globalThis);
