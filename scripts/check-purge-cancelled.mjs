import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../backend/app.js';
import {modelo} from '../utils/proposta.js';
import {settings as company,fees} from './test-company.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'herboclean-purge-'));
const system=createApp({origin:'http://localhost:3198',dataDir:dir});
const repo=system.repo;
try{
 const quote=modelo.quote({...company,terms:fees});quote.client='Teste para exclusão';quote.address='Rua de teste, 100, Santo André - SP';quote.items=[{...modelo.item('Sofá'),price:200}];
 const saved=repo.saveProposal(quote),operation=repo.setOperation({id:saved.id,status:'cancelled',schedule:null,suggestedSchedule:null});
 const storage='purge-fixture.pdf',file=path.join(repo.files,storage);fs.writeFileSync(file,'%PDF-1.4 fixture');
 const pdf=repo.savePDF(saved,file,'fixture-fingerprint');
 repo.db.prepare('INSERT INTO drive_files VALUES (?,?,?,?,?)').run(pdf.id,'account','drive-file','https://example.invalid/file','ready');
 repo.db.prepare('INSERT INTO finance_estimates VALUES (?,?,?,?,?)').run(crypto.randomUUID(),saved.id,1,'{}',new Date().toISOString());
 repo.db.prepare('INSERT INTO finance_actuals VALUES (?,?,?,?)').run(saved.id,1,'{}',new Date().toISOString());
 repo.db.prepare('INSERT INTO finance_contexts VALUES (?,?,?,?,?)').run(saved.id,'santo andre','teste', '{}',1);
 repo.db.prepare('INSERT INTO finance_geocodes VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),'address-test','proposal',saved.id,JSON.stringify({addressKey:'address-test'}),new Date().toISOString());
 repo.db.prepare('INSERT INTO finance_routes VALUES (?,?,?,?)').run(crypto.randomUUID(),'route-test',JSON.stringify({destination:saved.address}),new Date().toISOString());
 repo.db.prepare('INSERT INTO finance_audit VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),'actual',saved.id,'administrator',new Date().toISOString(),'{}');
 const deleted=repo.purgeCancelledProposal(saved.id);
 assert.equal(deleted.id,saved.id);assert.equal(deleted.deletedDocuments,1);assert.equal(repo.proposal(saved.id),null);assert.equal(repo.pdf(pdf.id),null);assert.equal(fs.existsSync(file),false);
 for(const [table,column] of [['operations','id'],['finance_estimates','proposal_id'],['finance_actuals','proposal_id'],['finance_contexts','proposal_id'],['finance_geocodes','subject_id'],['finance_audit','entity_id']])assert.equal(repo.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE '+column+'=?').get(saved.id).n,0,table);
 const active=modelo.quote({...company,terms:fees});active.id=crypto.randomUUID();active.client='Não excluir';active.items=[{...modelo.item('Sofá'),price:100}];const current=repo.saveProposal(active);
 assert.throws(()=>repo.purgeCancelledProposal(current.id),error=>error.status===409);
 console.log('PASS: exclusão definitiva remove dados locais de orçamento cancelado, documentos, dados financeiros, cache associado e auditoria.');
}finally{repo.close();fs.rmSync(dir,{recursive:true,force:true});}
