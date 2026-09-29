(function(root){
'use strict';
const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const date=value=>new Date(value+'T12:00:00').toLocaleDateString('pt-BR');
root.EcoRenderPDF=function(doc,q){
  q=root.EcoModel.toPublicProposal(q);
  const color=root.UniversalCompany.theme(q.company);
  const photos=q.items.map(i=>i.photos),logo=q.company.logo;
  const dense=q.items.length>1;
  const W=595.28,H=841.89,X=36,CW=W-2*X,bottom=768;
  let y=0,page=0;
  const text=(value,x,pos,width,size=10,bold=false,ink=color.ink,options={})=>{
    doc.font(bold?'EC-Bold':'EC').fontSize(size).fillColor(ink).text(String(value??''),x,pos,{width,lineGap:dense?1:2,...options});return doc.y;
  };
  const measure=(value,width,size=10,bold=false)=>doc.font(bold?'EC-Bold':'EC').fontSize(size).heightOfString(String(value??''),{width,lineGap:dense?1:2});
  const line=pos=>doc.strokeColor(color.line).lineWidth(.7).moveTo(X,pos).lineTo(W-X,pos).stroke();
  function brandImage(src,x,pos,width,height){
    if(!src){text(root.UniversalCompany.initials(q.company.name),x,pos,width,Math.min(height*.6,26),true,q.company.logoBackground==='light'?color.green:'#ffffff',{align:'center'});return;}
    doc.image(src,x,pos,{fit:[width,height],align:'center',valign:'center'});
  }
  function footer(){
    line(789);{doc.roundedRect(X,798,104,27,4).fill(q.company.logoBackground==='light'?'#fff':color.deep);brandImage(logo,X+6,802,92,19)}
    text([q.company.taxId,q.company.location,q.company.phone,q.company.email].filter(Boolean).join(' · '),140,799,W-176,7,false,color.muted,{align:'right',height:25,ellipsis:true});
    text(String(page),W-46,824,10,7,false,color.muted,{align:'right'});
  }
  function newPage(hero=false){
    if(page)footer();doc.addPage();page++;
    if(hero){
      const dark=q.company.logoBackground!=='light';
      doc.rect(0,0,W,dense?115:125).fill(dark?color.deep:'#ffffff');doc.rect(0,0,W,5).fill(color.lime);
      brandImage(logo,(W-300)/2,20,300,54);
      text(q.company.name,X,dense?80:84,CW,11,true,dark?'#ffffff':color.green,{align:'center'});
      text(q.company.tagline,X,dense?98:105,CW,8,false,dark?color.highlight:color.limeText,{align:'center'});
      y=dense?130:143;
    }else{
      doc.rect(0,0,W,57).fill(color.deep);doc.rect(0,0,W,4).fill(color.lime);
      if(q.company.logoBackground==='light')doc.rect(X,16,130,31).fill('#fff');
      brandImage(logo,X,20,130,23);
      text(q.number,300,25,W-X-300,8,false,color.highlight,{align:'right'});y=80;
    }
  }
  const ensure=height=>{if(y+height>bottom)newPage()};
  function paragraph(value,size=10,ink=color.ink){
    // Parágrafos longos são divididos por linha para respeitar o rodapé.
    const lines=[];for(const part of String(value).split('\n')){let current='';for(const word of part.split(/\s+/)){const next=current?current+' '+word:word;if(measure(next,CW,size)>size*2 && current){lines.push(current);current=word}else current=next}lines.push(current)}
    for(const value of lines){const h=measure(value||' ',CW,size);ensure(h);text(value,X,y,CW,size,false,ink);y+=h+2}
  }
  function tableHeader(){
    doc.roundedRect(X,y,CW,23,8).fill(color.green);doc.rect(X,y+12,CW,11).fill(color.green);
    text('ESCOPO DOS SERVIÇOS',X+10,y+6,CW-20,9,true,'#fff');y+=23;
    doc.rect(X,y,CW,23).fill(color.soft);
    [['FOTOS',X+5,67],['SERVIÇO',X+79,201],['QTD.',X+291,50],['UNIT. PIX',X+350,74],['TOTAL PIX',X+433,85]].forEach(([label,x,width])=>text(label,x,y+6,width,7,true,color.green));y+=23;
  }
  const t=root.EcoModel.totals(q);
  {
    newPage(true);
    text('PROPOSTA COMERCIAL',X,y,CW,8,true,color.limeText);y+=14;
    text(q.number,X,y,300,8,false,color.muted);text('Emissão: '+date(q.date),350,y,W-X-350,8,false,color.muted,{align:'right'});y+=18;
    y=text(q.company.proposalSubtitle||q.company.proposalTitle||'Proposta comercial',X,y,CW,dense?14:16,true,color.green)+(dense?7:12);
    y=text(q.client,X,y,CW,dense?12:13,true)+3;y=text(q.address,X,y,CW,9,false,color.muted)+3;
    if(q.clientContact)y=text(q.clientContact,X,y,CW,9,false,color.muted)+3;
    y+=dense?3:7;paragraph(q.company.intro,dense?8.5:9);y+=dense?5:10;
    ensure(106);tableHeader();
    for(let i=0;i<q.items.length;i++){
      const item=q.items[i],titleHeight=measure(item.service,198,9,true),detailHeight=measure(item.description,198,8);
      const photoHeight=item.photos.length>1?Math.ceil(item.photos.length/2)*34:dense?44:60;
      const height=Math.max(dense?56:64,photoHeight+12,titleHeight+detailHeight+20);
      if(y+height>bottom){newPage();tableHeader()}
      if(i%2===1)doc.rect(X,y,CW,height).fill(color.paper);
      photos[i].forEach((buffer,p)=>{const multiple=photos[i].length>1,side=multiple?30:64;doc.image(buffer,X+4+(multiple?p%2*34:0),y+6+(multiple?Math.floor(p/2)*34:0),{fit:[side,multiple?30:photoHeight],align:'center',valign:'center'})});
      if(!photos[i].length)text('Sem foto',X+5,y+25,65,7,false,color.muted);
      text(item.service,X+79,y+10,198,9,true,color.green);
      text(item.description,X+79,y+titleHeight+15,198,8,false,color.muted);
      text(`${Number(item.quantity).toLocaleString('pt-BR')} ${item.unit}`,X+291,y+25,50,8);
      text(money(Math.round(Number(item.price)*100)),X+350,y+25,74,8);
      text(money(t.rows[i]),X+433,y+25,85,8,true,color.green);
      y+=height;line(y);
    }
    y+=dense?9:14;ensure(dense?144:165);
    doc.roundedRect(X,y,CW,57,10).fill(color.deep);
    text('Investimento total',X+15,y+11,CW/2,10,true,'#fff');
    text('Cartão de crédito',X+15,y+31,CW/2,8,false,color.highlight);
    text(money(t.total),X+CW/2,y+12,CW/2-15,25,true,'#fff',{align:'right'});y+=dense?63:67;
    const boxW=(CW-12)/2;
    for(let i=0;i<2;i++){
      const x=X+i*(boxW+12);doc.roundedRect(x,y,boxW,dense?72:80,10).fillAndStroke(i===0?color.soft:'#fff',color.line);
      text(i===0?'VALOR NO PIX':'CARTÃO DE CRÉDITO',x+10,y+10,boxW-20,8,true,color.green,{align:'center'});
      text(i===0?money(t.pix):t.count+'x de '+money(t.part),x+10,y+29,boxW-20,18,true,color.green,{align:'center'});
      text(i===0?(t.saving?'Economize '+money(t.saving)+' à vista':'Pagamento à vista'):(t.count>1?'Sem juros • Total: '+money(t.total):'Pagamento em 1x'),x+10,y+(dense?53:57),boxW-20,8,false,color.muted,{align:'center'});
    }
    y+=dense?80:94;
    if(q.company.benefits.trim()){
      ensure(42);y=text('Por que escolher '+q.company.name,X,y,CW,11,true,color.green)+6;
      for(const benefit of q.company.benefits.split('\n').filter(Boolean)){ensure(measure(benefit,CW-15,9)+5);doc.circle(X+3,y+6,2).fill(color.limeText);y=text(benefit,X+15,y,CW-15,9)+(dense?2:5)}
      y+=6;
    }
    if(q.terms.notes.trim()){ensure(42);y=text('Condições do atendimento',X,y,CW,11,true,color.green)+6;paragraph(q.terms.notes,9);y+=10}
    const until=new Date(q.date+'T12:00:00');until.setDate(until.getDate()+q.terms.validity);
    ensure(62);doc.roundedRect(X,y,CW,57,10).fill(color.soft);
    text('Validade da proposta',X+13,y+8,CW-26,8,true,color.green);
    text(`${q.terms.validity} dias a partir da emissão, até ${until.toLocaleDateString('pt-BR')}.\nPara combinar o atendimento, entre em contato${q.company.phone?' pelo '+q.company.phone:'.'}`,X+13,y+23,CW-26,8);
    footer();
  }
};
})(globalThis);
