// Servidor local com dados fictícios para conferir as telas (node scripts/preview-pages.cjs).
// Orçamentos com origens, tags, serviços e status variados, e gasto de mídia Meta/Google. Nada sai da máquina.
import express from 'express';
import {localDate} from '../backend/dre-domain.js';
import {createApp} from '../backend/app.js';
import {googleFixture} from './google-fixture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const port=Number(process.env.PREVIEW_PORT||3198),origin='http://localhost:'+port,fixture=googleFixture();
const system=createApp({origin,dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'herbo-preview-')),fetcher:fixture.fetch,googleConfig:{clientId:'test-client',clientSecret:'test-secret',redirectURI:origin+'/api/google/callback'}});
system.google.saveConnection({id:'preview',sub:'preview',email:'agenda@example.invalid',calendarId:'primary',accessToken:'x',refreshToken:'y',expires:Date.now()+3600000});
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const harness=express();harness.use(express.json());
// Define status e datas dos orçamentos criados pela página e grava gasto diário de mídia.
harness.post('/__preview__/seed',(req,res)=>{
 if(req.get('X-Preview')!=='1')return res.sendStatus(403);
 const db=system.repo.db,today=localDate();
 for(const {id,status,daysAgo=0} of req.body.ops||[]){
  const op=system.repo.operation(id),day=addDays(today,-daysAgo),soon=addDays(today,Math.max(1,daysAgo));
  if(status==='completed')system.repo.setOperation({...op,status:'completed',schedule:{start:day+'T09:00:00-03:00',end:day+'T11:00:00-03:00'},serviceCompletedAt:day+'T11:00:00-03:00'});
  else if(status==='scheduled')system.repo.setOperation({...op,status:'scheduled',schedule:{start:soon+'T14:00:00-03:00',end:soon+'T16:00:00-03:00'}});
  else if(status==='cancelled')system.repo.setOperation({...op,status:'cancelled'});
 }
 const insert=db.prepare("INSERT OR REPLACE INTO ad_spend_daily VALUES (?,?,?,?,?,?,?,?)");
 for(let i=0;i<60;i++){const day=addDays(today,-i);insert.run('meta-ads','act_1','c-meta-1',day,'BRL',2800+(i%7)*350,'{"campaignName":"Higienização SP"}','preview');insert.run('google-ads','g-1','c-g-1',day,'BRL',4100+(i%5)*420,'{"campaignName":"Pesquisa · Limpeza de sofá"}','preview');}
 res.json({ok:true});
});
harness.use(system.app);
harness.listen(port,'127.0.0.1',()=>console.log('Preview ready'));
