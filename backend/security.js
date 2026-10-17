import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fail, hash } from './database.js';
import {Team} from './team.js';
const scrypt=promisify(crypto.scrypt);
const passwordOptions={N:32768,r:8,p:1,maxmem:64*1024*1024};
export async function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex'),key=await scrypt(password,salt,64,passwordOptions);return salt+':'+key.toString('hex')}
export async function checkPassword(password,value){try{const [salt,hex]=value.split(':'),key=await scrypt(password,salt,64,passwordOptions),expected=Buffer.from(hex,'hex');return key.length===expected.length&&crypto.timingSafeEqual(key,expected)}catch{return false}}
export function vault(dir,provided,production=false){
  let key;
  if(provided){key=Buffer.from(provided,'base64');if(key.length!==32)throw Error('GOOGLE_TOKEN_ENCRYPTION_KEY deve ter 32 bytes codificados em base64.')}
  else {if(production)throw Error('Configure GOOGLE_TOKEN_ENCRYPTION_KEY em produção.');const file=path.join(dir,'token-key');if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(32),{mode:0o600,flag:'wx'});key=fs.readFileSync(file);if(key.length!==32)throw Error('Chave local inválida.')}
  return {seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')},open(value){const data=Buffer.from(value,'base64'),decipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));decipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString())}};
}
export function security(repo,{origin,production=false,extensionId}){
  const team=new Team(repo);
  const originURL=new URL(origin),cookieName=production?'__Host-ecoclean':'ecoclean_session';
  const token=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  function session(t,kind){
    if(!/^[a-f0-9]{64}$/.test(t||''))return null;
    const row=repo.db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(hash(t),Date.now());if(!row)return null;
    const actor=repo.db.prepare('SELECT * FROM session_actors WHERE session_id=?').get(row.id);
    if((actor?.kind||'web')!==kind)return null;
    const user=team.user(actor?.user_id||'administrator');return user?.active?{...row,user}:null;
  }
  const read=req=>session(token(req),'web');
  function headers(req,res,next){
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
    if(production)res.set('Strict-Transport-Security','max-age=15552000');
    res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'self' blob:; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
    if(req.path==='/painel'&&/^[a-p]{32}$/.test(extensionId||'')){
      res.removeHeader('X-Frame-Options');res.set('Content-Security-Policy',res.get('Content-Security-Policy').replace("frame-ancestors 'self'", "frame-ancestors 'self' chrome-extension://"+extensionId));
    }
    if(req.headers.host!==originURL.host)return res.status(421).json({error:'Acesse pelo endereço configurado: '+origin});
    if(req.path.startsWith('/api/')||req.path.startsWith('/orcamentos/'))res.set('Cache-Control','no-store');
    req.session=read(req);next();
  }
  const requireAuth=(req,res,next)=>req.session?next():res.status(401).json({error:'Entre no sistema para continuar.'});
  const sameOrigin=(req,res,next)=>req.headers.origin===origin?next():res.status(403).json({error:'Origem da solicitação inválida.'});
  const csrf=(req,res,next)=>{
    if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
    if(req.headers.origin!==origin)return res.status(403).json({error:'Origem da solicitação inválida.'});
    if(!req.session||req.headers['x-csrf-token']!==req.session.csrf)return res.status(403).json({error:'Sua sessão mudou. Atualize a página para continuar.'});next();
  };
  function createSession(res,user=team.user('administrator'),kind='web'){
    const id=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex'),expires=Date.now()+12*3600000;
    repo.transaction(()=>{repo.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(id),csrf,expires);repo.db.prepare('INSERT INTO session_actors VALUES (?,?,?)').run(hash(id),user.id,kind)});
    if(kind==='web')res.cookie(cookieName,id,{httpOnly:true,sameSite:'lax',secure:production,path:'/',maxAge:12*3600000});
    return {authenticated:true,csrf,user,...(kind==='panel'?{token:id}:{}),expires};
  }
  // Atrás do proxy da Hostinger o socket é sempre 127.0.0.1: em produção vale o IP do cliente (trust proxy 1).
  const client=req=>hash((production?req.ip:req.socket.remoteAddress)||'local');
  function rate(req){const key=client(req),now=Date.now(),r=repo.db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);if(r&&r.expires>now&&r.count>=8)throw fail(429,'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');repo.db.prepare('INSERT OR REPLACE INTO rate_limits VALUES (?,?,?)').run(key,r&&r.expires>now?r.count+1:1,r&&r.expires>now?r.expires:now+900000)}
  function resetRate(req){repo.db.prepare('DELETE FROM rate_limits WHERE key=?').run(client(req))}
  function sweep(){const now=Date.now();repo.db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);repo.db.prepare('DELETE FROM rate_limits WHERE expires<=?').run(now)}
  async function setup(req,res){
    rate(req);if(repo.config('adminPassword'))throw fail(409,'O acesso já foi configurado.');
    if(production||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw fail(403,'Configure o primeiro acesso no computador do servidor.');
    const password=req.body.password;if(typeof password!=='string'||password.length<12||password.length>200)throw fail(400,'Use uma senha de 12 a 200 caracteres.');
    const value=await passwordHash(password);repo.transaction(()=>{if(repo.config('adminPassword'))throw fail(409,'O acesso já foi configurado.');repo.setConfig('adminPassword',value)});resetRate(req);res.json(createSession(res));
  }
  async function authenticate(req){
    rate(req);const password=String(req.body.password||''),username=String(req.body.username||'admin').trim().toLowerCase(),user=team.credential(username);
    if(password.length>200||!await checkPassword(password,user?.password_hash||'invalid:00')||!user)throw fail(401,'Usuário ou senha incorretos.');
    resetRate(req);return team.user(user.id);
  }
  async function login(req,res){const user=await authenticate(req);if(req.session)repo.db.prepare('DELETE FROM sessions WHERE id=?').run(req.session.id);res.json(createSession(res,user))}
  async function panelLogin(req,res){const user=await authenticate(req);res.json(createSession(res,user,'panel'))}
  function panelAuth(req,res,next){req.session=session(String(req.headers.authorization||'').replace(/^Bearer /,''),'panel');if(!req.session)return res.status(401).json({error:'Entre no painel para continuar.'});if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)return res.status(403).json({error:'Origem da solicitação inválida.'});next()}
  function logout(req,res){repo.db.prepare('DELETE FROM sessions WHERE id=?').run(req.session.id);res.clearCookie(cookieName,{path:'/',secure:production,httpOnly:true,sameSite:'lax'});res.json({ok:true})}
  return {team,headers,requireAuth,sameOrigin,csrf,setup,login,panelLogin,panelAuth,logout,sweep,status:req=>({authenticated:!!req.session,needsSetup:!repo.config('adminPassword'),csrf:req.session?.csrf||null,user:req.session?.user||null})};
}
