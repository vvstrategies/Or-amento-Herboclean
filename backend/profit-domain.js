import {fail} from './database.js';
import {integer,roundRatio} from './finance-domain.js';
import {sum,ratio,text} from './dre-domain.js';
export const nullable=(v,label='o valor',max=1e12)=>v==null||v===''?null:integer(v,label,max);
export function signed(v,label='o valor'){if(!Number.isSafeInteger(v)||Math.abs(v)>1e12)throw fail(400,'Informe '+label+' em centavos.');return v;}
export function actualInput(raw){
 const other=raw.otherCosts==null?null:raw.otherCosts;
 if(other!==null&&(!Array.isArray(other)||other.length>30))throw fail(400,'Informe até 30 outros custos.');
 const otherCosts=other?.map(c=>{const name=text(c.name,160);if(!name)throw fail(400,'Descreva cada custo adicional.');return {name,cents:integer(c.cents,'o custo adicional',1e12)};})??null;
 const mode=raw.travelMode||'total';if(!['total','components'].includes(mode))throw fail(400,'Modo de deslocamento inválido.');
 const components=Object.fromEntries(['fuel','vehicle','toll','parking','other'].map(k=>[k,nullable(raw.travelComponents?.[k])]));
 if(mode==='components'&&Object.values(components).some(v=>v===null))throw fail(400,'Preencha todos os componentes do deslocamento, usando zero quando não houver custo.');
 const result={revenue:nullable(raw.revenue),material:nullable(raw.material),travelMode:mode,travel:mode==='components'?sum(Object.values(components)):nullable(raw.travel),travelComponents:mode==='components'?components:null,otherCosts,distanceMeters:nullable(raw.distanceMeters,'a distância',10000000),minutes:nullable(raw.minutes,'a duração',100000),notes:text(raw.notes,2000)};
 if(result.minutes===0)throw fail(400,'A duração deve ser maior que zero ou ficar em branco.');
 if([result.revenue,result.material,result.travel,result.otherCosts,result.minutes,result.distanceMeters].every(v=>v===null))throw fail(400,'Informe pelo menos um valor realizado.');
 return result;
}
export function resolveActual(recognition,actual){
 const r=recognition,e=r.costSnapshot,a=actual?.input;
 const fields={material:a?.material??e?.materialCost??null,travel:a?.travel??e?.travelCost??null,other:a?.otherCosts!=null?sum(a.otherCosts.map(c=>c.cents)):e?.otherDirectCosts??null};
 const supplied=[a?.material!=null,a?.travel!=null,a?.otherCosts!=null].filter(Boolean).length;
 const knownTravel=fields.travel??sum(['fuelCost','vehicleOperatingCost','tollCost','parkingCost','otherTravelCost'].map(k=>e?.[k]??0));
 const complete=Object.values(fields).every(v=>v!==null),cost=complete?sum(Object.values(fields)):null,revenue=a?.revenue??r.revenue;
 const source=!complete?'missing':supplied===3?'actual':supplied?'mixed':r.costSource==='missing'?'missing':'estimated';
 return {...r,revenue,cost,knownCost:sum([fields.material??0,knownTravel,fields.other??0]),costSource:source,estimatedRevenue:r.revenue,estimatedCost:r.cost,estimatedMargin:r.cost===null?null:r.revenue-r.cost,
 actualVersion:actual?.version??null,actualRevenue:a?.revenue??null,actualCost:supplied===3?cost:null,components:fields,actualInput:a??null,
 margin:cost===null?null:revenue-cost,marginPercent:ratio(cost===null?null:revenue-cost,revenue),minutes:a?.minutes??null,
 costVariance:cost===null||r.cost===null?null:cost-r.cost,marginVariance:cost===null||r.cost===null?null:(revenue-cost)-(r.revenue-r.cost)};
}
export function priceForMargin(cost,bps){integer(cost,'o custo');integer(bps,'a margem alvo',9999);return Number((BigInt(cost)*10000n+BigInt(10000-bps)-1n)/BigInt(10000-bps));}
export function simulate(cost,currentPrice,targetBps,minimumBps,proposedPrice=currentPrice){
 const referencePrice=priceForMargin(cost,targetBps),floor=minimumBps==null?null:priceForMargin(cost,minimumBps);
 integer(proposedPrice,'o preço');return {cost,currentPrice,proposedPrice,targetBps,minimumBps,referencePrice,minimumPrice:floor,maximumDiscount:floor===null?null:Math.max(0,currentPrice-floor),margin:proposedPrice-cost,marginPercent:ratio(proposedPrice-cost,proposedPrice),belowMinimum:minimumBps!==null&&(proposedPrice===0||BigInt(proposedPrice-cost)*10000n<BigInt(proposedPrice)*BigInt(minimumBps)),assumption:'Custo direto do snapshot constante; não inclui demanda, concorrência ou despesas fixas.'};
}
export function allocate(total,weights){
 if(total==null)return weights.map(()=>null);if(!weights.length)return [];
 const safe=weights.map(w=>Math.max(0,Math.round(w))),den=sum(safe)||safe.length,ws=sum(safe)?safe:safe.map(()=>1),negative=total<0,abs=BigInt(Math.abs(total)),d=BigInt(den);
 const out=ws.map((w,i)=>({i,n:Number(abs*BigInt(w)/d),rem:abs*BigInt(w)%d}));let remaining=Math.abs(total)-sum(out.map(v=>v.n));
 for(const v of [...out].sort((a,b)=>a.rem===b.rem?a.i-b.i:a.rem>b.rem?-1:1)){if(!remaining)break;v.n++;remaining--;}
 return out.map(v=>negative?-v.n:v.n);
}
const mean=(value,divisor,multiplier=1)=>Math.sign(value)*roundRatio(BigInt(Math.abs(value))*BigInt(multiplier),BigInt(divisor));
export function metrics(rows){
 const count=new Set(rows.map(r=>r.proposalId)).size,revenue=sum(rows.map(r=>r.revenue)),missing=rows.filter(r=>r.cost==null).length,cost=missing?null:sum(rows.map(r=>r.cost)),margin=cost===null?null:revenue-cost;
 const timed=rows.filter(r=>r.minutes>0&&r.cost!==null),minutes=sum(timed.map(r=>r.minutes)),hourMargin=sum(timed.map(r=>r.revenue-r.cost));
 return {count,revenue,cost,margin,marginPercent:ratio(margin,revenue),ticket:count?mean(revenue,count):null,averageCost:count&&cost!==null?mean(cost,count):null,averageMargin:count&&margin!==null?mean(margin,count):null,minutes,marginPerHour:minutes?mean(hourMargin,minutes,60):null,timedCount:new Set(timed.map(r=>r.proposalId)).size,missing};
}
export function groups(rows,key,label=key){const map=new Map();for(const r of rows){const k=r[key]||'unknown';if(!map.has(k))map.set(k,[]);map.get(k).push(r);}return [...map].map(([id,list])=>({id,label:list[0][label]||'Não informado',...metrics(list),records:[...new Set(list.map(r=>r.proposalId))]}));}
export function accuracy(rows){
 return ['material','travel','total'].map(key=>{
 const paired=rows.filter(r=>!r.projected&&(key==='total'?r.actualCost!=null&&r.estimatedCost!=null:r.actualInput?.[key]!=null&&r.costSnapshot?.[key==='material'?'materialCost':'travelCost']!=null));
 const es=paired.map(r=>key==='total'?r.estimatedCost:r.costSnapshot[key==='material'?'materialCost':'travelCost']),as=paired.map(r=>key==='total'?r.actualCost:r.actualInput[key]),estimated=sum(es),actual=sum(as),count=paired.length;
 return {key,count,estimatedMean:count?mean(estimated,count):null,actualMean:count?mean(actual,count):null,varianceMean:count?mean(actual-estimated,count):null,variancePercent:ratio(actual-estimated,estimated),sufficient:count>=5,records:paired.map(r=>r.proposalId)};
 });
}
export function breakEven(total,reviewed){
 if(!reviewed)return {value:null,reason:'Revise a classificação de despesas fixas e variáveis nas premissas.'};
 if(!total.serviceCount||total.cost==null||total.gross<=0||total.fixedExpenses<=0)return {value:null,reason:'São necessários receita, custos completos e despesas fixas do período.'};
 const available=total.gross-total.deductions-total.cost-total.variableExpenses;
 if(available<=0)return {value:null,reason:'A contribuição disponível para cobrir despesas fixas precisa ser positiva.'};
 const value=Number((BigInt(total.fixedExpenses)*BigInt(total.gross)+BigInt(available)-1n)/BigInt(available));
 return {value,gap:Math.max(0,value-total.gross),ratePercent:ratio(available,total.gross),fixedExpenses:total.fixedExpenses,reason:'Despesas fixas / taxa de contribuição após deduções, custos diretos e despesas variáveis. Mantém o mix do período.'};
}
