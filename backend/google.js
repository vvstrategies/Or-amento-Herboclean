import crypto from 'node:crypto';
import fs from 'node:fs';
import { fail, hash } from './database.js';
import { GOOGLE_SCOPES, classifyTokenFailure, mergeRefreshedTokens, grantedScopes } from './google-oauth.js';

const authURL='https://accounts.google.com/o/oauth2/v2/auth',tokenURL='https://oauth2.googleapis.com/token',peopleURL='https://people.googleapis.com/v1/';
const nowISO=()=>new Date().toISOString();
const codeError=(status,message,code)=>Object.assign(fail(status,message),{code});
// Campos pedidos à People API: só o que o formulário do cliente usa.
const PERSON_FIELDS='names,phoneNumbers,emailAddresses,addresses,birthdays,organizations';
const pad2=n=>String(n).padStart(2,'0');
function normalizePerson(p){
  const pick=list=>(Array.isArray(list)?list:[]);
  const name=pick(p.names).find(n=>n.metadata?.primary)?.displayName||pick(p.names)[0]?.displayName||'';
  const phones=pick(p.phoneNumbers).filter(x=>x.value).map(x=>({value:String(x.value).slice(0,60),type:String(x.formattedType||x.type||'').slice(0,40),primary:!!x.metadata?.primary}));
  const emails=pick(p.emailAddresses).filter(x=>x.value).map(x=>({value:String(x.value).slice(0,240),type:String(x.formattedType||x.type||'').slice(0,40),primary:!!x.metadata?.primary}));
  const addresses=pick(p.addresses).map(a=>({formatted:String(a.formattedValue||'').slice(0,800),street:String(a.streetAddress||'').slice(0,240),neighborhood:String(a.extendedAddress||'').slice(0,160),city:String(a.city||'').slice(0,160),region:String(a.region||'').slice(0,80),postalCode:String(a.postalCode||'').slice(0,20),country:String(a.country||'').slice(0,80),countryCode:String(a.countryCode||'').slice(0,4),type:String(a.formattedType||a.type||'').slice(0,40)})).filter(a=>a.formatted||a.street||a.city);
  const b=pick(p.birthdays).map(x=>x.date).find(d=>d&&d.month&&d.day);
  const organization=String(pick(p.organizations)[0]?.name||'').slice(0,240);
  return {id:String(p.resourceName||'').slice(0,200),name:String(name).slice(0,240),phones,emails,addresses,birthday:b?pad2(b.month)+'-'+pad2(b.day):'',organization,source:'google'};
}

