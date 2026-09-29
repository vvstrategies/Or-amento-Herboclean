import crypto from 'node:crypto';
import {API_VERSIONS,account,scaled,microsToCents,integrationError,dayRange} from './integration-domain.js';
import {externalJSON} from './integration-http.js';
export class AdSpendProvider{
 constructor(id,config={},fetcher=fetch){this.id=id;this.config=config;this.fetcher=fetcher;this.transport=config.transport||{};}
 get configured(){return !!(this.config.clientId&&this.config.clientSecret&&this.config.redirectURI);}
 async request(url,options,op,retry=true){return externalJSON(this.fetcher,url,options,this.id+':'+op,{...this.transport,retry});}
 getConnectionStatus(tokens){return {configured:this.configured,authorized:!!tokens};}
}
export class GoogleAdsProvider extends AdSpendProvider{
 constructor(config={},fetcher=fetch){super('google-ads',config,fetcher);this.version=config.version||API_VERSIONS.google;if(!/^v\d+$/.test(this.version))throw Error('GOOGLE_ADS_API_VERSION inválida.');this.base='https://googleads.googleapis.com/'+this.version;}
 authorizationURL(state,verifier){const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.config.redirectURI,response_type:'code',scope:'https://www.googleapis.com/auth/adwords',access_type:'offline',prompt:'consent',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});return url.href;}
 async token(fields){return this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,client_id:this.config.clientId,client_secret:this.config.clientSecret})},'token',false);}
 async exchange(code,verifier){const t=await this.token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:this.config.redirectURI});if(!String(t.scope).split(' ').includes('https://www.googleapis.com/auth/adwords')||!t.refresh_token||!t.access_token||!Number.isFinite(Number(t.expires_in))||Number(t.expires_in)<=0)throw integrationError('ACCESS_DENIED');return {accessToken:t.access_token,refreshToken:t.refresh_token,expires:Date.now()+Number(t.expires_in)*1000};}
 async refresh(tokens){const t=await this.token({grant_type:'refresh_token',refresh_token:tokens.refreshToken});if(!t.access_token||!Number.isFinite(Number(t.expires_in))||Number(t.expires_in)<=0)throw integrationError('RECONNECT');return {...tokens,accessToken:t.access_token,expires:Date.now()+Number(t.expires_in)*1000};}
 headers(token,managerId){return {Authorization:'Bearer '+token,'Content-Type':'application/json',...(managerId?{'login-customer-id':managerId}:{})};}
 async search(token,id,query,managerId){
 if(!/^\d{1,30}$/.test(id)||managerId&&!/^\d{1,30}$/.test(managerId))throw integrationError('INVALID_DATA');
 const rows=[],seen=new Set();let pageToken;
 do{const b=await this.request(this.base+'/customers/'+id+'/googleAds:search',{method:'POST',headers:this.headers(token,managerId),body:JSON.stringify({query,...(pageToken?{pageToken}:{})})},'search');
 if(!Array.isArray(b.results||[]))throw integrationError('INVALID_DATA');rows.push(...(b.results||[]));pageToken=b.nextPageToken;
 if(pageToken&&seen.has(pageToken)||seen.size>=100||rows.length>100000)throw integrationError('PAGINATION');if(pageToken)seen.add(pageToken);
 }while(pageToken);return rows;
 }
 async listAccounts(token){
 const b=await this.request(this.base+'/customers:listAccessibleCustomers',{headers:this.headers(token)},'accounts'),out=[],resources=b.resourceNames||[];if(!Array.isArray(resources))throw integrationError('INVALID_DATA');if(resources.length>100)throw integrationError('PAGINATION');
 for(const resource of resources){const id=String(resource).replace(/^customers\//,'');
 const self=(await this.search(token,id,'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1'))[0]?.customer;
 if(!self)continue;
 if(self.manager){
 const clients=await this.search(token,id,'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager FROM customer_client',id);
 for(const {customerClient:c} of clients)if(c&&!c.manager)out.push(account({id:String(c.id),name:c.descriptiveName,currency:c.currencyCode,timezone:c.timeZone,managerId:id}));
 }else out.push(account({id:String(self.id),name:self.descriptiveName,currency:self.currencyCode,timezone:self.timeZone}));
 }return [...new Map(out.map(a=>[a.id+':'+(a.managerId||''),a])).values()];
 }
 async testConnection(token,a){const c=(await this.search(token,a.id,'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1',a.managerId))[0]?.customer;if(!c)throw integrationError('SELECT_ACCOUNT');return account({id:String(c.id),name:c.descriptiveName,currency:c.currencyCode,timezone:c.timeZone,managerId:a.managerId});}
 async syncSpend(token,a,from,to){dayRange(from,to);const rows=await this.search(token,a.id,"SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '"+from+"' AND '"+to+"'",a.managerId);
 return rows.map(r=>({externalAccountId:a.id,date:r.segments?.date,campaignId:String(r.campaign?.id),campaignName:r.campaign?.name,currency:a.currency,spendCents:microsToCents(r.metrics?.costMicros??'0'),impressions:r.metrics?.impressions??0,clicks:r.metrics?.clicks??0,platformConversions:r.metrics?.conversions==null?null:String(r.metrics.conversions),platformConversionValueCents:r.metrics?.conversionsValue==null?null:scaled(r.metrics.conversionsValue)}));}
 async disconnect(tokens){try{await this.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refreshToken})},'revoke',false);return true;}catch{return false;}}
}
export class MetaAdsProvider extends AdSpendProvider{
 constructor(config={},fetcher=fetch){super('meta-ads',config,fetcher);this.version=config.version||API_VERSIONS.meta;if(!/^v\d+\.0$/.test(this.version))throw Error('META_API_VERSION inválida.');this.base='https://graph.facebook.com/'+this.version;}
 authorizationURL(state){return 'https://www.facebook.com/'+this.version+'/dialog/oauth?'+new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.config.redirectURI,response_type:'code',scope:'ads_read',state});}
 async token(fields){return this.request(this.base+'/oauth/access_token?'+new URLSearchParams({...fields,client_id:this.config.clientId,client_secret:this.config.clientSecret}),{},'token',false);}
 async exchange(code){const short=await this.token({code,redirect_uri:this.config.redirectURI});if(!short.access_token)throw integrationError('ACCESS_DENIED');const t=await this.token({grant_type:'fb_exchange_token',fb_exchange_token:short.access_token});if(!t.access_token||(!Number.isFinite(Number(t.expires_in))||Number(t.expires_in)<=0))throw integrationError('INVALID_DATA');
 const permissions=await this.get(t.access_token,'me/permissions',{});if(!permissions.data?.some(p=>p.permission==='ads_read'&&p.status==='granted'))throw integrationError('ACCESS_DENIED');return {accessToken:t.access_token,expires:Date.now()+Number(t.expires_in)*1000};}
 async refresh(){throw integrationError('RECONNECT');}
 async get(token,path,params={},method='GET'){const url=this.base+'/'+path+'?'+new URLSearchParams({...params,appsecret_proof:crypto.createHmac('sha256',this.config.clientSecret).update(token).digest('hex')});return this.request(url,{method,headers:{Authorization:'Bearer '+token}},'read');}
 async pages(token,path,params){let after;const rows=[],seen=new Set();do{const b=await this.get(token,path,{...params,limit:'500',...(after?{after}:{})});if(!Array.isArray(b.data))throw integrationError('INVALID_DATA');rows.push(...b.data);
 after=b.paging?.next?b.paging?.cursors?.after:null;if(b.paging?.next&&!after||after&&seen.has(after)||seen.size>=100||rows.length>100000)throw integrationError('PAGINATION');if(after)seen.add(after);
 }while(after);return rows;}
 async listAccounts(token){return (await this.pages(token,'me/adaccounts',{fields:'account_id,name,currency,timezone_name'})).map(c=>account({id:c.account_id,name:c.name,currency:c.currency,timezone:c.timezone_name}));}
 async testConnection(token,a){const c=await this.get(token,'act_'+a.id,{fields:'account_id,name,currency,timezone_name'});return account({id:c.account_id,name:c.name,currency:c.currency,timezone:c.timezone_name});}
 async syncSpend(token,a,from,to){dayRange(from,to);const rows=await this.pages(token,'act_'+a.id+'/insights',{fields:'date_start,campaign_id,campaign_name,account_currency,spend,impressions,clicks',level:'campaign',time_increment:'1',time_range:JSON.stringify({since:from,until:to})});
 return rows.map(r=>({externalAccountId:a.id,date:r.date_start,campaignId:String(r.campaign_id),campaignName:r.campaign_name,currency:r.account_currency||a.currency,spendCents:scaled(r.spend),impressions:r.impressions??null,clicks:r.clicks??null,platformConversions:null,platformConversionValueCents:null}));}
 async disconnect(tokens){try{await this.get(tokens.accessToken,'me/permissions',{},'DELETE');return true;}catch{return false;}}
}
