(function(root){
  'use strict';
  // Pílulas deslizantes: um indicador por grupo viaja até a opção ativa, inclusive quando o grupo é redesenhado.
  const GROUPS='.seg,.dre-tabs,.dre-mode,.profit-tabs';
  const ACTIVE=':scope>button[aria-pressed="true"],:scope>button[aria-selected="true"]';
  const last=new Map();let frame=0;
  const keyOf=g=>g.dataset.segKey||(g.id||g.closest('[id]')?.id||'')+'|'+g.className;
  function sync(g){
    const active=g.querySelector(ACTIVE);let ind=g.querySelector(':scope>.seg-ind');
    if(!active||!g.offsetWidth){if(ind)ind.style.opacity='0';return}
    if(!ind){ind=document.createElement('span');ind.className='seg-ind';ind.setAttribute('aria-hidden','true');g.prepend(ind);g.classList.add('has-ind');const prev=last.get(keyOf(g));if(prev){place(ind,prev,false);void ind.offsetWidth}}
    const box={x:active.offsetLeft,y:active.offsetTop,w:active.offsetWidth,h:active.offsetHeight};
    place(ind,box,true);last.set(keyOf(g),box);
  }
  function place(ind,b,animate){ind.style.transition=animate?'':'none';ind.style.opacity='1';ind.style.width=b.w+'px';ind.style.height=b.h+'px';ind.style.transform=`translate(${b.x}px,${b.y}px)`}
  function syncAll(){frame=0;document.querySelectorAll(GROUPS).forEach(sync)}
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(syncAll)};
  new MutationObserver(list=>{for(const m of list){const t=m.target;if(m.attributeName==='hidden'||(m.type==='attributes'?t.parentElement?.matches?.(GROUPS):t.matches?.(GROUPS)||t.querySelector?.(GROUPS)))return schedule()}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','aria-selected','hidden']});
  addEventListener('resize',schedule);document.fonts?.ready.then(schedule);
  root.EcoSegment={sync:schedule};
  // Curva monotônica: suave sem passar dos valores reais (acumulado nunca "desce" no desenho).
  function smooth(P){
    if(P.length<2)return P.length?`M${P[0][0]} ${P[0][1]}`:'';
    const d=[],m=[];for(let i=0;i<P.length-1;i++)d.push((P[i+1][1]-P[i][1])/(P[i+1][0]-P[i][0]));
    m[0]=d[0];for(let i=1;i<P.length-1;i++)m[i]=d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2;m[P.length-1]=d.at(-1);
    for(let i=0;i<d.length;i++){if(!d[i]){m[i]=m[i+1]=0;continue}const a=m[i]/d[i],b=m[i+1]/d[i],q=a*a+b*b;if(q>9){const t=3/Math.sqrt(q);m[i]=t*a*d[i];m[i+1]=t*b*d[i]}}
    let s=`M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
    for(let i=0;i<P.length-1;i++){const h=(P[i+1][0]-P[i][0])/3;s+=` C${(P[i][0]+h).toFixed(1)} ${(P[i][1]+m[i]*h).toFixed(1)} ${(P[i+1][0]-h).toFixed(1)} ${(P[i+1][1]-m[i+1]*h).toFixed(1)} ${P[i+1][0].toFixed(1)} ${P[i+1][1].toFixed(1)}`}
    return s;
  }
  root.EcoChart={smooth};
})(globalThis);
