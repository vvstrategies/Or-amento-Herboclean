import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../backend/app.js';
import {Repository} from '../backend/database.js';
import {migrateServiceCatalog} from '../backend/service-catalog.js';
import {initializeInstallation,finishSetup} from '../backend/onboarding.js';
import {passwordHash,checkPassword} from '../backend/security.js';
import {modelo} from '../utils/proposta.js';
import {settings,image} from './test-company.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'universal-onboarding-'));
const origin='http://localhost:3197',system=createApp({origin,dataDir:dir});
const server=system.app.listen(3197,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let cookie='',csrf='';
async function request(url,body,method=body?'POST':'GET'){
 return fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual'});
}
async function data(url,body,method){const r=await request(url,body,method),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v}
try{
 const state=await data('/api/session');assert.equal(state.needsSetup,true);assert.equal(state.authenticated,false);
 const html=await(await request('/')).text();assert.ok(html.includes('Herboclean | Orçamentos e agendamentos'));
 // Logos desta instalação consolidada são assets públicos; isolamento é testado na base universal.
 assert.equal((await request('/api/onboarding')).status,401);
 const created=await request('/api/setup',{password:'universal-admin-test'});assert.equal(created.status,200);cookie=created.headers.get('set-cookie').split(';')[0];csrf=(await created.json()).csrf;
 assert.equal((await data('/api/session')).needsCompanySetup,true);
 const initial=await data('/api/onboarding');
 assert.equal(initial.settings.services.length,10);for(const s of initial.settings.services)assert.equal(s.unit,['Tapete','Limpeza de carpete'].includes(s.name)?'m²':'un.');assert.ok(initial.settings.services.some(s=>s.name==='Poltronas'));assert.equal(initial.required,true);assert.equal(initial.settings.company.name,'');assert.equal(initial.settings.company.logo,'');assert.equal(initial.settings.company.location,'');assert.equal(initial.settings.company.intro,'');assert.equal(initial.settings.terms.rate6,3.49);assert.equal(initial.settings.terms.fixedFee,.49);assert.equal(initial.settings.terms.installments,3);assert.equal(initial.settings.services[0].name,'Limpeza de carpete');
 for(const [url,body,method] of [
  ['/api/settings'],['/api/proposals'],['/api/pdfs/anything'],['/api/draft'],['/api/google/status'],['/api/backup'],
  ['/api/settings',settings,'PUT'],['/api/import',{version:4,proposals:[]}],['/api/google/connect',{}],
  ['/api/proposals/test/schedule',{}],['/api/preview-pdf',{}]
 ])assert.equal((await request(url,body,method)).status,428,url);
 for(const bad of [
  {...settings,company:{...settings.company,name:''}},
  {...settings,company:{...settings.company,phone:'',email:''}},
  {...settings,company:{...settings.company,primaryColor:'red'}},
  {...settings,company:{...settings.company,website:'javascript:alert(1)'}},
  {...settings,company:{...settings.company,logo:'data:image/png;base64,YWJjZA=='}},
  {...settings,company:{...settings.company,useInitials:false}},
  {...settings,services:[]},{...settings,services:[{name:' '}]},
  {...settings,terms:{...settings.terms,rate6:-1}}
 ])assert.equal((await request('/api/onboarding',bad)).status,400);
 assert.equal((await data('/api/onboarding')).required,true);
 await data('/api/logout',{});assert.equal((await request('/api/settings')).status,401);
 const login=await request('/api/login',{password:'universal-admin-test'});cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 assert.equal((await data('/api/onboarding')).required,true);
 const chosen={...settings,company:{...settings.company,logo:image}};
 const results=await Promise.all([request('/api/onboarding',chosen),request('/api/onboarding',chosen)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await data('/api/session')).needsCompanySetup,false);
 assert.equal((await data('/api/settings')).company.name,settings.company.name);
 modelo.configure(chosen);let q=modelo.quote(chosen);q.client='Cliente de teste';q.address='Endereço de teste';q.items[0].price=200;
 q=await data('/api/proposals/'+q.id,q,'PUT');await data('/api/draft',{id:'current',quote:q},'PUT');
 const pdf=await data('/api/proposals/'+q.id+'/pdf',{revision:q.revision});
 const bytes=Buffer.from(await(await request(pdf.url)).arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const next={...chosen,company:{...chosen.company,name:'Horizonte Engenharia',primaryColor:'#a21caf',accentColor:'#0369a1',logo:''}};
 await data('/api/settings',next,'PUT');
 assert.equal((await data('/api/draft')).quote.company.name,'Horizonte Engenharia');
 assert.equal((await data('/api/proposals/'+q.id)).company.name,chosen.company.name);
 assert.deepEqual(Buffer.from(await(await request(pdf.url)).arrayBuffer()),bytes);
 assert.equal(system.repo.pdf(pdf.id).snapshot.company.primaryColor,chosen.company.primaryColor);
 const backup=await data('/api/backup');await data('/api/import',{...backup,settings:{...chosen,company:{...chosen.company,name:'Outra empresa'}}});
 assert.equal((await data('/api/settings')).company.name,'Horizonte Engenharia');
 const reopen=new Repository(dir);initializeInstallation(reopen);assert.equal(reopen.config('companySetup').completed,true);assert.equal(reopen.config('settings').company.name,'Horizonte Engenharia');assert.equal(reopen.list().length,2);reopen.close();
}finally{await new Promise(r=>server.close(r));system.repo.close()}

// Migration: retained administrator, draft customer/items, proposals and private backup.
const legacyDir=fs.mkdtempSync(path.join(os.tmpdir(),'universal-legacy-')),repo=new Repository(legacyDir);
try{
 const logo=fs.existsSync('data/legacy-brand-assets/herboclean.png')?'data:image/png;base64,'+fs.readFileSync('data/legacy-brand-assets/herboclean.png').toString('base64'):'';
 const old={company:{...modelo.company(),name:'Herboclean Higienização Profissional',phone:'(11) 92612-6244',location:'ABC Paulista',intro:'A Herboclean apresenta seus serviços.',benefits:'Atendimento para empresas e residências\nHigienização de diferentes tipos de estofados e tecidos\nAtendimento no ABC Paulista e em São Paulo',logo,primaryColor:'#044c3a',accentColor:'#a7cf21'},terms:{...modelo.terms(),rate6:3.49,fixedFee:.49,installments:3}};
 repo.setConfig('settings',old);repo.setConfig('adminPassword',await passwordHash('preserved-admin-password'));
 let q=modelo.quote(old);q.client='Cliente preservado';q.address='Local preservado';q.items[0].price=350;q=repo.saveProposal(q);repo.setConfig('draft',{id:'current',quote:q});
 const original=repo.proposal(q.id);initializeInstallation(repo);
 const candidate=repo.config('companySetupDraft');assert.equal(candidate.company.name,'');assert.equal(candidate.company.logo,'');assert.equal(candidate.company.location,'');assert.equal(candidate.company.intro,'');assert.equal(candidate.company.benefits,'');assert.equal(candidate.terms.rate6,3.49);
 assert.ok(await checkPassword('preserved-admin-password',repo.config('adminPassword')));
 assert.deepEqual(repo.config('universal-before-onboarding').settings,old);
 await finishSetup(repo,settings);initializeInstallation(repo);
 assert.deepEqual(repo.proposal(q.id),original);assert.equal(repo.config('draft').quote.client,'Cliente preservado');assert.equal(repo.config('draft').quote.items[0].price,350);assert.equal(repo.config('draft').quote.company.name,settings.company.name);
 assert.ok(await checkPassword('preserved-admin-password',repo.config('adminPassword')));
 const before=structuredClone(repo.config('settings'));
 migrateServiceCatalog(repo);
 const after=repo.config('settings');
 assert.deepEqual(after.company,before.company);assert.deepEqual(after.terms,before.terms);
 assert.ok(after.services.some(s=>s.name==='Consultoria'));assert.equal(after.services.find(s=>s.name==='Poltronas').unit,'un.');
 assert.equal(after.services.find(s=>s.name==='Tapete').unit,'m²');assert.equal(after.services.find(s=>s.name==='Persiana').unit,'un.');
 assert.deepEqual(repo.proposal(q.id),original);assert.equal(repo.config('draft').quote.items[0].price,350);
 migrateServiceCatalog(repo);assert.deepEqual(repo.config('settings'),after);
}finally{repo.close()}
console.log('PASS: onboarding obrigatório, API bloqueada, validação, sessão retomada, configuração concorrente, empresas independentes, PDFs históricos, importação sem trocar identidade e migração preservando dados.');

