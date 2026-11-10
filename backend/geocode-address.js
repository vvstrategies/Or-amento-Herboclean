// Normaliza endereços brasileiros e escolhe o melhor resultado do Pelias.
// Usado só no servidor; nada aqui chama a rede.

export const GEOCODER_VERSION=2;

const UF=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const ABBREVIATIONS=[
 [/^(?:r)\.?\s+/i,'Rua '],[/^(?:av|avd)\.?\s+/i,'Avenida '],[/^(?:al)\.?\s+/i,'Alameda '],[/^(?:estr|est)\.?\s+/i,'Estrada '],
 [/^(?:rod)\.?\s+/i,'Rodovia '],[/^(?:tv|trav)\.?\s+/i,'Travessa '],[/^(?:pc|pç|pca|pça)\.?\s+/i,'Praça '],[/^(?:lgo|lg)\.?\s+/i,'Largo '],
 [/^(?:vl)\.?\s+/i,'Vila '],[/^(?:jd|jrd)\.?\s+/i,'Jardim '],[/^(?:pq|prq)\.?\s+/i,'Parque '],[/^(?:vd)\.?\s+/i,'Viaduto '],
];
const TITLES=[[/\b(?:dr)\.?\s+/gi,'Doutor '],[/\b(?:prof)\.?\s+/gi,'Professor '],[/\b(?:eng)\.?\s+/gi,'Engenheiro '],[/\b(?:cel)\.?\s+/gi,'Coronel '],[/\b(?:gen)\.?\s+/gi,'General '],[/\b(?:pres)\.?\s+/gi,'Presidente '],[/\b(?:sta)\.?\s+/gi,'Santa '],[/\b(?:sto)\.?\s+/gi,'Santo '],[/\b(?:n\.?\s*s\.?(?:ra)?)\.?\s+/gi,'Nossa Senhora ']];
const COMPLEMENT=/^(?:casa|cs|apto?|apartamento|ap|bloco|bl|sala|sl|fundos|frente|cj|conjunto|lote|lt|quadra|qd|andar|torre|loja|galp[aã]o|sobrado|kitnet|edif[ií]cio|ed|condom[ií]nio|cond)\b/i;
const POSTAL=/^\d{5}-?\d{3}$/;

export const fold=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const expand=(value,list)=>list.reduce((text,[pattern,replacement])=>text.replace(pattern,replacement),value);
export const expandStreet=value=>expand(expand(clean(value),ABBREVIATIONS),TITLES).replace(/\s+/g,' ').trim();

