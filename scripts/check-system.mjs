import assert from 'node:assert/strict';
import fs from 'node:fs';
import { modelo, prepararProposta } from '../utils/proposta.js';
import { gerarPDFEcoclean } from '../utils/ecocleanPdf.js';
import {company,settings,fees,image} from './test-company.mjs';
const fresh=modelo.quote();
assert.equal(fresh.company.name,'');assert.equal(fresh.company.logo,'');assert.equal(fresh.company.location,'');assert.equal(fresh.company.phone,'');assert.equal(fresh.company.intro,'');
assert.equal(fresh.terms.fixedFee,.49);assert.equal(fresh.terms.rate6,3.49);assert.equal(fresh.terms.anticipate,'yes');assert.equal(fresh.terms.installments,3);
assert.equal(modelo.services.length,10);modelo.configure(settings);
const q=modelo.quote({...settings,terms:fees});
q.client='Cliente de exemplo';q.address='Endereço do atendimento';q.date='2026-09-10';
assert.equal(q.terms.installments,3);
q.items=[['Limpeza de carpete',600,12],['Cadeiras estofadas',36,29.99],['Sofá',15,229.99]].map(([s,n,p])=>({...modelo.item(s),quantity:n,price:p}));
const totals=modelo.totals(q);
assert.equal(totals.pix,1172949);
assert.ok(totals.total>totals.pix);
assert.ok(totals.net>=totals.pix);
assert.equal(totals.part*totals.count+totals.remainder,totals.total);
const normalized=prepararProposta(q);assert.equal(normalized.items[1].quantity,36);
assert.throws(()=>prepararProposta({...q,items:[{...q.items[0],price:-1}]}));
assert.throws(()=>prepararProposta({...q,items:[{...q.items[0],photos:['https://example.com/image.png']}]}));
assert.throws(()=>prepararProposta({...q,terms:{...q.terms,installments:0}}));
const old=modelo.normalize({id:'legacy',client:'Cliente anterior',address:'Rua anterior',items:[{name:'Cadeira estofada',quantity:4,price:15,unit:'un.'}],company:'Empresa anterior',phone:'123',intro:'Texto original'});
assert.equal(old.company.name,'Empresa anterior');assert.equal(old.company.intro,'Texto original');assert.equal(old.items[0].price,15);
assert.equal(old.terms.installments,3);
assert.equal(modelo.normalizeTerms({installments:1,discount:10}).pricingVersion,3);
const example=structuredClone(q);example.items=[{...modelo.item('Sofá'),price:200,photos:[image]}];
assert.deepEqual(modelo.totals(example).days,[32,64,96]);
assert.equal(modelo.totals(example).pix,20000);
assert.equal(modelo.totals(example).total,21558);
assert.equal(modelo.totals(example).part,7186);
const weekend=structuredClone(example);weekend.date='2026-09-11';assert.deepEqual(modelo.totals(weekend).days,[32,66,96]);
// Sem antecipação, inclusive em 1x, há repasse da taxa sobre o bruto.
example.terms.anticipate='no';example.terms.installments=1;
assert.equal(modelo.totals(example).total,20667);
for(const [count,rate] of [[1,2.99],[2,3.49],[6,3.49],[7,3.99],[12,3.99],[13,4.29],[21,4.29]]){
  example.terms.installments=count;const t=modelo.totals(example);
  assert.equal(t.rate,rate);assert.ok(t.net>=20000);assert.equal(t.part*count,t.total);
}
for(const anticipation of ['yes','no'])for(const count of [1,3,6,12,21])for(const value of [.01,10,200,279,10000]){
  example.terms.anticipate=anticipation;example.terms.installments=count;example.items[0].price=value;
  const t=modelo.totals(example);assert.equal(t.pix,Math.round(value*100));assert.ok(t.net>=t.pix);assert.equal(t.part*count,t.total);
}
example.terms=modelo.terms();example.items[0].price=0;assert.equal(modelo.totals(example).total,0);
example.items[0].price=200;
fs.mkdirSync('validacao',{recursive:true});
const pdf=await gerarPDFEcoclean(normalized);fs.copyFileSync(pdf,'validacao/proposta-universal.pdf');
fs.copyFileSync(await gerarPDFEcoclean(example),'validacao/proposta-200.pdf');
const two=structuredClone(example);two.items.push({...modelo.item('Colchão'),price:150});fs.copyFileSync(await gerarPDFEcoclean(two),'validacao/proposta-dois-itens.pdf');
const extensive=structuredClone(q);extensive.items=Array.from({length:20},()=>({...modelo.item('Sofá'),price:199,photos:[image]}));
const long=await gerarPDFEcoclean(extensive);fs.copyFileSync(long,'validacao/proposta-universal-extensa.pdf');
assert.equal(fs.readFileSync(pdf).subarray(0,5).toString(),'%PDF-');
console.log('OK: identidade neutra, catálogo configurável, preços manuais, centavos, validação, legado e PDFs com múltiplas páginas.');
