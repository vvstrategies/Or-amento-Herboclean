(function (root) {
  'use strict';
  const U=root.UniversalCompany;
  const services=U.defaultServices();
  function configure(settings){services.splice(0,services.length,...U.catalog(settings.services))}
  const id = () => root.crypto.randomUUID();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const company = U.defaults;
  const terms = () => ({ pricingVersion: 3, validity: 15, installments: 3, notes: '', fixedFee: .49, rate1: 2.99, rate6: 3.49, rate12: 3.99, rate21: 4.29, anticipate: 'yes', anticipationRate: 1.70, anticipationRate1: 1.70, creditDays: 32 });
  const item = (service = services[0].name) => { const s = services.find(x => x.name === service) || services[0]; return { id: id(), service: s.name, description: s.description, unit: s.unit, quantity: 1, price: '', photos: [] }; };
  const quote = (settings = {}) => ({ id: id(), number: `${settings.company?.proposalPrefix||'ORC'}-${today().replaceAll('-','')}-${id().slice(0,4).toUpperCase()}`, date: today(), client: '', address: '', clientContact: '', company: { ...company(), ...settings.company }, terms: { ...terms(), ...settings.terms }, items: [item()], updatedAt: new Date().toISOString() });
  const text = (v, n = 2000) => typeof v === 'string' ? v.slice(0,n) : '';
  const image = v => typeof v === 'string' && v.length < 4000000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : '';
  const numeric = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
  const normalizeCompany=U.normalize;
  function normalizeTerms(raw = {}) {
    const clean = terms();
    clean.validity = Math.trunc(numeric(raw.validity,1,365,15));
    clean.notes = text(raw.notes,3000);
    // Condições antigas usavam desconto manual e não incluíam taxas.
    if (raw.pricingVersion === 3) {
      clean.installments = Math.trunc(numeric(raw.installments,1,21,3));
      for (const key of ['fixedFee','rate1','rate6','rate12','rate21','anticipationRate','anticipationRate1']) clean[key] = numeric(raw[key],0,key==='fixedFee'?100:10,clean[key]);
      clean.creditDays = Math.trunc(numeric(raw.creditDays,1,60,32));
      clean.anticipate = raw.anticipate === 'yes' ? 'yes' : 'no';
    }
    return clean;
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > 100) throw Error('A proposta precisa ter entre 1 e 100 serviços.');
    const q = quote();
    for (const key of ['id','number','client','address','clientContact','date','updatedAt']) if (typeof raw[key] === 'string') q[key] = text(raw[key],key==='address'?800:240);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date) || Number.isNaN(Date.parse(q.date))) q.date = today();
    q.company = normalizeCompany(typeof raw.company === 'object' ? raw.company : { name: raw.company || company().name, phone: raw.phone || company().phone, email: raw.email || '', location: raw.companyAddress || company().location, tagline: raw.tagline || company().tagline, intro: raw.intro || company().intro, benefits: raw.benefits || '', ...(raw.logo ? { logo: raw.logo, logoBackground:'light' } : {}) });
    q.terms = normalizeTerms(raw.terms || raw);
    q.items = raw.items.map(it => {
      if (!it || typeof it !== 'object') throw Error('Serviço inválido.');
      return { id: text(it.id,100) || id(), service: text(it.service || it.name,240) || services[0].name, description: text(it.description,1500), unit: it.unit === 'm²' ? 'm²' : 'un.', quantity: numeric(it.quantity,.01,100000,1), price: it.price === '' ? '' : numeric(it.price,0,1000000,0), photos: (Array.isArray(it.photos) ? it.photos : it.photo ? [it.photo] : []).slice(0,6).map(image).filter(Boolean) };
    });
    return q;
  }
  function totals(q) {
    const rows = q.items.map(i => Math.round(Math.round(Number(i.price)*100)*Number(i.quantity)));
    const pix = rows.reduce((a,b)=>a+b,0), terms = normalizeTerms(q.terms), count = terms.installments;
    const rate = terms[count===1?'rate1':count<=6?'rate6':count<=12?'rate12':'rate21']/100;
    const monthly = terms.anticipate==='yes' ? terms[count===1?'anticipationRate1':'anticipationRate']/100 : 0;
    const start = new Date((q.date||today())+'T12:00:00Z');
    const days = Array.from({length:count},(_,i)=>{
      const due = new Date(start); due.setUTCDate(due.getUTCDate()+terms.creditDays*(i+1));
      while ([0,6].includes(due.getUTCDay())) due.setUTCDate(due.getUTCDate()+1);
      return Math.round((due-start)/86400000);
    });
    const factor = 1-monthly*days.reduce((a,b)=>a+b,0)/count/30;
    if (factor<=0 || rate>=1) throw Error('As taxas configuradas inviabilizam este parcelamento. Reduza as parcelas ou confira as taxas.');
    // Gross-up: as taxas incidem sobre o preço cobrado. Arredondar cada parcela
    // para cima preserva o líquido estimado e permite parcelas iguais.
    let part = pix ? Math.ceil((pix/factor+terms.fixedFee*100)/(1-rate)/count-1e-8) : 0;
    if (!Number.isSafeInteger(part*count)) throw Error('O valor calculado excede o limite do sistema. Confira preços, quantidades e taxas.');
    const net = gross => {
      const afterFee = gross-Math.ceil(gross*rate-1e-8)-Math.round(terms.fixedFee*100);
      const anticipation = days.reduce((sum,d)=>sum+Math.ceil(Math.max(0,afterFee/count)*monthly*d/30-1e-8),0);
      return Math.max(0,afterFee-anticipation);
    };
    if(pix) while(net(part*count)<pix) part++;
    const total=part*count;
    return { rows,total,pix,count,part,remainder:0,discount:total?100*(total-pix)/total:0,saving:total-pix,net:pix?net(total):0,rate:Number((rate*100).toFixed(4)),days };
  }
  function validate(q) {
    if (!q || !q.company || !q.terms || !Array.isArray(q.items) || typeof q.client!=='string' || typeof q.address!=='string' || typeof q.company.name!=='string') throw Error('Dados da proposta inválidos.');
    if (!q.client.trim() || !q.address.trim()) throw Error('Preencha nome e endereço do cliente.');
    if (!q.company.name.trim()) throw Error('Preencha o nome da empresa nas configurações.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)||Number.isNaN(Date.parse(q.date))||!String(q.number||'').trim()) throw Error('Confira a data e o número da proposta.');
    if (!Number.isInteger(Number(q.terms.installments)) || q.terms.installments<1 || q.terms.installments>21 || !Number.isInteger(Number(q.terms.validity)) || q.terms.validity<1 || q.terms.validity>365) throw Error('Confira validade e parcelas (1 a 21).');
    if(q.terms.pricingVersion===3){
      for(const key of ['fixedFee','rate1','rate6','rate12','rate21','anticipationRate','anticipationRate1']) if(!Number.isFinite(Number(q.terms[key]))||q.terms[key]<0||q.terms[key]>(key==='fixedFee'?100:10))throw Error('Confira as taxas de pagamento.');
      if(!['yes','no'].includes(q.terms.anticipate)||!Number.isInteger(Number(q.terms.creditDays))||q.terms.creditDays<1||q.terms.creditDays>60)throw Error('Confira o recebimento no cartão.');
      totals(q);
    }
    if (!q.items.length || q.items.length>100) throw Error('Adicione entre 1 e 100 serviços.');
    q.items.forEach((i,n)=>{
      if (!i || typeof i!=='object') throw Error(`Serviço inválido no item ${n+1}.`);
      if (typeof i.service!=='string'||!i.service.trim()||i.service.length>240) throw Error(`Selecione o serviço do item ${n+1}.`);
      if (!i || !Number.isFinite(Number(i.quantity)) || i.quantity<=0 || i.quantity>100000) throw Error(`Confira a quantidade do item ${n+1}.`);
      if (i.price==='' || !Number.isFinite(Number(i.price)) || i.price<0 || i.price>1000000) throw Error(`Informe o preço unitário do item ${n+1}.`);
    });
    return q;
  }
  root.EcoModel = { toPublicProposal:normalize,services,company,terms,item,quote,normalize,normalizeCompany,normalizeTerms,configure,totals,validate,today,image };
})(globalThis);
