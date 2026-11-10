import {integrationError} from './integration-domain.js';
import {fold,parseAddress,pickBest,precisionOf,searchText,streetCore} from './geocode-address.js';

const scoreMatches=(a,b)=>fold(a)===fold(b)||fold(a).includes(fold(b))||fold(b).includes(fold(a));

export const HEIGIT_DEFAULT_BASE_URL='https://api.heigit.org';
const timeoutMs=10000;
const cleanBase=value=>{
 try{
  const url=new URL(value||HEIGIT_DEFAULT_BASE_URL);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('invalid');
  return url.origin;
 }catch{return HEIGIT_DEFAULT_BASE_URL;}
};
const quota=response=>{
 const get=name=>typeof response?.headers?.get==='function'?response.headers.get(name):null;
 const number=name=>{const raw=get(name);const value=raw===null?null:Number(raw);return Number.isFinite(value)&&value>=0?value:null;};
 const reset=number('x-ratelimit-reset');
 return {limit:number('x-ratelimit-limit'),remaining:number('x-ratelimit-remaining'),reset};
};
const requestError=(response,body)=>{
 const status=Number(response?.status)||503;
 if(status===429)return integrationError('QUOTA',429);
 if(status===401||status===403)return integrationError('INVALID_KEY',503);
 if(status===400||status===404)return integrationError(body?.error?.code==='2010'?'NO_ROUTE':'INVALID_ADDRESS',400);
 return integrationError('EXTERNAL',503);
};
const responseBody=async response=>{try{return await response.json();}catch{return {};}};
const coordinates=value=>{
 const longitude=Number(value?.longitude??value?.[0]),latitude=Number(value?.latitude??value?.[1]);
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude<-180||longitude>180||latitude<-90||latitude>90)throw integrationError('INVALID_DATA');
 return {longitude,latitude};
};
const safeAddress=value=>{
 if(typeof value!=='string'||!value.trim()||value.length>800)throw integrationError('INVALID_ADDRESS',400);
 return value.trim().replace(/\s+/g,' ');
};

/** Decoupled contract for providers that turn a full address into coordinates. */
export class GeocodingProvider {
 constructor(){this.id='manual';this.configured=false;}
 async geocode(){throw integrationError('NOT_CONFIGURED',503);}
}

/**
 * Reserva com o Nominatim (OpenStreetMap), usada só quando o Pelias acha apenas bairro/cidade.
 * Política de uso: no máximo 1 consulta por segundo e User-Agent próprio. Só o endereço é enviado.
 */
const NOMINATIM_URL='https://nominatim.openstreetmap.org/search';
let nominatimNext=0;
const nominatimSlot=async()=>{const wait=nominatimNext-Date.now();nominatimNext=Math.max(Date.now(),nominatimNext)+1100;if(wait>0)await new Promise(r=>setTimeout(r,wait));};
export class NominatimGeocoder extends GeocodingProvider {
 constructor({fetcher=fetch,userAgent='orcamentos-geocoder/1.0',throttle=true}={}){super();this.id='nominatim';this.fetcher=fetcher;this.userAgent=userAgent;this.throttle=throttle;this.configured=true;}
 async request(params){
  const url=new URL(NOMINATIM_URL);
  for(const [key,value] of Object.entries(params))if(value)url.searchParams.set(key,value);
  for(const [key,value] of Object.entries({format:'jsonv2',addressdetails:'1',limit:'5',countrycodes:'br','accept-language':'pt-BR'}))url.searchParams.set(key,value);
  if(this.throttle)await nominatimSlot();
  let response;
  try{response=await this.fetcher(url,{method:'GET',signal:AbortSignal.timeout(timeoutMs),redirect:'error',headers:{'User-Agent':this.userAgent,Accept:'application/json'}});}
  catch{return [];}
  if(!response?.ok)return [];
  const body=await responseBody(response);
  return (Array.isArray(body)?body:[]).map(item=>{
   try{
    const a=item.address||{},city=a.city||a.town||a.municipality||a.village||'',state=String(a['ISO3166-2-lvl4']||'').replace(/^BR-/,'');
    const road=a.road||'',neighbourhood=a.suburb||a.neighbourhood||a.quarter||'';
    const layer=a.house_number?'address':(item.category||item.class)==='highway'||road?'street':'locality';
    const label=[road&&(a.house_number?road+', '+a.house_number:road),neighbourhood,city,state].filter(Boolean).join(', ')||String(item.display_name||'');
    return {coordinates:coordinates({longitude:item.lon,latitude:item.lat}),label,confidence:null,properties:{layer,name:road,street:road,housenumber:a.house_number||'',neighbourhood,locality:city,region_a:state,postalcode:a.postcode||'',label}};
   }catch{return null;}
  }).filter(Boolean);
 }
 async geocode(address,{near=null}={}){
  const parsed=parseAddress(safeAddress(address));
  if(!parsed.street||!parsed.city)return null;
  const attempts=[{street:[parsed.number,parsed.street].filter(Boolean).join(' '),city:parsed.city,state:parsed.state,country:'Brasil'},{q:[streetCore(parsed.street),parsed.city,parsed.state].filter(Boolean).join(', ')}];
  let best=null,requests=0;
  for(const params of attempts){
   const candidates=await this.request(params);requests++;
   const pick=pickBest(candidates.filter(c=>['address','street'].includes(precisionOf(c.properties.layer))),parsed,{near});
   if(pick&&(!best||pick.score>best.score))best={...pick,query:params.q?'osm-street-name':'osm-structured'};
   if(best)break;
  }
  if(!best)return null;
  const city=best.properties.locality;
  if(city&&!scoreMatches(city,parsed.city))return null;
  const precision=precisionOf(best.properties.layer);
  return {coordinates:best.coordinates,label:best.label,confidence:null,precision,layer:best.properties.layer,approximate:false,query:best.query,requests,provider:this.id,geocodedAt:new Date().toISOString(),quota:null};
 }
}

