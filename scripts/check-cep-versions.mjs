import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Repository,proposalFilename} from '../backend/database.js';
import {CepLookupService} from '../backend/cep-cache.js';
import {modelo} from '../utils/proposta.js';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'herboclean-cep-versions-'));
const repo=new Repository(dir);
try{
  let primaryCalls=0,fallbackCalls=0;
  const cep=new CepLookupService(repo,{primary:{async lookup(value){primaryCalls++;assert.equal(value,'06400000');return {kind:'unavailable'};}},fallback:{async lookup(value){fallbackCalls++;return {kind:'ok',value:{postalCode:value,street:'Rua das Flores',neighborhood:'Centro',city:'Barueri',state:'SP',ibgeCode:'3505708',provider:'viacep'}};}}});
  const address=await cep.lookup('06400-000');assert.equal(address.provider,'viacep');assert.equal(address.city,'Barueri');assert.equal(primaryCalls,1);assert.equal(fallbackCalls,1);
  const cached=await cep.lookup('06400000');assert.equal(cached.cached,true);assert.equal(primaryCalls,1);assert.equal(fallbackCalls,1);
  await assert.rejects(()=>cep.lookup('123'),error=>error.status===400);

  const quote=modelo.quote();quote.client='André Luiz / teste';quote.address='Rua das Flores, 10, Barueri - SP';quote.items=[{...modelo.item('Sofá'),price:300}];
  const v1=repo.saveProposal(quote);repo.setVersionFinance(v1.id,v1.versionId,{id:'finance-v1',result:{complete:true,totalDirectCost:10000},quoteKey:'v1'});
  const v2=repo.saveProposal({...v1,items:[{...v1.items[0],price:500}]});repo.setVersionFinance(v2.id,v2.versionId,{id:'finance-v2',result:{complete:true,totalDirectCost:20000},quoteKey:'v2'});
  let versions=repo.listVersions(v1.id);assert.equal(versions.length,2);assert.equal(versions[0].id,v2.versionId);assert.equal(versions[0].current,true);
  const promoted=repo.deleteVersion(v1.id,v2.versionId);assert.equal(promoted.promotedVersionId,v1.versionId);assert.equal(repo.requireProposal(v1.id).items[0].price,300);assert.equal(repo.currentVersion(v1.id).financialSnapshot.id,'finance-v1');
  versions=repo.listVersions(v1.id);assert.equal(versions.length,1);assert.equal(versions[0].current,true);

  const single=modelo.quote();single.client='Cliente único';single.address='Rua Única, 1';single.items=[{...modelo.item('Sofá'),price:200}];const saved=repo.saveProposal(single);
  assert.equal(repo.deleteVersion(saved.id,saved.versionId).archived,true);assert.equal(repo.list().some(value=>value.id===saved.id),false);
  assert.equal(proposalFilename({client:'André Luiz / teste'}),'Proposta de orçamento para André Luiz teste.pdf');
  console.log('PASS: CEP com fallback/cache, filename profissional e promoção segura de versões.');
}finally{repo.close();fs.rmSync(dir,{recursive:true,force:true});}
