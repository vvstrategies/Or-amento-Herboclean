// Filtros combináveis da barra única: origem (qualquer), serviços e tipos de cliente (tags), juntos.
import assert from 'node:assert/strict';
import {CommercialService} from '../backend/commercial.js';

const q=(id,origin,services,tags=[])=>({id,origin,tags,items:services.map(service=>({service,quantity:1,price:100}))});
const rows=[
 q('a','google',['Persiana'],['corporativo']),
 q('b','google',['Sofá'],['corporativo']),
 q('c','meta',['Persiana'],['residencial']),
 q('d','organico',['Tapete','Persiana'],[]),
 q('e','',['Sofá'],['residencial']),
];
const ids=f=>CommercialService.filterRows(rows,f).map(r=>r.id).join('');
assert.equal(ids({}),'abcde','sem filtros');
assert.equal(ids({origin:'google'}),'ab');
assert.equal(ids({origin:'organico'}),'d','origem não paga também filtra');
assert.equal(ids({origin:'none'}),'e','sem origem');
assert.equal(ids({services:['Persiana']}),'acd','qualquer item do orçamento');
assert.equal(ids({services:['Persiana'],origin:'google',tags:['corporativo']}),'a','Persiana + Google + Corporativo');
assert.equal(ids({tags:['residencial','corporativo']}),'abce','tags: qualquer uma das escolhidas');
assert.equal(ids({tags:['__none']}),'d','sem tipo');
assert.equal(ids({services:['Tapete'],tags:['corporativo']}),'','combinação sem resultado');
console.log('PASS: filtros combináveis — origem (paga, orgânica, sem origem), serviços, tipos de cliente e combinações.');
