import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../backend/app.js';
import {modelo} from '../utils/proposta.js';
import {defaultFinancialSettings} from '../backend/finance-domain.js';
import {settings as companySettings,fees} from './test-company.mjs';

const port=3194,origin='http://localhost:'+port,dir=fs.mkdtempSync(path.join(os.tmpdir(),'auto-finance-'));
let routeCalls=0;
const system=createApp({origin,dataDir:dir,routeProvider:{id:'fixture',configured:true,route:async()=>{routeCalls++;return {distanceMeters:12000,durationSeconds:1800,provider:'fixture'};}}});
const server=system.app.listen(port,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
let cookie='',csrf='';
async function request(url,body,method=body?'POST':'GET'){return fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function data(url,body,method){const response=await request(url,body,method),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
try{
 const setup=await request('/api/setup',{password:'automatic-finance-test'});cookie=setup.headers.get('set-cookie').split(';')[0];csrf=(await setup.json()).csrf;
 await data('/api/onboarding',companySettings);
 const financial={...defaultFinancialSettings(),defaultMaterialBps:2000,vehicle:{id:'default',name:'Veículo teste',fuelType:'gasoline',consumptionCentiKmL:1000,fuelPriceCents:600,additionalCostPerKmCents:25}};
 await data('/api/financial-settings',financial,'PUT');
 const quote=modelo.quote({...companySettings,terms:fees});quote.client='Cliente automático';quote.address='Rua de teste, 100, São Paulo - SP';quote.items=[{...modelo.item('Sofá'),quantity:1,price:200}];
 let saved=await data('/api/proposals/'+quote.id,quote,'PUT'),view=await data('/api/proposals/'+quote.id+'/finance');
 assert.equal(view.stale,false);assert.equal(view.latest.version,1);assert.equal(view.latest.proposalRevision,saved.revision);assert.equal(view.latest.inputs.distanceMode,'automatic');assert.equal(view.latest.result.revenue,20000);assert.equal(view.latest.result.materialCost,4000);assert.equal(view.latest.result.distanceMeters,12000);assert.equal(view.latest.result.complete,true);assert.equal(routeCalls,1);
 const invalidRoute={...structuredClone(view.latest),routeSnapshot:{...view.latest.routeSnapshot,distanceMeters:0,durationSeconds:0},result:{...view.latest.result,distanceMeters:0,totalDistanceMeters:0,fuelCost:0,vehicleOperatingCost:0,travelCost:0,complete:true}};
 system.repo.setVersionFinance(quote.id,saved.versionId,invalidRoute);
 view=await data('/api/proposals/'+quote.id+'/finance/refresh',{});
 assert.equal(view.routeNeedsRefresh,false);assert.equal(view.latest.version,2);assert.equal(view.latest.result.distanceMeters,12000);assert.ok(view.latest.result.fuelCost>0);assert.equal(routeCalls,1);
 const firstPdf=await data('/api/proposals/'+quote.id+'/pdf',{revision:saved.revision});assert.equal(firstPdf.version,1);
 saved=system.repo.saveProposal({...saved,terms:{...saved.terms,notes:'Revisão anterior sem PDF atualizado'}});const repaired=await data('/api/proposals/'+quote.id+'/document/refresh',{});assert.equal(repaired.version,2);
 saved=await data('/api/proposals/'+quote.id,{...saved,items:[{...saved.items[0],quantity:2,price:300}]},'PUT');view=await data('/api/proposals/'+quote.id+'/finance');
 const documents=await data('/api/documents?proposalId='+quote.id);assert.equal(documents.length,3);assert.equal(documents[0].version,3);assert.equal(documents[0].fingerprint,system.repo.listPDFs(quote.id)[0].fingerprint);
 assert.equal(view.stale,false);assert.equal(view.latest.version,3);assert.equal(view.latest.proposalRevision,saved.revision);assert.equal(view.latest.result.revenue,60000);assert.equal(view.latest.result.materialCost,12000);assert.equal(view.latest.result.distanceSource,'automatic');assert.equal(routeCalls,1);assert.equal(view.previous.result.revenue,20000);
 console.log('PASS: orçamento salvo e revisado atualiza PDF, rota, custos e rentabilidade automaticamente, preservando versões anteriores.');
}finally{await new Promise(resolve=>server.close(resolve));system.repo.close();fs.rmSync(dir,{recursive:true,force:true});}
