import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fail, hash } from './database.js';
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
export function security(repo,{origin,production=false}){
  const originURL=new URL(origin),cookieName=production?'__Host-ecoclean':'ecoclean_session';
  const token=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const read=req=>{const t=token(req);if(!t||!/^[a-f0-9]{64}$/.test(t))return null;return repo.db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(hash(t),Date.now())};
  function headers(req,res,next){
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
    res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'self' blob:; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
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
  function createSession(res){const id=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex'),expires=Date.now()+12*3600000;repo.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(id),csrf,expires);res.cookie(cookieName,id,{httpOnly:true,sameSite:'lax',secure:production,path:'/',maxAge:12*3600000});return {authenticated:true,csrf}}
  function rate(req){const key=hash(req.socket.remoteAddress||'local'),now=Date.now(),r=repo.db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);if(r&&r.expires>now&&r.count>=8)throw fail(429,'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');repo.db.prepare('INSERT OR REPLACE INTO rate_limits VALUES (?,?,?)').run(key,r&&r.expires>now?r.count+1:1,r&&r.expires>now?r.expires:now+900000)}
  function resetRate(req){repo.db.prepare('DELETE FROM rate_limits WHERE key=?').run(hash(req.socket.remoteAddress||'local'))}
  async function setup(req,res){
    rate(req);if(repo.config('adminPassword'))throw fail(409,'O acesso já foi configurado.');
    if(production||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw fail(403,'Configure o primeiro acesso no computador do servidor.');
    const password=req.body.password;if(typeof password!=='string'||password.length<12||password.length>200)throw fail(400,'Use uma senha de 12 a 200 caracteres.');
    const value=await passwordHash(password);repo.transaction(()=>{if(repo.config('adminPassword'))throw fail(409,'O acesso já foi configurado.');repo.setConfig('adminPassword',value)});resetRate(req);res.json(createSession(res));
  }
  async function login(req,res){rate(req);const password=String(req.body.password||'');if(password.length>200||!await checkPassword(password,repo.config('adminPassword')||''))throw fail(401,'Senha incorreta.');if(req.session)repo.db.prepare('DELETE FROM sessions WHERE id=?').run(req.session.id);resetRate(req);res.json(createSession(res))}
  function logout(req,res){repo.db.prepare('DELETE FROM sessions WHERE id=?').run(req.session.id);res.clearCookie(cookieName,{path:'/',secure:production,httpOnly:true,sameSite:'lax'});res.json({ok:true})}
  return {headers,requireAuth,sameOrigin,csrf,setup,login,logout,status:req=>({authenticated:!!req.session,needsSetup:!repo.config('adminPassword'),csrf:req.session?.csrf||null})};
}
