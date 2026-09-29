const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const nodes=new Map();
function node(key){if(!nodes.has(key))nodes.set(key,{value:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[],addEventListener(){},reportValidity:()=>true});return nodes.get(key)}
const context={console,Intl,Date,Math,Number,String,Array,JSON,Error,Promise,RegExp,structuredClone,crypto:require('node:crypto').webcrypto,document:{querySelector:node,title:''},localStorage:{getItem:()=>null,setItem(){}},window:{addEventListener(){},print(){}},setTimeout,clearTimeout,confirm:()=>true};
vm.createContext(context);
vm.runInContext(fs.readFileSync('app.js','utf8'),context);
vm.runInContext(`
state.items=[{quantity:600,price:12},{quantity:36,price:29.99},{quantity:30,price:89.99},{quantity:15,price:229.99},{quantity:22,price:29.99}];
globalThis.result=totals(state);
globalThis.safe=esc('<img src=x onerror="bad">');
globalThis.cleaned=sanitize({...defaults(),color:'red;display:none',logo:'javascript:bad',items:[{name:'Test',quantity:-1,price:-5,photo:'javascript:bad'}]});
`,context);
assert.equal(context.result.total,1508897);
assert.equal(context.result.pix,1433452);
assert.equal(context.result.part*context.result.count+context.result.remainder,1508897);
assert.equal(context.result.part,377224);
assert.equal(context.result.remainder,1);
assert(!context.safe.includes('<img'));
assert.equal(context.cleaned.logo,'');
assert.equal(context.cleaned.items[0].photo,'');
assert.equal(context.cleaned.color,'#214e3a');
assert.equal(context.cleaned.items[0].price,0);
assert(nodes.get('#proposal').innerHTML.includes('INVESTIMENTO TOTAL'));
console.log('OK: inicialização, renderização, valores do PDF de referência, PIX, parcelas e importação segura.');
