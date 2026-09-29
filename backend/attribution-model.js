import {fail} from './database.js';
import {text} from './dre-domain.js';
/** Reserved private model. No automatic attribution or revenue calculation in this phase. */
export function attributionInput(raw={}){
 if(raw.provider!=null&&!['google-ads','meta-ads','manual'].includes(raw.provider))throw fail(400,'Origem de atribuição inválida.');
 const fields=['campaignId','campaignName','source','medium','utm_source','utm_medium','utm_campaign','utm_id','gclid','gbraid','wbraid','fbclid'];
 return {provider:raw.provider||null,...Object.fromEntries(fields.map(k=>[k,text(raw[k],k.endsWith('clid')||k.endsWith('braid')?1000:240)||null])),verified:false};
}
