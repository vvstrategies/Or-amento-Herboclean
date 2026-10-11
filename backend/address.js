// Cidade e UF de um orçamento: campos estruturados do CEP quando existem; senão, lidos do endereço livre.
const UF=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const cityName=v=>/^[^\d\s]/.test(v)&&/\p{L}/u.test(v)?v:'';
export function placeFromAddress(address){
  const parts=String(address||'').split(',').map(p=>p.trim()).filter(p=>p&&!/^(brasil|brazil)$/i.test(p)&&!/^\d{5}-?\d{3}$/.test(p));
  for(let i=parts.length-1;i>=0;i--){
    const m=/^(.+?)\s*[-–/]\s*([A-Za-z]{2})$/.exec(parts[i]);
    if(m&&UF.has(m[2].toUpperCase())&&cityName(m[1].trim()))return {city:m[1].trim(),state:m[2].toUpperCase()};
    if(UF.has(parts[i].toUpperCase())&&i>0&&cityName(parts[i-1]))return {city:parts[i-1],state:parts[i].toUpperCase()};
  }
  return {city:'',state:''};
}
export function placeOf(q){
  const city=String(q?.addressCity||'').trim();
  return city?{city,state:String(q.addressState||'').trim().toUpperCase()}:placeFromAddress(q?.address);
}
// Lê só os campos de endereço do snapshot, sem carregar fotos.
export function proposalPlace(db,id){
  const r=db.prepare("SELECT json_extract(snapshot,'$.address') address,json_extract(snapshot,'$.addressCity') addressCity,json_extract(snapshot,'$.addressState') addressState,json_extract(snapshot,'$.addressNeighborhood') neighborhood FROM proposals WHERE id=?").get(id);
  return r?{...placeOf(r),neighborhood:String(r.neighborhood||'').trim()}:{city:'',state:'',neighborhood:''};
}
