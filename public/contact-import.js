(function(root){
'use strict';
// Importação de contatos para o formulário do cliente (somente importação, nunca sincronização).
// A tela do orçamento só conhece o contato normalizado:
//   {name, phones:[{value,type,primary}], emails:[...], addresses:[{formatted,street,number,neighborhood,city,region,postalCode,country}], birthday:'MM-DD', organization, source}
// Providers: DeviceContactProvider (Contact Picker API), GoogleContactsProvider (People API via servidor),
// VCardContactProvider (arquivo .vcf). Um provider nativo futuro só precisa devolver o mesmo formato.
// Nada é enviado ao servidor nem guardado: só o contato escolhido entra no formulário, e só é salvo com o orçamento.
const $=(s,p=document)=>p.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=(v,n=240)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const fold=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

// Telefone: preserva DDI estrangeiro; números do Brasil seguem o formato já usado no app, (11) 98765-4321.
function formatPhone(value){
  const raw=clean(value,60),digits=raw.replace(/\D/g,'');
  if(!digits)return '';
  if(/^\+/.test(raw)&&!digits.startsWith('55'))return raw;// outro país: mantém como veio, com o DDI
  let d=digits;
  if((/^\+55/.test(raw)||/^0055/.test(digits))&&d.length>=12)d=d.replace(/^(00)?55/,'');
  else if(d.length>=12&&d.length<=13&&d.startsWith('55'))d=d.slice(2);
  if((d.length===11||d.length===12)&&d.startsWith('0')&&!d.startsWith('00'))d=d.slice(1);// 0 de discagem interurbana
  if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return raw;// sem DDD ou formato desconhecido: não adivinha
}
// Mesma regra do servidor (commercial.js) para reconhecer o mesmo cliente.
const phoneKey=v=>{const d=String(v||'').replace(/\D/g,'');return d.length>=10&&d.length<=13?d.replace(/^55(?=\d{10,11}$)/,''):''};
const emailKey=v=>{const m=String(v||'').match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/);return m?m[0].toLowerCase():''};
function birthdayOf(v){
  if(!v)return '';const s=String(v).trim();let m=s.match(/^(?:\d{4}|--)-?(\d{2})-?(\d{2})/);if(!m)m=s.match(/^(\d{2})-(\d{2})$/);if(!m)return '';
  const mo=+m[1],d=+m[2],max=[31,29,31,30,31,30,31,31,30,31,30,31][mo-1];return max&&d>=1&&d<=max?String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'):'';
}
function splitStreet(street){const m=clean(street).match(/^(.*?),\s*(\d+[a-zA-Z]?|s\/?n)\b\s*[-,]?\s*(.*)$/i);return m?{street:m[1],number:m[2],complement:m[3]||''}:{street:clean(street),number:'',complement:''}}
function normalizeContact(raw={},source){
  const list=(v,f)=>[...new Map((Array.isArray(v)?v:[]).map(f).filter(x=>x&&x.value).map(x=>[x.key||x.value,x])).values()];
  const phones=list(raw.phones,p=>{const value=formatPhone(p.value);return value?{value,type:clean(p.type,40),primary:!!p.primary,key:phoneKey(value)||value}:null});
  const emails=list(raw.emails,e=>{const value=emailKey(e.value);return value?{value,type:clean(e.type,40),primary:!!e.primary}:null});
  const addresses=(Array.isArray(raw.addresses)?raw.addresses:[]).map(a=>{const s=splitStreet(a.street||'');return {formatted:clean(a.formatted,800),street:s.street,number:clean(a.number)||s.number,complement:clean(a.complement)||s.complement,neighborhood:clean(a.neighborhood,160),city:clean(a.city,160),region:clean(a.region,80),postalCode:String(a.postalCode||'').replace(/\D/g,'').slice(0,8),country:clean(a.country,80)}}).filter(a=>a.formatted||a.street||a.city).slice(0,5);
  return {id:clean(raw.id,200),name:clean(raw.name||raw.organization),phones,emails,addresses,birthday:birthdayOf(raw.birthday),organization:clean(raw.organization),source};
}

/* ---------- Providers ---------- */
const DeviceContactProvider={
  id:'device',label:'Do aparelho',
  // Feature detection em tempo de execução: Contact Picker existe hoje basicamente no Chrome para Android, em HTTPS.
  availability(){
    if(!('contacts' in navigator)||typeof navigator.contacts?.select!=='function')return {supported:false,reason:'A importação direta de contatos do aparelho não é suportada por este navegador. Use Google Contatos ou um arquivo .vcf.'};
    if(!root.isSecureContext)return {supported:false,reason:'Disponível apenas em conexão segura (HTTPS).'};
    return {supported:true};
  },
  // Precisa ser chamado direto do clique do usuário. Só um contato, só as propriedades suportadas.
  async pick(){
    let available=['name','tel','email'];try{available=await navigator.contacts.getProperties()}catch{}
    const props=['name','tel','email','address'].filter(p=>available.includes(p));
    const [c]=await navigator.contacts.select(props,{multiple:false})||[];if(!c)return null;
    return normalizeContact({name:c.name?.[0],phones:(c.tel||[]).map(value=>({value})),emails:(c.email||[]).map(value=>({value})),addresses:(c.address||[]).map(a=>({street:(a.addressLine||[]).join(', '),neighborhood:a.dependentLocality,city:a.city,region:a.region,postalCode:a.postalCode,country:a.country}))},'device');
  }
};

const GoogleContactsProvider={
  id:'google',label:'Google Contatos',
  async availability(){
    try{const g=await EcoAuth.api('/api/google/status');
      if(!g.configured)return {supported:false,reason:'A integração Google não está configurada no servidor.'};
      return {supported:true,authorized:!!g.scopes?.contacts,reason:g.scopes?.contacts?'':g.state==='revoked'?'A autorização Google expirou. Você vai confirmar o acesso de novo.':'Na primeira vez o Google pede permissão de leitura dos contatos.'};
    }catch(e){return {supported:false,reason:e.message}}
  },
  async page({pageToken='',query=''}={}){
    const params=new URLSearchParams();if(pageToken)params.set('pageToken',pageToken);if(query)params.set('q',query);
    const r=await EcoAuth.api('/api/google/contacts?'+params);
    return {contacts:r.contacts.map(c=>normalizeContact(c,'google')),nextPageToken:r.nextPageToken||null};
  },
  // Autorização incremental: só o escopo contacts.readonly, sem mexer em Agenda/Drive.
  async authorize(){try{sessionStorage.setItem('eco-contacts-resume','google')}catch{}const r=await EcoAuth.api('/api/google/connect',{method:'POST',body:JSON.stringify({purpose:'contacts'})});location.assign(r.url)}
};

// vCard 2.1/3.0/4.0: o suficiente para nome, telefones, e-mails, endereço, aniversário e empresa.
function parseVCards(text){
  const lines=String(text).replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'').replace(/=\n/g,'=').split('\n'),cards=[];let cur=null;
  const qp=v=>{try{const bytes=[];for(let i=0;i<v.length;i++){if(v[i]==='='&&/^[0-9A-F]{2}$/i.test(v.slice(i+1,i+3))){bytes.push(parseInt(v.slice(i+1,i+3),16));i+=2}else bytes.push(...new TextEncoder().encode(v[i]))}return new TextDecoder().decode(new Uint8Array(bytes))}catch{return v}};
  const unescape=v=>v.replace(/\\n/gi,' ').replace(/\\([,;\\])/g,'$1');
  for(const line of lines){
    const i=line.indexOf(':');if(i<1)continue;
    const head=line.slice(0,i),value=line.slice(i+1),parts=head.split(';'),name=parts[0].replace(/^item\d+\./i,'').toUpperCase(),params=parts.slice(1).join(';').toUpperCase();
    if(name==='BEGIN'&&/VCARD/i.test(value)){cur={phones:[],emails:[],addresses:[]};continue}
    if(name==='END'&&cur){cards.push(normalizeContact(cur,'vcard'));cur=null;if(cards.length>=5000)break;continue}
    if(!cur)continue;
    const v=/QUOTED-PRINTABLE/.test(params)?qp(value):value,type=(params.match(/TYPE=([^;:]+)/)||[])[1]||'',primary=/PREF/.test(params);
    if(name==='FN')cur.name=unescape(v);
    else if(name==='N'&&!cur.name){const [last,first,middle]=v.split(';').map(unescape);cur.name=[first,middle,last].filter(Boolean).join(' ')}
    else if(name==='TEL')cur.phones.push({value:unescape(v).replace(/^tel:/i,''),type,primary});
    else if(name==='EMAIL')cur.emails.push({value:unescape(v),type,primary});
    else if(name==='ADR'){const [,ext,street,city,region,postal,country]=v.split(';').map(unescape);cur.addresses.push({street,neighborhood:ext,city,region,postalCode:postal,country,formatted:[street,ext,city,region,postal,country].filter(Boolean).join(', ')})}
    else if(name==='BDAY')cur.birthday=v;
    else if(name==='ORG')cur.organization=unescape(v.split(';')[0]);
  }
  return cards.filter(c=>c.name||c.phones.length||c.emails.length);
}
const VCardContactProvider={
  id:'vcard',label:'Arquivo .vcf',
  availability(){return {supported:typeof FileReader!=='undefined'}},
  async read(file){if(!file)return [];if(file.size>5*1024*1024)throw Error('Arquivo grande demais. Exporte só os contatos necessários (até 5 MB).');return parseVCards(await file.text())}
};

