import crypto from 'node:crypto';
import {fail} from './database.js';
import {migrateDre} from './dre-migration.js';
import {month,date,months,localDate,addMonths,cents,text,expenseInput,aggregate,sum,ratio,variation} from './dre-domain.js';
import {financialQuoteKey,quotedRevenue,integer} from './finance-domain.js';
const read=r=>r?JSON.parse(r.data):null,now=()=>new Date().toISOString();
const components=['maintenance','tires','oil','insurance','tax','depreciation'];
export class DreService{
 constructor(repo,finance){this.repo=repo;this.finance=finance;migrateDre(repo);this.backfill();}
 audit(entity,id,before,after,actor='administrator'){this.repo.db.prepare('INSERT INTO finance_audit VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),entity,id,actor,now(),JSON.stringify({before,after}));}
 settings(){return this.repo.config('dre-settings-v1')||{taxRateBps:0,vehicleComponents:[],vehicleNotes:''};}
 saveSettings(raw){
  const list=raw.vehicleComponents||[];if(!Array.isArray(list)||list.some(c=>!components.includes(c)))throw fail(400,'Composição do custo por km inválida.');
  const value={taxRateBps:integer(raw.taxRateBps,'o imposto estimado',10000),vehicleComponents:[...new Set(list)],vehicleNotes:text(raw.vehicleNotes,500)};
  this.repo.transaction(()=>{const old=this.settings();this.repo.setConfig('dre-settings-v1',value);this.audit('settings','dre',old,value);});return value;
 }
 categories(){return this.repo.db.prepare('SELECT * FROM finance_categories ORDER BY name COLLATE NOCASE').all().map(r=>({...r,active:!!r.active}));}
 category(id){const c=this.categories().find(c=>c.id===id);if(!c)throw fail(400,'Categoria não encontrada.');return c;}
 saveCategory(id,raw){
  const name=text(raw.name,100);if(!name)throw fail(400,'Informe o nome da categoria.');const old=id?this.category(id):null;
  if(old&&raw.revision!==old.revision)throw fail(409,'A categoria mudou. Atualize a tela.');
  if(this.categories().some(c=>c.id!==id&&c.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw fail(400,'Já existe uma categoria com esse nome.');
  const value={id:old?.id||crypto.randomUUID(),name,active:raw.active!==false,revision:(old?.revision||0)+1};
  this.repo.transaction(()=>{this.repo.db.prepare('INSERT INTO finance_categories VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,revision=excluded.revision').run(value.id,name,+value.active,value.revision);this.audit('category',value.id,old,value);});return value;
 }
 expenses(from,to){return this.repo.db.prepare('SELECT data FROM finance_expenses WHERE competence>=? AND competence<=? ORDER BY competence DESC,id').all(from,to).map(read);}
 getExpense(id){const e=read(this.repo.db.prepare('SELECT data FROM finance_expenses WHERE id=?').get(id));if(!e)throw fail(404,'Despesa não encontrada.');return e;}
 writeExpense(value){this.repo.db.prepare('INSERT INTO finance_expenses VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET competence=excluded.competence,category_id=excluded.category_id,status=excluded.status,nature=excluded.nature,data=excluded.data,revision=excluded.revision').run(value.id,value.competence,value.categoryId,value.status,value.nature,value.ruleId||null,JSON.stringify(value),value.revision);}
 saveExpense(id,raw){
  const old=id?this.getExpense(id):null;if(old&&raw.revision!==old.revision)throw fail(409,'Esta despesa mudou em outra aba. Reabra-a.');
  if(old?.status==='cancelled')throw fail(409,'Despesas canceladas ficam preservadas no histórico. Cadastre um novo lançamento.');
  const input=expenseInput(raw),cat=this.category(input.categoryId);
  if(!cat.active&&(!old||old.categoryId!==cat.id))throw fail(400,'Selecione uma categoria ativa.');
  if(old?.ruleId&&old.competence!==input.competence)throw fail(400,'A competência da recorrência é fixa. Cancele esta ocorrência e crie uma despesa avulsa.');

  if(old&&JSON.stringify({...old,...input})!==JSON.stringify(old)&&!text(raw.reason))throw fail(400,'Informe o motivo da alteração para o histórico.');
  const value={...input,id:old?.id||crypto.randomUUID(),revision:(old?.revision||0)+1,ruleId:old?.ruleId||null,createdAt:old?.createdAt||now(),updatedAt:now(),createdBy:old?.createdBy||'administrator',updatedBy:'administrator'};
  this.repo.transaction(()=>{this.writeExpense(value);this.audit('expense',value.id,old,{...value,reason:text(raw.reason)});});
  return {...value,warnings:this.warnings(value)};
 }
 warnings(e){const s=this.settings(),warnings=[];if(e.vehicleComponent&&s.vehicleComponents.includes(e.vehicleComponent))warnings.push('Este componente já está no custo por km. Confira se há duplicidade com custos dos atendimentos.');if(e.nature==='operating'&&/imposto|tributo|das\b/i.test(e.description)&&s.taxRateBps>0)warnings.push('Há imposto gerencial configurado. Confira se este lançamento repetiria a mesma dedução.');return [...warnings,...(this.externalWarnings?.(e)||[])];}
 listExpenses(query){
  const from=month(query.from),to=month(query.to);months(from,to);let rows=this.expenses(from,to),search=text(query.search).toLocaleLowerCase('pt-BR'),cats=new Map(this.categories().map(c=>[c.id,c.name]));
  if(query.category)rows=rows.filter(e=>e.categoryId===query.category);
  if(query.status)rows=rows.filter(e=>e.status===query.status);
  if(query.mode==='actual')rows=rows.filter(e=>['confirmed','paid'].includes(e.status));
  if(query.mode==='projected')rows=rows.filter(e=>e.status!=='cancelled');
  if(search)rows=rows.filter(e=>[e.description,e.supplier,cats.get(e.categoryId)].some(v=>String(v).toLocaleLowerCase('pt-BR').includes(search)));
  const page=Math.max(1,Math.min(100000,parseInt(query.page)||1)),size=20;
  return {total:rows.length,page,pageSize:size,items:rows.slice((page-1)*size,page*size).map(e=>({...e,categoryName:cats.get(e.categoryId),warnings:this.warnings(e)}))};
 }
 rules(){return this.repo.db.prepare('SELECT data FROM finance_recurrences ORDER BY id').all().map(read);}
 saveRule(id,raw){
  const old=id?read(this.repo.db.prepare('SELECT data FROM finance_recurrences WHERE id=?').get(id)):null;
  if(id&&!old)throw fail(404,'Recorrência não encontrada.');if(old&&old.revision!==raw.revision)throw fail(409,'A recorrência mudou. Reabra-a.');
  const effective=month(raw.effectiveMonth),start=old?.startMonth||month(raw.startMonth||effective);
  if(effective<start)throw fail(400,'A alteração não pode anteceder o início da recorrência.');
  if(old&&effective<localDate().slice(0,7))throw fail(400,'Altere a recorrência a partir do mês atual ou futuro. O histórico permanece preservado.');
  const template=expenseInput({...raw.template,competence:effective,status:'planned',paidAt:null,dueDate:null}),cat=this.category(template.categoryId);
  if(!cat.active)throw fail(400,'Use uma categoria ativa.');const frequency=old?.frequency||raw.frequency;
  if(!['monthly','annual'].includes(frequency))throw fail(400,'Escolha mensal ou anual.');
  const dueDay=integer(raw.dueDay??10,'o dia de vencimento',31);if(dueDay<1)throw fail(400,'Informe um dia entre 1 e 31.');
  const version={effectiveMonth:effective,template,dueDay,active:raw.active!==false};
  const value={id:old?.id||crypto.randomUUID(),revision:(old?.revision||0)+1,startMonth:start,frequency,versions:[...(old?.versions||[]).filter(v=>v.effectiveMonth!==effective),version].sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth)),createdAt:old?.createdAt||now(),updatedAt:now()};
  let updated=0,preserved=0;
  this.repo.transaction(()=>{
   this.repo.db.prepare('INSERT INTO finance_recurrences VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision').run(value.id,JSON.stringify(value),value.revision);
   // Only unrecognized occurrences within the edited effective interval are changed.
   for(const row of this.repo.db.prepare('SELECT data FROM finance_expenses WHERE rule_id=? AND competence>=?').all(value.id,effective)){
    const e=read(row);if(e.status!=='planned'){preserved++;continue;}const v=this.ruleVersion(value,e.competence);
    const next={...e,...v.template,competence:e.competence,dueDate:this.due(e.competence,v.dueDay),status:v.active?'planned':'cancelled',updatedAt:now(),revision:e.revision+1};
    this.writeExpense(next);this.audit('expense',e.id,e,next);updated++;
   }
   this.audit('recurrence',value.id,old,value);
  });return {...value,updatedOccurrences:updated,preservedOccurrences:preserved};
 }
 ruleVersion(rule,m){return rule.versions.filter(v=>v.effectiveMonth<=m).at(-1);}
 due(m,day){const [y,mo]=m.split('-').map(Number),last=new Date(Date.UTC(y,mo,0)).getUTCDate();return m+'-'+String(Math.min(day,last)).padStart(2,'0');}
 materialize(from,to){
  const range=months(from,to);let created=0;
  this.repo.transaction(()=>{
   for(const m of range){
    if(!this.period(m)){const s=this.settings();this.repo.db.prepare('INSERT INTO finance_periods VALUES (?,?)').run(m,JSON.stringify({competence:m,rateBps:s.taxRateBps,originalRateBps:s.taxRateBps,manualCents:null,source:'estimated',revision:1,createdAt:now()}));}
    for(const rule of this.rules()){
     if(m<rule.startMonth||(rule.frequency==='annual'&&m.slice(5)!==rule.startMonth.slice(5)))continue;
     const v=this.ruleVersion(rule,m);if(!v?.active)continue;
     if(this.repo.db.prepare('SELECT id FROM finance_expenses WHERE rule_id=? AND competence=?').get(rule.id,m))continue;
     const e={...v.template,id:crypto.randomUUID(),competence:m,dueDate:this.due(m,v.dueDay),ruleId:rule.id,revision:1,createdAt:now(),updatedAt:now(),createdBy:'administrator',updatedBy:'administrator'};
     this.writeExpense(e);this.audit('expense',e.id,null,e);created++;
    }
   }
  });return {created};
 }
 period(m){return read(this.repo.db.prepare('SELECT data FROM finance_periods WHERE competence=?').get(m));}
 tax(m,raw){
  month(m);const old=this.period(m);if(!old)throw fail(409,'Abra o período antes de ajustar o imposto.');
  if(old.revision!==raw.revision)throw fail(409,'O imposto foi alterado em outra aba.');
  if(raw.confirm!==true||!text(raw.reason))throw fail(400,'Confirme o ajuste e informe o motivo.');
  const manual=raw.source==='manual';if(!['manual','estimated'].includes(raw.source))throw fail(400,'Origem do imposto inválida.');
  const value={...old,manualCents:manual?cents(raw.manualCents):null,rateBps:manual?old.rateBps:this.settings().taxRateBps,source:raw.source,reason:text(raw.reason),updatedAt:now(),revision:old.revision+1};
  this.repo.transaction(()=>{this.repo.db.prepare('UPDATE finance_periods SET data=? WHERE competence=?').run(JSON.stringify(value),m);this.audit('tax',m,old,value);});return value;
 }
 snapshot(id,serviceDate,source='confirmed'){
  const q=this.repo.requireProposal(id),estimate=this.finance.latest(id),valid=estimate&&estimate.quoteKey===financialQuoteKey(q);
  // Actual costs can later be recorded separately; Phase 1 snapshots remain immutable.
  const result=valid?estimate.result:null;
  return {items:q.items.map(i=>({service:i.service,unit:i.unit,quantity:i.quantity,revenue:Math.round(Math.round(Number(i.price)*100)*Number(i.quantity))})),proposalId:id,number:q.number,client:q.client,serviceDate,competence:serviceDate.slice(0,7),dateSource:source,revenue:quotedRevenue(q),revenueBasis:'commercial_pix_base',cost:result?.totalDirectCost??null,knownCost:result?.knownDirectCost??0,costSource:result?.complete?'estimated':'missing',estimateId:estimate?.id||null,estimateVersion:estimate?.version||null,costSnapshot:result,quoteRevision:q.revision,recognizedAt:now()};
 }
 recognize(id,serviceDate,source='confirmed'){
  date(serviceDate,false);if(serviceDate>localDate())throw fail(400,'A realização não pode estar no futuro.');
  const old=read(this.repo.db.prepare('SELECT data FROM finance_recognitions WHERE proposal_id=?').get(id));if(old)return old;
  const value=this.snapshot(id,serviceDate,source);this.repo.db.prepare('INSERT INTO finance_recognitions VALUES (?,?,?,?)').run(id,serviceDate,value.competence,JSON.stringify(value));this.audit('recognition',id,null,value);return value;
 }
 backfill(){
  this.repo.transaction(()=>{for(const op of this.repo.listOperations()){
   if(op.status!=='completed')continue;
   const d=op.serviceCompletedAt||op.schedule?.end;
   if(d&&Number.isFinite(Date.parse(d))&&localDate(d)<=localDate()){
    try{this.recognize(op.id,/^\d{4}-\d{2}-\d{2}$/.test(d)?d:localDate(d),op.serviceCompletedAt?'confirmed':'legacy_schedule');}
    catch(error){if(error.status!==400)throw error;/* Invalid legacy data remains listed for explicit review; never block startup. */}
   }
  }});
 }
 recordLegacyDate(id,raw){
  if(this.repo.operation(id).status!=='completed')throw fail(409,'A data é informada apenas para atendimentos concluídos.');
  if(!text(raw.reason))throw fail(400,'Justifique a data de realização.');
  if(this.repo.db.prepare('SELECT 1 FROM finance_recognitions WHERE proposal_id=?').get(id))throw fail(409,'Este atendimento já possui competência registrada.');
  return this.repo.transaction(()=>{const v=this.recognize(id,date(raw.serviceDate,false),'manual_legacy');this.audit('legacy-date',id,null,{...v,reason:text(raw.reason)});return v;});
 }
 report(from,to,mode='actual'){
  const range=months(from,to);if(!['actual','projected'].includes(mode))throw fail(400,'Visão inválida.');
  const cats=new Map(this.categories().map(c=>[c.id,c.name])),allOps=this.repo.listOperations(),ops=new Map(allOps.map(o=>[o.id,o]));
  const recognized=this.repo.db.prepare('SELECT data FROM finance_recognitions WHERE competence>=? AND competence<=? ORDER BY service_date').all(from,to).map(read).filter(s=>ops.get(s.proposalId)?.status==='completed');
  const scheduled=mode==='projected'?allOps.filter(o=>o.status==='scheduled'&&o.schedule?.start&&localDate(o.schedule.start).slice(0,7)>=from&&localDate(o.schedule.start).slice(0,7)<=to).map(o=>({...this.snapshot(o.id,localDate(o.schedule.start),'schedule'),projected:true})):[];
  const services=[...recognized,...scheduled].map(s=>this.resolveRecognition?this.resolveRecognition(s):s),expenses=[...this.expenses(from,to).filter(e=>mode==='projected'?e.status!=='cancelled':['confirmed','paid'].includes(e.status)).map(e=>({...e,source:'manual'})),...(this.externalExpenses?.(from,to)||[])];
  if(expenses.some(e=>e.automatic))cats.set('integration-marketing','Marketing · Mídia paga');
  const periods=range.map(m=>{
   const tax=this.period(m)||{competence:m,rateBps:this.settings().taxRateBps,originalRateBps:this.settings().taxRateBps,manualCents:null,source:'estimated',revision:0,provisional:true};
   const ss=services.filter(s=>s.competence===m),es=expenses.filter(e=>e.competence===m);return {competence:m,...aggregate(ss,es,tax),tax};
  });
  const total={};for(const key of ['gross','deductions','taxCents','taxEstimated','otherDeductions','net','knownCost','opex','investment','missingCosts','serviceCount','estimatedCount','actualCount','mixedCount','fixedExpenses','variableExpenses'])total[key]=sum(periods.map(p=>p[key]));
  total.cost=total.missingCosts?null:total.knownCost;total.contribution=total.cost===null?null:total.net-total.cost;total.result=total.contribution===null?null:total.contribution-total.opex;
  total.contributionPercent=ratio(total.contribution,total.net);total.operatingMargin=ratio(total.result,total.net);
  const composition=[...cats].map(([id,name])=>({id,name,amountCents:sum(expenses.filter(e=>e.nature==='operating'&&e.categoryId===id).map(e=>e.amountCents))})).filter(c=>c.amountCents!==0).sort((a,b)=>b.amountCents-a.amountCents);
  const missingDates=allOps.filter(o=>o.status==='completed'&&!this.repo.db.prepare('SELECT 1 FROM finance_recognitions WHERE proposal_id=?').get(o.id)).map(o=>{const q=this.repo.proposal(o.id);return {id:o.id,number:q.number,client:q.client};});
  return {private:true,from,to,mode,total,periods,composition,services,expenses:expenses.map(e=>({...e,categoryName:cats.get(e.categoryId)})),marketingWarnings:expenses.filter(e=>!e.automatic).flatMap(e=>this.externalWarnings?.(e)||[]),missingDates,dateInferredCount:recognized.filter(s=>s.dateSource==='legacy_schedule').length,generatedAt:now()};
 }
 compare(from,to,mode){const n=months(from,to).length,current=this.report(from,to,mode),priorFrom=addMonths(from,-n);if(priorFrom<'2000-01')return {...current,comparison:{from:null,to:null,total:{},changes:{}}};const previous=this.report(priorFrom,addMonths(from,-1),mode);return {...current,comparison:{from:previous.from,to:previous.to,total:previous.total,changes:Object.fromEntries(['gross','net','cost','opex','result'].map(k=>[k,variation(current.total[k],previous.total[k])]))}};}
 export(){return {version:2,private:true,exportedAt:now(),settings:this.finance.settings(),dreSettings:this.settings(),categories:this.categories(),estimates:this.repo.db.prepare('SELECT data FROM finance_estimates ORDER BY created_at').all().map(read),expenses:this.expenses('2000-01','2099-12'),recurrences:this.rules(),recognitions:this.repo.db.prepare('SELECT data FROM finance_recognitions').all().map(read),periods:this.repo.db.prepare('SELECT data FROM finance_periods').all().map(read),audit:this.repo.db.prepare('SELECT entity,entity_id,actor,recorded_at,data FROM finance_audit ORDER BY recorded_at').all().map(r=>({...r,data:JSON.parse(r.data)}))};}
}
