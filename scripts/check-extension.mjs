import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Chrome API contract test. It does not claim a real-browser installation.
const source=fs.readFileSync('extension/herboclean-whatsapp/worker.js','utf8');
function fixture({rejectQuery=false}={}){
  const options=new Map(),errors=[],listeners={},behavior={};
  const event=name=>({addListener(fn){listeners[name]=fn}});
  const chrome={
    action:{onClicked:{addListener(){throw Error('Do not put asynchronous open() logic in the toolbar handler.')}}},
    runtime:{onInstalled:event('installed'),onStartup:event('startup')},
    tabs:{query:async()=>{if(rejectQuery)throw Error('query failed');return [{id:17,url:'https://web.whatsapp.com/'},{id:18,url:'http://localhost:3310/painel'},{id:19}];},onUpdated:event('updated')},
    sidePanel:{
      setPanelBehavior:async value=>Object.assign(behavior,value),
      setOptions:async value=>options.set(value.tabId,value),
      open(){throw Error('Manual sidePanel.open must not be needed.');}
    }
  };
  vm.runInNewContext(source,{chrome,console:{error:(...args)=>errors.push(args)}});
  return {options,errors,listeners,behavior};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const f=fixture();await settle();
assert.equal(f.behavior.openPanelOnActionClick,true);
assert.equal(f.options.get(17).path,'sidepanel.html?tab=17');
assert.equal(f.options.get(17).enabled,true);
assert.equal(f.options.get(18).path,'sidepanel.html');
assert.equal(f.options.get(18).enabled,true);
assert.equal(f.options.get(19).path,'sidepanel.html');
assert.equal(f.errors.length,0);
// Existing tabs on reload/startup, new WhatsApp tabs, navigation away and back.
f.options.clear();await f.listeners.installed();assert.equal(f.options.get(17).enabled,true);
f.options.clear();await f.listeners.startup();assert.equal(f.options.get(17).path,'sidepanel.html?tab=17');
f.listeners.updated(20,{status:'complete'},{url:'https://web.whatsapp.com/'});await settle();assert.equal(f.options.get(20).path,'sidepanel.html?tab=20');
f.listeners.updated(17,{url:'https://example.com/'},{url:'https://example.com/'});await settle();assert.equal(f.options.get(17).path,'sidepanel.html');
f.listeners.updated(17,{url:'https://web.whatsapp.com/'},{url:'https://web.whatsapp.com/'});await settle();assert.equal(f.options.get(17).path,'sidepanel.html?tab=17');
const failed=fixture({rejectQuery:true});await settle();assert.equal(failed.behavior.openPanelOnActionClick,true);assert.equal(failed.errors.length,1);
const manifest=JSON.parse(fs.readFileSync('extension/herboclean-whatsapp/manifest.json','utf8'));
assert.deepEqual(manifest.permissions,['sidePanel']);assert.deepEqual(manifest.host_permissions,['https://web.whatsapp.com/*']);assert.equal(manifest.version,'0.1.2');
console.log('PASS: abertura nativa pelo ícone sem perda de gesto, abas já abertas, recarga, reinício, navegação, falhas tratadas e permissões inalteradas.');
