(function(root){
'use strict';
// Proposta comercial (layout "A"): faixa de marca arredondada, caixas claras e
// verde apenas no cabeçalho e no investimento. O mesmo arquivo roda no navegador
// e no servidor (utils/ecocleanPdf.js), então PDF e prévia usam as mesmas regras.
const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const date=value=>new Date(value+'T12:00:00').toLocaleDateString('pt-BR');
// Ícone oficial do Pix (public/assets/int-pix.svg, viewBox 24×24).
const PIX_PATH='M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156';
const PIX_COLOR='#32BCAD';
// Cores derivadas da identidade (para a Herboclean: #0f6d55 → #044c3a → #022b21).
function palette(company){
  const U=root.UniversalCompany,c=U.normalize(company),green=c.primaryColor,lime=c.accentColor;
  const lift=hex=>'#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*1.3+10)).toString(16).padStart(2,'0')).join('');
  return {green,lime,light:lift(green),deep:U.mix(green,'#000000',.43),limeSoft:U.mix(lime,'#ffffff',.85),limeBorder:U.mix(lime,'#ffffff',.45),
    ink:'#17202e',muted:'#64748b',line:'#e2e9e5',gray:'#f3f7f4',gray2:'#f7faf8',iconGray:'#eef2f0'};
}
root.EcoProposalPalette=palette;
root.EcoPixPath=PIX_PATH;

// Ferramentas comuns aos dois formatos.
function kit(doc,q,W,H){
  const P=palette(q.company);
  const font=(size,bold)=>doc.font(bold?'EC-Bold':'EC').fontSize(size);
  const measure=(value,width,size,bold=false,gap=2)=>font(size,bold).heightOfString(String(value??''),{width,lineGap:gap});
  const widthOf=(value,size,bold=false,spacing=0)=>font(size,bold).widthOfString(String(value??''),{characterSpacing:spacing});
  function text(value,x,y,width,size,bold=false,ink=P.ink,options={}){
    const {opacity=1,...rest}=options;
    font(size,bold).fillColor(ink,opacity).text(String(value??''),x,y,{width,lineGap:2,...rest});
    doc.fillOpacity(1);return doc.y;
  }
  // Linha única, sem quebra (rótulos, valores e rodapé).
  function line(value,x,y,size,bold=false,ink=P.ink,{opacity=1,spacing=0,right=false,center=false,max}={}){
    let s=String(value??'');
    if(max&&widthOf(s,size,bold,spacing)>max){while(s&&widthOf(s+'…',size,bold,spacing)>max)s=s.slice(0,-1);s+='…'}
    const w=widthOf(s,size,bold,spacing),px=right?x-w:center?x-w/2:x;
    font(size,bold).fillColor(ink,opacity).text(s,px,y,{lineBreak:false,characterSpacing:spacing});
    doc.fillOpacity(1);return w;
  }
  const caps=(value,x,y,size,ink,o={})=>line(String(value).toUpperCase(),x,y,size,true,ink,{spacing:size*.09,...o});
  // Quebra em linhas respeitando os parágrafos, para poder dividir entre páginas.
  function wrap(value,width,size,bold=false){
    const out=[];
    for(const para of String(value??'').split('\n')){
      let cur='';
      for(let word of para.split(/\s+/).filter(Boolean)){
        while(widthOf(word,size,bold)>width){let n=word.length;while(n>1&&widthOf(word.slice(0,n),size,bold)>width)n--;if(cur){out.push(cur);cur=''}out.push(word.slice(0,n));word=word.slice(n)}
        const next=cur?cur+' '+word:word;
        if(cur&&widthOf(next,size,bold)>width){out.push(cur);cur=word}else cur=next;
      }
      out.push(cur);
    }
    return out;
  }
  const k=.4477;
  function shape(x,y,w,h,{tl=0,tr=0,br=0,bl=0}){
    doc.moveTo(x+tl,y).lineTo(x+w-tr,y);
    if(tr)doc.bezierCurveTo(x+w-tr*k,y,x+w,y+tr*k,x+w,y+tr);doc.lineTo(x+w,y+h-br);
    if(br)doc.bezierCurveTo(x+w,y+h-br*k,x+w-br*k,y+h,x+w-br,y+h);doc.lineTo(x+bl,y+h);
    if(bl)doc.bezierCurveTo(x+bl*k,y+h,x,y+h-bl*k,x,y+h-bl);doc.lineTo(x,y+tl);
    if(tl)doc.bezierCurveTo(x,y+tl*k,x+tl*k,y,x+tl,y);
    return doc.closePath();
  }
  // Gradiente linear com o ângulo do CSS (0deg = para cima, 90deg = para a direita).
  function linear(x,y,w,h,deg,stops){
    const a=deg*Math.PI/180,dx=Math.sin(a),dy=-Math.cos(a),len=Math.abs(w*dx)+Math.abs(h*dy),cx=x+w/2,cy=y+h/2;
    const g=doc.linearGradient(cx-dx*len/2,cy-dy*len/2,cx+dx*len/2,cy+dy*len/2);stops.forEach(([p,c,o=1])=>g.stop(p,c,o));return g;
  }
  function glow(draw,cx,cy,r,opacity=.32){const g=doc.radialGradient(cx,cy,0,cx,cy,r);g.stop(0,P.lime,opacity).stop(1,P.lime,0);draw();doc.fill(g);doc.fillColor(P.ink,1)}
  function fillShape(draw,color,opacity=1){draw();doc.fillColor(color,opacity).fill();doc.fillOpacity(1)}
  function strokeShape(draw,color,width=.75,opacity=1){draw();doc.strokeColor(color,opacity).lineWidth(width).stroke();doc.strokeOpacity(1)}
  // Faixa verde (cabeçalho) com cantos inferiores arredondados e brilho no canto.
  function band(h,r){
    const draw=()=>shape(0,0,W,h,{br:r,bl:r});
    draw();doc.fill(linear(0,0,W,h,150,[[0,P.light],[.45,P.green],[1,P.deep]]));
    glow(draw,W*.88,0,Math.max(h*1.6,W*.42),.30);
  }
  function logoAt(x,y,w,h,{center=false}={}){
    const c=q.company;
    if(!c.logo){line(c.name||root.UniversalCompany.initials(c.name),center?x+w/2:x,y+h/2-9,15,true,'#ffffff',{center,max:w});return}
    if(c.logoBackground==='light'){
      // Logo feito para fundo claro: recebe uma plaquinha branca sobre o verde.
      const pad=6;fillShape(()=>doc.roundedRect(x-pad,y-pad,w+pad*2,h+pad*2,9),'#ffffff');
    }
    doc.image(c.logo,x,y,{fit:[w,h],align:center?'center':'left',valign:'center'});
  }
  function photo(src,x,y,w,h,r){doc.save();doc.roundedRect(x,y,w,h,r).clip();doc.rect(x,y,w,h).fill(P.gray);doc.image(src,x,y,{cover:[w,h],align:'center',valign:'center'});doc.restore();doc.fillColor(P.ink,1)}
  function pixIcon(x,y,size){doc.save();doc.translate(x,y).scale(size/24);doc.path(PIX_PATH).fillColor(PIX_COLOR,1).fill();doc.restore();doc.fillColor(P.ink,1)}
  function cardIcon(x,y,size){
    const w=size,h=size*.72,top=y+(size-h)/2;doc.save();doc.lineWidth(size*.075).lineJoin('round').lineCap('round').strokeColor('#475569',1);
    doc.roundedRect(x,top,w,h,size*.14).stroke();doc.moveTo(x,top+h*.34).lineTo(x+w,top+h*.34).stroke();doc.moveTo(x+w*.16,top+h*.72).lineTo(x+w*.4,top+h*.72).stroke();doc.restore();
  }
  function check(x,y,s,color){doc.save();doc.moveTo(x,y+s*.52).lineTo(x+s*.36,y+s*.86).lineTo(x+s,y+s*.12).lineWidth(s*.2).lineCap('round').lineJoin('round').strokeColor(color,1).stroke();doc.restore()}
  return {P,font,measure,widthOf,text,line,caps,wrap,shape,linear,glow,fillShape,strokeShape,band,logoAt,photo,pixIcon,cardIcon,check};
}

// Paginação comum: cabeçalho por página, rodapé "página X de Y" no final.
function pager(doc,K,W,H,size,{first,next,footer,bottom}){
  const state={y:0,page:0};
  const buffered=!!doc.options.bufferPages;
  state.newPage=()=>{
    if(state.page&&!buffered)footer(state.page,0);
    doc.addPage({size,margin:0});state.page++;
    state.y=state.page===1?first():next();
  };
  state.ensure=h=>{if(state.y+h>bottom())state.newPage()};
  state.room=()=>bottom()-state.y;
  state.finish=()=>{
    if(!buffered){footer(state.page,0);return}
    const range=doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){doc.switchToPage(range.start+i);footer(i+1,range.count)}
  };
  return state;
}

function common(q){
  const t=root.EcoModel.totals(q);
  const until=new Date(q.date+'T12:00:00');until.setDate(until.getDate()+q.terms.validity);
  const c=q.company;
  return {t,c,
    title:c.proposalSubtitle||c.proposalTitle||'Proposta comercial',
    count:q.items.length+(q.items.length===1?' item':' itens'),
    qty:item=>`${Number(item.quantity).toLocaleString('pt-BR')} ${item.unit}`,
    unit:item=>money(Math.round(Number(item.price)*100)),
    cardLine:t.count>1?`no cartão em até ${t.count}x sem juros`:'no cartão em 1x',
    pixSub:t.saving?'Economize '+money(t.saving)+' à vista':'Pagamento à vista',
    cardValue:t.count+'x de '+money(t.part),
    cardSub:t.count>1?'Sem juros · total '+money(t.total):'Pagamento em 1x · total '+money(t.total),
    validityValue:'Até '+until.toLocaleDateString('pt-BR'),
    validityText:`${q.terms.validity} dias a partir da emissão (${date(q.date)}). Para combinar o atendimento, entre em contato${c.phone?' pelo '+c.phone:' com nossa equipe'}.`,
    benefits:c.benefits.split('\n').map(b=>b.trim()).filter(Boolean),
    why:'Por que escolher a '+c.name,
    footLeft:[c.name,c.taxId,c.location].filter(Boolean).join(' · '),
    footRight:[c.phone,c.email].filter(Boolean),
  };
}

root.EcoRenderPDF=function(doc,q){
  q=root.EcoModel.toPublicProposal(q);
  const W=595.28,H=841.89,X=33,CW=W-2*X,K=kit(doc,q,W,H),{P}=K,D=common(q),{t,c}=D;
  const S={cap:7.5,body:9,em:9.75,value:16.5,title:18,total:24};
  const BOTTOM=H-50;
  function footer(n,total){
    const y=H-34;doc.moveTo(X,y-9).lineTo(W-X,y-9).lineWidth(.6).strokeColor(P.line,1).stroke();
    const right=[...D.footRight,total?`página ${n} de ${total}`:`página ${n}`].join(' · ');
    if(K.widthOf(right,S.cap)+K.widthOf(D.footLeft,S.cap)+18<=CW){K.line(right,W-X,y,S.cap,false,P.muted,{right:true});K.line(D.footLeft,X,y,S.cap,false,P.muted)}
    else{K.line(D.footLeft,X,y-1,S.cap,false,P.muted,{max:CW});K.line(right,W-X,y+10,S.cap,false,P.muted,{right:true,max:CW})}
  }
  function first(){
    const padT=22.5,padB=25.5,logoW=165,logoH=36;
    const tagLines=c.tagline?K.wrap(c.tagline.toUpperCase(),CW-200,S.cap,true):[];
    const leftH=logoH+(tagLines.length?9+tagLines.length*11:0),rightH=7.5+7+21+7+11;
    const h=padT+Math.max(leftH,rightH)+padB;
    K.band(h,25.5);
    K.logoAt(X,padT,logoW,logoH);
    tagLines.forEach((s,i)=>K.caps(s,X,padT+logoH+9+i*11,S.cap,P.lime));
    let ry=padT+Math.max(0,(Math.max(leftH,rightH)-rightH)/2);
    K.caps('PROPOSTA COMERCIAL',W-X,ry,S.cap,'#ffffff',{right:true,opacity:.62});ry+=14.5;
    const pw=K.widthOf(q.number,S.body,true)+20;
    K.fillShape(()=>doc.roundedRect(W-X-pw,ry,pw,21,10.5),'#ffffff',.12);K.strokeShape(()=>doc.roundedRect(W-X-pw,ry,pw,21,10.5),'#ffffff',.6,.22);
    K.line(q.number,W-X-10,ry+5.5,S.body,true,'#ffffff',{right:true});ry+=28;
    K.line('Emitida em '+date(q.date),W-X,ry,S.body,false,'#ffffff',{right:true,opacity:.82});
    return h+18;
  }
  function next(){
    const h=46;K.band(h,18);K.logoAt(X,13,c.logo?110:230,20);
    K.line(q.number+' · emitida em '+date(q.date),W-X,18,S.cap+.5,false,'#ffffff',{right:true,opacity:.8});
    return h+20;
  }
  const pg=pager(doc,K,W,H,'A4',{first,next,footer,bottom:()=>BOTTOM});
  const ensure=pg.ensure;let y;
  const sync=()=>{y=pg.y},push=()=>{pg.y=y};
  // Parágrafo que pode atravessar páginas.
  function flow(value,x,width,size,ink,lineGapAfter=0){
    const lh=K.measure('Ag',width,size);
    for(const s of K.wrap(value,width,size)){push();ensure(lh);sync();if(s)K.line(s,x,y,size,false,ink);y+=lh}
    y+=lineGapAfter;
  }
  // Caixa cinza com rótulo que se divide entre páginas quando o texto é longo.
  function flowBox(label,value,fill){
    const pad=13,lh=K.measure('Ag',CW-2*pad,S.body),lines=K.wrap(value,CW-2*pad,S.body);let i=0,firstChunk=true;
    while(i<lines.length||firstChunk){
      const head=firstChunk?S.cap+8:0;let avail=BOTTOM-y-2*pad-head;
      if(avail<lh*Math.min(2,lines.length-i)){push();pg.newPage();sync();continue}
      const n=Math.max(0,Math.min(lines.length-i,Math.floor(avail/lh))),h=2*pad+head+n*lh;
      K.fillShape(()=>doc.roundedRect(X,y,CW,h,15),fill);
      if(firstChunk)K.caps(label,X+pad,y+pad,S.cap,P.muted);
      lines.slice(i,i+n).forEach((s,j)=>{if(s)K.line(s,X+pad,y+pad+head+j*lh,S.body,false,P.ink)});
      i+=n;y+=h+(i<lines.length?0:12);firstChunk=false;if(i<lines.length){push();pg.newPage();sync()}
    }
  }
  pg.newPage();sync();
  // Título + texto institucional.
  y=K.text(D.title,X,y,CW,S.title,true,P.green)+4.5;
  if(c.intro.trim())flow(c.intro,X,Math.min(CW,480),S.body,'#334155');
  y+=12;
  // Cliente: uma caixa com três colunas separadas por divisores finos.
  {
    const cols=[['CLIENTE',q.client,S.em,true],['ENDEREÇO DO ATENDIMENTO',q.address,S.body,false],['TELEFONE',q.clientContact,S.body,false]].filter(col=>String(col[1]||'').trim());
    if(cols.length){
      const pad=15,gap=15,inner=CW-2*pad;
      const phone=cols.find(col=>col[0]==='TELEFONE');
      const phoneW=phone?Math.max(K.widthOf(phone[0],S.cap,true,S.cap*.09),K.widthOf(phone[1],S.body)):0;
      const free=inner-(cols.length-1)*gap*2-phoneW;
      const flex=cols.filter(col=>col!==phone),weights={CLIENTE:.36,'ENDEREÇO DO ATENDIMENTO':.64};
      const sum=flex.reduce((a,col)=>a+weights[col[0]],0);
      const widths=cols.map(col=>col===phone?(flex.length?phoneW:inner):free*weights[col[0]]/sum);
      const heights=cols.map((col,i)=>col===phone&&flex.length?K.measure('Ag',widths[i],col[2]):K.measure(col[1],widths[i],col[2],col[3]));
      const h=2*pad+S.cap+6+Math.max(...heights);
      push();ensure(h);sync();
      K.fillShape(()=>doc.roundedRect(X,y,CW,h,15),P.gray);
      let x=X+pad;
      cols.forEach((col,i)=>{
        if(i){doc.moveTo(x-gap,y+pad).lineTo(x-gap,y+h-pad).lineWidth(.75).strokeColor('#d9e3dd',1).stroke()}
        K.caps(col[0],x,y+pad,S.cap,P.muted);
        if(col===phone&&flex.length)K.line(col[1],x,y+pad+S.cap+6,S.body,false,P.ink);
        else K.text(col[1],x,y+pad+S.cap+6,widths[i],col[2],col[3],P.ink);
        x+=widths[i]+gap*2;
      });
      y+=h+16;
    }
  }
  // Escopo dos serviços.
  const TX=X,COL={photo:TX+14,service:TX+80,qty:TX+312,unit:TX+372,totalR:TX+CW-14},SW=220;
  let segTop=0;
  function tableHead(){
    segTop=y;
    K.fillShape(()=>K.shape(TX,y,CW,29,{tl:16.5,tr:16.5}),P.gray);
    K.caps('ESCOPO DOS SERVIÇOS',TX+14,y+11,S.cap,P.ink);
    K.line(D.count,COL.totalR,y+9.5,S.body,false,P.muted,{right:true});y+=29;
    [['FOTOS',COL.photo],['SERVIÇO',COL.service],['QTD.',COL.qty],['UNIT. PIX',COL.unit]].forEach(([l,x])=>K.caps(l,x,y+8,S.cap,P.muted));
    K.caps('TOTAL PIX',COL.totalR,y+8,S.cap,P.muted,{right:true});y+=23;
    doc.moveTo(TX,y).lineTo(TX+CW,y).lineWidth(.6).strokeColor(P.line,1).stroke();
  }
  const closeTable=()=>K.strokeShape(()=>doc.roundedRect(TX,segTop,CW,y-segTop,16.5),P.line,.8);
  // Cada linha do escopo; descrições que não cabem continuam na página seguinte.
  const photoH=item=>{const n=item.photos.length,r=Math.ceil(n/2);return n>1?r*19+(r-1)*2:39};
  push();ensure(52+Math.min(photoH(q.items[0])+22+K.measure(q.items[0].service,SW,S.em,true),140));sync();tableHead();
  q.items.forEach((item,i)=>{
    const lh=K.measure('Ag',SW,S.body),lines=item.description?K.wrap(item.description,SW,S.body):[];
    const nameH=K.measure(item.service,SW,S.em,true),ph=photoH(item);
    let n0=0,first=true;
    while(first||n0<lines.length){
      const head=first?nameH+(lines.length?3:0):0,rest=lines.length-n0,avail=BOTTOM-y,minH=first?ph:0;
      let n;
      if(Math.max(minH,head+rest*lh)+22<=avail)n=rest;
      else{n=Math.floor((avail-22-head)/lh);if(n<Math.min(rest,3)||minH+22>avail){closeTable();push();pg.newPage();sync();tableHead();continue}}
      if(y>segTop+53)doc.moveTo(TX+14,y).lineTo(TX+CW-14,y).lineWidth(.5).strokeColor(P.line,1).stroke();
      const top=y+11,h=Math.max(minH,head+n*lh)+22;
      let ty=top;
      if(first){
        const np=item.photos.length;
        if(np===1)K.photo(item.photos[0],COL.photo,top,48,39,10.5);
        else if(np>1)item.photos.forEach((src,p)=>K.photo(src,COL.photo+(p%2)*25,top+Math.floor(p/2)*21,23,19,5));
        else{K.fillShape(()=>doc.roundedRect(COL.photo,top,48,39,10.5),P.gray);K.line('Sem foto',COL.photo+24,top+16,7,false,P.muted,{center:true})}
        K.text(item.service,COL.service,top,SW,S.em,true,P.green);ty+=head;
        K.line(D.qty(item),COL.qty,top+1,S.body,false,P.ink,{max:56});
        K.line(D.unit(item),COL.unit,top+1,S.body,false,P.ink,{max:70});
        K.line(money(t.rows[i]),COL.totalR,top,S.em,true,P.ink,{right:true});
      }
      lines.slice(n0,n0+n).forEach(s=>{if(s)K.line(s,COL.service,ty,S.body,false,P.muted);ty+=lh});
      n0+=n;first=false;y+=h;
      if(n0<lines.length){closeTable();push();pg.newPage();sync();tableHead()}
    }
  });
  closeTable();y+=14;
  // Investimento + PIX + cartão (mantidos juntos).
  push();ensure(64+10+82);sync();
  {
    const h=64,draw=()=>doc.roundedRect(X,y,CW,h,18);
    draw();doc.fill(K.linear(X,y,CW,h,135,[[0,P.light],[.5,P.green],[1,P.deep]]));K.glow(draw,X+CW*.9,y,CW*.4,.28);
    K.caps('INVESTIMENTO TOTAL',X+21,y+19,S.cap,'#ffffff',{opacity:.66});
    K.line(D.cardLine,X+21,y+33,S.body,false,'#ffffff',{opacity:.9});
    K.line(money(t.total),X+CW-21,y+17,S.total,true,'#ffffff',{right:true});
    y+=h+10;
  }
  {
    const bw=(CW-10)/2,h=82;
    const card=(x,pix)=>{
      const draw=()=>doc.roundedRect(x,y,bw,h,15);
      if(pix){draw();doc.fill(K.linear(x,y,bw,h,160,[[0,P.limeSoft],[1,'#ffffff']]));K.strokeShape(draw,P.limeBorder,.9)}
      else{K.fillShape(draw,'#ffffff');K.strokeShape(draw,P.line,.9)}
      const ix=x+15,iy=y+15;
      K.fillShape(()=>doc.roundedRect(ix,iy,33,33,9),pix?'#ffffff':P.iconGray);
      if(pix){K.strokeShape(()=>doc.roundedRect(ix,iy,33,33,9),P.limeBorder,.6);K.pixIcon(ix+7.5,iy+7.5,18)}else K.cardIcon(ix+8,iy+8,17);
      const tx=ix+33+12,tw=bw-(tx-x)-12;
      K.caps(pix?'VALOR NO PIX':'CARTÃO DE CRÉDITO',tx,y+17,S.cap,P.muted);
      K.line(pix?money(t.pix):D.cardValue,tx,y+30,S.value,true,pix?P.green:P.ink,{max:tw});
      K.line(pix?D.pixSub:D.cardSub,tx,y+56,S.body,false,pix?P.green:P.muted,{max:tw});
    };
    card(X,true);card(X+bw+10,false);y+=h+18;
  }
  // Por que escolher.
  if(D.benefits.length){
    push();ensure(14+30);sync();
    y=K.text(D.why,X,y,CW,S.em,true,P.green)+8;
    let x=X;const ph=K.measure('Ag',CW,S.body)+12,cw=7;
    for(const b of D.benefits){
      const tw=K.widthOf(b,S.body),full=11+cw+5+tw+11;
      if(full<=CW){
        if(x+full>X+CW){x=X;y+=ph+6}
        push();ensure(ph);sync();
        K.fillShape(()=>doc.roundedRect(x,y,full,ph,ph/2),P.gray);
        K.check(x+11,y+ph/2-cw/2,cw,P.green);K.line(b,x+11+cw+5,y+6,S.body,false,P.ink);x+=full+6;
      }else{
        if(x>X){x=X;y+=ph+6}
        const inner=CW-34,hh=K.measure(b,inner,S.body)+12;push();ensure(hh);sync();
        K.fillShape(()=>doc.roundedRect(X,y,CW,hh,11),P.gray);K.check(X+11,y+8,cw,P.green);K.text(b,X+11+cw+5,y+6,inner,S.body,false,P.ink);y+=hh+6;
      }
    }
    if(x>X)y+=ph+6;
    y+=10;
  }
  // Validade + condições, caixas cinza.
  {
    const pad=13,notes=q.terms.notes.trim()?q.terms.notes:'';
    const vbox=(x,w,h)=>{K.fillShape(()=>doc.roundedRect(x,y,w,h,15),P.gray2);K.caps('VALIDADE DA PROPOSTA',x+pad,y+pad,S.cap,P.muted);const vy=K.text(D.validityValue,x+pad,y+pad+S.cap+7,w-2*pad,S.em,true,P.ink);K.text(D.validityText,x+pad,vy+3,w-2*pad,S.body,false,P.muted)};
    const vh=w=>2*pad+S.cap+7+K.measure(D.validityValue,w-2*pad,S.em,true)+3+K.measure(D.validityText,w-2*pad,S.body);
    if(!notes){push();ensure(vh(CW));sync();vbox(X,CW,vh(CW));y+=vh(CW)+10}
    else{
      const vw=CW*.38,nw=CW-vw-10,nh=2*pad+S.cap+7+K.measure(notes,nw-2*pad,S.body),h=Math.max(vh(vw),nh);
      if(h<=BOTTOM-90){
        push();ensure(h);sync();vbox(X,vw,h);
        K.fillShape(()=>doc.roundedRect(X+vw+10,y,nw,h,15),P.gray2);K.caps('CONDIÇÕES DO ATENDIMENTO',X+vw+10+pad,y+pad,S.cap,P.muted);
        K.text(notes,X+vw+10+pad,y+pad+S.cap+7,nw-2*pad,S.body,false,P.ink);y+=h+10;
      }else{push();ensure(vh(CW));sync();vbox(X,CW,vh(CW));y+=vh(CW)+10;flowBox('CONDIÇÕES DO ATENDIMENTO',notes,P.gray2)}
    }
  }
  push();pg.finish();
};

// Versão para celular: página estreita (400 pt), uma coluna.
// Continua sendo um PDF comum, então o WhatsApp mostra a miniatura da primeira página.
root.EcoMobilePageSize=[400,860];
root.EcoRenderMobilePDF=function(doc,q){
  q=root.EcoModel.toPublicProposal(q);
  const [W,H]=root.EcoMobilePageSize,X=20,CW=W-2*X,K=kit(doc,q,W,H),{P}=K,D=common(q),{t,c}=D;
  const S={cap:10,body:12,em:13,value:22,title:24,total:32};
  const BOTTOM=H-76;
  function footer(n,total){
    const y=H-56;doc.moveTo(X,y-8).lineTo(W-X,y-8).lineWidth(.6).strokeColor(P.line,1).stroke();
    const pw=K.line(total?`página ${n} de ${total}`:`página ${n}`,W-X,y,S.cap,false,P.muted,{right:true});
    K.line([c.name,c.taxId].filter(Boolean).join(' · '),X,y,S.cap,false,P.muted,{max:CW-pw-12});
    [c.location,D.footRight.join(' · ')].filter(Boolean).forEach((v,i)=>K.line(v,X,y+14+i*14,S.cap,false,P.muted,{max:CW}));
  }
  function first(){
    const padT=26,logoH=44;let y=padT;
    const tag=c.tagline?K.wrap(c.tagline.toUpperCase(),CW-20,S.cap,true):[];
    const h=padT+logoH+(tag.length?10+tag.length*14:0)+16+S.cap+8+24+10+S.body+26;
    K.band(h,28);
    K.logoAt((W-210)/2,y,210,logoH,{center:true});y+=logoH+10;
    tag.forEach(s=>{K.caps(s,W/2,y,S.cap,P.lime,{center:true});y+=14});
    y+=tag.length?6:0;y+=10;
    K.caps('PROPOSTA COMERCIAL',W/2,y,S.cap,'#ffffff',{center:true,opacity:.62});y+=S.cap+8;
    const pw=Math.min(CW,K.widthOf(q.number,S.body,true)+26),px=(W-pw)/2;
    K.fillShape(()=>doc.roundedRect(px,y,pw,24,12),'#ffffff',.12);K.strokeShape(()=>doc.roundedRect(px,y,pw,24,12),'#ffffff',.6,.22);
    K.line(q.number,W/2,y+6,S.body,true,'#ffffff',{center:true,max:CW-26});y+=34;
    K.line('Emitida em '+date(q.date),W/2,y,S.body,false,'#ffffff',{center:true,opacity:.82});
    return h+20;
  }
  function next(){const h=48;K.band(h,20);K.logoAt(X,14,c.logo?110:200,20);K.line(q.number,W-X,18,S.cap,false,'#ffffff',{right:true,opacity:.8});return h+18}
  const pg=pager(doc,K,W,H,[W,H],{first,next,footer,bottom:()=>BOTTOM});
  let y;const sync=()=>{y=pg.y},push=()=>{pg.y=y},ensure=h=>{push();pg.ensure(h);sync()};
  function flow(value,x,width,size,ink){const lh=K.measure('Ag',width,size);for(const s of K.wrap(value,width,size)){ensure(lh);if(s)K.line(s,x,y,size,false,ink);y+=lh}}
  function flowBox(label,value,fill,bold){
    const pad=14,lh=K.measure('Ag',CW-2*pad,S.body),lines=K.wrap(value,CW-2*pad,S.body);let i=0,firstChunk=true;
    while(i<lines.length||firstChunk){
      const head=firstChunk?S.cap+8:0,avail=BOTTOM-y-2*pad-head;
      if(avail<lh*Math.min(2,lines.length-i)){push();pg.newPage();sync();continue}
      const n=Math.max(0,Math.min(lines.length-i,Math.floor(avail/lh))),h=2*pad+head+n*lh;
      K.fillShape(()=>doc.roundedRect(X,y,CW,h,16),fill);
      if(firstChunk)K.caps(label,X+pad,y+pad,S.cap,P.muted);
      lines.slice(i,i+n).forEach((s,j)=>{if(s)K.line(s,X+pad,y+pad+head+j*lh,S.body,!!bold,P.ink)});
      i+=n;y+=h+(i<lines.length?0:12);firstChunk=false;if(i<lines.length){push();pg.newPage();sync()}
    }
  }
  pg.newPage();sync();
  y=K.text(D.title,X,y,CW,S.title,true,P.green)+6;
  if(c.intro.trim())flow(c.intro,X,CW,S.body,'#334155');
  y+=14;
  // Cliente: as três informações empilhadas na mesma caixa cinza.
  {
    const rows=[['CLIENTE',q.client,S.em,true],['ENDEREÇO DO ATENDIMENTO',q.address,S.body,false],['TELEFONE',q.clientContact,S.body,false]].filter(r=>String(r[1]||'').trim());
    if(rows.length){
      const pad=16,iw=CW-2*pad,hs=rows.map(r=>S.cap+5+K.measure(r[1],iw,r[2],r[3])),h=2*pad+hs.reduce((a,b)=>a+b,0)+(rows.length-1)*21;
      ensure(h);K.fillShape(()=>doc.roundedRect(X,y,CW,h,18),P.gray);
      let ry=y+pad;rows.forEach((r,i)=>{
        if(i){doc.moveTo(X+pad,ry-10.5).lineTo(X+CW-pad,ry-10.5).lineWidth(.75).strokeColor('#d9e3dd',1).stroke()}
        K.caps(r[0],X+pad,ry,S.cap,P.muted);K.text(r[1],X+pad,ry+S.cap+5,iw,r[2],r[3],P.ink);ry+=hs[i]+21;
      });
      y+=h+20;
    }
  }
  // A foto do primeiro serviço encolhe (até 70 pt) para o escopo começar na mesma página, em vez de deixar meia página vazia.
  let firstHero=150;const heroH=item=>item.photos.length?(item===q.items[0]?firstHero:150):0,thumbH=item=>item.photos.length>1?62:0;
  {const it=q.items[0],iw=CW-32,lines=it.description?K.wrap(it.description,iw,S.body).length:0,lh=K.measure('Ag',iw,S.body),
    rest=24+thumbH(it)+16+K.measure(it.service,iw,S.em,true)+(lines?4:0)+Math.min(lines,3)*lh+(14+12+18+16-4)+4;
   if(it.photos.length){push();const room=Math.floor(pg.room()-rest);if(room>=70&&room<150)firstHero=room}
   ensure(rest+heroH(it))}
  K.caps('ESCOPO DOS SERVIÇOS',X,y+2,S.cap,P.ink);K.line(D.count,W-X,y,S.body,false,P.muted,{right:true});y+=24;
  q.items.forEach((item,i)=>{
    // Cartão do serviço; descrições muito longas continuam em um novo cartão na página seguinte.
    const photos=item.photos,hero=heroH(item),thumbs=thumbH(item),pad=16,iw=CW-2*pad;
    const lh=K.measure('Ag',iw,S.body),lines=item.description?K.wrap(item.description,iw,S.body):[];
    const headH=hero+thumbs+pad+K.measure(item.service,iw,S.em,true)+(lines.length?4:0),footH=14+12+18+pad-4;
    let n0=0,first=true;
    while(first||n0<lines.length){
      const head=first?headH:pad,rest=lines.length-n0,avail=BOTTOM-y;
      let n,last;
      if(head+rest*lh+footH<=avail){n=rest;last=true}
      else{n=Math.floor((avail-head-pad)/lh);last=false;if(n<Math.min(rest,2)){push();pg.newPage();sync();continue}}
      const top=y,h=head+n*lh+(last?footH:pad),draw=()=>doc.roundedRect(X,top,CW,h,18);
      K.fillShape(draw,'#ffffff');
      let iy=top;
      if(first){
        if(hero){doc.save();K.shape(X,top,CW,hero,{tl:18,tr:18}).clip();doc.rect(X,top,CW,hero).fill(P.gray);doc.image(photos[0],X,top,{cover:[CW,hero],align:'center',valign:'center'});doc.restore();doc.fillColor(P.ink,1)}
        iy+=hero;
        if(thumbs){iy+=12;photos.slice(1,6).forEach((src,p)=>K.photo(src,X+pad+p*60,iy,52,50,10));iy+=50}
        iy+=pad;iy=K.text(item.service,X+pad,iy,iw,S.em,true,P.green)+(lines.length?4:0);
      }else iy+=pad;
      lines.slice(n0,n0+n).forEach(s=>{if(s)K.line(s,X+pad,iy,S.body,false,P.muted);iy+=lh});
      if(last){
        iy+=14;doc.moveTo(X+pad,iy).lineTo(X+CW-pad,iy).lineWidth(.5).strokeColor(P.line,1).stroke();iy+=12;
        const tw=K.line(money(t.rows[i]),X+CW-pad,iy-1,S.em,true,P.ink,{right:true});
        K.line(`${D.qty(item)} × ${D.unit(item)}`,X+pad,iy,S.body,false,P.muted,{max:iw-tw-10});
      }
      K.strokeShape(draw,P.line,.9);
      n0+=n;first=false;y=top+h+(last?12:0);
      if(!last){push();pg.newPage();sync()}
    }
  });
  y+=6;
  {
    const h=118;ensure(h+12+96);const draw=()=>doc.roundedRect(X,y,CW,h,22);
    draw();doc.fill(K.linear(X,y,CW,h,135,[[0,P.light],[.5,P.green],[1,P.deep]]));K.glow(draw,X+CW*.9,y,CW*.55,.28);
    K.caps('INVESTIMENTO TOTAL',X+22,y+22,S.cap,'#ffffff',{opacity:.66});
    K.line(money(t.total),X+22,y+40,S.total,true,'#ffffff',{max:CW-44});
    K.line(D.cardLine,X+22,y+86,S.body,false,'#ffffff',{opacity:.9,max:CW-44});
    y+=h+12;
  }
  const payCard=pix=>{
    const h=96;ensure(h);const draw=()=>doc.roundedRect(X,y,CW,h,18);
    if(pix){draw();doc.fill(K.linear(X,y,CW,h,160,[[0,P.limeSoft],[1,'#ffffff']]));K.strokeShape(draw,P.limeBorder,.9)}
    else{K.fillShape(draw,'#ffffff');K.strokeShape(draw,P.line,.9)}
    const ix=X+18,iy=y+(h-42)/2;
    K.fillShape(()=>doc.roundedRect(ix,iy,42,42,12),pix?'#ffffff':P.iconGray);
    if(pix){K.strokeShape(()=>doc.roundedRect(ix,iy,42,42,12),P.limeBorder,.6);K.pixIcon(ix+10,iy+10,22)}else K.cardIcon(ix+10,iy+10,22);
    const tx=ix+42+14,tw=CW-(tx-X)-16;
    K.caps(pix?'VALOR NO PIX':'CARTÃO DE CRÉDITO',tx,y+20,S.cap,P.muted);
    K.line(pix?money(t.pix):D.cardValue,tx,y+35,S.value,true,pix?P.green:P.ink,{max:tw});
    K.line(pix?D.pixSub:D.cardSub,tx,y+66,S.body,false,pix?P.green:P.muted,{max:tw});
    y+=h+12;
  };
  payCard(true);payCard(false);y+=8;
  if(D.benefits.length){
    ensure(18+34);y=K.text(D.why,X,y,CW,S.em,true,P.green)+10;
    const cw=9,inner=CW-2*13-cw-7;
    for(const b of D.benefits){
      const one=K.widthOf(b,S.body)<=inner,hh=(one?K.measure('Ag',CW,S.body):K.measure(b,inner,S.body))+14;ensure(hh);
      const w=one?13+cw+7+K.widthOf(b,S.body)+13:CW;
      K.fillShape(()=>doc.roundedRect(X,y,w,hh,one?hh/2:14),P.gray);K.check(X+13,y+(one?hh/2-cw/2:9),cw,P.green);K.text(b,X+13+cw+7,y+7,inner,S.body,false,P.ink);y+=hh+7;
    }
    y+=12;
  }
  {
    const pad=14,iw=CW-2*pad,h=2*pad+S.cap+8+K.measure(D.validityValue,iw,S.em,true)+4+K.measure(D.validityText,iw,S.body);
    ensure(h);K.fillShape(()=>doc.roundedRect(X,y,CW,h,16),P.gray2);K.caps('VALIDADE DA PROPOSTA',X+pad,y+pad,S.cap,P.muted);
    const vy=K.text(D.validityValue,X+pad,y+pad+S.cap+8,iw,S.em,true,P.ink);K.text(D.validityText,X+pad,vy+4,iw,S.body,false,P.muted);y+=h+12;
  }
  if(q.terms.notes.trim())flowBox('CONDIÇÕES DO ATENDIMENTO',q.terms.notes,P.gray2);
  push();pg.finish();
};
})(globalThis);
