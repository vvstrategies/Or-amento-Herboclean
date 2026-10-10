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
// Versão para celular: página estreita (400 pt), uma coluna e letras maiores.
// Continua sendo um PDF comum, então o WhatsApp mostra a miniatura da primeira página.
root.EcoMobilePageSize=[400,860];
root.EcoRenderMobilePDF=function(doc,q){
  q=root.EcoModel.toPublicProposal(q);
  const color=root.UniversalCompany.theme(q.company),logo=q.company.logo,dark=q.company.logoBackground!=='light';
  const [W,H]=root.EcoMobilePageSize,X=22,CW=W-2*X,bottom=H-46;
  let y=0,page=0;
  const text=(value,x,pos,width,size=10,bold=false,ink=color.ink,options={})=>{doc.font(bold?'EC-Bold':'EC').fontSize(size).fillColor(ink).text(String(value??''),x,pos,{width,lineGap:2,...options});return doc.y};
  const measure=(value,width,size=10,bold=false)=>doc.font(bold?'EC-Bold':'EC').fontSize(size).heightOfString(String(value??''),{width,lineGap:2});
  function brand(x,pos,width,height){if(!logo){text(root.UniversalCompany.initials(q.company.name),x,pos,width,Math.min(height*.6,26),true,dark?'#ffffff':color.green,{align:'center'});return}doc.image(logo,x,pos,{fit:[width,height],align:'center',valign:'center'})}
  function footer(){doc.strokeColor(color.line).lineWidth(.6).moveTo(X,H-36).lineTo(W-X,H-36).stroke();text([q.company.name,q.company.phone].filter(Boolean).join(' · '),X,H-28,CW-30,7.5,false,color.muted,{height:12,ellipsis:true});text(String(page),W-X-24,H-28,24,7.5,false,color.muted,{align:'right'})}
  function newPage(){
    if(page)footer();doc.addPage({size:[W,H],margin:0});page++;
    if(page===1){doc.rect(0,0,W,150).fill(dark?color.deep:'#ffffff');doc.rect(0,0,W,6).fill(color.lime);brand((W-230)/2,26,230,48);text(q.company.name,X,86,CW,12,true,dark?'#ffffff':color.green,{align:'center'});text(q.company.tagline,X,106,CW,8.5,false,dark?color.highlight:color.limeText,{align:'center'});y=172}
    else{doc.rect(0,0,W,40).fill(color.deep);doc.rect(0,0,W,4).fill(color.lime);if(!dark)doc.rect(X,10,110,22).fill('#fff');brand(X,12,110,18);text(q.number,W/2,16,W/2-X,8,false,color.highlight,{align:'right'});y=58}
  }
  const ensure=h=>{if(y+h>bottom)newPage()};
  const t=root.EcoModel.totals(q);
  newPage();
  text('PROPOSTA COMERCIAL',X,y,CW,9,true,color.limeText,{characterSpacing:1});y+=16;
  text(q.number+' · emitida em '+date(q.date),X,y,CW,9,false,color.muted);y+=18;
  y=text(q.company.proposalSubtitle||q.company.proposalTitle||'Proposta comercial',X,y,CW,20,true,color.green)+8;
  y=text(q.client,X,y,CW,15,true)+4;
  if(q.address)y=text(q.address,X,y,CW,10,false,color.muted)+2;
  if(q.clientContact)y=text(q.clientContact,X,y,CW,10,false,color.muted)+2;
  y+=10;
  if(q.company.intro){const h=measure(q.company.intro,CW,10.5);ensure(h);y=text(q.company.intro,X,y,CW,10.5)+14}
  ensure(30);text('SERVIÇOS',X,y,CW,9,true,color.green,{characterSpacing:1});text(q.items.length+(q.items.length===1?' item':' itens'),X,y,CW,9,false,color.muted,{align:'right'});y+=18;
  q.items.forEach((item,i)=>{
    const photos=item.photos,hero=photos.length?190:0,thumbs=photos.length>1?58:0;
    const titleH=measure(item.service,CW-28,13,true),descH=item.description?measure(item.description,CW-28,10):0;
    const h=hero+thumbs+titleH+descH+64;ensure(Math.min(h,bottom-58));
    const top=y;doc.roundedRect(X,top,CW,h,14).fillAndStroke('#ffffff',color.line);
    if(hero){doc.save();doc.roundedRect(X,top,CW,hero,14).clip();doc.rect(X,top,CW,hero).fill(color.soft);doc.image(photos[0],X,top,{cover:[CW,hero],align:'center',valign:'center'});doc.restore()}
    let iy=top+hero+(thumbs?10:0);
    if(thumbs){photos.slice(1,6).forEach((src,p)=>{const s=46,x=X+14+p*(s+8);doc.save();doc.roundedRect(x,iy,s,s,8).clip();doc.image(src,x,iy,{cover:[s,s],align:'center',valign:'center'});doc.restore()});iy+=thumbs-10}
    iy+=14;iy=text(item.service,X+14,iy,CW-28,13,true,color.green)+3;
    if(item.description)iy=text(item.description,X+14,iy,CW-28,10,false,color.muted)+4;
    iy+=4;text(`${Number(item.quantity).toLocaleString('pt-BR')} ${item.unit} × ${money(Math.round(Number(item.price)*100))}`,X+14,iy,CW/2,10,false,color.muted);
    text(money(t.rows[i]),X+CW/2,iy-2,CW/2-14,13,true,color.green,{align:'right'});
    y=top+h+12;
  });
  y+=4;ensure(100);
  doc.roundedRect(X,y,CW,98,16).fill(color.deep);
  text('Investimento total',X+18,y+16,CW-36,11,true,'#ffffff');
  text(money(t.total),X+18,y+34,CW-36,28,true,'#ffffff');
  text(t.count>1?`no cartão em até ${t.count}x sem juros`:'no cartão em 1x',X+18,y+76,CW-36,9,false,color.highlight);y+=110;
  ensure(90);doc.roundedRect(X,y,CW,82,14).fillAndStroke(color.soft,color.line);
  text('VALOR NO PIX',X+16,y+12,CW-32,9,true,color.green,{characterSpacing:1});text(money(t.pix),X+16,y+28,CW-32,22,true,color.green);
  text(t.saving?'Economize '+money(t.saving)+' à vista':'Pagamento à vista',X+16,y+60,CW-32,9,false,color.muted);y+=92;
  ensure(74);doc.roundedRect(X,y,CW,64,14).fillAndStroke('#ffffff',color.line);
  text('CARTÃO DE CRÉDITO',X+16,y+12,CW-32,9,true,color.green,{characterSpacing:1});text(t.count+'x de '+money(t.part),X+16,y+28,CW-32,18,true,color.green);y+=78;
  if(q.company.benefits.trim()){ensure(40);y=text('Por que escolher a '+q.company.name,X,y,CW,12,true,color.green)+8;for(const b of q.company.benefits.split('\n').filter(Boolean)){ensure(measure(b,CW-16,10.5)+6);doc.circle(X+4,y+7,2.5).fill(color.limeText);y=text(b,X+16,y,CW-16,10.5)+6}y+=6}
  if(q.terms.notes.trim()){const h=measure(q.terms.notes,CW,10.5);ensure(h+30);y=text('Condições do atendimento',X,y,CW,12,true,color.green)+6;y=text(q.terms.notes,X,y,CW,10.5)+12}
  const until=new Date(q.date+'T12:00:00');until.setDate(until.getDate()+q.terms.validity);
  const vText=`${q.terms.validity} dias a partir da emissão, até ${until.toLocaleDateString('pt-BR')}.\nPara combinar o atendimento, chame${q.company.phone?' no '+q.company.phone:' nossa equipe'}.`,vh=measure(vText,CW-28,10)+36;
  ensure(vh);doc.roundedRect(X,y,CW,vh,14).fill(color.soft);text('Validade da proposta',X+14,y+12,CW-28,10,true,color.green);text(vText,X+14,y+28,CW-28,10);
  footer();
};
})(globalThis);
