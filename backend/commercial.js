import crypto from 'node:crypto';
import {fail} from './database.js';
import {date,localDate,text} from './dre-domain.js';
import {placeOf} from './address.js';

// Clientes, funis de follow-up/pós-venda, painel comercial e distribuição de lucros.
const now=()=>new Date().toISOString();
const read=row=>JSON.parse(row.data);
const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const phoneOf=v=>{const d=String(v||'').replace(/\D/g,'');return d.length>=10&&d.length<=13?d.replace(/^55(?=\d{10,11}$)/,''):''};
const emailOf=v=>{const m=String(v||'').match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/);return m?m[0].toLowerCase():''};
// Chaves vindas da requisição nunca podem cair em propriedades do protótipo ('constructor', '__proto__'...).
const has=(map,key)=>typeof key==='string'&&Object.hasOwn(map,key);
const itemCents=i=>Math.round(Math.round(Number(i.price)*100)*Number(i.quantity))||0;
const total=rows=>rows.reduce((s,r)=>s+r.pix,0);
const day=v=>{if(!v)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const t=Date.parse(v);return Number.isFinite(t)?localDate(t):null};
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const between=(day,from,to)=>!!day&&day>=from&&day<=to;
const spanDays=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
const TAG_ID=/^[a-z0-9-]{1,40}$/;
// Linhas leves dos orçamentos: só os campos usados pelo painel e pelos clientes, sem fotos nem logo.
const QUOTES=`SELECT p.id,json_extract(p.snapshot,'$.number') number,json_extract(p.snapshot,'$.date') date,json_extract(p.snapshot,'$.client') client,json_extract(p.snapshot,'$.origin') origin,json_extract(p.snapshot,'$.tags') tags,
  json_extract(p.snapshot,'$.address') address,json_extract(p.snapshot,'$.addressNeighborhood') addressNeighborhood,json_extract(p.snapshot,'$.addressCity') addressCity,json_extract(p.snapshot,'$.addressState') addressState,
  (SELECT json_group_array(json_object('service',json_extract(i.value,'$.service'),'unit',json_extract(i.value,'$.unit'),'quantity',json_extract(i.value,'$.quantity'),'price',json_extract(i.value,'$.price')) ORDER BY i.key) FROM json_each(p.snapshot,'$.items') i) items,
  o.data op,l.client_id clientId FROM proposals p LEFT JOIN operations o ON o.id=p.id LEFT JOIN client_links l ON l.proposal_id=p.id WHERE p.archived_at IS NULL`;

export const ORIGINS={meta:'Meta Ads',google:'Google Ads',indicacao:'Indicação',organico:'Orgânico',cliente:'Cliente antigo'};
export const CHANNEL_PROVIDER={meta:'meta-ads',google:'google-ads'};
export const DEFAULT_TAGS=[{id:'corporativo',label:'CORPORATIVO'},{id:'residencial',label:'RESIDENCIAL'}];
export const FUNNELS={
  follow:[{id:'f1',label:'1º contato',days:2},{id:'f2',label:'2º contato',days:7},{id:'f3',label:'Última tentativa',days:15},{id:'lost',label:'Perdidos',days:null}],
  pos:[{id:'p1',label:'Agradecimento',days:1},{id:'p2',label:'Avaliação solicitada',days:3},{id:'p3',label:'Indicação / recompra',days:null},{id:'p4',label:'Reabordagem',days:180}]
};

// Custo por orçamento, por fechamento, ROAS e ROI recalculados a cada consulta.
// ROAS/ROI usam a receita das origens pagas (paidRevenueCents); roasTotal/roiTotal usam toda a receita.
export function campaignMetrics({spendCents=0,quotes=0,closed=0,revenueCents=0,paidRevenueCents=revenueCents}){
  const spend=Number(spendCents)||0;
  return {spendCents:spend,quotes,closed,revenueCents,paidRevenueCents,
    costPerQuoteCents:spend&&quotes?Math.round(spend/quotes):null,
    costPerCloseCents:spend&&closed?Math.round(spend/closed):null,
    roas:spend?paidRevenueCents/spend:null,
    roi:spend?(paidRevenueCents-spend)/spend:null,
    roasTotal:spend?revenueCents/spend:null,
    roiTotal:spend?(revenueCents-spend)/spend:null};
}

