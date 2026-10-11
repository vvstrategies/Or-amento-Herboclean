// Moeda vinda de APIs externas pode ser inválida: nunca deixa a exportação quebrar.
export function money(cents,currency='BRL'){
  const value=Number(cents)/100;
  try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value)}
  catch{return (String(currency||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)||'BRL')+' '+value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
}
