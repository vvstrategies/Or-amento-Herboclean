(function(root){
  'use strict';
  // Troca a lista nativa dos <select> por uma lista no padrão da marca.
  // O <select> original continua no DOM, recebe o valor e dispara os mesmos eventos.
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const proto=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value'),protoIndex=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'selectedIndex');
  let open=null,serial=0;
  function label(select){const o=select.options[select.selectedIndex];return o?o.textContent:''}
  function close(restoreFocus=false){if(!open)return;const {list,btn}=open;list.hidden=true;btn.setAttribute('aria-expanded','false');open=null;if(restoreFocus)btn.focus()}
  function enhance(select){
    if(select.dataset.bsel||select.multiple||select.size>1||select.closest('[data-native-select]'))return;
    select.dataset.bsel='1';const id='bsel-'+(++serial);
    const wrap=document.createElement('div');wrap.className='bsel';
    const btn=document.createElement('button');btn.type='button';btn.className='bsel-btn';btn.setAttribute('aria-haspopup','listbox');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls',id);
    btn.innerHTML='<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const list=document.createElement('ul');list.className='bsel-list';list.id=id;list.setAttribute('role','listbox');list.hidden=true;
    select.parentNode.insertBefore(wrap,select);wrap.append(select,btn,list);select.classList.add('bsel-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const aria=select.getAttribute('aria-label')||select.closest('label')?.firstChild?.textContent?.trim();if(aria)btn.setAttribute('aria-label',aria+': '+label(select));
    let hl=-1,typed='',typedAt=0;
    const sync=()=>{btn.querySelector('span').textContent=label(select)||'Selecione';btn.disabled=select.disabled;if(aria)btn.setAttribute('aria-label',aria+': '+label(select))};
    Object.defineProperty(select,'value',{configurable:true,get(){return proto.get.call(this)},set(v){proto.set.call(this,v);sync()}});
    Object.defineProperty(select,'selectedIndex',{configurable:true,get(){return protoIndex.get.call(this)},set(v){protoIndex.set.call(this,v);sync()}});
    const items=()=>[...list.children];
    const mark=()=>items().forEach((li,i)=>{li.classList.toggle('hl',i===hl);if(i===hl)li.scrollIntoView({block:'nearest'})});
    const build=()=>{list.innerHTML=[...select.options].map((o,i)=>`<li role="option" data-i="${i}" aria-selected="${i===select.selectedIndex}"${o.disabled?' aria-disabled="true"':''}><span class="ck">✓</span>${esc(o.textContent)}</li>`).join('')};
    const show=()=>{if(select.disabled)return;close();build();list.hidden=false;btn.setAttribute('aria-expanded','true');open={list,btn};hl=select.selectedIndex;mark()};
    const pick=i=>{const o=select.options[i];if(!o||o.disabled)return;const changed=select.selectedIndex!==i;protoIndex.set.call(select,i);sync();close(true);if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}))}};
    btn.addEventListener('click',e=>{e.stopPropagation();list.hidden?show():close()});
    list.addEventListener('mousedown',e=>e.preventDefault());
    list.addEventListener('click',e=>{const li=e.target.closest('li');if(li)pick(Number(li.dataset.i))});
    btn.addEventListener('keydown',e=>{
      const n=select.options.length;
      if(list.hidden){if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();show()}return}
      if(e.key==='ArrowDown'){e.preventDefault();hl=Math.min(n-1,hl+1);mark()}
      else if(e.key==='ArrowUp'){e.preventDefault();hl=Math.max(0,hl-1);mark()}
      else if(e.key==='Home'){e.preventDefault();hl=0;mark()}
      else if(e.key==='End'){e.preventDefault();hl=n-1;mark()}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(hl)}
      else if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape')e.preventDefault();close(e.key==='Escape')}
      else if(e.key.length===1){const t=Date.now();typed=(t-typedAt>700?'':typed)+e.key.toLowerCase();typedAt=t;const i=[...select.options].findIndex(o=>o.textContent.toLowerCase().startsWith(typed));if(i>=0){hl=i;mark()}}
    });
    select.addEventListener('change',sync);
    new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    sync();
  }
  function scan(rootNode=document){for(const s of rootNode.querySelectorAll?.('.app-shell select,dialog select')||[])enhance(s)}
  document.addEventListener('click',e=>{if(open&&!open.list.parentNode.contains(e.target))close()});
  window.addEventListener('resize',()=>close());
  const start=()=>{scan();new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches?.('select'))scan(n.parentNode);else scan(n)}}).observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  root.EcoBrandSelect={enhance,scan,close};
})(globalThis);
