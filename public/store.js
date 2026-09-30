(function(root){
  'use strict';
  // Adaptador local do checkpoint. A migração para o backend não altera o modelo do PDF.
  const ready=new Promise((resolve,reject)=>{
    const request=indexedDB.open('ecoclean-propostas',3);
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const name of ['quotes','draft','operations','pdfs'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});
      const pdfs=request.transaction.objectStore('pdfs');
      if(!pdfs.indexNames.contains('proposalId'))pdfs.createIndex('proposalId','proposalId');
    };
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Feche outras abas antigas do sistema e atualize esta página para preservar seus dados.'));
  });
  async function operation(store,mode,action){
    const db=await ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,mode);let result;
      try{result=action(tx.objectStore(store))}catch(error){tx.abort();reject(error);return}
      tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Não foi possível salvar.'));
    });
  }
  const get=(name,id)=>operation(name,'readonly',s=>s.get(id));
  const all=name=>operation(name,'readonly',s=>s.getAll());
  const put=(name,value)=>operation(name,'readwrite',s=>s.put(structuredClone(value)));
  const pdfs=id=>operation('pdfs','readonly',s=>s.index('proposalId').getAll(id));
  async function fingerprint(q){
    const {number,date,client,address,postalCode,addressStreet,addressNumber,addressComplement,addressNeighborhood,addressCity,addressState,addressIbgeCode,clientContact,company,terms}=q;
    const items=q.items.map(({service,description,unit,quantity,price,photos})=>({service,description,unit,quantity,price,photos}));
    const data=new TextEncoder().encode(JSON.stringify({number,date,client,address,postalCode,addressStreet,addressNumber,addressComplement,addressNeighborhood,addressCity,addressState,addressIbgeCode,clientContact,company,terms,items}));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function savePDF(q,blob,hash){
    if(!(blob instanceof Blob)||blob.type!=='application/pdf')throw Error('O documento recebido não é um PDF.');
    const db=await ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['pdfs','quotes'],'readwrite'),store=tx.objectStore('pdfs');let record;
      const request=store.index('proposalId').getAll(q.id);
      request.onsuccess=()=>{
        const version=1+Math.max(0,...request.result.map(p=>p.version));
        record={id:crypto.randomUUID(),proposalId:q.id,version,filename:EcoModel.proposalFilename(q),blob,fingerprint:hash,snapshot:structuredClone(q),generatedAt:new Date().toISOString()};
        store.put(record);
        const quotes=tx.objectStore('quotes'),current=quotes.get(q.id);
        current.onsuccess=()=>{
          // Preservar uma edição mais recente salva durante a geração deste snapshot.
          if(!current.result||(current.result.updatedAt||'')<=(q.updatedAt||''))quotes.put(structuredClone(q));
        };
      };
      tx.oncomplete=()=>{root.dispatchEvent(new CustomEvent('eco:data-changed'));resolve(record)};
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Não foi possível guardar o PDF. Exporte um backup e verifique o espaço disponível.'));
    });
  }
  async function mutateOperation(id,change){
    const db=await ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('operations','readwrite'),store=tx.objectStore('operations'),request=store.get(id);let value,error;
      request.onsuccess=()=>{try{value=change(request.result||{id,status:'awaiting',schedule:null,createdAt:new Date().toISOString()});value.updatedAt=new Date().toISOString();store.put(value)}catch(e){error=e;tx.abort()}};
      tx.oncomplete=()=>{root.dispatchEvent(new CustomEvent('eco:data-changed'));resolve(value)};
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(error||tx.error||Error('Não foi possível atualizar o orçamento.'));
    });
  }
  const toBase64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)});
  async function exportExtras(ids){
    const operations=(await all('operations')).filter(x=>ids.includes(x.id));
    const documents=await Promise.all((await all('pdfs')).filter(x=>ids.includes(x.proposalId)).map(async({blob,...r})=>({...r,data:await toBase64(blob)})));
    return {operations,documents};
  }
  async function importBatch(proposals,extras={},idMap=new Map()){
    const operations=(extras.operations||[]).map(op=>{
      if(!idMap.has(op.id))throw Error('Estado operacional sem orçamento correspondente.');
      return {...root.EcoOperations.normalize(op),id:idMap.get(op.id)};
    });
    const documents=(extras.documents||[]).map(p=>{
      if(!idMap.has(p.proposalId)||!/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.data||'')||!Number.isInteger(p.version)||p.version<1)throw Error('Documento inválido no backup.');
      const bytes=Uint8Array.from(atob(p.data.split(',')[1]),c=>c.charCodeAt(0));
      if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('O backup contém um PDF inválido.');
      const snapshot=EcoModel.normalize({...p.snapshot,id:idMap.get(p.proposalId)});
      return {id:crypto.randomUUID(),proposalId:snapshot.id,version:p.version,filename:EcoModel.proposalFilename(snapshot),generatedAt:p.generatedAt,fingerprint:p.fingerprint,blob:new Blob([bytes],{type:'application/pdf'}),snapshot};
    });
    // Não restaurar vínculos externos ativos nem presumir sincronização a partir de um backup.
    for(const op of operations)if(op.schedule){op.schedule.sync='pending';op.schedule.eventId=null;op.schedule.eventUrl=null;if(op.status==='scheduled')op.status='approved'}
    const db=await ready;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['quotes','operations','pdfs'],'readwrite');
      proposals.forEach(q=>tx.objectStore('quotes').put(q));operations.forEach(o=>tx.objectStore('operations').put(o));documents.forEach(p=>tx.objectStore('pdfs').put(p));
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Importação interrompida. Nenhum item deste lote foi salvo.'));
    });
    root.dispatchEvent(new CustomEvent('eco:data-changed'));
  }
  root.EcoStore={ready,operation,get,all,put,pdfs,fingerprint,savePDF,mutateOperation,exportExtras,importBatch};
})(globalThis);
