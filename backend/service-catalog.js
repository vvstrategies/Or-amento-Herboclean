import {modelo} from '../utils/proposta.js';
const U=globalThis.UniversalCompany;
const generic=services=>services?.length===1&&services[0].name==='Serviço'&&services[0].unit==='un.'&&!services[0].description;
export function migrateServiceCatalog(repo){
 const marker='cleaning-service-catalog-v1';
 if(repo.config(marker))return;
 repo.transaction(()=>{
  const settings=repo.config('settings'),setup=repo.config('companySetupDraft'),draft=repo.config('draft');
  repo.setConfig('before-cleaning-service-catalog-v1',{settings,setup,draft});
  for(const [key,value] of [['settings',settings],['companySetupDraft',setup]]){
   if(!value)continue;
   const current=generic(value.services)?[]:U.catalog(value.services),defaults=U.defaultServices();
   // Preserve custom services and descriptions; apply the requested units to the preset services.
   value.services=defaults.map(s=>({...s,...current.find(c=>c.name===s.name),unit:s.unit}));
   value.services.push(...current.filter(c=>!defaults.some(s=>s.name===c.name)));
   repo.setConfig(key,value);
  }
  // Only replace the old empty placeholder in a draft; issued proposals remain untouched.
  if(draft?.quote?.items?.length===1){
   const item=draft.quote.items[0];
   if(item.service==='Serviço'&&!item.description&&item.price===''&&!item.photos?.length&&!draft.quote.client&&!draft.quote.address){
    const preset=U.defaultServices()[0];Object.assign(item,{service:preset.name,unit:preset.unit,description:preset.description});repo.setConfig('draft',draft);
   }
  }
  repo.setConfig(marker,true);
 });
}
