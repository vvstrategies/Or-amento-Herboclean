import crypto from 'node:crypto';
import {fail,hash} from './database.js';
import {financialQuoteKey,quotedRevenue,integer} from './finance-domain.js';
import {month,months,addMonths,text,sum,ratio,localDate} from './dre-domain.js';
import {migrateProfit} from './profit-migration.js';
import {actualInput,resolveActual,nullable,signed,simulate,allocate,metrics,groups,accuracy,breakEven} from './profit-domain.js';
const read=r=>r?JSON.parse(r.data):null,now=()=>new Date().toISOString();
const norm=s=>text(s,240).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const defaults=()=>({revision:0,targetBps:7000,minimumBps:null,fixedExpensesReviewed:false,serviceMinutes:{},defaultGoals:null,goalsFrom:null});
function goalFields(raw){return {revenue:nullable(raw.revenue),marginBps:nullable(raw.marginBps,'a meta de margem',10000),result:raw.result==null||raw.result===''?null:signed(raw.result),ticket:nullable(raw.ticket)};}
export class ProfitService {
 constructor(repo,finance,dre,operations){Object.assign(this,{repo,finance,dre,operations});migrateProfit(repo);dre.resolveRecognition=r=>this.resolve(r);}
 settings(){return {...defaults(),...this.repo.config('profit-settings-v1')};}
 saveSettings(raw){
  const old=this.settings();if(raw.revision!==old.revision)throw fail(409,'As premissas mudaram. Reabra a tela.');
  const targetBps=integer(raw.targetBps,'a margem alvo',9999),minimumBps=nullable(raw.minimumBps,'a margem mínima',9999);
  if(minimumBps!==null&&minimumBps>targetBps)throw fail(400,'A margem mínima não pode exceder a margem alvo.');
  const serviceMinutes={};for(const [name,v]of Object.entries(raw.serviceMinutes||{})){if(Object.keys(serviceMinutes).length>=100)throw fail(400,'Limite de serviços excedido.');serviceMinutes[text(name,240)]=integer(v,'a duração prevista',100000);}
  const value={revision:old.revision+1,targetBps,minimumBps,fixedExpensesReviewed:raw.fixedExpensesReviewed===true,serviceMinutes,defaultGoals:raw.defaultGoals?goalFields(raw.defaultGoals):null,goalsFrom:raw.defaultGoals?month(raw.goalsFrom):null};
  const goalsChanged=JSON.stringify(value.defaultGoals)!==JSON.stringify(old.defaultGoals)||value.goalsFrom!==old.goalsFrom;
  if(goalsChanged&&value.defaultGoals&&value.goalsFrom<=localDate().slice(0,7))throw fail(400,'Metas padrão começam em um mês futuro. Para este mês use a meta mensal.');
  this.repo.transaction(()=>{if(goalsChanged){const history=this.repo.config('profit-goal-defaults-v1')||[];if(!history.length&&old.defaultGoals)history.push({from:old.goalsFrom,values:old.defaultGoals});history.push({from:value.goalsFrom||addMonths(localDate().slice(0,7),1),values:value.defaultGoals,recordedAt:now()});this.repo.setConfig('profit-goal-defaults-v1',history);}this.repo.setConfig('profit-settings-v1',value);this.dre.audit('profit-settings','default',old,value)});return value;
 }
 versions(id){return this.repo.db.prepare('SELECT data FROM finance_actuals WHERE proposal_id=? ORDER BY version DESC').all(id).map(read);}
 latest(id){return read(this.repo.db.prepare('SELECT data FROM finance_actuals WHERE proposal_id=? ORDER BY version DESC LIMIT 1').get(id));}
 recognition(id){return read(this.repo.db.prepare('SELECT data FROM finance_recognitions WHERE proposal_id=?').get(id));}
 resolve(r){return resolveActual(r,r.projected?null:this.latest(r.proposalId));}
 context(id){
  const stored=read(this.repo.db.prepare('SELECT data FROM finance_contexts WHERE proposal_id=?').get(id));if(stored)return stored;
  const q=this.repo.requireProposal(id),contact=text(q.clientContact).toLowerCase(),email=contact.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0],phone=contact.replace(/\D/g,'').replace(/^55(?=\d{11}$)/,'');
  const key=email?'email:'+email:/^\d{10,13}$/.test(phone)?'phone:'+phone:'proposal:'+id;
  const duration=this.repo.operation(id).schedule;
  return {proposalId:id,revision:0,city:'',state:'',neighborhood:'',customerId:'',customerKey:hash(key),estimatedMinutes:duration?Math.max(0,Math.round((Date.parse(duration.end)-Date.parse(duration.start))/60000))||null:null};
 }
 captureContext(id){const c=this.context(id);if(c.revision)return c;const value={...c,revision:1};this.repo.db.prepare('INSERT OR IGNORE INTO finance_contexts VALUES (?,?,?,?,?)').run(id,'',value.customerKey,JSON.stringify(value),1);return value;}
 saveContext(id,raw){
  this.repo.requireProposal(id);const old=this.context(id);if(raw.revision!==old.revision)throw fail(409,'Os dados internos mudaram. Reabra o atendimento.');
  if(old.revision&&!text(raw.reason))throw fail(400,'Informe o motivo da atualização.');
  const state=text(raw.state,2).toUpperCase();if(state&&!/^[A-Z]{2}$/.test(state))throw fail(400,'Informe a UF com duas letras.');
  const customerId=text(raw.customerId,100),value={...old,city:text(raw.city,120),state,neighborhood:text(raw.neighborhood,120),customerId,customerKey:customerId?hash('id:'+customerId):old.customerId?hash('proposal:'+id):old.customerKey,estimatedMinutes:nullable(raw.estimatedMinutes,'a duração prevista',100000),revision:old.revision+1,updatedAt:now()};
  this.repo.transaction(()=>{this.repo.db.prepare('INSERT INTO finance_contexts VALUES (?,?,?,?,?) ON CONFLICT(proposal_id) DO UPDATE SET city=excluded.city,customer_key=excluded.customer_key,data=excluded.data,revision=excluded.revision').run(id,norm(value.city),value.customerKey,JSON.stringify(value),value.revision);this.dre.audit('service-context',id,old,{...value,reason:text(raw.reason)})});return value;
 }
 view(id){
  const q=this.repo.requireProposal(id),recognition=this.recognition(id),estimate=this.finance.latest(id),context=this.context(id),settings=this.settings(),versions=this.versions(id);
  const r=recognition||this.dre.snapshot(id,localDate());
  const expected=context.estimatedMinutes??sum(q.items.map(i=>(settings.serviceMinutes[i.service]||0)*Number(i.quantity)).map(Math.round));
  return {private:true,status:this.repo.operation(id).status,context,estimate:estimate?.result??null,comparison:this.resolve(r),actual:versions[0]||null,history:versions,settings,estimatedMinutes:expected||null,canRecord:this.repo.operation(id).status==='completed'&&!!recognition,canPrice:this.finance.editable(id)&&!!estimate?.result.complete&&estimate.quoteKey===financialQuoteKey(q),proposalRevision:q.revision,estimateVersion:estimate?.version||0};
 }
 async saveActual(id,raw){return this.operations.locked(id,async()=>{
  if(this.repo.operation(id).status!=='completed'||!this.recognition(id))throw fail(409,'Conclua o atendimento e informe sua competência antes de registrar valores reais.');
  const old=this.latest(id);if(raw.expectedVersion!==(old?.version||0))throw fail(409,'Os valores reais mudaram em outra aba.');
  const reason=text(raw.reason);if(old&&!reason)throw fail(400,'Informe o motivo da correção. A versão anterior será preservada.');
  const value={proposalId:id,version:(old?.version||0)+1,input:actualInput(raw),reason,recordedAt:now(),actor:'administrator',competence:this.recognition(id).competence};
  this.repo.transaction(()=>{this.captureContext(id);this.repo.db.prepare('INSERT INTO finance_actuals VALUES (?,?,?,?)').run(id,value.version,JSON.stringify(value),value.recordedAt);this.dre.audit('actual',id,old,value)});
  return this.view(id);
 });}
 goal(m){month(m);const g=read(this.repo.db.prepare('SELECT data FROM finance_goals WHERE competence=? ORDER BY version DESC LIMIT 1').get(m));if(g)return g;const s=this.settings(),history=this.repo.config('profit-goal-defaults-v1')||[{from:s.goalsFrom,values:s.defaultGoals}],entry=history.filter(h=>h.from&&h.from<=m).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);return {competence:m,version:0,values:entry?.values||null,source:entry?.values?'default':'unset'};}
 saveGoal(m,raw){month(m);const old=this.goal(m);if(raw.expectedVersion!==old.version)throw fail(409,'A meta mudou. Reabra o mês.');if(old.version&&!text(raw.reason))throw fail(400,'Informe o motivo da alteração da meta.');
  const value={competence:m,version:old.version+1,values:goalFields(raw),source:'manual',actor:'administrator',recordedAt:now(),reason:text(raw.reason)};
  this.repo.transaction(()=>{this.repo.db.prepare('INSERT INTO finance_goals VALUES (?,?,?,?)').run(m,value.version,JSON.stringify(value),value.recordedAt);this.dre.audit('goal',m,old,value)});return value;
 }
 items(r){if(r.items?.length)return r.items;const q=this.repo.proposal(r.proposalId);
  if(q?.revision===r.quoteRevision)return q.items.map(i=>({service:i.service,unit:i.unit,quantity:i.quantity,revenue:Math.round(Math.round(Number(i.price)*100)*Number(i.quantity))}));
  return r.costSnapshot?.materialItems?.map(i=>({service:i.service,revenue:i.revenue,unit:null,quantity:null}))||[{service:'Serviço não identificado',revenue:r.estimatedRevenue,unit:null,quantity:null}];
 }
 rows(from,to,status='completed'){
  if(!['completed','scheduled','all'].includes(status))throw fail(400,'Status analítico inválido.');
  const report=this.dre.report(from,to,status==='completed'?'actual':'projected');
  return report.services.filter(r=>status==='all'||(status==='scheduled'?r.projected:!r.projected)).map(r=>{
   const context=this.context(r.proposalId),city=context.city?context.city+(context.state?' / '+context.state:''):'Cidade não informada';
   return {...r,...(Object.hasOwn(r,'estimatedRevenue')?{}:this.resolve(r)),city,cityKey:norm(city),neighborhood:context.neighborhood,neighborhoodKey:context.neighborhood?norm(city+' / '+context.neighborhood):null,neighborhoodLabel:context.neighborhood?city+' / '+context.neighborhood:null,customerKey:context.customerKey,clientLabel:r.client||'Cliente não informado',items:this.items(r),status:r.projected?'scheduled':'completed'};
  });
 }
 analyze(query){
  const {from,to}=query,range=months(from,to),status=query.status||'completed';
  const base=this.rows(from,to,status),allServices=[...new Set(base.flatMap(r=>r.items.map(i=>i.service)))].sort(),allCities=[...new Set(base.map(r=>r.city))].sort();
  const filter=rs=>rs.filter(r=>(!query.city||r.city===query.city)&&(!query.costSource||r.costSource===query.costSource));
  const expand=rows=>rows.flatMap(r=>{const weights=r.items.map(i=>i.revenue),rev=allocate(r.revenue,weights),cost=allocate(r.cost,weights),mins=r.minutes?allocate(r.minutes,weights):weights.map(()=>null);
   return r.items.map((i,n)=>({...r,revenue:rev[n],cost:cost[n],minutes:mins[n],service:i.service,quantity:i.quantity,unit:i.unit,allocated:r.items.length>1}));
  });
  let rows=filter(base),pieces=expand(rows);if(query.service){pieces=pieces.filter(r=>r.service===query.service);const ids=new Set(pieces.map(r=>r.proposalId));rows=rows.filter(r=>ids.has(r.proposalId));}
  const selected=query.service?pieces:rows,summary=metrics(selected),count=rows.length;
  const byService=groups(pieces,'service'),byCity=groups(selected,'cityKey','city'),byClient=groups(selected,'customerKey','clientLabel'),stats=accuracy(rows);
  const sort=query.sort||'revenue',validSort=['revenue','margin','marginLow','count','ticket'];if(!validSort.includes(sort))throw fail(400,'Ordenação inválida.');
  for(const list of [byService,byCity,byClient])list.sort((a,b)=>sort==='marginLow'?(a.margin??Infinity)-(b.margin??Infinity):(b[sort]??-Infinity)-(a[sort]??-Infinity));
  const n=range.length,priorFrom=addMonths(from,-n),priorTo=addMonths(from,-1);let previous=null;
  if(priorFrom>='2000-01'){const pr=filter(this.rows(priorFrom,priorTo,status));previous=metrics(query.service?expand(pr).filter(r=>r.service===query.service):pr);}
  const insights=stats.filter(s=>s.sufficient&&s.variancePercent!==null&&Math.abs(s.variancePercent)>=5).map(s=>({text:(s.key==='material'?'Materiais':s.key==='travel'?'Deslocamento':'Custo total')+': realizado '+Math.abs(s.variancePercent).toFixed(1)+'% '+(s.variancePercent>0?'acima':'abaixo')+' do estimado na amostra.',sample:s.count,records:s.records}));
  const actualRows=rows.filter(r=>r.costSource==='actual'&&!r.projected);
  if(actualRows.length>=5){const am=metrics(actualRows),ac=groups(actualRows,'cityKey','city');for(const g of ac.filter(g=>g.count>=5)){const rr=actualRows.filter(r=>r.cityKey===g.id),avg=sum(rr.map(r=>r.components.travel))/rr.length,global=sum(actualRows.map(r=>r.components.travel))/actualRows.length;if(global>0&&avg>global*1.1)insights.push({text:g.label+': deslocamento médio '+Math.round((avg/global-1)*100)+'% acima da média dos atendimentos reais selecionados.',sample:g.count,records:g.records});}
   for(const g of groups(expand(actualRows),'service').filter(g=>g.count>=5&&g.marginPercent!==null)){const pp=Math.round((g.marginPercent-am.marginPercent)*100)/100;if(Math.abs(pp)>=5)insights.push({text:g.label+': margem '+Math.abs(pp)+' pontos percentuais '+(pp>0?'acima':'abaixo')+' da média real selecionada (rateio por receita).',sample:g.count,records:g.records});}
  }
  const references=byService.map(g=>{const rr=actualRows.filter(r=>r.items.length===1&&r.items[0].service===g.id&&r.items[0].quantity>0),units=[...new Set(rr.map(r=>r.items[0].unit))],qty=rr.reduce((a,r)=>a+Number(r.items[0].quantity),0),unitCost=rr.length>=5&&units.length===1?Math.ceil(sum(rr.map(r=>r.cost))/qty):null;return {service:g.id,count:rr.length,unit:units[0]||null,costPerUnit:unitCost,...(unitCost!==null?{reference:simulate(unitCost,0,this.settings().targetBps,this.settings().minimumBps).referencePrice}:{}),records:rr.map(r=>r.proposalId)};});
  const actualReport=this.dre.report(from,to),projected=this.dre.report(from,to,'projected');
  const goals=range.map(m=>{const g=this.goal(m),a=actualReport.periods.find(p=>p.competence===m),p=projected.periods.find(p=>p.competence===m);return {...g,actual:{revenue:a.gross,marginBps:a.contributionPercent===null?null:Math.round(a.contributionPercent*100),result:a.result,ticket:a.serviceCount?Math.round(a.gross/a.serviceCount):null},projected:{revenue:p.gross,marginBps:p.contributionPercent===null?null:Math.round(p.contributionPercent*100),result:p.result,ticket:p.serviceCount?Math.round(p.gross/p.serviceCount):null}};});
  return {private:true,from,to,status,summary,previous,marginChangePP:previous?.marginPercent!=null&&summary.marginPercent!=null?Math.round((summary.marginPercent-previous.marginPercent)*100)/100:null,
   coverage:{count,actual:rows.filter(r=>r.costSource==='actual').length,estimated:rows.filter(r=>r.costSource==='estimated').length,mixed:rows.filter(r=>r.costSource==='mixed').length,missing:rows.filter(r=>r.costSource==='missing').length,actualPercent:count?ratio(rows.filter(r=>r.costSource==='actual').length,count):null},
   byService,byCity,byClient,byNeighborhood:groups(selected.filter(r=>r.neighborhoodKey),'neighborhoodKey','neighborhoodLabel'),accuracy:stats,insights,references,goals,breakEven:breakEven(actualReport.total,this.settings().fixedExpensesReviewed),trends:range.map(m=>({month:m,...metrics(selected.filter(r=>r.competence===m)),operatingResult:query.service||query.city||query.costSource||status!=='completed'?null:actualReport.periods.find(p=>p.competence===m).result})),
   records:rows.map(r=>({proposalId:r.proposalId,number:r.number,client:r.client,city:r.city,serviceDate:r.serviceDate,status:r.status,costSource:r.costSource,revenue:r.revenue,estimatedRevenue:r.estimatedRevenue,cost:r.cost,estimatedCost:r.estimatedCost,actualCost:r.actualCost,margin:r.margin,marginPercent:r.marginPercent,costVariance:r.costVariance,marginVariance:r.marginVariance,minutes:r.minutes,services:r.items.map(i=>i.service)})),
   choices:{services:allServices,cities:allCities},note:'Margens por atendimento usam receita base antes das deduções da DRE. Serviços múltiplos: receita, custo e tempo rateados pela participação na receita orçada; não são medições individuais. Metas e equilíbrio referem-se à empresa inteira no período.'};
 }
 pricing(id,raw={}){
  const q=this.repo.requireProposal(id),e=this.finance.latest(id);if(!e?.result.complete||e.quoteKey!==financialQuoteKey(q))throw fail(409,'Calcule uma estimativa completa e atualizada antes de simular.');
  const settings=this.settings(),current=quotedRevenue(q),target=raw.targetBps==null?settings.targetBps:integer(raw.targetBps,'a margem alvo',9999);
  let price=raw.price==null?current:integer(raw.price,'o preço');
  if(raw.discountCents!=null){const discount=integer(raw.discountCents,'o desconto');if(discount>current)throw fail(400,'O desconto excede o preço atual.');price=current-discount;}
  const sim=simulate(e.result.totalDirectCost,current,target,settings.minimumBps,price),requested=raw.useReference?sim.referencePrice:price,weights=q.items.map(i=>Math.round(Math.round(Number(i.price)*100)*Number(i.quantity))),shares=allocate(requested,weights);
  const items=q.items.map((i,n)=>{const cents=Math.ceil(shares[n]/Number(i.quantity));if(cents>100000000)throw fail(400,'Preço unitário acima do limite.');return {...i,price:cents/100};}),total=quotedRevenue({...q,items});
  return {...sim,private:true,proposalRevision:q.revision,estimateVersion:e.version,requestedPrice:requested,appliedTotal:total,items,canApply:this.finance.editable(id),appliedMarginPercent:ratio(total-e.result.totalDirectCost,total)};
 }
 async applyPrice(id,raw){return (async()=>{
  if(!this.finance.editable(id))throw fail(409,'Só orçamentos em elaboração podem receber novo preço.');
  const p=this.pricing(id,raw),q=this.repo.requireProposal(id);
  if(raw.proposalRevision!==q.revision||raw.estimateVersion!==p.estimateVersion||raw.confirmedTotal!==p.appliedTotal||raw.confirm!==true)throw fail(409,'Simule novamente e confirme o total exibido antes de aplicar.');
  const saved=this.repo.saveProposal({...q,items:p.items}),finance=await this.finance.refreshAutomatically(id);this.dre.audit('pricing',id,{revision:q.revision,total:quotedRevenue(q)},{revision:saved.revision,total:quotedRevenue(saved),estimateVersion:finance.latest?.version||p.estimateVersion,targetBps:p.targetBps,confirmedAt:now()});return {quote:saved,finance,message:'Preço aplicado. Custos e rentabilidade foram atualizados automaticamente. PDFs anteriores foram preservados.'};
 })();}
 export(){return {...this.dre.export(),version:3,profitabilitySettings:this.settings(),goalDefaultsHistory:this.repo.config('profit-goal-defaults-v1')||[],actuals:this.repo.db.prepare('SELECT data FROM finance_actuals ORDER BY created_at').all().map(read),contexts:this.repo.db.prepare('SELECT data FROM finance_contexts').all().map(read),goals:this.repo.db.prepare('SELECT data FROM finance_goals ORDER BY competence,version').all().map(read)};}
}
