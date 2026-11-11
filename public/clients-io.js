(function(root){
'use strict';
// Clientes: importar (Google Contatos, arquivo .vcf ou .csv) e exportar (.csv).
// Na importação, telefone ou e-mail já cadastrado não duplica o cliente: o servidor só completa os campos vazios.
const $=(s,p=document)=>p.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const notify=m=>root.EcoStudio?.notify(m);
const ORIGIN={meta:'Meta Ads',google:'Google Ads',indicacao:'Indicação',organico:'Orgânico',cliente:'Cliente antigo'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const br=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
const RESUME='eco-clients-import';

/* ---------- Exportar ---------- */
const cell=v=>{v=String(v??'');return /[;"\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const HEAD=['Nome','Telefone','E-mail','Tipo','Origem','Endereço','Bairro','Cidade','Aniversário','Observações','Orçamentos','Total fechado (R$)','Último serviço'];
async function exportCsv(){
  const [list,tags]=await Promise.all([EcoAuth.api('/api/clients'),EcoAuth.api('/api/tags').catch(()=>[])]);
  if(!list.length)return notify('Nenhum cliente para exportar ainda.');
  const tagLabel=id=>{const t=tags.find(x=>x.id===id)?.label||id;return t.charAt(0)+t.slice(1).toLowerCase()};
  const rows=list.map(c=>[c.name,c.phone,c.email,(c.tags||[]).map(tagLabel).join(', '),ORIGIN[c.origin]||c.origin||'',c.address,c.neighborhood,c.city,c.birthday?c.birthday.slice(3)+'/'+c.birthday.slice(0,2):'',c.notes,c.quoteCount||0,((c.closedCents||0)/100).toFixed(2).replace('.',','),br(c.lastServiceDate)]);
  // BOM + ponto e vírgula: o Excel em português abre com acentos e colunas certas.
  const text='﻿'+[HEAD,...rows].map(r=>r.map(cell).join(';')).join('\r\n');
  root.EcoDownloadBlob(new Blob([text],{type:'text/csv;charset=utf-8'}),`clientes-${today()}.csv`);
  notify(`${list.length} cliente${list.length===1?'':'s'} exportado${list.length===1?'':'s'}.`);
}

/* ---------- Ler .csv (o exportado aqui ou o do Google Contatos) ---------- */
function parseCsv(text){
  text=String(text).replace(/^﻿/,'');
  const first=text.split(/\r?\n/,1)[0]||'',sep=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[],v='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){v+='"';i++}else q=false}else v+=ch;continue}
    if(ch==='"')q=true;else if(ch===sep){row.push(v);v=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(v);rows.push(row);row=[];v=''}else v+=ch;
  }
  if(v||row.length){row.push(v);rows.push(row)}
  return rows.filter(r=>r.some(x=>x.trim()));
}
function csvContacts(text,tags){
  const rows=parseCsv(text);if(rows.length<2)return [];
  const head=rows[0].map(fold),find=(...tests)=>head.findIndex(h=>tests.some(t=>t instanceof RegExp?t.test(h):h===t));
  const col={name:find('nome','name','cliente'),first:find('first name','given name','primeiro nome'),last:find('last name','family name','sobrenome'),
    phone:find('telefone','celular','whatsapp','phone',/^phone 1 - value$/,/^telefone 1 - valor$/),email:find('e-mail','email',/^e-mail 1 - value$/,/^e-mail 1 - valor$/),
    tags:find('tipo','tags','tag'),origin:find('origem','origin'),address:find('endereco','endereço','address',/^address 1 - formatted$/,/^endereco 1 - formatado$/),
    neighborhood:find('bairro'),city:find('cidade','city',/^address 1 - city$/),birthday:find('aniversario','birthday'),notes:find('observacoes','notes','notas')};
  if(col.name<0&&col.first<0&&col.phone<0)throw Error('O arquivo precisa de uma coluna Nome ou Telefone na primeira linha.');
  const at=(r,i)=>i>=0?String(r[i]||'').trim():'';
  const tagId=label=>{const k=fold(label);return tags.find(t=>fold(t.label)===k||t.id===k)?.id};
  const originId=label=>{const k=fold(label);return Object.keys(ORIGIN).find(id=>id===k||fold(ORIGIN[id])===k||fold(ORIGIN[id]).startsWith(k+' '))||''};
  return rows.slice(1).map(r=>{
    const name=at(r,col.name)||[at(r,col.first),at(r,col.last)].filter(Boolean).join(' ');
    const phone=root.EcoContacts.formatPhone(at(r,col.phone).split(/\s*:::\s*/)[0]),email=root.EcoContacts.emailKey(at(r,col.email));
    const b=at(r,col.birthday),birthday=/^\d{1,2}\/\d{1,2}/.test(b)?b.split('/').slice(0,2).map(x=>x.padStart(2,'0')).reverse().join('-'):root.EcoContacts.birthdayOf(b);
    return {name:name||phone||email,phone,email,address:at(r,col.address),neighborhood:at(r,col.neighborhood),city:at(r,col.city),birthday,notes:at(r,col.notes),
      tags:at(r,col.tags).split(/[,/|]/).map(tagId).filter(Boolean),origin:originId(at(r,col.origin))};
  }).filter(c=>c.name);
}
// Contato normalizado (contact-import.js) → cliente.
function fromContact(c){
  const phone=(c.phones.find(p=>p.primary)||c.phones[0])?.value||'',email=(c.emails.find(e=>e.primary)||c.emails[0])?.value||'',a=c.addresses[0];
  const address=a?(a.formatted||[a.street&&[a.street,a.number].filter(Boolean).join(', '),a.neighborhood,a.city,a.region].filter(Boolean).join(' - ')):'';
  return {name:c.name||c.organization||phone||email,phone,email,address,neighborhood:a?.neighborhood||'',city:a?.city||'',birthday:c.birthday||'',contactName:c.organization&&c.organization!==c.name?c.organization:''};
}

/* ---------- Seletor com marcação múltipla ---------- */
let dialog;
function frame(title,body,footer){
  if(!dialog){dialog=document.createElement('dialog');dialog.className='contact-import-dialog clients-io-dialog';dialog.setAttribute('aria-labelledby','cio-title');dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});document.body.append(dialog)}
  dialog.innerHTML=`<header class="ci-head"><h2 id="cio-title">${esc(title)}</h2><button type="button" class="icon-button" data-cio-close aria-label="Fechar">×</button></header><div class="ci-body">${body}</div>${footer?`<footer class="ci-foot">${footer}</footer>`:''}`;
  $('[data-cio-close]',dialog).onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();return dialog;
}
async function existingKeys(){
  const list=await EcoAuth.api('/api/clients').catch(()=>[]),keys=new Set();
  for(const c of list){const p=root.EcoContacts.phoneKey(c.phone),e=root.EcoContacts.emailKey(c.email);if(p)keys.add('p'+p);if(e)keys.add('e'+e)}
  return keys;
}
const known=(keys,c)=>{const p=root.EcoContacts.phoneKey(c.phone),e=root.EcoContacts.emailKey(c.email);return (p&&keys.has('p'+p))||(e&&keys.has('e'+e))};

// source: 'google' (carrega por páginas do servidor) ou 'file' (lista já lida).
async function pick(source,fileClients=[]){
  const keys=await existingKeys();
  const d=frame(source==='google'?'Importar do Google Contatos':'Importar clientes do arquivo',
    `<p class="ci-note">Marque quem vai virar cliente. Quem já está cadastrado (mesmo telefone ou e-mail) não é duplicado: só os campos vazios da ficha são completados.</p>
     <label class="ci-search">Buscar por nome, telefone ou e-mail<input type="search" autocomplete="off" placeholder="Digite para buscar"></label>
     <div class="cio-bar"><label class="cio-all"><input type="checkbox" id="cio-all"> Marcar todos da lista</label><span id="cio-count" class="cio-count" aria-live="polite">0 marcados</span></div>
     <ul class="ci-list cio-list" aria-label="Contatos"></ul><p class="ci-status" role="status"></p><button type="button" class="secondary ci-more" hidden>Carregar mais</button>`,
    '<button type="button" class="text-button" data-cio-cancel>Cancelar</button><button type="button" class="primary" data-cio-go disabled>Importar</button>');
  const list=$('.cio-list',d),status=$('.ci-status',d),more=$('.ci-more',d),input=$('input[type=search]',d),all=$('#cio-all',d),go=$('[data-cio-go]',d);
  const chosen=new Map();let items=[],token=null,query='',serial=0,timer;
  const keyOf=c=>c._k||(c._k=[c.name,c.phone,c.email].join('|'));
  const sync=()=>{const n=chosen.size;$('#cio-count',d).textContent=`${n} marcado${n===1?'':'s'}`;go.disabled=!n;go.textContent=n?`Importar ${n} cliente${n===1?'':'s'}`:'Importar';all.checked=items.length>0&&items.every(c=>chosen.has(keyOf(c)))};
  const paint=()=>{
    list.innerHTML=items.map((c,i)=>{const k=keyOf(c),dup=known(keys,c);return `<li><label class="ci-item cio-item${dup?' dup':''}"><input type="checkbox" data-i="${i}" ${chosen.has(k)?'checked':''}><span><b>${esc(c.name)}</b><span>${esc([c.phone,c.email].filter(Boolean).join(' · ')||c.address||'Sem telefone ou e-mail')}</span></span>${dup?'<em class="cio-dup">já cadastrado</em>':''}</label></li>`}).join('');
    more.hidden=!token;status.textContent=items.length?'':query?'Nenhum contato encontrado.':'Nenhum contato.';sync();
  };
  list.onchange=e=>{const b=e.target.closest('[data-i]');if(!b)return;const c=items[+b.dataset.i];if(b.checked)chosen.set(keyOf(c),c);else chosen.delete(keyOf(c));sync()};
  all.onchange=()=>{for(const c of items)all.checked?chosen.set(keyOf(c),c):chosen.delete(keyOf(c));paint()};
  async function load(append){
    const n=++serial;
    if(source==='file'){const q=fold(query);items=q?fileClients.filter(c=>fold([c.name,c.phone,c.email,c.city].join(' ')).includes(q)):fileClients;return paint()}
    status.textContent='Carregando…';more.disabled=true;
    try{const r=await root.EcoContacts.providers.google.page({pageToken:append?token:'',query});if(n!==serial)return;const page=r.contacts.map(fromContact).filter(c=>c.name);items=append?[...items,...page]:page;token=r.nextPageToken;paint()}
    catch(err){if(n!==serial)return;if(['GOOGLE_CONTACTS_SCOPE','GOOGLE_NOT_CONNECTED','GOOGLE_RECONNECT'].includes(err.code)){status.innerHTML=esc(err.message)+' <button type="button" class="text-button" data-cio-auth>Autorizar Google Contatos</button>';$('[data-cio-auth]',d).onclick=()=>authorize().catch(e=>status.textContent=e.message);return}status.textContent=err.message}
    finally{more.disabled=false}
  }
  more.onclick=()=>load(true);
  input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{query=input.value.trim();load(false)},source==='google'?400:120)};
  $('[data-cio-cancel]',d).onclick=()=>d.close();
  go.onclick=()=>upload([...chosen.values()]);
  await load(false);input.focus();
}
async function upload(list){
  const d=frame('Importando clientes',`<p class="ci-note" id="cio-progress" role="status">Enviando 0 de ${list.length}…</p>`);
  const sum={created:0,updated:0,skipped:0,failed:0,errors:[]};
  try{
    for(let i=0;i<list.length;i+=200){
      const chunk=list.slice(i,i+200).map(({_k,...c})=>c);
      const r=await EcoAuth.api('/api/clients/import',{method:'POST',body:JSON.stringify({clients:chunk})});
      for(const k of ['created','updated','skipped','failed'])sum[k]+=r[k]||0;sum.errors.push(...(r.errors||[]));
      $('#cio-progress',d).textContent=`Enviando ${Math.min(list.length,i+200)} de ${list.length}…`;
    }
  }catch(err){frame('Importação interrompida',`<p class="ci-error">${esc(err.message)}</p><p class="ci-note">${sum.created} criado(s) antes da falha.</p>`,'<button type="button" class="primary" data-cio-close2>Fechar</button>');$('[data-cio-close2]',dialog).onclick=()=>dialog.close();root.dispatchEvent(new CustomEvent('eco:data-changed'));return}
  const line=(n,s,p)=>n?`<li><b>${n}</b> ${n===1?s:p}</li>`:'';
  frame('Importação concluída',`<ul class="cio-result">${line(sum.created,'cliente novo','clientes novos')}${line(sum.updated,'ficha completada','fichas completadas')}${line(sum.skipped,'já estava cadastrado sem nada a completar','já estavam cadastrados sem nada a completar')}${line(sum.failed,'não importado','não importados')}</ul>${sum.errors.length?`<p class="ci-note">${sum.errors.slice(0,5).map(e=>esc((e.name||'Sem nome')+': '+e.message)).join('<br>')}</p>`:''}`,'<button type="button" class="primary" data-cio-close2>Fechar</button>');
  $('[data-cio-close2]',dialog).onclick=()=>dialog.close();
  root.EcoCache?.clear();root.dispatchEvent(new CustomEvent('eco:data-changed'));
}
async function authorize(){try{sessionStorage.setItem(RESUME,'google')}catch{}const r=await EcoAuth.api('/api/google/connect',{method:'POST',body:JSON.stringify({purpose:'contacts'})});location.assign(r.url)}
async function fromGoogle(){
  const a=await root.EcoContacts.providers.google.availability();
  if(!a.supported)return notify(a.reason);
  if(!a.authorized)return authorize();
  return pick('google');
}
async function fromFile(file){
  if(!file)return;if(file.size>5*1024*1024)throw Error('Arquivo grande demais (até 5 MB).');
  const text=await file.text();let list;
  if(/\.vcf$/i.test(file.name)||/BEGIN:VCARD/i.test(text.slice(0,2000)))list=root.EcoContacts.parseVCards(text).map(fromContact).filter(c=>c.name);
  else list=csvContacts(text,await EcoAuth.api('/api/tags').catch(()=>[]));
  if(!list.length)throw Error('Nenhum contato encontrado no arquivo.');
  return pick('file',list);
}

