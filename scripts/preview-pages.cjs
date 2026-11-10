// Fotografa as telas principais com dados fictícios, em desktop (1440×900) e celular (390×844).
// Uso: node scripts/preview-pages.cjs [home quotes clients finance settings] ; imagens em validacao/preview-*.png
// Também mede se a página rola inteira (regra do projeto: só os cards rolam por dentro).
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const port=3198,target='http://localhost:'+port,profile=path.resolve('validacao/edge-profile-preview-'+Date.now());
const pages=process.argv.slice(2).filter(a=>!a.startsWith('--'));if(!pages.length)pages.push('home','quotes','clients','finance','settings');
const onlyDesktop=process.argv.includes('--desktop');
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket,serial=0;const pending=new Map(),errors=[];
fs.mkdirSync('validacao',{recursive:true});
const fixture=spawn(process.execPath,['scripts/preview-fixture.mjs'],{windowsHide:true,stdio:['ignore','pipe','inherit'],env:{...process.env,PREVIEW_PORT:String(port)}});
let browser;const stop=code=>{browser?.kill();fixture.kill();try{fs.rmSync(profile,{recursive:true,force:true})}catch{}process.exit(code)};
setTimeout(()=>{console.error('Tempo esgotado');stop(1)},240000);
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
async function until(expression,tries=120){for(let i=0;i<tries;i++){if(await evaluate(expression))return;await pause(150)}throw Error('Condição não atendida: '+expression)}
const set=(selector,value)=>evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))}`);
async function shot(name){await evaluate('document.fonts.ready');await pause(1300);const r=await send('Page.captureScreenshot',{format:'png'});const file='validacao/preview-'+name+'.png';fs.writeFileSync(file,Buffer.from(r.data,'base64'));return file}
const size=(w,h,mobile)=>send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile});
fixture.stdout.on('data',async data=>{if(!data.toString().includes('Preview ready')||browser)return;
 browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 try{
  const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<90&&!fs.existsSync(active);i++)await pause(100);
  const devPort=fs.readFileSync(active,'utf8').split('\n')[0],list=await(await fetch(`http://127.0.0.1:${devPort}/json`)).json();
  socket=new WebSocket(list.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
  await send('Page.enable');await send('Runtime.enable');await size(1440,900,false);
  await send('Page.navigate',{url:target});await until("document.querySelector('#auth-title')?.textContent==='Crie seu acesso'");
  await set('#auth-password','preview-pages-local');await evaluate("document.querySelector('#auth-form').requestSubmit()");await until("!!document.querySelector('#company-onboarding')");
  await set('#company-onboarding [name=name]','Herboclean');await set('#company-onboarding [name=location]','Rua dos Ciprestes, 342, Jardim Irene, Santo André - SP, 09210-000');await set('#company-onboarding [name=phone]','11999990000');await set('#company-onboarding [name=proposalPrefix]','HERBO');
  await evaluate("document.querySelector('#company-onboarding').requestSubmit()");await until("document.body.dataset.workspaceReady==='true'");
  await evaluate(`(async()=>{
    const s=await EcoAuth.api('/api/settings'),names=(s.services||[]).map(x=>x.name),svc=i=>names[i%names.length]||'Sofá';
    const people=['Mariana Souza','Carlos Pereira','Ana Lima','Roberto Alves','Juliana Castro','Fernando Dias','Patrícia Melo','Lucas Rocha','Beatriz Nunes','Gustavo Reis','Camila Torres','André Moura','Sofia Araújo','Rafael Costa','Larissa Prado','Bruno Teixeira'];
    const origins=['google','meta','google','organico','meta','indicacao','google','cliente','meta','google','organico','meta','google','indicacao','meta','google'];
    const statuses=['completed','completed','scheduled','completed','generated','completed','cancelled','completed','scheduled','completed','generated','completed','completed','generated','completed','scheduled'];
    const ops=[];
    for(let i=0;i<people.length;i++){const q=EcoModel.quote(s);Object.assign(q,{client:people[i],address:'Rua das Flores, '+(10+i)+', Centro, Santo André - SP, 09010-000',clientContact:'(11) 9'+String(81110000+i),tags:[i%3?'residencial':'corporativo'],origin:origins[i]});q.items=[{...EcoModel.item(svc(i)),price:180+i*37},...(i%4===0?[{...EcoModel.item(svc(i+2)),price:120}]:[])];const back=2+i*1.5|0,d=new Date();d.setDate(d.getDate()-back-3);q.date=d.toISOString().slice(0,10);const saved=await EcoAuth.api('/api/proposals/'+q.id,{method:'PUT',body:JSON.stringify(q)});ops.push({id:saved.id||q.id,status:statuses[i],daysAgo:back});}
    await fetch('/__preview__/seed',{method:'POST',headers:{'Content-Type':'application/json','X-Preview':'1'},body:JSON.stringify({ops})});
  })()`);
  await send('Page.reload');await until("document.body.dataset.workspaceReady==='true'");
  const report=[];
  for(const page of pages){
   for(const [w,h,mobile,tag] of onlyDesktop?[[1440,900,false,'desktop']]:[[1440,900,false,'desktop'],[390,844,true,'mobile']]){
    await size(w,h,mobile);await evaluate(`EcoWorkspace.navigate(${JSON.stringify(page)})`);await pause(900);
    // PREVIEW_AFTER: JS executado antes da foto (ex.: abrir uma aba); PREVIEW_TAG muda o nome do arquivo.
    if(process.env.PREVIEW_AFTER){await evaluate(`(async()=>{${process.env.PREVIEW_AFTER}})()`);await pause(1200);}
    const file=await shot(page+(process.env.PREVIEW_TAG?'-'+process.env.PREVIEW_TAG:'')+'-'+tag);
    const scroll=await evaluate("({doc:document.scrollingElement.scrollHeight-innerHeight,main:[...document.querySelectorAll('main.page-view:not([hidden])')].map(m=>m.scrollHeight-m.clientHeight)[0]||0})");
    report.push(`${page} ${tag}: ${file} · rolagem da página ${scroll.doc}px · main ${scroll.main}px`);
    if(process.env.PREVIEW_EVAL)report.push('  eval: '+JSON.stringify(await evaluate(process.env.PREVIEW_EVAL)));
   }
  }
  console.log(report.join('\n'));if(errors.length)console.log('ERROS NO CONSOLE:\n'+errors.join('\n'));stop(0);
 }catch(error){console.error(error);if(errors.length)console.error(errors.join('\n'));stop(1)}
});