export function birthday(value){
  if(value==null||value==='')return '';
  const s=String(value).trim();let m=s.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?$/),day,month;
  if(m){day=+m[1];month=+m[2]}else if((m=s.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/))){month=+m[1];day=+m[2]}else throw fail(400,'Informe o aniversário como DD/MM.');
  const max=[31,29,31,30,31,30,31,31,30,31,30,31][month-1];if(!max||day<1||day>max)throw fail(400,'Aniversário inválido.');
  return String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
const quoteBirthday=v=>{try{return birthday(v)}catch{return ''}};

export class CommercialService{
  constructor(repo,{dre,finance}={}){
    this.repo=repo;this.dre=dre;this.finance=finance;
    repo.db.exec(`CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS client_links (proposal_id TEXT PRIMARY KEY,client_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS client_links_client ON client_links(client_id);
      CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY,data TEXT NOT NULL,position INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS profit_distributions (id TEXT PRIMARY KEY,period_from TEXT NOT NULL,period_to TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);`);
    this.seedPartners();
  }
  quotes(where='',...params){
    return this.repo.db.prepare(QUOTES+where).all(...params).map(r=>{
      const items=JSON.parse(r.items),op=r.op?JSON.parse(r.op):{id:r.id,status:'generated',schedule:null};
      return {id:r.id,number:r.number||'',date:r.date||'',client:r.client||'',origin:r.origin||'',tags:r.tags?JSON.parse(r.tags):[],address:r.address||'',addressNeighborhood:r.addressNeighborhood||'',addressCity:r.addressCity||'',addressState:r.addressState||'',
        items,op,clientId:r.clientId,pix:items.reduce((s,i)=>s+itemCents(i),0),start:day(op.schedule?.start),completedAt:op.status==='completed'?day(op.serviceCompletedAt||op.schedule?.end):null};
    });
  }

  /* ---------- Tags ---------- */
  tags(){return this.repo.config('quote-tags')||DEFAULT_TAGS}
  saveTags(raw){
    if(!Array.isArray(raw)||raw.length>30)throw fail(400,'Envie até 30 tags.');
    const seen=new Set(),list=raw.map(t=>{
      if(!t||typeof t!=='object')throw fail(400,'Tag inválida.');
      const label=text(t.label,24).toUpperCase();if(!label)throw fail(400,'Tag sem nome.');
      const given=text(t.id,60);if(given&&!TAG_ID.test(given))throw fail(400,'Identificador de tag inválido: use letras minúsculas, números e hífen (até 40 caracteres).');
      const id=given||norm(label).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||crypto.randomUUID().slice(0,8);
      if(seen.has(id))throw fail(400,'Tag repetida.');seen.add(id);return {id,label};
    });
    this.repo.setConfig('quote-tags',list);return list;
  }
  // Tags novas precisam estar cadastradas; as que o registro já tinha continuam válidas mesmo se a tag saiu da lista.
  checkTags(tags,previous=[]){
    if(tags==null)return [];if(!Array.isArray(tags))throw fail(400,'Tags inválidas.');
    const known=new Set(this.tags().map(t=>t.id)),kept=new Set(Array.isArray(previous)?previous:[]);
    for(const t of tags){if(kept.has(t))continue;if(typeof t!=='string'||!TAG_ID.test(t))throw fail(400,'Tag inválida.');if(!known.has(t))throw fail(400,`A tag "${t}" não está cadastrada.`)}
    return [...new Set(tags)];
  }

