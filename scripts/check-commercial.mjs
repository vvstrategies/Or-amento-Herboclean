import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Repository} from '../backend/database.js';
import {CommercialService,campaignMetrics,birthday,DEFAULT_TAGS} from '../backend/commercial.js';
import {placeFromAddress,placeOf} from '../backend/address.js';
import {money} from '../backend/format.js';
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

  // Chaves do protótipo nunca valem como canal, funil ou origem.
  for(const key of ['constructor','__proto__','toString','hasOwnProperty'])assert.throws(()=>service.dashboard({from,to:today,channel:key}),e=>e.status===400&&/Canal inválido/.test(e.message),key);
  assert.throws(()=>service.setStage(d.id,{funnel:'constructor',stage:'f1'}),e=>e.status===400);
  assert.throws(()=>service.updateClient(vida.id,{origin:'toString'}),e=>e.status===400&&/Origem/.test(e.message));
  // Tags: identificador restrito e só tags cadastradas (as que o registro já tinha continuam).
  assert.throws(()=>service.saveTags([{id:'Com Espaço',label:'X'}]),/Identificador de tag/);assert.throws(()=>service.saveTags([null]),/Tag inválida/);
  assert.throws(()=>service.updateClient(vida.id,{tags:['inexistente']}),/não está cadastrada/);assert.throws(()=>service.checkTags(['__proto__']),/Tag inválida/);
  service.saveTags([{id:'vip',label:'vip'}]);assert.deepEqual(service.updateClient(vida.id,{tags:['corporativo','vip']}).tags,['corporativo','vip']);
  assert.throws(()=>service.createClient({name:'Outro',tags:['corporativo']}),/não está cadastrada/);service.saveTags([...DEFAULT_TAGS,{id:'vip',label:'VIP'}]);
  // Campos personalizados: só texto, sem espaços sobrando, rótulos únicos e com limite de tamanho; observações aparadas.
  assert.throws(()=>service.updateClient(vida.id,{custom:[{label:'Idade',value:42}]}),/apenas texto/);
  assert.throws(()=>service.updateClient(vida.id,{custom:[{label:'x'.repeat(61),value:''}]}),/60 caracteres/);assert.throws(()=>service.updateClient(vida.id,{custom:[{label:'Obs',value:'x'.repeat(501)}]}),/500 caracteres/);
  const cleaned=service.updateClient(vida.id,{custom:[{label:' Responsável ',value:' Dra. Renata '},{label:'responsavel',value:'Outro'},{label:'',value:'sem rótulo'}],notes:'  Somente após 18h  '});
  assert.deepEqual(cleaned.custom,[{label:'Responsável',value:'Dra. Renata'}]);assert.equal(cleaned.notes,'Somente após 18h');
  // Novo orçamento do mesmo telefone não sobrescreve aniversário nem observações editados no cadastro.
  const e=mk('Clínica Vida Plena',{clientContact:'11 98765-4321',clientBirthday:'01-01'});assert.equal(service.sync(e).id,vida.id);
  assert.deepEqual([service.client(vida.id).birthday,service.client(vida.id).notes],['12-25','Somente após 18h']);
  // Mesmo nome sem telefone/e-mail em comum vira outro cliente, com sugestão de possível duplicidade.
  const paulo=clients.find(x=>x.name==='Paulo Henrique'),homonym=service.sync(mk('Paulo Henrique',{clientContact:'paulo@example.com'}));
  assert.notEqual(homonym.id,paulo.id);assert.deepEqual(homonym.suggestion,{id:paulo.id,name:'Paulo Henrique'});assert.deepEqual(service.clientDetail(paulo.id).possibleDuplicates,[{id:homonym.id,name:'Paulo Henrique'}]);
  // Último serviço (concluído) separado do próximo (agendado).
  repo.setOperation({id:e.id,status:'scheduled',schedule:{start:addDays(today,3)+'T15:00:00Z',end:addDays(today,3)+'T17:00:00Z'}});
  const summaryVida=service.clients().find(x=>x.id===vida.id);
  assert.deepEqual([summaryVida.lastServiceDate,summaryVida.nextServiceDate,summaryVida.lastService.date,summaryVida.nextService.date,summaryVida.quoteCount,summaryVida.closedCents],[today,addDays(today,3),today,addDays(today,3),3,20000]);
  assert.deepEqual(service.clientDetail(vida.id).history.map(h=>h.status).sort(),['cancelled','completed','scheduled']);
  // Clientes e painel não carregam snapshots completos (fotos) nem consultam orçamento por orçamento.
  const fullProposal=repo.proposal,fullList=repo.list;repo.proposal=repo.list=()=>{throw Error('snapshot completo carregado')};
  try{service.clients();service.clientDetail(vida.id);service.dashboard({from,to:today})}finally{repo.proposal=fullProposal;repo.list=fullList}
  // Falhas de sincronização ficam registradas com o id do orçamento.
  const logged=[],originalError=console.error,originalMatch=service.match;console.error=(...args)=>logged.push(args);service.match=()=>{throw Error('falha simulada')};
  try{assert.equal(service.safeSync({id:'sem-vinculo',client:'Cliente qualquer'}),null)}finally{console.error=originalError;service.match=originalMatch}
  assert.equal(logged.length,1);assert.equal(logged[0][1],'sem-vinculo');
  // syncAll é incremental: só orçamentos sem vínculo.
  const loose=mk('Sem vínculo',{clientContact:'(11) 91234-5678'}),linked=()=>repo.db.prepare('SELECT COUNT(*) n FROM client_links WHERE proposal_id=?').get(loose.id).n;
  assert.equal(linked(),0);let calls=0;const originalSafe=service.safeSync.bind(service);service.safeSync=q=>{calls++;return originalSafe(q)};
  service.syncAll();assert.equal(linked(),1);assert.equal(calls,1);calls=0;service.syncAll();assert.equal(calls,0);service.safeSync=originalSafe;

  // Sócios e distribuição de lucros.
  assert.throws(()=>service.savePartners([null,{name:'B',shareBps:10000}]),/Sócio 1 inválido/);
  assert.throws(()=>service.savePartners([{name:'Ana',shareBps:5000},{name:' ana ',shareBps:5000}]),/Sócio repetido/);
  assert.throws(()=>service.savePartners([{name:'A',shareBps:6000},{name:'B',shareBps:3000}]),/100%/);
  service.savePartners([{name:'V&V Strategies',shareBps:6000},{name:'Mestres do Conforto',shareBps:4000}]);
  const dre={report:()=>({total:{gross:987000,taxCents:59200,otherDeductions:14800,net:913000,knownCost:321000,opex:172000,investment:0,missingCosts:0,serviceCount:14},
    services:[{costSnapshot:{materialCost:82000,travelCost:41000,otherDirectCosts:198000}}],composition:[{id:'integration-marketing',name:'Marketing · Mídia paga',amountCents:124000},{id:'x',name:'Ferramentas',amountCents:48000}]})};
  const withDre=new CommercialService(repo,{dre});
  const dist=withDre.distribution('2026-10','2026-10');
  assert.equal(dist.profitCents,420000);assert.equal(dist.reserveCents,42000);assert.equal(dist.distributableCents,378000);
  assert.deepEqual(dist.partners.map(p=>p.amountCents),[226800,151200]);assert.equal(dist.direct.reduce((s,x)=>s+x.amountCents,0),321000);
  assert.throws(()=>withDre.saveDistributionSettings({reserveBps:5001}),/50%/);assert.equal(withDre.saveDistributionSettings({reserveBps:5000}).reserveBps,5000);
  withDre.saveDistributionSettings({reserveBps:0});assert.equal(withDre.distribution('2026-10','2026-10').distributableCents,420000);
  const rec=withDre.recordDistribution({from:'2026-10',to:'2026-10'});assert.equal(rec.status,'pending');assert.throws(()=>withDre.recordDistribution({from:'2026-10',to:'2026-10'}),/Já existe/);
  assert.equal(withDre.markPaid(rec.id,{paidAt:today}).status,'paid');assert.equal(withDre.markPaid(rec.id,{paidAt:addDays(today,-5)}).paidAt,today);assert.throws(()=>withDre.deleteDistribution(rec.id),/pagas/);

  // Exclusão definitiva remove o vínculo com o cliente.
  repo.purgeProposal(b.id);assert.equal(repo.db.prepare('SELECT COUNT(*) n FROM client_links WHERE proposal_id=?').get(b.id).n,0);
  console.log('PASS: comercial — custo por orçamento/fechamento, ROAS/ROI por canal, painel por período, clientes automáticos, aniversário, funis, sócios e distribuição de lucros.');
}finally{repo.close();fs.rmSync(dir,{recursive:true,force:true})}

