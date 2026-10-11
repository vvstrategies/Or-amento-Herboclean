import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createApp} from '../backend/app.js';
import {Repository,documentHash} from '../backend/database.js';
import {modelo} from '../utils/proposta.js';
import {googleFixture} from './google-fixture.mjs';
import {passwordHash} from '../backend/security.js';
import {settings,image} from './test-company.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ecoclean-tests-')),origin='http://localhost:3198',fixture=googleFixture();
const system=createApp({origin,dataDir:dir,fetcher:fixture.fetch,googleConfig:{clientId:'test-client',clientSecret:'test-secret',redirectURI:origin+'/api/google/callback'}});
const server=system.app.listen(3198,'127.0.0.1');await new Promise(r=>server.once('listening',r));let cookie,csrf;
async function request(url,body,method=body?'POST':'GET',extra={}){return fetch(origin+url,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),'X-CSRF-Token':csrf||'','Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined,redirect:'manual'})}
async function data(url,body,method){const r=await request(url,body,method),value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value}
try{
  assert.equal((await request('/api/proposals')).status,401);
  assert.equal((await request('/api/setup',{password:'ecoclean-test-password'},'POST',{Origin:'https://outside.invalid'})).status,403);
  const setup=await request('/api/setup',{password:'ecoclean-test-password'});assert.equal(setup.status,200);cookie=setup.headers.get('set-cookie').split(';')[0];csrf=(await setup.json()).csrf;
  assert.equal((await request('/api/settings',{},'PUT',{'X-CSRF-Token':'wrong'})).status,403);
  for(const url of ['/data/ecoclean.sqlite','/orcamentos/private.pdf','/%6frcamentos/private.pdf','/backend/app.js','/.env'])assert.equal((await request(url)).status,404,url);
  await data('/api/onboarding',settings);modelo.configure(settings);
  let q=modelo.quote(settings);q.client='Cliente de teste';q.address='Endereço de teste';q.items=[{...modelo.item('Sofá'),price:200,photos:[image]}];
  q=await data('/api/proposals/'+q.id,q,'PUT');assert.equal(q.revision,1);
  const other={...q,client:'Outra aba'};other.revision=0;assert.equal((await request('/api/proposals/'+q.id,other,'PUT')).status,409);
  await data('/api/draft',{id:'current',quote:q},'PUT');assert.equal((await data('/api/draft')).quote.client,q.client);
  let pdf=await data('/api/proposals/'+q.id+'/pdf',{revision:q.revision});assert.equal(pdf.version,1);assert.ok(!('storageKey'in pdf));const bytes=Buffer.from(await(await request(pdf.url)).arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  const key=()=>crypto.randomUUID(),date=new Date(Date.now()+7*86400000).toISOString().slice(0,10),input={key:key(),date,time:'09:00',duration:120,revision:q.revision};
  assert.equal((await request('/api/proposals/'+q.id+'/schedule',input)).status,503);assert.equal(system.repo.operation(q.id).status,'generated');
  const auth=await data('/api/google/connect',{}),state=new URL(auth.url).searchParams.get('state');assert.ok(new URL(auth.url).searchParams.get('code_challenge'));
  assert.equal((await request('/api/google/callback?state=wrong&code=x')).status,302);assert.equal((await request('/api/google/callback?state='+state+'&code=x')).status,302);
  assert.equal((await data('/api/google/status')).connected,true);assert.ok(!system.repo.config('google').includes('test-refresh-secret'));
  assert.equal((await request('/api/google/callback?state='+state+'&code=x')).headers.get('location').includes('google=error'),true);
  fixture.loseUpload=true;assert.equal((await request('/api/proposals/'+q.id+'/schedule',input)).status,502);assert.equal(fixture.files.size,2);assert.equal(system.repo.operation(q.id).status,'generated');
  fixture.loseEvent=true;assert.equal((await request('/api/proposals/'+q.id+'/schedule',input)).status,502);assert.equal(fixture.events.size,1);assert.equal(system.repo.operation(q.id).status,'generated');
  const confirmed=await data('/api/proposals/'+q.id+'/schedule',input);assert.equal(confirmed.status,'scheduled');assert.equal(fixture.events.size,1);assert.equal(fixture.files.size,2);
  assert.deepEqual(await data('/api/proposals/'+q.id+'/schedule',input),confirmed);
  const event=fixture.events.get(confirmed.schedule.eventId);assert.equal(event.location,q.address);assert.equal(event.attachments.length,1);assert.ok(!event.attendees);assert.ok(event.description.includes(q.client));
  const rescheduled=await data('/api/proposals/'+q.id+'/schedule',{...input,key:key(),time:'14:00'});assert.equal(rescheduled.schedule.eventId,confirmed.schedule.eventId);assert.equal(fixture.events.size,1);assert.equal(fixture.files.size,2);
  q=await data('/api/proposals/'+q.id,{...q,client:'Cliente atualizado'},'PUT');const pdf2=await data('/api/proposals/'+q.id+'/pdf',{revision:q.revision});assert.equal(pdf2.version,2);assert.deepEqual(Buffer.from(await(await request(pdf.url)).arrayBuffer()),bytes);
  assert.equal((await request('/api/proposals/'+q.id+'/schedule', {...input,key:key()})).status,409);
  await data('/api/proposals/'+q.id+'/schedule/cancel',{key:key()});assert.equal(fixture.events.size,0);assert.equal(system.repo.operation(q.id).status,'generated');
  const backup=await data('/api/backup');assert.equal(backup.documents.length,2);assert.ok(!JSON.stringify(backup).includes('test-refresh-secret'));
  const imported=await data('/api/import?migration=yes',backup);assert.equal(imported.imported,1);assert.equal((await data('/api/import?migration=yes',backup)).imported,0);
  assert.equal((await request('/api/import',{...backup,documents:[{...backup.documents[0],data:'invalid'}]})).status,400);assert.equal(system.repo.list().length,2);
  const q2=system.repo.proposal(imported.proposals[0].id);fixture.failEvent=true;assert.equal((await request('/api/proposals/'+q2.id+'/schedule',{...input,key:key(),revision:q2.revision})).status,502);assert.equal(system.repo.operation(q2.id).status,'generated');fixture.failEvent=false;
  const originalComplete=system.repo.complete.bind(system.repo);system.repo.complete=()=>{throw Error('Falha de confirmação no banco')};const internal=await request('/api/proposals/'+q2.id+'/schedule',{...input,key:key(),revision:q2.revision});assert.equal(internal.status,500);assert.ok(!(await internal.json()).error.includes('Falha de confirmação'));system.repo.complete=originalComplete;assert.equal(fixture.events.size,1);
  await data('/api/proposals/'+q2.id+'/schedule',{...input,key:key(),revision:q2.revision});assert.equal(fixture.events.size,1);
  const reopen=new Repository(dir);assert.equal(reopen.list().length,2);assert.equal(reopen.operation(q2.id).status,'scheduled');assert.equal(reopen.listPDFs(q.id).length,2);reopen.close();
  const originalLockTimeout=system.service.lockTimeoutMs;system.service.lockTimeoutMs=20;let aborted=false;
  await assert.rejects(system.service.locked('lock-timeout-test',async signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('operation aborted'));},{once:true}))),/operation aborted/);
  assert.equal(aborted,true);assert.equal(system.service.locks.has('lock-timeout-test'),false);assert.equal(system.repo.db.prepare('SELECT key FROM leases WHERE key=?').get('proposal:lock-timeout-test'),undefined);system.service.lockTimeoutMs=originalLockTimeout;
  // Limite de corpo: pequeno por padrão (inclusive login), grande só nas rotas autenticadas com imagens.
  const huge=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'x'.repeat(1024*1024)})});
  assert.equal(huge.status,413);assert.match(huge.headers.get('content-type'),/json/);assert.equal((await huge.json()).error,'O conteúdo enviado é grande demais.');
  assert.equal((await request('/api/clients',{name:'Grande',notes:'x'.repeat(300*1024)})).status,413);
  assert.equal((await data('/api/draft',{id:'current',quote:{...q,padding:'x'.repeat(300*1024)}},'PUT')).quote.client,q.client);
  const broken=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{'});assert.equal(broken.status,400);assert.equal((await broken.json()).error,'Conteúdo enviado inválido.');
  // Chaves do protótipo e tags não cadastradas são recusadas com 400.
  for(const channel of ['constructor','__proto__','toString'])assert.equal((await request('/api/dashboard?from=2026-01-01&to=2026-01-31&channel='+channel)).status,400,channel);
  const tagged=await request('/api/proposals/'+q.id,{...q,tags:['inexistente']},'PUT');assert.equal(tagged.status,400);assert.match((await tagged.json()).error,/não está cadastrada/);
  // Resumo sem imagens para o kanban; a resposta padrão continua completa.
  const full=await data('/api/proposals'),summary=await data('/api/proposals?summary=1');
  assert.equal(full.find(x=>x.id===q.id).items[0].photos.length,1);assert.equal(summary.length,full.length);assert.ok(!JSON.stringify(summary).includes('data:image'));
  const brief=summary.find(x=>x.id===q.id);assert.equal(brief.items[0].photoCount,1);assert.ok(!('photos'in brief.items[0]));assert.ok(!('logo'in brief.company));assert.equal(brief.revision,q.revision);assert.equal(brief.items[0].price,200);
  const docs=await data('/api/documents?summary=1&proposalId='+q.id);assert.equal(docs.length,2);assert.equal(docs[0].snapshot.items[0].photoCount,1);assert.ok(!JSON.stringify(docs).includes('data:image'));assert.ok(JSON.stringify(await data('/api/documents?proposalId='+q.id)).includes('data:image'));
  // Logo fora do JSON de configurações (?lite=1) e servido em rota própria com cache curto e ETag.
  await data('/api/settings',{...settings,company:{...settings.company,logo:image}},'PUT');
  const light=await data('/api/settings?lite=1');assert.ok(!('logo'in light.company));assert.equal(light.logoUrl,'/api/settings/logo');assert.equal((await data('/api/settings')).company.logo,image);
  assert.equal((await data('/api/onboarding?lite=1')).settings.logoUrl,'/api/settings/logo');
  const logo=await request('/api/settings/logo');assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/png');assert.equal(logo.headers.get('cache-control'),'private, max-age=300');
  assert.deepEqual(Buffer.from(await logo.arrayBuffer()),Buffer.from(image.split(',')[1],'base64'));assert.equal((await request('/api/settings/logo',undefined,'GET',{'If-None-Match':logo.headers.get('etag')})).status,304);
  const {logoUrl,...kept}=light;await data('/api/settings',kept,'PUT');assert.equal((await data('/api/settings')).company.logo,image);
  await data('/api/settings',{...kept,company:{...kept.company,logo:'',useInitials:true}},'PUT');assert.equal((await request('/api/settings/logo')).status,404);assert.equal((await data('/api/settings?lite=1')).logoUrl,null);
  // Estáticos versionados: só a versão atual existe e fica em cache imutável.
  const version=/v\/([a-f0-9]{10})\//.exec(await(await request('/')).text())[1];
  const asset=await request('/v/'+version+'/app.js');assert.equal(asset.status,200);assert.equal(asset.headers.get('cache-control'),'public, max-age=31536000, immutable');
  assert.equal((await request('/v/'+(version==='0000000000'?'1111111111':'0000000000')+'/app.js')).status,404);assert.equal((await request('/app.js')).headers.get('cache-control'),'no-cache');
  assert.equal((await request('/')).headers.get('strict-transport-security'),null);
  // Limpeza periódica de sessões e tentativas expiradas.
  system.repo.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('expired-session','x',Date.now()-1000);system.repo.db.prepare('INSERT INTO rate_limits VALUES (?,?,?)').run('expired-rate',3,Date.now()-1000);
  system.start();assert.equal(system.repo.db.prepare("SELECT COUNT(*) n FROM sessions WHERE id='expired-session'").get().n,0);assert.equal(system.repo.db.prepare("SELECT COUNT(*) n FROM rate_limits WHERE key='expired-rate'").get().n,0);
  assert.equal((await(await request('/api/session')).json()).authenticated,true);
  await data('/api/logout',{});assert.equal((await request(pdf.url)).status,401);
  // Localmente o limite de login usa o endereço do socket: X-Forwarded-For é ignorado.
  for(let i=0;i<8;i++)assert.equal((await request('/api/login',{password:'senha-errada'},'POST',{'X-Forwarded-For':'198.51.100.'+i})).status,401);
  assert.equal((await request('/api/login',{password:'senha-errada'},'POST',{'X-Forwarded-For':'198.51.100.99'})).status,429);
  console.log('PASS: autenticação, CSRF, arquivos privados, SQLite, revisões, PDFs imutáveis, OAuth, Drive, agenda, recuperação, reagendamento, cancelamento, backup, migração, limites de corpo, resumo sem imagens, logo separado, estáticos versionados e limpeza de sessões.');
}finally{await new Promise(r=>server.close(r));system.repo.close()}

