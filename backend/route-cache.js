import crypto from 'node:crypto';
import {hash,fail} from './database.js';
import {addressKey} from './finance-domain.js';
import {integrationError} from './integration-domain.js';
import {GeocodingCache} from './geocoding-cache.js';

const day=()=>new Date().toISOString().slice(0,10);
const validAddress=value=>{
 if(typeof value!=='string'||!value.trim()||value.length>800)throw integrationError('INVALID_ADDRESS',400);
 return value.trim().replace(/\s+/g,' ');
};
const validRoute=result=>{
 if(!Number.isSafeInteger(result?.distanceMeters)||result.distanceMeters<0||result.distanceMeters>20000000||!Number.isSafeInteger(result?.durationSeconds)||result.durationSeconds<0)throw integrationError('INVALID_DATA');
 return result;
};
/** A zero-length route is valid only when the two normalized addresses are the same. */
export const isUnexpectedZeroRoute=(origin,destination,route)=>!!route&&route.distanceMeters===0&&route.durationSeconds===0&&addressKey(origin)!==addressKey(destination);

/** Persistent cache for routes. Finance receives only the normalized distance and duration. */
export class RouteCache {
 constructor(repo,provider,{dailyLimit=100,directionsDailyLimit=dailyLimit,geocoder=null,geocodingDailyLimit=100,ttlHours=24}={}){
  this.repo=repo;this.provider=provider;this.dailyLimit=Number.isInteger(directionsDailyLimit)&&directionsDailyLimit>0?Math.min(directionsDailyLimit,10000):100;
  this.ttlHours=Number.isInteger(ttlHours)&&ttlHours>=1&&ttlHours<=720?ttlHours:24;
  this.geocodes=geocoder?new GeocodingCache(repo,geocoder,{dailyLimit:geocodingDailyLimit}):null;
  this.pending=new Map();
 }
 metric(kind){const today=day();this.repo.db.prepare('INSERT INTO finance_route_metrics (day,kind,count,updated_at) VALUES (?,?,1,?) ON CONFLICT(day,kind) DO UPDATE SET count=count+1,updated_at=excluded.updated_at').run(today,kind,new Date().toISOString());}
 quota(value){if(!value||[value.limit,value.remaining,value.reset].every(v=>v===null||v===undefined))return;this.repo.db.prepare('INSERT INTO finance_route_quota (provider,kind,limit_value,remaining,reset_value,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(provider,kind) DO UPDATE SET limit_value=excluded.limit_value,remaining=excluded.remaining,reset_value=excluded.reset_value,updated_at=excluded.updated_at').run(this.provider.id,'directions',value.limit??null,value.remaining??null,value.reset??null,new Date().toISOString());}
 countDirections(){return this.repo.db.prepare('SELECT count FROM finance_route_usage WHERE day=?').get(day())?.count||0;}
 incrementDirections(){this.repo.transaction(()=>{const count=this.countDirections();if(count>=this.dailyLimit)throw integrationError('QUOTA',429);this.repo.db.prepare('INSERT INTO finance_route_usage VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').run(day());this.metric('directions_external');});}
 usage(){return this.repo.db.prepare('SELECT kind,count FROM finance_route_metrics WHERE day=?').all(day()).reduce((out,row)=>({...out,[row.kind]:row.count}),{});}
 quotas(){return this.repo.db.prepare('SELECT provider,kind,limit_value,remaining,reset_value,updated_at FROM finance_route_quota').all().map(row=>({provider:row.provider,kind:row.kind,limit:row.limit_value,remaining:row.remaining,reset:row.reset_value,updatedAt:row.updated_at}));}
 status(){const usage=this.usage(),geocoding=this.geocodes?.usage()||{};return {configured:!!this.provider?.configured&&(!this.geocodes||!!this.geocodes.provider?.configured),provider:this.provider?.id||'manual',geocoder:this.geocodes?.provider?.id||'manual',cacheHours:this.ttlHours,directionsDailyLimit:this.dailyLimit,geocodingDailyLimit:this.geocodes?.dailyLimit||null,usage:{directionsExternal:usage.directions_external||0,geocodingExternal:geocoding.geocoding_external||0,cacheHits:(usage.route_cache_hit||0)+(geocoding.geocoding_cache_hit||0),routeCacheHits:usage.route_cache_hit||0,geocodingCacheHits:geocoding.geocoding_cache_hit||0,errors:(usage.directions_error||0)+(geocoding.geocoding_error||0),manualRecalculations:usage.route_manual_recalculate||0},quotas:this.quotas()};}
 async rememberCompany(address){return this.geocodes?.rememberCompany(address)||null;}
 async get(origin,destination,{travelMode='DRIVE',force=false,originRef=null,destinationRef=null}={}){
  const originSnapshot=validAddress(origin),destinationSnapshot=validAddress(destination);
  if(travelMode!=='DRIVE')throw fail(400,'Somente rotas de carro estão disponíveis.');
  const parameters={profile:'driving-car'},key=hash(JSON.stringify([this.provider.id,addressKey(originSnapshot),addressKey(destinationSnapshot),parameters]));
  const cache=this.repo.db.prepare('SELECT data FROM finance_routes WHERE route_key=? AND created_at>? ORDER BY created_at DESC LIMIT 1').get(key,new Date(Date.now()-this.ttlHours*3600000).toISOString());
  const cached=cache?JSON.parse(cache.data):null;
  if(cached&&!force){
   if(!isUnexpectedZeroRoute(originSnapshot,destinationSnapshot,cached)){this.metric('route_cache_hit');return {...cached,cached:true};}
   // A historic zero route for distinct addresses must never suppress a new lookup.
   this.repo.db.prepare('DELETE FROM finance_routes WHERE id=?').run(cached.id);
  }
  if(!this.provider?.configured)throw Object.assign(integrationError('NOT_CONFIGURED',503),{message:'Cálculo automático de distância não configurado. Informe a distância manualmente.'});
  if(this.geocodes&&!this.geocodes.provider?.configured)throw Object.assign(integrationError('NOT_CONFIGURED',503),{message:'Cálculo automático de distância não configurado. Informe a distância manualmente.'});
  if(this.pending.has(key))return this.pending.get(key);
  const task=(async()=>{
   const started=Date.now();
   try{
    if(force)this.metric('route_manual_recalculate');
    const calculate=async(refreshGeocodes=false)=>{
     let originGeocode=null,destinationGeocode=null,result;
     if(this.geocodes){
      originGeocode=await this.geocodes.get(originSnapshot,{subjectType:originRef?.type||'company',subjectId:originRef?.id||addressKey(originSnapshot),force:refreshGeocodes});
      destinationGeocode=await this.geocodes.get(destinationSnapshot,{subjectType:destinationRef?.type||'proposal',subjectId:destinationRef?.id||addressKey(destinationSnapshot),force:refreshGeocodes});
      this.incrementDirections();
      result=await this.provider.route(originGeocode.coordinates,destinationGeocode.coordinates,parameters);
     }else{
      this.incrementDirections();result=await this.provider.route(originSnapshot,destinationSnapshot,parameters);
     }
     return {originGeocode,destinationGeocode,route:validRoute(result)};
    };
    let calculated=await calculate();
    // A stale geocoding record may put both points in the same place. Refresh both
    // coordinates once before returning a zero result for two distinct addresses.
    if(this.geocodes&&isUnexpectedZeroRoute(originSnapshot,destinationSnapshot,calculated.route))calculated=await calculate(true);
    if(isUnexpectedZeroRoute(originSnapshot,destinationSnapshot,calculated.route))throw Object.assign(integrationError('INVALID_DATA'),{message:'Não foi possível calcular uma rota válida para estes endereços. Confira a origem e o endereço do cliente.'});
    const {originGeocode,destinationGeocode,route}=calculated,at=new Date().toISOString(),value={id:crypto.randomUUID(),provider:route.provider||this.provider.id,routeProvider:route.provider||this.provider.id,origin:originSnapshot,destination:destinationSnapshot,originAddressSnapshot:originSnapshot,destinationAddressSnapshot:destinationSnapshot,originCoordinatesSnapshot:originGeocode?.coordinates||null,destinationCoordinatesSnapshot:destinationGeocode?.coordinates||null,oneWayDistanceMeters:route.distanceMeters,distanceMeters:route.distanceMeters,routeDurationSeconds:route.durationSeconds,durationSeconds:route.durationSeconds,parameters,calculatedAt:route.calculatedAt||at,routeCalculatedAt:route.calculatedAt||at};
    this.quota(route.quota);this.repo.db.prepare('INSERT INTO finance_routes VALUES (?,?,?,?)').run(value.id,key,JSON.stringify(value),at);this.onResult?.({ok:true,durationMs:Date.now()-started});return {...value,cached:false};
   }catch(error){this.metric('directions_error');this.onResult?.({ok:false,error,durationMs:Date.now()-started});throw error;}
  })();
  this.pending.set(key,task);try{return await task}finally{this.pending.delete(key);}
 }
}
