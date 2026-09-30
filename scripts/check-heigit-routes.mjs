import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Repository,hash} from '../backend/database.js';
import {migrateFinance} from '../backend/finance-migration.js';
import {RouteCache} from '../backend/route-cache.js';
import {HeiGITPeliasGeocoder,HeiGITOpenRouteServiceProvider} from '../backend/routes-provider.js';
import {addressKey,calculateEstimate,defaultEstimateInput,defaultFinancialSettings,snapshotAssumptions} from '../backend/finance-domain.js';
import {modelo} from '../utils/proposta.js';
import {settings as company,fees} from './test-company.mjs';

const headers=values=>({get:name=>values[name.toLowerCase()]??null});
let geocodeCalls=0,directionsCalls=0;
const geocoder=new HeiGITPeliasGeocoder({apiKey:'HEIGIT-TEST-KEY',fetcher:async(url,request)=>{
 geocodeCalls++;assert.equal(url.origin,'https://api.heigit.org');assert.equal(url.pathname,'/pelias/v1/search');assert.equal(request.method,'GET');assert.equal(request.headers.Authorization,'HEIGIT-TEST-KEY');assert.equal(url.searchParams.get('boundary.country'),'BR');
 const text=url.searchParams.get('text');const coordinates=text.includes('Empresa')?[-46.7001,-23.5001]:[-46.8002,-23.6002];
 return {ok:true,status:200,headers:headers({'x-ratelimit-limit':'1000','x-ratelimit-remaining':'999','x-ratelimit-reset':'12345'}),json:async()=>({features:[{geometry:{coordinates},properties:{label:text,confidence:0.9}}]})};
}});
const routes=new HeiGITOpenRouteServiceProvider({apiKey:'HEIGIT-TEST-KEY',fetcher:async(url,request)=>{
 directionsCalls++;assert.equal(url.origin,'https://api.heigit.org');assert.equal(url.pathname,'/openrouteservice/v2/directions/driving-car');assert.equal(request.method,'POST');assert.equal(request.headers.Authorization,'HEIGIT-TEST-KEY');
 const body=JSON.parse(request.body);assert.deepEqual(body,{coordinates:[[-46.7001,-23.5001],[-46.8002,-23.6002]]});
 return {ok:true,status:200,headers:headers({'x-ratelimit-limit':'2000','x-ratelimit-remaining':'1999','x-ratelimit-reset':'12345'}),json:async()=>({routes:[{summary:{distance:18000,duration:2400}}]})};
}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heigit-routes-')),repo=new Repository(dir);migrateFinance(repo);
try{
 const cache=new RouteCache(repo,routes,{geocoder,directionsDailyLimit:10,geocodingDailyLimit:10,ttlHours:24});
 const origin='Empresa, Rua Um, 10, São Paulo - SP, Brasil',destination='Cliente, Rua Dois, 20, Osasco - SP, Brasil';
 const first=await cache.get(origin,destination,{originRef:{type:'company',id:'operational'},destinationRef:{type:'proposal',id:'proposal-a'}});
 assert.equal(first.cached,false);assert.equal(first.provider,'heigit_ors');assert.equal(first.oneWayDistanceMeters,18000);assert.deepEqual(first.originCoordinatesSnapshot,{longitude:-46.7001,latitude:-23.5001});assert.deepEqual(first.destinationCoordinatesSnapshot,{longitude:-46.8002,latitude:-23.6002});assert.equal(geocodeCalls,2);assert.equal(directionsCalls,1);
 const cached=await cache.get('  EMPRESA, Rua Um, 10, São Paulo - SP, Brasil ','Cliente, Rua Dois, 20, Osasco - SP, Brasil',{originRef:{type:'company',id:'operational'},destinationRef:{type:'proposal',id:'proposal-a'}});
 assert.equal(cached.cached,true);assert.equal(geocodeCalls,2);assert.equal(directionsCalls,1);
 const forced=await cache.get(origin,destination,{force:true,originRef:{type:'company',id:'operational'},destinationRef:{type:'proposal',id:'proposal-a'}});
 assert.equal(forced.cached,false);assert.equal(geocodeCalls,2);assert.equal(directionsCalls,2);
 await cache.rememberCompany(origin);assert.equal(geocodeCalls,2);
 const changed='Cliente, Rua Três, 30, Osasco - SP, Brasil';await cache.get(origin,changed,{originRef:{type:'company',id:'operational'},destinationRef:{type:'proposal',id:'proposal-a'}});assert.equal(geocodeCalls,3);assert.equal(directionsCalls,3);
 const status=cache.status();assert.equal(status.usage.directionsExternal,3);assert.equal(status.usage.geocodingExternal,3);assert.ok(status.usage.cacheHits>=3);assert.equal(status.usage.manualRecalculations,1);assert.equal(status.quotas.find(x=>x.kind==='directions').remaining,1999);
 const q=modelo.quote({...company,terms:fees});q.client='Teste';q.address=destination;q.items=[{...modelo.item('Sofá'),price:200}];
 const assumptions=snapshotAssumptions({...defaultFinancialSettings(),roundTrip:true,vehicle:{...defaultFinancialSettings().vehicle,consumptionCentiKmL:1150,fuelPriceCents:600}},q.company);
 const estimate=calculateEstimate(q,assumptions,{...defaultEstimateInput(),distanceMode:'automatic',routeId:first.id},{distanceMeters:18000,durationSeconds:2400});
 assert.equal(estimate.distanceMeters,18000);assert.equal(estimate.totalDistanceMeters,36000);
 await assert.rejects(new HeiGITOpenRouteServiceProvider({apiKey:'x',fetcher:async()=>({ok:false,status:429,headers:headers({}),json:async()=>({})})}).route({longitude:0,latitude:0},{longitude:1,latitude:1}),e=>e.status===429);
 for(const statusCode of [401,403,500])await assert.rejects(new HeiGITOpenRouteServiceProvider({apiKey:'x',fetcher:async()=>({ok:false,status:statusCode,headers:headers({}),json:async()=>({})})}).route({longitude:0,latitude:0},{longitude:1,latitude:1}),e=>e.status===503);
 await assert.rejects(new HeiGITPeliasGeocoder({apiKey:'x',fetcher:async()=>{const error=Error('timeout');error.name='TimeoutError';throw error;}}).geocode(origin),e=>e.status===503);
 await assert.rejects(new HeiGITOpenRouteServiceProvider().route({longitude:0,latitude:0},{longitude:1,latitude:1}),e=>e.status===503);
 const manual=calculateEstimate(q,assumptions,{...defaultEstimateInput(),distanceMode:'manual',manualDistanceMeters:18000});assert.equal(manual.totalDistanceMeters,36000);
 const retryOrigin='Empresa Retry, Rua Um, 10, São Paulo - SP, Brasil',retryDestination='Cliente Retry, Rua Quatro, 40, Osasco - SP, Brasil';
 let retryGeocodes=0,retryDirections=0;
 const retryGeocoder={id:'retry-geocoder',configured:true,geocode:async address=>{retryGeocodes++;return {coordinates:address.includes('Empresa')?{longitude:-46.7,latitude:-23.5}:{longitude:-46.8,latitude:-23.6}};}};
 const retryProvider={id:'retry-routes',configured:true,route:async()=>{retryDirections++;return {distanceMeters:retryDirections===1?0:9600,durationSeconds:retryDirections===1?0:1200,provider:'retry-routes'};}};
 const retryCache=new RouteCache(repo,retryProvider,{geocoder:retryGeocoder,directionsDailyLimit:10,geocodingDailyLimit:10});
 const retried=await retryCache.get(retryOrigin,retryDestination,{originRef:{type:'company',id:'retry-company'},destinationRef:{type:'proposal',id:'retry-proposal'}});
 assert.equal(retried.distanceMeters,9600);assert.equal(retryDirections,2);assert.equal(retryGeocodes,4);
 const cachedDestination='Cliente Cache, Rua Cinco, 50, Osasco - SP, Brasil',cachedKey=hash(JSON.stringify([retryProvider.id,addressKey(retryOrigin),addressKey(cachedDestination),{profile:'driving-car'}]));
 repo.db.prepare('INSERT INTO finance_routes VALUES (?,?,?,?)').run('legacy-zero-route',cachedKey,JSON.stringify({id:'legacy-zero-route',distanceMeters:0,durationSeconds:0}),new Date().toISOString());
 const rebuilt=await retryCache.get(retryOrigin,cachedDestination,{originRef:{type:'company',id:'retry-company'},destinationRef:{type:'proposal',id:'retry-cache'}});
 assert.equal(rebuilt.distanceMeters,9600);assert.equal(retryDirections,3);assert.equal(repo.db.prepare('SELECT id FROM finance_routes WHERE id=?').get('legacy-zero-route'),undefined);
 console.log('PASS: HeiGIT Pelias/openrouteservice, ordem longitude-latitude, cache, recálculo, quotas, erros e ida/volta.');
}finally{repo.close();fs.rmSync(dir,{recursive:true,force:true});}
