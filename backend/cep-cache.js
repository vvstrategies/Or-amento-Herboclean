import {fail} from './database.js';
import {normalizePostalCode,BrasilApiCepProvider,ViaCepProvider} from './cep-provider.js';

const parse=row=>row?JSON.parse(row.data):null;

/** Persistent CEP cache, intentionally independent from geocoding and route caches. */
export class CepLookupService{
  constructor(repo,{primary=new BrasilApiCepProvider(),fallback=new ViaCepProvider()}={}){this.repo=repo;this.primary=primary;this.fallback=fallback;this.pending=new Map();}
  cached(postalCode){return parse(this.repo.db.prepare('SELECT data FROM cep_lookups WHERE postal_code=?').get(postalCode));}
  save(value){const now=new Date().toISOString();this.repo.db.prepare('INSERT INTO cep_lookups (postal_code,data,provider,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(postal_code) DO UPDATE SET data=excluded.data,provider=excluded.provider,updated_at=excluded.updated_at').run(value.postalCode,JSON.stringify(value),value.provider,now,now);return value;}
  async lookup(raw){
    const postalCode=normalizePostalCode(raw);if(!/^\d{8}$/.test(postalCode))throw fail(400,'Informe um CEP com 8 dígitos.');
    const cached=this.cached(postalCode);if(cached)return {...cached,cached:true};
    if(this.pending.has(postalCode))return this.pending.get(postalCode);
    const task=(async()=>{
      const primary=await this.primary.lookup(postalCode);
      if(primary.kind==='ok')return {...this.save(primary.value),cached:false};
      const fallback=await this.fallback.lookup(postalCode);
      if(fallback.kind==='ok')return {...this.save(fallback.value),cached:false};
      if(primary.kind==='missing'||fallback.kind==='missing')throw fail(404,'CEP não encontrado. Preencha o endereço manualmente.');
      throw fail(503,'Não foi possível consultar este CEP. Preencha o endereço manualmente.');
    })();
    this.pending.set(postalCode,task);try{return await task}finally{this.pending.delete(postalCode);}
  }
}
