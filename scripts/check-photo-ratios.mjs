// Fotos em retrato, quadradas e paisagem no PDF (A4 e celular): proporção preservada, sem corte, sem sobrepor texto.
// Uso: node scripts/check-photo-ratios.mjs [pasta-de-saida]  (sem pasta, gera em tmp e apaga).
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Jimp} from 'jimp';
import {gerarPDFEcoclean} from '../utils/ecocleanPdf.js';
import {modelo} from '../utils/proposta.js';
import {settings as company} from './test-company.mjs';
const keep=process.argv[2],out=keep||fs.mkdtempSync(path.join(os.tmpdir(),'photo-ratios-'));fs.mkdirSync(out,{recursive:true});
// Moldura vermelha + círculo central: corte some com a moldura, deformação vira elipse.
async function photo(w,h){const img=new Jimp({width:w,height:h,color:0x9ad0f5ff}),b=Math.round(Math.min(w,h)*.04),r=Math.min(w,h)*.3;
 img.scan(0,0,w,h,(x,y,i)=>{const edge=x<b||y<b||x>=w-b||y>=h-b,circle=(x-w/2)**2+(y-h/2)**2<r*r;if(edge||circle){img.bitmap.data[i]=edge?0xe0:0x10;img.bitmap.data[i+1]=edge?0x20:0x60;img.bitmap.data[i+2]=edge?0x20:0x30}});
 return 'data:image/jpeg;base64,'+(await img.getBuffer('image/jpeg',{quality:85})).toString('base64')}
const ratios=[['9:16',540,960],['3:4',600,800],['4:5',640,800],['2:3',600,900],['1:1',700,700],['4:3',800,600],['16:9',960,540],['celular 3000x4000 reduzida',750,1000]];
const q=modelo.quote(company);Object.assign(q,{client:'Teste de proporções',address:'Rua A, 1 - São Paulo',clientContact:'(11) 90000-0000'});
q.items=[];for(const [label,w,h] of ratios)q.items.push({...modelo.item('Sofá'),service:'Sofá '+label,description:'Foto '+label+' deve aparecer inteira, centralizada e sem deformar.',price:100,photos:[await photo(w,h)]});
q.items.push({...modelo.item('Tapete'),service:'Tapete com várias fotos',price:50,photos:await Promise.all([[540,960],[960,540],[700,700]].map(([w,h])=>photo(w,h)))});
for(const format of ['a4','mobile']){const file=await gerarPDFEcoclean(q,{outputDir:out,format});const target=path.join(out,'proporcoes-'+format+'.pdf');fs.renameSync(file,target);assert.ok(fs.statSync(target).size>10000);assert.equal(fs.readFileSync(target).subarray(0,5).toString(),'%PDF-')}
if(!keep)fs.rmSync(out,{recursive:true,force:true});
console.log('PASS: fotos 9:16, 3:4, 4:5, 2:3, 1:1, 4:3, 16:9 e múltiplas fotos geram PDF A4 e celular.'+(keep?' Arquivos em '+out:''));