// Cidade a partir do endereço livre, moeda robusta e ROAS das origens pagas.
assert.deepEqual(placeFromAddress('Rua das Flores, 123, Jardim do Mar, São Bernardo do Campo - SP, 09750-000, Brasil'),{city:'São Bernardo do Campo',state:'SP'});
assert.deepEqual(placeFromAddress('Av. Paulista, 1000 - Bela Vista, São Paulo - SP'),{city:'São Paulo',state:'SP'});
assert.deepEqual(placeFromAddress('Rua A, 10, Centro, Santo André/sp'),{city:'Santo André',state:'SP'});
assert.deepEqual(placeFromAddress('Rua B, 5, Mauá, SP, Brasil'),{city:'Mauá',state:'SP'});
for(const v of ['Rua C, 10 - AP','Endereço sem cidade estruturada','',null])assert.deepEqual(placeFromAddress(v),{city:'',state:''});
assert.deepEqual(placeOf({addressCity:'Diadema',addressState:'sp',address:'Rua A, 1, Santo André - SP'}),{city:'Diadema',state:'SP'});
assert.deepEqual(placeOf({address:'Rua A, 1, Santo André - SP'}),{city:'Santo André',state:'SP'});
assert.equal(money(123456).replace(/\s/g,' '),'R$ 1.234,56');for(const currency of ['XX','reais!',null,''])assert.match(money(1000,currency),/10,00/);
const mixed=campaignMetrics({spendCents:1000,revenueCents:5000,paidRevenueCents:2000});assert.deepEqual([mixed.roas,mixed.roasTotal,mixed.roi,mixed.roiTotal],[2,5,1,4]);

