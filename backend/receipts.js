// Comprovantes de despesa: guarda o arquivo (foto ou PDF) e lê os campos no próprio servidor, sem serviço externo.
// PDF com texto: unpdf (pdf.js da Mozilla, MIT). Foto: tesseract.js (Apache-2.0) com os dados do português locais
// (@tesseract.js-data/por), sem baixar nada na hora. O resultado é sempre uma SUGESTÃO revisada antes de salvar.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {Jimp} from 'jimp';
import {fail} from './database.js';

const require=createRequire(import.meta.url);
const MAX=10*1024*1024;
const TYPES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const fold=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

/* ---------- Leitura do texto ---------- */
let worker=null,workerTimer=null,workerBusy=Promise.resolve();
async function ocrWorker(){
  clearTimeout(workerTimer);
  if(!worker){
    const {createWorker}=await import('tesseract.js'),por=require('@tesseract.js-data/por');
    const cachePath=path.join(os.tmpdir(),'herbo-tesseract');fs.mkdirSync(cachePath,{recursive:true});
    worker=await createWorker('por',1,{langPath:path.join(path.dirname(require.resolve('@tesseract.js-data/por')),'4.0.0_best_int'),gzip:por.gzip,cachePath,logger:()=>{}});
  }
  // Libera a memória depois de 2 minutos sem uso (hospedagem compartilhada).
  workerTimer=setTimeout(()=>{const w=worker;worker=null;w?.terminate().catch(()=>{})},120000);workerTimer.unref?.();
  return worker;
}
async function imageText(buffer){
  let img;try{img=await Jimp.read(buffer)}catch{throw fail(400,'Não foi possível abrir esta imagem. Envie uma foto em JPEG ou PNG.')}
  // Cupom fino e foto grande: escala para ~1800 px de largura, cinza e contraste ajudam o OCR.
  const w=img.width;if(w>2200)img.resize({w:1800});else if(w<900)img.resize({w:Math.min(1600,w*2)});
  img.greyscale().contrast(0.25).normalize();
  const png=await img.getBuffer('image/png');
  // Uma leitura por vez: o OCR usa CPU e memória.
  const run=workerBusy.then(async()=>{const wk=await ocrWorker();const r=await wk.recognize(png);return r.data.text||''});
  workerBusy=run.catch(()=>{});return run;
}
async function pdfText(buffer){
  const {getDocumentProxy,extractText}=await import('unpdf');
  let doc;try{doc=await getDocumentProxy(new Uint8Array(buffer))}catch{throw fail(400,'Não foi possível abrir este PDF.')}
  const {text}=await extractText(doc,{mergePages:true});return String(text||'');
}
export async function receiptText(mime,buffer){return mime==='application/pdf'?pdfText(buffer):imageText(buffer)}

