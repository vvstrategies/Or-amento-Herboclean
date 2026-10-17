(()=>{
  let current={id:crypto.randomUUID(),name:'',phone:'',header:null},timer;
  const publicContext=()=>({id:current.id,name:current.name,phone:current.phone});
  function read(force=false){const found=HerbocleanAdapter.read();if(force||found.root!==current.root||found.header!==current.header||found.name!==current.name||found.phone!==current.phone){current={...found,id:crypto.randomUUID()};chrome.runtime.sendMessage({type:'herbo:context',context:publicContext()}).catch(()=>{});}return publicContext()}
  // Even two chats with identical display names invalidate the previous generation.
  document.addEventListener('pointerdown',e=>{if(e.target.closest('#pane-side')){current={id:crypto.randomUUID(),name:'',phone:'',header:null};chrome.runtime.sendMessage({type:'herbo:context',context:publicContext()}).catch(()=>{});}},true);
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>read(),180)}).observe(document.body,{childList:true,subtree:true,characterData:true});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('sidepanel.html')))return;
    if(message?.type==='herbo:read'){reply({context:read()});return}
    if(message?.type==='herbo:prepare'){read();reply(HerbocleanAdapter.prepare(message,current));}
  });
  read();
})();