// Funil por coorte: só orçamentos criados no período; receita concluída segue a data de conclusão.
const cohortDir=fs.mkdtempSync(path.join(os.tmpdir(),'herboclean-cohort-')),cohortRepo=new Repository(cohortDir);
try{
  cohortRepo.setConfig('settings',{company:{...modelo.company(),name:'Empresa teste'},terms:modelo.terms()});
  const s=new CommercialService(cohortRepo),today=localDate(),from=addDays(today,-29),before=addDays(today,-45),at=(d,h=12)=>d+'T'+String(h).padStart(2,'0')+':00:00Z';
  const mk=(client,date,extra={})=>{const q=modelo.quote();Object.assign(q,{client,address:'Rua A, 1',date,...extra});q.items=[{...modelo.item('Sofá'),price:extra.price??100}];return cohortRepo.saveProposal(modelo.normalize(q))};
  const set=(q,status,day)=>cohortRepo.setOperation({id:q.id,status,...(day?{schedule:{start:at(day),end:at(day,14)},...(status==='completed'?{serviceCompletedAt:day}:{})}:{})});
  set(mk('Criado antes, concluído agora',before,{origin:'organico',price:400}),'completed',addDays(today,-2));
  set(mk('Agendado há tempo',before,{origin:'meta',price:300}),'scheduled',addDays(today,10));
  set(mk('Novo concluído',today,{origin:'meta',price:100}),'completed',today);
  set(mk('Novo agendado',today,{origin:'meta',price:200,address:'Rua B, 2, Centro, Santo André - SP'}),'scheduled',addDays(today,1));
  mk('Novo em aberto',today,{origin:'google'});set(mk('Novo cancelado',today,{origin:'google'}),'cancelled');
  set(mk('Agenda vencida',today,{price:50}),'scheduled',addDays(today,-1));
  cohortRepo.db.exec('CREATE TABLE IF NOT EXISTS ad_spend_daily(provider TEXT NOT NULL,account_id TEXT NOT NULL,campaign_id TEXT NOT NULL,day TEXT NOT NULL,currency TEXT NOT NULL,spend_cents INTEGER NOT NULL,data TEXT NOT NULL,sync_run_id TEXT NOT NULL,PRIMARY KEY(provider,account_id,campaign_id,day))');
  cohortRepo.db.prepare('INSERT INTO ad_spend_daily VALUES (?,?,?,?,?,?,?,?)').run('meta-ads','acc','c1',today,'BRL',10000,'{}','run');
  cohortRepo.db.prepare('INSERT INTO ad_spend_daily VALUES (?,?,?,?,?,?,?,?)').run('google-ads','acc','c2',today,'USD',99999,'{}','run');
  const dash=s.dashboard({from,to:today}),c=dash.current;
  assert.deepEqual([c.generated,c.reachedSchedule,c.scheduled,c.completed,c.cancelled,c.conversion,c.cohortRevenueCents],[5,3,3,1,1,0.2,10000]);
  // Criado antes do período e concluído dentro: entra na receita, não no funil.
  assert.deepEqual([c.closed,c.revenueCents,c.ticketCents],[2,50000,25000]);assert.ok(c.conversion<=1&&dash.previous.conversion<=1);
  assert.deepEqual([c.campaign.spendCents,c.campaign.quotes,c.campaign.costPerQuoteCents,c.campaign.paidRevenueCents,c.campaign.roas,c.campaign.roasTotal,c.campaign.roiTotal],[10000,5,2000,10000,1,5,4]);
  // A receber: agendados de hoje em diante, mesmo criados antes do período; agenda vencida não conta.
  assert.equal(dash.toReceiveCents,50000);assert.equal(dash.forecastCents,50000);
  assert.deepEqual(dash.upcoming.map(u=>[u.client,u.place]),[['Novo agendado','Santo André']]);
  // Período anterior com as mesmas definições.
  const p=dash.previous;assert.deepEqual([p.generated,p.reachedSchedule,p.completed,p.conversion,p.cohortRevenueCents,p.revenueCents,p.campaign.spendCents],[2,2,1,0.5,40000,0,0]);
  assert.equal(dash.series.current.at(-1),50000);assert.equal(dash.series.previous.at(-1),0);assert.deepEqual(dash.spend.providers,{'meta-ads':10000});
  const meta=s.dashboard({from,to:today,channel:'meta'});
  assert.deepEqual([meta.current.generated,meta.current.completed,meta.current.revenueCents,meta.current.campaign.roas,meta.current.campaign.roasTotal,meta.toReceiveCents],[2,1,10000,1,1,50000]);
  assert.ok(dash.channels.find(x=>x.origin==='organico'&&x.revenueCents===40000&&x.quotes===0));
}finally{cohortRepo.close();fs.rmSync(cohortDir,{recursive:true,force:true})}
console.log('PASS: comercial — funil por coorte, receita por conclusão, a receber, ROAS pago/total, cidade pelo endereço e moeda robusta.');
