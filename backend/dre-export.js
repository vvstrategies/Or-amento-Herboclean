import PDFDocument from 'pdfkit';
const money=v=>v==null?'Pendente':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
export const csvCell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,m=>"'"+m).replace(/"/g,'""')+'"';
export function reportCSV(report){
 const rows=[['DRE GERENCIAL - USO INTERNO',report.mode==='actual'?'Realizado':'Projetado'],['Competência','Receita bruta','Deduções','Receita líquida','Custos diretos','Contribuição','Despesas operacionais','Resultado operacional','Margem operacional (%)','Investimentos separados','Custos pendentes']];
 for(const p of [...report.periods,{...report.total,competence:'TOTAL'}])rows.push([p.competence,...['gross','deductions','net','cost','contribution','opex','result'].map(k=>p[k]==null?'Pendente':(p[k]/100).toFixed(2).replace('.',',')),p.operatingMargin??'',(p.investment/100).toFixed(2).replace('.',','),p.missingCosts]);
 rows.push([],['DESPESAS','Competência','Categoria','Descrição','Fornecedor','Valor','Status','Natureza','Vencimento','Pagamento','Origem']);
 for(const e of report.expenses)rows.push(['',e.competence,e.categoryName,e.description,e.supplier,(e.amountCents/100).toFixed(2).replace('.',','),e.status,e.nature,e.dueDate,e.paidAt,e.source||'manual']);
 rows.push([],['ATENDIMENTOS','Competência','Proposta','Cliente','Receita base','Custo direto','Origem do custo','Versão da estimativa','Data de realização','Receita estimada','Custo estimado','Custo real completo','Variação de custo','Variação de margem']);
 for(const s of report.services)rows.push(['',s.competence,s.number,s.client,(s.revenue/100).toFixed(2).replace('.',','),s.cost==null?'Pendente':(s.cost/100).toFixed(2).replace('.',','),s.costSource,s.estimateVersion,s.serviceDate,...['estimatedRevenue','estimatedCost','actualCost','costVariance','marginVariance'].map(k=>s[k]==null?'':(s[k]/100).toFixed(2).replace('.',','))]);
 return '\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
}
export function reportPDF(report){
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:45,info:{Title:'DRE Gerencial - Uso interno'}}),chunks=[];doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  const title=()=>{doc.fontSize(9).fillColor('#64748b').text('RELATÓRIO INTERNO • DRE GERENCIAL');doc.moveDown().fontSize(22).fillColor('#0f172a').text(report.mode==='actual'?'Resultado realizado':'Resultado projetado');doc.fontSize(11).text(report.from+' a '+report.to);doc.moveDown();};
  title();
  const lines=[['Receita bruta','gross'],['(-) Deduções','deductions'],['(=) Receita líquida','net'],['(-) Custos diretos','cost'],['(=) Margem de contribuição','contribution'],['(-) Despesas operacionais','opex'],['(=) Resultado operacional estimado','result'],['Investimentos (fora do resultado)','investment']];
  for(const [label,key]of lines){doc.fontSize(12).text(label,{continued:true}).text(money(report.total[key]),{align:'right'});doc.moveDown(.6);}
  doc.fontSize(10).text('Margem operacional sobre receita líquida: '+(report.total.operatingMargin==null?'—':report.total.operatingMargin.toFixed(2)+'%'));
  doc.moveDown().text('Custos estimados: '+report.total.estimatedCount+' atendimento(s). Custos realizados: '+report.total.actualCount+'. Custos mistos: '+(report.total.mixedCount||0)+'. Custos pendentes: '+report.total.missingCosts+'.');
  doc.moveDown().text('Despesas por categoria');for(const c of report.composition)doc.fontSize(10).text(c.name+': '+money(c.amountCents));
  doc.moveDown().fontSize(9).fillColor('#64748b').text('Ferramenta interna de gestão por competência. Estimativa gerencial; consulte seu contador. Não representa demonstração contábil oficial. A exportação CSV contém a composição detalhada.');
  doc.end();
 });
}