/** Server-side Pelias client. Only the address is sent to HeiGIT. */
export class HeiGITPeliasGeocoder extends GeocodingProvider {
 constructor({apiKey='',baseUrl=HEIGIT_DEFAULT_BASE_URL,fetcher=fetch,fallback=null}={}){
  super();this.id='heigit_pelias';this.apiKey=String(apiKey||'').trim();this.baseUrl=cleanBase(baseUrl);this.fetcher=fetcher;this.fallback=fallback;this.configured=!!this.apiKey;
 }
 async request(path,params,near){
  const url=new URL('/pelias/v1/'+path,this.baseUrl);
  for(const [key,value] of Object.entries(params))if(value)url.searchParams.set(key,value);
  url.searchParams.set('size','8');url.searchParams.set('lang','pt');url.searchParams.set('boundary.country','BR');
  if(near){url.searchParams.set('focus.point.lat',String(near.latitude));url.searchParams.set('focus.point.lon',String(near.longitude));}
  let response;
  try{response=await this.fetcher(url,{method:'GET',signal:AbortSignal.timeout(timeoutMs),redirect:'error',headers:{Authorization:this.apiKey,Accept:'application/json'}});}
  catch(error){throw integrationError(['TimeoutError','AbortError'].includes(error?.name)?'TIMEOUT':'EXTERNAL',503);}
  const body=await responseBody(response);
  if(!response?.ok)throw requestError(response,body);
  const candidates=(Array.isArray(body.features)?body.features:[]).map(feature=>{
   try{
    const point=coordinates(feature?.geometry?.coordinates),properties=feature?.properties||{},confidence=Number(properties.confidence);
    return {coordinates:point,label:typeof properties.label==='string'?properties.label:'',confidence:Number.isFinite(confidence)?confidence:null,properties};
   }catch{return null;}
  }).filter(Boolean);
  return {candidates,quota:quota(response)};
 }
 /**
  * Tenta, nesta ordem e só enquanto o ponto for impreciso: texto normalizado,
  * busca estruturada e "rua, cidade". Escolhe pelo que o endereço cita (cidade,
  * bairro, UF, CEP, número) e desempata pela proximidade da sede (`near`).
  */
 async geocode(address,{near=null}={}){
  const query=safeAddress(address);
  if(!this.configured)throw integrationError('NOT_CONFIGURED',503);
  const parsed=parseAddress(query),attempts=[{path:'search',params:{text:searchText(parsed)||query},kind:'text'}];
  if(parsed.street&&parsed.city){
   attempts.push({path:'search/structured',params:{address:[parsed.street,parsed.number].filter(Boolean).join(' '),neighbourhood:parsed.neighborhood,locality:parsed.city,region:parsed.state,postalcode:parsed.postalCode,country:'BRA'},kind:'structured'});
   attempts.push({path:'search',params:{text:[parsed.street,parsed.city+(parsed.state?' - '+parsed.state:'')].join(', ')},kind:'street'});
   // Último recurso: só o nome da rua na cidade, entre ruas ("Fazendinha" acha "Estrada da Fazendinha").
   const core=streetCore(parsed.street);
   if(core&&fold(core)!==fold(parsed.street))attempts.push({path:'search',params:{text:[core,parsed.city+(parsed.state?' - '+parsed.state:'')].join(', '),layers:'street'},kind:'street-name'});
  }
  let best=null,lastQuota=null,requests=0;
  for(const attempt of attempts){
   const {candidates,quota:q}=await this.request(attempt.path,attempt.params,near);requests++;lastQuota=q||lastQuota;
   const pick=pickBest(candidates,parsed,{near});
   if(pick&&(!best||pick.score>best.score))best={...pick,query:attempt.kind};
   if(best&&['address','street'].includes(precisionOf(best.properties.layer))&&best.score>=30)break;
  }
  // Pelias só achou bairro/cidade (ou nada): tenta a reserva do OpenStreetMap antes de aceitar o ponto aproximado.
  if(this.fallback&&(!best||!['address','street'].includes(precisionOf(best.properties.layer)))){
   const osm=await this.fallback.geocode(query,{near}).catch(()=>null);
   if(osm)return {...osm,requests,quota:null};
  }
  if(!best)throw integrationError('INVALID_ADDRESS',400);
  const p=best.properties,city=p.locality||p.localadmin||p.county||'';
  // Ponto em outra cidade/UF do que o endereço diz é pior que nenhum ponto.
  if(parsed.city&&city&&!scoreMatches(city,parsed.city))throw Object.assign(integrationError('AMBIGUOUS_ADDRESS',400),{message:`O endereço "${query}" foi localizado em ${city}, não em ${parsed.city}. Confira o endereço ou informe a distância manualmente.`});
  const precision=precisionOf(p.layer);
  return {coordinates:best.coordinates,label:best.label,confidence:best.confidence,precision,layer:p.layer||'',approximate:!['address','street'].includes(precision),query:best.query,requests,provider:this.id,geocodedAt:new Date().toISOString(),quota:lastQuota};
 }
}

