// PDFKit contém geração dinâmica de funções. Ele só é carregado no modo arquivo.
// No acesso HTTP, a renderização ocorre no servidor e a CSP continua sem unsafe-eval.
window.EcoPDFReady=location.protocol==='file:'?(async()=>{
  for(const src of ['vendor/pdfkit.js','pdf-fonts.js'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Não foi possível carregar o gerador offline.'));document.head.appendChild(script)});
})():Promise.resolve();
