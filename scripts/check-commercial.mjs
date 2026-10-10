import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Repository} from '../backend/database.js';
import {CommercialService,campaignMetrics,birthday} from '../backend/commercial.js';
import {localDate} from '../backend/dre-domain.js';
import {modelo} from '../utils/proposta.js';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'herboclean-commercial-'));
const repo=new Repository(dir);
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
try{
  // Fórmulas do pedido: custo por orçamento e por fechamento sempre recalculados.
  assert.equal(campaignMetrics({spendCents:10000,quotes:10}).costPerQuoteCents,1000);
  assert.equal(campaignMetrics({spendCents:10000,quotes:11}).costPerQuoteCents,909);
  assert.equal(campaignMetrics({spendCents:50000,closed:5}).costPerCloseCents,10000);
  assert.equal(campaignMetrics({spendCents:100000,closed:5}).costPerCloseCents,20000);
  const r=campaignMetrics({spendCents:124000,quotes:62,closed:14,revenueCents:987000});
  assert.equal(r.costPerQuoteCents,2000);assert.equal(Math.round(r.roas*100),796);assert.equal(Math.round(r.roi*100),696);
  assert.deepEqual([campaignMetrics({}).roas,campaignMetrics({}).costPerQuoteCents,campaignMetrics({spendCents:500}).costPerCloseCents],[null,null,null]);
  assert.equal(birthday('18/03'),'03-18');assert.equal(birthday('03-18'),'03-18');assert.throws(()=>birthday('31/02'));

  repo.setConfig('settings',{company:{...modelo.company(),name:'Herboclean Higienização Profissional'},terms:modelo.terms()});
  const today=localDate(),mk=(client,extra={})=>{const q=modelo.quote();Object.assign(q,{client,address:'Rua A, 1',date:today,...extra});q.items=[{...modelo.item('Sofá'),price:extra.price??100}];return repo.saveProposal(modelo.normalize(q))};
  const service=new CommercialService(repo);
  assert.deepEqual(service.partners().map(p=>[p.name,p.shareBps]),[['V&V Strategies',5000],['Mestres do Conforto',5000]]);

  // Cada orçamento gera ou reaproveita um cadastro de cliente.
  const a=mk('Clínica Vida Plena',{clientContact:'(11) 98765-4321',origin:'meta',tags:['corporativo'],clientBirthday:'03-18',price:200});service.sync(a);
  const b=mk('Clinica vida plena',{clientContact:'11987654321',origin:'meta'});service.sync(b);
  const c=mk('Paulo Henrique',{origin:'google',price:300});service.sync(c);
  const d=mk('Maria Indicada',{origin:'indicacao'});service.sync(d);
  let clients=service.clients();assert.equal(clients.length,3);
  const vida=clients.find(x=>x.name==='Clínica Vida Plena');assert.equal(vida.quoteCount,2);assert.equal(vida.birthday,'03-18');assert.deepEqual(vida.tags,['corporativo']);
  const edited=service.updateClient(vida.id,{birthday:'25/12',notes:'Somente após 18h',custom:[{label:'Responsável',value:'Dra. Renata'}]});assert.equal(edited.birthday,'12-25');assert.equal(edited.custom[0].value,'Dra. Renata');
  assert.equal(service.clientDetail(vida.id).history.length,2);

  // Conclusões e gasto por canal alimentam o painel.
  repo.setOperation({id:a.id,status:'completed',schedule:{start:today+'T12:00:00Z',end:today+'T14:00:00Z'},serviceCompletedAt:today});
  repo.setOperation({id:c.id,status:'completed',schedule:{start:today+'T12:00:00Z',end:today+'T14:00:00Z'},serviceCompletedAt:today});
  repo.setOperation({id:b.id,status:'cancelled'});
  repo.db.exec('CREATE TABLE IF NOT EXISTS ad_spend_daily(provider TEXT NOT NULL,account_id TEXT NOT NULL,campaign_id TEXT NOT NULL,day TEXT NOT NULL,currency TEXT NOT NULL,spend_cents INTEGER NOT NULL,data TEXT NOT NULL,sync_run_id TEXT NOT NULL,PRIMARY KEY(provider,account_id,campaign_id,day))');
  const spend=(provider,cents,day=today)=>repo.db.prepare('INSERT INTO ad_spend_daily VALUES (?,?,?,?,?,?,?,?)').run(provider,'acc','c-'+provider+day,day,'BRL',cents,JSON.stringify({provider,currency:'BRL',spendCents:cents,date:day}),'run');
  spend('meta-ads',6000);spend('google-ads',4000);spend('meta-ads',999999,addDays(today,-40));
  const from=addDays(today,-29);
  const all=service.dashboard({from,to:today});
  assert.equal(all.current.generated,4);assert.equal(all.current.closed,2);assert.equal(all.current.revenueCents,50000);assert.equal(all.current.cancelled,1);
  assert.equal(all.current.campaign.spendCents,10000);assert.equal(all.current.campaign.costPerQuoteCents,2500);assert.equal(all.current.campaign.costPerCloseCents,5000);
  assert.equal(all.series.current.length,30);assert.equal(all.series.current.at(-1),50000);
  assert.deepEqual(all.services.map(s=>[s.service,s.revenueCents]),[['Sofá',50000]]);
  const meta=service.dashboard({from,to:today,channel:'meta'});
  assert.equal(meta.current.generated,2);assert.equal(meta.current.closed,1);assert.equal(meta.current.campaign.spendCents,6000);assert.equal(meta.current.campaign.costPerQuoteCents,3000);assert.equal(meta.current.campaign.roas,20000/6000);
  const google=service.dashboard({from,to:today,channel:'google'});assert.equal(google.current.revenueCents,30000);assert.equal(Math.round(google.current.campaign.roi*100),650);
  assert.ok(all.channels.find(x=>x.origin==='indicacao'&&x.quotes===1&&x.spendCents===0));
  // Mais um orçamento: o custo por orçamento cai na mesma hora.
  service.sync(mk('Novo lead',{origin:'meta'}));assert.equal(service.dashboard({from,to:today,channel:'meta'}).current.campaign.costPerQuoteCents,2000);
  assert.throws(()=>service.dashboard({from:today,to:from}));assert.throws(()=>service.dashboard({from,to:today,channel:'tiktok'}));

  // Funis: follow-up só antes de agendar, pós-venda só após concluir, perda exige motivo.
  assert.equal(service.setStage(d.id,{funnel:'follow',stage:'f2'}).crm.follow.stage,'f2');
  assert.throws(()=>service.setStage(d.id,{funnel:'follow',stage:'lost'}),/motivo/);
  assert.throws(()=>service.setStage(d.id,{funnel:'pos',stage:'p2'}),/pós-venda/);
  assert.equal(service.setStage(a.id,{funnel:'pos',stage:'p3'}).status,'completed');

  // Sócios e distribuição de lucros.
  assert.throws(()=>service.savePartners([{name:'A',shareBps:6000},{name:'B',shareBps:3000}]),/100%/);
  service.savePartners([{name:'V&V Strategies',shareBps:6000},{name:'Mestres do Conforto',shareBps:4000}]);
  const dre={report:()=>({total:{gross:987000,taxCents:59200,otherDeductions:14800,net:913000,knownCost:321000,opex:172000,investment:0,missingCosts:0,serviceCount:14},
    services:[{costSnapshot:{materialCost:82000,travelCost:41000,otherDirectCosts:198000}}],composition:[{id:'integration-marketing',name:'Marketing · Mídia paga',amountCents:124000},{id:'x',name:'Ferramentas',amountCents:48000}]})};
  const withDre=new CommercialService(repo,{dre});
  const dist=withDre.distribution('2026-10','2026-10');
  assert.equal(dist.profitCents,420000);assert.equal(dist.reserveCents,42000);assert.equal(dist.distributableCents,378000);
  assert.deepEqual(dist.partners.map(p=>p.amountCents),[226800,151200]);assert.equal(dist.direct.reduce((s,x)=>s+x.amountCents,0),321000);
  withDre.saveDistributionSettings({reserveBps:0});assert.equal(withDre.distribution('2026-10','2026-10').distributableCents,420000);
  const rec=withDre.recordDistribution({from:'2026-10',to:'2026-10'});assert.equal(rec.status,'pending');assert.throws(()=>withDre.recordDistribution({from:'2026-10',to:'2026-10'}),/Já existe/);
  assert.equal(withDre.markPaid(rec.id,{paidAt:today}).status,'paid');assert.throws(()=>withDre.deleteDistribution(rec.id),/pagas/);

  // Exclusão definitiva remove o vínculo com o cliente.
  repo.purgeProposal(b.id);assert.equal(repo.db.prepare('SELECT COUNT(*) n FROM client_links WHERE proposal_id=?').get(b.id).n,0);
  console.log('PASS: comercial — custo por orçamento/fechamento, ROAS/ROI por canal, painel por período, clientes automáticos, aniversário, funis, sócios e distribuição de lucros.');
}finally{repo.close();fs.rmSync(dir,{recursive:true,force:true})}
