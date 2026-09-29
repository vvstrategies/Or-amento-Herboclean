import {fail} from './database.js';
import {integer,roundRatio} from './finance-domain.js';
export const text=(v,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
export function month(v){if(typeof v!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))throw fail(400,'Informe a competência no formato AAAA-MM (2000 a 2099).');return v;}
export function date(v,optional=true){if(!v&&optional)return null;if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw fail(400,'Data inválida.');return v;}
export function localDate(v=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));}
export function addMonths(v,n){month(v);const d=new Date(v+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);}
export function months(from,to){month(from);month(to);if(from>to)throw fail(400,'O início deve vir antes do fim.');const list=[];for(let m=from;m<=to;m=addMonths(m,1)){list.push(m);if(list.length>24)throw fail(400,'Selecione até 24 meses por consulta.');}return list;}
export const cents=v=>integer(v,'o valor em centavos',1e12);
export function sum(values){const n=values.reduce((a,b)=>a+BigInt(b),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))throw fail(400,'Total acima do limite suportado.');return Number(n);}
export function ratio(value,base){return base>0&&value!==null?Math.sign(value)*roundRatio(BigInt(Math.abs(value))*10000n,BigInt(base))/100:null;}
export function variation(value,previous){return value==null||previous==null||previous===0?null:Math.sign(value-previous)*roundRatio(BigInt(Math.abs(value-previous))*10000n,BigInt(Math.abs(previous)))/100;}
export function expenseInput(raw){
 const description=text(raw.description,240);if(!description)throw fail(400,'Descreva a despesa.');
 const status=raw.status||'planned',nature=raw.nature||'operating',costType=raw.costType||'fixed';
 if(!['planned','confirmed','paid','cancelled'].includes(status)||!['operating','investment','deduction'].includes(nature)||!['fixed','variable'].includes(costType))throw fail(400,'Classificação da despesa inválida.');
 const deductionType=nature==='deduction'?raw.deductionType:null;
 if(nature==='deduction'&&!['discount','refund','other'].includes(deductionType))throw fail(400,'Classifique a dedução de receita.');
 const notes=text(raw.notes,2000);if(nature==='deduction'&&deductionType==='other'&&!notes)throw fail(400,'Justifique a dedução de receita em observações.');
 const paidAt=date(raw.paidAt);if(status==='paid'&&!paidAt)throw fail(400,'Informe a data de pagamento.');if(status!=='paid'&&paidAt)throw fail(400,'Use o status Paga para informar pagamento.');
 return {description,categoryId:text(raw.categoryId,140),amountCents:cents(raw.amountCents),competence:month(raw.competence),dueDate:date(raw.dueDate),paidAt,status,nature,costType,deductionType,notes,supplier:text(raw.supplier,240),vehicleComponent:text(raw.vehicleComponent,80)};
}
export function aggregate(services,expenses,tax){
 const gross=sum(services.map(s=>s.revenue)),deductionEntries=expenses.filter(e=>e.nature==='deduction'),otherDeductions=sum(deductionEntries.map(e=>e.amountCents));
 const taxEstimated=roundRatio(BigInt(gross)*BigInt(tax.rateBps),10000),taxCents=tax.manualCents??taxEstimated;
 const deductions=sum([taxCents,otherDeductions]),net=gross-deductions;
 const missing=services.filter(s=>s.cost==null).length,knownCost=sum(services.map(s=>s.cost??s.knownCost??0)),cost=missing?null:knownCost;
 const operating=expenses.filter(e=>e.nature==='operating'),opex=sum(operating.map(e=>e.amountCents)),investment=sum(expenses.filter(e=>e.nature==='investment').map(e=>e.amountCents));
 const contribution=cost===null?null:net-cost,result=contribution===null?null:contribution-opex;
 return {gross,deductions,taxCents,taxEstimated,otherDeductions,net,cost,knownCost,contribution,contributionPercent:ratio(contribution,net),opex,investment,result,operatingMargin:ratio(result,net),missingCosts:missing,serviceCount:services.length,estimatedCount:services.filter(s=>s.costSource==='estimated').length,actualCount:services.filter(s=>s.costSource==='actual').length,mixedCount:services.filter(s=>s.costSource==='mixed').length,fixedExpenses:sum(operating.filter(e=>e.costType==='fixed').map(e=>e.amountCents)),variableExpenses:sum(operating.filter(e=>e.costType==='variable').map(e=>e.amountCents))};
}
