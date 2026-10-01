import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../backend/app.js';
import {modelo} from '../utils/proposta.js';
import {cleanQuote,documentHash,Repository} from '../backend/database.js';
import {gerarPDFEcoclean} from '../utils/ecocleanPdf.js';
import {defaultFinancialSettings,validateFinancialSettings,defaultEstimateInput,validateEstimateInput,snapshotAssumptions,calculateEstimate,roundRatio,quotedRevenue} from '../backend/finance-domain.js';
import {HeiGITOpenRouteServiceProvider} from '../backend/routes-provider.js';
import {financialDemo} from '../backend/finance-demo.js';
import {settings as companySettings,fees} from './test-company.mjs';

const settings={...defaultFinancialSettings(),defaultMaterialBps:2000,vehicle:{id:'default',name:'Fiat Mobi',fuelType:'gasoline',consumptionCentiKmL:1150,fuelPriceCents:619,additionalCostPerKmCents:30}};
function quote(){const q=modelo.quote({...companySettings,terms:fees});q.company.name='BlueCare';q.company.location='Carapicuíba';q.client='Cliente fictício';q.address='Osasco';q.items=[{...modelo.item('Sofá'),price:400}];return q;}
const q=quote(),a=snapshotAssumptions(settings,q.company),input={...defaultEstimateInput(),manualDistanceMeters:18000};
assert.deepEqual(validateFinancialSettings(settings),settings);
const result=calculateEstimate(q,a,input);
assert.equal(result.revenue,40000);assert.equal(result.materialCost,8000);assert.equal(result.fuelCost,1938);assert.equal(result.vehicleOperatingCost,1080);
assert.equal(result.totalDirectCost,11018);assert.equal(result.contributionMargin,28982);assert.equal(result.contributionMarginPercent,72.46);
assert.equal(result.paymentFeeCost,0);assert.ok(modelo.totals(q).total>quotedRevenue(q));
assert.equal(roundRatio(1005n,10n),101);
const mixed=quote();mixed.items=[{...modelo.item('Sofá'),price:300},{...modelo.item('Impermeabilização'),price:500}];
assert.equal(calculateEstimate(mixed,{...a,serviceMaterialBps:{'Sofá':1500,'Impermeabilização':2700}},{...input,considerTravel:false}).materialCost,18000);
const zero=quote();zero.items[0].price=0;assert.equal(calculateEstimate(zero,a,{...input,considerTravel:false}).contributionMarginPercent,null);
const negative=calculateEstimate(q,a,{...input,materialOverrideCents:50000});assert.ok(negative.contributionMargin<0);assert.ok(negative.contributionMarginPercent<0);
const manual=calculateEstimate(q,a,{...input,materialOverrideCents:7300});assert.equal(manual.materialCost,7300);assert.equal(manual.estimatedMaterialCost,8000);assert.equal(manual.materialSource,'manual');
assert.equal(calculateEstimate(q,a,{...input,considerTravel:false}).fuelCost,0);
assert.equal(calculateEstimate(q,{...a,roundTrip:false},input).totalDistanceMeters,18000);
assert.equal(calculateEstimate(q,snapshotAssumptions(defaultFinancialSettings(),q.company),defaultEstimateInput()).contributionMargin,null);
for(const bad of [
 {...settings,defaultMaterialBps:-1},{...settings,defaultMaterialBps:10001},
 {...settings,vehicle:{...settings.vehicle,consumptionCentiKmL:0}},
 {...settings,vehicle:{...settings.vehicle,fuelPriceCents:-1}}
])assert.throws(()=>validateFinancialSettings(bad));
assert.throws(()=>validateEstimateInput({...input,tollCents:-1}));
assert.throws(()=>validateEstimateInput({...input,manualDistanceMeters:Infinity}));
assert.throws(()=>validateEstimateInput({...input,otherDirectCosts:[{description:'',amountCents:0}]}));
assert.equal(financialDemo().latest.result.contributionMargin,28982);

