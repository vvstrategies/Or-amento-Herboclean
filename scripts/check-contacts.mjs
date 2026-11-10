// Importação de contatos: normalização, telefone (DDI preservado), vCard, aniversário e detecção do Contact Picker.
import assert from 'node:assert/strict';
import '../public/contact-import.js';
const C=globalThis.EcoContacts;

// Telefone: Brasil no formato do app; outro país mantém DDI; ambíguo não é adivinhado.
assert.equal(C.formatPhone('+55 11 98765-4321'),'(11) 98765-4321');
assert.equal(C.formatPhone('5511987654321'),'(11) 98765-4321');
assert.equal(C.formatPhone('011 98765-4321'),'(11) 98765-4321');
assert.equal(C.formatPhone('1133334444'),'(11) 3333-4444');
assert.equal(C.formatPhone('+351 912 345 678'),'+351 912 345 678','DDI estrangeiro preservado');
assert.equal(C.formatPhone('+1 415 555 0100'),'+1 415 555 0100');
assert.equal(C.formatPhone('98765-4321'),'98765-4321','sem DDD fica como veio');
assert.equal(C.phoneKey('(11) 98765-4321'),C.phoneKey('+55 11 98765-4321'),'mesma chave de duplicidade do servidor');
assert.equal(C.emailKey(' Ana@Example.COM '),'ana@example.com');

// Somente nome / nome + telefone / múltiplos telefones / e-mail / endereço / aniversário.
const only=C.normalizeContact({name:'Só Nome'},'device');assert.deepEqual([only.name,only.phones,only.emails,only.addresses,only.birthday],['Só Nome',[],[],[],'']);
const multi=C.normalizeContact({name:'Ana',phones:[{value:'11987654321'},{value:'+55 (11) 98765-4321'},{value:'+351 912 345 678'}],emails:[{value:'a@x.com'},{value:'A@X.com'}]},'google');
assert.equal(multi.phones.length,2,'mesmo número em formatos diferentes vira um só');assert.equal(multi.emails.length,1);
const addr=C.normalizeContact({name:'B',addresses:[{street:'Rua das Flores, 120 - Apto 3',city:'Santo André',region:'SP',postalCode:'09000-000'}],birthday:{toString:()=> '1990-03-18'}},'device');
assert.deepEqual(addr.addresses[0],{formatted:'',street:'Rua das Flores',number:'120',complement:'Apto 3',neighborhood:'',city:'Santo André',region:'SP',postalCode:'09000000',country:''});
for(const [v,e] of [['1990-03-18','03-18'],['19900318','03-18'],['--0318','03-18'],['--03-18','03-18'],['03-18','03-18'],['2001-02-30',''],['x','']])assert.equal(C.birthdayOf(v),e,v);

// vCard: 3.0 com dobra de linha, 2.1 quoted-printable, vários contatos e cartão vazio ignorado.
const vcf=['BEGIN:VCARD','VERSION:3.0','FN:Carla Souza','N:Souza;Carla;;;','TEL;TYPE=CELL,PREF:+55 11 91111-2222','TEL;TYPE=WORK:(11) 3333-4444','EMAIL;TYPE=INTERNET:carla@example.invalid','ADR;TYPE=HOME:;;Av. Paulista\\, 1000;São Paulo;SP;01310-100;Brasil','BDAY:1985-07-09','ORG:Clínica Carla','NOTE:long','  continuation','END:VCARD',
 'BEGIN:VCARD','VERSION:2.1','N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ara=C3=BAjo;Jo=C3=A3o;;;','item1.TEL:11 95555-6666','END:VCARD','BEGIN:VCARD','VERSION:4.0','END:VCARD'].join('\r\n');
const cards=C.parseVCards(vcf);
assert.equal(cards.length,2);
assert.equal(cards[0].name,'Carla Souza');assert.deepEqual(cards[0].phones.map(p=>[p.value,p.primary]),[['(11) 91111-2222',true],['(11) 3333-4444',false]]);
assert.equal(cards[0].emails[0].value,'carla@example.invalid');assert.equal(cards[0].birthday,'07-09');assert.equal(cards[0].organization,'Clínica Carla');
assert.equal(cards[0].addresses[0].street,'Av. Paulista');assert.equal(cards[0].addresses[0].number,'1000');assert.equal(cards[0].addresses[0].city,'São Paulo');assert.equal(cards[0].addresses[0].postalCode,'01310100');
assert.equal(cards[1].name,'João Araújo');assert.equal(cards[1].phones[0].value,'(11) 95555-6666');

// Contact Picker: sem suporte não quebra e explica; com suporte, pede só propriedades suportadas e um contato.
const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
try{
  Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});globalThis.isSecureContext=true;
  const none=C.providers.device.availability();assert.equal(none.supported,false);assert.match(none.reason,/não é suportada por este navegador/);
  let asked;Object.defineProperty(globalThis,'navigator',{value:{contacts:{getProperties:async()=>['name','tel'],select:async(props,opts)=>{asked={props,opts};return [{name:['Dani'],tel:['+55 21 97777-8888']}]}}},configurable:true});
  assert.equal(C.providers.device.availability().supported,true);
  const picked=await C.providers.device.pick();assert.deepEqual(asked,{props:['name','tel'],opts:{multiple:false}});assert.equal(picked.name,'Dani');assert.equal(picked.phones[0].value,'(21) 97777-8888');assert.equal(picked.source,'device');
  Object.defineProperty(globalThis,'navigator',{value:{contacts:{getProperties:async()=>['name'],select:async()=>[]}},configurable:true});
  assert.equal(await C.providers.device.pick(),null,'cancelar a seleção não preenche nada');
}finally{if(nav)Object.defineProperty(globalThis,'navigator',nav)}
console.log('PASS: contatos — normalização, telefone/DDI, duplicidade, vCard 2.1/3.0, aniversário, Contact Picker com e sem suporte e cancelamento.');
