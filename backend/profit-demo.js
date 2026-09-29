import {ProfitService} from './profit-service.js';
import {resolveActual} from './profit-domain.js';
import {aggregate,months,sum,ratio} from './dre-domain.js';
export function profitDemo(query){
 const range=months(query.from,query.to);
 const examples=[
 ['A','Estimativa próxima do real','Sofá','São Bernardo do Campo',50000,10000,5000,50000,10200,5100,120],
 ['B','Custo acima do previsto','Sofá','Santo André',50000,10000,5000,50000,19000,10000,150],
 ['C','Preço negociado','Sofá','Santo André',50000,10000,5000,32000,16000,7000,100],
 ['D','Deslocamento longo','Sofá','São Paulo',60000,10000,5000,60000,10000,16000,180],
 ['E','Maior duração','Sofá','São Bernardo do Campo',80000,15000,5000,80000,15000,5000,480],
 ['F','Atendimento curto','Poltronas','São Bernardo do Campo',22000,4000,2000,22000,3500,1500,40]];
 const all=examples.map((a,i)=>{const [id,client,service,city,revenue,material,travel,realRevenue,realMaterial,realTravel,minutes]=a,m=range[i%range.length],r={proposalId:'demo-'+id,number:'DEMO-'+id,client,serviceDate:m+'-10',competence:m,revenue,cost:material+travel,costSource:'estimated',costSnapshot:{materialCost:material,travelCost:travel,otherDirectCosts:0,totalDirectCost:material+travel},items:[{service,revenue,quantity:1,unit:'un.'}]};return {...resolveActual(r,{version:1,input:{revenue:realRevenue,material:realMaterial,travel:realTravel,otherCosts:[],minutes}}),city,cityKey:city,customerKey:'demo-'+id,clientLabel:client,status:'completed'};});
 const settings={targetBps:7000,minimumBps:6000,fixedExpensesReviewed:true};
 const service=Object.create(ProfitService.prototype);
 service.settings=()=>settings;service.goal=m=>({competence:m,version:0,values:null,source:'unset'});
 service.rows=(from,to,status)=>status==='scheduled'?[]:all.filter(r=>r.competence>=from&&r.competence<=to);
 service.dre={report:(from,to)=>{const periods=months(from,to).map(m=>({competence:m,...aggregate(all.filter(r=>r.competence===m),[{nature:'operating',costType:'fixed',amountCents:8000}],{rateBps:0})})),total={};for(const k of ['gross','deductions','cost','fixedExpenses','variableExpenses','serviceCount','result'])total[k]=sum(periods.map(p=>p[k]));return {periods,total};}};
 return {...service.analyze(query),demo:true,demoNote:'Seis atendimentos fictícios A–F. Dados apenas em memória; não alteram a empresa.'};
}
