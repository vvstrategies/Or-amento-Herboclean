import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApp} from '../backend/app.js';
import {settings as company} from './test-company.mjs';
import {modelo} from '../utils/proposta.js';
import {GoogleAdsProvider,MetaAdsProvider} from '../backend/ad-spend-providers.js';
import {accountDay,scaled,microsToCents,integrationError} from '../backend/integration-domain.js';
import {attributionInput} from '../backend/attribution-model.js';
import {externalJSON} from '../backend/integration-http.js';
import {migrateIntegrations} from '../backend/integration-migration.js';
import {HeiGITOpenRouteServiceProvider} from '../backend/routes-provider.js';
const ok=data=>({ok:true,status:200,json:async()=>data});
const cfg={clientId:'FAKE-ID',clientSecret:'FAKE-SECRET',redirectURI:'http://localhost/callback',transport:{sleep:async()=>{}}};
const selected={id:'123',name:'Conta fictícia',currency:'BRL',timezone:'America/Sao_Paulo',managerId:'999'};
assert.equal(scaled('107.005'),10701);assert.equal(microsToCents('100000000'),10000);
assert.throws(()=>scaled('-1'));assert.throws(()=>microsToCents('1.5'));
assert.equal(accountDay('America/Sao_Paulo',new Date('2026-09-02T01:00:00Z')),'2026-09-01');
assert.equal(accountDay('Asia/Tokyo',new Date('2026-09-02T01:00:00Z')),'2026-09-02');
assert.equal(attributionInput({provider:'google-ads',gclid:'tracking',accessToken:'POISON'}).gclid,'tracking');
assert.ok(!JSON.stringify(attributionInput({accessToken:'POISON'})).includes('POISON'));
let calls=0;
const ads=new GoogleAdsProvider(cfg,async(url,r)=>{
 assert.ok(url.startsWith('https://googleads.googleapis.com/v25/'));assert.ok(!('developer-token' in r.headers));
 assert.equal(r.headers.Authorization,'Bearer FAKE-TOKEN');assert.equal(r.headers['login-customer-id'],'999');
 const body=JSON.parse(r.body);assert.ok(!('pageSize' in body));calls++;
 return ok({results:[{segments:{date:'2026-09-01'},campaign:{id:String(calls),name:'Teste'},metrics:{costMicros:'100000000',impressions:'100',clicks:'4',conversions:'1.5',conversionsValue:20}}],...(calls===1?{nextPageToken:'p2'}:{})});
});
const gaAuth=new URL(ads.authorizationURL('STATE','VERIFIER'));
assert.equal(gaAuth.searchParams.get('scope'),'https://www.googleapis.com/auth/adwords');assert.equal(gaAuth.searchParams.get('code_challenge_method'),'S256');
const rows=await ads.syncSpend('FAKE-TOKEN',selected,'2026-09-01','2026-09-01');assert.equal(rows.length,2);assert.equal(rows[0].spendCents,10000);assert.equal(rows[0].platformConversions,'1.5');assert.equal(rows[0].platformConversionValueCents,2000);
const looping=new GoogleAdsProvider(cfg,async()=>ok({results:[],nextPageToken:'same'}));
await assert.rejects(looping.search('x','123','query'),e=>e.integrationCode==='PAGINATION');
const mcc=new GoogleAdsProvider(cfg,async(url,r)=>{
 if(url.endsWith('listAccessibleCustomers'))return ok({resourceNames:['customers/999']});
 const q=JSON.parse(r.body).query;
 return ok({results:q.includes('customer_client')?[{customerClient:{id:'123',descriptiveName:'Cliente MCC',currencyCode:'BRL',timeZone:'America/Sao_Paulo',manager:false}}]:[{customer:{id:'999',manager:true}}]});
});
assert.deepEqual(await mcc.listAccounts('FAKE-TOKEN'),[{...selected,name:'Cliente MCC'}]);
let metaCalls=0;
const meta=new MetaAdsProvider(cfg,async(url,r)=>{
 const u=new URL(url);assert.equal(u.hostname,'graph.facebook.com');assert.equal(r.headers.Authorization,'Bearer FAKE-TOKEN');assert.ok(u.searchParams.get('appsecret_proof'));assert.equal(u.searchParams.has('access_token'),false);
 assert.equal(u.searchParams.get('time_increment'),'1');metaCalls++;
 return ok({data:[{date_start:'2026-09-01',campaign_id:String(metaCalls),campaign_name:'Meta fictícia',account_currency:'BRL',spend:'10.05',impressions:'100',clicks:'4'}],...(metaCalls===1?{paging:{next:'https://untrusted.invalid/steal',cursors:{after:'NEXT'}}}:{})});
});
assert.equal(new URL(meta.authorizationURL('state')).searchParams.get('scope'),'ads_read');
const mr=await meta.syncSpend('FAKE-TOKEN',selected,'2026-09-01','2026-09-01');assert.equal(mr.length,2);assert.equal(mr[0].spendCents,1005);assert.equal(mr[0].platformConversions,null);
await assert.rejects(meta.refresh(),e=>e.integrationCode==='RECONNECT');
await assert.rejects(externalJSON(async()=>({ok:true,status:200,json:async()=>{throw Error('bad json');}}),'https://example.invalid'),e=>e.integrationCode==='INVALID_DATA');
let retryCount=0;const waits=[];
await externalJSON(async()=>++retryCount<3?{ok:false,status:429,json:async()=>({error:{message:'FAKE-TOKEN'}})}:ok({ok:true}),'https://example.invalid',{},'mock',{sleep:async ms=>waits.push(ms)});
assert.equal(retryCount,3);assert.deepEqual(waits,[500,1000]);
await assert.rejects(externalJSON(async()=>({ok:false,status:401,json:async()=>({error:'FAKE-TOKEN'})}),'https://example.invalid'),e=>e.integrationCode==='RECONNECT'&&!e.message.includes('FAKE-TOKEN'));
const googleExchange=new GoogleAdsProvider(cfg,async(url,r)=>{assert.equal(new URLSearchParams(r.body).get('code_verifier'),'VERIFIER');return ok({access_token:'FAKE-TOKEN',refresh_token:'FAKE-REFRESH',expires_in:3600,scope:'https://www.googleapis.com/auth/adwords'});});
assert.equal((await googleExchange.exchange('code','VERIFIER')).refreshToken,'FAKE-REFRESH');
const deniedExchange=new GoogleAdsProvider(cfg,async()=>ok({access_token:'x',refresh_token:'x',expires_in:1,scope:'email'}));
await assert.rejects(deniedExchange.exchange('x','x'),e=>e.integrationCode==='ACCESS_DENIED');
let exchangeCalls=0;
const metaExchange=new MetaAdsProvider(cfg,async(url)=>{exchangeCalls++;return ok(exchangeCalls===3?{data:[{permission:'ads_read',status:'granted'}]}:{access_token:'FAKE-META',expires_in:3600});});
assert.equal((await metaExchange.exchange('code')).accessToken,'FAKE-META');assert.equal(exchangeCalls,3);
for(const [status,body,code] of [[401,{message:'unauthorized'},'INVALID_KEY'],[403,{message:'forbidden'},'INVALID_KEY'],[400,{message:'invalid address'},'INVALID_ADDRESS'],[429,{},'QUOTA']]){
 await assert.rejects(new HeiGITOpenRouteServiceProvider({apiKey:'FAKE',fetcher:async()=>({ok:false,status,json:async()=>({error:body})})}).route({longitude:-46.7,latitude:-23.5},{longitude:-46.8,latitude:-23.6}),e=>e.integrationCode===code);
}
function mock(id){return {id,configured:true,version:'mock',spend:10000,currency:'BRL',fail:false,empty:false,syncCalls:0,refreshCalls:0,
 authorizationURL(state){return 'https://example.invalid/oauth?state='+state;},async exchange(){return {accessToken:'PRIVATE-ACCESS-'+id,refreshToken:'PRIVATE-REFRESH-'+id,expires:Date.now()+3600000};},
 async refresh(t){this.refreshCalls++;return {...t,accessToken:'PRIVATE-NEW-'+id,expires:Date.now()+3600000};},
 async listAccounts(){return [{...selected,id:id==='google-ads'?'123':'456',managerId:id==='google-ads'?'999':null,currency:this.currency}];},
 async testConnection(token,a){return {...a,currency:this.currency};},
 async syncSpend(token,a,from){this.syncCalls++;if(this.fail)throw integrationError('EXTERNAL');return this.empty?[]:[{externalAccountId:a.id,date:from,campaignId:'101',campaignName:'Campanha fictícia',currency:this.currency,spendCents:this.spend,impressions:100,clicks:5,platformConversions:'2'}];},
 async disconnect(){return true;}};}
