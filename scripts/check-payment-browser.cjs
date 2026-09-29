module.exports=async function({evaluate,click,set,until}){
 const assert=require('node:assert/strict');
 await until("!!window.EcoStudio");
 assert.equal(await evaluate("EcoStudio.getDraft().terms.installments"),3);
 await set('#form [name=rate6]','0');await set('#form [name=anticipate]','no');await click('#apply-asaas');
 assert.equal(await evaluate("EcoStudio.getDraft().terms.rate6"),3.49);
 assert.equal(await evaluate("EcoStudio.getDraft().terms.anticipate"),'yes');
 assert.equal(await evaluate("EcoStudio.getDraft().terms.fixedFee"),.49);
 await set('#form [name=date]','2026-09-10');await set('#items [data-field=price]','200');
 assert.ok(await evaluate("document.querySelector('.investment .amount').textContent.includes('215,58')"));
 assert.ok(await evaluate("document.querySelector('.payment strong').textContent.includes('200,00')"));
 assert.ok(await evaluate("document.querySelector('.payments').textContent.includes('3x')"));
 await click('#remember-terms');await until("EcoAuth.api('/api/settings').then(s=>s.terms.rate6===3.49 && s.terms.installments===3)");
 await set('#items [data-field=price]','');await set('#form [name=date]',await evaluate('EcoModel.today()'));
 console.log('PASS: padrão Asaas em 3x, repasse no investimento total, PIX base e salvamento das condições no navegador.');
};