// Gerenciador de tokens OAuth da conta Google usada por Calendar, Drive e Contatos.
// - O refresh token fica criptografado no SQLite (DATA_DIR persistente), nunca em memória ou no navegador.
// - Access token expirado é renovado automaticamente; o refresh token só é trocado se o Google enviar um novo.
// - Só invalid_grant marca a conexão como revogada. Rede, timeout e 5xx ficam como "temporariamente indisponível".
// - Cada recurso declara os escopos de que precisa; Contatos é pedido de forma incremental, sem derrubar Calendar/Drive.
export class GoogleIntegration{
  constructor(repo,vault,config={},fetcher=globalThis.fetch){
    this.repo=repo;this.vault=vault;this.config=config;this.fetch=fetcher;this.refreshing=null;this.contactsWarmAt=0;
    this.calendarScopes=[config.calendarScope||GOOGLE_SCOPES.calendar,GOOGLE_SCOPES.drive];
    this.scopes=['openid','email',...this.calendarScopes];
    // Migração não destrutiva: guarda para que fluxo o consentimento foi iniciado.
    repo.ensureColumn('oauth_states','purpose','TEXT');
  }
  configured(){return !!(this.config.clientId&&this.config.clientSecret&&this.config.redirectURI)}
  connection(){const value=this.repo.config('google');return value?this.vault.open(value):null}
  saveConnection(value){this.repo.setConfig('google',this.vault.seal(value))}
  updateConnection(id,patch){const latest=this.connection();if(!latest||latest.id!==id)throw fail(409,'A conexão Google mudou. Tente novamente.');this.saveConnection({...latest,...patch});return this.connection()}
  // Conexões antigas sem lista de escopos foram criadas exigindo Calendar e Drive.
  grants(c){return Array.isArray(c?.scopes)&&c.scopes.length?c.scopes:c?[...this.scopes]:[]}
  has(c,scopes){const g=this.grants(c);return scopes.every(s=>g.includes(s))}
  status(){
    const c=this.connection(),configured=this.configured(),calendarReady=!!c&&this.has(c,this.calendarScopes);
    const recentFailure=!!c?.lastFailureAt&&c.lastErrorCode==='TEMPORARY'&&c.lastFailureAt>(c.lastSuccessfulAt||c.tokenRefreshAt||'');
    const state=!configured?'not_configured':!c?'not_connected':c.needsReconnect?'revoked':c.lastErrorCode==='CONFIG'?'config_error':!calendarReady?'attention':recentFailure?'temporarily_unavailable':'connected';
    return {configured,connected:!!c&&!c.needsReconnect&&calendarReady,email:c?.email||null,calendarId:c?.calendarId||this.config.calendarId||'primary',needsReconnect:!!c?.needsReconnect,state,
      scopes:{calendar:!!c&&this.has(c,[this.calendarScopes[0]]),drive:!!c&&this.has(c,[GOOGLE_SCOPES.drive]),contacts:!!c&&!c.needsReconnect&&this.has(c,[GOOGLE_SCOPES.contacts])},
      connectedAt:c?.connectedAt||null,lastSuccessfulAt:c?.lastSuccessfulAt||null,lastFailureAt:c?.lastFailureAt||null,lastErrorCode:c?.lastErrorCode||null,tokenRefreshAt:c?.tokenRefreshAt||null};
  }
  requireConnection(required=this.calendarScopes){
    const c=this.connection(),contacts=required.includes(GOOGLE_SCOPES.contacts);
    if(!this.configured()||!c)throw codeError(503,contacts?'Conecte a conta Google para importar contatos.':'Conecte a conta Google em Configurações para aprovar e agendar.',contacts?'GOOGLE_CONTACTS_SCOPE':'GOOGLE_NOT_CONNECTED');
    if(c.needsReconnect)throw codeError(503,'A autorização Google expirou ou foi revogada. Reconecte a conta Google em Configurações.','GOOGLE_RECONNECT');
    if(!this.has(c,required))throw codeError(403,contacts?'Autorize a leitura dos Google Contatos para continuar.':'Autorize Agenda e Drive na conta Google em Configurações.',contacts?'GOOGLE_CONTACTS_SCOPE':'GOOGLE_SCOPE_REQUIRED');
    return c;
  }
  // purpose 'contacts': autorização incremental só do escopo de leitura de contatos.
  connect(session,{purpose='calendar'}={}){
    if(!this.configured())throw fail(503,'Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor. Consulte o guia de conexão em Configurações.');
    purpose=purpose==='contacts'?'contacts':'calendar';
    const c=this.connection(),healthy=!!c&&!c.needsReconnect;
    const scopes=purpose==='contacts'?(healthy?['openid','email',GOOGLE_SCOPES.contacts]:[...this.scopes,GOOGLE_SCOPES.contacts]):this.scopes;
    const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
    this.repo.db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
    this.repo.db.prepare('INSERT INTO oauth_states (state,session_id,verifier,expires,purpose) VALUES (?,?,?,?,?)').run(hash(state),session.id,verifier,Date.now()+600000,purpose);
    // prompt=consent só neste clique explícito de conectar/autorizar: é o que garante o refresh token (access_type=offline).
    // include_granted_scopes mantém Calendar/Drive ao adicionar Contatos (e vice-versa).
    const params={client_id:this.config.clientId,redirect_uri:this.config.redirectURI,response_type:'code',scope:scopes.join(' '),access_type:'offline',include_granted_scopes:'true',prompt:'consent',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(healthy&&c.email?{login_hint:c.email}:{})};
    const url=new URL(authURL);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    return {url:url.href,purpose};
  }
  async callback(query,session){
    const state=typeof query.state==='string'?query.state:'';
    const saved=this.repo.transaction(()=>{const record=this.repo.db.prepare('SELECT * FROM oauth_states WHERE state=?').get(hash(state));if(!record||record.session_id!==session.id||record.expires<Date.now())throw fail(403,'Confirmação Google expirada ou inválida. Inicie a conexão novamente.');this.repo.db.prepare('DELETE FROM oauth_states WHERE state=?').run(hash(state));return record});
    const purpose=saved.purpose==='contacts'?'contacts':'calendar';
    if(query.error)throw Object.assign(fail(400,'A conexão Google não foi autorizada.'),{purpose});
    if(typeof query.code!=='string'||query.code.length>4000)throw Object.assign(fail(400,'Código de autorização inválido.'),{purpose});
    const tokens=await this.token({code:query.code,code_verifier:saved.verifier,redirect_uri:this.config.redirectURI,grant_type:'authorization_code'});
    const scopes=grantedScopes(tokens.scope),previous=this.connection();
    const required=purpose==='contacts'?[GOOGLE_SCOPES.contacts]:this.calendarScopes;
    if(!required.every(s=>scopes.includes(s)))throw Object.assign(fail(403,purpose==='contacts'?'Autorize a leitura dos contatos para importar do Google Contatos.':'Autorize as permissões de eventos e arquivos solicitadas para concluir a conexão.'),{purpose});
    const user=await this.raw('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}},'identificar a conta Google');
    if(!user.sub||!user.email||!user.email_verified)throw fail(403,'Não foi possível validar a conta Google.');
    if(purpose==='contacts'&&previous&&!previous.needsReconnect&&previous.sub!==user.sub)throw Object.assign(fail(409,'Use a mesma conta Google já conectada à agenda ('+previous.email+') para importar contatos.'),{purpose});
    const bound=this.repo.listOperations().filter(o=>o.schedule?.eventId);
    const pending=this.repo.db.prepare('SELECT intent FROM sync_jobs').all().map(r=>JSON.parse(r.intent));
    if(bound.some(o=>o.schedule.accountSub!==user.sub)||pending.some(o=>o.accountSub!==user.sub))throw fail(409,'Reconecte a conta usada nos agendamentos existentes antes de trocar de conta.');
    const same=previous?.sub===user.sub;
    const refresh=(typeof tokens.refresh_token==='string'&&tokens.refresh_token)||(same?previous.refreshToken:null);if(!refresh)throw fail(400,'O Google não retornou acesso offline. Reconecte e autorize novamente.');
    // Com include_granted_scopes o token cobre tudo que já foi concedido; mesmo assim, preserva os escopos anteriores da mesma conta.
    const allScopes=[...new Set([...(same&&!previous.needsReconnect?this.grants(previous):[]),...scopes])];
    const at=nowISO();
    this.saveConnection({connectedAt:same?(previous.connectedAt||at):at,id:same?previous.id:crypto.randomUUID(),sub:user.sub,email:user.email,calendarId:same?previous.calendarId:this.config.calendarId||'primary',folderId:same?previous.folderId:this.repo.config('googleFolder:'+user.sub),accessToken:tokens.access_token,refreshToken:refresh,expires:Date.now()+Number(tokens.expires_in||3600)*1000,scopes:allScopes,needsReconnect:false,lastSuccessfulAt:at,tokenRefreshAt:at,lastFailureAt:same?previous.lastFailureAt||null:null,lastErrorCode:null});
    return {...this.status(),purpose};
  }
  async token(fields){
    let response,body;
    try{response=await this.fetch(tokenURL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,client_id:this.config.clientId,client_secret:this.config.clientSecret}),signal:AbortSignal.timeout(20000)})}
    catch{throw Object.assign(fail(503,'O Google não respondeu. A conexão foi preservada; tente novamente em instantes.'),{oauthFailure:'temporary'})}
    body=await response.json().catch(()=>({}));
    if(!response.ok||!body.access_token){
      const kind=response.ok?'temporary':classifyTokenFailure(response.status,body);
      const message=kind==='revoked'?'A autorização Google expirou ou foi revogada. Reconecte a conta.':kind==='config'?'As credenciais do app Google no servidor foram recusadas. Confira GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.':'O Google está temporariamente indisponível. A conexão foi preservada; tente novamente em instantes.';
      throw Object.assign(fail(kind==='revoked'?401:503,message),{oauthFailure:kind});
    }
    return body;
  }
  async access(force=false,required=this.calendarScopes){
    const c=this.requireConnection(required);if(!force&&c.expires>Date.now()+60000)return c.accessToken;
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{
      try{
        const tokens=await this.token({refresh_token:c.refreshToken,grant_type:'refresh_token'}),next=mergeRefreshedTokens({accessToken:c.accessToken,refreshToken:c.refreshToken,expires:c.expires},tokens),at=nowISO();
        const scopes=tokens.scope?[...new Set([...grantedScopes(tokens.scope),...this.grants(c).filter(s=>!s.startsWith('https:'))])]:this.grants(c);
        this.updateConnection(c.id,{...next,scopes,needsReconnect:false,tokenRefreshAt:at,lastErrorCode:null});return next.accessToken;
      }catch(error){
        const at=nowISO();
        // Só invalid_grant é revogação. Qualquer outra falha preserva a conexão e os tokens.
        try{if(error.oauthFailure==='revoked')this.updateConnection(c.id,{needsReconnect:true,lastFailureAt:at,lastErrorCode:'REVOKED'});else this.updateConnection(c.id,{lastFailureAt:at,lastErrorCode:error.oauthFailure==='config'?'CONFIG':'TEMPORARY'})}catch{}
        throw error.oauthFailure==='revoked'?codeError(503,error.message,'GOOGLE_RECONNECT'):error;
      }finally{this.refreshing=null}
    })();return this.refreshing;
  }
  noteSuccess(c){if(!c||Date.now()-Date.parse(c.lastSuccessfulAt||0)<600000&&c.lastErrorCode!=='TEMPORARY')return;try{this.updateConnection(c.id,{lastSuccessfulAt:nowISO(),...(c.lastErrorCode==='TEMPORARY'?{lastErrorCode:null}:{})})}catch{}}
  noteFailure(error){if(!(error?.googleStatus>=500||error?.googleNetwork))return;const c=this.connection();if(!c)return;try{this.updateConnection(c.id,{lastFailureAt:nowISO(),lastErrorCode:'TEMPORARY'})}catch{}}
  async raw(url,options={},purpose='concluir a operação Google'){
    let response;
    const timeout=AbortSignal.timeout(30000),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
    try{response=await this.fetch(url,{...options,signal})}catch{throw Object.assign(fail(502,`A comunicação com o Google foi interrompida ao ${purpose}. Tente novamente; a operação será recuperada sem duplicar o evento.`),{googleNetwork:true})}
    if(response.status===204)return null;
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=fail(502,`Não foi possível ${purpose} (Google ${response.status}). Tente novamente ou reconecte a conta.`);error.googleStatus=response.status;throw error}return data;
  }
  async request(url,options={},purpose,required=this.calendarScopes){
    let token=await this.access(false,required);
    const call=t=>this.raw(url,{...options,headers:{...options.headers,Authorization:'Bearer '+t}},purpose);
    try{let result;try{result=await call(token)}catch(error){if(error.googleStatus!==401)throw error;token=await this.access(true,required);result=await call(token)}this.noteSuccess(this.connection());return result}
    catch(error){this.noteFailure(error);throw error}
  }
  // Google Contatos (People API, somente leitura). Nada é guardado: a lista vai direto para o seletor do navegador.
  async contacts({pageToken='',query=''}={}){
    const q=String(query||'').trim().slice(0,100),scope=[GOOGLE_SCOPES.contacts];
    if(q){
      // A busca exige uma requisição de aquecimento com consulta vazia antes do primeiro uso.
      if(Date.now()-this.contactsWarmAt>600000){await this.request(peopleURL+'people:searchContacts?'+new URLSearchParams({query:'',readMask:'names',pageSize:'1'}),{},'consultar os Google Contatos',scope);this.contactsWarmAt=Date.now()}
      const r=await this.request(peopleURL+'people:searchContacts?'+new URLSearchParams({query:q,readMask:PERSON_FIELDS,pageSize:'30'}),{},'buscar nos Google Contatos',scope);
      return {contacts:(r?.results||[]).map(x=>normalizePerson(x.person||{})).filter(c=>c.name||c.phones.length||c.emails.length),nextPageToken:null};
    }
    const params=new URLSearchParams({personFields:PERSON_FIELDS,pageSize:'50',sortOrder:'FIRST_NAME_ASCENDING'});if(typeof pageToken==='string'&&/^[\w\-.~=+/]{1,2000}$/.test(pageToken))params.set('pageToken',pageToken);
    const r=await this.request(peopleURL+'people/me/connections?'+params,{},'listar os Google Contatos',scope);
    return {contacts:(r?.connections||[]).map(normalizePerson).filter(c=>c.name||c.phones.length||c.emails.length),nextPageToken:r?.nextPageToken||null,total:Number.isFinite(r?.totalPeople)?r.totalPeople:null};
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