/* ---------- Seletor ---------- */
let dialog,options={};
const PAGE=50;
function ensureDialog(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='contact-import-dialog';dialog.className='contact-import-dialog';dialog.setAttribute('aria-labelledby','contact-import-title');
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  document.body.append(dialog);return dialog;
}
function frame(title,body,footer=''){
  const d=ensureDialog();
  d.innerHTML=`<header class="ci-head"><h2 id="contact-import-title">${esc(title)}</h2><button type="button" class="icon-button" data-ci-close aria-label="Fechar">×</button></header><div class="ci-body">${body}</div>${footer?`<footer class="ci-foot">${footer}</footer>`:''}`;
  $('[data-ci-close]',d).onclick=()=>d.close();if(!d.open)d.showModal();return d;
}
const summary=c=>[c.phones.find(p=>p.primary)?.value||c.phones[0]?.value,c.emails.find(e=>e.primary)?.value||c.emails[0]?.value].filter(Boolean).join(' · ')||c.organization||'Sem telefone ou e-mail';

async function open(opts={}){
  options=opts;
  const device=DeviceContactProvider.availability(),vcard=VCardContactProvider.availability();
  const d=frame('Importar contato',`<p class="ci-note">Escolha de onde vem o contato. Os dados entram no formulário para você revisar; nada é salvo até você gerar o orçamento.</p>
    <div class="ci-sources">
      <button type="button" class="ci-source" data-ci-source="device" ${device.supported?'':'aria-disabled="true"'}><b>Do aparelho</b><span>${esc(device.supported?'Abre a agenda do celular para escolher um contato.':device.reason)}</span></button>
      <button type="button" class="ci-source" data-ci-source="google" aria-busy="true"><b>Google Contatos</b><span id="ci-google-note">Verificando…</span></button>
      ${vcard.supported?`<label class="ci-source" data-ci-source="vcard"><b>Importar arquivo .vcf</b><span>Contato exportado do iPhone, Android ou Outlook.</span><input type="file" accept=".vcf,text/vcard,text/x-vcard" hidden></label>`:''}
    </div><p class="ci-error" role="alert"></p>`);
  const google=d.querySelector('[data-ci-source="google"]');
  GoogleContactsProvider.availability().then(a=>{if(!d.open||!google.isConnected)return;google.removeAttribute('aria-busy');$('#ci-google-note',d).textContent=a.supported?(a.reason||'Busque pelo nome nos contatos da conta Google conectada.'):a.reason;if(!a.supported)google.setAttribute('aria-disabled','true');google.dataset.authorized=a.authorized?'1':''});
  const error=m=>{$('.ci-error',d).textContent=m};
  d.querySelector('[data-ci-source="device"]').onclick=async e=>{
    if(!device.supported)return error(device.reason);
    try{const c=await DeviceContactProvider.pick();if(!c)return;review(c)}catch(err){if(err?.name==='AbortError'||err?.name==='InvalidStateError')return;error('Não foi possível abrir os contatos do aparelho: '+(err.message||err))}
  };
  google.onclick=async()=>{
    if(google.getAttribute('aria-disabled')==='true')return error($('#ci-google-note',d).textContent);
    if(google.getAttribute('aria-busy')==='true')return;
    if(!google.dataset.authorized){await options.beforeRedirect?.();try{await GoogleContactsProvider.authorize()}catch(err){error(err.message)}return}
    browse('google');
  };
  const file=d.querySelector('[data-ci-source="vcard"] input');
  if(file)file.onchange=async()=>{try{const cards=await VCardContactProvider.read(file.files[0]);file.value='';if(!cards.length)return error('Nenhum contato encontrado no arquivo.');if(cards.length===1)return review(cards[0]);browse('vcard',cards)}catch(err){error(err.message)}};
}

