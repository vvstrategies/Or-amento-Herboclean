import crypto from 'node:crypto';
import {fail} from './database.js';
import {modelo} from '../utils/proposta.js';
import {date,localDate,text} from './dre-domain.js';

// Clientes, funis de follow-up/pós-venda, painel comercial e distribuição de lucros.
const now=()=>new Date().toISOString();
const read=row=>JSON.parse(row.data);
const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const phoneOf=v=>{const d=String(v||'').replace(/\D/g,'');return d.length>=10&&d.length<=13?d.replace(/^55(?=\d{10,11}$)/,''):''};
const emailOf=v=>{const m=String(v||'').match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/);return m?m[0].toLowerCase():''};
const pix=q=>{try{return modelo.totals(q).pix}catch{return 0}};
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const between=(day,from,to)=>!!day&&day>=from&&day<=to;
const spanDays=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;

export const ORIGINS={meta:'Meta Ads',google:'Google Ads',indicacao:'Indicação',organico:'Orgânico',cliente:'Cliente antigo'};
export const CHANNEL_PROVIDER={meta:'meta-ads',google:'google-ads'};
export const DEFAULT_TAGS=[{id:'corporativo',label:'CORPORATIVO'},{id:'residencial',label:'RESIDENCIAL'}];
export const FUNNELS={
  follow:[{id:'f1',label:'1º contato',days:2},{id:'f2',label:'2º contato',days:7},{id:'f3',label:'Última tentativa',days:15},{id:'lost',label:'Perdidos',days:null}],
  pos:[{id:'p1',label:'Agradecimento',days:1},{id:'p2',label:'Avaliação solicitada',days:3},{id:'p3',label:'Indicação / recompra',days:null},{id:'p4',label:'Reabordagem',days:180}]
};

// Custo por orçamento, por fechamento, ROAS e ROI recalculados a cada consulta.
export function campaignMetrics({spendCents=0,quotes=0,closed=0,revenueCents=0}){
  const spend=Number(spendCents)||0;
  return {spendCents:spend,quotes,closed,revenueCents,
    costPerQuoteCents:spend&&quotes?Math.round(spend/quotes):null,
    costPerCloseCents:spend&&closed?Math.round(spend/closed):null,
    roas:spend?revenueCents/spend:null,
    roi:spend?(revenueCents-spend)/spend:null};
}

export function birthday(value){
  if(value==null||value==='')return '';
  const s=String(value).trim();let m=s.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?$/),day,month;
  if(m){day=+m[1];month=+m[2]}else if((m=s.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/))){month=+m[1];day=+m[2]}else throw fail(400,'Informe o aniversário como DD/MM.');
  const max=[31,29,31,30,31,30,31,31,30,31,30,31][month-1];if(!max||day<1||day>max)throw fail(400,'Aniversário inválido.');
  return String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}

export class CommercialService{
  constructor(repo,{dre,finance}={}){
    this.repo=repo;this.dre=dre;this.finance=finance;
    repo.db.exec(`CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS client_links (proposal_id TEXT PRIMARY KEY,client_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS client_links_client ON client_links(client_id);
      CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY,data TEXT NOT NULL,position INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS profit_distributions (id TEXT PRIMARY KEY,period_from TEXT NOT NULL,period_to TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);`);
    this.seedPartners();this.syncAll();
  }

