import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { modelo } from '../utils/proposta.js';

export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9._-]{1,140}$/.test(id);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function documentHash(q){
  const {number,date,client,address,clientContact,company,terms}=q;
  const items=q.items.map(({service,description,unit,quantity,price,photos})=>({service,description,unit,quantity,price,photos}));
  return hash(JSON.stringify({number,date,client,address,clientContact,company,terms,items}));
}
export function cleanQuote(raw,strict=false){
  if(!raw||!validId(raw.id))throw fail(400,'Identificador do orçamento inválido.');
  if(strict)modelo.validate(raw);
  if(raw.company?.logo&&!modelo.image(raw.company.logo))throw fail(400,'Logotipo inválido.');
  if(!Array.isArray(raw.items)||raw.items.some(i=>!Array.isArray(i.photos)||i.photos.length>6||i.photos.some(p=>!modelo.image(p))))throw fail(400,'As fotos do orçamento são inválidas.');
  const q=modelo.toPublicProposal(raw);if(strict)modelo.validate(q);return q;
}
export class Repository{
  constructor(dir){
    this.dir=path.resolve(dir);fs.mkdirSync(this.dir,{recursive:true});this.files=path.join(this.dir,'pdfs');fs.mkdirSync(this.files,{recursive:true});
    this.db=new DatabaseSync(path.join(this.dir,'ecoclean.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY,snapshot TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY REFERENCES proposals(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pdfs (id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL REFERENCES proposals(id),version INTEGER NOT NULL,filename TEXT NOT NULL,storage_key TEXT NOT NULL,snapshot TEXT NOT NULL,fingerprint TEXT NOT NULL,generated_at TEXT NOT NULL,UNIQUE(proposal_id,version));
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY,session_id TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS drive_files (pdf_id TEXT NOT NULL,account TEXT NOT NULL,drive_id TEXT NOT NULL,url TEXT,status TEXT NOT NULL,PRIMARY KEY(pdf_id,account));
      CREATE TABLE IF NOT EXISTS sync_jobs (proposal_id TEXT PRIMARY KEY,intent TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY,request_hash TEXT NOT NULL,response TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS migrations (source_id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS leases (key TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS pdfs_proposal ON pdfs(proposal_id);
      CREATE INDEX IF NOT EXISTS proposals_updated ON proposals(updated_at);`);
    if(!this.config('workspaceId'))this.setConfig('workspaceId',randomUUID());
  }
  close(){this.db.close()}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
  config(key){const r=this.db.prepare('SELECT value FROM config WHERE key=?').get(key);return r?JSON.parse(r.value):null}
  setConfig(key,value){this.db.prepare('INSERT INTO config VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value))}
  list(){return this.db.prepare('SELECT * FROM proposals ORDER BY updated_at DESC').all().map(r=>({...JSON.parse(r.snapshot),revision:r.revision}))}
  proposal(id){const r=this.db.prepare('SELECT * FROM proposals WHERE id=?').get(id);return r?{...JSON.parse(r.snapshot),revision:r.revision}:null}
  requireProposal(id){const q=this.proposal(id);if(!q)throw fail(404,'Orçamento não encontrado.');return q}
  saveProposal(raw,{force=false}={}){
    const q=cleanQuote(raw),now=new Date().toISOString();
    return this.transaction(()=>{
      const current=this.proposal(q.id);
      if(current&&!force&&Number(raw.revision)!==current.revision){
        if(documentHash(current)===documentHash(q))return current;
        throw fail(409,'Este orçamento foi atualizado em outra aba. Reabra-o antes de salvar; seu rascunho continua disponível.');
      }
      const revision=(current?.revision||0)+1;q.updatedAt=now;
      this.db.prepare('INSERT INTO proposals VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,revision=excluded.revision,updated_at=excluded.updated_at').run(q.id,JSON.stringify(q),revision,now,now);
      return {...q,revision};
    });
  }
  operation(id){const r=this.db.prepare('SELECT data FROM operations WHERE id=?').get(id);return r?JSON.parse(r.data):{id,status:'generated',schedule:null,updatedAt:''}}
  listOperations(){return this.db.prepare('SELECT data FROM operations').all().map(r=>JSON.parse(r.data))}
  setOperation(op){op={...op,updatedAt:new Date().toISOString()};this.db.prepare('INSERT INTO operations VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(op.id,JSON.stringify(op));return op}
  pdf(id){const r=this.db.prepare('SELECT * FROM pdfs WHERE id=?').get(id);return r?this.pdfRecord(r):null}
  pdfRecord(r){return {id:r.id,proposalId:r.proposal_id,version:r.version,filename:r.filename,snapshot:JSON.parse(r.snapshot),fingerprint:r.fingerprint,generatedAt:r.generated_at,url:'/api/pdfs/'+r.id,storageKey:r.storage_key}}
  listPDFs(id){return (id?this.db.prepare('SELECT * FROM pdfs WHERE proposal_id=? ORDER BY version DESC').all(id):this.db.prepare('SELECT * FROM pdfs ORDER BY generated_at DESC').all()).map(r=>this.pdfRecord(r))}
  savePDF(q,file,fingerprint,extra={}){
    return this.transaction(()=>{
      const version=1+Number(this.db.prepare('SELECT COALESCE(MAX(version),0) v FROM pdfs WHERE proposal_id=?').get(q.id).v),id=randomUUID();
      this.db.prepare('INSERT INTO pdfs VALUES (?,?,?,?,?,?,?,?)').run(id,q.id,version,extra.filename||q.number.replace(/[^\w-]/g,'_')+'.pdf',path.basename(file),JSON.stringify(q),fingerprint,extra.generatedAt||new Date().toISOString());return this.pdf(id);
    });
  }
  file(pdf){if(path.basename(pdf.storageKey)!==pdf.storageKey)throw fail(500,'Referência de arquivo inválida.');return path.join(this.files,pdf.storageKey)}
  job(id){const r=this.db.prepare('SELECT intent FROM sync_jobs WHERE proposal_id=?').get(id);return r?JSON.parse(r.intent):null}
  setJob(id,value){this.db.prepare('INSERT INTO sync_jobs VALUES (?,?) ON CONFLICT(proposal_id) DO UPDATE SET intent=excluded.intent').run(id,JSON.stringify(value))}
  complete(id,operation,key,requestHash){return this.transaction(()=>{const op=this.setOperation(operation);this.db.prepare('DELETE FROM sync_jobs WHERE proposal_id=?').run(id);this.db.prepare('INSERT INTO idempotency VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').run(key,requestHash,JSON.stringify(op));return op})}
  purgeCancelledProposal(id){
    const quote=this.requireProposal(id),operation=this.operation(id);
    if(operation.status!=='cancelled')throw fail(409,'A exclusão definitiva está disponível apenas para orçamentos cancelados.');
    if(operation.schedule||this.job(id))throw fail(409,'Cancele o agendamento pendente antes de excluir definitivamente.');
    const exists=name=>!!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if(exists('asaas_payments')){
      const active=this.db.prepare("SELECT status FROM asaas_payments WHERE proposal_id=? AND status NOT IN ('DELETED','REFUNDED','CHARGEBACK_REVERSED')").all(id);
      if(active.length)throw fail(409,'Exclua ou trate as cobranças Asaas pendentes antes de excluir este orçamento. Cobranças recebidas permanecem no histórico financeiro.');
    }
    const pdfs=this.db.prepare('SELECT id,storage_key FROM pdfs WHERE proposal_id=?').all(id);
    const routeIds=exists('finance_routes')?this.db.prepare('SELECT id,data FROM finance_routes').all().filter(row=>{try{return JSON.parse(row.data).destination===quote.address}catch{return false}}).map(row=>row.id):[];
    const geocodeKeys=exists('finance_geocodes')?this.db.prepare("SELECT geocode_key FROM finance_geocodes WHERE subject_type='proposal' AND subject_id=?").all(id).map(row=>row.geocode_key):[];
    this.transaction(()=>{
      for(const pdf of pdfs)this.db.prepare('DELETE FROM drive_files WHERE pdf_id=?').run(pdf.id);
      this.db.prepare('DELETE FROM pdfs WHERE proposal_id=?').run(id);
      if(exists('finance_estimates'))this.db.prepare('DELETE FROM finance_estimates WHERE proposal_id=?').run(id);
      if(exists('finance_actuals'))this.db.prepare('DELETE FROM finance_actuals WHERE proposal_id=?').run(id);
      if(exists('finance_contexts'))this.db.prepare('DELETE FROM finance_contexts WHERE proposal_id=?').run(id);
      if(exists('finance_recognitions'))this.db.prepare('DELETE FROM finance_recognitions WHERE proposal_id=?').run(id);
      if(exists('proposal_attribution'))this.db.prepare('DELETE FROM proposal_attribution WHERE proposal_id=?').run(id);
      if(exists('finance_geocodes')){
        this.db.prepare("DELETE FROM finance_geocodes WHERE subject_type='proposal' AND subject_id=?").run(id);
        for(const key of geocodeKeys){
          const references=this.db.prepare("SELECT COUNT(*) n FROM finance_geocodes WHERE geocode_key=? AND NOT (subject_type='address' AND subject_id=?)").get(key,key).n;
          if(!references)this.db.prepare("DELETE FROM finance_geocodes WHERE subject_type='address' AND subject_id=?").run(key);
        }
      }
      if(exists('finance_routes'))for(const routeId of routeIds)this.db.prepare('DELETE FROM finance_routes WHERE id=?').run(routeId);
      if(exists('finance_audit'))this.db.prepare('DELETE FROM finance_audit WHERE entity_id=?').run(id);
      if(exists('asaas_payments'))this.db.prepare('DELETE FROM asaas_payments WHERE proposal_id=?').run(id);
      this.db.prepare('DELETE FROM sync_jobs WHERE proposal_id=?').run(id);
      this.db.prepare('DELETE FROM leases WHERE key=?').run('proposal:'+id);
      this.db.prepare('DELETE FROM idempotency WHERE response LIKE ?').run('%'+id+'%');
      this.db.prepare('DELETE FROM migrations WHERE proposal_id=?').run(id);
      this.db.prepare('DELETE FROM operations WHERE id=?').run(id);
      this.db.prepare('DELETE FROM proposals WHERE id=?').run(id);
    });
    for(const pdf of pdfs){const file=this.file({storageKey:pdf.storage_key});try{if(fs.existsSync(file))fs.unlinkSync(file)}catch{}}
    return {id,number:quote.number,deletedDocuments:pdfs.length};
  }
  replay(key,requestHash){const r=this.db.prepare('SELECT * FROM idempotency WHERE key=?').get(key);if(!r)return null;if(r.request_hash!==requestHash)throw fail(409,'Esta confirmação já foi usada com outros dados. Revise novamente.');return JSON.parse(r.response)}
  claim(key,owner){const now=Date.now();return this.transaction(()=>{const r=this.db.prepare('SELECT * FROM leases WHERE key=?').get(key);if(r&&r.expires>now)throw fail(409,'Há uma operação em andamento. Aguarde e tente novamente.');this.db.prepare('INSERT OR REPLACE INTO leases VALUES (?,?,?)').run(key,owner,now+300000)})}
  release(key,owner){this.db.prepare('DELETE FROM leases WHERE key=? AND owner=?').run(key,owner)}
}

