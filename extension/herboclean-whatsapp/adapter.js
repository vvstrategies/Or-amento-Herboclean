/* DOM adapter: only visible current-chat header and composer. No message history,
   internal WhatsApp objects, network interception, send buttons or Enter keys. */
globalThis.HerbocleanAdapter=(()=>{
  const visible=e=>!!e&&e.getClientRects().length>0;
  const clean=value=>String(value||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
  const editorSelector='footer [contenteditable="true"][role="textbox"]';
  function normalize(value){const d=String(value||'').replace(/\D/g,'');return /^(?:55)?\d{10,11}$/.test(d)?(d.length<=11?'55'+d:d):''}
  function conversation(doc){
    const main=doc.querySelector('#main');
    const headers=main?[...main.querySelectorAll('header')].filter(visible):[];
    if(headers.length===1)return {root:main,header:headers[0]};
    // Some layouts omit #main. Locate the unique composer and its nearest
    // container with one header; never search the chat list or message text.
    const editors=[...doc.querySelectorAll(editorSelector)].filter(visible);
    if(editors.length!==1)return {};
    for(let root=editors[0].parentElement;root&&root!==doc.body&&root!==doc.documentElement;root=root.parentElement){
      if(root.matches('#pane-side, [role="navigation"]'))return {};
      const found=[...root.querySelectorAll('header')].filter(visible);
      if(found.length>1)return {};
      if(found.length===1)return {root,header:found[0]};
    }
    return {};
  }
  function read(doc=document){
    const {root,header}=conversation(doc);if(!visible(header))return {name:'',phone:'',header:null,root:null};
    // The contact can be rendered as plain text without span[title]. Prefer
    // the first visible header line (identity), not buttons or a status line.
    const firstLine=(header.innerText||'').split(/[\r\n]+/).map(clean).find(Boolean);
    const title=[...header.querySelectorAll('span[title]')].find(visible);
    const name=clean(firstLine||title?.getAttribute('title')).slice(0,240);
    // A name is a suggestion only. Never extract digits from an arbitrary name.
    const group=/\b(participantes|participants|membros|members|dados do grupo|group info)\b/i.test(header.innerText||'');
    const purePhone=/^\+?[\d\s().-]{10,24}$/.test(name);
    return {name,phone:!group&&purePhone?normalize(name):'',header,root};
  }
  function prepare(request,current,doc=document){
    const found=read(doc);
    if(request.contextId!==current.id||found.root!==current.root||found.header!==current.header||found.name!==current.name||found.phone!==current.phone||!found.phone||found.phone!==request.phone||request.phone!=='5511986495346')return {ok:false,error:'A conversa mudou ou o telefone não está visível. Use Copiar e confira o destinatário.'};
    if(typeof request.text!=='string'||!request.text.trim()||request.text.length>8000)return {ok:false,error:'Texto inválido.'};
    const editors=[...found.root.querySelectorAll(editorSelector)].filter(visible);
    if(editors.length!==1)return {ok:false,error:'Campo de mensagem indisponível. Use Copiar.'};
    const editor=editors[0];if((editor.innerText||editor.textContent||'').trim())return {ok:false,error:'Já existe um rascunho no WhatsApp. Revise-o antes de inserir outro texto.'};
    editor.focus();
    // execCommand triggers the native editable input pipeline. No synthetic send.
    if(!doc.execCommand('insertText',false,request.text))return {ok:false,error:'O navegador recusou a inserção. Use Copiar.'};
    const actual=(editor.innerText||editor.textContent||'').replace(/\r\n/g,'\n').trim();
    return actual===request.text.trim()?{ok:true}:{ok:false,error:'Confira o campo do WhatsApp: a inserção não foi confirmada integralmente.'};
  }
  return {read,prepare,normalize};
})();
