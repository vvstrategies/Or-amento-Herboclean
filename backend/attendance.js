import crypto from 'node:crypto';
import {documentHash,fail,hash} from './database.js';
import {passwordHash} from './security.js';
import {ORIGINS,FUNNELS} from './commercial.js';
import {modelo} from '../utils/proposta.js';

export function brazilPhone(value){const digits=String(value||'').replace(/\D/g,'');return /^(?:55)?\d{10,11}$/.test(digits)?(digits.length<=11?'55'+digits:digits):''}
export function registerAttendance(app,{repo,sec,commercial,asaas,origin,extensionId,wrap}){
  const team=sec.team,db=repo.db;
  db.exec(`CREATE TABLE IF NOT EXISTS attendance_owners(client_id TEXT PRIMARY KEY,user_id TEXT,revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pdf_shares(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,pdf_id TEXT NOT NULL,actor_id TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);`);
  const audit=(req,action,id)=>team.audit(req.session.user.id,action,id);
  const owner=id=>{const row=db.prepare('SELECT * FROM attendance_owners WHERE client_id=?').get(id);return {user:row?.user_id?team.user(row.user_id):null,revision:row?.revision||0}};
  const detail=id=>{const client=commercial.clientDetail(id);return {...client,etag:hash(JSON.stringify(commercial.client(id))),owner:owner(id),history:client.history.map(q=>({...q,operation:repo.operation(q.id),operationRevision:hash(JSON.stringify(repo.operation(q.id)))}))}};
  const initialReplies=[{id:'hello',title:'Boas-vindas',text:'Olá, {nome}! Sou {atendente}, da Herboclean. Como podemos ajudar?'},{id:'follow',title:'Retomar orçamento',text:'Olá, {nome}! Ficou alguma dúvida sobre nossa proposta? Estou à disposição para ajudar.'},{id:'thanks',title:'Agradecimento',text:'Obrigado pela confiança, {nome}! Conte com a Herboclean.'}];
  app.get('/api/panel/config',(req,res)=>res.json({extensionOrigin:extensionId?'chrome-extension://'+extensionId:null,businessPhone:'5511926126244',testPhone:'5511986495346',pilot:true}));
  app.post('/api/panel/login',sec.sameOrigin,wrap(sec.panelLogin));
  app.use('/api/panel',sec.panelAuth);
  app.get('/api/panel/session',(req,res)=>res.json({user:req.session.user,origins:ORIGINS,tags:commercial.tags(),funnels:FUNNELS,replies:repo.config('attendance-replies')||initialReplies}));
  app.post('/api/panel/logout',(req,res)=>{db.prepare('DELETE FROM sessions WHERE id=?').run(req.session.id);res.json({ok:true})});
  app.get('/api/panel/users',(req,res)=>res.json(team.list()));
  app.post('/api/panel/users',wrap(async(req,res)=>{const password=req.body.password;if(typeof password!=='string'||password.length<12||password.length>200)throw fail(400,'Use uma senha de 12 a 200 caracteres.');const encoded=await passwordHash(password);if(!team.user(req.session.user.id)?.active)throw fail(401,'Acesso revogado.');res.json(team.create(req.body,encoded,req.session.user.id))}));
  app.delete('/api/panel/users/:id',(req,res)=>res.json(team.remove(req.params.id,req.session.user.id)));
  app.put('/api/panel/password',wrap(async(req,res)=>{const password=req.body.password;if(typeof password!=='string'||password.length<12||password.length>200)throw fail(400,'Use uma senha de 12 a 200 caracteres.');const encoded=await passwordHash(password),id=req.session.user.id;repo.transaction(()=>{if(!team.user(id)?.active)throw fail(401,'Acesso revogado.');if(id==='administrator')repo.setConfig('adminPassword',encoded);else db.prepare('UPDATE team_users SET password_hash=? WHERE id=?').run(encoded,id);db.prepare('DELETE FROM sessions WHERE id IN (SELECT session_id FROM session_actors WHERE user_id=?)').run(id);if(id==='administrator')db.prepare('DELETE FROM sessions WHERE id NOT IN (SELECT session_id FROM session_actors)').run();audit(req,'user.password',id)});res.json({ok:true})}));
  app.get('/api/panel/audit',(req,res)=>res.json(db.prepare('SELECT * FROM attendance_audit ORDER BY id DESC LIMIT 100').all().map(r=>({...r,actor:team.user(r.actor_id)?.name||'Usuário excluído'}))));
  app.get('/api/panel/clients',(req,res)=>{
    const phone=brazilPhone(req.query.phone),query=String(req.query.q||'').trim().toLocaleLowerCase('pt-BR').slice(0,100);
    if(!phone&&query.length<2)return res.json([]);
    const rows=commercial.clientRows().filter(c=>phone?brazilPhone(c.phone)===phone:(c.name.toLocaleLowerCase('pt-BR').includes(query)||c.phone.includes(query)));
    res.json(rows.slice(0,30).map(c=>({id:c.id,name:c.name,phone:c.phone,address:c.address})));
  });
  app.post('/api/panel/clients',(req,res)=>{if(!brazilPhone(req.body.phone))throw fail(400,'Informe telefone com DDD.');const client=repo.transaction(()=>{if(commercial.clientRows().some(c=>brazilPhone(c.phone)===brazilPhone(req.body.phone)))throw fail(409,'Já existe um cliente com esse telefone. Busque o cadastro antes de criar outro.');const value=commercial.createClient({...req.body,phone:brazilPhone(req.body.phone)});audit(req,'client.create',value.id);return value});res.json(detail(client.id))});
  app.get('/api/panel/clients/:id',(req,res)=>res.json(detail(req.params.id)));
  app.put('/api/panel/clients/:id',(req,res)=>{repo.transaction(()=>{if(req.body.etag!==hash(JSON.stringify(commercial.client(req.params.id))))throw fail(409,'Outro usuário atualizou o cliente. Reabra a ficha antes de salvar.');commercial.updateClient(req.params.id,req.body);audit(req,'client.update',req.params.id)});res.json(detail(req.params.id))});
  app.put('/api/panel/clients/:id/owner',(req,res)=>{res.json(repo.transaction(()=>{commercial.clientDetail(req.params.id);const old=owner(req.params.id);if(req.body.revision!==old.revision)throw fail(409,'O responsável mudou. Atualize a ficha.');const id=req.body.userId;if(id!==null&&!team.user(id)?.active)throw fail(400,'Responsável inválido.');db.prepare('INSERT INTO attendance_owners VALUES (?,?,?) ON CONFLICT(client_id) DO UPDATE SET user_id=excluded.user_id,revision=excluded.revision').run(req.params.id,id,old.revision+1);audit(req,'attendance.assign',req.params.id);return owner(req.params.id)}))});
  app.post('/api/panel/clients/:id/draft',(req,res)=>{const c=commercial.clientDetail(req.params.id),q=modelo.quote(repo.config('settings')||{}),slot=crypto.randomUUID();Object.assign(q,{client:c.name,clientContact:c.phone,address:c.address,origin:c.origin,tags:c.tags});team.saveDraft(req.session.user.id,slot,{id:'current',quote:q},0);audit(req,'draft.create',q.id);res.json({url:origin+'/?draft='+slot+'&account='+encodeURIComponent(req.session.user.username)+'#criar'})});
  app.post('/api/panel/proposals/:id/stage',(req,res)=>{repo.transaction(()=>{if(req.body.operationRevision!==hash(JSON.stringify(repo.operation(req.params.id))))throw fail(409,'A etapa mudou. Atualize a ficha.');commercial.setStage(req.params.id,req.body);audit(req,'proposal.stage',req.params.id)});res.json({ok:true})});
  app.post('/api/panel/proposals/:id/share',(req,res)=>{
    const q=repo.requireProposal(req.params.id),pdf=repo.listPDFs(q.id)[0];
    if(repo.operation(q.id).status==='cancelled')throw fail(409,'O orçamento está cancelado.');
    if(!pdf||pdf.fingerprint!==documentHash(q)||pdf.proposalVersionId!==q.versionId)throw fail(409,'Atualize o PDF no orçamento antes de compartilhar.');
    const token=crypto.randomBytes(32).toString('hex'),id=crypto.randomUUID(),expires=Date.now()+7*86400000;
    db.prepare('INSERT INTO pdf_shares(id,token_hash,pdf_id,actor_id,expires) VALUES (?,?,?,?,?)').run(id,hash(token),pdf.id,req.session.user.id,expires);audit(req,'pdf.share',pdf.id);
    const payments=asaas.list(q.id).filter(p=>p.revision===q.revision&&p.status==='PENDING'&&p.invoiceUrl);
    res.json({id,url:origin+'/proposta/'+token,expires,payments});
  });
  app.get('/api/panel/shares',(req,res)=>res.json(db.prepare('SELECT id,pdf_id,expires,revoked FROM pdf_shares ORDER BY expires DESC LIMIT 100').all()));
  app.delete('/api/panel/shares/:id',(req,res)=>{db.prepare('UPDATE pdf_shares SET revoked=1 WHERE id=?').run(req.params.id);audit(req,'pdf.revoke',req.params.id);res.json({ok:true})});
  app.put('/api/panel/replies',(req,res)=>{const list=req.body.replies;if(!Array.isArray(list)||list.length>30||list.some(r=>typeof r.title!=='string'||!r.title.trim()||r.title.length>80||typeof r.text!=='string'||!r.text.trim()||r.text.length>4000))throw fail(400,'Cadastre até 30 respostas com título e texto.');const previous=repo.config('attendance-replies')||initialReplies;if(req.body.revision!==hash(JSON.stringify(previous)))throw fail(409,'As respostas mudaram. Atualize antes de salvar.');const result=list.map(r=>({id:crypto.randomUUID(),title:r.title,text:r.text}));repo.setConfig('attendance-replies',result);audit(req,'replies.update','all');res.json(result)});
  app.get('/api/panel/replies',(req,res)=>{const replies=repo.config('attendance-replies')||initialReplies;res.json({replies,revision:hash(JSON.stringify(replies))})});
  app.use('/api/panel',(req,res)=>res.status(404).json({error:'Recurso do painel não encontrado.'}));
  app.get('/proposta/:token',(req,res)=>{
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});const token=req.params.token;if(!/^[a-f0-9]{64}$/.test(token))throw fail(404,'Link não encontrado.');
    const share=db.prepare('SELECT * FROM pdf_shares WHERE token_hash=? AND revoked=0 AND expires>?').get(hash(token),Date.now()),pdf=share&&repo.pdf(share.pdf_id);
    if(!pdf)throw fail(410,'Este link expirou ou foi revogado. Solicite uma proposta atualizada.');
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Disposition':'inline; filename="proposta.pdf"'}).type('pdf').sendFile(repo.file(pdf));
  });
}
