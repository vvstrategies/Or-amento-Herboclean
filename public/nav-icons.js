(function(root){
  'use strict';
  // Ícones próprios do menu lateral: desenho em duas camadas (preenchimento suave + traço forte)
  // dentro de um quadrado arredondado; o item ativo acende o quadrado na cor de destaque da marca.
  const soft='class="ni-soft"',bold='class="ni-bold"';
  const ICONS={
    // Início: painel em quatro blocos
    home:`<rect ${bold} x="3.5" y="3.5" width="7.5" height="7.5" rx="2.2"/><rect ${soft} x="13" y="3.5" width="7.5" height="7.5" rx="2.2"/><rect ${soft} x="3.5" y="13" width="7.5" height="7.5" rx="2.2"/><rect ${bold} x="13" y="13" width="7.5" height="7.5" rx="2.2"/>`,
    // Orçamentos: proposta com cifrão
    quotes:`<path ${soft} d="M6.5 2.8h7.2l4.8 4.8v11.6a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2z"/><path ${bold} d="M13.7 2.8v3.6a1.2 1.2 0 0 0 1.2 1.2h3.6z"/><path class="ni-line" d="M12 10.2v7.4M14.2 11.6h-3a1.3 1.3 0 0 0 0 2.6h1.6a1.3 1.3 0 0 1 0 2.6h-3.1"/>`,
    // Clientes: duas pessoas
    clients:`<circle ${soft} cx="16.6" cy="8.6" r="2.9"/><path ${soft} d="M12.6 19.5c.3-3.2 1.9-5.2 4-5.2s3.9 2 4.1 5.2z"/><circle ${bold} cx="9" cy="8" r="3.4"/><path ${bold} d="M3.2 20c.3-4 2.6-6.4 5.8-6.4s5.5 2.4 5.8 6.4z"/>`,
    // Financeiro: barras com tendência
    finance:`<rect ${soft} x="4" y="12.5" width="4" height="8" rx="1.3"/><rect ${soft} x="10" y="9" width="4" height="11.5" rx="1.3"/><rect ${bold} x="16" y="5.5" width="4" height="15" rx="1.3"/><path class="ni-line" d="M4.5 9.2l4.4-3.6 3.4 2.4 5.2-4.6"/>`,
    // Configurações: três controles deslizantes
    settings:`<rect ${soft} x="3.5" y="5.2" width="17" height="2.6" rx="1.3"/><rect ${soft} x="3.5" y="10.7" width="17" height="2.6" rx="1.3"/><rect ${soft} x="3.5" y="16.2" width="17" height="2.6" rx="1.3"/><circle ${bold} cx="15.5" cy="6.5" r="2.6"/><circle ${bold} cx="8.5" cy="12" r="2.6"/><circle ${bold} cx="13" cy="17.5" r="2.6"/>`,
    // Vendas & Receita: sacola com moeda
    sales:`<path ${soft} d="M5.2 8.2h13.6l-1 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path class="ni-line" d="M8.8 8.2V7a3.2 3.2 0 0 1 6.4 0v1.2"/><circle ${bold} cx="12" cy="14.4" r="3.1"/>`,
    // Tráfego pago: alvo
    traffic:`<circle ${soft} cx="12" cy="12" r="8.5"/><circle ${bold} cx="12" cy="12" r="4.4"/><circle class="ni-hole" cx="12" cy="12" r="1.6"/>`,
  };
  function paint(scope=document){
    scope.querySelectorAll('[data-nav-icon]').forEach(el=>{const k=el.dataset.navIcon;if(!ICONS[k]||el.dataset.painted===k)return;el.dataset.painted=k;el.classList.add('nav-tile');el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[k]}</svg>`});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>paint());else paint();
  root.EcoNavIcons={paint,svg:k=>ICONS[k]?`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`:''};
})(globalThis);
