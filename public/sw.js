// Service worker mínimo: torna o app instalável (PWA) e mostra uma página simples sem conexão.
// Não guarda arquivos em cache: os assets já são versionados em /v/<hash>/ e o CDN da Hostinger
// serve public/ direto do disco, então qualquer cache aqui só arriscaria telas desatualizadas.
const OFFLINE=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão · Herboclean</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#06261f;color:#e4efe9;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 8px;color:#fff}p{margin:0 0 20px;color:#a9c0b6}button{background:#a7cf21;color:#0b3d31;border:0;border-radius:14px;padding:12px 22px;font-weight:800;font-size:15px}</style></head>
<body><main><h1>Sem conexão com a internet</h1><p>Os orçamentos ficam no servidor. Assim que a conexão voltar, é só tentar de novo.</p><button onclick="location.reload()">Tentar de novo</button></main></body></html>`;
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request).catch(()=>new Response(OFFLINE,{headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
