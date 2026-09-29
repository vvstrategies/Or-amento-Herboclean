(function(root){
  'use strict';
  const statuses={generated:'Orçamento gerado',scheduled:'Aprovado / agendado',completed:'Concluído',cancelled:'Cancelado'};
  const timezone='America/Sao_Paulo';
  const clean=(value,max=200)=>typeof value==='string'?value.slice(0,max):'';
  function normalize(raw={}){
    const result={id:clean(raw.id),status:Object.hasOwn(statuses,raw.status)?raw.status:'generated',suggestedSchedule:raw.suggestedSchedule||null,pendingAction:raw.pendingAction||null,schedule:null,createdAt:clean(raw.createdAt),updatedAt:clean(raw.updatedAt)};
    if(raw.schedule && Number.isFinite(Date.parse(raw.schedule.start)) && Number.isFinite(Date.parse(raw.schedule.end)) && Date.parse(raw.schedule.end)>Date.parse(raw.schedule.start)){
      result.schedule={id:clean(raw.schedule.id)||crypto.randomUUID(),start:raw.schedule.start,end:raw.schedule.end,timezone,sync:raw.schedule.sync==='confirmed'?'confirmed':'pending',eventId:clean(raw.schedule.eventId)||null,eventUrl:clean(raw.schedule.eventUrl,500)||null};
    }
    if(result.schedule?.sync==='pending'){result.suggestedSchedule=result.schedule;result.schedule=null;}
    if(result.status==='scheduled'&&!result.schedule)result.status='generated';
    return result;
  }
  function localDate(value=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
    const part=type=>parts.find(p=>p.type===type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function time(value){return new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
  function scheduleInput(date,timeValue,duration,now=Date.now()){
    const minutes=Number(duration);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)||!Number.isInteger(minutes)||minutes<15||minutes>720)throw Error('Informe data, horário e duração entre 15 minutos e 12 horas.');
    // Resolver o horário na zona escolhida, independentemente da zona do navegador.
    const wall=Date.parse(`${date}T${timeValue}:00Z`);let instant=wall;
    if(!Number.isFinite(wall))throw Error('Data inválida.');
    for(let i=0;i<3;i++){
      const p=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
      const part=type=>p.find(x=>x.type===type).value;
      const represented=Date.parse(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:00Z`);
      instant+=wall-represented;
    }
    if(localDate(new Date(instant))!==date||time(instant)!==timeValue)throw Error('Data ou horário inválido.');
    if(instant<=now)throw Error('Escolha um horário futuro para o atendimento.');
    return {start:new Date(instant).toISOString(),end:new Date(instant+minutes*60000).toISOString(),timezone,duration:minutes};
  }
  function changeStatus(raw,next,now=Date.now()){
    const op=normalize(raw);
    const allowed={generated:['cancelled'],scheduled:['completed'],completed:[],cancelled:['generated']};
    if(!allowed[op.status].includes(next))throw Error('Esta ação não está disponível para o estado atual.');
    if(next==='completed' && (!op.schedule||Date.parse(op.schedule.end)>now))throw Error('Marque como concluído depois do horário previsto para o término.');
    if(op.schedule && ['generated','cancelled'].includes(next))throw Error('Cancele o agendamento antes de alterar este estado.');
    return {...op,status:next};
  }
  function plan(raw,values){
    const op=normalize(raw);
    if(!['generated','scheduled'].includes(op.status))throw Error('Aprove o orçamento antes de agendar.');
    if(op.schedule?.sync==='confirmed')throw Error('A conexão Google é necessária para alterar este evento.');
    const schedule={id:op.schedule?.id||crypto.randomUUID(),...values,sync:'pending',eventId:null,eventUrl:null};
    return {...op,status:'generated',schedule};
  }
  function cancelPlan(raw){const op=normalize(raw);if(!op.schedule)throw Error('Não há agendamento para cancelar.');if(op.schedule.sync==='confirmed')throw Error('A conexão Google é necessária para cancelar este evento.');return {...op,status:op.status==='cancelled'?'cancelled':'generated',schedule:null}}
  const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function matches(q,op,{search='',status='',scheduled='',from='',to=''}={}){
    const haystack=fold([q.client,q.address,q.clientContact,q.number].join(' '));
    return (!search||fold(search).split(/\s+/).every(s=>haystack.includes(s)))&&(!status||op.status===status)&&(!scheduled||(scheduled==='yes'?!!op.schedule:!op.schedule))&&(!from||q.date>=from)&&(!to||q.date<=to);
  }
  const summary=q=>q.items.length?(q.items[0].service+(q.items.length>1?` + ${q.items.length-1} serviço${q.items.length>2?'s':''}`:'')):'Nenhum serviço';
  root.EcoOperations={statuses,timezone,normalize,localDate,time,scheduleInput,changeStatus,plan,cancelPlan,matches,summary};
})(globalThis);