  /* ---------- Tags ---------- */
  tags(){return this.repo.config('quote-tags')||DEFAULT_TAGS}
  saveTags(raw){
    if(!Array.isArray(raw)||raw.length>30)throw fail(400,'Envie até 30 tags.');
    const seen=new Set(),list=raw.map(t=>{const label=text(t?.label,24).trim().toUpperCase();if(!label)throw fail(400,'Tag sem nome.');const id=(text(t?.id,40).trim()||norm(label).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))||crypto.randomUUID().slice(0,8);if(seen.has(id))throw fail(400,'Tag repetida.');seen.add(id);return {id,label}});
    this.repo.setConfig('quote-tags',list);return list;
  }

  /* ---------- Clientes ---------- */
  clientRows(){return this.repo.db.prepare('SELECT * FROM clients ORDER BY updated_at DESC').all().map(r=>({...read(r),id:r.id,createdAt:r.created_at,updatedAt:r.updated_at}))}
  client(id){const r=this.repo.db.prepare('SELECT * FROM clients WHERE id=?').get(id);return r?{...read(r),id:r.id,createdAt:r.created_at,updatedAt:r.updated_at}:null}
  writeClient(id,data,created){const t=now();this.repo.db.prepare('INSERT INTO clients VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(id,JSON.stringify(data),created||t,t);return this.client(id)}
  match(q){
    const phone=phoneOf(q.clientContact),email=emailOf(q.clientContact),name=norm(q.client),rows=this.clientRows();
    return (phone&&rows.find(c=>phoneOf(c.phone)===phone))||(email&&rows.find(c=>c.email&&c.email.toLowerCase()===email))||(name&&rows.find(c=>norm(c.name)===name))||null;
  }
  clientFromQuote(q,base={}){
    const phone=base.phone||(phoneOf(q.clientContact)?q.clientContact:''),email=base.email||emailOf(q.clientContact);
    const tags=[...new Set([...(base.tags||[]),...(Array.isArray(q.tags)?q.tags:[])])].slice(0,10);
    return {name:base.name||q.client.trim(),phone,email,contactName:base.contactName||'',address:base.address||q.address||'',city:base.city||q.addressCity||'',neighborhood:base.neighborhood||q.addressNeighborhood||'',
      birthday:base.birthday||(q.clientBirthday?birthday(q.clientBirthday):''),notes:base.notes||'',custom:base.custom||[],tags,origin:base.origin||q.origin||''};
  }
  // Cada orçamento salvo cria ou atualiza o cadastro do cliente.
  sync(q){
    if(!q?.id||!String(q.client||'').trim())return null;
    const link=this.repo.db.prepare('SELECT client_id FROM client_links WHERE proposal_id=?').get(q.id);
    let current=link?this.client(link.client_id):null;if(!current)current=this.match(q);
    const id=current?.id||crypto.randomUUID(),data=this.clientFromQuote(q,current||{});
    if(q.clientBirthday)data.birthday=birthday(q.clientBirthday);
    if(current&&JSON.stringify({...current,id:undefined,createdAt:undefined,updatedAt:undefined})===JSON.stringify({...data,id:undefined,createdAt:undefined,updatedAt:undefined})&&link)return current;
    this.repo.transaction(()=>{this.writeClient(id,data,current?.createdAt);this.repo.db.prepare('INSERT INTO client_links VALUES (?,?) ON CONFLICT(proposal_id) DO UPDATE SET client_id=excluded.client_id').run(q.id,id)});
    return this.client(id);
  }
  syncAll(){for(const q of this.repo.list()){try{this.sync(q)}catch{}}}
  unlink(proposalId){this.repo.db.prepare('DELETE FROM client_links WHERE proposal_id=?').run(proposalId)}
  clientInput(raw,old={}){
    const name=text(raw.name??old.name,240).trim();if(!name)throw fail(400,'Informe o nome do cliente.');
    const tags=Array.isArray(raw.tags)?raw.tags.map(t=>text(t,40)).filter(Boolean).slice(0,10):old.tags||[];
    const custom=Array.isArray(raw.custom)?raw.custom.slice(0,20).map(c=>({label:text(c?.label,60).trim(),value:text(c?.value,500).trim()})).filter(c=>c.label):old.custom||[];
    const email=text(raw.email??old.email,240).trim();if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw fail(400,'E-mail inválido.');
    const origin=raw.origin??old.origin??'';if(origin&&!ORIGINS[origin])throw fail(400,'Origem inválida.');
    return {name,phone:text(raw.phone??old.phone,60).trim(),email,contactName:text(raw.contactName??old.contactName,240).trim(),address:text(raw.address??old.address,800).trim(),city:text(raw.city??old.city,160).trim(),neighborhood:text(raw.neighborhood??old.neighborhood,160).trim(),birthday:birthday(raw.birthday??old.birthday),notes:text(raw.notes??old.notes,3000),custom,tags,origin};
  }
  createClient(raw){const id=crypto.randomUUID();return this.writeClient(id,this.clientInput(raw))}
  updateClient(id,raw){const old=this.client(id);if(!old)throw fail(404,'Cliente não encontrado.');return this.writeClient(id,this.clientInput(raw,old),old.createdAt)}
  history(clientId){
    const ids=this.repo.db.prepare('SELECT proposal_id FROM client_links WHERE client_id=?').all(clientId).map(r=>r.proposal_id);
    return ids.map(id=>this.repo.proposal(id)).filter(Boolean).map(q=>{const op=this.repo.operation(q.id);return {id:q.id,number:q.number,date:q.date,status:op.status,serviceDate:op.serviceCompletedAt||(op.schedule?localDate(op.schedule.start):null),pixCents:pix(q),services:q.items.map(i=>i.service)}}).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  }
  summary(c){
    const h=this.history(c.id),done=h.filter(x=>x.status==='completed');
    const last=[...h].filter(x=>x.serviceDate&&['completed','scheduled'].includes(x.status)).sort((a,b)=>b.serviceDate.localeCompare(a.serviceDate))[0];
    return {...c,proposalIds:h.map(x=>x.id),quoteCount:h.length,closedCount:done.length,closedCents:done.reduce((s,x)=>s+x.pixCents,0),lastService:last?{date:last.serviceDate,status:last.status}:null,firstDate:h.length?h[h.length-1].date:null};
  }
  clients(){return this.clientRows().map(c=>this.summary(c))}
  clientDetail(id){const c=this.client(id);if(!c)throw fail(404,'Cliente não encontrado.');return {...this.summary(c),history:this.history(id)}}
  clientOf(proposalId){const r=this.repo.db.prepare('SELECT client_id FROM client_links WHERE proposal_id=?').get(proposalId);return r?this.client(r.client_id):null}

  /* ---------- Funis de follow-up e pós-venda ---------- */
  setStage(id,raw){
    this.repo.requireProposal(id);const op=this.repo.operation(id),funnel=raw?.funnel,stage=raw?.stage;
    if(!FUNNELS[funnel]||!FUNNELS[funnel].some(s=>s.id===stage))throw fail(400,'Etapa inválida.');
    if(funnel==='follow'&&op.status!=='generated')throw fail(409,'O follow-up vale para orçamentos ainda não agendados.');
    if(funnel==='pos'&&op.status!=='completed')throw fail(409,'O pós-venda começa depois do atendimento concluído.');
    const note=text(raw.note,500);if(stage==='lost'&&!note)throw fail(400,'Informe o motivo da perda.');
    const crm={...(op.crm||{}),[funnel]:{stage,note,updatedAt:now()}};
    return this.repo.setOperation({...op,crm});
  }

  /* ---------- Painel comercial ---------- */
  spendRows(from,to){try{return this.repo.db.prepare('SELECT data FROM ad_spend_daily WHERE day>=? AND day<=?').all(from,to).map(read).filter(r=>r.currency==='BRL')}catch{return []}}
  dataset(channel){
    const ops=new Map(this.repo.listOperations().map(o=>[o.id,o]));
    return this.repo.list().filter(q=>channel==='all'||q.origin===channel).map(q=>{const op=ops.get(q.id)||{status:'generated'};return {q,op,pix:pix(q),completedAt:op.status==='completed'?op.serviceCompletedAt||(op.schedule?localDate(op.schedule.end):null):null}});
  }
  period(rows,from,to,spend){
    const created=rows.filter(r=>between(r.q.date,from,to)),done=rows.filter(r=>between(r.completedAt,from,to));
    const revenue=done.reduce((s,r)=>s+r.pix,0);
    return {generated:created.length,scheduled:created.filter(r=>['scheduled','completed'].includes(r.op.status)).length,completedFromCreated:created.filter(r=>r.op.status==='completed').length,cancelled:created.filter(r=>r.op.status==='cancelled').length,
      closed:done.length,revenueCents:revenue,ticketCents:done.length?Math.round(revenue/done.length):null,conversion:created.length?done.length/created.length:null,
      campaign:campaignMetrics({spendCents:spend,quotes:created.length,closed:done.length,revenueCents:revenue})};
  }
  spendFor(rows,channel){return rows.filter(r=>channel==='all'||r.provider===CHANNEL_PROVIDER[channel]).reduce((s,r)=>s+r.spendCents,0)}
  dashboard({from,to,channel='all'}={}){
    from=date(from,false);to=date(to,false);if(from>to)throw fail(400,'A data inicial deve ser anterior à final.');
    if(spanDays(from,to)>731)throw fail(400,'Escolha um período de até 2 anos.');
    if(channel!=='all'&&!CHANNEL_PROVIDER[channel])throw fail(400,'Canal inválido.');
    const days=spanDays(from,to),prevTo=addDays(from,-1),prevFrom=addDays(from,-days);
    const rows=this.dataset(channel),spendNow=this.spendRows(from,to),spendPrev=this.spendRows(prevFrom,prevTo);
    const current=this.period(rows,from,to,this.spendFor(spendNow,channel)),previous=this.period(rows,prevFrom,prevTo,this.spendFor(spendPrev,channel));
    const series=(f,n)=>{let acc=0;return Array.from({length:n},(_,i)=>{const d=addDays(f,i);acc+=rows.filter(r=>r.completedAt===d).reduce((s,r)=>s+r.pix,0);return acc})};
    const services=new Map();for(const r of rows.filter(r=>between(r.completedAt,from,to))){let t;try{t=modelo.totals(r.q)}catch{continue}r.q.items.forEach((it,i)=>{const s=services.get(it.service)||{service:it.service,revenueCents:0,count:0};s.revenueCents+=t.rows[i];s.count+=1;services.set(it.service,s)})}
    const today=localDate(),week=addDays(today,7);
    const upcoming=rows.filter(r=>r.op.status==='scheduled'&&r.op.schedule&&localDate(r.op.schedule.start)>=today&&localDate(r.op.schedule.start)<=week).sort((a,b)=>a.op.schedule.start.localeCompare(b.op.schedule.start)).slice(0,8)
      .map(r=>({id:r.q.id,client:r.q.client,start:r.op.schedule.start,end:r.op.schedule.end,services:r.q.items.map(i=>`${i.service}${i.quantity>1||i.unit==='m²'?' ('+Number(i.quantity).toLocaleString('pt-BR')+(i.unit==='m²'?' m²':'')+')':''}`),place:r.q.addressNeighborhood||r.q.addressCity||'',pixCents:r.pix,tags:r.q.tags||[]}));
    const forecastCents=rows.filter(r=>r.op.status==='scheduled').reduce((s,r)=>s+r.pix,0);
    const providers={};for(const r of spendNow)providers[r.provider]=(providers[r.provider]||0)+r.spendCents;
    const all=channel==='all'?rows:this.dataset('all'),channels=[...Object.keys(ORIGINS),''].map(origin=>{const sub=all.filter(r=>(r.q.origin||'')===origin),p=this.period(sub,from,to,CHANNEL_PROVIDER[origin]?this.spendFor(spendNow,origin):0);return {origin,label:ORIGINS[origin]||'Sem origem',paid:!!CHANNEL_PROVIDER[origin],...p.campaign}}).filter(c=>c.paid||c.quotes||c.closed);
    return {from,to,channel,previous:{from:prevFrom,to:prevTo,...previous},current,
      series:{current:series(from,days),previous:series(prevFrom,days)},
      services:[...services.values()].sort((a,b)=>b.revenueCents-a.revenueCents),
      upcoming,forecastCents,spend:{totalCents:Object.values(providers).reduce((a,b)=>a+b,0),providers,connected:this.connectedProviders()},channels};
  }
  connectedProviders(){try{return this.repo.db.prepare('SELECT provider FROM integration_connections').all().map(r=>r.provider)}catch{return []}}

  /* ---------- Sócios e distribuição de lucros ---------- */
  partners(){return this.repo.db.prepare('SELECT * FROM partners ORDER BY position').all().map(r=>({...read(r),id:r.id}))}
  seedPartners(){
    if(this.repo.config('partners-seeded'))return;
    const company=this.repo.config('settings')?.company?.name||'';
    if(/herboclean/i.test(company)&&!this.partners().length)this.savePartners([{name:'V&V Strategies',shareBps:5000},{name:'Mestres do Conforto',shareBps:5000}]);
    if(/herboclean/i.test(company))this.repo.setConfig('partners-seeded',true);
  }
  savePartners(raw){
    if(!Array.isArray(raw)||raw.length>20)throw fail(400,'Envie até 20 sócios.');
    const list=raw.map(p=>{const name=text(p?.name,160).trim();if(!name)throw fail(400,'Informe o nome do sócio.');const shareBps=Math.round(Number(p.shareBps));if(!Number.isInteger(shareBps)||shareBps<0||shareBps>10000)throw fail(400,'Participação inválida.');return {id:validPartnerId(p.id)||crypto.randomUUID(),name,shareBps,active:p.active!==false}});
    const total=list.filter(p=>p.active).reduce((s,p)=>s+p.shareBps,0);if(list.some(p=>p.active)&&total!==10000)throw fail(400,'As participações dos sócios ativos precisam somar 100%.');
    this.repo.transaction(()=>{this.repo.db.prepare('DELETE FROM partners').run();list.forEach((p,i)=>this.repo.db.prepare('INSERT INTO partners VALUES (?,?,?)').run(p.id,JSON.stringify({name:p.name,shareBps:p.shareBps,active:p.active}),i))});
    return this.partners();
  }
  distributionSettings(){return {reserveBps:1000,...(this.repo.config('distribution-settings')||{})}}
  saveDistributionSettings(raw){const reserveBps=Math.round(Number(raw?.reserveBps));if(!Number.isInteger(reserveBps)||reserveBps<0||reserveBps>9000)throw fail(400,'Reserva inválida.');const value={reserveBps};this.repo.setConfig('distribution-settings',value);return value}
  // Cascata: receita → impostos/taxas → custos diretos → despesas → lucro → reserva → distribuível.
  distribution(from,to){
    if(!this.dre)throw fail(500,'DRE indisponível.');
    const r=this.dre.report(from,to,'actual'),t=r.total,settings=this.distributionSettings();
    const costParts={material:0,travel:0,other:0,unknown:0};
    for(const s of r.services){const c=s.costSnapshot;if(!c){continue}costParts.material+=c.materialCost||0;costParts.travel+=c.travelCost||0;costParts.other+=c.otherDirectCosts||0}
    const known=costParts.material+costParts.travel+costParts.other;costParts.unknown=Math.max(0,(t.knownCost||0)-known);
    const opex=r.composition.map(c=>({id:c.id,label:c.name,amountCents:c.amountCents,source:c.id==='integration-marketing'?'Meta + Google Ads (integração)':'Despesas lançadas no Financeiro'}));
    const taxes=[{id:'tax',label:'Impostos sobre a receita',amountCents:t.taxCents,source:'Premissa tributária da DRE'},{id:'deductions',label:'Deduções e taxas',amountCents:t.otherDeductions,source:'Descontos, estornos e taxas lançados'}].filter(x=>x.amountCents);
    const direct=[{id:'material',label:'Materiais e produtos',amountCents:costParts.material,source:'Custos por atendimento'},{id:'travel',label:'Deslocamento',amountCents:costParts.travel,source:'Rotas calculadas por atendimento'},{id:'other',label:'Outros custos diretos',amountCents:costParts.other+costParts.unknown,source:'Custos adicionais por atendimento'}].filter(x=>x.amountCents);
    const profit=(t.net||0)-(t.knownCost||0)-(t.opex||0);
    const reserveCents=profit>0?Math.round(profit*settings.reserveBps/10000):0,distributable=Math.max(0,profit-reserveCents);
    const partners=this.partners().filter(p=>p.active);let allocated=0;
    const shares=partners.map((p,i)=>{const amount=i===partners.length-1?distributable-allocated:Math.round(distributable*p.shareBps/10000);allocated+=amount;return {...p,amountCents:amount}});
    return {from,to,grossCents:t.gross,serviceCount:t.serviceCount,taxes,direct,opex,netCents:t.net,directCents:t.knownCost||0,opexCents:t.opex||0,investmentCents:t.investment||0,profitCents:profit,
      missingCosts:t.missingCosts||0,reserveBps:settings.reserveBps,reserveCents,distributableCents:distributable,partners:shares,history:this.distributions()};
  }
  distributions(){return this.repo.db.prepare('SELECT * FROM profit_distributions ORDER BY period_from DESC,created_at DESC').all().map(r=>({...read(r),id:r.id,from:r.period_from,to:r.period_to,createdAt:r.created_at}))}
  recordDistribution(raw){
    const from=raw?.from,to=raw?.to;if(!/^\d{4}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}$/.test(to||'')||from>to)throw fail(400,'Período inválido.');
    if(this.repo.db.prepare('SELECT 1 FROM profit_distributions WHERE period_from=? AND period_to=?').get(from,to))throw fail(409,'Já existe uma distribuição registrada para este período.');
    const d=this.distribution(from,to);if(!d.distributableCents)throw fail(409,'Não há lucro disponível para distribuir neste período.');
    const id=crypto.randomUUID(),data={status:'pending',profitCents:d.profitCents,reserveBps:d.reserveBps,reserveCents:d.reserveCents,distributableCents:d.distributableCents,partners:d.partners.map(p=>({id:p.id,name:p.name,shareBps:p.shareBps,amountCents:p.amountCents})),paidAt:null};
    this.repo.db.prepare('INSERT INTO profit_distributions VALUES (?,?,?,?,?)').run(id,from,to,JSON.stringify(data),now());return this.distributions().find(x=>x.id===id);
  }
  markPaid(id,raw){
    const row=this.repo.db.prepare('SELECT * FROM profit_distributions WHERE id=?').get(id);if(!row)throw fail(404,'Distribuição não encontrada.');
    const data=read(row),paidAt=date(raw?.paidAt||localDate(),false);data.status='paid';data.paidAt=paidAt;
    this.repo.db.prepare('UPDATE profit_distributions SET data=? WHERE id=?').run(JSON.stringify(data),id);return this.distributions().find(x=>x.id===id);
  }
  deleteDistribution(id){const row=this.repo.db.prepare('SELECT * FROM profit_distributions WHERE id=?').get(id);if(!row)throw fail(404,'Distribuição não encontrada.');if(read(row).status==='paid')throw fail(409,'Distribuições pagas ficam no histórico.');this.repo.db.prepare('DELETE FROM profit_distributions WHERE id=?').run(id);return {deleted:true}}
}
const validPartnerId=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{8,60}$/.test(v)?v:null;

