import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {modelo} from './proposta.js';
import { Jimp } from 'jimp';
import '../public/pdf-renderer.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const asset=name=>path.join(root,'public','assets',name);

async function decodeImage(value) {
  const buffer=Buffer.from(value.split(',')[1],'base64');
  // O formulário normaliza as fotos em JPEG. Backups podem conter WebP.
  return value.startsWith('data:image/webp;') ? (await Jimp.read(buffer)).getBuffer('image/png') : buffer;
}

export async function gerarPDFEcoclean(q, options = {}) {
  q=modelo.toPublicProposal(q);
  const photos=await Promise.all(q.items.map(i=>Promise.all(i.photos.map(decodeImage))));
  const logo=q.company.logo?await decodeImage(q.company.logo):null;
  const doc=new PDFDocument({size:'A4',margin:0,autoFirstPage:false,info:{Title:`${q.number} - ${q.client}`,Author:q.company.name,Subject:'Proposta comercial'}});
  doc.registerFont('EC',asset('plus-jakarta-regular.ttf'));
  doc.registerFont('EC-Bold',asset('plus-jakarta-bold.ttf'));
  // Verificar as imagens antes de criar um arquivo de saída.
  for(const buffer of [logo,...photos.flat()].filter(Boolean))doc.openImage(buffer);
  const dir=options.outputDir||path.join(root,'data','pdfs');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`Proposta-${randomUUID()}.pdf`),stream=fs.createWriteStream(file);
  const completed=new Promise((resolve,reject)=>{stream.on('finish',()=>resolve(file));stream.on('error',reject);doc.on('error',reject)});
  doc.pipe(stream);
  try{
    const ready=structuredClone(q);
    ready.company.logo=logo?`data:image/png;base64,${logo.toString("base64")}`:"";
    ready.items.forEach((it,i)=>it.photos=photos[i].map(buffer=>`data:image/png;base64,${buffer.toString("base64")}`));
    globalThis.EcoRenderPDF(doc,ready);
    doc.end();return await completed;
  }catch(error){doc.destroy();stream.destroy();throw error}
}
