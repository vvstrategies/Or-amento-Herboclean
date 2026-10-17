import crypto from 'node:crypto';
import {fail} from './database.js';

// Removal revokes access, while retaining attribution of past actions.
export class Team {
  constructor(repo){
    this.repo=repo;
    repo.db.exec(`CREATE TABLE IF NOT EXISTS team_users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS session_actors(session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,user_id TEXT NOT NULL,kind TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attendance_audit(id INTEGER PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS user_drafts(user_id TEXT NOT NULL,slot TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(user_id,slot));`);
  }
  user(id){if(id==='administrator')return this.repo.config('legacy-access-disabled')?null:{id,username:'admin',name:'Administrador original',active:1};return this.repo.db.prepare('SELECT id,username,name,active FROM team_users WHERE id=?').get(id)}
  list(){return [this.user('administrator'),...this.repo.db.prepare('SELECT id,username,name,active FROM team_users WHERE active=1 ORDER BY name').all()].filter(u=>u?.active)}
  credential(username){if(!username||username==='admin')return this.user('administrator')?{...this.user('administrator'),password_hash:this.repo.config('adminPassword')||''}:null;return this.repo.db.prepare('SELECT * FROM team_users WHERE username=? AND active=1').get(username)}
  audit(actor,action,target){this.repo.db.prepare('INSERT INTO attendance_audit(actor_id,action,target,created_at) VALUES (?,?,?,?)').run(actor,action,String(target).slice(0,250),new Date().toISOString())}
  create({name,username},passwordHash,actor){
    name=String(name||'').trim();username=String(username||'').trim().toLowerCase();
    if(!name||name.length>100||!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)||username==='admin')throw fail(400,'Informe um nome e um usuário de 3 a 50 caracteres (letras, números, ponto ou hífen).');
    return this.repo.transaction(()=>{if(this.repo.db.prepare('SELECT 1 FROM team_users WHERE username=?').get(username))throw fail(409,'Este usuário já foi utilizado. Escolha outro identificador.');const id=crypto.randomUUID();this.repo.db.prepare('INSERT INTO team_users(id,username,name,password_hash) VALUES (?,?,?,?)').run(id,username,name,passwordHash);this.audit(actor,'user.create',id);return this.user(id)});
  }
  remove(id,actor){return this.repo.transaction(()=>{
    if(id===actor)throw fail(409,'Peça a outro administrador para excluir seu acesso.');
    if(!this.user(id)?.active)throw fail(404,'Usuário não encontrado.');
    if(this.list().length<=1)throw fail(409,'Mantenha pelo menos um administrador.');
    if(id==='administrator')this.repo.setConfig('legacy-access-disabled',true);else this.repo.db.prepare('UPDATE team_users SET active=0,password_hash=? WHERE id=?').run('',id);
    if(id==='administrator')this.repo.db.prepare('DELETE FROM sessions WHERE id NOT IN (SELECT session_id FROM session_actors) OR id IN (SELECT session_id FROM session_actors WHERE user_id=?)').run(id);
    else this.repo.db.prepare('DELETE FROM sessions WHERE id IN (SELECT session_id FROM session_actors WHERE user_id=?)').run(id);
    this.audit(actor,'user.remove',id);return {ok:true};
  })}
  slot(value){const slot=String(value||'current');if(!/^[a-zA-Z0-9_-]{1,80}$/.test(slot))throw fail(400,'Rascunho inválido.');return slot}
  rebrandDrafts(old,next){for(const row of this.repo.db.prepare('SELECT * FROM user_drafts').all()){const value=JSON.parse(row.data);if(!value.quote)continue;let changed=false;for(const key of ['company','terms'])if(JSON.stringify(value.quote[key])===JSON.stringify(old[key])){value.quote[key]=next[key];changed=true}if(changed)this.repo.db.prepare('UPDATE user_drafts SET data=?,revision=revision+1 WHERE user_id=? AND slot=?').run(JSON.stringify(value),row.user_id,row.slot)}}
  draft(user,slot){slot=this.slot(slot);const row=this.repo.db.prepare('SELECT data,revision FROM user_drafts WHERE user_id=? AND slot=?').get(user,slot);if(row)return {...JSON.parse(row.data),draftRevision:row.revision};const legacy=user==='administrator'?this.repo.config('draft'):null;if(legacy&&slot==='current')return legacy;if(legacy&&!this.repo.config('legacy-draft-claimed')){const draft=this.saveDraft(user,slot,legacy,0);this.repo.setConfig('legacy-draft-claimed',true);return draft}return null}
  saveDraft(user,slot,value,expected){slot=this.slot(slot);return this.repo.transaction(()=>{const old=this.repo.db.prepare('SELECT revision FROM user_drafts WHERE user_id=? AND slot=?').get(user,slot);if(expected!==undefined&&expected!==(old?.revision||0))throw fail(409,'Este rascunho mudou em outra aba. Reabra-o antes de salvar.');const revision=(old?.revision||0)+1;this.repo.db.prepare('INSERT INTO user_drafts VALUES (?,?,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET data=excluded.data,revision=excluded.revision').run(user,slot,JSON.stringify(value),revision);return {...value,draftRevision:revision}})}
}