/** Lê "Rua X, 12 - casa, Bairro, Cidade - UF, 00000-000, Brasil" e também "Rua X, 342- Bairro, Cidade- SP". */
export function parseAddress(text){
 const raw=clean(text).replace(/(\d)\s*-\s*(?=\p{L})/gu,'$1 - ');
 let parts=raw.split(',').map(clean).filter(Boolean).filter(part=>!/^(brasil|brazil)$/i.test(part));
 const out={street:'',number:'',complement:'',neighborhood:'',city:'',state:'',postalCode:''};
 parts=parts.filter(part=>{if(POSTAL.test(part)){out.postalCode=part.replace(/\D/g,'').replace(/^(\d{5})(\d{3})$/,'$1-$2');return false;}return true;});
 for(let i=parts.length-1;i>=0;i--){
  const match=/^(.+?)\s*[-–/]\s*([A-Za-z]{2})$/.exec(parts[i]);
  if(match&&UF.has(match[2].toUpperCase())&&/^\D/.test(match[1])){out.city=clean(match[1]);out.state=match[2].toUpperCase();parts.splice(i,1);break;}
  if(UF.has(parts[i].toUpperCase())&&i>0&&/^\D/.test(parts[i-1])){out.state=parts[i].toUpperCase();out.city=parts[i-1];parts.splice(i-1,2);break;}
 }
 if(parts.length){
  const first=parts.shift();
  // "Rua Itú 45 apto 12": rua até o primeiro número. "Rua 25 de Março" fica intacta (só uma palavra antes do número).
  const inline=/^([^\d]+?)\s+(?:n[º°o.]?\s*)?(\d+[a-z]?)(?:\s*[-–]?\s*(.*))?$/iu.exec(first);
  const rest=clean(inline?.[3]);
  if(inline&&inline[1].trim().split(/\s+/).length>=2&&(!rest||COMPLEMENT.test(rest))){out.street=clean(inline[1]);out.number=inline[2];if(rest)out.complement=rest;}
  else out.street=first;
 }
 if(parts.length&&/^(?:n[º°o.]?\s*)?\d/i.test(parts[0])){
  const value=parts.shift(),match=/^(?:n[º°o.]?\s*)?(\d+[a-z]?)\s*(?:[-–]\s*(.*))?$/i.exec(value)||[];
  out.number=match[1]||'';
  const rest=clean(match[2]);
  // "342 - Jardim Irene" sem outra parte depois: o resto é o bairro, não complemento.
  if(rest){if(!parts.length&&!COMPLEMENT.test(rest))out.neighborhood=rest;else out.complement=rest;}
 }
 while(parts.length&&COMPLEMENT.test(parts[0]))out.complement=clean([out.complement,parts.shift()].filter(Boolean).join(' '));
 if(parts.length)out.neighborhood=out.neighborhood||parts.pop();
 out.street=expandStreet(out.street);out.neighborhood=expandStreet(out.neighborhood);
 return out;
}

/** Texto que o Pelias entende melhor: sem complemento, com abreviações expandidas. */
export function searchText(parsed){
 const street=[parsed.street,parsed.number].filter(Boolean).join(', ');
 const city=parsed.city?parsed.city+(parsed.state?' - '+parsed.state:''):parsed.state;
 return [street,parsed.neighborhood,city,parsed.postalCode].filter(Boolean).join(', ');
}

const PRECISION={address:4,street:3,venue:3,neighbourhood:2,borough:2,macrohood:2,postalcode:2,locality:1,localadmin:1,county:1};
export const precisionOf=layer=>({4:'address',3:'street',2:'neighbourhood',1:'city'})[PRECISION[layer]||0]||'region';
const same=(a,b)=>!!a&&!!b&&(fold(a)===fold(b)||fold(a).includes(fold(b))||fold(b).includes(fold(a)));
const distance=(a,b)=>Math.hypot(a.longitude-b.longitude,a.latitude-b.latitude);

/** Pontua um candidato do Pelias pelo que o texto do endereço diz. */
export function scoreCandidate(candidate,parsed,{near=null}={}){
 const p=candidate.properties||{};
 let score=(PRECISION[p.layer]||0)*10+(Number.isFinite(candidate.confidence)?candidate.confidence*3:0);
 const city=p.locality||p.localadmin||p.county||'';
 if(parsed.city){if(same(city,parsed.city))score+=8;else if(city)score-=25;}
 if(parsed.state&&p.region_a){if(fold(p.region_a)===fold(parsed.state))score+=2;else score-=25;}
 if(parsed.neighborhood&&same(p.neighbourhood,parsed.neighborhood))score+=3;
 if(parsed.street&&p.street&&same(p.street,parsed.street))score+=4;
 if(parsed.number&&p.housenumber&&String(p.housenumber)===String(parsed.number))score+=2;
 if(parsed.postalCode&&p.postalcode&&String(p.postalcode).replace(/\D/g,'')===parsed.postalCode.replace(/\D/g,''))score+=2;
 if(p.match_type==='fallback')score-=2;
 // Desempate pela proximidade da sede (até 2 pontos, ~0,5° de alcance).
 if(near)score+=Math.max(0,2-distance(candidate.coordinates,near)*4);
 return score;
}

export function pickBest(candidates,parsed,options={}){
 return candidates.map(candidate=>({...candidate,score:scoreCandidate(candidate,parsed,options)})).sort((a,b)=>b.score-a.score)[0]||null;
}
