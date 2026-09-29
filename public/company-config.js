(function(root){
'use strict';
const defaultServices=()=>[["Limpeza de carpete","m²","Higienização de carpete na área indicada."],["Cadeiras estofadas","un.","Higienização de cadeiras estofadas."],["Colchão","un.","Higienização de colchão."],["Sofá","un.","Higienização de sofá."],["Poltronas","un.","Higienização de poltronas."],["Banco automotivo","un.","Higienização de banco automotivo."],["Tapete","m²","Higienização de tapete na área indicada."],["Persiana","un.","Limpeza de persiana."],["Cortinas","un.","Limpeza de cortinas."],["Impermeabilização","un.","Impermeabilização dos itens indicados."]].map(([name,unit,description])=>({name,unit,description}));
const defaults=()=>({name:'',phone:'',email:'',location:'',website:'',taxId:'',tagline:'',intro:'',benefits:'',logo:'',logoBackground:'light',useInitials:true,primaryColor:'#044c3a',accentColor:'#a7cf21',proposalTitle:'Proposta Técnica de Higienização',proposalSubtitle:'Higienização de Estofados e Carpetes',proposalPrefix:'ECO'});
const text=(v,n=240)=>typeof v==='string'?v.slice(0,n).trim():'';
const hex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
function normalize(raw={}){
 const c=defaults();
 for(const k of ['name','phone','email','location','website','taxId','tagline','intro','benefits','proposalTitle','proposalSubtitle','proposalPrefix'])if(typeof raw[k]==='string')c[k]=text(raw[k],['intro','benefits'].includes(k)?3000:240);
 c.proposalTitle=c.proposalTitle||'Proposta comercial';c.proposalPrefix=/^[a-z0-9-]{1,12}$/i.test(c.proposalPrefix)?c.proposalPrefix:'ORC';
 c.logo=typeof raw.logo==='string'&&raw.logo.length<4000000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.logo)?raw.logo:'';
 c.logoBackground=raw.logoBackground==='dark'?'dark':'light';c.useInitials=raw.useInitials!==false;
 for(const k of ['primaryColor','accentColor'])if(hex(raw[k]))c[k]=raw[k].toLowerCase();
 return c;
}
function catalog(raw){if(!Array.isArray(raw)||!raw.length)return defaultServices();return raw.slice(0,100).map(s=>({name:text(s.name),unit:s.unit==='m²'?'m²':'un.',description:text(s.description,1500)})).filter(s=>s.name)}
function validate(raw){
 if(!raw||typeof raw!=='object')throw Error('Preencha os dados da empresa.');
 for(const k of ['name','location'])if(!text(raw[k]))throw Error('Informe o nome e a localização da empresa.');
 if(!text(raw.phone)&&!text(raw.email))throw Error('Informe pelo menos um telefone ou e-mail para contato.');
 if(raw.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email))throw Error('Informe um e-mail válido.');
 if(raw.website){let u;try{u=new URL(raw.website)}catch{}if(!u||!['http:','https:'].includes(u.protocol))throw Error('Use um endereço de site ou rede social começando com https://.')}
 for(const k of ['primaryColor','accentColor'])if(!hex(raw[k]))throw Error('Escolha as cores da identidade.');
 const c=normalize(raw);if(raw.logo&&!c.logo)throw Error('Use um logo PNG, JPEG ou WebP de até 3 MB.');
 if(!c.logo&&!raw.useInitials)throw Error('Envie um logo ou escolha usar as iniciais da empresa.');
 if(!/^[a-z0-9-]{1,12}$/i.test(raw.proposalPrefix||'ORC'))throw Error('O prefixo deve ter até 12 letras, números ou hífens.');
 return c;
}
function mix(a,b,t){const channels=v=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));const aa=channels(a),bb=channels(b);return '#'+aa.map((v,i)=>Math.round(v+(bb[i]-v)*t).toString(16).padStart(2,'0')).join('')}
function theme(raw){const c=normalize(raw);return {green:c.primaryColor,deep:mix(c.primaryColor,'#000000',.48),lime:c.accentColor,limeText:mix(c.accentColor,'#000000',.3),paper:'#f8fafc',soft:mix(c.primaryColor,'#ffffff',.95),ink:'#17202e',muted:'#64748b',line:mix(c.primaryColor,'#ffffff',.85),highlight:mix(c.accentColor,'#ffffff',.68)}}
const initials=name=>String(name||'').trim()?String(name).trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase():'OU';
root.UniversalCompany={defaults,normalize,catalog,defaultServices,validate,theme,mix,initials};
})(globalThis);
