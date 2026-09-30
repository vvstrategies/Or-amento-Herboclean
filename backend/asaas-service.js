import crypto from 'node:crypto';
import {fail} from './database.js';
import {migrateAsaas} from './asaas-migration.js';
import {modelo} from '../utils/proposta.js';

const pending=new Set(['PENDING','AWAITING_PAYMENT','OVERDUE','DUNNING_REQUESTED','DUNNING_RECEIVED']);
const settled=new Set(['RECEIVED','CONFIRMED','RECEIVED_IN_CASH']);
const terminal=new Set(['DELETED','REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL','CHARGEBACK_REVERSED']);
const digits=value=>String(value||'').replace(/\D/g,'');
const cents=value=>Math.round(Number(value)*100);
const toAmount=value=>Number((value/100).toFixed(2));
const cleanBase=value=>String(value||'').replace(/\/+$/,'');
const visibleStatus=status=>String(status||'PENDING').toUpperCase();
const safeURL=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.toString():''}catch{return ''}};
const dateOnly=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
function errorMessage(response,body){
  const message=body?.errors?.[0]?.description||body?.message||body?.error;
  if(response.status===401||response.status===403)return 'A Asaas recusou a credencial do servidor. Confira a chave e o ambiente configurados.';
  if(response.status===429)return 'A Asaas limitou temporariamente as solicitaÃ§Ãµes. Aguarde alguns minutos e tente novamente.';
  if(response.status>=500)return 'A Asaas estÃ¡ indisponÃ­vel no momento. Tente novamente em instantes.';
  return typeof message==='string'&&message.length<240?message:'A Asaas nÃ£o aceitou os dados da cobranÃ§a. Revise o cliente e tente novamente.';
}
function asaasStatus(event,payment){
  const supplied=visibleStatus(payment?.status);
  if(supplied&&supplied!=='PENDING')return supplied;
  const name=String(event||'').toUpperCase();
  if(name.includes('RECEIVED'))return 'RECEIVED';
  if(name.includes('CONFIRMED'))return 'CONFIRMED';
  if(name.includes('OVERDUE'))return 'OVERDUE';
  if(name.includes('REFUND'))return 'REFUNDED';
  if(name.includes('DELETED'))return 'DELETED';
  return supplied;
}
function eventId(payload){
  if(typeof payload?.id==='string'&&payload.id.length<=240)return payload.id;
  return crypto.createHash('sha256').update(JSON.stringify({event:payload?.event,payment:payload?.payment?.id,status:payload?.payment?.status,dateCreated:payload?.dateCreated})).digest('hex');
}
function documentRef(repo,document){return crypto.createHmac('sha256',String(repo.config('workspaceId')||'workspace')).update(document).digest('hex')}
function dueDate(days){const value=new Date();value.setHours(12,0,0,0);value.setDate(value.getDate()+Math.max(1,Math.min(365,Number(days)||15)));return value.toISOString().slice(0,10)}
function payerInput(raw,quote){
  const cpfCnpj=digits(raw?.cpfCnpj),name=String(raw?.name||quote.client||'').trim().slice(0,255),email=String(raw?.email||'').trim().slice(0,255),mobilePhone=digits(raw?.mobilePhone);
  if(!name)throw fail(400,'Informe o nome do pagador.');
  if(![11,14].includes(cpfCnpj.length)||/^(\d)\1+$/.test(cpfCnpj))throw fail(400,'Informe um CPF ou CNPJ vÃ¡lido para emitir a cobranÃ§a.');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Informe um e-mail vÃ¡lido ou deixe o campo em branco.');
  if(mobilePhone&&(mobilePhone.length<10||mobilePhone.length>13))throw fail(400,'Informe um celular vÃ¡lido ou deixe o campo em branco.');
  return {name,cpfCnpj,email,mobilePhone};
}
function publicPayment(row){return {id:row.id,proposalId:row.proposal_id,revision:row.proposal_revision,kind:row.kind,asaasPaymentId:row.asaas_payment_id,status:visibleStatus(row.status),amountCents:row.amount_cents,installmentCount:row.installment_count,invoiceUrl:safeURL(row.invoice_url),dueDate:row.due_date,createdAt:row.created_at,updatedAt:row.updated_at,paidAt:row.paid_at||null};}

export function asaasConfig(env={},origin=''){
  const sandbox=String(env.ASAAS_ENV||'').toLowerCase()==='sandbox';
  return {apiKey:String(env.ASAAS_API_KEY||'').trim(),webhookToken:String(env.ASAAS_WEBHOOK_TOKEN||'').trim(),baseUrl:cleanBase(env.ASAAS_BASE_URL||(sandbox?'https://api-sandbox.asaas.com/v3':'https://api.asaas.com/v3')),environment:sandbox?'sandbox':'production',origin:String(origin||''),userAgent:String(env.ASAAS_USER_AGENT||'Herboclean-Orcamentos/1.0').slice(0,180)};
}

