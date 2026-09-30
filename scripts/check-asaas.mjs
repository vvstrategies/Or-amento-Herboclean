import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../backend/app.js';
import {modelo} from '../utils/proposta.js';
import {settings,image} from './test-company.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'herboclean-asaas-')),origin='http://localhost:3295',calls=[];
let counter=0;
const fetcher=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;calls.push({url,method:options.method,body,headers:options.headers});
 if(url.endsWith('/customers'))return new Response(JSON.stringify({id:'cus_test'}),{status:200});
 if(url.includes('/customers/cus_test'))return new Response(JSON.stringify({id:'cus_test'}),{status:200});
 if(url.endsWith('/payments')&&options.method==='POST'){counter++;const pix=body.billingType==='PIX';return new Response(JSON.stringify({id:pix?'pay_pix':'pay_card',customer:'cus_test',installment:pix?null:'inst_card',status:'PENDING',invoiceUrl:'https://payments.example/'+(pix?'pix':'card')}),{status:200});}
 if((url.includes('/payments/')||url.includes('/installments/'))&&options.method==='DELETE')return new Response(JSON.stringify({deleted:true}),{status:200});
 return new Response(JSON.stringify({errors:[{description:'unexpected'}]}),{status:400});
};
const system=createApp({origin,dataDir:dir,asaasConfig:{apiKey:'test-api-key',webhookToken:'test-webhook-token',baseUrl:'https://asaas.example/v3',environment:'sandbox',origin},asaasFetcher:fetcher});
const server=system.app.listen(3295,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
let cookie='',csrf='';
async function request(url,body,method=body?'POST':'GET',headers={}){return fetch(origin+url,{method,headers:{Host:'localhost:3295',Origin:origin,...(cookie?{Cookie:cookie}:{}),'X-CSRF-Token':csrf,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});}
async function data(url,body,method,headers){const response=await request(url,body,method,headers);const value=response.status===204?null:await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
try{
 const setup=await request('/api/setup',{password:'asaas-test-password'});assert.equal(setup.status,200);cookie=setup.headers.get('set-cookie').split(';')[0];csrf=(await setup.json()).csrf;
 await data('/api/onboarding',settings);
 modelo.configure(settings);let quote=modelo.quote(settings);quote.client='Cliente pagamento';quote.address='Rua de teste, 100';quote.items=[{...modelo.item('SofÃ¡'),price:200,photos:[image]}];quote=await data('/api/proposals/'+quote.id,quote,'PUT');
 const status=await data('/api/asaas/status');assert.equal(status.configured,true);assert.equal(status.webhookProtected,true);assert.equal(status.environment,'sandbox');
 const issued=await data('/api/proposals/'+quote.id+'/payments',{name:'Cliente pagamento',cpfCnpj:'529.982.247-25',email:'cliente@example.test',mobilePhone:'11999999999'});assert.equal(issued.payments.length,2);assert.equal(issued.partial,false);
 const total=modelo.totals(quote),pixCall=calls.find(x=>x.body?.billingType==='PIX'),cardCall=calls.find(x=>x.body?.billingType==='CREDIT_CARD');assert.equal(pixCall.body.value,total.pix/100);assert.equal(cardCall.body.totalValue,total.total/100);assert.equal(cardCall.body.installmentCount,total.count);assert.ok(calls.every(x=>x.headers?.access_token==='test-api-key'));
 const retry=await data('/api/proposals/'+quote.id+'/payments',{name:'Cliente pagamento',cpfCnpj:'52998224725'});assert.equal(retry.reused,true);assert.equal(calls.filter(x=>x.method==='POST'&&x.url.endsWith('/payments')).length,2);
 const webhook=await request('/api/webhooks/asaas',{id:'evt-1',event:'PAYMENT_RECEIVED',payment:{id:'pay_pix',status:'RECEIVED'}},'POST',{'asaas-access-token':'test-webhook-token',Origin:'https://not-the-browser.example'});assert.equal(webhook.status,204);const payments=(await data('/api/proposals/'+quote.id+'/payments')).payments;assert.equal(payments.find(x=>x.kind==='pix').status,'RECEIVED');assert.equal(payments.find(x=>x.kind==='card').status,'DELETED');assert.equal(calls.filter(x=>x.method==='DELETE')[0].url.endsWith('/installments/inst_card/payments'),true);
 const duplicate=await request('/api/webhooks/asaas',{id:'evt-1',event:'PAYMENT_RECEIVED',payment:{id:'pay_pix',status:'RECEIVED'}},'POST',{'asaas-access-token':'test-webhook-token',Origin:'https://not-the-browser.example'});assert.equal(duplicate.status,204);assert.equal(calls.filter(x=>x.method==='DELETE').length,1);
 const invalid=await request('/api/webhooks/asaas',{id:'evt-2',event:'PAYMENT_UPDATED',payment:{id:'pay_pix'}},'POST',{'asaas-access-token':'wrong',Origin:'https://not-the-browser.example'});assert.equal(invalid.status,401);
 const rows=system.repo.db.prepare('SELECT * FROM asaas_payers').all();assert.equal(rows.length,1);assert.ok(!JSON.stringify(rows).includes('52998224725'));
 console.log('PASS: Asaas â€” PIX e cartÃ£o em 3x, valores do orÃ§amento, reuso, webhook autenticado, idempotÃªncia, cancelamento da alternativa e privacidade do CPF/CNPJ.');
}finally{await new Promise(resolve=>server.close(resolve));system.repo.close();}