// Lista com busca e carregamento progressivo: nunca renderiza a agenda inteira de uma vez.
function browse(source,localCards=[]){
  const d=frame(source==='google'?'Google Contatos':'Contatos do arquivo',`<label class="ci-search">Buscar por nome, telefone ou e-mail<input type="search" autocomplete="off" placeholder="Digite para buscar"></label><ul class="ci-list" role="listbox" aria-label="Contatos"></ul><p class="ci-status" role="status"></p><button type="button" class="secondary ci-more" hidden>Carregar mais</button>`,'<button type="button" class="text-button" data-ci-back>Voltar</button>');
  const list=$('.ci-list',d),status=$('.ci-status',d),more=$('.ci-more',d),input=$('input',d);
  let items=[],token=null,shown=0,query='',serial=0,timer;
  $('[data-ci-back]',d).onclick=()=>open(options);
  const paint=(append)=>{
    const slice=items.slice(append?shown:0,shown=Math.min(items.length,(append?shown:0)+PAGE));
    const html=slice.map((c,i)=>`<li><button type="button" class="ci-item" data-i="${(append?shown-slice.length:0)+i}"><b>${esc(c.name||'Sem nome')}</b><span>${esc(summary(c))}</span></button></li>`).join('');
    if(append)list.insertAdjacentHTML('beforeend',html);else list.innerHTML=html;
    more.hidden=!(shown<items.length||token);status.textContent=items.length?'':query?'Nenhum contato encontrado.':'Nenhum contato.';
  };
  list.onclick=e=>{const b=e.target.closest('[data-i]');if(b)review(items[+b.dataset.i])};
  async function load(append){
    const n=++serial;
    if(source==='vcard'){const q=fold(query);items=q?localCards.filter(c=>fold([c.name,c.organization,...c.phones.map(p=>p.value),...c.emails.map(x=>x.value)].join(' ')).includes(q)):localCards;token=null;return paint(append)}
    if(append&&shown<items.length)return paint(true);
    status.textContent='Carregando…';more.disabled=true;
    try{const r=await GoogleContactsProvider.page({pageToken:append?token:'',query});if(n!==serial)return;items=append?[...items,...r.contacts]:r.contacts;token=r.nextPageToken;paint(append)}
    catch(err){if(n!==serial)return;if(['GOOGLE_CONTACTS_SCOPE','GOOGLE_NOT_CONNECTED','GOOGLE_RECONNECT'].includes(err.code)){status.innerHTML=esc(err.message)+' <button type="button" class="text-button" data-ci-auth>Autorizar Google Contatos</button>';$('[data-ci-auth]',d).onclick=async()=>{await options.beforeRedirect?.();GoogleContactsProvider.authorize().catch(e=>status.textContent=e.message)};return}status.textContent=err.message}
    finally{more.disabled=false}
  }
  more.onclick=()=>load(true);
  input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{query=input.value.trim();shown=0;load(false)},source==='google'?400:120)};
  load(false);input.focus();
}

