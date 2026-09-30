import {fail} from './database.js';

export const normalizePostalCode=value=>String(value??'').replace(/\D/g,'');
const text=(value,max=240)=>typeof value==='string'?value.trim().slice(0,max):'';
const complete=(value,provider)=>{
  const postalCode=normalizePostalCode(value.postalCode);
  if(!/^\d{8}$/.test(postalCode))return null;
  const result={postalCode,street:text(value.street),neighborhood:text(value.neighborhood),city:text(value.city),state:text(value.state,2).toUpperCase(),ibgeCode:text(value.ibgeCode,16),provider};
  return result.street||result.neighborhood||result.city||result.state?result:null;
};
const request=async(fetcher,url)=>{
  let response;
  try{response=await fetcher(url,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});}catch{return {kind:'unavailable'};}
  if(response.status===404)return {kind:'missing'};
  if(!response.ok)return {kind:'unavailable'};
  try{return {kind:'ok',body:await response.json()};}catch{return {kind:'unavailable'};}
};

/** Address registry contract. Providers only receive one CEP typed in the form. */
export class CepLookupProvider{
  constructor(){this.id='manual';}
  async lookup(){throw fail(503,'Consulta de CEP indisponível.');}
}

export class BrasilApiCepProvider extends CepLookupProvider{
  constructor({fetcher=globalThis.fetch}={}){super();this.id='brasilapi';this.fetcher=fetcher;}
  async lookup(postalCode){
    const code=normalizePostalCode(postalCode);if(!/^\d{8}$/.test(code))throw fail(400,'Informe um CEP com 8 dígitos.');
    const response=await request(this.fetcher,`https://brasilapi.com.br/api/cep/v1/${code}`);
    if(response.kind!=='ok')return response;
    const value=complete({postalCode:response.body?.cep||code,street:response.body?.street,neighborhood:response.body?.neighborhood,city:response.body?.city,state:response.body?.state,ibgeCode:response.body?.ibge},this.id);
    return value?{kind:'ok',value}:{kind:'missing'};
  }
}

export class ViaCepProvider extends CepLookupProvider{
  constructor({fetcher=globalThis.fetch}={}){super();this.id='viacep';this.fetcher=fetcher;}
  async lookup(postalCode){
    const code=normalizePostalCode(postalCode);if(!/^\d{8}$/.test(code))throw fail(400,'Informe um CEP com 8 dígitos.');
    const response=await request(this.fetcher,`https://viacep.com.br/ws/${code}/json/`);
    if(response.kind!=='ok'||response.body?.erro)return response.kind==='unavailable'?response:{kind:'missing'};
    const value=complete({postalCode:response.body?.cep||code,street:response.body?.logradouro,neighborhood:response.body?.bairro,city:response.body?.localidade,state:response.body?.uf,ibgeCode:response.body?.ibge},this.id);
    return value?{kind:'ok',value}:{kind:'missing'};
  }
}
