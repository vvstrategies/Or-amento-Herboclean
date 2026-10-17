(function(root){
  const online=location.protocol!=='file:';let csrf,resolveReady,authUser;const requestedAccount=new URLSearchParams(location.search).get('account');
  const showUser=()=>{const label=document.getElementById('access-user');if(label)label.textContent=authUser?authUser.name+' · Administrador':'Seu espaço de trabalho'};
  const ready=new Promise(r=>resolveReady=r),screen=document.getElementById('auth-screen');
  async function api(url,options={}){
    const response=await fetch(url,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf||'',...options.headers}});
    if(options.blob&&response.ok)return response.blob();
    const data=await response.json();
    if(!response.ok){if(response.status===401&&!url.includes('/login'))show(false);if(response.status===428)await boot();throw Error(data.error||'Não foi possível concluir a solicitação.')}return data;
  }
  function lock(){screen.hidden=false;document.body.dataset.companyReady='false';document.querySelector('.app-shell').inert=true;document.querySelector('.sidebar').inert=true;document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
  function unlock(settings){UniversalBrand.apply(settings.company);EcoModel.configure(settings);screen.hidden=true;document.body.dataset.companyReady='true';document.querySelector('.app-shell').inert=false;document.querySelector('.sidebar').inert=false;resolveReady()}
  async function boot(){
    const state=await api('/api/onboarding');
    if(state.required){lock();document.getElementById('auth-form').hidden=true;await UniversalOnboarding.show(state.settings,false,state.reviewExisting,async settings=>unlock(settings))}
    else unlock(state.settings);
  }
  function show(setup){
    lock();document.getElementById('company-onboarding')?.remove();const form=document.getElementById('auth-form');form.hidden=false;
    document.getElementById('auth-title').textContent=setup?'Crie seu acesso':'Entre no seu espaço';
    document.getElementById('auth-note').textContent=setup?'Passo 1 de 2 · Defina a senha do administrador. Depois, você vai configurar sua empresa.':'Informe seu usuário e sua senha. Para o acesso anterior, use admin.';
    document.getElementById('auth-username-label').hidden=setup;if(requestedAccount)document.getElementById('auth-username').value=requestedAccount;const input=document.getElementById('auth-password');input.minLength=setup?12:1;input.autocomplete=setup?'new-password':'current-password';
    form.querySelector('button').textContent=setup?'Criar acesso e continuar':'Entrar';
    form.onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const data=await api(setup?'/api/setup':'/api/login',{method:'POST',body:JSON.stringify({password:input.value,username:document.getElementById('auth-username').value||'admin'})});csrf=data.csrf;authUser=data.user;showUser();input.value='';if(requestedAccount&&authUser?.username!==requestedAccount)throw Error('Este rascunho pertence ao acesso '+requestedAccount+'. Entre com esse usuário.');await boot()}catch(error){document.getElementById('auth-error').textContent=error.message}finally{button.disabled=false}};
  }
  root.EcoAuth={online,ready,api,editCompany:async()=>{const settings=await api('/api/settings');lock();document.getElementById('auth-form').hidden=true;await UniversalOnboarding.show(settings,true,false,()=>location.reload(),()=>{document.getElementById('company-onboarding')?.remove();unlock(settings)})}};
  lock();
  if(!online){document.getElementById('auth-title').textContent='Abra o servidor local';document.getElementById('auth-note').textContent='Execute start.bat nesta pasta e acesse http://localhost:3000. O cadastro e a senha são protegidos pelo servidor.';document.getElementById('auth-password').parentElement.hidden=true;document.querySelector('#auth-form button').hidden=true;return}
  api('/api/session').then(async data=>{csrf=data.csrf;authUser=data.user;showUser();if(data.authenticated&&(!requestedAccount||requestedAccount===data.user?.username))await boot();else{show(data.needsSetup);if(requestedAccount)document.getElementById('auth-note').textContent='Entre como '+requestedAccount+' para continuar o rascunho criado no painel.'}}).catch(error=>document.getElementById('auth-error').textContent=error.message);
})(globalThis);
