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
})(globalThis);
