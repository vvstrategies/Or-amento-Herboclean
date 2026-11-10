// Custo por tag: mesma metodologia do painel, segmentada; sem atribuição inventada; múltiplas tags; período; sem divisão por zero.
// Também confere a semântica do filtro do kanban (tag = tipo de cliente, origem = canal) e a exclusão pela regra de versões.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Repository} from '../backend/database.js';
import {CommercialService} from '../backend/commercial.js';
import {migrateIntegrations} from '../backend/integration-migration.js';
import {localDate} from '../backend/dre-domain.js';
import {modelo} from '../utils/proposta.js';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'herboclean-tags-'));const repo=new Repository(dir);
try{
  repo.setConfig('settings',{company:{...modelo.company(),name:'Teste'},terms:modelo.terms()});migrateIntegrations(repo);
  const s=new CommercialService(repo);s.saveTags([{id:'residencial',label:'RESIDENCIAL'},{id:'comercial',label:'COMERCIAL'},{id:'corporativo',label:'CORPORATIVO'}]);
  const today=localDate(),old='2020-01-15';
  const mk=(client,extra={})=>{const q=modelo.quote();Object.assign(q,{client,address:'Rua A, 1',date:today,clientContact:'(11) 9'+String(Math.random()).slice(2,10),...extra});q.items=[{...modelo.item('Sofá'),price:extra.price??100}];return repo.saveProposal(modelo.normalize(q))};
  const done=q=>repo.setOperation({id:q.id,status:'completed',schedule:null,serviceCompletedAt:today});
  // 3 Residencial (2 do Google Ads, 1 indicação), 2 Comercial (Meta Ads), 1 com duas tags, 1 fora do período.
  const r1=mk('R1',{tags:['residencial'],origin:'google'}),r2=mk('R2',{tags:['residencial'],origin:'google'}),r3=mk('R3',{tags:['residencial'],origin:'indicacao'});
  const c1=mk('C1',{tags:['comercial'],origin:'meta'}),c2=mk('C2',{tags:['comercial'],origin:'meta'});
  mk('Dupla',{tags:['residencial','corporativo'],origin:'google'});mk('Antigo',{tags:['residencial'],origin:'google',date:old});
  done(r1);done(c1);
  const spend=(provider,campaign,name,cents,day=today)=>repo.db.prepare('INSERT INTO ad_spend_daily VALUES (?,?,?,?,?,?,?,?)').run(provider,'1',campaign,day,'BRL',cents,JSON.stringify({campaignName:name,date:day}),'run');
  spend('google-ads','11','Residencial SP',30000);spend('meta-ads','22','Comercial ABC',20000);spend('google-ads','33','Institucional',10000);spend('google-ads','11','Residencial SP',99999,old);

  let d=s.dashboard({from:today,to:today}),row=id=>d.byTag.rows.find(r=>r.tag===id);
  // Sem vínculo de campanha: contagens existem, custo é não atribuível (nada é rateado entre tags).
  assert.equal(row('residencial').quotes,4,'3 residenciais + a de duas tags; a antiga fica fora do período');
  assert.equal(row('comercial').quotes,2);assert.equal(row('residencial').closed,1);assert.equal(row('comercial').closed,1);
  for(const id of ['residencial','comercial','corporativo'])assert.deepEqual([row(id).attributable,row(id).investmentCents,row(id).costPerQuoteCents,row(id).costPerCloseCents],[false,null,null,null]);
  assert.equal(d.byTag.overlapping,true,'avisa quando tags se sobrepõem');assert.equal(d.byTag.spendTotalCents,60000);assert.equal(d.byTag.unattributedSpendCents,60000);
  // Total consolidado continua o do painel, sem somar linhas de tag.
  assert.equal(d.current.campaign.spendCents,60000);assert.equal(d.current.campaign.quotes,6);assert.equal(d.current.campaign.costPerQuoteCents,10000);
  assert.ok(row('residencial').quotes+row('comercial').quotes+row('corporativo').quotes>d.current.campaign.quotes,'linhas de tag não são total');

  // Com vínculo declarado: mesma fórmula do painel (gasto ÷ orçamentos; gasto ÷ fechamentos), só com origem paga no denominador.
  assert.throws(()=>s.saveCampaignTags({'google-ads:11':'inexistente'}),/Tag inválida/);assert.throws(()=>s.saveCampaignTags({'x:1':'residencial'}),/Campanha inválida/);
  s.saveCampaignTags({'google-ads:11':'residencial','meta-ads:22':'comercial'});
  d=s.dashboard({from:today,to:today});
  assert.equal(row('residencial').investmentCents,30000,'só o gasto do período');assert.equal(row('residencial').paidQuotes,3,'R1, R2 e Dupla (Google)');
  assert.equal(row('residencial').costPerQuoteCents,10000);assert.equal(row('residencial').costPerCloseCents,30000);
  assert.equal(row('comercial').costPerQuoteCents,10000);assert.equal(row('comercial').costPerCloseCents,20000);
  assert.equal(row('corporativo').attributable,false);assert.equal(d.byTag.unattributedSpendCents,10000);
  // Origem escolhida na barra: só orçamentos e campanhas daquela plataforma.
  const g=s.dashboard({from:today,to:today,origin:'google'}).byTag;assert.ok(g.campaigns.every(c=>c.provider==='google-ads'),'só campanhas do Google');assert.equal(g.rows.find(r=>r.tag==='comercial').quotes,0,'Comercial só veio do Meta');assert.equal(g.rows.find(r=>r.tag==='residencial').quotes,3,'R1, R2 e Dupla');
  const o=s.dashboard({from:today,to:today,origin:'indicacao'}).byTag;assert.equal(o.campaigns.length,0,'origem sem mídia não tem campanha');
  // Tag sem orçamentos com gasto vinculado: nunca NaN/Infinity.
  s.saveCampaignTags({'google-ads:33':'corporativo','google-ads:11':''});repo.setConfig('quote-tags',[...s.tags(),{id:'vazia',label:'VAZIA'}]);s.saveCampaignTags({'google-ads:33':'vazia'});
  d=s.dashboard({from:today,to:today});assert.equal(row('vazia').quotes,0);assert.equal(row('vazia').costPerQuoteCents,null);assert.equal(row('vazia').costPerCloseCents,null);assert.equal(row('residencial').attributable,false);
  assert.ok(!JSON.stringify(d.byTag).match(/NaN|Infinity/));
  // Período diferente: segue exatamente o filtro do painel.
  d=s.dashboard({from:old,to:old});assert.equal(row('residencial').quotes,1);assert.equal(d.current.campaign.spendCents,99999);

  // Kanban: Corporativo/Residencial são tags; Google/Meta Ads são origem, campos separados.
  const q=repo.proposal(r1.id);assert.deepEqual([q.tags,q.origin],[['residencial'],'google']);

  // Exclusão pelo card = regra de versões: V2 atual excluída → V1 volta; versão única → arquivado; agendado é preservado.
  const v1=mk('Versionado',{tags:['residencial']}),v2=repo.saveProposal({...repo.proposal(v1.id),client:'Versionado V2'});
  assert.notEqual(v1.versionId,v2.versionId);
  const del=repo.deleteVersion(v2.id,v2.versionId);assert.equal(del.promotedVersionId,v1.versionId);assert.equal(repo.proposal(v1.id).client,'Versionado');
  const single=repo.deleteVersion(v1.id,v1.versionId);assert.equal(single.archived,true);assert.equal(repo.proposal(v1.id),null);assert.ok(repo.proposal(v1.id,{includeArchived:true}),'soft delete');
  const sched=mk('Agendado');repo.setOperation({id:sched.id,status:'scheduled',schedule:{start:'2031-01-01T10:00:00Z',end:'2031-01-01T12:00:00Z'}});
  assert.throws(()=>repo.deleteVersion(sched.id,sched.versionId),/agendado ou concluído/);
}finally{repo.close();fs.rmSync(dir,{recursive:true,force:true})}
console.log('PASS: custo por tag — contagem, custo/orçamento, custo/fechamento, período, sem divisão por zero, tags sobrepostas, sem rateio inventado; filtros e exclusão por versão.');
