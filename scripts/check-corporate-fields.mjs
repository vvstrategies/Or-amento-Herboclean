import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {Repository,documentHash} from '../backend/database.js';
import {modelo,prepararProposta} from '../utils/proposta.js';
import {gerarPDFEcoclean} from '../utils/ecocleanPdf.js';
import {settings} from './test-company.mjs';

const dir=fs.mkdtempSync(path.resolve('.tools/corporate-check-'));
const repo=new Repository(dir);
try {
  const q=modelo.quote(settings);
  Object.assign(q,{client:'Contato de teste corporativo',address:'Endereço fictício para validação',tags:['corporativo'],clientLegalName:'Empresa Exemplo Ltda.',clientCnpj:'12345678000195'});
  q.items=[{...modelo.item('Sofá'),price:300}];
  const normalized=prepararProposta(q);
  assert.equal(normalized.clientCnpj,'12.345.678/0001-95');
  assert.equal(normalized.clientLegalName,q.clientLegalName);
  assert.equal(modelo.formatCnpj('12abc34501de35'),'12.ABC.345/01DE-35');
  const saved=repo.saveProposal(normalized);
  const restored=repo.requireProposal(saved.id);
  assert.equal(restored.clientLegalName,q.clientLegalName);
  assert.equal(restored.clientCnpj,normalized.clientCnpj);
  const edited=repo.saveProposal({...restored,clientLegalName:'Empresa Alterada Ltda.'});
  assert.equal(repo.requireProposal(saved.id).clientLegalName,'Empresa Alterada Ltda.');
  assert.notEqual(documentHash(restored),documentHash(edited));
  assert.notEqual(documentHash(restored),documentHash({...restored,clientCnpj:'98.765.432/0001-10'}));
  const residential=modelo.normalize({...restored,tags:['residencial']});
  assert.deepEqual(modelo.corporateDetails(residential),[]);
  assert.equal(residential.clientLegalName,q.clientLegalName);
  assert.equal(residential.clientCnpj,normalized.clientCnpj);
  assert.notEqual(documentHash(restored),documentHash(residential));
  const empty=prepararProposta({...restored,clientLegalName:'',clientCnpj:''});
  assert.deepEqual(modelo.corporateDetails(empty),[]);
  assert.equal(documentHash(empty),documentHash({...empty,tags:[]}));
  const legacy={...empty};delete legacy.clientLegalName;delete legacy.clientCnpj;
  assert.equal(documentHash(legacy),documentHash(empty));
  assert.equal(modelo.normalize(legacy).clientCnpj,'');
  // Compare the browser's PDF fingerprint to the server's fingerprint.
  const context={EcoModel:modelo,indexedDB:{open:()=>({})},crypto:webcrypto,TextEncoder,Uint8Array};
  vm.runInNewContext(fs.readFileSync('public/store.js','utf8'),context);
  for(const value of [restored,edited,residential,empty,legacy])assert.equal(await context.EcoStore.fingerprint(value),documentHash(value));
  for(const format of ['a4','mobile']){
    const file=await gerarPDFEcoclean(restored,{format,outputDir:dir});
    assert.equal(fs.readFileSync(file).subarray(0,5).toString(),'%PDF-');
    fs.copyFileSync(file,path.join(dir,`corporativo-${format}.pdf`));
  }
  console.log('PASS: campos opcionais, máscara, persistência, reedição, tag residencial, legado, hash navegador/servidor e PDFs A4/celular.');
  console.log('Artefatos de teste: '+dir);
} finally {repo.close();}
