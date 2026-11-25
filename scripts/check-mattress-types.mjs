import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {extractText} from 'unpdf';
import {Repository,documentHash} from '../backend/database.js';
import {modelo,prepararProposta} from '../utils/proposta.js';
import {gerarPDFEcoclean as gerarPDFPJ} from '../utils/ecocleanPdf.js';
import {settings} from './test-company.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pj-mattress-'));
let repo=new Repository(dir);
try {
  const q=modelo.quote(settings);
  Object.assign(q,{client:'Teste de colchões',address:'Endereço de teste'});
  q.items=modelo.mattressTypes.map(type=>({...modelo.item('Colchão'),mattressType:type,price:100}));
  const saved=repo.saveProposal(prepararProposta(q));
  repo.close(); repo=new Repository(dir);
  const restored=repo.requireProposal(saved.id);
  assert.deepEqual(restored.items.map(i=>i.mattressType),modelo.mattressTypes);
  assert.equal(modelo.totals(restored).pix,70000);
  const edited=repo.saveProposal({...restored,items:restored.items.map((i,n)=>n?i:{...i,mattressType:'Queen'})});
  assert.equal(repo.requireProposal(saved.id).items[0].mattressType,'Queen');
  assert.notEqual(documentHash(restored),documentHash(edited));
  const legacy={...restored,items:[modelo.item('Colchão')]};
  legacy.items[0].price=100;
  assert.equal(documentHash(legacy),documentHash({...legacy,items:[{...legacy.items[0],mattressType:''}]}));
  assert.equal(modelo.serviceLabel(modelo.normalize(legacy).items[0]),'Colchão');
  for(const service of ['Sofá','Tapete']) {
    const normalized=modelo.normalize({...legacy,items:[{...modelo.item(service),mattressType:'Queen',price:100}]});
    assert.equal(normalized.items[0].mattressType,undefined);
    assert.equal(modelo.serviceLabel(normalized.items[0]),service);
  }
  assert.equal(modelo.normalize({...legacy,items:[{...legacy.items[0],mattressType:'<script>'}]}).items[0].mattressType,undefined);
  const context={EcoModel:modelo,indexedDB:{open:()=>({})},crypto:webcrypto,TextEncoder,Uint8Array};
  vm.runInNewContext(fs.readFileSync('public/store.js','utf8'),context);
  for(const value of [restored,edited,legacy])assert.equal(await context.EcoStore.fingerprint(value),documentHash(value));
  for(const format of ['a4','mobile']) {
    const pdf=await gerarPDFPJ(restored,{format,outputDir:dir});
    const {text}=await extractText(new Uint8Array(fs.readFileSync(pdf)),{mergePages:true});
    for(const type of modelo.mattressTypes)assert.ok(text.includes('Colchão · '+type),`${format}: ${type}`);
  }
  console.log('PASS: sete tipos, persistência após reinício, edição, legado, troca de serviço, preços, hash navegador/backend e texto dos PDFs A4/celular.');
} finally {repo.close();fs.rmSync(dir,{recursive:true,force:true});}
