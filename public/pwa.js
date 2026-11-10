(function(root){
  'use strict';
  // Instalar como aplicativo (PWA): registra o service worker e mostra "Instalar app" no topo de Configurações.
  // Android/Chrome/Edge: usa o pedido de instalação do navegador. iPhone/iPad (Safari): mostra o passo a passo.
  // Já instalado (aberto como app): o botão some.
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let deferred=null;
  if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{}));
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;paint()});
  addEventListener('appinstalled',()=>{deferred=null;paint();root.EcoStudio?.notify('App instalado. Abra pela tela inicial.')});
  function iosHelp(button){
    let d=document.getElementById('pwa-ios');
    if(!d){d=document.createElement('dialog');d.id='pwa-ios';d.className='pwa-ios';d.setAttribute('aria-labelledby','pwa-ios-title');
      d.innerHTML='<h2 id="pwa-ios-title">Instalar no iPhone</h2><ol><li>Toque em <b>Compartilhar</b> <span aria-hidden="true">(quadrado com seta para cima)</span> na barra do Safari.</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>. O app abre em tela cheia, como os outros aplicativos.</li></ol><button type="button" class="primary" data-close>Entendi</button>';
      document.body.append(d);d.querySelector('[data-close]').onclick=()=>{d.close();button?.focus()}}
    d.showModal();
  }
  function paint(){
    const host=document.querySelector('#settings-view .settings-summary');if(!host)return;
    let b=document.getElementById('pwa-install');
    const show=!standalone()&&(!!deferred||ios);
    if(!show){b?.remove();return}
    if(!b){b=document.createElement('button');b.type='button';b.id='pwa-install';b.className='sum-chip pwa-install';
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M12 7.5v7M9 11.8l3 3 3-3"/></svg><b>Instalar app</b>';
      b.onclick=async()=>{if(deferred){deferred.prompt();const r=await deferred.userChoice.catch(()=>null);if(r?.outcome==='accepted')deferred=null;paint()}else if(ios)iosHelp(b)};
      host.prepend(b)}
  }
  addEventListener('eco:ready',paint);
  if(document.readyState!=='loading')paint();else document.addEventListener('DOMContentLoaded',paint);
  root.EcoPWA={paint,standalone};
})(globalThis);
