import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox={};
vm.runInNewContext(fs.readFileSync('extension/herboclean-whatsapp/adapter.js','utf8'),sandbox);
const adapter=sandbox.HerbocleanAdapter;
const phone='+55 11 98649-5346';
const editorSelector='footer [contenteditable="true"][role="textbox"]';
// DOM contract fixtures, not a substitute for validation in the user's WhatsApp.
function fixture({legacy=true,title=true,text=phone}={}){
  const rect=()=>[{}];
  const label={getClientRects:rect,getAttribute:()=>phone};
  const header={getClientRects:rect,innerText:text,querySelectorAll:s=>s==='span[title]'&&title?[label]:[]};
  const editor={getClientRects:rect,innerText:'',focus(){}};
  const body={},root={parentElement:body,matches:()=>false,querySelectorAll:s=>s==='header'?[header]:s===editorSelector?[editor]:[]};
  const footer={parentElement:root,matches:()=>false,querySelectorAll:()=>[]};editor.parentElement=footer;
  let inserts=0;
  const doc={body,documentElement:{},querySelector:s=>s==='#main'&&legacy?root:null,querySelectorAll:s=>s===editorSelector?[editor]:[],
    execCommand(command,unused,value){assert.equal(command,'insertText');inserts++;editor.innerText=value;return true}};
  return {doc,root,header,editor,get inserts(){return inserts}};
}
const message={contextId:'chat-1',phone:'5511986495346',text:'Mensagem de teste'};
for(const options of [{},{title:false},{legacy:false,title:false},{title:false,text:'\u202a+55\u00a011\u00a098649-5346\u202c\nAdicionar à lista\nPesquisar'}]){
  const f=fixture(options),ctx={...adapter.read(f.doc),id:'chat-1'};
  assert.equal(ctx.phone,message.phone,'visible phone must work without title or #main');
  assert.equal(adapter.prepare({...message,contextId:'old'},ctx,f.doc).ok,false);
  assert.equal(f.inserts,0);
  assert.equal(adapter.prepare(message,ctx,f.doc).ok,true);
  assert.equal(adapter.prepare(message,ctx,f.doc).ok,false,'preserve existing drafts');
  assert.equal(f.inserts,1);
  f.editor.innerText='';f.header.innerText='+55 11 99999-9999';
  assert.equal(adapter.prepare(message,ctx,f.doc).ok,false,'chat changed');
  assert.equal(f.inserts,1);
}
for(const text of ['Victor', 'Cliente 11986495346', 'Victor\n'+phone, phone+'\n3 participantes', phone+'\nGroup info', phone+' / +55 11 99999-9999']){
  const f=fixture({title:false,text});assert.equal(adapter.read(f.doc).phone,'',text);
}
// An old title must not override a newly rendered contact name.
assert.equal(adapter.read(fixture({text:'João'}).doc).phone,'');
const fallback=fixture({legacy:false,title:false});
fallback.doc.querySelectorAll=()=>[];
assert.equal(adapter.read(fallback.doc).phone,'','no composer means no inferred conversation');
const multiple=fixture({legacy:false,title:false});
multiple.doc.querySelectorAll=()=>[multiple.editor,{...multiple.editor}];
assert.equal(adapter.read(multiple.doc).phone,'','ambiguous composers');
const headers=fixture({legacy:false,title:false});
headers.root.querySelectorAll=s=>s==='header'?[headers.header,{...headers.header}]:[headers.editor];
assert.equal(adapter.read(headers.doc).phone,'','ambiguous headers');
const hidden=fixture();hidden.header.getClientRects=()=>[];
assert.equal(adapter.read(hidden.doc).phone,'','hidden headers');
const sidebar=fixture({legacy:false,title:false});sidebar.root.matches=()=>true;
assert.equal(adapter.read(sidebar.doc).phone,'','sidebar is not the conversation');
console.log('PASS: telefone sem title/#main, Unicode, nomes e grupos, cabeçalhos ambíguos, troca de conversa e rascunho preservado; somente inserção, sem envio.');
