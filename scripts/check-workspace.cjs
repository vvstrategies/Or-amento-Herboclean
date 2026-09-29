const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const target=process.argv[2]||'http://localhost:3199',profile=path.resolve('validacao/edge-profile-workspace-'+Date.now()),downloads=path.join(profile,'downloads');
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket,serial=0;const pending=new Map(),errors=[];
const timeout=setTimeout(()=>{browser.kill();process.exit(1)},180000);
async function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(150)}throw Error('Condição não atendida: '+expression)}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)}
async function set(selector,value){await evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))}`)}
async function screenshot(name){await evaluate('document.fonts.ready');const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('validacao/'+name+'.png',Buffer.from(r.data,'base64'))}
async function downloadFile(name){const file=path.join(downloads,name);for(let i=0;i<60&&!fs.existsSync(file);i++)await pause(150);assert.ok(fs.existsSync(file),name);return file}
(async()=>{
  try{
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<90&&!fs.existsSync(active);i++)await pause(100);
    const port=fs.readFileSync(active,'utf8').split('\n')[0],pages=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
    await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1512,height:1100,deviceScaleFactor:1,mobile:false});
    fs.mkdirSync(downloads,{recursive:true});await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});

    await send('Page.navigate',{url:target});await until("document.querySelector('#auth-title')?.textContent==='Crie seu acesso'");
    await set('#auth-password','ecoclean-browser-test');await evaluate("document.querySelector('#auth-form').requestSubmit()");await until("!!document.querySelector('#company-onboarding')");
    assert.equal(await evaluate("document.querySelector('#company-onboarding [name=name]').value"),'');
    assert.equal(await evaluate("document.body.innerText.toLowerCase().includes('herboclean')"),false);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.app-shell')).display"),'none');
    await screenshot('universal-onboarding-desktop');
    await send('Page.reload');await until("!!document.querySelector('#company-onboarding')");
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=390'),true);await screenshot('universal-onboarding-mobile');
    await send('Emulation.setDeviceMetricsOverride',{width:1512,height:1100,deviceScaleFactor:1,mobile:false});
    await set('#company-onboarding [name=name]','Aurora Consultoria');await set('#company-onboarding [name=location]','Curitiba');await set('#company-onboarding [name=phone]','41999990000');await set('#company-onboarding [name=primaryColor]','#6d28d9');await set('#company-onboarding [name=accentColor]','#c2410c');await set('#company-onboarding [name=services]','Consultoria | un. | Análise e planejamento');
    const {image:testLogo}=await import('./test-company.mjs');const logoFile=path.join(profile,'logo.png');fs.writeFileSync(logoFile,Buffer.from(testLogo.split(',')[1],'base64'));
    const dom=await send('DOM.getDocument');const logoInput=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#onboarding-logo'});await send('DOM.setFileInputFiles',{nodeId:logoInput.nodeId,files:[logoFile]});await until("!!document.querySelector('#identity-preview-mark img') && !document.querySelector('#onboarding-save').disabled");
    await evaluate("document.querySelector('#company-onboarding').requestSubmit()");await until("document.body.dataset.workspaceReady==='true'");
    assert.equal(await evaluate("document.querySelector('.topbar-workspace').textContent"),'Aurora Consultoria');
    assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--green')"),'#6d28d9');
    assert.equal(await evaluate("EcoModel.services[0].name"),'Consultoria');assert.equal(await evaluate("document.querySelector('.sidebar-brand img').alt"),'Aurora Consultoria');
    assert.equal(await evaluate("document.querySelectorAll('.proposal-card').length"),0);
    await require('./check-payment-browser.cjs')({evaluate,click,set,until});
    await evaluate("(async()=>{const q=EcoModel.quote(await EcoAuth.api('/api/settings'));q.id='legacy-browser';q.client='Cliente anterior';q.address='Rua do teste, Santo André';q.items=[{...EcoModel.item('Sofá'),price:200,photos:[]}];await EcoLocalStore.put('quotes',q)})()");
    assert.equal(await evaluate("EcoStore.all('quotes').then(q=>q.length)"),0);
    await click('[data-nav="settings"]');await click('#migrate-local');assert.equal(await evaluate("EcoStore.all('quotes').then(q=>q.length)"),0);
    await click('#confirm-action');await until("EcoStore.all('quotes').then(q=>q.length===1)");await until("!document.querySelector('#confirm-dialog').open");
    await click('#migrate-local');await click('#confirm-action');await until("!document.querySelector('#confirm-dialog').open");assert.equal(await evaluate("EcoStore.all('quotes').then(q=>q.length)"),1);
    await until("!!document.querySelector('#financial-settings-form')");
    await set('#financial-settings-form [name=materialRate]','20');
    await set('#financial-settings-form [name=vehicleName]','Fiat Mobi');
    await set('#financial-settings-form [name=consumption]','11,5');
    await set('#financial-settings-form [name=fuelPrice]','6,19');
    await set('#financial-settings-form [name=operatingCost]','0,30');
    await evaluate("document.querySelector('#financial-settings-form').requestSubmit()");
    await until("document.querySelector('#financial-settings-message').textContent.includes('Premissas salvas')");
    await evaluate("document.querySelector('#financial-settings-slot').scrollIntoView()");
    await screenshot('finance-settings-desktop');
    await click('#finance-demo');await until("document.querySelector('#finance-demo-dialog')?.open");
    assert.ok(await evaluate("document.querySelector('#finance-demo-dialog').textContent.includes('289,82')"));
    await click('#finance-demo-dialog .finance-composition summary');await screenshot('finance-bluecare-desktop');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate("document.querySelector('#finance-demo-dialog').scrollWidth<=390"),true);await screenshot('finance-bluecare-mobile');
    await click('#finance-demo-dialog .icon-button');
    await evaluate("document.querySelector('#financial-settings-slot').scrollIntoView()");assert.equal(await evaluate('document.documentElement.scrollWidth<=390'),true);await screenshot('finance-settings-mobile');
    await send('Emulation.setDeviceMetricsOverride',{width:1512,height:1100,deviceScaleFactor:1,mobile:false});
    await click('[data-nav="quotes"]');await until("document.querySelectorAll('.proposal-card').length===1");await screenshot('workspace-desktop');
    await click('.proposal-card');await until("document.querySelector('#detail-dialog').open");assert.equal(await evaluate("document.querySelectorAll('[data-status=approved]').length"),0);await screenshot('workspace-detail');
    await until("!!document.querySelector('.finance-estimate-form')");
    await click('.finance-route-button');await until("document.querySelector('.finance-estimate-message').textContent.includes('manualmente')");
    await set('.finance-estimate-form [name=distanceKm]','18');
    await evaluate("document.querySelector('.finance-estimate-form').requestSubmit()");
    await until("document.querySelector('.finance-caption')?.textContent.includes('v1')");
    assert.ok(await evaluate("document.querySelector('.finance-metrics').textContent.includes('129,82')"));
    await evaluate("document.querySelector('.finance-detail').scrollIntoView()");await screenshot('finance-detail-desktop');
    await click('.finance-edit summary');await set('.finance-estimate-form [name=materialOverride]','73');
    await click('.finance-add-cost');await set('[data-cost-description]','Auxiliar de demonstração');await set('[data-cost-amount]','15');
    await evaluate("document.querySelector('.finance-estimate-form').requestSubmit()");await until("document.querySelector('.finance-caption')?.textContent.includes('v2')");
    assert.ok(await evaluate("document.querySelector('.finance-metrics').textContent.includes('81,82')"));
    assert.equal(await evaluate("document.querySelectorAll('.finance-history').length"),1);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("document.querySelector('.finance-detail').scrollIntoView()");assert.equal(await evaluate("document.querySelector('#detail-dialog').scrollWidth<=390"),true);await screenshot('finance-detail-mobile');
    await send('Emulation.setDeviceMetricsOverride',{width:1512,height:1100,deviceScaleFactor:1,mobile:false});
    await click('[data-schedule]');await set('#schedule-date','2030-09-15');await set('#schedule-time','09:00');await evaluate("document.querySelector('#schedule-form').requestSubmit()");
    assert.equal(await evaluate("EcoStore.all('operations').then(o=>o[0].status)"),'generated');await screenshot('workspace-schedule');
    await evaluate("document.querySelector('#confirm-schedule').click();document.querySelector('#confirm-schedule').click()");await until("!document.querySelector('#schedule-dialog').open");
    const eventId=await evaluate("EcoStore.all('operations').then(o=>o[0].schedule.eventId)");assert.ok(eventId);assert.equal(await evaluate("document.querySelector('[data-pipeline=scheduled]').getAttribute('aria-pressed')"),'true');
    assert.equal(await evaluate("EcoStore.all('pdfs').then(p=>p.length)"),1);
    await click('[data-view-pdf]');await until("document.querySelector('#pdf-dialog').open");assert.ok(await evaluate("document.querySelector('#pdf-frame').src.startsWith('blob:')"));await click('[data-close="pdf-dialog"]');
    await click('[data-schedule]');await set('#schedule-time','14:00');await evaluate("document.querySelector('#schedule-form').requestSubmit()");await click('#confirm-schedule');await until("!document.querySelector('#schedule-dialog').open");
    assert.equal(await evaluate("EcoStore.all('operations').then(o=>o[0].schedule.eventId)"),eventId);assert.equal(await evaluate("EcoStore.all('pdfs').then(p=>p.length)"),1);
    await click('[data-cancel-schedule]');await click('#confirm-action');await until("EcoStore.all('operations').then(o=>o[0].status==='generated')");await until("!document.querySelector('#confirm-dialog').open");
    await click('[data-edit]');await until("!document.querySelector('#create-view').hidden");await set('[name=client]','Cliente atualizado');await click('#save');await until("EcoStore.all('quotes').then(q=>q[0].client==='Cliente atualizado')");
    await click('#pdf');await until("EcoStore.all('pdfs').then(p=>p.length===2)");await until("!document.querySelector('#pdf').disabled");
    const beforeReload=await evaluate('performance.timeOrigin');await send('Page.reload');await until("performance.timeOrigin!=="+beforeReload+" && document.body.dataset.workspaceReady==='true'");await click('[data-nav="quotes"]');assert.equal(await evaluate("EcoStore.all('quotes').then(q=>q[0].client)"),'Cliente atualizado');
    await click('#show-demo');await until("document.querySelectorAll('.proposal-card').length>=4");await screenshot('workspace-pipelines-demo');await click('[data-pipeline="scheduled"]');assert.equal(await evaluate("document.querySelectorAll('.proposal-card').length"),3);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate('document.documentElement.scrollWidth<=390'),true);await screenshot('workspace-mobile');
    await click('.proposal-card');await until("document.querySelector('#detail-dialog').open");assert.equal(await evaluate("document.querySelector('#detail-dialog').scrollWidth<=390"),true);await screenshot('workspace-detail-mobile');await click('[data-close="detail-dialog"]');await click('#exit-demo');
    await click('[data-nav="settings"]');await click('#backup');const backupFile=await downloadFile('orcamento-backup-'+await evaluate('EcoModel.today()')+'.json'),backup=JSON.parse(fs.readFileSync(backupFile,'utf8'));assert.equal(backup.version,4);assert.equal(backup.documents.length,2);
    await require('./check-dre-browser.cjs')({evaluate,click,set,until,screenshot,send,downloadFile});
    await require('./check-profit-browser.cjs')({evaluate,click,set,until,screenshot,send,downloadFile});
    await require('./check-integrations-browser.cjs')({evaluate,click,set,until,screenshot,send});
    await click('#edit-company-profile');await until("!!document.querySelector('#company-onboarding')");await set('#company-onboarding [name=name]','Horizonte Engenharia');await set('#company-onboarding [name=primaryColor]','#0f766e');await set('#company-onboarding [name=accentColor]','#be123c');
    await evaluate("document.querySelector('#company-onboarding').requestSubmit()");await until("document.body.dataset.workspaceReady==='true' && !document.querySelector('#company-onboarding') && document.querySelector('.topbar-workspace').textContent==='Horizonte Engenharia'");
    assert.equal(await evaluate("EcoStore.all('quotes').then(q=>q[0].company.name)"),'Aurora Consultoria');
    assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--green')"),'#0f766e');
    const conflictQuote=await evaluate('EcoStudio.getDraft()');assert.ok(conflictQuote.id);
    await evaluate(`(async()=>{const current=await EcoAuth.api('/api/proposals/${conflictQuote.id}');await EcoAuth.api('/api/proposals/${conflictQuote.id}',{method:'PUT',body:JSON.stringify({...current,client:'Atualizado por outra aba'})});})()`);
    await click('#new');await until('EcoStudio.getDraft().id!=='+JSON.stringify(conflictQuote.id));assert.equal(await evaluate("document.querySelector('#toast').textContent.includes('Novo orçamento pronto.')"),true);
    await click('#logout');await click('#confirm-action');await until("document.querySelector('#auth-title')?.textContent==='Entre no seu espaço'");await set('#auth-password','ecoclean-browser-test');await evaluate("document.querySelector('#auth-form').requestSubmit()");await until("document.body.dataset.workspaceReady==='true'");assert.equal(await evaluate("EcoStore.all('quotes').then(q=>q.length)"),1);
    assert.deepEqual(errors,[]);console.log('PASS: acesso, migração explícita sem duplicação, 2 pipelines, revisão, duplo clique, PDF, reagendamento, cancelamento, edição, reload, desktop/mobile, backup e console.');
  }catch(error){console.error(error);console.error('Console:',errors);if(socket){try{console.error(await evaluate("({url:location.href,toast:document.querySelector('#toast')?.textContent,ready:document.body.dataset.workspaceReady})"));await screenshot('workspace-error')}catch{}}process.exitCode=1}
  finally{clearTimeout(timeout);if(socket)socket.close();browser.kill()}
})();
