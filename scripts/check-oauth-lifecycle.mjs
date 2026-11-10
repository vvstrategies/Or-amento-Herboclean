// Ciclo de vida das integrações: refresh automático, restart, falha temporária x revogação, Contatos incremental, Rotas.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Repository} from '../backend/database.js';
import {vault} from '../backend/security.js';
import {GoogleIntegration} from '../backend/google.js';
import {GOOGLE_SCOPES,mergeRefreshedTokens,classifyTokenFailure} from '../backend/google-oauth.js';
import {GoogleAdsProvider} from '../backend/ad-spend-providers.js';
import {IntegrationService} from '../backend/integration-service.js';
import {integrationError} from '../backend/integration-domain.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const base='openid email '+GOOGLE_SCOPES.calendar+' '+GOOGLE_SCOPES.drive;

// Regras puras
assert.equal(mergeRefreshedTokens({refreshToken:'R1',accessToken:'A0'},{access_token:'A1',expires_in:3600}).refreshToken,'R1');
for(const empty of [null,undefined,'','  '])assert.equal(mergeRefreshedTokens({refreshToken:'R1'},{access_token:'A1',expires_in:3600,refresh_token:empty}).refreshToken,'R1','refresh token nunca vira vazio');
assert.equal(mergeRefreshedTokens({refreshToken:'R1'},{access_token:'A1',expires_in:3600,refresh_token:'R2'}).refreshToken,'R2','rotação aceita token novo');
assert.equal(classifyTokenFailure(400,{error:'invalid_grant'}),'revoked');
assert.equal(classifyTokenFailure(401,{error:'invalid_client'}),'config');
for(const s of [500,502,503,429,0])assert.equal(classifyTokenFailure(s,{}),'temporary');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oauth-lifecycle-'));
try{
  const config={clientId:'id',clientSecret:'secret',redirectURI:'http://localhost:3000/api/google/callback'};
  let mode='ok',refreshCalls=0,lastScope=base,peopleCalls=[];
  const fetcher=async(url,options={})=>{
    const u=new URL(url);
    if(u.hostname==='oauth2.googleapis.com'){
      const body=new URLSearchParams(options.body);
      if(body.get('grant_type')==='authorization_code')return json({access_token:'A-code',refresh_token:'R-code',expires_in:3600,scope:lastScope});
      refreshCalls++;
      if(mode==='timeout')throw Object.assign(Error('timeout'),{name:'TimeoutError'});
      if(mode==='500')return json({error:'backend_error'},500);
      if(mode==='invalid_grant')return json({error:'invalid_grant',error_description:'Token has been expired or revoked.'},400);
      return json({access_token:'A-'+refreshCalls,expires_in:3599,scope:lastScope});// sem refresh_token, como o Google faz
    }
    if(u.hostname==='openidconnect.googleapis.com')return json({sub:'acc-1',email:'agenda@example.invalid',email_verified:true});
    if(u.hostname==='people.googleapis.com'){
      peopleCalls.push(u.pathname+u.search);
      assert.ok(!u.searchParams.get('personFields')||u.searchParams.get('personFields')==='names,phoneNumbers,emailAddresses,addresses,birthdays,organizations');
      if(u.pathname.endsWith('people:searchContacts'))return json({results:u.searchParams.get('query')?[{person:{resourceName:'people/c9',names:[{displayName:'Maria Busca'}],phoneNumbers:[{value:'+55 11 98888-7777'}]}}]:[]});
      const page=u.searchParams.get('pageToken');
      if(!page)return json({connections:[{resourceName:'people/c1',names:[{displayName:'Ana Lima',metadata:{primary:true}}],phoneNumbers:[{value:'(11) 91234-5678',type:'mobile',metadata:{primary:true}},{value:'+351 912 345 678',type:'work'}],emailAddresses:[{value:'ana@example.invalid'}],birthdays:[{date:{month:3,day:18}}],addresses:[{formattedValue:'Rua A, 10, São Paulo',streetAddress:'Rua A, 10',city:'São Paulo',region:'SP',postalCode:'01000-000'}],organizations:[{name:'Clínica X'}]},{resourceName:'people/c2',names:[]}],nextPageToken:'p2',totalPeople:3});
      return json({connections:[{resourceName:'people/c3',names:[{displayName:'Bruno'}]}]});
    }
    throw Error('inesperado '+url);
  };
  const session={id:'session-1'};
  const make=()=>{const repo=new Repository(dir);return {repo,g:new GoogleIntegration(repo,vault(repo.dir,null,false),config,fetcher)}};
  let {repo,g}=make();

  // Conectar Calendar/Drive: offline + consentimento explícito + escopos incrementais preservados.
  const auth=new URL(g.connect(session).url);
  assert.equal(auth.searchParams.get('access_type'),'offline');assert.equal(auth.searchParams.get('include_granted_scopes'),'true');
  assert.ok(!auth.searchParams.get('scope').includes('contacts'),'Contatos não é pedido no conectar da agenda');
  await g.callback({state:auth.searchParams.get('state'),code:'c'},session);
  assert.equal(g.status().state,'connected');assert.equal(g.status().scopes.contacts,false);
  assert.ok(!repo.config('google').includes('R-code'),'refresh token criptografado no banco');

  // Restart: novo processo lendo o mesmo DATA_DIR continua conectado, renova sozinho e preserva o refresh token.
  repo.close();({repo,g}=make());
  assert.equal(g.status().connected,true);
  g.updateConnection(g.connection().id,{expires:Date.now()-1000});
  assert.equal(await g.access(),'A-1');assert.equal(g.connection().refreshToken,'R-code');assert.ok(g.status().tokenRefreshAt);

  // Falha temporária (timeout e 500): conexão e tokens preservados, estado "temporariamente indisponível".
  for(const m of ['timeout','500']){
    mode=m;g.updateConnection(g.connection().id,{expires:Date.now()-1000});
    await assert.rejects(g.access(),e=>e.status===503);
    const c=g.connection();assert.equal(c.needsReconnect,false);assert.equal(c.refreshToken,'R-code');assert.equal(g.status().state,'temporarily_unavailable');assert.equal(g.status().connected,true);
  }
  mode='ok';assert.ok(await g.access());assert.equal(g.status().state,'connected','recupera sozinho na próxima tentativa');

  // Contatos sem permissão: pede autorização incremental sem derrubar Calendar/Drive.
  await assert.rejects(g.contacts(),e=>e.code==='GOOGLE_CONTACTS_SCOPE'&&e.status===403);
  const inc=new URL(g.connect(session,{purpose:'contacts'}).url);
  assert.equal(inc.searchParams.get('scope'),'openid email '+GOOGLE_SCOPES.contacts);assert.equal(inc.searchParams.get('include_granted_scopes'),'true');assert.equal(inc.searchParams.get('login_hint'),'agenda@example.invalid');
  lastScope=base+' '+GOOGLE_SCOPES.contacts;
  const r=await g.callback({state:inc.searchParams.get('state'),code:'c2'},session);
  assert.equal(r.purpose,'contacts');assert.equal(g.status().scopes.contacts,true);assert.equal(g.status().connected,true,'Calendar/Drive continuam');
  const page1=await g.contacts();
  assert.equal(page1.contacts.length,1,'contato sem nome/telefone/e-mail é ignorado');assert.equal(page1.nextPageToken,'p2');
  assert.deepEqual(page1.contacts[0],{id:'people/c1',name:'Ana Lima',phones:[{value:'(11) 91234-5678',type:'mobile',primary:true},{value:'+351 912 345 678',type:'work',primary:false}],emails:[{value:'ana@example.invalid',type:'',primary:false}],addresses:[{formatted:'Rua A, 10, São Paulo',street:'Rua A, 10',neighborhood:'',city:'São Paulo',region:'SP',postalCode:'01000-000',country:'',countryCode:'',type:''}],birthday:'03-18',organization:'Clínica X',source:'google'});
  assert.equal((await g.contacts({pageToken:'p2'})).contacts[0].name,'Bruno');
  const found=await g.contacts({query:'maria'});assert.equal(found.contacts[0].name,'Maria Busca');
  assert.ok(peopleCalls.some(c=>c.includes('searchContacts')&&c.includes('query=&')),'aquecimento da busca');
  assert.ok(!fs.readdirSync(dir).some(f=>/contact/i.test(f))&&!JSON.stringify(repo.db.prepare('SELECT key FROM config').all()).includes('contact'),'agenda não é persistida');

  // invalid_grant: aí sim é revogação; pede reconexão de forma explícita.
  mode='invalid_grant';g.updateConnection(g.connection().id,{expires:Date.now()-1000});
  await assert.rejects(g.access(),e=>e.code==='GOOGLE_RECONNECT');assert.equal(g.status().state,'revoked');assert.equal(g.status().scopes.contacts,false);
  assert.ok(g.connection().refreshToken,'mesmo revogado, nada é apagado automaticamente');
  repo.close();

  // Google Ads: refresh preserva refresh token; 500 é temporário; invalid_grant pede reconexão.
  const adsDir=fs.mkdtempSync(path.join(os.tmpdir(),'oauth-ads-'));
  try{
    let adsMode='ok';
    const adsFetch=async(url,options={})=>{const u=new URL(url);
      if(u.hostname==='oauth2.googleapis.com'){if(adsMode==='500')return json({error:'internal'},500);if(adsMode==='invalid_grant')return json({error:'invalid_grant'},400);return json({access_token:'ADS-NEW',expires_in:3600})}
      if(u.pathname.endsWith('googleAds:search'))return json({results:[{customer:{id:'123',descriptiveName:'Conta',currencyCode:'BRL',timeZone:'America/Sao_Paulo'}}]});
      throw Error('inesperado '+url)};
    const adsRepo=new Repository(adsDir),v=vault(adsDir,null,false),provider=new GoogleAdsProvider({clientId:'a',clientSecret:'b',redirectURI:'http://localhost/cb',transport:{sleep:async()=>{}}},adsFetch);
    const fakeFinance={routeCache:{status:()=>({configured:true}),onResult:null}},fakeDre={audit(){},categories:()=>[],expenses:()=>[]},fakeGoogle={status:()=>({configured:false,scopes:{}}),connection:()=>null};
    const s=new IntegrationService(adsRepo,v,{'google-ads':provider,'meta-ads':{configured:false}},fakeFinance,fakeDre,fakeGoogle);
    s.persist('google-ads',{provider:'google-ads',status:'connected',connectionId:'c1',account:{id:'123',name:'Conta',currency:'BRL',timezone:'America/Sao_Paulo',managerId:null}},{accessToken:'OLD',refreshToken:'ADS-R',expires:Date.now()-1});
    await s.test('google-ads');assert.equal(s.secret('google-ads').refreshToken,'ADS-R');assert.equal(s.secret('google-ads').accessToken,'ADS-NEW');assert.equal(s.status('google-ads').status,'connected');assert.ok(s.status('google-ads').tokenRefreshAt);
    adsMode='500';s.persist('google-ads',s.state('google-ads'),{...s.secret('google-ads'),expires:Date.now()-1});
    await assert.rejects(s.test('google-ads'));assert.equal(s.status('google-ads').status,'temporarily_unavailable');assert.equal(s.secret('google-ads').refreshToken,'ADS-R');
    adsMode='invalid_grant';await assert.rejects(s.test('google-ads'));assert.equal(s.status('google-ads').status,'revoked');assert.ok(s.secret('google-ads'),'tokens não são apagados sem ação do usuário');
    adsMode='ok';await s.test('google-ads');assert.equal(s.status('google-ads').status,'connected');

    // Rotas: chave presente = configurada; erro de endereço não muda estado; timeout = temporário; chave inválida = configuração.
    const route=()=>s.statuses().find(x=>x.provider==='heigit-routes');
    assert.equal(route().status,'configured');
    s.mapResult({ok:true,durationMs:1});assert.equal(route().status,'connected');
    s.mapResult({ok:false,error:integrationError('INVALID_ADDRESS',400)});assert.equal(route().status,'connected');
    s.mapResult({ok:false,error:integrationError('TIMEOUT',503)});assert.equal(route().status,'temporarily_unavailable');
    s.mapResult({ok:true});assert.equal(route().status,'connected');
    s.mapResult({ok:false,error:integrationError('INVALID_KEY',503)});assert.equal(route().status,'config_error');
    assert.ok(!JSON.stringify(s.statuses()).match(/ADS-R|ADS-NEW|R-code/),'status nunca expõe tokens');
    adsRepo.close();
  }finally{fs.rmSync(adsDir,{recursive:true,force:true})}
}finally{fs.rmSync(dir,{recursive:true,force:true})}
console.log('PASS: OAuth — refresh automático, restart, refresh token preservado/rotacionado, falha temporária ≠ desconexão, invalid_grant, Contatos incremental com paginação/busca, Google Ads e Rotas.');
