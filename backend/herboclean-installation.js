import {modelo} from '../utils/proposta.js';
// Adoption of the existing company. Never pass an established installation through the neutral reset.
export function adoptHerboclean(repo){
 if(repo.config('herboclean-product-upgrade-v1'))return;
 const prior=repo.config('settings');
 if(!prior?.company?.name||!(repo.config('adminPassword')||repo.list().length||repo.config('herboclean-brand-v1')))return;
 repo.transaction(()=>{
  if(repo.config('herboclean-product-upgrade-v1'))return;
  repo.setConfig('before-herboclean-product-upgrade-v1',{settings:prior,companySetup:repo.config('companySetup')});
  const c=prior.company;
  const company=modelo.normalizeCompany({...c,primaryColor:c.primaryColor||'#044c3a',accentColor:c.accentColor||'#a7cf21',proposalTitle:c.proposalTitle||'Proposta Técnica de Higienização',proposalSubtitle:c.proposalSubtitle||'Higienização de Estofados e Carpetes',proposalPrefix:c.proposalPrefix||'HERBO'});
  repo.setConfig('settings',{...prior,company,terms:prior.terms||modelo.terms(),services:prior.services||globalThis.UniversalCompany.defaultServices()});
  repo.setConfig('companySetup',{completed:true,completedAt:new Date().toISOString(),source:'existing-herboclean-installation'});
  repo.setConfig('universal-onboarding-v1',true);repo.setConfig('companySetupDraft',null);
  repo.setConfig('herboclean-product-upgrade-v1',true);
 });
}

// Prefixo da marca nas propostas novas: ECO (herdado) vira HBC uma única vez; números já emitidos não mudam.
export function adoptHbcPrefix(repo){
 if(repo.config('herboclean-prefix-hbc-v1'))return;
 const prior=repo.config('settings');
 repo.transaction(()=>{
  if(prior?.company?.proposalPrefix==='ECO')repo.setConfig('settings',{...prior,company:{...prior.company,proposalPrefix:'HBC'}});
  repo.setConfig('herboclean-prefix-hbc-v1',true);
 });
}

// Prefixo HERBO para os orçamentos novos desta instalação (ECO/HBC herdados viram HERBO uma única vez).
// Números já emitidos (ECO-..., HBC-...) não são alterados: PDFs, links, eventos e registros financeiros continuam válidos.
// Depois da migração, o prefixo segue editável em Configurações (company.proposalPrefix).
export const PROPOSAL_ID_PREFIX='HERBO';
export function adoptHerboPrefix(repo){
 if(repo.config('herboclean-prefix-herbo-v1'))return;
 const prior=repo.config('settings');
 repo.transaction(()=>{
  if(repo.config('herboclean-prefix-herbo-v1'))return;
  const old=prior?.company?.proposalPrefix;
  if(prior?.company&&['ECO','HBC'].includes(old)){
   const company={...prior.company,proposalPrefix:PROPOSAL_ID_PREFIX};repo.setConfig('settings',{...prior,company});
   // Rascunho ainda não salvo: o número não foi emitido, então pode nascer com o prefixo novo.
   const draft=repo.config('draft');
   if(draft?.quote&&!repo.proposal(draft.quote.id,{includeArchived:true})){
    const quote={...draft.quote};if(typeof quote.number==='string'&&quote.number.startsWith(old+'-'))quote.number=PROPOSAL_ID_PREFIX+quote.number.slice(old.length);
    if(quote.company?.proposalPrefix===old)quote.company={...quote.company,proposalPrefix:PROPOSAL_ID_PREFIX};
    repo.setConfig('draft',{...draft,quote});
   }
  }
  repo.setConfig('herboclean-prefix-herbo-v1',true);
 });
}

// Perfil do chip do menu: Gabriel · Herboclean, com a foto dele, aplicado uma única vez nesta instalação.
// Só quando ainda não existe perfil; depois disso, nome e foto são editáveis em Configurações › Empresa.
export function adoptHerbocleanProfile(repo,readPhoto){
 if(repo.config('herboclean-profile-v1'))return;
 const company=repo.config('settings')?.company;
 if(!/herboclean/i.test(company?.name||'')){if(company?.name)repo.setConfig('herboclean-profile-v1',true);return;}
 repo.transaction(()=>{
  if(!repo.config('user-profile'))repo.setConfig('user-profile',{name:'Gabriel',subtitle:'Herboclean',updatedAt:new Date().toISOString()});
  if(!repo.config('user-profile-photo')){const photo=readPhoto();if(photo)repo.setConfig('user-profile-photo',photo);}
  repo.setConfig('herboclean-profile-v1',true);
 });
}
