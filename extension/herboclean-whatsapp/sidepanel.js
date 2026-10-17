// This pilot is deliberately bound to localhost. No production endpoint or credentials.
const APP='http://localhost:3310',frame=document.getElementById('panel'),status=document.getElementById('status');
const tabId=Number(new URLSearchParams(location.search).get('tab'));let latest=null,ready=false;
frame.src=APP+'/painel';
function relay(context){latest=context;if(ready)frame.contentWindow.postMessage({type:'herbo:context',context},APP)}
chrome.runtime.onMessage.addListener((message,sender)=>{if(sender.id!==chrome.runtime.id||sender.tab?.id!==tabId||!sender.url?.startsWith('https://web.whatsapp.com/')||message?.type!=='herbo:context')return;relay(message.context)});
async function refresh(){if(!Number.isInteger(tabId)||!tabId){status.textContent='Abra o WhatsApp Web e clique no ícone da extensão.';return}try{const data=await chrome.tabs.sendMessage(tabId,{type:'herbo:read'});if(data?.context){relay(data.context);status.textContent='Piloto local · envio manual · número de teste'}}catch{status.textContent='Recarregue a aba do WhatsApp Web e abra a extensão novamente.';relay({id:crypto.randomUUID(),name:'Conversa indisponível',phone:''})}}
window.addEventListener('message',async event=>{
  if(event.source!==frame.contentWindow||event.origin!==APP)return;const m=event.data;
  if(m?.type==='herbo:ready'){ready=true;if(latest)relay(latest);await refresh();return}
  if(m?.type!=='herbo:prepare'||typeof m.requestId!=='string'||m.requestId.length>80||typeof m.text!=='string'||!m.text.trim()||m.text.length>8000||!latest?.phone||m.phone!=='5511986495346'||m.phone!==latest.phone||m.contextId!==latest.id)return;
  let result;try{result=await chrome.tabs.sendMessage(tabId,{type:'herbo:prepare',contextId:m.contextId,phone:m.phone,text:m.text})}catch{result={ok:false,error:'A aba do WhatsApp está indisponível.'}}
  frame.contentWindow.postMessage({type:'herbo:prepared',requestId:m.requestId,ok:result?.ok===true,error:result?.error},APP);
});
refresh();setInterval(refresh,1500);
