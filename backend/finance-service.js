import crypto from 'node:crypto';
import {RouteCache} from './route-cache.js';
import {fail,hash} from './database.js';
import {migrateFinance} from './finance-migration.js';
import {defaultFinancialSettings,validateFinancialSettings,defaultEstimateInput,validateEstimateInput,calculateEstimate,snapshotAssumptions,financialQuoteKey,addressKey,quotedRevenue,resolveOrigin} from './finance-domain.js';

export class FinanceService{
 constructor(repo,operations,provider,{dailyLimit=100,directionsDailyLimit=dailyLimit,geocoder=null,geocodingDailyLimit=100,routeCacheHours=24}={}){
  this.repo=repo;this.operations=operations;this.provider=provider;this.dailyLimit=Number.isInteger(directionsDailyLimit)&&directionsDailyLimit>0?Math.min(directionsDailyLimit,10000):100;this.pendingRoutes=new Map();
  migrateFinance(repo);
  this.routeCache=new RouteCache(repo,provider,{directionsDailyLimit:this.dailyLimit,geocoder,geocodingDailyLimit,ttlHours:routeCacheHours});
 }
 settings(){return this.repo.config('financial-settings-v1')||defaultFinancialSettings();}
 saveSettings(raw){const settings=validateFinancialSettings(raw);this.repo.setConfig('financial-settings-v1',settings);return settings;}
 company(){return this.repo.config('settings')?.company||{};}
 async rememberCompanyAddress(address){return this.routeCache.rememberCompany(address);}
 versions(id){
  const current=this.repo.currentVersion(id),currentSnapshot=current?.financialSnapshot||null;
  const historical=this.repo.db.prepare('SELECT data FROM finance_estimates WHERE proposal_id=? ORDER BY version DESC').all(id).map(r=>JSON.parse(r.data));
  const related=currentSnapshot?[currentSnapshot,...historical.filter(value=>value.id!==currentSnapshot.id)]:historical;
  return related.slice(0,2);
 }
 latest(id){return this.versions(id)[0]||null;}
 editable(id){return this.repo.operation(id).status==='generated'&&!this.repo.job(id);}
 checkEditable(id){if(!this.editable(id))throw fail(409,'A estimativa está preservada para este atendimento. Só orçamentos em elaboração podem ser recalculados.');}
 view(id){
  const q=this.repo.requireProposal(id),[latest,previous]=this.versions(id),editable=this.editable(id);
  const addressChanged=!!latest&&addressKey(latest.destinationAddressSnapshot)!==addressKey(q.address);
  const stale=!!latest&&latest.quoteKey!==financialQuoteKey(q),routes=this.routeCache.status();
  return {latest:latest||null,previous:previous||null,editable,stale,addressChanged,status:this.repo.operation(id).status,
   currentRevenue:quotedRevenue(q),defaults:this.settings(),currentOrigin:resolveOrigin(this.settings(),this.company()),
   routes};
 }
 assumptions(id,useCurrent){const last=this.latest(id);return !useCurrent&&last?last.assumptions:snapshotAssumptions(this.settings(),this.company());}
 checkVersion(id,body){
  const q=this.repo.requireProposal(id);
  if(Number(body.proposalRevision)!==q.revision)throw fail(409,'O orçamento mudou. Feche e reabra o detalhe.');
  if(Number(body.expectedVersion)!==(this.latest(id)?.version||0))throw fail(409,'A estimativa mudou em outra aba. Feche e reabra o detalhe.');
  return q;
 }
 async record(id,q,assumptions,inputs,route){
  const previous=this.latest(id),result=calculateEstimate(q,assumptions,inputs,route),version=(previous?.version||0)+1,now=new Date().toISOString();
  const value={id:crypto.randomUUID(),proposalId:id,version,kind:'estimate',actual:null,quoteKey:financialQuoteKey(q),proposalRevision:q.revision,
   destinationAddressSnapshot:q.address,assumptions,inputs,routeSnapshot:route,result,calculatedAt:now};
  this.repo.db.prepare('INSERT INTO finance_estimates VALUES (?,?,?,?,?)').run(value.id,id,version,JSON.stringify(value),now);
  if(q.versionId)this.repo.setVersionFinance(id,q.versionId,value);
  return this.view(id);
 }
  automaticReady(q){
    const settings=this.settings(),origin=resolveOrigin(settings,this.company()),rates=settings.serviceMaterialBps||{},vehicle=settings.vehicle||{};
    const materialsReady=q.items.every(item=>Object.hasOwn(rates,item.service)?rates[item.service]!==null:settings.defaultMaterialBps!==null);
  const structuredAddressStarted=!!(q.postalCode||q.addressStreet||q.addressCity||q.addressState);
  const destinationReady=!!q.address&&(!structuredAddressStarted||!!q.addressNumber);
  return !!(this.routeCache.status().configured&&origin&&destinationReady&&materialsReady&&vehicle.consumptionCentiKmL!==null&&vehicle.fuelPriceCents!==null);
 }
 async refreshAutomatically(id,{alreadyLocked=false}={}){
  const run=async()=>{
   this.checkEditable(id);const q=this.repo.requireProposal(id),previous=this.latest(id),quoteKey=financialQuoteKey(q);
   if(previous?.quoteKey===quoteKey&&previous.result?.complete)return this.view(id);
   if(!this.automaticReady(q))return this.view(id);
   const assumptions=snapshotAssumptions(this.settings(),this.company());
   const inputs=previous?structuredClone(previous.inputs):defaultEstimateInput();
   if(!inputs.considerTravel)return this.record(id,q,assumptions,validateEstimateInput(inputs),null);
   inputs.distanceMode='automatic';inputs.manualDistanceMeters=null;inputs.routeId=null;
   let route;
   try{route=await this.routeCache.get(assumptions.originAddressSnapshot,q.address,{originRef:{type:'company',id:'operational'},destinationRef:{type:'proposal',id}});}
   catch{return this.view(id);}
   inputs.routeId=route.id;
   return this.record(id,q,assumptions,validateEstimateInput(inputs),route);
  };
  return alreadyLocked?run():this.operations.locked(id,run);
 }
 async calculate(id,body){return this.operations.locked(id,async()=>{
  this.checkEditable(id);const q=this.checkVersion(id,body),assumptions=this.assumptions(id,body.useCurrentSettings===true),inputs=validateEstimateInput(body.inputs||defaultEstimateInput());
  let route=null;
  if(inputs.considerTravel&&inputs.distanceMode==='automatic'){
   const row=this.repo.db.prepare('SELECT data FROM finance_routes WHERE id=?').get(inputs.routeId||'');
   route=row?JSON.parse(row.data):null;
   if(!route||addressKey(route.origin)!==addressKey(assumptions.originAddressSnapshot)||addressKey(route.destination)!==addressKey(q.address))throw fail(409,'A rota nÃ£o corresponde aos endereÃ§os atuais. Recalcule o deslocamento ou informe a distÃ¢ncia manualmente.');
  }
  const previous=this.latest(id);
  if(inputs.considerTravel&&inputs.distanceMode==='manual'&&previous&&(addressKey(previous.destinationAddressSnapshot)!==addressKey(q.address)||addressKey(previous.assumptions.originAddressSnapshot)!==addressKey(assumptions.originAddressSnapshot))&&body.confirmDistance!==true)throw fail(409,'O endereÃ§o de origem ou destino mudou. Confirme novamente a distÃ¢ncia manual para este destino.');
  return this.record(id,q,assumptions,inputs,route);
 });}
 async route(id,body){return this.operations.locked(id,async()=>{
  this.checkEditable(id);const q=this.checkVersion(id,body),a=this.assumptions(id,body.useCurrentSettings===true),origin=a.originAddressSnapshot,destination=q.address;
  if(!origin||!destination)throw fail(400,'Informe a origem nas configurações e o endereço do atendimento.');
  const route=await this.routeCache.get(origin,destination,{force:body.force===true,originRef:{type:'company',id:'operational'},destinationRef:{type:'proposal',id}});
  this.checkVersion(id,body);this.checkEditable(id);return route;
 });}
}