const g=mock('google-ads'),m=mock('meta-ads'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'universal-integrations-'));
let routeCalls=0;
const routeProvider={id:'fixture-routes',configured:true,async route(){routeCalls++;return {distanceMeters:18000,durationSeconds:2400};}};
const origin='http://localhost:3193',system=createApp({origin,dataDir:dir,adProviders:{'google-ads':g,'meta-ads':m},routeProvider,routesConfig:{dailyLimit:4}});
const {app,repo,integrations:s,dre}=system,server=app.listen(3193,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let cookie='',csrf='';
async function request(url,body,method=body?'POST':'GET',headers={}){return fetch(origin+url,{method,redirect:'manual',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});}
async function data(url,body,method){const r=await request(url,body,method),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
const api=(id,action)=>'/api/integrations/'+id+'/'+action,range={from:'2026-09-01',to:'2026-09-01'};
const report=()=>data('/api/finance/report?from=2026-09&to=2026-09');
const rowCount=()=>repo.db.prepare('SELECT COUNT(*) n FROM ad_spend_daily').get().n;
async function authorize(id){
 const r=await data(api(id,'connect'),{}),state=new URL(r.url).searchParams.get('state');
 assert.equal(s.status(id).status,'connecting');
 assert.equal((await request(api(id,'callback')+'?state=wrong&code=x')).status,403);
 assert.equal((await request(api(id,'callback')+'?state='+state+'&code=x')).status,302);
 assert.equal((await request(api(id,'callback')+'?state='+state+'&code=x')).status,403);
 const listing=await data(api(id,'accounts'));
 assert.equal((await request(api(id,'account'),{connectionId:listing.connectionId,accountId:'999999'},'PUT')).status,400);
 return data(api(id,'account'),{connectionId:listing.connectionId,accountId:listing.accounts[0].id,managerId:listing.accounts[0].managerId},'PUT');
}
try{
 for(const url of ['/api/integrations','/api/integrations/demo','/api/integrations/google-ads/accounts','/api/finance/marketing','/guia-integracoes'])assert.equal((await request(url)).status,401);
 const setup=await request('/api/setup',{password:'integrations-test-password'});cookie=setup.headers.get('set-cookie').split(';')[0];csrf=(await setup.json()).csrf;
 assert.equal((await request('/api/integrations')).status,428);await data('/api/onboarding',company);
 assert.equal((await request(api('google-ads','connect'),{},'POST',{'X-CSRF-Token':'bad'})).status,403);
 const before=JSON.stringify(repo.config('settings'));migrateIntegrations(repo);migrateIntegrations(repo);assert.equal(JSON.stringify(repo.config('settings')),before);
 const pending=await data(api('google-ads','connect'),{}),state=new URL(pending.url).searchParams.get('state');
 await assert.rejects(s.callback('google-ads',{state,code:'x'},{id:'other-session'}),e=>e.status===403);
 repo.db.prepare('UPDATE integration_oauth_states SET expires=0').run();
 assert.equal((await request(api('google-ads','callback')+'?state='+state+'&code=x')).status,403);
 await authorize('google-ads');await authorize('meta-ads');assert.equal((await data(api('google-ads','test'),{})).ok,true);
 const cipher=repo.db.prepare('SELECT secret FROM integration_connections WHERE provider=?').get('google-ads').secret;
 assert.ok(!cipher.includes('PRIVATE-'));assert.equal(s.secret('google-ads').accessToken,'PRIVATE-ACCESS-google-ads');
 const secret=s.secret('google-ads');s.persist('google-ads',s.state('google-ads'),{...secret,expires:0});
 await data(api('google-ads','test'),{});assert.equal(g.refreshCalls,1);
 let run=await data(api('google-ads','sync'),range);assert.equal(run.recordsInserted,1);
 run=await data(api('google-ads','sync'),range);assert.equal(run.recordsUnchanged,1);assert.equal(rowCount(),1);
 g.spend=10700;run=await data(api('google-ads','sync'),range);assert.equal(run.recordsUpdated,1);assert.equal(rowCount(),1);
 const rev=JSON.parse(repo.db.prepare('SELECT data FROM ad_spend_revisions WHERE run_id=?').get(run.id).data);
 assert.equal(rev.before.spendCents,10000);assert.equal(rev.after.spendCents,10700);
 const facts=s.export().adSpend;g.fail=true;
 assert.equal((await request(api('google-ads','sync'),range)).status,502);assert.deepEqual(s.export().adSpend,facts);assert.equal(s.status('google-ads').status,'error');
 g.fail=false;g.spend=100000;m.spend=50000;await data(api('google-ads','sync'),range);await data(api('meta-ads','sync'),range);
 let r=await report();assert.equal(r.total.opex,150000);assert.equal(r.total.result,-150000);assert.equal(r.expenses.length,2);assert.ok(r.expenses.every(e=>e.automatic));
 assert.equal(repo.db.prepare('SELECT COUNT(*) n FROM finance_expenses').get().n,0);
 const market=await data('/api/finance/marketing?from=2026-09&to=2026-09');assert.equal(market.spendCents,150000);assert.equal(market.campaigns.length,2);
 assert.equal((await request(api('google-ads','sync'),{days:1.5})).status,400);
 const category=dre.categories()[0],manual=await data('/api/finance/expenses',{description:'Marketing Google Ads manual',categoryId:category.id,amountCents:200000,competence:'2026-09',status:'confirmed',nature:'operating',costType:'variable'});
 assert.ok(manual.warnings.some(w=>w.includes('duplicidade')));r=await report();assert.equal(r.total.opex,350000);assert.equal(r.marketingWarnings.length,1);
 await data('/api/finance/expenses/'+manual.id,{...manual,status:'cancelled',reason:'Duplicidade fictícia conferida'},'PUT');
 m.currency='USD';await data(api('meta-ads','sync'),range);r=await report();assert.equal(r.total.opex,100000);assert.equal(s.marketing('2026-09','2026-09').excludedCurrencies[0].spendCents,50000);assert.equal(s.status('meta-ads').status,'attention');
 m.currency='BRL';await data(api('meta-ads','sync'),range);assert.equal((await report()).total.opex,150000);
 g.empty=true;await data(api('google-ads','sync'),range);assert.equal(rowCount(),2);assert.equal((await report()).total.opex,50000);g.empty=false;
 await data(api('google-ads','sync'),range);
 const routeBody={origin:'Rua A',destination:'Rua B'};
 assert.equal((await data('/api/integrations/routes/test',routeBody)).cached,false);
 assert.equal((await data('/api/integrations/routes/test',{origin:' RUA A ',destination:'rua b'})).cached,true);assert.equal(routeCalls,1);
 assert.equal((await data('/api/integrations/routes/test',{...routeBody,force:true})).cached,false);assert.equal(routeCalls,2);
 repo.db.prepare("UPDATE finance_routes SET created_at='2000-01-01T00:00:00Z'").run();
 await data('/api/integrations/routes/test',routeBody);assert.equal(routeCalls,3);
 await data('/api/integrations/routes/test',{...routeBody,destination:'Rua C'});assert.equal(routeCalls,4);
 assert.equal((await request('/api/integrations/routes/test',{...routeBody,destination:'Rua D'})).status,429);assert.equal(routeCalls,4);
 assert.equal(s.statuses().find(x=>x.provider==='heigit-routes').status,'error');
 const q=modelo.quote(company);q.client='Teste';q.address='Teste';q.items=[{...modelo.item('Sofá'),price:200}];
 const poison={...q,adSpend:123,utm_source:'private',accessToken:'PRIVATE-LEAK'};
 assert.ok(!JSON.stringify(modelo.toPublicProposal(poison)).includes('PRIVATE-LEAK'));assert.ok(!JSON.stringify(modelo.toPublicProposal(poison)).includes('adSpend'));
 const publicBackup=await data('/api/backup');assert.ok(!('integrations' in publicBackup));assert.ok(!JSON.stringify(publicBackup).includes('PRIVATE-'));
 for(const url of ['/api/integrations','/api/financial-export','/api/finance/marketing?from=2026-09&to=2026-09',api('google-ads','runs')]){const safe=JSON.stringify(await data(url));for(const marker of ['PRIVATE-','FAKE-SECRET','refreshToken','accessToken'])assert.ok(!safe.includes(marker),url+' '+marker);}
 const count=rowCount(),demo=await data('/api/integrations/demo');assert.equal(demo.spendCents,67500);assert.equal(demo.dre.opex,67500);assert.equal(demo.dre.result,82500);assert.equal(rowCount(),count);
 assert.equal((await s.daily()).enabled,false);
 s.saveSettings({revision:0,dailyEnabled:true,windowDays:7});const attempts=g.syncCalls+m.syncCalls;await s.daily();await s.daily();assert.equal(g.syncCalls+m.syncCalls,attempts+2);
 const history=rowCount();await data(api('google-ads','disconnect'),{});assert.equal(s.secret('google-ads'),null);assert.equal(s.status('google-ads').authorized,false);assert.equal(rowCount(),history);
 assert.equal((await request(api('google-ads','sync'),range)).status,409);
 // Same provider cannot sync twice concurrently; abandoned history becomes an explicit error.
 const savedRun={id:'interrupted-fixture',provider:'meta-ads',startedAt:new Date().toISOString(),periodFrom:'2026-09-01',periodTo:'2026-09-01',status:'running'};s.writeRun(savedRun);
 await data(api('meta-ads','test'),{});assert.equal(s.runs('meta-ads').find(x=>x.id===savedRun.id).errorCode,'INTERRUPTED');
 let release;const lock=s.locked('meta-ads',()=>new Promise(r=>release=r));await assert.rejects(s.test('meta-ads'),e=>e.status===409);release();await lock;
 const adsTokens={accessToken:'PRIVATE-COEXIST',refreshToken:'PRIVATE-REFRESH',expires:Date.now()+3600000};
 s.persist('google-ads',s.state('google-ads'),adsTokens);system.google.saveConnection({id:'calendar-coexist',refreshToken:'PRIVATE-CALENDAR'});const calendarBefore=repo.config('google');
 assert.equal((await s.disconnect('google-ads')).revocationSkipped,true);assert.equal(repo.config('google'),calendarBefore);
 s.persist('google-ads',s.state('google-ads'),adsTokens);assert.equal((await system.google.disconnect()).revocationSkipped,true);assert.equal(s.secret('google-ads').accessToken,'PRIVATE-COEXIST');await s.disconnect('google-ads');
 await data('/api/logout',{});assert.equal((await request('/api/integrations')).status,401);
 console.log('PASS: integrações — OAuth/PKCE/escopos/estado, sessões/CSRF, MCC, criptografia, paginação/retry, centavos/micros, idempotência/revisões, falha atômica, moeda/fuso, DRE/duplicidade, Routes/cache/quota, privacidade, diário, demo e desconexão.');
}finally{await new Promise(r=>server.close(r));repo.close();}
