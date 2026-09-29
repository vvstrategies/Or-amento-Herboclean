import express from 'express';
import {localDate} from '../backend/dre-domain.js';
import {createApp} from '../backend/app.js';
import {googleFixture} from './google-fixture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const origin='http://localhost:3199',fixture=googleFixture();
const system=createApp({origin,dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'ecoclean-browser-')),fetcher:fixture.fetch,googleConfig:{clientId:'test-client',clientSecret:'test-secret',redirectURI:origin+'/api/google/callback'}});
system.google.saveConnection({id:'browser-fixture',sub:'test-account',email:'agenda@example.invalid',calendarId:'primary',accessToken:'test-access-secret',refreshToken:'test-refresh-secret',expires:Date.now()+3600000});
// Test harness only: move a fixture appointment into the past without touching the production app.
const harness=express();harness.use(express.json());harness.post('/__fixture__/elapsed',(req,res)=>{
 if(req.get('X-Fixture')!=='profit-browser')return res.sendStatus(403);
 const op=system.repo.operation(req.body.id);if(op.status!=='scheduled')return res.sendStatus(409);
 const day=localDate();system.repo.setOperation({...op,schedule:{...op.schedule,start:day+'T00:00:00-03:00',end:day+'T00:01:00-03:00'}});res.json({ok:true});
});harness.use(system.app);
harness.listen(3199,'127.0.0.1',()=>console.log('Fixture ready'));