export function registerCommercial(app,commercial,wrap){
  app.get('/api/dashboard',(req,res)=>res.json(commercial.dashboard({from:req.query.from,to:req.query.to,channel:req.query.channel||'all'})));
  app.get('/api/tags',(req,res)=>res.json(commercial.tags()));
  app.put('/api/tags',(req,res)=>res.json(commercial.saveTags(req.body)));
  app.get('/api/crm/funnels',(req,res)=>res.json({funnels:FUNNELS,origins:ORIGINS}));
  app.post('/api/proposals/:id/crm',(req,res)=>res.json(commercial.setStage(req.params.id,req.body)));
  app.get('/api/clients',(req,res)=>res.json(commercial.clients()));
  app.post('/api/clients',(req,res)=>res.json(commercial.createClient(req.body)));
  app.get('/api/clients/:id',(req,res)=>res.json(commercial.clientDetail(req.params.id)));
  app.put('/api/clients/:id',(req,res)=>res.json(commercial.updateClient(req.params.id,req.body)));
  app.get('/api/partners',(req,res)=>res.json(commercial.partners()));
  app.put('/api/partners',(req,res)=>res.json(commercial.savePartners(req.body)));
  app.get('/api/finance/distribution',(req,res)=>res.json(commercial.distribution(req.query.from,req.query.to)));
  app.put('/api/finance/distribution/settings',(req,res)=>res.json(commercial.saveDistributionSettings(req.body)));
  app.post('/api/finance/distributions',(req,res)=>res.json(commercial.recordDistribution(req.body)));
  app.post('/api/finance/distributions/:id/paid',(req,res)=>res.json(commercial.markPaid(req.params.id,req.body)));
  app.delete('/api/finance/distributions/:id',(req,res)=>res.json(commercial.deleteDistribution(req.params.id)));
}
