import dotenv from 'dotenv';
import readline from 'node:readline';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Repository} from '../backend/database.js';
import {passwordHash} from '../backend/security.js';
dotenv.config();
if(!process.stdin.isTTY)throw Error('Execute este comando em um terminal interativo.');
readline.emitKeypressEvents(process.stdin);
async function secret(label){process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();return new Promise((resolve,reject)=>{let value='';const key=(str,k)=>{if(k.ctrl&&k.name==='c'){done();reject(Error('Cancelado.'))}else if(k.name==='return'){done();resolve(value)}else if(k.name==='backspace')value=value.slice(0,-1);else if(str&&!k.ctrl&&!k.meta)value+=str};function done(){process.stdin.off('keypress',key);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n')}process.stdin.on('keypress',key)})}
let repo;
try{const first=await secret('Nova senha (mínimo de 12 caracteres): ');if(first.length<12||first.length>200)throw Error('A senha deve ter de 12 a 200 caracteres.');if(await secret('Confirme a senha: ')!==first)throw Error('As senhas não coincidem.');repo=new Repository(process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data'));repo.setConfig('adminPassword',await passwordHash(first));repo.db.exec('DELETE FROM sessions');console.log('Senha configurada. As sessões anteriores foram encerradas.')}catch(error){console.error(error.message);process.exitCode=1}finally{repo?.close()}
