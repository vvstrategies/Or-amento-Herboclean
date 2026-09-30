(function(root){
  'use strict';
  const font=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0)).buffer;
  root.EcoCreatePDFBlob=async function(quote){
    quote=EcoModel.toPublicProposal(quote);
    if(location.protocol!=='file:')return EcoAuth.api('/api/preview-pdf',{method:'POST',body:JSON.stringify(quote),blob:true});
    await root.EcoPDFReady;
    const q=structuredClone(quote);
    // Backups antigos podem conter WebP, que o PDFKit não decodifica.
    async function compatible(src){
      if(!src?.startsWith('data:image/webp;'))return src;
      const img=new Image();img.src=src;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
      canvas.getContext('2d').drawImage(img,0,0);return canvas.toDataURL('image/png');
    }
    q.company.logo=await compatible(q.company.logo);
    for(const item of q.items)item.photos=await Promise.all(item.photos.map(compatible));
    const doc=new PDFDocument({size:'A4',margin:0,autoFirstPage:false,info:{Title:`${q.number} - ${q.client}`,Author:q.company.name,Subject:'Proposta comercial'}});
    doc.registerFont('EC',font(ECO_PDF_FONTS.regular));doc.registerFont('EC-Bold',font(ECO_PDF_FONTS.bold));
    const chunks=[];
    const completed=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(new Blob(chunks,{type:'application/pdf'})));doc.on('error',reject)});
    try { root.EcoRenderPDF(doc,q);doc.end(); } catch(error){doc.destroy();throw error}
    return await completed;
  };
  root.EcoDownloadBlob=function(blob,filename){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  root.EcoDownloadPDF=async quote=>root.EcoDownloadBlob(await root.EcoCreatePDFBlob(quote),EcoModel.proposalFilename(quote));
})(globalThis);
