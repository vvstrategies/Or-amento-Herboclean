const assert=require('node:assert/strict');
module.exports=async({evaluate,click,set,until,screenshot,send})=>{
 await send('Emulation.setDeviceMetricsOverride',{width:1512,height:1100,deviceScaleFactor:1,mobile:false});
 await click('[data-nav="settings"]');await until("document.querySelectorAll('#external-integration-cards [data-integration]:not([data-integration=asaas])').length===5");
 assert.equal(await evaluate("document.querySelector('[data-integration=google-ads] [data-action=connect]').disabled"),true);
 assert.equal(await evaluate("document.querySelector('[data-integration=meta-ads] [data-action=connect]').disabled"),true);
 await evaluate("document.querySelector('#integrations-center').scrollIntoView({block:'start'})");await screenshot('integrations-desktop');
 await click('#integration-demo');await until("document.querySelector('#integration-dialog')?.open");
 assert.equal(await evaluate("document.querySelectorAll('.integration-demo-states span').length"),5);
 assert.ok(await evaluate("document.querySelector('#integration-dialog').textContent.includes('675,00')"));
 await screenshot('integrations-demo');await click('#integration-dialog [data-close]');
 // Mídia paga saiu do Financeiro: virou a tela "Tráfego pago" no menu (item 11), com as visões Indicadores e Canais.
 assert.equal(await evaluate("!!document.querySelector('[data-dre-tab=marketing]')"),false,'aba Marketing removida do Financeiro');
 await click('[data-nav="traffic"]');await until("!document.querySelector('#traffic-view').hidden&&!!document.querySelector('#traffic-body .tr-empty,#traffic-body .tr-kpis')");
 assert.ok(await evaluate("document.querySelector('#traffic-body').textContent.includes('Conecte o Google Ads ou o Meta Ads')"),'estado sem contas conectadas');await screenshot('traffic-empty-desktop');
 assert.equal(await evaluate("location.hash"),'#trafego');
 await click('[data-traffic-view="channels"]');assert.equal(await evaluate("localStorage.getItem('hc-traffic-view')"),'channels');await click('[data-traffic-view="kpis"]');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=390'),true);await screenshot('traffic-empty-mobile');
 await click('#traffic-body [data-go="settings"]');await until("!document.querySelector('#settings-view').hidden");assert.equal(await evaluate('document.documentElement.scrollWidth<=390'),true);await screenshot('integrations-mobile');
 await send('Emulation.setDeviceMetricsOverride',{width:1512,height:1100,deviceScaleFactor:1,mobile:false});
 console.log('PASS: integrações e Tráfego pago desktop/mobile — estados, demo isolada das integrações, Marketing fora do Financeiro, tela própria com visões Indicadores/Canais e caminho para conectar.');
};