  /* ---------- Clientes ---------- */
  clientRows(){return this.repo.db.prepare('SELECT * FROM clients ORDER BY updated_at DESC').all().map(r=>({...read(r),id:r.id,createdAt:r.created_at,updatedAt:r.updated_at}))}
  client(id){const r=this.repo.db.prepare('SELECT * FROM clients WHERE id=?').get(id);return r?{...read(r),id:r.id,createdAt:r.created_at,updatedAt:r.updated_at}:null}
  writeClient(id,data,created){const t=now();this.repo.db.prepare('INSERT INTO clients VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(id,JSON.stringify(data),created||t,t);return this.client(id)}
  // Só telefone ou e-mail identificam o mesmo cliente; nome igual é apenas sugestão.
  match(q){
    const phone=phoneOf(q.clientContact),email=emailOf(q.clientEmail)||emailOf(q.clientContact),rows=this.clientRows();
    return (phone&&rows.find(c=>phoneOf(c.phone)===phone))||(email&&rows.find(c=>c.email&&c.email.toLowerCase()===email))||null;
  }
  sameName(name,exceptId){const key=norm(name);return key?this.clientRows().filter(c=>c.id!==exceptId&&norm(c.name)===key).map(c=>({id:c.id,name:c.name})):[]}
  // O orçamento só preenche campos vazios: o que foi editado no cadastro do cliente prevalece.
  clientFromQuote(q,base={}){
    const phone=base.phone||(phoneOf(q.clientContact)?q.clientContact:''),email=base.email||emailOf(q.clientEmail)||emailOf(q.clientContact);
    const tags=[...new Set([...(base.tags||[]),...(Array.isArray(q.tags)?q.tags:[])])].slice(0,10);
    return {name:base.name||q.client.trim(),phone,email,contactName:base.contactName||'',address:base.address||q.address||'',city:base.city||placeOf(q).city,neighborhood:base.neighborhood||q.addressNeighborhood||'',
      birthday:base.birthday||quoteBirthday(q.clientBirthday),notes:base.notes||'',custom:base.custom||[],tags,origin:base.origin||q.origin||'',...(base.avatar?{avatar:base.avatar}:{})};
  }
  // Cada orçamento salvo cria ou atualiza o cadastro do cliente.
  sync(q){
    if(!q?.id||!String(q.client||'').trim())return null;
    const link=this.repo.db.prepare('SELECT client_id FROM client_links WHERE proposal_id=?').get(q.id);
    let current=link?this.client(link.client_id):null;if(!current)current=this.match(q);
    const id=current?.id||crypto.randomUUID(),data=this.clientFromQuote(q,current||{});
    if(current&&JSON.stringify({...current,id:undefined,createdAt:undefined,updatedAt:undefined})===JSON.stringify(data)&&link)return current;
    this.repo.transaction(()=>{this.writeClient(id,data,current?.createdAt);this.repo.db.prepare('INSERT INTO client_links VALUES (?,?) ON CONFLICT(proposal_id) DO UPDATE SET client_id=excluded.client_id').run(q.id,id)});
    const saved=this.client(id),suggestion=current?null:this.sameName(saved.name,id)[0];
    return suggestion?{...saved,suggestion}:saved;
  }
  // Uma falha no cadastro do cliente nunca impede salvar o orçamento, mas fica registrada no log.
  // Edição em massa pelo kanban: só origem e tags, que não entram no PDF (sem nova versão do documento).
  bulkUpdate(raw,isLocked=()=>false){
    const ids=raw?.ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9._-]{1,140}$/.test(id)))throw fail(400,'Selecione de 1 a 500 orçamentos.');
    const setOrigin=Object.hasOwn(raw,'origin');if(setOrigin&&raw.origin!==''&&!has(ORIGINS,raw.origin))throw fail(400,'Origem inválida.');
    const list=v=>{if(v==null)return [];if(!Array.isArray(v)||v.length>10||v.some(t=>typeof t!=='string'||!TAG_ID.test(t)))throw fail(400,'Tags inválidas.');return [...new Set(v)]};
    const add=this.checkTags(list(raw.addTags)),remove=list(raw.removeTags);
    if(!setOrigin&&!add.length&&!remove.length)throw fail(400,'Escolha o que alterar.');
    let updated=0,skipped=0;
    for(const id of new Set(ids)){
      const q=this.repo.proposal(id);if(!q||isLocked(id)){skipped++;continue}
      const before=q.tags||[],tags=[...new Set([...before.filter(t=>!remove.includes(t)),...add])].slice(0,6),origin=setOrigin?raw.origin:q.origin||'';
      if(origin===(q.origin||'')&&JSON.stringify(tags)===JSON.stringify(before))continue;
      const saved=this.repo.saveProposal({...q,origin,tags});this.safeSync(saved);
      // A origem escolhida em massa também vale para o cadastro do cliente ligado ao orçamento.
      if(setOrigin){const link=this.repo.db.prepare('SELECT client_id FROM client_links WHERE proposal_id=?').get(id),c=link&&this.client(link.client_id);if(c&&c.origin!==origin)this.writeClient(c.id,{...this.clientInput({},c),origin},c.createdAt)}
      updated++;
    }
    return {updated,skipped};
  }
  safeSync(q){try{return this.sync(q)}catch(error){console.error('Falha ao sincronizar o cliente do orçamento',q?.id,error);return null}}
  // Incremental: só orçamentos ainda sem vínculo. Roda depois que o servidor começa a atender.
  syncAll(){for(const {id} of this.repo.db.prepare('SELECT p.id FROM proposals p WHERE p.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM client_links l WHERE l.proposal_id=p.id)').all())this.safeSync(this.repo.proposal(id))}
  unlink(proposalId){this.repo.db.prepare('DELETE FROM client_links WHERE proposal_id=?').run(proposalId)}
  customFields(raw,old=[]){
    if(raw==null)return old;
    if(!Array.isArray(raw)||raw.length>20)throw fail(400,'Envie até 20 campos personalizados.');
    const seen=new Set(),list=[];
    for(const c of raw){
      if(!c||typeof c!=='object'||typeof c.label!=='string'||(c.value!=null&&typeof c.value!=='string'))throw fail(400,'Campos personalizados aceitam apenas texto.');
      const label=c.label.trim(),value=(c.value||'').trim(),key=norm(label);
      if(label.length>60)throw fail(400,'O nome do campo personalizado deve ter até 60 caracteres.');
      if(value.length>500)throw fail(400,'O valor do campo personalizado deve ter até 500 caracteres.');
      if(!label||seen.has(key))continue;seen.add(key);list.push({label,value});
    }
    return list;
  }
  clientInput(raw,old={}){
    if(!raw||typeof raw!=='object')throw fail(400,'Dados do cliente inválidos.');
    const name=text(raw.name??old.name,240);if(!name)throw fail(400,'Informe o nome do cliente.');
    const tags=Array.isArray(raw.tags)?this.checkTags(raw.tags,old.tags).slice(0,10):old.tags||[];
    const email=text(raw.email??old.email,240);if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw fail(400,'E-mail inválido.');
    const origin=raw.origin??old.origin??'';if(origin&&!has(ORIGINS,origin))throw fail(400,'Origem inválida.');
    return {name,phone:text(raw.phone??old.phone,60),email,contactName:text(raw.contactName??old.contactName,240),address:text(raw.address??old.address,800),city:text(raw.city??old.city,160),neighborhood:text(raw.neighborhood??old.neighborhood,160),birthday:birthday(raw.birthday??old.birthday),notes:text(raw.notes??old.notes,3000),custom:this.customFields(raw.custom,old.custom),tags,origin,...(old.avatar?{avatar:old.avatar}:{})};
  }
  createClient(raw){const id=crypto.randomUUID();return this.writeClient(id,this.clientInput(raw))}
  updateClient(id,raw){const old=this.client(id);if(!old)throw fail(404,'Cliente não encontrado.');return this.writeClient(id,this.clientInput(raw,old),old.createdAt)}
  history(list){return list.map(x=>({id:x.id,number:x.number,date:x.date,status:x.op.status,serviceDate:x.op.status==='completed'?x.completedAt:x.start,pixCents:x.pix,services:x.items.map(i=>i.service)})).sort((a,b)=>b.date.localeCompare(a.date))}
  // Último serviço = atendimento concluído; próximo = agendamento a partir de hoje.
  summary(c,list){
    const today=localDate(),done=list.filter(x=>x.completedAt),dates=list.map(x=>x.date).filter(Boolean).sort();
    const lastServiceDate=done.map(x=>x.completedAt).sort().at(-1)||null,nextServiceDate=list.filter(x=>x.op.status==='scheduled'&&x.start>=today).map(x=>x.start).sort()[0]||null;
    return {...c,proposalIds:this.history(list).map(x=>x.id),quoteCount:list.length,closedCount:done.length,closedCents:total(done),
      lastServiceDate,nextServiceDate,lastService:lastServiceDate?{date:lastServiceDate,status:'completed'}:null,nextService:nextServiceDate?{date:nextServiceDate,status:'scheduled'}:null,firstDate:dates[0]||null};
  }
  clients(){
    const groups=new Map();for(const q of this.quotes(' AND l.client_id IS NOT NULL')){if(!groups.has(q.clientId))groups.set(q.clientId,[]);groups.get(q.clientId).push(q)}
    return this.clientRows().map(c=>this.summary(c,groups.get(c.id)||[]));
  }
  clientDetail(id){const c=this.client(id);if(!c)throw fail(404,'Cliente não encontrado.');const list=this.quotes(' AND l.client_id=?',id);return {...this.summary(c,list),history:this.history(list),possibleDuplicates:this.sameName(c.name,id)}}
  clientOf(proposalId){const r=this.repo.db.prepare('SELECT client_id FROM client_links WHERE proposal_id=?').get(proposalId);return r?this.client(r.client_id):null}

  /* ---------- Funis de follow-up e pós-venda ---------- */
  setStage(id,raw){
    this.repo.requireProposal(id);const op=this.repo.operation(id),funnel=raw?.funnel,stage=raw?.stage;
    if(!has(FUNNELS,funnel)||!FUNNELS[funnel].some(s=>s.id===stage))throw fail(400,'Etapa inválida.');
    if(funnel==='follow'&&op.status!=='generated')throw fail(409,'O follow-up vale para orçamentos ainda não agendados.');
    if(funnel==='pos'&&op.status!=='completed')throw fail(409,'O pós-venda começa depois do atendimento concluído.');
    const note=text(raw.note,500);if(stage==='lost'&&!note)throw fail(400,'Informe o motivo da perda.');
    const crm={...(op.crm||{}),[funnel]:{stage,note,updatedAt:now()}};
    return this.repo.setOperation({...op,crm});
  }

  /* ---------- Painel comercial ---------- */
  // Gasto em mídia por provedor, somado direto da coluna spend_cents (só BRL).
  spendTotals(from,to){
    if(!this.repo.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ad_spend_daily'").get())return {};
    return Object.fromEntries(this.repo.db.prepare("SELECT provider,SUM(spend_cents) cents FROM ad_spend_daily WHERE day>=? AND day<=? AND currency='BRL' GROUP BY provider").all(from,to).map(r=>[r.provider,Number(r.cents)]));
  }
  spendFor(totals,channel){return channel==='all'?Object.values(totals).reduce((a,b)=>a+b,0):totals[CHANNEL_PROVIDER[channel]]||0}
  // Funil por coorte: orçamentos criados no período e o estágio que cada um alcançou (conversão nunca passa de 100%).
  // Receita concluída (revenueCents/closed) segue a data de conclusão: visão financeira do período.
  period(rows,from,to,spend,channel){
    const cohort=rows.filter(r=>between(r.date,from,to)),done=rows.filter(r=>between(r.completedAt,from,to));
    const completed=cohort.filter(r=>r.op.status==='completed'),reached=cohort.filter(r=>['scheduled','completed'].includes(r.op.status)).length;
    const revenue=total(done),paidRevenue=channel==='all'?total(done.filter(r=>has(CHANNEL_PROVIDER,r.origin))):revenue;
    return {generated:cohort.length,reachedSchedule:reached,scheduled:reached,completed:completed.length,completedFromCreated:completed.length,cancelled:cohort.filter(r=>r.op.status==='cancelled').length,
      conversion:cohort.length?completed.length/cohort.length:null,cohortRevenueCents:total(completed),
      closed:done.length,revenueCents:revenue,ticketCents:done.length?Math.round(revenue/done.length):null,
      campaign:campaignMetrics({spendCents:spend,quotes:cohort.length,closed:done.length,revenueCents:revenue,paidRevenueCents:paidRevenue})};
  }
  dashboard({from,to,channel='all'}={}){
    from=date(from,false);to=date(to,false);if(from>to)throw fail(400,'A data inicial deve ser anterior à final.');
    if(spanDays(from,to)>731)throw fail(400,'Escolha um período de até 2 anos.');
    if(channel!=='all'&&!has(CHANNEL_PROVIDER,channel))throw fail(400,'Canal inválido.');
    const days=spanDays(from,to),prevTo=addDays(from,-1),prevFrom=addDays(from,-days);
    const all=this.quotes(),rows=channel==='all'?all:all.filter(r=>r.origin===channel),spendNow=this.spendTotals(from,to),spendPrev=this.spendTotals(prevFrom,prevTo);
    const current=this.period(rows,from,to,this.spendFor(spendNow,channel),channel),previous=this.period(rows,prevFrom,prevTo,this.spendFor(spendPrev,channel),channel);
    const byDay=new Map();for(const r of rows)if(r.completedAt)byDay.set(r.completedAt,(byDay.get(r.completedAt)||0)+r.pix);
    const series=f=>{let acc=0;return Array.from({length:days},(_,i)=>acc+=byDay.get(addDays(f,i))||0)};
    const services=new Map();for(const r of rows)if(between(r.completedAt,from,to))for(const it of r.items){const s=services.get(it.service)||{service:it.service,revenueCents:0,count:0};s.revenueCents+=itemCents(it);s.count+=1;services.set(it.service,s)}
    const today=localDate(),week=addDays(today,7),scheduled=rows.filter(r=>r.op.status==='scheduled'&&r.start>=today);
    const upcoming=scheduled.filter(r=>r.start<=week).sort((a,b)=>a.op.schedule.start.localeCompare(b.op.schedule.start)).slice(0,8)
      .map(r=>({id:r.id,client:r.client,start:r.op.schedule.start,end:r.op.schedule.end,services:r.items.map(i=>`${i.service}${i.quantity>1||i.unit==='m²'?' ('+Number(i.quantity).toLocaleString('pt-BR')+(i.unit==='m²'?' m²':'')+')':''}`),place:r.addressNeighborhood||placeOf(r).city,pixCents:r.pix,tags:r.tags}));
    // A receber: agendados a partir de hoje, independentemente de quando o orçamento foi criado.
    const toReceiveCents=total(scheduled);
    const channels=[...Object.keys(ORIGINS),''].map(origin=>{const paid=has(CHANNEL_PROVIDER,origin),p=this.period(all.filter(r=>r.origin===origin),from,to,paid?this.spendFor(spendNow,origin):0,origin);return {origin,label:has(ORIGINS,origin)?ORIGINS[origin]:'Sem origem',paid,...p.campaign}}).filter(c=>c.paid||c.quotes||c.closed);
    return {from,to,channel,previous:{from:prevFrom,to:prevTo,...previous},current,
      series:{current:series(from),previous:series(prevFrom)},
      services:[...services.values()].sort((a,b)=>b.revenueCents-a.revenueCents),
      upcoming,toReceiveCents,forecastCents:toReceiveCents,spend:{totalCents:this.spendFor(spendNow,'all'),providers:spendNow,connected:this.connectedProviders()},channels};
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
    const names=new Set(),ids=new Set();
    const list=raw.map((p,i)=>{
      if(!p||typeof p!=='object'||Array.isArray(p))throw fail(400,`Sócio ${i+1} inválido: preencha nome e participação.`);
      const name=text(p.name,160);if(!name)throw fail(400,'Informe o nome do sócio.');
      const shareBps=Math.round(Number(p.shareBps));if(!Number.isInteger(shareBps)||shareBps<0||shareBps>10000)throw fail(400,'Participação inválida.');
      const id=validPartnerId(p.id)||crypto.randomUUID();if(names.has(norm(name))||ids.has(id))throw fail(400,`Sócio repetido: ${name}. Cada sócio deve aparecer uma única vez.`);names.add(norm(name));ids.add(id);
      return {id,name,shareBps,active:p.active!==false};
    });
    const total=list.filter(p=>p.active).reduce((s,p)=>s+p.shareBps,0);if(list.some(p=>p.active)&&total!==10000)throw fail(400,'As participações dos sócios ativos precisam somar 100%.');
    this.repo.transaction(()=>{this.repo.db.prepare('DELETE FROM partners').run();list.forEach((p,i)=>this.repo.db.prepare('INSERT INTO partners VALUES (?,?,?)').run(p.id,JSON.stringify({name:p.name,shareBps:p.shareBps,active:p.active}),i))});
    return this.partners();
  }
  distributionSettings(){return {reserveBps:1000,...(this.repo.config('distribution-settings')||{})}}
  saveDistributionSettings(raw){const reserveBps=Math.round(Number(raw?.reserveBps));if(!Number.isInteger(reserveBps)||reserveBps<0||reserveBps>5000)throw fail(400,'Reserva inválida: use de 0% a 50%.');const value={reserveBps};this.repo.setConfig('distribution-settings',value);return value}
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
    const data=read(row);if(data.status==='paid')return this.distributions().find(x=>x.id===id);
    data.status='paid';data.paidAt=date(raw?.paidAt||localDate(),false);
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
