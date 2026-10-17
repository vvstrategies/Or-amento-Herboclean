// Let Chrome handle the toolbar gesture directly. Awaiting setOptions inside
// onClicked loses transient user activation on some Chrome versions.
const report=error=>console.error('Herboclean: não foi possível configurar o painel.',error);
function configureTab(tab){
  if(!Number.isInteger(tab.id))return Promise.resolve();
  const whatsapp=tab.url?.startsWith('https://web.whatsapp.com/');
  return chrome.sidePanel.setOptions({tabId:tab.id,path:whatsapp?'sidepanel.html?tab='+tab.id:'sidepanel.html',enabled:true}).catch(report);
}
async function configure(){
  try{
    await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
    // Includes WhatsApp tabs already open when the extension is loaded/reloaded.
    await Promise.all((await chrome.tabs.query({})).map(configureTab));
  }catch(error){report(error)}
}
chrome.runtime.onInstalled.addListener(configure);
chrome.runtime.onStartup.addListener(configure);
chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(change.url||change.status==='complete')configureTab({...tab,id});});
configure();
