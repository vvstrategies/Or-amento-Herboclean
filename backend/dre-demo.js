import {months,aggregate,ratio,sum} from './dre-domain.js';
export function dreDemo(from,to,mode='actual'){
 const range=months(from,to),services=[],expenses=[],periods=[];
 for(const [i,m] of range.entries()){
  const revenue=i%2?800000:1000000,cost=i%2?300000:200000;
  const s={proposalId:'demo-'+m,number:'DEMO-'+m,client:'Cliente fictício',serviceDate:m+'-15',competence:m,revenue,cost,knownCost:cost,costSource:'estimated',estimateVersion:1,projected:false};services.push(s);
  const es=[{id:'rent-'+m,categoryId:'demo-rent',categoryName:'Aluguel',description:'Aluguel fictício',amountCents:200000,costType:'fixed',status:'paid',paidAt:m+'-05',dueDate:m+'-05',nature:'operating',competence:m,supplier:'Fornecedor fictício',ruleId:'demo-recurring'},{id:'marketing-'+m,categoryId:'demo-marketing',categoryName:'Marketing',description:'Campanha fictícia',amountCents:i%2?400000:200000,costType:'variable',status:'confirmed',nature:'operating',competence:m,supplier:'Agência fictícia'}];
  if(mode==='projected'){const p={...s,proposalId:s.proposalId+'-planned',number:s.number+'-P',client:'Atendimento futuro fictício',revenue:300000,cost:60000,knownCost:60000,projected:true};services.push(p);es.push({id:'planned-'+m,categoryId:'demo-marketing',categoryName:'Marketing',description:'Ação prevista fictícia',amountCents:30000,costType:'variable',status:'planned',nature:'operating',competence:m});}
  expenses.push(...es);const tax={rateBps:600,originalRateBps:600,manualCents:null,source:'estimated',competence:m};periods.push({competence:m,...aggregate(services.filter(s=>s.competence===m),es,tax),tax});
 }
 const total={};for(const k of ['gross','deductions','taxCents','taxEstimated','otherDeductions','net','cost','knownCost','contribution','opex','investment','result','missingCosts','serviceCount','estimatedCount','actualCount','fixedExpenses','variableExpenses'])total[k]=sum(periods.map(p=>p[k]));
 total.operatingMargin=ratio(total.result,total.net);total.contributionPercent=ratio(total.contribution,total.net);
 return {private:true,demo:true,from,to,mode,total,periods,services,expenses,composition:[{id:'demo-rent',name:'Aluguel',amountCents:sum(expenses.filter(e=>e.categoryId==='demo-rent').map(e=>e.amountCents))},{id:'demo-marketing',name:'Marketing',amountCents:sum(expenses.filter(e=>e.categoryId==='demo-marketing').map(e=>e.amountCents))}],comparison:{changes:{},total:{},from:'',to:''},missingDates:[],dateInferredCount:0};
}