/* ---------- Interpretação (cupom, nota, recibo, boleto, comprovante Pix) ---------- */
const money=s=>{const m=String(s).replace(/\s/g,'').match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);return m?Number(m[1].replace(/\./g,''))*100+Number(m[2]):null};
const VALUE=/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)/g;
const TOTAL_KEYS=/(valor\s+(?:total|pago|a\s+pagar|cobrado|do\s+documento|da\s+transfer[eê]ncia|do\s+pix)|total\s+(?:a\s+pagar|geral|r\$|da\s+nota|pago)|total\b|vlr\.?\s*total|pagamento)/i;
const NOT_TOTAL=/(troco|desconto|subtotal|tributos|imposto|lei\s*12\.?741|aprox|icms|pis|cofins|juros|multa)/i;
const DATE=/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4}|\d{2})\b/g;
const CNPJ=/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;
const NOT_SUPPLIER=/(cupom|fiscal|\bnota\b|nfc-?e|danfe|documento|auxiliar|consumidor|eletr[oô]nic|cnpj|cpf|\bie\b|inscri|endere|telefone|\bfone\b|\bdata\b|\bhora\b|emiss|comprovante|pagamento|transa|\bvia\b|extrato|valor|total|desconto|troco|tributo|protocolo|chave|sefaz|www|http|\bqtd\b|\bitem\b|c[oó]digo)|^(rua|r\.|av\.?|avenida|estrada|rodovia|al\.?|alameda|travessa)\s/i;
const CATEGORY_HINTS=[
  [/combust|gasolin|etanol|alcool|diesel|posto|shell|ipiranga|petrobras|\bbr\b/,/combust|veic|transport|deslocamento|carro|frota/],
  [/pedagio|sem\s*parar|conectcar|veloe|estacionamento|estapar/,/pedag|estacion|deslocamento|transport|veic/],
  [/oficina|pneu|borracharia|mecanic|auto\s*pe[cç]as|revis[aã]o|troca\s+de\s+[oó]leo/,/manuten|veic|frota|carro/],
  [/limpeza|quimic|detergente|shampoo|impermeabiliz|produto|higieniz|extrator|insumo|material/,/material|produto|insumo|quimic|limpeza/],
  [/aluguel|locacao|condominio|imobiliaria/,/aluguel|ocupa|imovel|sede/],
  [/meta\s*platforms|facebook|instagram|google\s*ads|anuncio|publicidade|marketing/,/marketing|publicidade|anunci|midia/],
  [/energia|enel|eletropaulo|light|cemig|copel|sabesp|agua|saneamento/,/energia|agua|utilidade|conta|consumo/],
  [/internet|vivo|claro|\btim\b|oi\s+fibra|net\s+servi|telefon|celular/,/internet|telefon|comunica|conta/],
  [/restaurante|lanchonete|padaria|ifood|alimenta|refei|mercado|supermercado/,/alimenta|refei|mercado/],
  [/contabil|contador|honorario/,/contab|servi[cç]o|profission/],
  [/software|assinatura|saas|licen[cç]a|apple\.com|google\s*workspace|microsoft/,/software|sistema|assinatura|tecnolog/],
];
function bestTotal(lines){
  let pick=null;
  lines.forEach((line,i)=>{
    if(!TOTAL_KEYS.test(line)||NOT_TOTAL.test(line))return;
    const here=[...line.matchAll(VALUE)].map(m=>money(m[1])).filter(v=>v>0),next=here.length?[]:[...(lines[i+1]||'').matchAll(VALUE)].map(m=>money(m[1])).filter(v=>v>0);
    const v=(here.length?here:next).at(-1);if(v)pick={value:v,line:i,strong:/valor\s+(total|pago|a\s+pagar)|total\s+a\s+pagar/i.test(line)||pick?.strong};
  });
  if(pick)return {value:pick.value,how:'total'};
  const all=lines.filter(l=>!NOT_TOTAL.test(l)).flatMap(l=>[...l.matchAll(VALUE)].map(m=>money(m[1]))).filter(v=>v>0&&v<10000000);
  return all.length?{value:Math.max(...all),how:'maior valor'}:null;
}
function bestDate(lines,today){
  const limit=new Date(today+'T12:00:00Z');limit.setUTCDate(limit.getUTCDate()+2);const floor=new Date(today+'T12:00:00Z');floor.setUTCFullYear(floor.getUTCFullYear()-3);
  const found=[];
  lines.forEach((line,i)=>{for(const m of line.matchAll(DATE)){const y=m[3].length===2?'20'+m[3]:m[3],d=`${y}-${m[2]}-${m[1]}`,t=new Date(d+'T12:00:00Z');if(Number.isNaN(t.getTime())||t.toISOString().slice(0,10)!==d||t>limit||t<floor)continue;found.push({d,score:(/emiss|data|pagamento|venc|realizad/i.test(line)?2:0)-i/1000})}});
  found.sort((a,b)=>b.score-a.score);return found[0]?.d||null;
}
function bestSupplier(lines){
  const cnpjAt=lines.findIndex(l=>CNPJ.test(l));
  const ok=l=>{const t=l.trim();if(t.length<4||t.length>70||NOT_SUPPLIER.test(t)||/\d+,\d{2}\b/.test(t))return false;const letters=(t.match(/\p{L}/gu)||[]).length;return letters/t.length>.6};
  // Pix/transferência: "Para", "Favorecido", "Recebedor", "Destino" seguido do nome.
  for(let i=0;i<lines.length;i++){const m=/^(?:para|favorecido|recebedor|destinat[aá]rio|destino|benefici[aá]rio)\s*:?\s*(.*)$/i.exec(lines[i].trim());if(m){const name=(m[1]||lines[i+1]||'').trim();if(ok(name))return name}}
  // Nome quebrado em duas linhas ("... PRODUTOS DE LIMPEZA" / "LTDA"): junta o sufixo à linha de cima.
  const joined=lines.map((l,i)=>/^(ltda\.?|me|epp|eireli|s\.?\/?a\.?)$/i.test(l.trim())&&i>0?null:(/^(ltda\.?|me|epp|eireli|s\.?\/?a\.?)$/i.test((lines[i+1]||'').trim())?l+' '+lines[i+1].trim():l));
  const at=i=>joined[i]??'';
  const near=cnpjAt>0?[...Array(Math.min(3,cnpjAt)).keys()].map(k=>at(cnpjAt-1-k)):[];
  return (near.find(ok)||joined.slice(0,8).filter(v=>v!==null).find(ok)||'').trim();
}
const title=s=>s.toLowerCase().replace(/(^|\s)(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()).replace(/\b(Ltda|Me|Eireli|S\/?a)\b/gi,v=>v.toUpperCase());
export function parseReceipt(text,{categories=[],today=new Date().toISOString().slice(0,10)}={}){
  const lines=String(text||'').split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean),all=fold(lines.join(' '));
  const total=bestTotal(lines),date=bestDate(lines,today),cnpj=(lines.join(' ').match(CNPJ)||[])[1]||'',supplierRaw=bestSupplier(lines);
  const supplier=supplierRaw?title(supplierRaw):'';
  let categoryId=null,categoryName='';
  for(const [hint,cat] of CATEGORY_HINTS){if(!hint.test(all))continue;const c=categories.find(c=>c.active!==false&&cat.test(fold(c.name)));if(c){categoryId=c.id;categoryName=c.name;break}}
  const kind=/\bpix\b/.test(all)?'Pix':/boleto|linha\s+digit/.test(all)?'Boleto':/nfc-?e|cupom\s+fiscal|danfe|nota\s+fiscal/.test(all)?'Nota':'';
  const description=[categoryName&&!/^outr/i.test(categoryName)?categoryName:'',supplier].filter(Boolean).join(' · ')||(kind?kind+' · comprovante':'');
  const found=[total&&'valor',date&&'data',supplier&&'fornecedor',categoryId&&'categoria'].filter(Boolean);
  return {amountCents:total?.value??null,amountHow:total?.how||null,date,competence:date?date.slice(0,7):null,supplier,cnpj,description:description.slice(0,240),categoryId,found,textLength:lines.join(' ').length};
}

