import {date,localDate} from './dre-domain.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fail, documentHash, cleanQuote } from './database.js';
import { modelo } from '../utils/proposta.js';
import { gerarPDFEcoclean } from '../utils/ecocleanPdf.js';
import '../public/operations-model.js';
const O=globalThis.EcoOperations;
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
export class Service{
  constructor(repo,google){this.repo=repo;this.google=google;this.locks=new Map();this.owner=crypto.randomUUID()}
  async locked(id,fn){if(this.locks.has(id))throw fail(409,'A operação deste orçamento está em andamento. Aguarde.');const key='proposal:'+id;this.repo.claim(key,this.owner);const task=Promise.resolve().then(fn);this.locks.set(id,task);try{return await task}finally{this.locks.delete(id);this.repo.release(key,this.owner)}}
  async pdf(q,force=false){
    q=cleanQuote(q,true);const fingerprint=documentHash(q),last=this.repo.listPDFs(q.id)[0];
    if(!force&&last?.proposalVersionId===q.versionId&&last?.fingerprint===fingerprint&&fs.existsSync(this.repo.file(last)))return last;
    const file=await gerarPDFEcoclean(q,{outputDir:this.repo.files});return this.repo.savePDF(q,file,fingerprint);
  }
  async generate(id,{revision,force=false}={}){return this.locked(id,async()=>{const q=this.repo.requireProposal(id);if(Number(revision)!==q.revision)throw fail(409,'O orçamento mudou. Reabra antes de gerar o PDF.');return this.pdf(q,force)})}
  async schedule(id,input){
    if(typeof input.key!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(input.key))throw fail(400,'Confirmação inválida. Revise o agendamento.');
    const requestHash=crypto.createHash('sha256').update(JSON.stringify({id,kind:'schedule',date:input.date,time:input.time,duration:input.duration,revision:input.revision})).digest('hex');
    const replay=this.repo.replay(input.key,requestHash);if(replay)return replay;
    return this.locked(id,async()=>{
      const replay=this.repo.replay(input.key,requestHash);if(replay)return replay;
      const q=this.repo.requireProposal(id);if(Number(input.revision)!==q.revision)throw fail(409,'O orçamento foi alterado. Confira novamente os valores antes de confirmar.');cleanQuote(q,true);
      const values=O.scheduleInput(input.date,input.time,input.duration),c=this.google.requireConnection(),op=this.repo.operation(id);
      if(['cancelled','completed'].includes(op.status))throw fail(409,'Reabra o orçamento antes de agendar.');
      const previous=this.repo.job(id);
      if(previous?.kind==='cancel')throw fail(409,'Conclua o cancelamento pendente antes de agendar novamente.');
      const active=op.schedule?.eventId?op.schedule:null;
      if((active&&active.accountSub!==c.sub)||(previous&&previous.accountSub!==c.sub))throw fail(409,'Reconecte a conta usada neste evento.');
      const eventId=active?.eventId||previous?.eventId||'ec'+crypto.randomBytes(24).toString('hex');
      const calendarId=active?.calendarId||previous?.calendarId||c.calendarId;
      const job={kind:'schedule',eventId,calendarId,accountSub:c.sub,values,proposalRevision:q.revision,key:input.key,requestHash,startedAt:new Date().toISOString(),error:null};
      this.repo.setJob(id,job);
      try{
        const pdf=await this.pdf(q),file=await this.google.upload(pdf),total=modelo.totals(q).pix;
        const description=[`CLIENTE\n${q.client}`,`CONTATO\n${q.clientContact||'Não informado'}`,`ENDEREÇO\n${q.address}`,'SERVIÇOS\n'+q.items.map(i=>`${i.quantity} ${i.unit} · ${i.service}`).join('\n'),`VALOR NO PIX\n${money(total)}`,`ORÇAMENTO\n${q.number} · PDF versão ${pdf.version}`,q.terms.notes?`OBSERVAÇÕES\n${q.terms.notes}`:''].filter(Boolean).join('\n\n');
        const intentHash=crypto.createHash('sha256').update(JSON.stringify({values,fingerprint:pdf.fingerprint})).digest('hex');
        const body={summary:`${q.company.name} | ${q.client} | ${q.items[0].service}`,location:q.address,description,start:{dateTime:values.start,timeZone:O.timezone},end:{dateTime:values.end,timeZone:O.timezone},attachments:[{fileUrl:file.url,fileId:file.id,title:pdf.filename,mimeType:'application/pdf'}],extendedProperties:{private:{ecocleanWorkspace:this.repo.config('workspaceId'),proposalId:id,intentHash}}};
        const event=await this.google.upsertEvent(calendarId,eventId,body,this.repo.config('workspaceId'));
        if(!event?.id||event.status==='cancelled')throw fail(502,'O Google não confirmou a criação do evento.');
        return this.repo.complete(id,{id,status:'scheduled',schedule:{id:active?.id||crypto.randomUUID(),...values,sync:'confirmed',eventId:event.id,eventUrl:event.htmlLink||null,calendarId,accountSub:c.sub,pdfId:pdf.id,driveId:file.id},suggestedSchedule:null},input.key,requestHash);
      }catch(error){this.repo.setJob(id,{...job,error:error.message});throw error}
    });
  }
  async cancelSchedule(id,input){
    if(typeof input.key!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(input.key))throw fail(400,'Confirmação inválida.');
    const requestHash=crypto.createHash('sha256').update(id+':cancel').digest('hex'),replay=this.repo.replay(input.key,requestHash);if(replay)return replay;
    return this.locked(id,async()=>{
      const replay=this.repo.replay(input.key,requestHash);if(replay)return replay;
      const op=this.repo.operation(id);if(op.status==='completed')throw fail(409,'Não é possível cancelar um atendimento concluído.');const previous=this.repo.job(id),schedule=op.schedule?.eventId?op.schedule:previous;
      if(!schedule?.eventId)throw fail(409,'Não há evento para cancelar.');
      const c=this.google.requireConnection();if(schedule.accountSub!==c.sub)throw fail(409,'Reconecte a conta usada neste evento.');
      const job={...schedule,kind:'cancel',key:input.key,requestHash,error:null};this.repo.setJob(id,job);
      try{await this.google.deleteEvent(schedule.calendarId,schedule.eventId,this.repo.config('workspaceId'));return this.repo.complete(id,{id,status:'generated',schedule:null,suggestedSchedule:null},input.key,requestHash)}catch(error){this.repo.setJob(id,{...job,error:error.message});throw error}
    });
  }
  async purge(id){return this.locked(id,async()=>{
    const operation=this.repo.operation(id);
    if(!['cancelled','completed'].includes(operation.status))throw fail(409,'A exclusão definitiva está disponível apenas para orçamentos cancelados ou concluídos.');
    if(this.repo.job(id))throw fail(409,'Conclua a operação pendente no Google antes de excluir definitivamente.');
    const schedule=operation.schedule;
    if(schedule?.eventId){
      const connection=this.google.requireConnection();
      if(schedule.accountSub&&schedule.accountSub!==connection.sub)throw fail(409,'Reconecte a conta usada neste agendamento antes de excluir definitivamente.');
      await this.google.deleteEvent(schedule.calendarId,schedule.eventId,this.repo.config('workspaceId'));
      this.repo.setOperation({...operation,schedule:null,suggestedSchedule:null});
    }
    return this.repo.purgeProposal(id);
  })}
  async status(id,next,input={}){return this.locked(id,async()=>{
    this.repo.requireProposal(id);const current=this.repo.operation(id);
    if(this.repo.job(id))throw fail(409,'Resolva a operação pendente no Google antes de alterar o orçamento.');
    if(current.status==='completed'){if(next==='completed')return current;throw fail(409,'O atendimento concluído possui histórico financeiro preservado.');}
    if(next==='cancelled'){if(current.schedule?.eventId)throw fail(409,'Cancele o agendamento antes de cancelar o orçamento.');return this.repo.setOperation({...current,status:'cancelled'})}
    if(next==='completed'){if(current.status!=='scheduled'||!current.schedule||Date.parse(current.schedule.end)>Date.now())throw fail(409,'A conclusão fica disponível após o término previsto.');const serviceDate=date(input.serviceDate||localDate(current.schedule.end),false);if(serviceDate>localDate())throw fail(400,'A realização não pode estar no futuro.');return this.repo.transaction(()=>{this.onComplete?.(id,serviceDate);return this.repo.setOperation({...current,status:'completed',serviceCompletedAt:serviceDate,completionRecordedAt:new Date().toISOString()});})}
    if(next==='generated'&&current.status==='cancelled')return this.repo.setOperation({...current,status:'generated'});
    throw fail(400,'Mudança de status inválida. Para aprovar, use Aprovar e agendar.');
  })}
}
