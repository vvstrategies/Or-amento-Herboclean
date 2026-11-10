(function(root){
  'use strict';
  // Perfil de quem usa o sistema: chip no rodapé do menu (foto, nome e subtítulo) e o card "Seu perfil"
  // em Configurações › Empresa. Sem perfil salvo, o chip mostra o nome e o endereço da empresa.
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'?';
  let profile=null,company=null,version=0;
  const photoUrl=()=>'/api/profile/photo?v='+encodeURIComponent((profile?.updatedAt||'')+version);

  function paintChip(){
    const chip=$('#profile-chip');if(!chip)return;
    const name=profile?.name||company?.name||'Sua empresa',sub=profile?.name?(profile.subtitle||company?.name||''):(company?.location||'');
    $('#profile-name').textContent=name;$('#profile-sub').textContent=sub;
    const av=$('#profile-avatar');av.textContent=initials(name);
    if(profile?.hasPhoto){const img=new Image();img.alt='';img.className='profile-photo';img.decoding='async';img.onload=()=>{av.textContent='';av.append(img)};img.src=photoUrl()}
    chip.title=profile?.name?'Seu perfil · '+name:'Configurar seu perfil';
  }
  function paintCard(){
    const card=$('#profile-card');if(!card)return;
    const name=profile?.name||'';
    card.innerHTML=`<div class="settings-card-heading"><div><h2>Seu perfil</h2><p>Aparece no rodapé do menu.</p></div></div>
      <div class="profile-edit"><div class="profile-pic">${profile?.hasPhoto?`<img src="${photoUrl()}" alt="Foto de perfil">`:`<span>${esc(initials(name||company?.name))}</span>`}</div>
      <div class="profile-pic-actions"><label class="button secondary" tabindex="0">Trocar foto<input id="profile-photo-input" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${profile?.hasPhoto?'<button type="button" class="text-button" id="profile-photo-remove">Remover foto</button>':''}<small class="hint">PNG, JPEG ou WEBP. A foto é recortada em quadrado.</small></div></div>
      <form id="profile-form" class="profile-form"><label>Nome<input name="name" maxlength="60" required value="${esc(name)}" placeholder="Seu nome"></label><label>Abaixo do nome<input name="subtitle" maxlength="80" value="${esc(profile?.subtitle||'')}" placeholder="Ex.: ${esc(company?.name||'Herboclean')}"></label>
      <div class="profile-actions"><button class="primary" type="submit">Salvar perfil</button><span class="hint" id="profile-status" role="status"></span></div></form>`;
    const status=t=>{const s=$('#profile-status');if(s)s.textContent=t};
    $('#profile-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{profile=await EcoAuth.api('/api/profile',{method:'PUT',body:JSON.stringify({name:f.get('name'),subtitle:f.get('subtitle')})});paintChip();status('Perfil salvo.')}catch(err){status(err.message)}};
    $('#profile-photo-input').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)return status('A foto deve ter até 8 MB.');
      status('Enviando foto...');const dataUrl=await new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=fail;r.readAsDataURL(file)});
      try{profile=await EcoAuth.api('/api/profile/photo',{method:'PUT',body:JSON.stringify({dataUrl})});version++;paintChip();paintCard();$('#profile-status').textContent='Foto atualizada.'}catch(err){status(err.message)}
    };
    $('#profile-photo-remove')?.addEventListener('click',async()=>{try{profile=await EcoAuth.api('/api/profile/photo',{method:'DELETE'});version++;paintChip();paintCard()}catch(err){status(err.message)}});
  }
  async function load(){
    if(!root.EcoAuth?.online)return;
    try{[profile,company]=await Promise.all([EcoAuth.api('/api/profile'),(root.EcoCache?.get||EcoAuth.api)('/api/settings?lite=1').then(s=>s?.company||null).catch(()=>null)]);paintChip();paintCard()}catch{}
  }
  addEventListener('eco:ready',load);
  addEventListener('eco:data-changed',()=>{if(profile)load()});
  document.addEventListener('click',e=>{if(e.target.closest('#profile-chip')){root.EcoWorkspace?.navigate('settings');root.EcoSettings?.reveal('#profile-card')}});
  root.EcoProfile={load};
})(globalThis);
