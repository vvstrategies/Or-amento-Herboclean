import crypto from 'node:crypto';
import {addressKey} from './finance-domain.js';
import {integrationError} from './integration-domain.js';

const day=()=>new Date().toISOString().slice(0,10);
const validAddress=value=>{
 if(typeof value!=='string'||!value.trim()||value.length>800)throw integrationError('INVALID_ADDRESS',400);
 return value.trim().replace(/\s+/g,' ');
};
const safeCoordinates=value=>{
 const longitude=Number(value?.longitude),latitude=Number(value?.latitude);
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude<-180||longitude>180||latitude<-90||latitude>90)throw integrationError('INVALID_DATA');
 return {longitude,latitude};
};
const parse=row=>row?JSON.parse(row.data):null;

/** Persistent cache for neutral address → coordinate records. */
export class GeocodingCache {
 constructor(repo,provider,{dailyLimit=100}={}){
  this.repo=repo;this.provider=provider;this.dailyLimit=Number.isInteger(dailyLimit)&&dailyLimit>0?Math.min(dailyLimit,10000):100;this.pending=new Map();
 }
 metric(kind){const today=day();this.repo.db.prepare('INSERT INTO finance_route_metrics (day,kind,count,updated_at) VALUES (?,?,1,?) ON CONFLICT(day,kind) DO UPDATE SET count=count+1,updated_at=excluded.updated_at').run(today,kind,new Date().toISOString());}
 quota(provider,value){if(!value||[value.limit,value.remaining,value.reset].every(v=>v===null||v===undefined))return;this.repo.db.prepare('INSERT INTO finance_route_quota (provider,kind,limit_value,remaining,reset_value,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(provider,kind) DO UPDATE SET limit_value=excluded.limit_value,remaining=excluded.remaining,reset_value=excluded.reset_value,updated_at=excluded.updated_at').run(provider,'geocoding',value.limit??null,value.remaining??null,value.reset??null,new Date().toISOString());}
 usage(){return this.repo.db.prepare('SELECT kind,count FROM finance_route_metrics WHERE day=?').all(day()).reduce((out,row)=>({...out,[row.kind]:row.count}),{});}
 subject(type,id){return parse(this.repo.db.prepare('SELECT data FROM finance_geocodes WHERE subject_type=? AND subject_id=?').get(type,id));}
 save(type,id,key,value){this.repo.db.prepare('INSERT INTO finance_geocodes (id,geocode_key,subject_type,subject_id,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(subject_type,subject_id) DO UPDATE SET geocode_key=excluded.geocode_key,data=excluded.data,created_at=excluded.created_at').run(crypto.randomUUID(),key,type,id,JSON.stringify(value),new Date().toISOString());}
 async get(address,{subjectType='address',subjectId=null,force=false}={}){
  const snapshot=validAddress(address),key=addressKey(snapshot),id=String(subjectId||key).slice(0,240),subject=String(subjectType||'address').slice(0,80);
  const saved=this.subject(subject,id);
  if(!force&&saved?.addressKey===key){this.metric('geocoding_cache_hit');return {...saved,cached:true};}
  const shared=this.subject('address',key);
  if(!force&&shared?.addressKey===key){const value={...shared,addressSnapshot:snapshot,cachedAt:new Date().toISOString()};this.save(subject,id,key,value);this.metric('geocoding_cache_hit');return {...value,cached:true};}
  if(!this.provider?.configured)throw Object.assign(integrationError('NOT_CONFIGURED',503),{message:'Cálculo automático de distância não configurado. Informe a distância manualmente.'});
  const pendingKey=[key,force?'force':'standard'].join(':');
  if(this.pending.has(pendingKey))return this.pending.get(pendingKey);
  const task=(async()=>{
   const used=this.repo.db.prepare("SELECT count FROM finance_route_metrics WHERE day=? AND kind='geocoding_external'").get(day())?.count||0;
   if(used>=this.dailyLimit)throw integrationError('QUOTA',429);
   try{
    const result=await this.provider.geocode(snapshot),coordinates=safeCoordinates(result.coordinates),value={addressKey:key,addressSnapshot:snapshot,coordinates,provider:result.provider||this.provider.id,geocodedAt:result.geocodedAt||new Date().toISOString(),label:typeof result.label==='string'?result.label:'',confidence:Number.isFinite(result.confidence)?result.confidence:null};
    this.metric('geocoding_external');this.quota(value.provider,result.quota);this.save('address',key,key,value);this.save(subject,id,key,value);return {...value,cached:false};
   }catch(error){this.metric('geocoding_error');throw error;}
  })();
  this.pending.set(pendingKey,task);try{return await task}finally{this.pending.delete(pendingKey);}
 }
 async rememberCompany(address){if(typeof address!=='string'||!address.trim())return null;return this.get(address,{subjectType:'company',subjectId:'operational'});}
}