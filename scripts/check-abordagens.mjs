// Página temporária /abordagens (Black Friday 2026): login, cabeçalhos, importação validada e marcação de enviado.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApp} from '../backend/app.js';
import {modelo} from '../utils/proposta.js';
import {settings} from './test-company.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'abordagens-tests-')),origin='http://localhost:3197';
const system=createApp({origin,dataDir:dir});
const server=system.app.listen(3197,'127.0.0.1');await new Promise(r=>server.once('listening',r));let cookie,csrf;
const request=(url,body,method=body?'POST':'GET')=>fetch(origin+url,{method,redirect:'manual',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),'X-CSRF-Token':csrf||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const margem={preco:100,custo:20,lucro:80,lucroPct:.8,vv:50,parceiro:30};
const cliente=(proposalId,extra={})=>({proposalId,numero:'TESTE-1',cliente:'Cliente teste',telefone:'5511900000000',grupo:'desconto',servico:'Sofá',precoOriginal:125,margemOriginal:margem,
  opcoes:[{id:'desconto',rotulo:'20% OFF',percentual:.2,preco:100,parcelas:{n:3,valor:35.9,total:107.7},brindes:[],margem}],chance:.2,motivoChance:'Teste.',trechoCitado:'',mensagem:'Oi, tudo bem?',...extra});
try{
  // Sem login: página volta para o app (tela de login), script e API negados.
  let r=await request('/abordagens');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/');
  assert.equal((await request('/abordagens/app.js')).status,401);
  assert.equal((await request('/api/abordagens')).status,401);
  assert.equal((await request('/api/abordagens/importar',{versao:1,clientes:[]})).status,401);
  // Nada da página fica em public/ (o CDN serve public/ sem login).
  assert.ok(!fs.readdirSync(new URL('../public',import.meta.url)).some(n=>/abordage/i.test(n)));
  const setup=await request('/api/setup',{password:'abordagens-test-password'});assert.equal(setup.status,200);cookie=setup.headers.get('set-cookie').split(';')[0];csrf=(await setup.json()).csrf;
  assert.equal((await request('/api/onboarding',settings)).status,200);modelo.configure(settings);
  let q=modelo.quote(settings);Object.assign(q,{client:'Cliente teste',address:'Rua A, 1'});q.items=[{...modelo.item(settings.services[0].name),price:125}];
  r=await request('/api/proposals/'+q.id,q,'PUT');assert.equal(r.status,200);const pdfsAntes=system.repo.listPDFs(q.id).length;
  // Logado: página e script com no-store e noindex.
  r=await request('/abordagens');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(await r.text(),/\/abordagens\/app\.js/);
  r=await request('/abordagens/app.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);
  assert.equal((await (await request('/api/abordagens')).json()).dados,null);
  // Importação: formato, orçamento inexistente, CSRF.
  assert.equal((await request('/api/abordagens/importar',{versao:2,clientes:[]})).status,400);
  r=await request('/api/abordagens/importar',{versao:1,clientes:[cliente('nao-existe')]});assert.equal(r.status,400);assert.match((await r.json()).error,/não existem/);
  r=await request('/api/abordagens/importar',{versao:1,clientes:[cliente(q.id,{grupo:'outro'})]});assert.equal(r.status,400);
  const csrfOk=csrf;csrf='errado';assert.equal((await request('/api/abordagens/importar',{versao:1,clientes:[cliente(q.id)]})).status,403);csrf=csrfOk;
  r=await request('/api/abordagens/importar',{versao:1,divisao:'misto',clientes:[cliente(q.id,{telefone:'abc'})]});assert.equal(r.status,200);assert.equal((await r.json()).importados,1);
  let data=await (await request('/api/abordagens')).json();
  assert.equal(data.dados.clientes.length,1);assert.equal(data.dados.clientes[0].telefone,null);assert.equal(data.vivo[q.id].status,'generated');assert.deepEqual(data.enviados,{});
  // Enviado: grava com data/hora, sobrevive a nova leitura e a reimportação; desmarca.
  assert.equal((await request(`/api/abordagens/${q.id}/enviado`,{enviado:'sim'},'PUT')).status,400);
  assert.equal((await request('/api/abordagens/outro/enviado',{enviado:true},'PUT')).status,404);
  r=await request(`/api/abordagens/${q.id}/enviado`,{enviado:true},'PUT');assert.equal(r.status,200);assert.ok((await r.json()).enviado.em);
  assert.ok((await (await request('/api/abordagens')).json()).enviados[q.id].em);
  assert.equal((await request('/api/abordagens/importar',{versao:1,clientes:[cliente(q.id)]})).status,200);
  assert.ok((await (await request('/api/abordagens')).json()).enviados[q.id]);
  r=await request(`/api/abordagens/${q.id}/enviado`,{enviado:false},'PUT');assert.equal((await r.json()).enviado,null);
  assert.deepEqual((await (await request('/api/abordagens')).json()).enviados,{});
  // A página não cria documentos nem versões do orçamento.
  assert.equal(system.repo.listPDFs(q.id).length,pdfsAntes);
  console.log('PASS: /abordagens exige login, não fica em public/, valida a importação e grava o enviado.');
}finally{server.close();try{system.repo.close()}catch{}try{fs.rmSync(dir,{recursive:true,force:true})}catch{}}
