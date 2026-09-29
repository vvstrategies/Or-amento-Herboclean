import {integrationError} from './integration-domain.js';
export async function externalJSON(fetcher,url,options={},operation='read',{retry=true,sleep=ms=>new Promise(r=>setTimeout(r,ms)),log=()=>{}}={}){
 const started=Date.now();for(let attempt=0;attempt<3;attempt++){
 let response;try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});}catch(error){const code=['TimeoutError','AbortError'].includes(error.name)?'TIMEOUT':'EXTERNAL';log({operation,status:code,durationMs:Date.now()-started});throw integrationError(code);}
 let body;try{body=await response.json();}catch{if(response.ok&&operation!=='google-ads:revoke')throw integrationError('INVALID_DATA');body={};}if(!body||typeof body!=='object')throw integrationError('INVALID_DATA');if(response.ok&&!body.error){log({operation,status:'ok',durationMs:Date.now()-started});return body;}
 const raw=JSON.stringify(body.error||{}),meta=body.error?.code;
 let code=response.status===429||[4,17,32,613,80004].includes(meta)?'QUOTA':response.status===401||meta===190||body.error==='invalid_grant'?'RECONNECT':/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|ACTION_NOT_PERMITTED/.test(raw)?'PROJECT_ACCESS':response.status===403||[10,200].includes(meta)?'ACCESS_DENIED':'EXTERNAL';
 if(retry&&attempt<2&&(code==='QUOTA'||response.status>=500)){
 const seconds=Number(response.headers?.get?.('retry-after'));if(seconds>5)throw integrationError(code,429);
 await sleep(Math.max((attempt+1)*500,Number.isFinite(seconds)?seconds*1000:0));continue;
 }
 log({operation,status:code,durationMs:Date.now()-started});throw integrationError(code,code==='QUOTA'?429:502);
 }
}
