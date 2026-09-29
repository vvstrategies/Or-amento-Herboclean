import {fail} from './database.js';
import {date,month,months,text,sum} from './dre-domain.js';
export const providers=['google-ads','meta-ads'];
export const API_VERSIONS={google:'v25',meta:'v26.0'};
const messages={
 NOT_CONFIGURED:'Integração não configurada no servidor.',NOT_CONNECTED:'Conecte a conta para continuar.',RECONNECT:'A autorização expirou ou foi revogada. Reconecte a conta.',ACCESS_DENIED:'A conta não autorizou as permissões necessárias.',PROJECT_ACCESS:'Confira o acesso à Google Ads API no projeto Google Cloud.',QUOTA:'Limite da plataforma atingido. Aguarde antes de tentar novamente.',TIMEOUT:'A plataforma demorou a responder. Tente mais tarde.',EXTERNAL:'Não foi possível consultar a plataforma. Os dados anteriores foram preservados.',INVALID_DATA:'A plataforma retornou dados incompletos ou incompatíveis.',API_DISABLED:'Ative a API no projeto Google Cloud.',BILLING:'Confira o faturamento do projeto Google Cloud.',INVALID_KEY:'Confira a chave e as restrições da API no servidor.',INVALID_ADDRESS:'Confira os endereços de origem e destino.',AMBIGUOUS_ADDRESS:'O endereço retornou mais de uma localização possível. Revise o endereço ou informe a distância manualmente.',NO_ROUTE:'Nenhuma rota encontrada. Informe a distância manualmente.',CURRENCY:'Moeda incompatível com a DRE em BRL. O histórico permanece na moeda original.',SELECT_ACCOUNT:'Selecione uma conta de anúncios.',PAGINATION:'A consulta excedeu o limite seguro. Selecione um período menor.',INTERRUPTED:'A sincronização anterior foi interrompida. Pode tentar novamente.',REVOCATION_SHARED:'Acesso local removido. A revogação no Google ficou manual para preservar a outra integração conectada.',REVOKE_FAILED:'O acesso local foi removido, mas a revogação externa não foi confirmada. Revogue nas configurações da plataforma.'};
export function integrationError(code,status=502){return Object.assign(fail(status,messages[code]||messages.EXTERNAL),{integrationCode:Object.hasOwn(messages,code)?code:'EXTERNAL'});}
export function errorCode(error){return Object.hasOwn(messages,error?.integrationCode)?error.integrationCode:'EXTERNAL';}
export const message=code=>messages[code]||null;
export function providerId(v){if(!providers.includes(v))throw fail(400,'Integração inválida.');return v;}
export function dayRange(from,to,maxDays=90){date(from,false);date(to,false);const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;if(days<1||days>maxDays)throw fail(400,'Selecione entre 1 e '+maxDays+' dias.');return {from,to,days};}
export function shiftDay(day,offset){return new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);}
export function accountDay(timezone,at=new Date()){try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at)}catch{throw integrationError('INVALID_DATA');}}
export function scaled(value,digits=2){
 const s=String(value??'');if(!/^\d+(\.\d+)?$/.test(s))throw integrationError('INVALID_DATA');
 const [whole,frac='']=s.split('.'),base=BigInt(whole)*10n**BigInt(digits),padded=frac.padEnd(digits+1,'0'),n=base+BigInt(padded.slice(0,digits)||'0')+(Number(padded[digits])>=5?1n:0n);
 if(n>1000000000000n)throw integrationError('INVALID_DATA');return Number(n);
}
export function microsToCents(v){if(!/^\d+$/.test(String(v)))throw integrationError('INVALID_DATA');const n=(BigInt(v)+5000n)/10000n;if(n>1000000000000n)throw integrationError('INVALID_DATA');return Number(n);}
export function count(v){if(v==null)return null;const s=String(v);if(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s)))throw integrationError('INVALID_DATA');return Number(s);}
export function account(raw){
 const id=String(raw.id||'');if(!/^\d{1,30}$/.test(id)||! /^[A-Z]{3}$/.test(raw.currency||''))throw integrationError('INVALID_DATA');
 const timezone=text(raw.timezone,100);accountDay(timezone||'INVALID');
 return {id,name:text(raw.name,240)||id,currency:raw.currency,timezone,managerId:raw.managerId?String(raw.managerId):null};
}
export function metric(raw,provider,selected){
 const id=String(raw.campaignId||'');if(!/^\d{1,40}$/.test(id))throw integrationError('INVALID_DATA');date(raw.date,false);
 if(raw.currency!==selected.currency||raw.externalAccountId!==selected.id)throw integrationError('INVALID_DATA');
 for(const k of ['spendCents','platformConversionValueCents'])if(raw[k]!=null&&(!Number.isSafeInteger(raw[k])||raw[k]<0||raw[k]>1e12))throw integrationError('INVALID_DATA');
 if(raw.spendCents==null)throw integrationError('INVALID_DATA');
 const conversions=raw.platformConversions==null?null:String(raw.platformConversions);if(conversions!==null&&!/^\d+(\.\d+)?$/.test(conversions))throw integrationError('INVALID_DATA');
 return {provider,date:raw.date,externalAccountId:selected.id,accountName:selected.name,campaignId:id,campaignName:text(raw.campaignName,240)||id,currency:selected.currency,spendCents:raw.spendCents,impressions:count(raw.impressions),clicks:count(raw.clicks),platformConversions:conversions,platformConversionValueCents:raw.platformConversionValueCents??null,timezone:selected.timezone};
}
export function monthlyBounds(from,to){months(from,to);return {from:from+'-01',to:shiftDay(to==='2099-12'?'2100-01-01':new Date(Date.UTC(Number(to.slice(0,4)),Number(to.slice(5)),1)).toISOString().slice(0,10),-1)};}
export function marketingSummary(rows){
 const currencies=[...new Set(rows.map(r=>r.currency))],byCurrency=currencies.map(currency=>({currency,spendCents:sum(rows.filter(r=>r.currency===currency).map(r=>r.spendCents))}));
 return {spendCents:sum(rows.filter(r=>r.currency==='BRL').map(r=>r.spendCents)),currency:'BRL',excludedCurrencies:byCurrency.filter(r=>r.currency!=='BRL'),impressions:rows.some(r=>r.impressions===null)?null:sum(rows.map(r=>r.impressions)),clicks:rows.some(r=>r.clicks===null)?null:sum(rows.map(r=>r.clicks)),recordCount:rows.length};
}