/* ---------- Menu Importar ---------- */
let menu=null;
function closeMenu(){if(!menu)return;menu.el.remove();menu.button.setAttribute('aria-expanded','false');menu=null}
function openMenu(button){
  if(menu)return closeMenu();
  const el=document.createElement('div');el.className='fb-pop fb-menu cio-menu';el.setAttribute('role','menu');
  el.innerHTML=`<button type="button" role="menuitem" data-cio="google"><img src="assets/int-contacts.svg" alt="" width="18" height="18"><span><b>Google Contatos</b><small>Escolha quem importar da conta conectada</small></span></button>
    <label role="menuitem" tabindex="0" class="cio-file"><span class="cio-file-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg></span><span><b>Arquivo .csv ou .vcf</b><small>Planilha exportada daqui, do Google ou do celular</small></span><input type="file" accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard" hidden></label>`;
  document.body.append(el);const r=button.getBoundingClientRect();el.style.left=Math.max(8,Math.min(innerWidth-el.offsetWidth-8,r.left))+'px';el.style.top=(r.bottom+8)+'px';
  button.setAttribute('aria-expanded','true');menu={el,button};
  el.querySelector('[data-cio="google"]').onclick=()=>{closeMenu();fromGoogle().catch(e=>notify(e.message))};
  const file=el.querySelector('input[type=file]');
  el.querySelector('.cio-file').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click()}};
  file.onchange=()=>{const f=file.files[0];closeMenu();fromFile(f).catch(e=>notify(e.message))};
  el.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();button.focus()}});
  el.querySelector('button')?.focus();
}
document.addEventListener('click',e=>{if(menu&&!menu.el.contains(e.target)&&!menu.button.contains(e.target))closeMenu()});
addEventListener('resize',closeMenu);

// Volta da autorização do Google: abre o seletor na tela de Clientes.
function resume(){let flag=null;try{flag=sessionStorage.getItem(RESUME);sessionStorage.removeItem(RESUME)}catch{}if(flag!=='google')return;root.EcoWorkspace?.navigate('clients');setTimeout(()=>fromGoogle().catch(e=>notify(e.message)),300)}
Promise.resolve(root.EcoAuth?.ready).then(()=>setTimeout(resume,600)).catch(()=>null);

root.EcoClientsIO={openMenu,exportCsv,parseCsv,csvContacts,fromContact};
})(globalThis);
