import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../backend/app.js';
import {passwordHash} from '../backend/security.js';
import {modelo} from '../utils/proposta.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'.tools','whatsapp-pilot'),origin='http://localhost:3310';
// Isolated data, no dotenv, no production tokens, no integration scheduler.
const system=createApp({chatPilot:true,origin,dataDir:dir,fetcher:async()=>{throw Error('Integrações externas desativadas no piloto local.')}});
if(!system.repo.config('whatsapp-pilot-seeded')){
  const settings={company:{...modelo.company(),name:'Herboclean Higienização Profissional',phone:'(11) 92612-6244',location:'Rua Dos Ciprestes, 342, Jardim Irene, Santo André - SP',primaryColor:'#044c3a',accentColor:'#a7cf21',proposalPrefix:'HBC',logo:'data:image/png;base64,'+fs.readFileSync(path.join(root,'public/assets/herboclean.png')).toString('base64')},terms:modelo.terms(),services:globalThis.UniversalCompany.defaultServices()};
  system.repo.setConfig('settings',settings);system.repo.setConfig('companySetup',{completed:true,source:'local-whatsapp-pilot'});
  system.repo.setConfig('adminPassword',await passwordHash('Legacy-disabled-local-'+crypto.randomUUID()));
  const users=[['Victor','victor'],['João','joao'],['Ronaldo','ronaldo'],['Kleber','kleber']],credentials=[];
  for(const [name,username] of users){const password='TesteLocal!'+crypto.randomUUID().slice(0,12);system.team.create({name,username},await passwordHash(password),'pilot-setup');credentials.push({name,username,password});}
  system.repo.setConfig('legacy-access-disabled',true);
  const q=modelo.quote(settings);Object.assign(q,{client:'Contato de teste',clientContact:'5511986495346',address:'Endereço fictício para teste local',origin:'organico',tags:['residencial']});q.items=[{...modelo.item('Sofá'),price:180}];const saved=system.repo.saveProposal(q);system.commercial.safeSync(saved);await system.service.pdf(saved);system.repo.setOperation({id:saved.id,status:'generated'});
  fs.writeFileSync(path.join(dir,'ACESSOS-LOCAIS.txt'),'ACESSOS EXCLUSIVOS DO LOCALHOST — dados fictícios; não usar em produção.\n\n'+credentials.map(c=>c.name+'\nUsuário: '+c.username+'\nSenha: '+c.password+'\n').join('\n'),{mode:0o600});
  system.repo.setConfig('whatsapp-pilot-seeded',true);
}
const server=system.app.listen(3310,'127.0.0.1',()=>{system.start();console.log('Atendimento nativo: '+origin+'/#atendimento\nPainel anterior e equipe: '+origin+'/painel\nAcessos locais: '+path.join(dir,'ACESSOS-LOCAIS.txt')+'\nSimulação local. Sem envio ao WhatsApp. Produção e Multilimp não foram alteradas.');});
server.on('error',error=>{console.error(error.message);system.repo.close();process.exitCode=1});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{system.repo.close();process.exit(0)}));