/** Decoupled contract for providers that return distance and duration from two points. */
export class RouteProvider {
 constructor(){this.id='manual';this.configured=false;}
 async route(){throw integrationError('NOT_CONFIGURED',503);}
}

/** Architectural fallback used when the attendant chooses manual distance. */
export class ManualRouteProvider extends RouteProvider {
 constructor(){super();this.id='manual';}
}

/** Server-side openrouteservice client hosted by HeiGIT. */
export class HeiGITOpenRouteServiceProvider extends RouteProvider {
 constructor({apiKey='',baseUrl=HEIGIT_DEFAULT_BASE_URL,fetcher=fetch}={}){
  super();this.id='heigit_ors';this.apiKey=String(apiKey||'').trim();this.baseUrl=cleanBase(baseUrl);this.fetcher=fetcher;this.configured=!!this.apiKey;
 }
 async route(origin,destination,{profile='driving-car'}={}){
  if(!this.configured)throw integrationError('NOT_CONFIGURED',503);
  if(profile!=='driving-car')throw integrationError('INVALID_DATA',400);
  const from=coordinates(origin),to=coordinates(destination),url=new URL('/openrouteservice/v2/directions/driving-car',this.baseUrl);
  let response;
  try{response=await this.fetcher(url,{method:'POST',signal:AbortSignal.timeout(timeoutMs),redirect:'error',headers:{Authorization:this.apiKey,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({coordinates:[[from.longitude,from.latitude],[to.longitude,to.latitude]]})});}
  catch(error){throw integrationError(['TimeoutError','AbortError'].includes(error?.name)?'TIMEOUT':'EXTERNAL',503);}
  const body=await responseBody(response);
  if(!response?.ok)throw requestError(response,body);
  const summary=body?.routes?.[0]?.summary,distanceMeters=Math.round(Number(summary?.distance)),durationSeconds=Math.round(Number(summary?.duration));
  if(!Number.isSafeInteger(distanceMeters)||distanceMeters<0||distanceMeters>20000000||!Number.isSafeInteger(durationSeconds)||durationSeconds<0)throw integrationError('INVALID_DATA');
  return {distanceMeters,durationSeconds,provider:this.id,calculatedAt:new Date().toISOString(),quota:quota(response)};
 }
}
