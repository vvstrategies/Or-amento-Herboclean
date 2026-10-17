import crypto from 'node:crypto';
import {cleanQuote,fail,validId,hash} from './database.js';
import {modelo} from '../utils/proposta.js';

// Deliberately registered only by the isolated local launcher. No WhatsApp transport.
export function registerChatPilot(app,{repo,commercial,service,wrap}){
  const key='native-chat-pilot-v1';
  function state(){
    let data=repo.config(key);if(data)return data;
    const test=commercial.clientRows().find(c=>c.phone.replace(/\D/g,'').endsWith('11986495346'));
    const contacts=[test||commercial.createClient({name:'Contato de teste',phone:'5511986495346'}),commercial.createClient({name:'Marina · exemplo',phone:'11900000001'}),commercial.createClient({name:'Rafael · exemplo',phone:'11900000002'})];
    const texts=['Olá! Gostaria de um orçamento para higienizar meu sofá.','Bom dia! Vocês fazem limpeza de colchão de casal?','Obrigado pelo atendimento! Quero orçar as cadeiras também.'];
    data={threads:contacts.map((c,i)=>({id:crypto.randomUUID(),clientId:c.id,unread:i===1?1:0,messages:[{id:crypto.randomUUID(),text:texts[i],direction:'in',at:new Date(Date.now()-i*3600000).toISOString()}]}))};
    repo.setConfig(key,data);return data;
  }
  function thread(id){const data=state(),t=data.threads.find(x=>x.id===id);if(!t)throw fail(404,'Conversa não encontrada.');return {data,t}}
  function view(t){
    const client=commercial.clientDetail(t.clientId);
    client.history=client.history.map(q=>({...q,pdfId:repo.listPDFs(q.id,{summary:true})[0]?.id||null,operation:repo.operation(q.id),updatedAt:repo.db.prepare('SELECT updated_at FROM proposals WHERE id=?').get(q.id)?.updated_at||''})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    return {...t,client};
  }
  function save(data){repo.setConfig(key,data)}
  const draftKey=(user,id)=>'chat-draft:'+user+':'+id;
  function draft(user,id){
    const {t}=thread(id),k=draftKey(user,id);let d=repo.config(k);
    if(!d){const c=commercial.client(t.clientId),q=modelo.quote(repo.config('settings'));Object.assign(q,{client:c.name,clientContact:c.phone,clientEmail:c.email||'',address:c.address||'',origin:c.origin||'',tags:c.tags||[]});d={quote:q,revision:0};repo.setConfig(k,d)}return d;
  }
  app.get('/api/chat-pilot/conversations',(req,res)=>res.json(state().threads.map(view)));
  app.get('/api/chat-pilot/conversations/:id',(req,res)=>res.json(view(thread(req.params.id).t)));
  // Same schedule validation and operation shape as the kanban, with no Google transport.
  app.post('/api/chat-pilot/proposals/:id/schedule',wrap(async(req,res)=>{
    const id=req.params.id,input=req.body;
    if(!validId(input?.key))throw fail(400,'Confirmação inválida.');
    const requestHash=hash(JSON.stringify({id,kind:'pilot-schedule',...input}));
    const replay=repo.replay(input.key,requestHash);if(replay)return res.json(replay);
    const result=await service.locked(id,async()=>{
      const q=repo.requireProposal(id),op=repo.operation(id);
      if(Number(input.revision)!==q.revision)throw fail(409,'O orçamento mudou. Confira os dados antes de agendar.');
      if(!['generated','scheduled'].includes(op.status))throw fail(409,'Este orçamento não pode ser agendado no estado atual.');
      if(op.schedule?.eventId)throw fail(409,'Um evento real não pode ser alterado pela simulação.');
      cleanQuote(q,true);let values;
      try{values=globalThis.EcoOperations.scheduleInput(input.date,input.time,input.duration)}catch(error){throw fail(400,error.message)}
      const pdf=await service.pdf(q);
      return repo.complete(id,{...op,status:'scheduled',schedule:{id:op.schedule?.id||crypto.randomUUID(),...values,sync:'confirmed',simulation:true,eventId:null,eventUrl:null,pdfId:pdf.id},suggestedSchedule:null},input.key,requestHash);
    });res.json(result);
  }));
  app.post('/api/chat-pilot/proposals/:id/schedule/cancel',wrap(async(req,res)=>{
    const id=req.params.id;repo.requireProposal(id);
    res.json(await service.locked(id,async()=>{const op=repo.operation(id);if(op.status!=='scheduled'||!op.schedule?.simulation||op.schedule.eventId)throw fail(409,'Não há agendamento simulado para cancelar.');return repo.setOperation({...op,status:'generated',schedule:null,suggestedSchedule:null})}));
  }));
  app.post('/api/chat-pilot/conversations/:id/read',(req,res)=>{const {data,t}=thread(req.params.id);t.unread=0;save(data);res.json({ok:true})});
  app.post('/api/chat-pilot/conversations/:id/messages',(req,res)=>{
    const {data,t}=thread(req.params.id),body=req.body;
    if(!validId(body?.id)||!['in','out'].includes(body.direction))throw fail(400,'Mensagem inválida.');
    const old=t.messages.find(m=>m.id===body.id);if(old)return res.json(old);
    const text=String(body.text||'').trim();if(!text||text.length>4000)throw fail(400,'Escreva uma mensagem de até 4.000 caracteres.');
    let pdfId=null;
    if(body.pdfId){const pdf=repo.pdf(body.pdfId);if(!pdf||commercial.clientOf(pdf.proposalId)?.id!==t.clientId)throw fail(400,'Este PDF não pertence ao cliente.');pdfId=pdf.id}
    const message={id:body.id,text,direction:body.direction,at:new Date().toISOString(),author:req.session.user.name,...(pdfId?{pdfId}:{})};
    t.messages.push(message);if(t.messages.length>2000)t.messages.shift();if(body.direction==='in')t.unread++;save(data);res.json(message);
  });
  app.put('/api/chat-pilot/conversations/:id/client',(req,res)=>{const {t}=thread(req.params.id);res.json(commercial.updateClient(t.clientId,req.body))});
  app.get('/api/chat-pilot/conversations/:id/draft',(req,res)=>res.json(draft(req.session.user.id,req.params.id)));
  app.put('/api/chat-pilot/conversations/:id/draft',(req,res)=>{
    if(service.locks.has('chat-'+req.params.id))throw fail(409,'Aguarde a geração do PDF terminar.');
    const d=draft(req.session.user.id,req.params.id);
    if(d.generated)throw fail(409,'Este orçamento já foi gerado. Inicie um novo rascunho.');
    if(req.body.revision!==d.revision)throw fail(409,'O rascunho foi alterado em outra aba. Copie suas alterações e recarregue a página para carregar a versão atual.');
    const q=cleanQuote(req.body.quote);if(q.id!==d.quote.id)throw fail(400,'Rascunho inválido.');
    const value={quote:q,revision:d.revision+1};repo.setConfig(draftKey(req.session.user.id,req.params.id),value);res.json(value);
  });
  app.post('/api/chat-pilot/conversations/:id/draft/new',(req,res)=>{
    const d=draft(req.session.user.id,req.params.id);if(!d.generated)throw fail(409,'Conclua o rascunho atual primeiro.');
    repo.setConfig(draftKey(req.session.user.id,req.params.id),null);res.json(draft(req.session.user.id,req.params.id));
  });
  app.post('/api/chat-pilot/conversations/:id/quote',wrap(async(req,res)=>{
    const user=req.session.user.id,id=req.params.id,{t}=thread(id);
    const result=await service.locked('chat-'+id,async()=>{
      const d=draft(user,id);if(d.generated)return d.generated;
      if(req.body.revision!==d.revision)throw fail(409,'Salve o rascunho antes de gerar.');
      const q=cleanQuote(d.quote,true),client=commercial.clientInput({name:q.client,phone:q.clientContact,email:q.clientEmail||'',address:q.address},commercial.client(t.clientId));
      const saved=repo.saveProposal(q),pdf=await service.pdf(saved);
      repo.transaction(()=>{commercial.updateClient(t.clientId,client);repo.db.prepare('INSERT INTO client_links VALUES (?,?) ON CONFLICT(proposal_id) DO UPDATE SET client_id=excluded.client_id').run(saved.id,t.clientId);repo.setOperation({...repo.operation(saved.id),id:saved.id,status:'generated'})});
      const generated={id:saved.id,number:saved.number,pdfId:pdf.id,pixCents:modelo.totals(saved).pix};
      repo.setConfig(draftKey(user,id),{...d,generated});return generated;
    });res.json(result);
  }));
}
