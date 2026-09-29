import {modelo} from '../utils/proposta.js';
import {fail,hash} from './database.js';

/** @typedef {import('./finance-types').FinancialSettings} FinancialSettings */
/** @typedef {import('./finance-types').EstimateInput} EstimateInput */
/** All money is integer BRL cents; rates are integer basis points; distances are meters. */
export const integer=(v,label,max=1_000_000_000_000,nullable=false)=>{
 if(nullable&&(v===null||v===undefined||v===''))return null;
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)throw fail(400,'Confira '+label+'.');
 return v;
};
const text=(v,n=800)=>typeof v==='string'?v.trim().slice(0,n):'';
export const addressKey=v=>text(v).replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
/** Round rational nonnegative amounts once, half up, using integer arithmetic. */
export function roundRatio(numerator,denominator){
 const a=BigInt(numerator),b=BigInt(denominator);
 if(a<0n||b<=0n)throw fail(400,'Premissa de cálculo inválida.');
 const value=Number((2n*a+b)/(2n*b));
 return integer(value,'o limite do cálculo',Number.MAX_SAFE_INTEGER);
}
/** @returns {FinancialSettings} */
export function defaultFinancialSettings(){
 return {version:1,defaultMaterialBps:null,serviceMaterialBps:{},originMode:'company',originAddress:'',roundTrip:true,
 vehicle:{id:'default',name:'',fuelType:'gasoline',consumptionCentiKmL:null,fuelPriceCents:null,additionalCostPerKmCents:0}};
}
/** @returns {FinancialSettings} */
export function validateFinancialSettings(raw){
 if(!raw||typeof raw!=='object')throw fail(400,'Informe as premissas financeiras.');
 const d=defaultFinancialSettings(),v=raw.vehicle||{},rates={};
 if(raw.serviceMaterialBps&&(!Array.isArray(raw.serviceMaterialBps)&&typeof raw.serviceMaterialBps==='object')){
  const pairs=Object.entries(raw.serviceMaterialBps);if(pairs.length>100)throw fail(400,'Limite de 100 serviços.');
  for(const [name,rate]of pairs){if(!text(name,240))throw fail(400,'Serviço sem nome.');const n=integer(rate,'o percentual do serviço',10000,true);if(n!==null)Object.defineProperty(rates,text(name,240),{value:n,enumerable:true});}
 }else if(raw.serviceMaterialBps)throw fail(400,'Percentuais por serviço inválidos.');
 if(!['company','custom'].includes(raw.originMode)||typeof raw.roundTrip!=='boolean')throw fail(400,'Confira origem e ida e volta.');
 if(raw.originMode==='custom'&&!text(raw.originAddress))throw fail(400,'Informe o endereço de saída.');
 if(!['gasoline','ethanol','diesel','flex'].includes(v.fuelType))throw fail(400,'Selecione o combustível.');
 const consumption=integer(v.consumptionCentiKmL,'o consumo',100000,true);
 if(consumption===0)throw fail(400,'O consumo precisa ser maior que zero.');
 return {...d,defaultMaterialBps:integer(raw.defaultMaterialBps,'o percentual de materiais',10000,true),serviceMaterialBps:rates,
 originMode:raw.originMode,originAddress:text(raw.originAddress),roundTrip:raw.roundTrip,
 vehicle:{id:'default',name:text(v.name,120),fuelType:v.fuelType,consumptionCentiKmL:consumption,
 fuelPriceCents:integer(v.fuelPriceCents,'o preço do combustível',100000,true),additionalCostPerKmCents:integer(v.additionalCostPerKmCents??0,'o custo por km',100000)}};
}
/** @returns {EstimateInput} */
export function defaultEstimateInput(){return {considerTravel:true,materialOverrideCents:null,distanceMode:'manual',manualDistanceMeters:null,routeId:null,tollCents:0,parkingCents:0,otherTravelCents:0,otherDirectCosts:[]};}
/** @returns {EstimateInput} */
export function validateEstimateInput(raw={}){
 if(typeof raw.considerTravel!=='boolean'||!['manual','automatic'].includes(raw.distanceMode))throw fail(400,'Confira o deslocamento.');
 const costs=raw.otherDirectCosts??[];if(!Array.isArray(costs)||costs.length>30)throw fail(400,'Use até 30 custos adicionais.');
 return {considerTravel:raw.considerTravel,materialOverrideCents:integer(raw.materialOverrideCents,'o material manual',1e12,true),
 distanceMode:raw.distanceMode,manualDistanceMeters:integer(raw.manualDistanceMeters,'a distância',20_000_000,true),
 routeId:typeof raw.routeId==='string'?raw.routeId.slice(0,140):null,
 tollCents:integer(raw.tollCents??0,'o pedágio'),parkingCents:integer(raw.parkingCents??0,'o estacionamento'),
 otherTravelCents:integer(raw.otherTravelCents??0,'outros custos de deslocamento'),
 otherDirectCosts:costs.map(c=>{if(!c||!text(c.description,240))throw fail(400,'Descreva cada custo adicional.');return {description:text(c.description,240),amountCents:integer(c.amountCents,'o custo adicional')};})};
}
/** Single source of revenue: commercial PIX/base cents; no second deduction of gross-up fees. */
export function quotedRevenue(q){modelo.validate(q);return integer(modelo.totals(q).pix,'a receita',Number.MAX_SAFE_INTEGER);}
export function financialQuoteKey(q){return hash(JSON.stringify({address:addressKey(q.address),items:q.items.map(i=>({service:i.service,quantity:i.quantity,price:i.price}))}));}
export function resolveOrigin(settings,company){return text(settings.originMode==='company'?company?.location:settings.originAddress);}
export function snapshotAssumptions(settings,company){return {...structuredClone(settings),originAddressSnapshot:resolveOrigin(settings,company)};}
/**
 * @param {object} q Commercial proposal only.
 * @param {FinancialSettings & {originAddressSnapshot:string}} assumptions
 * @param {EstimateInput} input
 * @param {import('./finance-types').RouteSnapshot|null} route
 */
