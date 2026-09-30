import crypto from 'node:crypto';
import fs from 'node:fs';
import { fail, hash } from './database.js';

const authURL='https://accounts.google.com/o/oauth2/v2/auth',tokenURL='https://oauth2.googleapis.com/token';
export class GoogleIntegration{
  constructor(repo,vault,config={},fetcher=globalThis.fetch){this.repo=repo;this.vault=vault;this.config=config;this.fetch=fetcher;this.refreshing=null;this.scopes=['openid','email',config.calendarScope||'https://www.googleapis.com/auth/calendar.events.owned','https://www.googleapis.com/auth/drive.file']}
  configured(){return !!(this.config.clientId&&this.config.clientSecret&&this.config.redirectURI)}
  connection(){const value=this.repo.config('google');return value?this.vault.open(value):null}
  saveConnection(value){this.repo.setConfig('google',this.vault.seal(value))}
  updateConnection(id,patch){const latest=this.connection();if(!latest||latest.id!==id)throw fail(409,'A conexão Google mudou. Tente novamente.');this.saveConnection({...latest,...patch});return this.connection()}
  status(){const c=this.connection();return {configured:this.configured(),connected:!!c&&!c.needsReconnect,email:c?.email||null,calendarId:c?.calendarId||this.config.calendarId||'primary',needsReconnect:!!c?.needsReconnect}}
  requireConnection(){const c=this.connection();if(!this.configured()||!c||c.needsReconnect)throw fail(503,'Conecte a conta Google em Configurações para aprovar e agendar.');return c}
  connect(session){
    if(!this.configured())throw fail(503,'Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor. Consulte o guia de conexão em Configurações.');
    const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
    this.repo.db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
    this.repo.db.prepare('INSERT INTO oauth_states VALUES (?,?,?,?)').run(hash(state),session.id,verifier,Date.now()+600000);
    const url=new URL(authURL);for(const [key,value] of Object.entries({client_id:this.config.clientId,redirect_uri:this.config.redirectURI,response_type:'code',scope:this.scopes.join(' '),access_type:'offline',prompt:'consent',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
    return {url:url.href};
  }
  async callback(query,session){
    const state=typeof query.state==='string'?query.state:'';
    const saved=this.repo.transaction(()=>{const record=this.repo.db.prepare('SELECT * FROM oauth_states WHERE state=?').get(hash(state));if(!record||record.session_id!==session.id||record.expires<Date.now())throw fail(403,'Confirmação Google expirada ou inválida. Inicie a conexão novamente.');this.repo.db.prepare('DELETE FROM oauth_states WHERE state=?').run(hash(state));return record});
    if(query.error)throw fail(400,'A conexão Google não foi autorizada.');
    if(typeof query.code!=='string'||query.code.length>4000)throw fail(400,'Código de autorização inválido.');
    const tokens=await this.token({code:query.code,code_verifier:saved.verifier,redirect_uri:this.config.redirectURI,grant_type:'authorization_code'});
    const scopes=String(tokens.scope||'').split(' ');
    if(!this.scopes.filter(s=>s.startsWith('https:')).every(s=>scopes.includes(s)))throw fail(403,'Autorize as permissões de eventos e arquivos solicitadas para concluir a conexão.');
    const user=await this.raw('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}},'identificar a conta Google');
    if(!user.sub||!user.email||!user.email_verified)throw fail(403,'Não foi possível validar a conta Google.');
    const previous=this.connection();
    const bound=this.repo.listOperations().filter(o=>o.schedule?.eventId);
    const pending=this.repo.db.prepare('SELECT intent FROM sync_jobs').all().map(r=>JSON.parse(r.intent));
    if(bound.some(o=>o.schedule.accountSub!==user.sub)||pending.some(o=>o.accountSub!==user.sub))throw fail(409,'Reconecte a conta usada nos agendamentos existentes antes de trocar de conta.');
    const refresh=tokens.refresh_token||(previous?.sub===user.sub?previous.refreshToken:null);if(!refresh)throw fail(400,'O Google não retornou acesso offline. Reconecte e autorize novamente.');
    this.saveConnection({connectedAt:previous?.sub===user.sub?(previous.connectedAt||new Date().toISOString()):new Date().toISOString(),id:previous?.sub===user.sub?previous.id:crypto.randomUUID(),sub:user.sub,email:user.email,calendarId:previous?.sub===user.sub?previous.calendarId:this.config.calendarId||'primary',folderId:previous?.sub===user.sub?previous.folderId:this.repo.config('googleFolder:'+user.sub),accessToken:tokens.access_token,refreshToken:refresh,expires:Date.now()+tokens.expires_in*1000,scopes,needsReconnect:false});
    return this.status();
  }
  async token(fields){
    const response=await this.fetch(tokenURL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,client_id:this.config.clientId,client_secret:this.config.clientSecret}),signal:AbortSignal.timeout(20000)});
    const body=await response.json();if(!response.ok||!body.access_token)throw fail(502,'Não foi possível autorizar a conta Google. Confira a configuração e reconecte.');return body;
  }
  async access(force=false){
    const c=this.requireConnection();if(!force&&c.expires>Date.now()+60000)return c.accessToken;
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{try{const tokens=await this.token({refresh_token:c.refreshToken,grant_type:'refresh_token'});this.updateConnection(c.id,{accessToken:tokens.access_token,expires:Date.now()+tokens.expires_in*1000,needsReconnect:false});return tokens.access_token}catch(error){this.updateConnection(c.id,{needsReconnect:true});throw error}finally{this.refreshing=null}})();return this.refreshing;
  }
  async raw(url,options={},purpose='concluir a operação Google'){
    let response;
    const timeout=AbortSignal.timeout(30000),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
    try{response=await this.fetch(url,{...options,signal})}catch{throw fail(502,`A comunicação com o Google foi interrompida ao ${purpose}. Tente novamente; a operação será recuperada sem duplicar o evento.`)}
    if(response.status===204)return null;
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=fail(502,`Não foi possível ${purpose} (Google ${response.status}). Tente novamente ou reconecte a conta.`);error.googleStatus=response.status;throw error}return data;
  }
  async request(url,options={},purpose){
    let token=await this.access();
    try{return await this.raw(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token}},purpose)}catch(error){if(error.googleStatus!==401)throw error;token=await this.access(true);return this.raw(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token}},purpose)}
  }
  async disconnect(){
    const c=this.connection();if(!c)return {ok:true};
    if(this.canRevoke&&!this.canRevoke()){this.repo.setConfig('google',null);return {ok:true,revoked:false,revocationSkipped:true};}
    let revoked=true;try{const r=await this.fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:c.refreshToken}),signal:AbortSignal.timeout(15000)});revoked=r.ok}catch{revoked=false}
    this.repo.setConfig('google',null);return {ok:true,revoked};
  }
  async newDriveId(options={}){const result=await this.request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',options,'reservar o arquivo no Drive');if(!result.ids?.[0])throw fail(502,'O Drive não retornou um identificador de arquivo.');return result.ids[0]}
  async driveFile(id,options={}){try{return await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,webViewLink,trashed`,options,'consultar o arquivo no Drive')}catch(error){if(error.googleStatus===404)return null;throw error}}
  async folder(options={}){if(this.folderPromise)return this.folderPromise;this.folderPromise=this.ensureFolder(options);try{return await this.folderPromise}finally{this.folderPromise=null}}
  async ensureFolder(options={}){
    let c=this.requireConnection();if(!c.folderId){c=this.updateConnection(c.id,{folderId:await this.newDriveId(options)});this.repo.setConfig('googleFolder:'+c.sub,c.folderId)}
    const found=await this.driveFile(c.folderId,options);if(found&&!found.trashed)return c.folderId;
    if(found?.trashed)throw fail(409,'A pasta de orçamentos foi movida para a lixeira do Drive. Restaure a pasta antes de continuar.');
    try{await this.request('https://www.googleapis.com/drive/v3/files?fields=id',{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:c.folderId,name:(this.repo.config('settings')?.company?.name||'Empresa')+' - Orçamentos',mimeType:'application/vnd.google-apps.folder',appProperties:{ecocleanWorkspace:this.repo.config('workspaceId')}})},'criar a pasta da empresa no Drive')}catch(error){if(error.googleStatus!==409)throw error;const existing=await this.driveFile(c.folderId,options);if(!existing||existing.trashed)throw error}
    return c.folderId;
  }
  async upload(pdf,options={}){
    const c=this.requireConnection();let record=this.repo.db.prepare('SELECT * FROM drive_files WHERE pdf_id=? AND account=?').get(pdf.id,c.sub);
    if(record?.status==='ready')return {id:record.drive_id,url:record.url};
    const folderId=await this.folder(options);
    if(!record){const id=await this.newDriveId(options);this.repo.db.prepare('INSERT INTO drive_files VALUES (?,?,?,?,?) ON CONFLICT(pdf_id,account) DO NOTHING').run(pdf.id,c.sub,id,null,'pending');record=this.repo.db.prepare('SELECT * FROM drive_files WHERE pdf_id=? AND account=?').get(pdf.id,c.sub)}
    let file=await this.driveFile(record.drive_id,options);
    if(!file){
      const boundary='ecoclean_'+crypto.randomBytes(16).toString('hex');
      const meta={id:record.drive_id,name:pdf.filename,mimeType:'application/pdf',parents:[folderId],appProperties:{ecocleanPdf:pdf.id,ecocleanHash:pdf.fingerprint}};
      const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),fs.readFileSync(this.repo.file(pdf)),Buffer.from(`\r\n--${boundary}--\r\n`)]);
      try{file=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,trashed',{...options,method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body},'anexar o PDF no Drive')}catch(error){if(error.googleStatus!==409)throw error;file=await this.driveFile(record.drive_id,options);if(!file)throw error}
    }
    if(file.trashed||!file.webViewLink||file.mimeType!=='application/pdf')throw fail(409,'O PDF no Drive não está disponível. Verifique o arquivo na conta conectada.');
    this.repo.db.prepare("UPDATE drive_files SET url=?,status='ready' WHERE pdf_id=? AND account=?").run(file.webViewLink,pdf.id,c.sub);
    return {id:record.drive_id,url:file.webViewLink};
  }
  eventURL(calendar,id=''){return 'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar)+'/events'+(id?'/'+encodeURIComponent(id):'')}
  async event(calendar,id,options={}){try{return await this.request(this.eventURL(calendar,id),options,'consultar o agendamento')}catch(error){if([404,410].includes(error.googleStatus))return null;throw error}}
  async upsertEvent(calendar,id,body,workspace,options={}){
    let found=await this.event(calendar,id,options);
    if(found?.status==='cancelled')throw fail(409,'Este evento foi removido no Google. Cancele o vínculo antes de criar outro atendimento.');
    if(found&&found.extendedProperties?.private?.ecocleanWorkspace!==workspace)throw fail(409,'O evento não pertence a este sistema. A alteração foi interrompida.');
    if(found?.extendedProperties?.private?.intentHash===body.extendedProperties.private.intentHash)return found;
    const query='?supportsAttachments=true&sendUpdates=none';
    if(!found){try{return await this.request(this.eventURL(calendar)+query,{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,id})},'criar o evento no Google Agenda')}catch(error){if(error.googleStatus!==409)throw error;found=await this.event(calendar,id,options);if(!found||found.status==='cancelled'||found.extendedProperties?.private?.ecocleanWorkspace!==workspace)throw error}}
    return this.request(this.eventURL(calendar,id)+query,{...options,method:'PATCH',headers:{'Content-Type':'application/json',...(found.etag?{'If-Match':found.etag}:{})},body:JSON.stringify(body)},'atualizar o evento no Google Agenda');
  }
  async deleteEvent(calendar,id,workspace,options={}){
    const found=await this.event(calendar,id,options);if(!found||found.status==='cancelled')return;
    if(found.extendedProperties?.private?.ecocleanWorkspace!==workspace)throw fail(409,'O evento não pertence a este sistema.');
    try{await this.request(this.eventURL(calendar,id)+'?sendUpdates=none',{...options,method:'DELETE'},'cancelar o evento no Google Agenda')}catch(error){if(![404,410].includes(error.googleStatus))throw error}
  }
}
