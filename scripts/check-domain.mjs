// Troca de domínio: páginas públicas de Privacidade/Termos, endereço antigo redireciona e ainda recebe o webhook do Asaas.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {createApp} from '../backend/app.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'herboclean-domain-')),origin='http://localhost:3197';
const system=createApp({origin,dataDir:dir,legacyHosts:['old.example.invalid'],asaasConfig:{webhookToken:'hook-token'},fetcher:()=>{throw Error('sem chamadas externas')}});
system.repo.setConfig('settings',{...(system.repo.config('settings')||{}),company:{...(system.repo.config('settings')?.company||{}),name:'Herbo Teste',email:'contato@example.invalid',phone:'(11) 99999-0000'}});
const server=system.app.listen(3197,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const call=(p,{host='localhost:3197',method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3197,path:p,method,headers:{host,...headers,...(body?{'content-type':'application/json'}:{})}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:d}))});r.on('error',reject);if(body)r.write(JSON.stringify(body));r.end()});
try{
  for(const p of ['/privacidade','/termos']){const r=await call(p);assert.equal(r.status,200,p);assert.match(r.headers['content-type'],/html/);assert.ok(r.body.includes('Herbo Teste'));}
  const priv=(await call('/privacidade')).body;assert.ok(priv.includes('Uso Limitado')&&priv.includes('contacts')===false&&priv.includes('Google Contatos'),'divulgação de Uso Limitado');assert.ok(priv.includes('contato@example.invalid'));
  const old=await call('/orcamentos?x=1',{host:'old.example.invalid'});assert.equal(old.status,301);assert.equal(old.headers.location,origin+'/orcamentos?x=1');
  const hook=await call('/api/webhooks/asaas',{host:'old.example.invalid',method:'POST',body:{event:'PAYMENT_RECEIVED'},headers:{'asaas-access-token':'wrong'}});
  assert.notEqual(hook.status,421,'webhook no endereço antigo chega ao app');
  assert.equal((await call('/',{host:'outro.example.invalid'})).status,421,'host desconhecido continua recusado');
  assert.equal((await call('/api/proposals',{host:'old.example.invalid',method:'POST',body:{}})).status,421,'só o webhook passa no host antigo');
}finally{server.close();system.repo.close();fs.rmSync(dir,{recursive:true,force:true})}
console.log('PASS: domínio — Privacidade/Termos públicos, endereço antigo redireciona (301) e recebe o webhook do Asaas, host desconhecido recusado.');