export class AsaasService{
  constructor(repo,config={},fetcher=globalThis.fetch){
    const defaults=asaasConfig({ASAAS_ENV:config.environment,ASAAS_API_KEY:config.apiKey,ASAAS_WEBHOOK_TOKEN:config.webhookToken,ASAAS_BASE_URL:config.baseUrl,ASAAS_USER_AGENT:config.userAgent},config.origin);
    this.repo=repo;this.config={...defaults,...config,baseUrl:cleanBase(config.baseUrl||defaults.baseUrl)};this.fetcher=fetcher;
    migrateAsaas(repo);
  }
  status(){return {configured:!!this.config.apiKey,webhookProtected:!!this.config.webhookToken,environment:this.config.environment||'production',webhookURL:this.config.origin?this.config.origin+'/api/webhooks/asaas':'',message:!this.config.apiKey?'Configure ASAAS_API_KEY no servidor.':!this.config.webhookToken?'Configure ASAAS_WEBHOOK_TOKEN no servidor e use-o tambÃ©m no webhook da Asaas.':'Pronta para gerar cobranÃ§as. O status Ã© atualizado pelo webhook da Asaas.'};}
  list(proposalId){this.repo.requireProposal(proposalId);return this.repo.db.prepare('SELECT * FROM asaas_payments WHERE proposal_id=? ORDER BY created_at DESC').all(proposalId).map(publicPayment);}
  rowsForRevision(proposalId,revision){return this.repo.db.prepare('SELECT * FROM asaas_payments WHERE proposal_id=? AND proposal_revision=? ORDER BY created_at DESC').all(proposalId,revision);}
  assertConfigured(){if(!this.config.apiKey||!this.config.baseUrl)throw fail(503,'A integraÃ§Ã£o Asaas ainda nÃ£o estÃ¡ configurada no servidor.');}
  async request(method,pathname,body){
    this.assertConfigured();
    const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),15000);
    let response;
    try{response=await this.fetcher(this.config.baseUrl+pathname,{method,signal:timeout.signal,headers:{accept:'application/json','content-type':'application/json','access_token':this.config.apiKey,'User-Agent':this.config.userAgent},...(body===undefined?{}:{body:JSON.stringify(body)})});}
    catch{throw fail(502,'NÃ£o foi possÃ­vel alcanÃ§ar a Asaas. Confira a conexÃ£o do servidor e tente novamente.');}
    finally{clearTimeout(timer);}
    const text=await response.text();let value={};try{value=text?JSON.parse(text):{}}catch{}
    if(!response.ok)throw fail(response.status>=500?502:400,errorMessage(response,value));
    return value;
  }
  async customer(payer){
    const ref=documentRef(this.repo,payer.cpfCnpj),old=this.repo.db.prepare('SELECT * FROM asaas_payers WHERE document_ref=?').get(ref),payload={name:payer.name,cpfCnpj:payer.cpfCnpj};
    if(payer.email)payload.email=payer.email;if(payer.mobilePhone)payload.mobilePhone=payer.mobilePhone;
    let customer;
    if(old){customer=await this.request('PUT','/customers/'+encodeURIComponent(old.asaas_customer_id),payload);}
    else {customer=await this.request('POST','/customers',payload);}
    if(typeof customer?.id!=='string'||!customer.id)throw fail(502,'A Asaas nÃ£o retornou a identificaÃ§Ã£o do cliente. Tente novamente.');
    const now=new Date().toISOString();this.repo.db.prepare('INSERT INTO asaas_payers VALUES (?,?,?,?) ON CONFLICT(document_ref) DO UPDATE SET asaas_customer_id=excluded.asaas_customer_id,display_name=excluded.display_name,updated_at=excluded.updated_at').run(ref,customer.id,payer.name,now);
    return customer.id;
  }
  store(proposal,kind,response,amountCents,installmentCount,due,externalReference){
    const invoice=safeURL(response?.invoiceUrl),paymentId=String(response?.id||'');
    if(!invoice||!paymentId)throw fail(502,'A Asaas nÃ£o retornou o link seguro da cobranÃ§a. Tente novamente.');
    const now=new Date().toISOString(),row={id:crypto.randomUUID(),proposalId:proposal.id,revision:proposal.revision,kind,paymentId,customerId:response.customer,status:visibleStatus(response.status),amountCents,installmentCount,invoice,due,externalReference,now};
    this.repo.db.prepare('INSERT INTO asaas_payments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.proposalId,row.revision,row.kind,row.paymentId,row.customerId,row.status,row.amountCents,row.installmentCount,row.invoice,row.due,row.externalReference,row.now,row.now,null);
    return publicPayment(this.repo.db.prepare('SELECT * FROM asaas_payments WHERE id=?').get(row.id));
  }
  active(row){return pending.has(visibleStatus(row.status));}
  async issue(proposalId,rawPayer){
    this.assertConfigured();
    const proposal=this.repo.requireProposal(proposalId),operation=this.repo.operation(proposalId);
    if(!['generated','scheduled','approved'].includes(operation.status))throw fail(409,'NÃ£o Ã© possÃ­vel emitir cobranÃ§a para um orÃ§amento cancelado ou concluÃ­do.');
    modelo.validate(proposal);const calculated=modelo.totals(proposal);
    if(!calculated.pix||!calculated.total)throw fail(400,'Informe valores maiores que zero antes de gerar a cobranÃ§a.');
    const existing=this.rowsForRevision(proposal.id,proposal.revision),pix=existing.find(row=>row.kind==='pix'&&this.active(row)),card=existing.find(row=>row.kind==='card'&&this.active(row));
    if(pix&&card)return {payments:existing.map(publicPayment),reused:true,partial:false};
    const payer=payerInput(rawPayer,proposal),customer=await this.customer(payer),due=dueDate(proposal.terms?.validity),base=`herboclean:${proposal.id.slice(0,24)}:r${proposal.revision}`;
    const created=[],failures=[];
    const create=async(kind,payload,amount,installments)=>{try{const value=await this.request('POST','/payments',payload);created.push(this.store(proposal,kind,{...value,customer:value.customer||customer},amount,installments,due,payload.externalReference));}catch(error){failures.push(error);}};
    if(!pix)await create('pix',{customer,billingType:'PIX',value:toAmount(calculated.pix),dueDate:due,description:`Proposta ${proposal.number} Â· pagamento PIX`.slice(0,500),externalReference:base+':pix'},calculated.pix,1);
    if(!card){const payload={customer,billingType:'CREDIT_CARD',dueDate:due,description:`Proposta ${proposal.number} Â· cartÃ£o`.slice(0,500),externalReference:base+':card'};if(calculated.count>1){payload.installmentCount=calculated.count;payload.totalValue=toAmount(calculated.total);}else payload.value=toAmount(calculated.total);await create('card',payload,calculated.total,calculated.count);}
    const payments=this.rowsForRevision(proposal.id,proposal.revision).map(publicPayment);
    if(!payments.length)throw failures[0]||fail(502,'NÃ£o foi possÃ­vel gerar a cobranÃ§a.');
    return {payments,reused:false,partial:failures.length>0,warning:failures[0]?.message||null};
  }
  async cancel(proposalId,localId){
    const row=this.repo.db.prepare('SELECT * FROM asaas_payments WHERE id=? AND proposal_id=?').get(localId,proposalId);
    if(!row)throw fail(404,'CobranÃ§a nÃ£o encontrada.');
    if(settled.has(visibleStatus(row.status)))throw fail(409,'Uma cobranÃ§a recebida nÃ£o pode ser excluÃ­da. Consulte a Asaas para eventual estorno.');
    if(terminal.has(visibleStatus(row.status)))return publicPayment(row);
    await this.request('DELETE','/payments/'+encodeURIComponent(row.asaas_payment_id));
    const now=new Date().toISOString();this.repo.db.prepare("UPDATE asaas_payments SET status='DELETED',updated_at=? WHERE id=?").run(now,row.id);
    return publicPayment(this.repo.db.prepare('SELECT * FROM asaas_payments WHERE id=?').get(row.id));
  }
  verifyWebhook(value){
    const expected=Buffer.from(this.config.webhookToken||''),actual=Buffer.from(String(value||''));
    if(!expected.length)throw fail(503,'O webhook Asaas nÃ£o estÃ¡ configurado no servidor.');
    if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw fail(401,'Token de webhook invÃ¡lido.');
  }
  async webhook(token,payload){
    this.verifyWebhook(token);
    const paymentId=String(payload?.payment?.id||'');if(!paymentId)throw fail(400,'Evento da Asaas sem cobranÃ§a.');
    const id=eventId(payload),name=String(payload?.event||'PAYMENT_UPDATED').slice(0,120),now=new Date().toISOString();
    let inserted=false;
    this.repo.transaction(()=>{const result=this.repo.db.prepare('INSERT INTO asaas_webhook_events VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,name,paymentId,now);inserted=result.changes===1;if(!inserted)return;const row=this.repo.db.prepare('SELECT * FROM asaas_payments WHERE asaas_payment_id=?').get(paymentId);if(!row)return;const status=asaasStatus(name,payload.payment),paidAt=settled.has(status)?(row.paid_at||now):row.paid_at;this.repo.db.prepare('UPDATE asaas_payments SET status=?,updated_at=?,paid_at=? WHERE id=?').run(status,now,paidAt,row.id);});
    if(!inserted)return {duplicate:true};
    const current=this.repo.db.prepare('SELECT * FROM asaas_payments WHERE asaas_payment_id=?').get(paymentId);
    if(current&&settled.has(visibleStatus(current.status)))await this.cancelAlternatives(current);
    return {ok:true};
  }
  async cancelAlternatives(received){
    const alternatives=this.rowsForRevision(received.proposal_id,received.proposal_revision).filter(row=>row.id!==received.id&&this.active(row));
    for(const row of alternatives){try{await this.cancel(received.proposal_id,row.id)}catch{}}
  }
}

