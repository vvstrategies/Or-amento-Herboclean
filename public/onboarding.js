(function(root){
'use strict';
const U=UniversalCompany,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function show(settings,editing,reviewExisting,onComplete,onCancel){
 document.getElementById('company-onboarding')?.remove();
 const c=U.normalize(settings.company),terms=EcoModel.normalizeTerms(settings.terms);let logo=c.logo,pending=false;
 const form=document.createElement('form');form.id='company-onboarding';form.className='company-onboarding';
 const input=(key,label,placeholder='',type='text',required=false)=>'<label>'+label+'<input name="'+key+'" type="'+type+'" '+(required?'required ':'')+'maxlength="240" value="'+esc(c[key])+'" placeholder="'+esc(placeholder)+'"></label>';
 form.innerHTML='<div class="onboarding-heading"><span class="product-mark">OU</span><div><span class="onboarding-step">'+(editing?'CONFIGURAÇÕES DA EMPRESA':'PASSO 2 DE 2')+'</span><h1>'+(editing?'A identidade da sua empresa.':'Vamos configurar sua empresa.')+'</h1><p>Seus dados, sua marca e suas condições. Você poderá editar tudo depois.</p></div></div>'+
 (reviewExisting&&!editing?'<p class="onboarding-notice">Esta instalação precisa concluir o cadastro da empresa. A senha, os orçamentos e os documentos existentes foram preservados.</p>':'')+
 '<div class="onboarding-columns"><div class="onboarding-fields"><section><h2>01 · Dados da empresa</h2><div class="fields">'+
 input('name','Nome da empresa','Como sua empresa se chama?','text',true)+input('taxId','CNPJ ou identificação fiscal · opcional')+
 input('location','Endereço ou região de atendimento','Cidade, região ou endereço comercial','text',true)+input('phone','Telefone de contato','Telefone ou WhatsApp')+input('email','E-mail de contato','','email')+input('website','Site ou rede social · opcional','https://','url')+
 '</div><p class="hint">Informe pelo menos um telefone ou e-mail.</p></section>'+
 '<section><h2>02 · Identidade visual</h2><div class="onboarding-logo-field"><label>Logo da empresa<input id="onboarding-logo" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="onboarding-remove-logo" class="text-button" type="button">Remover logo</button></div><label class="check-label"><input name="useInitials" type="checkbox" '+(c.useInitials?'checked':'')+'> Usar as iniciais se não houver logo</label><p class="hint">PNG, JPEG ou WebP. O logo será usado na plataforma e nos PDFs.</p><div class="fields">'+
 '<label>Cor principal<input name="primaryColor" type="color" value="'+c.primaryColor+'"></label><label>Cor de destaque<input name="accentColor" type="color" value="'+c.accentColor+'"></label><label>Fundo do logo<select name="logoBackground"><option value="light">Claro</option><option value="dark">Escuro</option></select></label>'+
 input('tagline','Especialidade · opcional','O que sua empresa faz?')+'</div><label>Apresentação da empresa · opcional<textarea name="intro" rows="4" maxlength="3000" placeholder="Apresente sua empresa com suas próprias palavras.">'+esc(c.intro)+'</textarea></label><label>Diferenciais · opcional<textarea name="benefits" rows="3" maxlength="3000" placeholder="Um diferencial por linha">'+esc(c.benefits)+'</textarea></label></section>'+
 '<section><h2>03 · Propostas e serviços</h2><div class="fields">'+input('proposalTitle','Título da proposta','Proposta comercial')+input('proposalSubtitle','Frase de apresentação · opcional')+input('proposalPrefix','Prefixo dos orçamentos','ORC')+
 '<label>Validade em dias<input name="validity" type="number" min="1" max="365" value="'+terms.validity+'" required></label><label>Parcelas no cartão<input name="installments" type="number" min="1" max="21" value="'+terms.installments+'" required></label></div>'+
 '<label>Catálogo de serviços<textarea name="services" rows="4" required placeholder="Consultoria | un. | Descrição do serviço">'+esc(U.catalog(settings.services).map(s=>s.name+' | '+s.unit+' | '+s.description).join('\n'))+'</textarea></label><p class="hint">Um serviço por linha: nome | un. ou m² | descrição opcional.</p><p class="onboarding-notice">Padrão Asaas: valor informado no PIX e cartão em 3x com taxas incluídas no total. Antecipação de referência: 1,70% ao mês, editável por empresa. Ajuste as condições do seu contrato ao criar a proposta.</p></section></div>'+
 '<aside class="onboarding-preview"><span class="onboarding-step">PRÉVIA DA IDENTIDADE</span><div id="identity-preview" class="identity-preview"><div id="identity-preview-mark"></div><h2 id="identity-preview-name"></h2><p id="identity-preview-tagline"></p><span id="identity-preview-location"></span></div><div class="identity-preview-paper"><span>PROPOSTA COMERCIAL</span><h3 id="identity-preview-title"></h3><p id="identity-preview-intro"></p><div id="identity-preview-accent"></div><p>Seu logo e suas cores acompanharão os novos orçamentos.</p></div></aside></div>'+
 '<div class="onboarding-actions"><p id="onboarding-error" role="alert"></p><button class="secondary" id="onboarding-exit" type="button">'+(editing?'Voltar':'Sair')+'</button><button class="primary" type="submit" id="onboarding-save">'+(editing?'Salvar configuração':'Concluir configuração e começar')+'</button></div>';
 document.getElementById('auth-screen').appendChild(form);
 form.elements.logoBackground.value=c.logoBackground;
 function values(){const raw=Object.fromEntries(new FormData(form));return {...raw,logo,useInitials:form.elements.useInitials.checked}}
 function preview(){
  const p=U.normalize(values()),theme=U.theme(p),mark=form.querySelector('#identity-preview-mark');
  form.querySelector('#identity-preview').style.background=theme.deep;
  mark.replaceChildren();
  if(logo){const img=document.createElement('img');img.src=logo;img.alt='Logo enviado';mark.style.background=p.logoBackground==='light'?'#fff':theme.deep;mark.appendChild(img)}
  else {mark.textContent=U.initials(p.name);mark.style.background=p.primaryColor}
  form.querySelector('#identity-preview-name').textContent=p.name||'Sua empresa';
  form.querySelector('#identity-preview-tagline').textContent=p.tagline;
  form.querySelector('#identity-preview-location').textContent=p.location||'Localização de atendimento';
  form.querySelector('#identity-preview-title').textContent=p.proposalSubtitle||p.proposalTitle;
  form.querySelector('#identity-preview-intro').textContent=p.intro||'A apresentação que você escrever aparecerá aqui.';
  form.querySelector('#identity-preview-accent').style.background=p.accentColor;
 }
 form.addEventListener('input',preview);preview();
 form.querySelector('#onboarding-remove-logo').onclick=()=>{logo='';form.elements.useInitials.checked=true;form.querySelector('#onboarding-logo').value='';preview()};
 form.querySelector('#onboarding-logo').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;pending=true;form.querySelector('#onboarding-save').disabled=true;
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Use PNG, JPEG ou WebP de até 8 MB.');
   const url=URL.createObjectURL(file);
   try{const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,1200/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');if(data.length>=4000000)throw Error('O logo é muito grande. Use uma imagem menor.');logo=data;preview()}finally{URL.revokeObjectURL(url)}
  }catch(error){form.querySelector('#onboarding-error').textContent=error.message}finally{pending=false;form.querySelector('#onboarding-save').disabled=false}
 };
 form.querySelector('#onboarding-exit').onclick=async()=>{if(editing){onCancel();return}await EcoAuth.api('/api/logout',{method:'POST',body:'{}'});location.reload()};
 form.onsubmit=async e=>{
  e.preventDefault();if(pending)return;const button=form.querySelector('#onboarding-save');button.disabled=true;form.querySelector('#onboarding-error').textContent='';
  try{
   const company=U.validate(values()),services=form.elements.services.value.split('\n').filter(s=>s.trim()).map(line=>{const [name,unit,...description]=line.split('|').map(s=>s.trim());if(unit&&!['un.','m²'].includes(unit))throw Error('Use un. ou m² como unidade dos serviços.');return {name,unit:unit||'un.',description:description.join(' | ')}});
   const payload={company,services,terms:{...terms,installments:Number(form.elements.installments.value),validity:Number(form.elements.validity.value)}};
   const saved=await EcoAuth.api(editing?'/api/settings':'/api/onboarding',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});form.remove();await onComplete(saved);
  }catch(error){form.querySelector('#onboarding-error').textContent=error.message}finally{button.disabled=false}
 };
 form.elements.name.focus({preventScroll:true});
}
root.UniversalOnboarding={show};
})(globalThis);