// Produção atrás do proxy: HSTS e limite de login por IP do cliente (trust proxy).
const prodDir=fs.mkdtempSync(path.join(os.tmpdir(),'ecoclean-prod-')),prodOrigin='https://localhost:3601';
const prod=createApp({origin:prodOrigin,production:true,dataDir:prodDir,encryptionKey:crypto.randomBytes(32).toString('base64'),fetcher:fixture.fetch,googleConfig:{clientId:'test-client',clientSecret:'test-secret',redirectURI:prodOrigin+'/api/google/callback'}});
const prodServer=prod.app.listen(3601,'127.0.0.1');await new Promise(r=>prodServer.once('listening',r));
try{
  prod.repo.setConfig('adminPassword',await passwordHash('producao-senha-correta'));
  const login=(ip,password='senha-errada')=>fetch('http://localhost:3601/api/login',{method:'POST',headers:{Origin:prodOrigin,'Content-Type':'application/json','X-Forwarded-For':ip},body:JSON.stringify({password})});
  const first=await login('203.0.113.1');assert.equal(first.status,401);assert.equal(first.headers.get('strict-transport-security'),'max-age=15552000');
  for(let i=0;i<7;i++)assert.equal((await login('203.0.113.1')).status,401);
  assert.equal((await login('203.0.113.1')).status,429);assert.equal((await login('203.0.113.2')).status,401);assert.equal((await login('203.0.113.3','producao-senha-correta')).status,200);
  console.log('PASS: produção — HSTS e limite de login por IP do cliente atrás do proxy.');
}finally{await new Promise(r=>prodServer.close(r));prod.repo.close();fs.rmSync(prodDir,{recursive:true,force:true})}
