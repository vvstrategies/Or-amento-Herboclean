import {csvCell} from './dre-export.js';
import {profitDemo} from './profit-demo.js';
export function analyticsCSV(r){
 const amount=v=>v==null?'':(v/100).toFixed(2).replace('.',',');
 const rows=[['RENTABILIDADE - USO INTERNO',r.from,r.to],['Proposta','Realização','Serviços','Cidade','Origem do custo','Receita estimada','Receita utilizada','Custo estimado','Custo real completo','Custo utilizado','Variação custo','Margem contribuição','Variação margem','Minutos reais']];
 for(const x of r.records)rows.push([x.number,x.serviceDate,x.services.join(' / '),x.city,x.costSource,...['estimatedRevenue','revenue','estimatedCost','actualCost','cost','costVariance','margin','marginVariance'].map(k=>amount(x[k])),x.minutes]);
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}
export function registerProfit(app,profit,wrap){
 app.use('/api/profitability',(req,res,next)=>{res.set('Cache-Control','no-store');next()});
 app.get('/api/profitability/settings',(req,res)=>res.json(profit.settings()));
 app.put('/api/profitability/settings',(req,res)=>res.json(profit.saveSettings(req.body)));
 app.get('/api/profitability/report',(req,res)=>res.json(profit.analyze(req.query)));
 app.get('/api/profitability/demo',(req,res)=>res.json(profitDemo(req.query)));
 app.get('/api/profitability/report.csv',(req,res)=>res.type('text/csv').set('Content-Disposition','attachment; filename="rentabilidade-interna.csv"').send(analyticsCSV(profit.analyze(req.query))));
 app.get('/api/profitability/goals/:month',(req,res)=>res.json(profit.goal(req.params.month)));
 app.put('/api/profitability/goals/:month',(req,res)=>res.json(profit.saveGoal(req.params.month,req.body)));
 app.get('/api/profitability/proposals/:id',(req,res)=>res.json(profit.view(req.params.id)));
 app.put('/api/profitability/proposals/:id/context',(req,res)=>res.json(profit.saveContext(req.params.id,req.body)));
 app.put('/api/profitability/proposals/:id/actual',wrap(async(req,res)=>res.json(await profit.saveActual(req.params.id,req.body))));
 app.post('/api/profitability/proposals/:id/simulate',(req,res)=>res.json(profit.pricing(req.params.id,req.body)));
 app.post('/api/profitability/proposals/:id/apply-price',wrap(async(req,res)=>res.json(await profit.applyPrice(req.params.id,req.body))));
}