// Contract of the HeiGIT/openrouteservice adapter, without real calls or credentials.
let externalCalls=0;
const provider=new HeiGITOpenRouteServiceProvider({apiKey:'test-key-not-real',fetcher:async(url,request)=>{
 externalCalls++;assert.equal(url.href,'https://api.heigit.org/openrouteservice/v2/directions/driving-car');
 assert.equal(request.headers.Authorization,'test-key-not-real');
 const body=JSON.parse(request.body);assert.deepEqual(body,{coordinates:[[-46.7,-23.5],[-46.8,-23.6]]});
 return {ok:true,status:200,headers:{get:()=>null},json:async()=>({routes:[{summary:{distance:18000,duration:2880}}]})};
}});
const officialRoute=await provider.route({longitude:-46.7,latitude:-23.5},{longitude:-46.8,latitude:-23.6});assert.equal(officialRoute.distanceMeters,18000);assert.equal(officialRoute.durationSeconds,2880);assert.equal(officialRoute.provider,'heigit_ors');assert.ok(Number.isFinite(Date.parse(officialRoute.calculatedAt)));assert.equal(externalCalls,1);
await assert.rejects(new HeiGITOpenRouteServiceProvider().route({longitude:0,latitude:0},{longitude:1,latitude:1}),{status:503});
await assert.rejects(new HeiGITOpenRouteServiceProvider({apiKey:'secret',fetcher:async()=>{throw Error('secret')}}).route({longitude:0,latitude:0},{longitude:1,latitude:1}),e=>e.status===503&&!e.message.includes('secret'));

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'universal-finance-')),origin='http://localhost:3196';
const system=createApp({origin,dataDir:dir}),server=system.app.listen(3196,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let cookie='',csrf='';
async function request(url,body,method=body?'POST':'GET',headers={}){return fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});}
async function data(url,body,method){const r=await request(url,body,method),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
try{
 for(const url of ['/api/financial-settings','/api/financial-demo','/api/financial-export','/api/proposals/any/finance'])assert.equal((await request(url)).status,401);
 const setup=await request('/api/setup',{password:'finance-test-password'});cookie=setup.headers.get('set-cookie').split(';')[0];csrf=(await setup.json()).csrf;
 assert.equal((await request('/api/financial-settings')).status,428);
 await data('/api/onboarding',companySettings);
 assert.equal((await request('/api/financial-settings',settings,'PUT',{'X-CSRF-Token':'invalid'})).status,403);
 await data('/api/financial-settings',settings,'PUT');
 let proposal=await data('/api/proposals/'+q.id,q,'PUT'),envelope=()=>({proposalRevision:proposal.revision,expectedVersion:system.finance.latest(q.id)?.version||0,inputs:input});
 assert.equal((await request('/api/proposals/'+q.id+'/finance/route',envelope())).status,503);
 const first=await data('/api/proposals/'+q.id+'/finance',envelope(),'PUT');assert.equal(first.latest.result.contributionMargin,28982);
 const firstSnapshot=structuredClone(first.latest),hashBefore=documentHash(system.repo.proposal(q.id));
 await data('/api/financial-settings',{...settings,defaultMaterialBps:1500},'PUT');
 assert.deepEqual((await data('/api/proposals/'+q.id+'/finance')).latest,firstSnapshot);
 const nextQ=quote();let another=await data('/api/proposals/'+nextQ.id,nextQ,'PUT');
 const fresh=await data('/api/proposals/'+another.id+'/finance',{proposalRevision:another.revision,expectedVersion:0,inputs:input},'PUT');assert.equal(fresh.latest.result.materialCost,6000);
 const recalc=await data('/api/proposals/'+q.id+'/finance',{...envelope(),useCurrentSettings:true},'PUT');
 assert.equal(recalc.latest.result.materialCost,6000);assert.deepEqual(recalc.previous,firstSnapshot);
 assert.equal(documentHash(system.repo.proposal(q.id)),hashBefore);
 assert.equal((await request('/api/proposals/'+q.id+'/finance',{...envelope(),expectedVersion:0},'PUT')).status,409);
 // A manually entered distance is invalidated when the destination changes.
 proposal=await data('/api/proposals/'+q.id,{...proposal,address:'Novo destino B'},'PUT');
 let view=await data('/api/proposals/'+q.id+'/finance');assert.equal(view.stale,true);assert.equal(view.addressChanged,true);
 assert.equal((await request('/api/proposals/'+q.id+'/finance',envelope(),'PUT')).status,409);
 await data('/api/proposals/'+q.id+'/finance',{...envelope(),confirmDistance:true,inputs:{...input,manualDistanceMeters:25000}},'PUT');
 let calls=0;system.finance.provider={configured:true,id:'test-routes',route:async()=>{calls++;return {distanceMeters:18000,durationSeconds:2880}}};
 system.finance.routeCache.provider=system.finance.provider;system.finance.routeCache.geocodes=null;
 const route=await data('/api/proposals/'+q.id+'/finance/route',envelope());assert.equal(route.cached,false);
 assert.equal((await data('/api/proposals/'+q.id+'/finance/route',envelope())).cached,true);assert.equal(calls,1);
 await data('/api/proposals/'+q.id+'/finance',{...envelope(),inputs:{...input,distanceMode:'automatic',routeId:route.id}},'PUT');
 await data('/api/proposals/'+q.id+'/finance');await data('/api/proposals');assert.equal(calls,1);
 proposal=await data('/api/proposals/'+q.id,{...proposal,address:'Destino C'},'PUT');
 const refreshedAfterAddressChange=await data('/api/proposals/'+q.id+'/finance',{...envelope(),inputs:{...input,distanceMode:'automatic',routeId:route.id}},'PUT');
 assert.equal(refreshedAfterAddressChange.latest.result.distanceMeters,18000);assert.ok(calls>=2);
 // Origin changes require a new route/manual acknowledgement as well.
 await data('/api/financial-settings',{...settings,originMode:'custom',originAddress:'Outra base'},'PUT');
 assert.equal((await request('/api/proposals/'+q.id+'/finance',{...envelope(),useCurrentSettings:true},'PUT')).status,409);
 await data('/api/proposals/'+q.id+'/finance',{...envelope(),confirmDistance:true,useCurrentSettings:true},'PUT');
 system.finance.dailyLimit=1;system.finance.routeCache.dailyLimit=1;assert.equal((await request('/api/proposals/'+q.id+'/finance/route',envelope())).status,429);
 // Status freeze: no finance updates or route requests for approved/scheduled/completed/cancelled.
 const last=structuredClone(system.finance.latest(q.id));
 for(const status of ['scheduled','completed','cancelled']){
  system.repo.setOperation({id:q.id,status,schedule:null});
  assert.equal((await request('/api/proposals/'+q.id+'/finance',envelope(),'PUT')).status,409);
  assert.equal((await request('/api/proposals/'+q.id+'/finance/route',envelope())).status,409);
  assert.deepEqual(system.finance.latest(q.id),last);
 }
 system.repo.setOperation({id:q.id,status:'generated',schedule:null});
 // Explicit commercial boundary strips financial fields at every object level.
 const poison={...proposal,materialCost:123,fuelCost:456,contributionMargin:789,internalFinancial:{secret:'PRIVATE-COST-SENTINEL'},company:{...proposal.company,materialCost:999},terms:{...proposal.terms,fuelCost:999},items:proposal.items.map(i=>({...i,contributionMargin:999}))};
 for(const cleaned of [modelo.toPublicProposal(poison),cleanQuote(poison,true)]){
  const json=JSON.stringify(cleaned);for(const key of ['materialCost','fuelCost','contributionMargin','PRIVATE-COST-SENTINEL'])assert.ok(!json.includes(key));
 }
 const render=globalThis.EcoRenderPDF;let rendererInput;
 globalThis.EcoRenderPDF=(doc,cleaned)=>{rendererInput=cleaned;return render(doc,cleaned)};
 try{const file=await gerarPDFEcoclean(poison,{outputDir:dir});assert.equal(fs.readFileSync(file).subarray(0,5).toString(),'%PDF-');}finally{globalThis.EcoRenderPDF=render;}
 for(const key of ['materialCost','fuelCost','contributionMargin','PRIVATE-COST-SENTINEL'])assert.ok(!JSON.stringify(rendererInput).includes(key));
 const pdf=await data('/api/proposals/'+q.id+'/pdf',{revision:proposal.revision});
 assert.ok(!JSON.stringify(system.repo.pdf(pdf.id).snapshot).includes('contributionMargin'));
 const originalPDF=Buffer.from(await(await request(pdf.url)).arrayBuffer());
 await data('/api/proposals/'+q.id+'/finance',{...envelope(),inputs:{...input,materialOverrideCents:7300}},'PUT');
 assert.deepEqual(Buffer.from(await(await request(pdf.url)).arrayBuffer()),originalPDF);
 assert.ok(!JSON.stringify(await data('/api/proposals/'+q.id)).includes('contributionMargin'));
 const demoCount=system.repo.list().length;assert.equal((await data('/api/financial-demo')).latest.result.fuelCost,1938);assert.equal(system.repo.list().length,demoCount);
 const exported=await data('/api/financial-export');assert.equal(exported.private,true);assert.ok(exported.estimates.length>=5);
 const reopened=new Repository(dir);assert.ok(reopened.db.prepare('SELECT count(*) n FROM finance_estimates').get().n>=5);reopened.close();
 await data('/api/logout',{});assert.equal((await request('/api/financial-export')).status,401);
 console.log('PASS: financeiro em centavos, cenário BlueCare, serviço específico, zero/negativos, manual, snapshots, histórico, endereços, cache/cota, fallback, autenticação/CSRF, status imutável, privacidade do PDF e persistência.');
}finally{await new Promise(r=>server.close(r));system.repo.close();}

