import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { modelo } from '../utils/proposta.js';

export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9._-]{1,140}$/.test(id);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const proposalFilename=q=>{
  const client=String(q?.client||'').replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ').trim().slice(0,240);
  return client?`Proposta de orçamento para ${client}.pdf`:'Proposta de orçamento.pdf';
};
export function documentHash(q){
  const {number,date,client,address,postalCode,addressStreet,addressNumber,addressComplement,addressNeighborhood,addressCity,addressState,addressIbgeCode,clientContact,company,terms}=q;
  const items=q.items.map(({service,description,unit,quantity,price,photos})=>({service,description,unit,quantity,price,photos}));
  return hash(JSON.stringify({number,date,client,address,postalCode,addressStreet,addressNumber,addressComplement,addressNeighborhood,addressCity,addressState,addressIbgeCode,clientContact,company,terms,items}));
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
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY,snapshot TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,archived_at TEXT);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY REFERENCES proposals(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposal_versions (id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL REFERENCES proposals(id),sequence INTEGER NOT NULL,snapshot TEXT NOT NULL,financial_snapshot TEXT,created_at TEXT NOT NULL,deleted_at TEXT,deleted_by TEXT,UNIQUE(proposal_id,sequence));
      CREATE TABLE IF NOT EXISTS pdfs (id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL REFERENCES proposals(id),version INTEGER NOT NULL,filename TEXT NOT NULL,storage_key TEXT NOT NULL,snapshot TEXT NOT NULL,fingerprint TEXT NOT NULL,generated_at TEXT NOT NULL,proposal_version_id TEXT,UNIQUE(proposal_id,version));
      CREATE TABLE IF NOT EXISTS cep_lookups (postal_code TEXT PRIMARY KEY,data TEXT NOT NULL,provider TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY,session_id TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS drive_files (pdf_id TEXT NOT NULL,account TEXT NOT NULL,drive_id TEXT NOT NULL,url TEXT,status TEXT NOT NULL,PRIMARY KEY(pdf_id,account));
      CREATE TABLE IF NOT EXISTS sync_jobs (proposal_id TEXT PRIMARY KEY,intent TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY,request_hash TEXT NOT NULL,response TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS migrations (source_id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS leases (key TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS pdfs_proposal ON pdfs(proposal_id);
      CREATE INDEX IF NOT EXISTS proposal_versions_active ON proposal_versions(proposal_id,sequence DESC);
      CREATE INDEX IF NOT EXISTS proposals_updated ON proposals(updated_at);`);
    this.ensureColumn('proposals','archived_at','TEXT');
    this.ensureColumn('pdfs','proposal_version_id','TEXT');
    this.migrateProposalVersions();
    if(!this.config('workspaceId'))this.setConfig('workspaceId',randomUUID());
  }
  ensureColumn(table,column,type){const columns=this.db.prepare(`PRAGMA table_info(${table})`).all();if(!columns.some(c=>c.name===column))this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)}
  migrateProposalVersions(){
    this.transaction(()=>{
      const rows=this.db.prepare('SELECT * FROM proposals').all();
      for(const row of rows){
        const quote=JSON.parse(row.snapshot),existing=this.db.prepare('SELECT id FROM proposal_versions WHERE proposal_id=? ORDER BY sequence DESC LIMIT 1').get(row.id);
        if(existing)continue;
        const id=randomUUID(),now=row.created_at||new Date().toISOString();quote.versionId=id;
        this.db.prepare('INSERT INTO proposal_versions (id,proposal_id,sequence,snapshot,financial_snapshot,created_at,deleted_at,deleted_by) VALUES (?,?,?,?,?,?,NULL,NULL)').run(id,row.id,1,JSON.stringify(quote),null,now);
        this.db.prepare('UPDATE proposals SET snapshot=? WHERE id=?').run(JSON.stringify(quote),row.id);
        this.db.prepare('UPDATE pdfs SET proposal_version_id=? WHERE proposal_id=? AND proposal_version_id IS NULL').run(id,row.id);
      }
      this.setConfig('proposal-version-schema-version',1);
    });
  }
  close(){this.db.close()}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
  config(key){const r=this.db.prepare('SELECT value FROM config WHERE key=?').get(key);return r?JSON.parse(r.value):null}
  setConfig(key,value){this.db.prepare('INSERT INTO config VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value))}
  list(){return this.db.prepare('SELECT * FROM proposals WHERE archived_at IS NULL ORDER BY updated_at DESC').all().map(r=>({...JSON.parse(r.snapshot),revision:r.revision}))}
  proposal(id,{includeArchived=false}={}){const r=this.db.prepare(`SELECT * FROM proposals WHERE id=?${includeArchived?'':' AND archived_at IS NULL'}`).get(id);return r?{...JSON.parse(r.snapshot),revision:r.revision}:null}
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
      const changed=!current||documentHash(current)!==documentHash(q);
      let sequence=null;
      if(changed){
        sequence=1+Number(this.db.prepare('SELECT COALESCE(MAX(sequence),0) sequence FROM proposal_versions WHERE proposal_id=?').get(q.id).sequence);
        q.versionId=randomUUID();
      }else q.versionId=current.versionId;
      this.db.prepare('INSERT INTO proposals (id,snapshot,revision,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,revision=excluded.revision,updated_at=excluded.updated_at,archived_at=NULL').run(q.id,JSON.stringify(q),revision,now,now);
      if(changed)this.db.prepare('INSERT INTO proposal_versions (id,proposal_id,sequence,snapshot,financial_snapshot,created_at,deleted_at,deleted_by) VALUES (?,?,?,?,?,?,NULL,NULL)').run(q.versionId,q.id,sequence,JSON.stringify(q),null,now);
      return {...q,revision};
    });
  }
  operation(id){const r=this.db.prepare('SELECT data FROM operations WHERE id=?').get(id);return r?JSON.parse(r.data):{id,status:'generated',schedule:null,updatedAt:''}}
  listOperations(){return this.db.prepare('SELECT data FROM operations').all().map(r=>JSON.parse(r.data))}
  setOperation(op){op={...op,updatedAt:new Date().toISOString()};this.db.prepare('INSERT INTO operations VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(op.id,JSON.stringify(op));return op}
  pdf(id){const r=this.db.prepare('SELECT * FROM pdfs WHERE id=?').get(id);return r?this.pdfRecord(r):null}
  pdfRecord(r){return {id:r.id,proposalId:r.proposal_id,proposalVersionId:r.proposal_version_id||null,version:r.version,filename:r.filename,snapshot:JSON.parse(r.snapshot),fingerprint:r.fingerprint,generatedAt:r.generated_at,url:'/api/pdfs/'+r.id,storageKey:r.storage_key}}
  listPDFs(id,{includeDeleted=false}={}){
    const sql=id?'SELECT p.* FROM pdfs p LEFT JOIN proposal_versions v ON v.id=p.proposal_version_id WHERE p.proposal_id=?'+(includeDeleted?'':' AND (p.proposal_version_id IS NULL OR v.deleted_at IS NULL)')+' ORDER BY p.version DESC':'SELECT p.* FROM pdfs p LEFT JOIN proposal_versions v ON v.id=p.proposal_version_id WHERE p.proposal_version_id IS NULL OR v.deleted_at IS NULL ORDER BY p.generated_at DESC';
    return (id?this.db.prepare(sql).all(id):this.db.prepare(sql).all()).map(r=>this.pdfRecord(r));
  }
  savePDF(q,file,fingerprint,extra={}){
    return this.transaction(()=>{
      const version=1+Number(this.db.prepare('SELECT COALESCE(MAX(version),0) v FROM pdfs WHERE proposal_id=?').get(q.id).v),id=randomUUID();
      this.db.prepare('INSERT INTO pdfs (id,proposal_id,version,filename,storage_key,snapshot,fingerprint,generated_at,proposal_version_id) VALUES (?,?,?,?,?,?,?,?,?)').run(id,q.id,version,extra.filename||proposalFilename(q),path.basename(file),JSON.stringify(q),fingerprint,extra.generatedAt||new Date().toISOString(),q.versionId||null);return this.pdf(id);
    });
  }
  version(id,versionId){const row=this.db.prepare('SELECT * FROM proposal_versions WHERE proposal_id=? AND id=?').get(id,versionId);return row?this.versionRecord(row):null}
  versionRecord(row){return {id:row.id,proposalId:row.proposal_id,sequence:row.sequence,snapshot:JSON.parse(row.snapshot),financialSnapshot:row.financial_snapshot?JSON.parse(row.financial_snapshot):null,createdAt:row.created_at,deletedAt:row.deleted_at||null,deletedBy:row.deleted_by||null}}
  listVersions(id,{includeDeleted=false}={}){const current=this.proposal(id,{includeArchived:true})?.versionId||null;const rows=this.db.prepare('SELECT * FROM proposal_versions WHERE proposal_id=?'+(includeDeleted?'':' AND deleted_at IS NULL')+' ORDER BY sequence DESC').all(id);return rows.map(row=>({...this.versionRecord(row),current:row.id===current}))}
  currentVersion(id){const q=this.requireProposal(id);return q.versionId?this.version(id,q.versionId):null}
  setVersionFinance(proposalId,versionId,snapshot){this.db.prepare('UPDATE proposal_versions SET financial_snapshot=? WHERE proposal_id=? AND id=? AND deleted_at IS NULL').run(JSON.stringify(snapshot),proposalId,versionId)}
  deleteVersion(id,versionId,{deletedBy='administrator'}={}){
    return this.transaction(()=>{
      const proposal=this.proposal(id),version=this.version(id,versionId);if(!proposal||!version||version.deletedAt)throw fail(404,'Versão do orçamento não encontrada.');
      const operation=this.operation(id);if(['scheduled','completed'].includes(operation.status))throw fail(409,'Esta proposta possui atendimento agendado ou concluído. O histórico operacional foi preservado e a versão não pode ser excluída.');
      const payments=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='asaas_payments'").get();
      if(proposal.versionId===versionId&&payments&&this.db.prepare("SELECT 1 FROM asaas_payments WHERE proposal_id=? AND status NOT IN ('DELETED','REFUNDED','CHARGEBACK_REVERSED') LIMIT 1").get(id))throw fail(409,'Trate as cobranças Asaas ativas antes de excluir a versão atual.');
      const now=new Date().toISOString();this.db.prepare('UPDATE proposal_versions SET deleted_at=?,deleted_by=? WHERE id=?').run(now,deletedBy,versionId);
      const remaining=this.listVersions(id),wasCurrent=proposal.versionId===versionId,next=remaining[0]||null;
      if(!next){this.db.prepare('UPDATE proposals SET archived_at=?,updated_at=? WHERE id=?').run(now,now,id);return {archived:true,current:null,deletedVersionId:versionId};}
      if(wasCurrent){const restored=cleanQuote(next.snapshot);restored.versionId=next.id;restored.updatedAt=now;const revision=proposal.revision+1;this.db.prepare('UPDATE proposals SET snapshot=?,revision=?,updated_at=? WHERE id=?').run(JSON.stringify(restored),revision,now,id);return {archived:false,current:{...restored,revision},deletedVersionId:versionId,promotedVersionId:next.id};}
      return {archived:false,current:proposal,deletedVersionId:versionId,promotedVersionId:null};
    });
  }
  file(pdf){if(path.basename(pdf.storageKey)!==pdf.storageKey)throw fail(500,'Referência de arquivo inválida.');return path.join(this.files,pdf.storageKey)}
  job(id){const r=this.db.prepare('SELECT intent FROM sync_jobs WHERE proposal_id=?').get(id);return r?JSON.parse(r.intent):null}
  setJob(id,value){this.db.prepare('INSERT INTO sync_jobs VALUES (?,?) ON CONFLICT(proposal_id) DO UPDATE SET intent=excluded.intent').run(id,JSON.stringify(value))}
  complete(id,operation,key,requestHash){return this.transaction(()=>{const op=this.setOperation(operation);this.db.prepare('DELETE FROM sync_jobs WHERE proposal_id=?').run(id);this.db.prepare('INSERT INTO idempotency VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').run(key,requestHash,JSON.stringify(op));return op})}
  purgeProposal(id){
    const quote=this.requireProposal(id),operation=this.operation(id);
    if(!['cancelled','completed'].includes(operation.status))throw fail(409,'A exclusão definitiva está disponível apenas para orçamentos cancelados ou concluídos.');
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
      this.db.prepare('DELETE FROM proposal_versions WHERE proposal_id=?').run(id);
      this.db.prepare('DELETE FROM proposals WHERE id=?').run(id);
    });
    for(const pdf of pdfs){const file=this.file({storageKey:pdf.storage_key});try{if(fs.existsSync(file))fs.unlinkSync(file)}catch{}}
    return {id,number:quote.number,deletedDocuments:pdfs.length};
  }
  replay(key,requestHash){const r=this.db.prepare('SELECT * FROM idempotency WHERE key=?').get(key);if(!r)return null;if(r.request_hash!==requestHash)throw fail(409,'Esta confirmação já foi usada com outros dados. Revise novamente.');return JSON.parse(r.response)}
  claim(key,owner){const now=Date.now();return this.transaction(()=>{const r=this.db.prepare('SELECT * FROM leases WHERE key=?').get(key);if(r&&r.expires>now)throw fail(409,'Há uma operação em andamento. Aguarde e tente novamente.');this.db.prepare('INSERT OR REPLACE INTO leases VALUES (?,?,?)').run(key,owner,now+300000)})}
  release(key,owner){this.db.prepare('DELETE FROM leases WHERE key=? AND owner=?').run(key,owner)}
}

