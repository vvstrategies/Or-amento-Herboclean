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
  const company=modelo.normalizeCompany({...c,primaryColor:c.primaryColor||'#044c3a',accentColor:c.accentColor||'#a7cf21',proposalTitle:c.proposalTitle||'Proposta Técnica de Higienização',proposalSubtitle:c.proposalSubtitle||'Higienização de Estofados e Carpetes',proposalPrefix:c.proposalPrefix||'ECO'});
  repo.setConfig('settings',{...prior,company,terms:prior.terms||modelo.terms(),services:prior.services||globalThis.UniversalCompany.defaultServices()});
  repo.setConfig('companySetup',{completed:true,completedAt:new Date().toISOString(),source:'existing-herboclean-installation'});
  repo.setConfig('universal-onboarding-v1',true);repo.setConfig('companySetupDraft',null);
  repo.setConfig('herboclean-product-upgrade-v1',true);
 });
}
