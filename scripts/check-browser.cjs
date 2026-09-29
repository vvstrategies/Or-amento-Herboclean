const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const profile=path.resolve('validacao/edge-profile-check-'+Date.now());
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let socket,serial=0;const pending=new Map();
async function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value}
async function until(expression){for(let i=0;i<70;i++){if(await evaluate(expression))return;await pause(200)}throw Error('Condição não atendida: '+expression)}
const timeout=setTimeout(()=>{browser.kill();process.exit(1)},55000);
(async()=>{
  try{
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<70&&!fs.existsSync(active);i++)await pause(150);
    const port=fs.readFileSync(active,'utf8').split('\n')[0];const pages=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);
    await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}});
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1450,height:1100,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:process.argv[2]||pathToFileURL(path.resolve('index.html')).href});
    await until("document.querySelector('#draft-status')?.textContent === 'Identidade da Herboclean carregada'");
    assert.equal(await evaluate("document.querySelector('[data-company=location]').value"),'ABC Paulista');
    assert.equal(await evaluate("document.querySelector('#items select[data-field=service]').options.length"),9);
    assert.equal(await evaluate("document.querySelector('[data-company=email]').value"),'');
    await evaluate(`function set(s,v){const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))} set('[name=client]','Cliente de exemplo');set('[name=address]','Rua de exemplo, 100, ABC Paulista');set('[data-field=service]','Cadeiras estofadas');set('[data-field=quantity]','36');set('[data-field=price]','29.99');`);
    assert.ok((await evaluate("document.querySelector('.payment strong').textContent")).includes('1.079,64'));
    assert.equal(await evaluate("document.querySelector('[name=installments]').value"),'3');
    assert.equal(await evaluate("document.querySelectorAll('.sheet').length"),1);
    const doc=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#items [data-photo]'});
    await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.resolve('public/assets/ecoclean-simbolo.png')]});
    await until("document.querySelectorAll('.photo-thumb img').length===1");
    await evaluate("document.querySelector('#save').click()");await until("document.querySelector('#saved-count').textContent==='1'");
    await send('Page.reload');await until("document.querySelector('#draft-status')?.textContent==='Rascunho anterior recuperado'");
    assert.equal(await evaluate("document.querySelector('[name=client]').value"),'Cliente de exemplo');
    assert.equal(await evaluate("document.querySelectorAll('.photo-thumb img').length"),1);
    await evaluate("document.querySelector('[data-company=email]').value='teste@example.invalid';document.querySelector('[data-company=email]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#save-company').click();document.querySelector('#new').click()");
    await until("document.querySelector('[name=client]').value===''");
    assert.equal(await evaluate("document.querySelector('[data-company=email]').value"),'teste@example.invalid');
    await evaluate("document.querySelector('#library').click()");await until("!document.querySelector('#quotes-view').hidden && document.querySelector('.proposal-card')");
    await evaluate("document.querySelector('.proposal-card').click()");await until("document.querySelector('#detail-dialog').open");
    await evaluate("document.querySelector('[data-edit]').click()");await until("document.querySelector('[name=client]').value==='Cliente de exemplo' && !document.querySelector('#create-view').hidden");
    const downloads=path.join(profile,'downloads');fs.mkdirSync(downloads,{recursive:true});
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
    await evaluate("document.querySelector('#backup').click()");
    const backupFile=path.join(downloads,'ecoclean-backup-'+await evaluate('EcoModel.today()')+'.json');
    for(let i=0;i<40&&!fs.existsSync(backupFile);i++)await pause(150);
    const backup=JSON.parse(fs.readFileSync(backupFile,'utf8'));
    assert.equal(backup.settings.company.email,'teste@example.invalid');assert.equal(backup.proposals[0].items[0].photos.length,1);
    const rootDoc=await send('DOM.getDocument');const importInput=await send('DOM.querySelector',{nodeId:rootDoc.root.nodeId,selector:'#import'});
    await send('DOM.setFileInputFiles',{nodeId:importInput.nodeId,files:[backupFile]});
    await until("document.querySelector('#saved-count').textContent==='2'");
    await evaluate("document.querySelector('#pdf').click()");
    await until("document.querySelector('#toast').textContent.includes('PDF gerado com a identidade')");
    const pdfName=backup.proposals[0].number+'.pdf',pdfPath=path.join(downloads,pdfName);
    for(let i=0;i<40&&!fs.existsSync(pdfPath);i++)await pause(150);
    assert.equal(fs.readFileSync(pdfPath).subarray(0,5).toString(),'%PDF-');
    fs.copyFileSync(pdfPath,process.argv[2]?'validacao/ecoclean-http.pdf':'validacao/ecoclean-offline.pdf');
    await evaluate("document.fonts.ready");
    const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('validacao/ecoclean-desktop.png',Buffer.from(screenshot.data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);
    await evaluate("document.querySelector('.preview-area').scrollIntoView()");
    const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('validacao/ecoclean-mobile.png',Buffer.from(mobile.data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:1450,height:1100,deviceScaleFactor:1,mobile:false});
    console.log('OK: navegador, identidade, serviços, upload, cálculo, salvamento, recarga, novo orçamento, histórico, backup, importação, responsividade e download direto de PDF.');
  }catch(error){console.error(error);if(socket)console.error(await evaluate("({url:location.href,status:document.querySelector('#draft-status')?.textContent,scripts:[...document.scripts].map(s=>s.src)})"));process.exitCode=1}finally{clearTimeout(timeout);if(socket)socket.close();browser.kill()}
})();
