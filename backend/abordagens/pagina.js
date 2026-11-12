// Abordagens da Black Friday (página temporária /abordagens). Servido pelo Express, fora de public/.
(function(root){
'use strict';
// ---------------------------------------------------------------- Arte (canvas 1080 x 1350)
const W=1080,H=1350,K='#070807',LIME='#a7cf21',WHITE='#f4f7f2',MUTED='#9aa39c',DARK='#14170f';
const ASSETS=root.BF_ASSETS||'/assets/';
let recursos=null;
function carregar(){
  if(recursos)return recursos;
  const fontes=[['plus-jakarta-regular.ttf','400'],['plus-jakarta-bold.ttf','700']].map(([f,w])=>new FontFace('BFPJ',`url(${ASSETS}${f})`,{weight:w}).load().then(x=>{document.fonts.add(x);return x}));
  const logo=new Promise((ok,err)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>err(Error('Não foi possível carregar o logo.'));i.src=ASSETS+'herboclean.png'});
  recursos=Promise.all([logo,...fontes]).then(([l])=>({logo:l})).catch(e=>{recursos=null;throw e});
  return recursos;
}
const brl=v=>'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function font(ctx,size,weight){ctx.font=`${weight} ${size}px BFPJ, sans-serif`}
function largura(ctx,s,size,weight,track=0){font(ctx,size,weight);if(!track)return ctx.measureText(s).width;let w=0;for(const ch of s)w+=ctx.measureText(ch).width+track*size;return w-track*size}
// Escreve um texto (com espaçamento opcional entre letras, em em) e devolve a largura.
function texto(ctx,s,x,y,{size,weight=700,color,track=0,align='left',alpha=1}){
  const w=largura(ctx,s,size,weight,track);let cx=align==='center'?x-w/2:align==='right'?x-w:x;
  ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.textBaseline='alphabetic';ctx.textAlign='left';
  if(!track)ctx.fillText(s,cx,y);else for(const ch of s){ctx.fillText(ch,cx,y);cx+=ctx.measureText(ch).width+track*size}
  ctx.restore();return w;
}
// Reduz a fonte até caber na largura.
function caber(ctx,s,size,weight,track,max){while(size>12&&largura(ctx,s,size,weight,track)>max)size-=2;return size}
// Trechos na mesma linha: [{s,size,weight,color,track,alpha,strike}]
function linha(ctx,x,y,partes){let cx=x;for(const p of partes){const w=texto(ctx,p.s,cx,y,p);if(p.strike)riscar(ctx,cx,y,w,p.size,p.strike);cx+=w+(p.gap||0)}return cx-x}
function larguraLinha(ctx,partes){return partes.reduce((s,p)=>s+largura(ctx,p.s,p.size,p.weight??700,p.track||0)+(p.gap||0),0)}
function riscar(ctx,x,y,w,size,color){ctx.save();ctx.translate(x+w/2,y-size*.33);ctx.rotate(-7*Math.PI/180);ctx.fillStyle=color;const t=Math.max(5,Math.round(size*.15));ret(ctx,-w/2-6,-t/2,w+12,t,t/2);ctx.fill();ctx.restore()}
function ret(ctx,x,y,w,h,r){const rr=typeof r==='number'?[r,r,r,r]:r;ctx.beginPath();ctx.moveTo(x+rr[0],y);ctx.lineTo(x+w-rr[1],y);ctx.arcTo(x+w,y,x+w,y+rr[1],rr[1]);ctx.lineTo(x+w,y+h-rr[2]);ctx.arcTo(x+w,y+h,x+w-rr[2],y+h,rr[2]);ctx.lineTo(x+rr[3],y+h);ctx.arcTo(x,y+h,x,y+h-rr[3],rr[3]);ctx.lineTo(x,y+rr[0]);ctx.arcTo(x,y,x+rr[0],y,rr[0]);ctx.closePath()}
function pontilhado(ctx,x1,y1,x2,y2,color){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=4;ctx.lineCap='round';ctx.setLineDash([.1,10]);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore()}
function furo(ctx,x,y,r=40){ctx.save();ctx.fillStyle=K;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore()}
function tracejado(ctx,desenhar){ctx.save();ctx.strokeStyle='rgba(167,207,33,.6)';ctx.lineWidth=3;ctx.setLineDash([10,7]);desenhar();ctx.stroke();ctx.restore()}

function cabecalho(ctx,logo,titulo){
  ctx.fillStyle=K;ctx.fillRect(0,0,W,H);
  // "BLACK" vazado ao fundo
  ctx.save();font(ctx,390,700);ctx.strokeStyle='rgba(167,207,33,.19)';ctx.lineWidth=3;let x=-30;for(const ch of 'BLACK'){ctx.strokeText(ch,x,465);x+=ctx.measureText(ch).width-.06*390}ctx.restore();
  ctx.drawImage(logo,56,48,60*logo.width/logo.height,60);
  linha(ctx,W-56-larguraLinha(ctx,[{s:'válido até ',size:28,weight:400},{s:'sexta, 27/11',size:28,weight:700}]),88,[{s:'válido até ',size:28,weight:400,color:WHITE},{s:'sexta, 27/11',size:28,weight:700,color:LIME}]);
  const tag='ORÇAMENTO EXCLUSIVO',tw=largura(ctx,tag,30,700,.3)+52;ctx.fillStyle=LIME;ret(ctx,W/2-tw/2,200,tw,58,12);ctx.fill();
  texto(ctx,tag,W/2,240,{size:30,color:K,track:.3,align:'center'});
  texto(ctx,'BLACK',W/2,425,{size:168,color:WHITE,track:-.05,align:'center'});
  texto(ctx,'FRIDAY',W/2,585,{size:168,color:LIME,track:-.05,align:'center'});
  const lw=texto(ctx,titulo,W/2,660,{size:28,color:LIME,track:.24,align:'center'});
  const g1=ctx.createLinearGradient(56,0,W/2-lw/2-22,0);g1.addColorStop(0,'rgba(167,207,33,0)');g1.addColorStop(1,'rgba(167,207,33,.5)');ctx.fillStyle=g1;ctx.fillRect(56,649,W/2-lw/2-22-56,3);
  const g2=ctx.createLinearGradient(W/2+lw/2+22,0,W-56,0);g2.addColorStop(0,'rgba(167,207,33,.5)');g2.addColorStop(1,'rgba(167,207,33,0)');ctx.fillStyle=g2;ctx.fillRect(W/2+lw/2+22,649,W-56-(W/2+lw/2+22),3);
}
function rodape(ctx,esq,dir){
  const max=W-112-largura(ctx,dir,25,400)-40;
  let partes=esq;while(larguraLinha(ctx,partes)>max&&partes[partes.length-1].s.length>4)partes=[...partes.slice(0,-1),{...partes[partes.length-1],s:partes[partes.length-1].s.slice(0,-2)+'…'}];
  linha(ctx,56,1302,partes);texto(ctx,dir,W-56,1302,{size:25,weight:400,color:MUTED,align:'right'});
}
const parcelaTxt=o=>`ou ${o.parcelas.n}× de ${brl(o.parcelas.valor)} no cartão`;

// Dois cupons: colchão (15% ou combo) e mais de um colchão / colchão + sofá (15% ou mesmo valor + brinde).
function arteDupla(ctx,c,logo){
  const [d,b]=c.opcoes,multi=c.grupo==='colchao-multi',T=694,B=1194,CUT=930,L1=56,R1=522,L2=556,R2=1024;
  cabecalho(ctx,logo,'ESCOLHA SUA PROMOÇÃO');
  ctx.fillStyle=LIME;ret(ctx,L1,T,R1-L1,B-T,36);ctx.fill();
  ctx.fillStyle=DARK;ret(ctx,L2,T,R2-L2,B-T,36);ctx.fill();tracejado(ctx,()=>ret(ctx,L2+1.5,T+1.5,R2-L2-3,B-T-3,35));
  for(const x of [L1,R1,L2,R2])furo(ctx,x,CUT);
  pontilhado(ctx,L1+52,CUT,R1-52,CUT,'rgba(7,8,7,.4)');pontilhado(ctx,L2+52,CUT,R2-52,CUT,'rgba(167,207,33,.4)');
  // OU no meio
  ctx.save();ctx.fillStyle=K;ctx.strokeStyle=LIME;ctx.lineWidth=3;ctx.beginPath();ctx.arc((R1+L2)/2,CUT,33,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
  texto(ctx,'OU',(R1+L2)/2+1,CUT+9,{size:24,color:LIME,align:'center'});
  const inner=R1-L1-68;
  // Cupom 1: desconto
  const pct=Math.round(d.percentual*100)+'%';const wp=texto(ctx,pct,L1+34,810,{size:100,color:K,track:-.06});texto(ctx,'OFF',L1+34+wp+8,810,{size:44,color:K,track:-.01});
  texto(ctx,'de desconto no',L1+34,862,{size:28,color:K,alpha:.7});texto(ctx,multi?'valor total':'seu orçamento',L1+34,897,{size:28,color:K,alpha:.7});
  const old=brl(c.precoOriginal),so=caber(ctx,old,38,700,0,inner-60);
  linha(ctx,L1+34,1003,[{s:'de',size:32,color:K,alpha:.7,gap:14},{s:old,size:so,color:K,alpha:.75,strike:K}]);
  const p1=brl(d.preco);texto(ctx,p1,L1+34,1095,{size:caber(ctx,p1,82,700,-.045,inner),color:K,track:-.045});
  texto(ctx,parcelaTxt(d),L1+34,1148,{size:caber(ctx,parcelaTxt(d),27,400,0,inner),weight:400,color:K,alpha:.7});
  // Cupom 2: combo com brinde
  texto(ctx,'COMBO',L2+34,810,{size:caber(ctx,'COMBO',100,700,-.05,inner),color:LIME,track:-.05});
  linha(ctx,L2+34,862,[{s:'+ ',size:28,color:WHITE},{s:'2 cadeiras ou',size:28,color:LIME}]);texto(ctx,'1 poltrona grátis',L2+34,897,{size:28,color:LIME});
  texto(ctx,multi?'pelo mesmo valor':'colchão + brinde por',L2+34,1003,{size:caber(ctx,'colchão + brinde por',32,700,0,inner),color:MUTED});
  const p2=brl(b.preco);texto(ctx,p2,L2+34,1095,{size:caber(ctx,p2,82,700,-.045,inner),color:WHITE,track:-.045});
  texto(ctx,parcelaTxt(b),L2+34,1148,{size:caber(ctx,parcelaTxt(b),27,400,0,inner),weight:400,color:MUTED});
  rodape(ctx,[{s:c.servico||'Higienização',size:25,color:WHITE},{s:' · '+(c.cliente||''),size:25,weight:400,color:MUTED}],c.numero||'');
}
// Um cupom: só desconto (20%, 15% ou 10%).
function arteUnica(ctx,c,logo){
  const o=c.opcoes[0],T=694,B=1194,L=56,R=1024,S=L+360,MID=944;
  cabecalho(ctx,logo,'SUA PROMOÇÃO EXCLUSIVA');
  ctx.fillStyle=LIME;ret(ctx,L,T,S-L,B-T,[40,0,0,40]);ctx.fill();
  ctx.fillStyle=DARK;ret(ctx,S,T,R-S,B-T,[0,40,40,0]);ctx.fill();
  tracejado(ctx,()=>{ctx.beginPath();ctx.moveTo(S,T+1.5);ctx.lineTo(R-40,T+1.5);ctx.arcTo(R-1.5,T+1.5,R-1.5,T+40,38.5);ctx.lineTo(R-1.5,B-40);ctx.arcTo(R-1.5,B-1.5,R-40,B-1.5,38.5);ctx.lineTo(S,B-1.5)});
  furo(ctx,L,MID);furo(ctx,R,MID);pontilhado(ctx,S-14,T+26,S-14,B-26,'rgba(7,8,7,.9)');
  const cx=L+180;texto(ctx,Math.round((o.percentual||0)*100)+'%',cx,915,{size:128,color:K,track:-.07,align:'center'});
  texto(ctx,'OFF',cx,985,{size:60,color:K,track:.12,align:'center'});
  texto(ctx,'no seu',cx,1037,{size:28,color:K,alpha:.7,align:'center'});texto(ctx,'orçamento',cx,1072,{size:28,color:K,alpha:.7,align:'center'});
  const x=S+52,inner=R-40-x,[s1,...resto]=String(c.servico||'Serviço').split(' · ');
  const svc=[{s:s1,size:30,color:WHITE},...(resto.length?[{s:' · '+resto.join(' · '),size:30,weight:400,color:MUTED}]:[])];
  let fs=30;while(fs>18&&larguraLinha(ctx,svc.map(p=>({...p,size:fs})))>inner)fs-=2;linha(ctx,x,830,svc.map(p=>({...p,size:fs})));
  const old=brl(c.precoOriginal);let f1=34,f2=44;while(f1>18&&larguraLinha(ctx,[{s:'de',size:f1,gap:16},{s:old,size:f2,gap:16},{s:'por',size:f1}])>inner){f1-=2;f2-=2}
  linha(ctx,x,910,[{s:'de',size:f1,color:MUTED,gap:16},{s:old,size:f2,color:WHITE,alpha:.8,strike:LIME,gap:16},{s:'por',size:f1,color:MUTED}]);
  const p=brl(o.preco);texto(ctx,p,x,1030,{size:caber(ctx,p,106,700,-.05,inner),color:WHITE,track:-.05});
  texto(ctx,parcelaTxt(o),x,1085,{size:caber(ctx,parcelaTxt(o),29,400,0,inner),weight:400,color:MUTED});
  rodape(ctx,[{s:c.cliente||'',size:25,color:WHITE},{s:' · Black Friday Herboclean',size:25,weight:400,color:MUTED}],c.numero||'');
}
const temArte=c=>['colchao','colchao-multi','desconto'].includes(c.grupo);
async function desenhar(c,canvas=document.createElement('canvas')){
  if(!temArte(c))throw Error('Esta oferta não tem imagem.');
  const {logo}=await carregar();canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
  (c.opcoes.length===2?arteDupla:arteUnica)(ctx,c,logo);return canvas;
}
const blob=canvas=>new Promise((ok,err)=>canvas.toBlob(b=>b?ok(b):err(Error('Falha ao gerar a imagem.')),'image/png'));
root.BFArte={desenhar,blob,temArte};

// ---------------------------------------------------------------- Página
const list=document.getElementById('list');if(!list)return;
const $=id=>document.getElementById(id);
let csrf='',estado={dados:null,enviados:{},vivo:{}};const filtro={status:'pendentes',grupo:'',busca:''};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const pct=v=>Math.round(v*100)+'%';
const quando=iso=>{const d=new Date(iso);return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})};
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function toast(msg,erro=false){const t=document.createElement('div');t.className='toast'+(erro?' err':'');t.textContent=msg;document.body.append(t);setTimeout(()=>t.remove(),erro?4500:2200)}
async function api(url,opt={}){
  const r=await fetch(url,{...opt,credentials:'same-origin',headers:{...(opt.body?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf}});
  const d=await r.json().catch(()=>({}));if(r.status===401){location.href='/';throw Error('Sessão encerrada.')}
  if(!r.ok)throw Error(d.error||'Não foi possível concluir.');return d;
}
const GRUPO={colchao:['Colchão · 15% ou combo','p-colchao'],'colchao-multi':['Colchões · 15% ou brinde','p-colchao'],desconto:['Desconto','p-desconto'],'preco-cheio':['Preço cheio · Pix 2x','p-cheio'],aviso:['Aviso · já fechando','p-aviso']};
const STATUS={scheduled:'Agendado',completed:'Concluído',cancelled:'Cancelado'};
function margemHTML(m){return `<div class="l${m.parceiro<0?' neg':''}">Lucro ${brl(m.lucro)} (${pct(m.lucroPct)})</div><div class="d">V&amp;V ${brl(m.vv)} · parceiro ${brl(m.parceiro)}</div>`}
function linhaHTML(c){
  const env=estado.enviados[c.proposalId],v=estado.vivo[c.proposalId]||{},[gl,gc]=GRUPO[c.grupo]||[c.grupo,'p-cheio'];
  const st=v.status&&v.status!=='generated'?`<span class="pill ${v.status==='scheduled'||v.status==='completed'?'p-ok':'p-live'}">${STATUS[v.status]||v.status}${v.agendamento?' '+esc(v.agendamento.data.split('-').reverse().slice(0,2).join('/')):''}</span>`:'';
  const arq=v.arquivado?'<span class="pill p-live">Arquivado no app</span>':v.existe===false?'<span class="pill p-live">Orçamento apagado</span>':'';
  const ch=c.chance>=.25?'hi':c.chance>=.1?'mid':'lo';
  const black=c.opcoes.map(o=>`<div class="opt"><div class="v">${c.opcoes.length>1?`<span class="tagop">${esc(o.rotulo)}</span>`:''}${brl(o.preco)}${o.preco<c.precoOriginal?`<s>${brl(c.precoOriginal)}</s>`:''}</div>${o.brindes?.length?'<div class="d">+ 2 cadeiras ou 1 poltrona de brinde</div>':''}${margemHTML(o.margem)}</div>`).join('');
  const wa=c.telefone?`<a class="btn wa" href="https://wa.me/${esc(c.telefone)}?text=${encodeURIComponent(c.mensagem)}" target="_blank" rel="noopener">WhatsApp</a>`:'';
  return `<article class="row${env?' sent':''}" data-id="${esc(c.proposalId)}">
  <label class="sentbox"><span><input type="checkbox" data-enviado${env?' checked':''}> Enviado</span><small>${env?quando(env.em):''}</small></label>
  <div class="who"><b>${esc(c.cliente)}</b><div class="meta">${esc([c.bairro,c.cidade].filter(Boolean).join(' · '))}</div><div class="num">${esc(v.numero||c.numero)}</div>
    <span class="pill ${gc}">${gl}</span>${st}${arq}<div class="svc">${esc(c.servico)}</div></div>
  <div class="money-pair"><div class="money"><small>Original</small><div class="opt"><div class="v">${brl(c.precoOriginal)}</div>${margemHTML(c.margemOriginal)}</div></div>
  <div class="money"><small>Black Friday</small>${black}</div></div>
  <div class="chance"><button type="button" data-chance title="${esc(c.motivoChance)}" aria-expanded="false"><b class="${ch}">${pct(c.chance)}</b><small>CHANCE</small></button></div>
  <p class="why" hidden>${esc(c.motivoChance)}</p>
  <div class="acts"><button class="btn primary" type="button" data-copiar>Copiar abordagem</button>${temArte(c)?'<button class="btn lime" type="button" data-imagem>Baixar imagem</button>':''}${wa}</div>
  <details class="msg"><summary>Ver mensagem</summary><div class="bubble">${esc(c.mensagem)}</div>${c.trechoCitado?`<div class="quote">Da conversa: “${esc(c.trechoCitado)}”</div>`:''}</details>
</article>`;
}
function render(){
  const d=estado.dados;$('empty').hidden=!!d;for(const id of ['kpis','bar','foot'])$(id).hidden=!d;
  if(!d){list.innerHTML='';return}
  const cs=d.clientes,env=estado.enviados,nEnv=cs.filter(c=>env[c.proposalId]).length;
  const fat=cs.reduce((s,c)=>s+c.chance*c.opcoes[0].preco,0),vv=cs.reduce((s,c)=>s+c.chance*c.opcoes[0].margem.vv,0);
  $('k-total').textContent=cs.length;$('k-grupos').textContent=`${cs.filter(c=>c.grupo.startsWith('colchao')).length} colchão · ${cs.filter(c=>c.grupo==='desconto').length} desconto · ${cs.filter(c=>c.grupo==='preco-cheio').length} preço cheio`;
  $('k-sent').textContent=`${nEnv} de ${cs.length}`;$('k-pend').textContent=`${cs.length-nEnv} pendentes`;
  $('k-fat').textContent=brl(fat);$('k-vv').textContent=brl(vv);$('k-split').textContent='divisão '+(d.divisao||'misto');
  $('f-info').textContent=`Importado em ${quando(d.importadoEm)} · ${cs.length} clientes`;
  const q=norm(filtro.busca);
  const vis=cs.filter(c=>(filtro.status==='todos'||(filtro.status==='enviados')===!!env[c.proposalId])
    &&(!filtro.grupo||(filtro.grupo==='colchao'?c.grupo.startsWith('colchao'):c.grupo===filtro.grupo))
    &&(!q||norm([c.cliente,c.bairro,c.cidade,c.numero,c.servico].join(' ')).includes(q)))
    .sort((a,b)=>(a.grupo==="aviso")-(b.grupo==="aviso")||b.chance-a.chance);
  list.innerHTML=vis.length?vis.map(linhaHTML).join(''):`<div class="empty"><p>${filtro.status==='pendentes'&&nEnv===cs.length?'Todas as abordagens foram enviadas.':'Nenhum cliente neste filtro.'}</p></div>`;
}
async function carregarDados(){estado=await api('/api/abordagens');render()}
const cliente=id=>estado.dados.clientes.find(c=>c.proposalId===id);
async function copiar(texto){
  try{await navigator.clipboard.writeText(texto);return}catch{}
  const t=document.createElement('textarea');t.value=texto;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok)throw Error('Não foi possível copiar.');
}
let previewURL=null,previewFile=null;
function fecharPreview(){$('preview').hidden=true;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;previewFile=null}
async function imagem(c,btn){
  btn.disabled=true;const txt=btn.textContent;btn.textContent='Gerando…';
  try{
    const b=await blob(await desenhar(c)),nome=`Black Friday - ${c.cliente.replace(/[\\/:*?"<>|]/g,'').trim()||'cliente'}.png`;
    fecharPreview();previewURL=URL.createObjectURL(b);previewFile=new File([b],nome,{type:'image/png'});
    $('preview-img').src=previewURL;$('preview-save').href=previewURL;$('preview-save').download=nome;
    $('preview-share').hidden=!(navigator.canShare&&navigator.canShare({files:[previewFile]}));$('preview').hidden=false;
  }catch(e){toast(e.message,true)}finally{btn.disabled=false;btn.textContent=txt}
}
list.addEventListener('click',async e=>{
  const row=e.target.closest('.row');if(!row)return;const c=cliente(row.dataset.id);if(!c)return;
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-copiar')){try{await copiar(c.mensagem);b.textContent='Copiado';b.classList.add('done');setTimeout(()=>{b.textContent='Copiar abordagem';b.classList.remove('done')},1500)}catch(err){toast(err.message,true)}}
  else if(b.hasAttribute('data-imagem'))imagem(c,b);
  else if(b.hasAttribute('data-chance')){const p=row.querySelector('.why'),open=p.hidden;p.hidden=!open;b.setAttribute('aria-expanded',String(open))}
});
list.addEventListener('change',async e=>{
  if(!e.target.matches('[data-enviado]'))return;const row=e.target.closest('.row'),id=row.dataset.id,val=e.target.checked;e.target.disabled=true;
  try{const r=await api(`/api/abordagens/${encodeURIComponent(id)}/enviado`,{method:'PUT',body:JSON.stringify({enviado:val})});
    if(r.enviado)estado.enviados[id]=r.enviado;else delete estado.enviados[id];render();toast(val?'Marcado como enviado.':'Desmarcado.')}
  catch(err){e.target.checked=!val;e.target.disabled=false;toast(err.message,true)}
});
$('seg-status').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;filtro.status=b.dataset.v;for(const x of $('seg-status').children)x.setAttribute('aria-pressed',String(x===b));render()});
$('f-grupo').addEventListener('change',e=>{filtro.grupo=e.target.value;render()});
$('f-busca').addEventListener('input',e=>{filtro.busca=e.target.value;render()});
document.addEventListener('click',e=>{if(e.target.closest('[data-importar]'))$('file').click()});
$('file').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const json=JSON.parse(await f.text());if(estado.dados&&!confirm('Substituir as abordagens atuais pelo arquivo? As marcações de enviado são mantidas.'))return;
    const r=await api('/api/abordagens/importar',{method:'POST',body:JSON.stringify(json)});toast(r.importados+' clientes importados.');await carregarDados()}
  catch(err){toast(err instanceof SyntaxError?'Arquivo não é um JSON válido.':err.message,true)}
});
$('preview-close').onclick=fecharPreview;$('preview').addEventListener('click',e=>{if(e.target.id==='preview')fecharPreview()});
$('preview-share').onclick=async()=>{try{await navigator.share({files:[previewFile]})}catch(err){if(err?.name!=='AbortError')toast('Não foi possível compartilhar.',true)}};
(async()=>{try{const s=await api('/api/session');if(!s.authenticated){location.href='/';return}csrf=s.csrf||'';await carregarDados();carregar().catch(()=>{})}catch(err){toast(err.message,true)}})();
})(globalThis);
