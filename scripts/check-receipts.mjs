// Comprovantes de despesa: leitura de PDF com texto e de foto (OCR no servidor), interpretação dos campos,
// armazenamento privado, vínculo com a despesa e recusas (tipo, tamanho, PDF falso).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {Jimp,loadFont} from 'jimp';
import {SANS_32_BLACK} from 'jimp/fonts';
import {parseReceipt,receiptText,ReceiptStore} from '../backend/receipts.js';
import {Repository} from '../backend/database.js';

const cats=[{id:'c1',name:'Combustível',active:true},{id:'c2',name:'Materiais de limpeza',active:true},{id:'c3',name:'Aluguel',active:true}];
const today='2026-11-10';

// 1) Interpretação pura
const cupom=`POSTO SHELL AVENIDA LTDA\nCNPJ: 12.345.678/0001-90\nRUA DAS FLORES 10 - SANTO ANDRE\nCUPOM FISCAL ELETRONICO\nDATA EMISSAO 05/11/2026 14:32\nGASOLINA COMUM 40,000 L X 6,25\nSUBTOTAL 250,00\nDESCONTO 0,00\nVALOR TOTAL R$ 250,00\nTRIBUTOS APROX R$ 80,12\nTROCO 0,00`;
let r=parseReceipt(cupom,{categories:cats,today});
assert.equal(r.amountCents,25000);assert.equal(r.date,'2026-11-05');assert.equal(r.competence,'2026-11');assert.equal(r.cnpj,'12.345.678/0001-90');
assert.equal(r.supplier,'Posto Shell Avenida LTDA');assert.equal(r.categoryId,'c1');assert.match(r.description,/Combustível · Posto Shell/);
const pix=`Comprovante de transferência\nPix enviado\n03/11/2026 - 09:10\nValor\nR$ 1.850,00\nPara\nIMOBILIARIA SAO JOSE LTDA\nCPF/CNPJ ***.456.789-**\nInstituição BANCO X`;
r=parseReceipt(pix,{categories:cats,today});
assert.equal(r.amountCents,185000);assert.equal(r.supplier,'Imobiliaria Sao Jose LTDA');assert.equal(r.categoryId,'c3');assert.equal(r.date,'2026-11-03');
r=parseReceipt('Ilegível ### 12',{categories:cats,today});assert.equal(r.amountCents,null);assert.deepEqual(r.found,[]);
r=parseReceipt('NOTA\nEmissão 01/01/2019\nTOTAL 10,00',{categories:cats,today});assert.equal(r.date,null,'data muito antiga é ignorada');

// 2) PDF com texto (unpdf)
const pdf=await new Promise(ok=>{const d=new PDFDocument({size:'A5'}),parts=[];d.on('data',c=>parts.push(c));d.on('end',()=>ok(Buffer.concat(parts)));
 d.fontSize(13).text('QUIMICA BRASIL PRODUTOS DE LIMPEZA LTDA');d.text('CNPJ 98.765.432/0001-10');d.text('NOTA FISCAL ELETRONICA - DANFE');d.text('Data de emissão: 07/11/2026');d.text('Shampoo para estofados 5L');d.text('VALOR TOTAL DA NOTA R$ 389,90');d.end();});
const pdfFields=parseReceipt(await receiptText('application/pdf',pdf),{categories:cats,today});
assert.equal(pdfFields.amountCents,38990);assert.equal(pdfFields.date,'2026-11-07');assert.equal(pdfFields.categoryId,'c2');assert.match(pdfFields.supplier,/Quimica Brasil/);

// 3) Foto (OCR tesseract.js, português local)
const font=await loadFont(SANS_32_BLACK),img=new Jimp({width:760,height:520,color:0xffffffff});
['POSTO SHELL AVENIDA LTDA','CNPJ 12.345.678/0001-90','DATA EMISSAO 05/11/2026','GASOLINA COMUM','VALOR TOTAL R$ 250,00'].forEach((t,i)=>img.print({font,x:30,y:30+i*90,text:t}));
const ocr=await receiptText('image/png',await img.getBuffer('image/png'));
const photo=parseReceipt(ocr,{categories:cats,today});
assert.equal(photo.amountCents,25000,'OCR leu o total: '+ocr);assert.equal(photo.date,'2026-11-05');assert.equal(photo.categoryId,'c1');

// 4) Armazenamento
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'herbo-receipts-'));const repo=new Repository(dir);
try{
 const store=new ReceiptStore(repo),url='data:application/pdf;base64,'+pdf.toString('base64');
 const {record}=store.save({name:'nota <script>.pdf',dataUrl:url});
 assert.equal(record.name,'nota script.pdf');assert.ok(fs.existsSync(store.file(record)));assert.equal(record.expense_id,null);
 store.attach(record.id,'exp-1');assert.equal(store.get(record.id).expense_id,'exp-1');assert.throws(()=>store.attach(record.id,'exp-2'),e=>e.status===409);
 assert.throws(()=>store.save({dataUrl:'data:image/gif;base64,R0lGOD'}),e=>e.status===400);
 assert.throws(()=>store.save({dataUrl:'data:application/pdf;base64,'+Buffer.from('não é pdf').toString('base64')}),e=>e.status===400);
 assert.throws(()=>store.save({dataUrl:'data:image/png;base64,'+Buffer.alloc(10*1024*1024+1).toString('base64')}),e=>e.status===413);
 // Enviado e nunca salvo: some depois de 24 h.
 const {record:orphan}=store.save({name:'x.pdf',dataUrl:url});repo.db.prepare('UPDATE finance_receipts SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',orphan.id);
 store.cleanup();assert.equal(store.get(orphan.id),null);assert.equal(fs.existsSync(store.file(orphan)),false);assert.ok(store.get(record.id),'vinculado continua');
 repo.close();
}finally{fs.rmSync(dir,{recursive:true,force:true})}
console.log('PASS: comprovantes — cupom, Pix, PDF com texto (unpdf), foto com OCR (tesseract.js, português local), campos sugeridos, arquivo privado, vínculo único, tipos/tamanho e limpeza de não salvos.');
process.exit(0);