export function calculateEstimate(q,assumptions,input,route=null){
 const revenue=quotedRevenue(q),rows=modelo.totals(q).rows,warnings=[];
 const materialItems=q.items.map((it,index)=>{
  const rate=Object.hasOwn(assumptions.serviceMaterialBps,it.service)?assumptions.serviceMaterialBps[it.service]:assumptions.defaultMaterialBps;
  return {service:it.service,revenue:rows[index],rateBps:rate,estimatedCost:rate===null?null:roundRatio(BigInt(rows[index])*BigInt(rate),10000)};
 });
 const estimatedMaterialCost=materialItems.some(i=>i.estimatedCost===null)?null:materialItems.reduce((s,i)=>s+i.estimatedCost,0);
 const materialCost=input.materialOverrideCents??estimatedMaterialCost;
 if(materialCost===null)warnings.push('Configure o custo de materiais ou informe um valor manual.');
 let distanceMeters=null,durationSeconds=null,source=null,fuelCost=0,vehicleOperatingCost=0,totalDistanceMeters=0,fuelLiters=null;
 if(input.considerTravel){
  if(input.distanceMode==='manual'){distanceMeters=input.manualDistanceMeters;source='manual';}
  else if(route){distanceMeters=route.distanceMeters;durationSeconds=route.durationSeconds;source='automatic';}
  if(distanceMeters===null){fuelCost=null;vehicleOperatingCost=null;totalDistanceMeters=null;warnings.push('Informe a distância até o cliente ou calcule a rota.');}
  else {
   totalDistanceMeters=distanceMeters*(assumptions.roundTrip?2:1);
   const v=assumptions.vehicle;
   vehicleOperatingCost=roundRatio(BigInt(totalDistanceMeters)*BigInt(v.additionalCostPerKmCents),1000);
   if(totalDistanceMeters===0){fuelCost=0;fuelLiters=0;}
   else if(v.consumptionCentiKmL===null||v.fuelPriceCents===null){fuelCost=null;warnings.push('Configure consumo e preço do combustível.');}
   else {fuelLiters=totalDistanceMeters/(10*v.consumptionCentiKmL);fuelCost=roundRatio(BigInt(totalDistanceMeters)*BigInt(v.fuelPriceCents),BigInt(10*v.consumptionCentiKmL));}
  }
 }
 const otherDirectCosts=input.otherDirectCosts.reduce((s,c)=>s+c.amountCents,0),paymentFeeCost=0;
 const travelParts=[fuelCost,vehicleOperatingCost,input.tollCents,input.parkingCents,input.otherTravelCents];
 const travelCost=travelParts.includes(null)?null:travelParts.reduce((s,c)=>s+c,0);
 const parts=[materialCost,...travelParts,otherDirectCosts,paymentFeeCost],knownDirectCost=parts.reduce((s,c)=>s+(c??0),0);
 integer(knownDirectCost,'o custo total',Number.MAX_SAFE_INTEGER);
 const totalDirectCost=parts.includes(null)?null:knownDirectCost,contributionMargin=totalDirectCost===null?null:revenue-totalDirectCost;
 const marginBps=contributionMargin===null||revenue===0?null:Math.sign(contributionMargin)*roundRatio(BigInt(Math.abs(contributionMargin))*10000n,BigInt(revenue));
 return {schemaVersion:1,revenue,revenueBasis:'commercial_pix_base',estimatedMaterialCost,materialCost,materialSource:input.materialOverrideCents===null?'automatic':'manual',materialItems,
 fuelCost,vehicleOperatingCost,tollCost:input.tollCents,parkingCost:input.parkingCents,otherTravelCost:input.otherTravelCents,travelCost,
 paymentFeeCost,otherDirectCosts,totalDirectCost,knownDirectCost,contributionMargin,contributionMarginPercent:marginBps===null?null:marginBps/100,
 distanceMeters,totalDistanceMeters,durationSeconds,distanceSource:source,fuelLiters,complete:warnings.length===0,warnings};
}
