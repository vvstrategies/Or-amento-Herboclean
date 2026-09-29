(function(root){
  root.EcoLocalStore=root.EcoStore;if(!EcoAuth.online)return;
  const A=EcoAuth,local=root.EcoLocalStore,emit=()=>root.dispatchEvent(new CustomEvent('eco:data-changed'));
  const route={quotes:'/api/proposals',operations:'/api/operations',pdfs:'/api/documents',draft:'/api/draft'};
  const all=name=>A.api(route[name]);
  const get=(name,id)=>A.api(name==='draft'?route.draft:route[name]+'/'+encodeURIComponent(id));
  async function put(name,value){const result=await A.api(name==='draft'?route.draft:route[name]+'/'+encodeURIComponent(value.id),{method:'PUT',body:JSON.stringify(value)});if(name==='quotes')emit();return result}
  async function mutateOperation(id,fn){const raw=(await all('operations')).find(o=>o.id===id)||{id,status:'generated'},next=fn(raw);const signature=o=>JSON.stringify(o.schedule?{start:o.schedule.start,end:o.schedule.end,eventId:o.schedule.eventId}:null);if(signature(next)!==signature(raw))throw Error('Use Aprovar e agendar para confirmar com o Google.');const result=await A.api('/api/proposals/'+id+'/status',{method:'POST',body:JSON.stringify({status:next.status})});emit();return result}
  const blob=p=>p.blob||A.api(p.url,{blob:true});
  root.EcoStore={ready:A.ready,all,get,put,fingerprint:local.fingerprint,pdfs:id=>A.api('/api/documents?proposalId='+encodeURIComponent(id)),mutateOperation,blob};
})(globalThis);
