import assert from 'node:assert/strict';
import '../public/operations-model.js';
const O=globalThis.EcoOperations;
const future=O.scheduleInput('2030-09-15','09:30',120,0);
assert.equal(future.start,'2030-09-15T12:30:00.000Z');assert.equal(future.end,'2030-09-15T14:30:00.000Z');
for(const args of [['2030-02-31','09:00',120],['2030-09-15','25:00',120],['2030-09-15','09:00',0],['2000-09-15','09:00',120]])assert.throws(()=>O.scheduleInput(...args));
for(const status of ['awaiting','approved','generated'])assert.equal(O.normalize({id:'old',status}).status,'generated');
const legacy=O.normalize({id:'old',status:'approved',schedule:{...future,sync:'pending'}});assert.equal(legacy.status,'generated');assert.equal(legacy.schedule,null);assert.equal(legacy.suggestedSchedule.start,future.start);
assert.equal(O.normalize({status:'scheduled'}).status,'generated');
assert.throws(()=>O.changeStatus({status:'generated'},'approved'));
assert.equal(O.changeStatus({status:'generated'},'cancelled').status,'cancelled');assert.equal(O.changeStatus({status:'cancelled'},'generated').status,'generated');
const confirmed={id:'test',status:'scheduled',schedule:{...future,sync:'confirmed',eventId:'google-id'}};
assert.throws(()=>O.changeStatus(confirmed,'completed',0));assert.equal(O.changeStatus(confirmed,'completed',Date.parse('2031-01-01')).status,'completed');
const q={client:'Clínica São José',address:'Rua Alegria, Santo André',clientContact:'cliente@example.invalid',number:'ECO-123',date:'2030-09-10'};
for(const search of ['clinica sao','alegria','example.invalid','ECO-123'])assert.equal(O.matches(q,{status:'generated'},{search}),true);
assert.equal(O.matches(q,{status:'generated'},{status:'scheduled'}),false);
assert.equal(O.matches(q,{status:'generated'},{from:'2030-09-11'}),false);
// A marca foi alterada por solicitação do usuário; preços/PDF são verificados em check-system.
console.log('PASS: horários, validação, 2 etapas, compatibilidade e filtros.');
