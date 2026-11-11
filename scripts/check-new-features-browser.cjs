// Navegador (Edge headless) para o pacote de mudanças: formulário (ordem, desktop/mobile), Importar contato (sem Contact Picker, .vcf,
// múltiplos telefones, sobrescrita, duplicidade), filtros Google/Meta Ads no kanban, Excluir orçamento pelo card com versões e Por tag.
// Uso: node scripts/check-new-features-browser.cjs  (sobe a fixture local em :3199; screenshots em validacao/novidades-*.png)
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const target='http://localhost:3199',profile=path.resolve('validacao/edge-profile-novidades-'+Date.now());
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket,serial=0;const pending=new Map(),errors=[];
const fixture=spawn(process.execPath,['scripts/browser-fixture.mjs'],{windowsHide:true,stdio:['ignore','pipe','inherit']});
let browser;const stop=code=>{browser?.kill();fixture.kill();try{fs.rmSync(profile,{recursive:true,force:true})}catch{}process.exit(code)};
const timer=setTimeout(()=>{console.error('Tempo esgotado');stop(1)},240000);
async function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
async function until(expression,tries=100){for(let i=0;i<tries;i++){if(await evaluate(expression))return;await pause(150)}throw Error('Condição não atendida: '+expression)}
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const set=(selector,value)=>evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))}`);
async function screenshot(name){await evaluate('document.fonts.ready');const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('validacao/novidades-'+name+'.png',Buffer.from(r.data,'base64'))}
const desktop=()=>send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
const mobile=()=>send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
fixture.stdout.on('data',async data=>{if(!data.toString().includes('Fixture ready')||browser)return;
 browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 try{
  const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<90&&!fs.existsSync(active);i++)await pause(100);
  const port=fs.readFileSync(active,'utf8').split('\n')[0],pages=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
  await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');await desktop();
  // Acesso + empresa
  await send('Page.navigate',{url:target});await until("document.querySelector('#auth-title')?.textContent==='Crie seu acesso'");
  await set('#auth-password','novidades-browser-test');await evaluate("document.querySelector('#auth-form').requestSubmit()");await until("!!document.querySelector('#company-onboarding')");
  await set('#company-onboarding [name=name]','Herbo Teste');await set('#company-onboarding [name=location]','Santo André');await set('#company-onboarding [name=phone]','11999990000');await set('#company-onboarding [name=proposalPrefix]','HERBO');
  await evaluate("document.querySelector('#company-onboarding').requestSubmit()");await until("document.body.dataset.workspaceReady==='true'");
  // A tela de acesso (com a marca) precisa sumir de fato depois do login: nada pode cobrir o app.
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#auth-screen')).display"),'none','tela de acesso escondida após entrar');
  // Orçamentos de teste: Residencial/Corporativo × Google/Meta, um sem origem e um com duas versões.
  await evaluate(`(async()=>{const s=await EcoAuth.api('/api/settings');const mk=async(client,tags,origin,phone)=>{const q=EcoModel.quote(s);Object.assign(q,{client,address:'Rua A, 1 - Santo André',clientContact:phone,tags,origin});q.items=[{...EcoModel.item(),price:150}];return EcoAuth.api('/api/proposals/'+q.id,{method:'PUT',body:JSON.stringify(q)})};
    await mk('Res Google',['residencial'],'google','(11) 91111-0001');await mk('Res Meta',['residencial'],'meta','(11) 91111-0002');await mk('Corp Google',['corporativo'],'google','(11) 91111-0003');await mk('Corp Meta',['corporativo'],'meta','(11) 91111-0004');await mk('Sem Origem',[],'','(11) 91111-0005');
    const v1=await mk('Versão Um',['residencial'],'google','(11) 91111-0006');await EcoAuth.api('/api/proposals/'+v1.id,{method:'PUT',body:JSON.stringify({...v1,client:'Versão Dois'})});})()`);
  const numbers=await evaluate("EcoAuth.api('/api/proposals?summary=1').then(l=>l.map(q=>q.number))");
  assert.equal(numbers.length,6);assert.ok(numbers.every(n=>/^HERBO-\d{8}-[0-9A-F]{4}$/.test(n)),numbers.join());assert.equal(new Set(numbers).size,6,'números únicos');
  await send('Page.reload');await until("document.body.dataset.workspaceReady==='true'");

  // Formulário: ordem do topo e responsividade
  await evaluate("location.hash='#criar'");await until("!document.querySelector('#create-view').hidden");await until("!!document.querySelector('#quote-tags button')");
  const order=await evaluate(`(()=>{const f=document.querySelector('#form section.form-section');const pos=s=>{const e=f.querySelector(s);return e?e.getBoundingClientRect().top+window.scrollY:-1};return {imp:pos('#import-contact'),name:pos('[name=client]'),tags:pos('#quote-tags'),phone:pos('[name=clientContact]'),email:pos('[name=clientEmail]'),bday:pos('[name=clientBirthday]'),cep:pos('[name=postalCode]')}})()`);
  assert.ok(order.imp>0&&order.imp<=order.name,'Importar contato no topo, junto do nome');
  assert.ok(order.name<order.tags&&order.tags<order.phone&&order.phone<=order.email&&order.email<=order.bday&&order.bday<order.cep,JSON.stringify(order));
  await screenshot('formulario-desktop');
  await mobile();await pause(900);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal(await evaluate('document.documentElement.scrollWidth<=390'),true,'sem scroll horizontal no celular');
  const mob=await evaluate("(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {top:b.top,height:b.height}};return {phone:r('[name=clientContact]'),email:r('[name=clientEmail]'),bday:r('[name=clientBirthday]')}})()");
  assert.ok(mob.phone.top<mob.email.top&&mob.email.top<mob.bday.top,'empilha na ordem '+JSON.stringify(mob));assert.ok(mob.phone.height>=40,'toque confortável');
  await evaluate("document.querySelector('#import-contact').scrollIntoView({block:'start'})");await screenshot('formulario-mobile');await desktop();

  // Importar contato: navegador sem Contact Picker explica e mantém Google e .vcf
  await click('#import-contact');await until("document.querySelector('#contact-import-dialog')?.open");
  await until("document.querySelector('#ci-google-note').textContent!=='Verificando…'");
  assert.equal(await evaluate("document.querySelector('[data-ci-source=device]').getAttribute('aria-disabled')"),'true');
  assert.match(await evaluate("document.querySelector('[data-ci-source=device]').textContent"),/não é suportada por este navegador/);
  assert.ok(await evaluate("!!document.querySelector('[data-ci-source=google]')&&!!document.querySelector('[data-ci-source=vcard]')"));
  await screenshot('importar-origens');
  // .vcf com dois contatos: lista + busca + múltiplos telefones
  const vcf=path.join(profile,'contatos.vcf');fs.writeFileSync(vcf,['BEGIN:VCARD','VERSION:3.0','FN:Mariana Teste','TEL;TYPE=CELL:+55 11 98888-1111','TEL;TYPE=WORK:+55 11 3333-2222','EMAIL:mariana@example.invalid','ADR;TYPE=HOME:;;Rua das Flores\\, 120;Santo André;SP;09000-000;Brasil','BDAY:1990-03-18','END:VCARD','BEGIN:VCARD','VERSION:3.0','FN:Duplicado Cliente','TEL:(11) 91111-0001','END:VCARD'].join('\r\n'));
  const dom=await send('DOM.getDocument',{depth:-1,pierce:true});const input=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'[data-ci-source=vcard] input'});
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[vcf]});await until("document.querySelectorAll('.ci-item').length===2");
  await set('.ci-search input','mari');await until("document.querySelectorAll('.ci-item').length===1");await screenshot('importar-lista');
  await click('.ci-item');await until("!!document.querySelector('[data-ci-apply]')");
  assert.equal(await evaluate("document.querySelectorAll('input[name=phone]').length"),2,'pergunta qual telefone');
  await evaluate("document.querySelectorAll('input[name=phone]')[1].click()");await screenshot('importar-revisao');
  await click('[data-ci-apply]');await until("document.querySelector('[name=client]').value==='Mariana Teste'");
  const filled=await evaluate("Object.fromEntries(['client','clientContact','clientEmail','clientBirthday','addressStreet','addressNumber','addressCity','addressState','postalCode'].map(n=>[n,document.querySelector('[name='+n+']').value]))");
  assert.deepEqual(filled,{client:'Mariana Teste',clientContact:'(11) 3333-2222',clientEmail:'mariana@example.invalid',clientBirthday:'18/03',addressStreet:'Rua das Flores',addressNumber:'120',addressCity:'Santo André',addressState:'SP',postalCode:'09000-000'});
  // Campos editáveis e não sobrescritos sem escolha: reimportar com nome já digitado deixa a substituição desmarcada.
  await set('[name=client]','Nome digitado');await click('#import-contact');await until("document.querySelector('#contact-import-dialog')?.open");
  await send('DOM.setFileInputFiles',{nodeId:(await send('DOM.querySelector',{nodeId:(await send('DOM.getDocument',{depth:-1})).root.nodeId,selector:'[data-ci-source=vcard] input'})).nodeId,files:[vcf]});
  await until("document.querySelectorAll('.ci-item').length===2");await evaluate("document.querySelectorAll('.ci-item')[1].click()");await until("!!document.querySelector('[data-ci-apply]')");
  assert.equal(await evaluate("document.querySelector('input[name=use-name]').checked"),false,'nome já digitado não é sobrescrito por padrão');
  assert.equal(await evaluate("document.querySelector('input[name=use-phone]').checked"),false,'telefone já preenchido também pede confirmação');
  await evaluate("document.querySelector('input[name=use-phone]').click()");await click('[data-ci-apply]');await until("document.querySelector('[name=clientContact]').value==='(11) 91111-0001'");
  assert.equal(await evaluate("document.querySelector('[name=client]').value"),'Nome digitado');
  // Duplicidade: mesmo telefone de um cliente existente
  await until("document.querySelector('#client-match').textContent.includes('Já existe um cliente com este telefone')");
  await screenshot('importar-duplicado');
  await click('[data-use-client]');await until("document.querySelector('[name=client]').value==='Res Google'");
  // Cancelar a seleção não muda nada
  await click('#import-contact');await until("document.querySelector('#contact-import-dialog')?.open");await click('[data-ci-close]');assert.equal(await evaluate("document.querySelector('[name=client]').value"),'Res Google');


  // Kanban: filtros
  await evaluate("location.hash='#orcamentos'");await until("document.querySelectorAll('#board .proposal-card').length===6");
  // Barra única de filtros (filters.js): origem e tipo de cliente combináveis.
  const names=()=>evaluate("[...document.querySelectorAll('#board .proposal-card b')].map(b=>b.textContent).sort().join('|')");
  const origin=async id=>{await click(`#quotes-filters [data-fb-origin="${id}"]`);await pause(150);return names()};
  const tag=async id=>{await click('#quotes-filters [data-fb-menu="tag"]');await until("!!document.querySelector('.fb-menu')");await click(`.fb-menu [data-id="${id}"]`);await evaluate("document.body.click()");await pause(150);return names()};
  assert.equal(await origin('google'),'Corp Google|Res Google|Versão Dois');assert.equal(await origin('meta'),'Corp Meta|Res Meta');
  await origin('all');assert.equal(await tag('corporativo'),'Corp Google|Corp Meta');
  assert.equal(await origin('google'),'Corp Google','filtros combinados: Google + Corporativo');await screenshot('kanban-filtro-google-corporativo');
  assert.equal(await tag('corporativo'),'Corp Google|Res Google|Versão Dois','desmarcar o tipo mantém a origem');
  assert.equal(await tag('residencial'),'Res Google|Versão Dois');await tag('residencial');
  assert.equal((await origin('all')).split('|').length,6);
  // Calendário de intervalo: dois cliques + Aplicar viram o período personalizado; "Tudo" volta a mostrar todos.
  await click('#quotes-filters [data-fb-calendar]');await until("!!document.querySelector('.fb-calendar')");
  const days=await evaluate("[...document.querySelectorAll('.fb-calendar .fb-day:not(.out)')].map(b=>b.dataset.day)");
  await click(`.fb-calendar [data-day="${days[0]}"]`);await click(`.fb-calendar [data-day="${days.at(-1)}"]`);await screenshot('calendario-intervalo');await click('.fb-calendar [data-apply]');
  const range=await evaluate("EcoFilters.get('quotes')");assert.equal(range.preset,'custom');assert.equal(range.from,days[0]);assert.equal(range.to,days.at(-1));
  await click('#quotes-filters [data-fb-preset="all"]');await pause(150);assert.equal((await names()).split('|').length,6);

  // Excluir pelo card: versão atual → anterior promovida; versão única → arquivada; sem refresh manual.
  await click('#select-mode');await evaluate("document.querySelector('[data-pick]').closest('.proposal-card')&&[...document.querySelectorAll('#board .proposal-card')].find(c=>c.textContent.includes('Versão Dois')).querySelector('[data-pick]').click()");
  await until("!document.querySelector('#bulk-delete').disabled");
  assert.ok(await evaluate("['#bulk-origin','#bulk-tag-add','#bulk-tag-remove','#bulk-delete'].every(s=>!!document.querySelector(s))"),'ações do card');
  await screenshot('kanban-acoes');
  await click('#bulk-delete');await until("document.querySelector('#confirm-dialog').open");
  assert.match(await evaluate("document.querySelector('#confirm-description').textContent"),/versão anterior mais recente passará a ser considerada como orçamento atual/);
  assert.equal(await evaluate("document.querySelector('#confirm-action').textContent"),'Excluir orçamento');await screenshot('excluir-modal');
  await click('#confirm-action');await until("!document.querySelector('#confirm-dialog').open");
  await until("[...document.querySelectorAll('#board .proposal-card b')].some(b=>b.textContent==='Versão Um')");assert.equal(await evaluate("document.querySelectorAll('#board .proposal-card').length"),6);
  await click('#select-mode');await evaluate("[...document.querySelectorAll('#board .proposal-card')].find(c=>c.textContent.includes('Sem Origem')).querySelector('[data-pick]').click()");
  await click('#bulk-delete');await until("document.querySelector('#confirm-dialog').open");assert.match(await evaluate("document.querySelector('#confirm-description').textContent"),/arquivado/);
  await click('#confirm-action');await until("document.querySelectorAll('#board .proposal-card').length===5");

  // Tráfego pago (antes Financeiro › Marketing): custo por tag ao lado, mesmo sem contas conectadas
  await evaluate("location.hash='#trafego'");await until("!!document.querySelector('.tr-tags table')");
  const tagText=await evaluate("document.querySelector('.tr-tags').textContent");assert.match(tagText,/Corporativo/);assert.match(tagText,/Total/);assert.ok(!tagText.match(/NaN|Infinity|undefined/));
  assert.equal(await evaluate("document.querySelectorAll('[data-tag-mode],[data-campaign-tag]').length"),0,'sem vincular campanhas no Tráfego');await screenshot('por-tag');
  // Integrações: Drive e Contatos com estado explícito
  await evaluate("location.hash='#configuracoes'");await until("!!document.querySelector('[data-integration=google-contacts]')");
  assert.match(await evaluate("document.querySelector('[data-integration=google-contacts]').textContent"),/Permissão não concedida/);
  await evaluate("document.querySelector('#integrations-center')?.scrollIntoView({block:'start'})");await screenshot('integracoes');
  const relevant=errors.filter(e=>!/favicon|ERR_|Failed to load resource/i.test(e));assert.deepEqual(relevant,[],'console sem erros');
  clearTimeout(timer);console.log('PASS: navegador — formulário (ordem, desktop/mobile), importar contato (sem Contact Picker, .vcf, múltiplos telefones, sem sobrescrever, duplicidade, cancelar), HERBO único, filtros Google/Meta Ads, excluir pelo card com versões, Por tag e integrações.');stop(0);
 }catch(error){console.error(error);console.error('Console:',errors);try{await screenshot('falha')}catch{}stop(1)}
});
