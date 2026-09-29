import dotenv from 'dotenv';
import {createApp} from '../backend/app.js';
import {integrationConfig} from '../backend/integration-config.js';
dotenv.config({quiet:true});
const origin=process.env.APP_ORIGIN||'http://localhost:3000';
const system=createApp({origin,production:process.env.NODE_ENV==='production',dataDir:process.env.DATA_DIR,encryptionKey:process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,integrationConfig:integrationConfig(process.env,origin)});
try{const r=await system.integrations.daily();console.log(JSON.stringify({enabled:r.enabled,runs:r.runs.map(x=>({provider:x.provider,status:x.status,errorCode:x.errorCode||null}))}));if(r.runs.some(r=>r.status==='error'))process.exitCode=1;}finally{system.repo.close();}
