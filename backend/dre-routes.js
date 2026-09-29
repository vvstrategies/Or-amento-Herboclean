import {dreDemo} from './dre-demo.js';
import {reportCSV,reportPDF} from './dre-export.js';
export function registerDre(app,dre,wrap){
 app.use('/api/finance',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/api/finance/demo',(req,res)=>res.json(dreDemo(req.query.from,req.query.to,req.query.mode)));
 app.get('/api/finance/settings',(req,res)=>res.json(dre.settings()));
 app.put('/api/finance/settings',(req,res)=>res.json(dre.saveSettings(req.body)));
 app.get('/api/finance/categories',(req,res)=>res.json(dre.categories()));
 app.post('/api/finance/categories',(req,res)=>res.json(dre.saveCategory(null,req.body)));
 app.put('/api/finance/categories/:id',(req,res)=>res.json(dre.saveCategory(req.params.id,req.body)));
 app.get('/api/finance/expenses',(req,res)=>res.json(dre.listExpenses(req.query)));
 app.post('/api/finance/expenses',(req,res)=>res.json(dre.saveExpense(null,req.body)));
 app.get('/api/finance/expenses/:id',(req,res)=>res.json(dre.getExpense(req.params.id)));
 app.put('/api/finance/expenses/:id',(req,res)=>res.json(dre.saveExpense(req.params.id,req.body)));
 app.get('/api/finance/recurrences',(req,res)=>res.json(dre.rules()));
 app.post('/api/finance/recurrences',(req,res)=>res.json(dre.saveRule(null,req.body)));
 app.put('/api/finance/recurrences/:id',(req,res)=>res.json(dre.saveRule(req.params.id,req.body)));
 app.post('/api/finance/prepare',(req,res)=>res.json(dre.materialize(req.body.from,req.body.to)));
 app.put('/api/finance/tax/:month',(req,res)=>res.json(dre.tax(req.params.month,req.body)));
 app.post('/api/finance/realization/:id',(req,res)=>res.json(dre.recordLegacyDate(req.params.id,req.body)));
 app.get('/api/finance/report',(req,res)=>res.json(dre.compare(req.query.from,req.query.to,req.query.mode||'actual')));
 app.get('/api/finance/report.csv',(req,res)=>{res.set('Content-Disposition','attachment; filename="DRE-gerencial-interna.csv"');res.type('text/csv').send(reportCSV(dre.compare(req.query.from,req.query.to,req.query.mode||'actual')));});
 app.get('/api/finance/report.pdf',wrap(async(req,res)=>{const report=dre.compare(req.query.from,req.query.to,req.query.mode||'actual');res.set('Content-Disposition','attachment; filename="DRE-gerencial-interna.pdf"');res.type('pdf').send(await reportPDF(report));}));
}