/* ---------- Arquivos ---------- */
export class ReceiptStore{
  constructor(repo){
    this.repo=repo;this.dir=path.join(repo.dir,'receipts');fs.mkdirSync(this.dir,{recursive:true});
    repo.db.exec('CREATE TABLE IF NOT EXISTS finance_receipts (id TEXT PRIMARY KEY, storage TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, expense_id TEXT, created_at TEXT NOT NULL)');
  }
  get(id){return this.repo.db.prepare('SELECT * FROM finance_receipts WHERE id=?').get(String(id||''))||null}
  public(r){return r?{id:r.id,name:r.name,mime:r.mime,size:r.size,createdAt:r.created_at}:null}
  file(r){if(path.basename(r.storage)!==r.storage)throw fail(500,'Referência de arquivo inválida.');return path.join(this.dir,r.storage)}
  /** Recebe {name,dataUrl}; guarda e devolve o registro. Recusa tipos e tamanhos fora do limite. */
  save(raw){
    const m=/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw?.dataUrl||'');
    if(!m)throw fail(400,'Envie uma foto (JPEG, PNG ou WEBP) ou um PDF.');
    const mime=m[1];if(!Object.hasOwn(TYPES,mime))throw fail(400,mime.startsWith('image/')?'Formato de imagem não suportado. Envie JPEG, PNG ou WEBP.':'Envie uma foto ou um PDF.');
    const buffer=Buffer.from(m[2],'base64');if(!buffer.length)throw fail(400,'Arquivo vazio.');if(buffer.length>MAX)throw fail(413,'O comprovante deve ter até 10 MB.');
    if(mime==='application/pdf'&&buffer.subarray(0,5).toString()!=='%PDF-')throw fail(400,'Este arquivo não é um PDF válido.');
    this.cleanup();
    const id=crypto.randomUUID(),storage=id+'.'+TYPES[mime],name=String(raw.name||'comprovante').replace(/[^\p{L}\p{N} ._()-]/gu,'').slice(0,120)||'comprovante';
    fs.writeFileSync(path.join(this.dir,storage),buffer,{mode:0o600});
    this.repo.db.prepare('INSERT INTO finance_receipts VALUES (?,?,?,?,?,?,NULL,?)').run(id,storage,name,mime,buffer.length,crypto.createHash('sha256').update(buffer).digest('hex'),new Date().toISOString());
    return {record:this.get(id),buffer};
  }
  /** Vincula à despesa salva. Um comprovante pertence a uma despesa só. */
  attach(id,expenseId){
    const r=this.get(id);if(!r)throw fail(400,'Comprovante não encontrado. Envie o arquivo de novo.');
    if(r.expense_id&&r.expense_id!==expenseId)throw fail(409,'Este comprovante já está em outra despesa.');
    this.repo.db.prepare('UPDATE finance_receipts SET expense_id=? WHERE id=?').run(expenseId,id);return this.public(r);
  }
  // Arquivos enviados e nunca salvos numa despesa somem depois de 24 h.
  cleanup(){
    const old=new Date(Date.now()-86400000).toISOString();
    for(const r of this.repo.db.prepare('SELECT * FROM finance_receipts WHERE expense_id IS NULL AND created_at<?').all(old)){try{fs.rmSync(this.file(r),{force:true})}catch{}this.repo.db.prepare('DELETE FROM finance_receipts WHERE id=?').run(r.id)}
  }
}

export function registerReceipts(app,{store,dre},wrap){
  app.post('/api/finance/receipts',wrap(async(req,res)=>{
    const {record,buffer}=store.save(req.body);let text='',warning=null;
    try{text=await receiptText(record.mime,buffer)}catch(error){warning=error.status?error.message:'Não foi possível ler o comprovante. Preencha os campos manualmente.'}
    const fields=parseReceipt(text,{categories:dre.categories()});
    if(!warning&&record.mime==='application/pdf'&&fields.textLength<20)warning='Este PDF não tem texto (é uma imagem escaneada). Envie uma foto do comprovante para a leitura automática.';
    else if(!warning&&!fields.found.length)warning='Não encontramos os dados no comprovante. Preencha os campos manualmente; o arquivo fica guardado com a despesa.';
    res.json({receipt:store.public(record),fields,warning});
  }));
  app.get('/api/finance/receipts/:id',(req,res)=>{
    const r=store.get(req.params.id);if(!r)throw fail(404,'Comprovante não encontrado.');
    res.set({'Cache-Control':'private, no-store','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(r.name)}`,'X-Content-Type-Options':'nosniff'}).type(r.mime).sendFile(store.file(r));
  });
}