// Revisão: escolhe telefone/e-mail/endereço quando há mais de um e quais campos já preenchidos substituir.
function review(c){
  const current=options.current?.()||{};
  const choose=(name,label,values)=>values.length>1?`<fieldset class="ci-choice"><legend>${label}</legend>${values.map((v,i)=>`<label><input type="radio" name="${name}" value="${i}" ${i===Math.max(0,values.findIndex(x=>x.primary))?'checked':''}> ${esc(v.label)}</label>`).join('')}</fieldset>`:'';
  const phones=c.phones.map(p=>({label:p.value+(p.type?' · '+p.type:''),value:p.value,primary:p.primary}));
  const emails=c.emails.map(e=>({label:e.value+(e.type?' · '+e.type:''),value:e.value,primary:e.primary}));
  const addresses=c.addresses.map(a=>({label:a.formatted||[a.street,a.number,a.neighborhood,a.city,a.region].filter(Boolean).join(', '),value:a}));
  const bday=c.birthday?c.birthday.slice(3)+'/'+c.birthday.slice(0,2):'';
  const fields=[['name','Nome',c.name,current.name],['phone','Telefone',phones[0]?.value,current.phone],['email','E-mail',emails[0]?.value,current.email],['birthday','Aniversário',bday,current.birthday],['address','Endereço',addresses[0]?.label,current.address]].filter(f=>f[2]);
  if(!fields.length){frame('Importar contato','<p>Este contato não tem nome, telefone, e-mail nem endereço para preencher.</p>','<button type="button" class="secondary" data-ci-back>Escolher outro</button>');$('[data-ci-back]').onclick=()=>open(options);return}
  const conflicts=fields.filter(f=>f[3]&&String(f[3]).trim()&&String(f[3]).trim()!==String(f[2]).trim());
  const d=frame('Revisar contato',`<p class="ci-note"><b>${esc(c.name||'Contato sem nome')}</b>${c.organization&&c.organization!==c.name?' · '+esc(c.organization):''}</p>
    ${choose('phone','Qual telefone deseja usar?',phones)}${choose('email','Qual e-mail deseja usar?',emails)}${choose('address','Qual endereço deseja usar?',addresses)}
    <fieldset class="ci-fields"><legend>Campos que serão preenchidos</legend>${fields.map(([key,label,value,old])=>{const conflict=conflicts.some(f=>f[0]===key);return `<label class="ci-field"><input type="checkbox" name="use-${key}" ${conflict?'':'checked'}> <span><b>${label}</b> ${({phone:phones,email:emails,address:addresses}[key]||[]).length>1?'':esc(value)}${conflict?`<small>Substitui o que já está no formulário: ${esc(old)}</small>`:''}</span></label>`}).join('')}</fieldset>
    ${conflicts.length?'<p class="ci-note">Campos já preenchidos ficam desmarcados: marque só o que quiser substituir.</p>':''}`,
    '<button type="button" class="text-button" data-ci-back>Voltar</button><button type="button" class="primary" data-ci-apply>Preencher formulário</button>');
  $('[data-ci-back]',d).onclick=()=>open(options);
  $('[data-ci-apply]',d).onclick=()=>{
    const pickIdx=name=>{const el=d.querySelector(`input[name="${name}"]:checked`);return el?+el.value:Math.max(0,c[name==='phone'?'phones':name==='email'?'emails':'addresses'].findIndex(x=>x.primary))};
    const use=k=>d.querySelector(`input[name="use-${k}"]`)?.checked;
    const out={};
    if(use('name'))out.name=c.name;
    if(use('phone'))out.phone=phones[pickIdx('phone')]?.value||'';
    if(use('email'))out.email=emails[pickIdx('email')]?.value||'';
    if(use('birthday'))out.birthday=c.birthday;
    if(use('address'))out.address=addresses[pickIdx('address')]?.value||null;
    d.close();options.apply?.(out,c);
  };
}

function resume(opts){let flag=null;try{flag=sessionStorage.getItem('eco-contacts-resume');sessionStorage.removeItem('eco-contacts-resume')}catch{}if(flag!=='google')return;options=opts;GoogleContactsProvider.availability().then(a=>{if(a.authorized)browse('google')})}
root.EcoContacts={open,resume,providers:{device:DeviceContactProvider,google:GoogleContactsProvider,vcard:VCardContactProvider},normalizeContact,parseVCards,formatPhone,phoneKey,emailKey,birthdayOf};
})(globalThis);
