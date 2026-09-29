import {integrationDemo} from './integration-demo.js';
import {providerId,errorCode} from './integration-domain.js';
export function registerIntegrations(app,service,wrap){
 app.get('/api/integrations',(req,res)=>res.json({integrations:service.statuses(),settings:service.settings()}));
 app.put('/api/integrations/settings',(req,res)=>res.json(service.saveSettings(req.body)));
 app.get('/api/integrations/demo',(req,res)=>res.json(integrationDemo()));
 app.post('/api/integrations/routes/test',wrap(async(req,res)=>{const route=await service.finance.routeCache.get(req.body.origin,req.body.destination,{force:req.body.force===true});res.json({distanceMeters:route.distanceMeters,durationSeconds:route.durationSeconds,provider:route.provider,calculatedAt:route.calculatedAt,cached:route.cached});}));
 app.get('/api/integrations/:provider/runs',(req,res)=>res.json(service.runs(req.params.provider)));
 app.post('/api/integrations/:provider/connect',wrap(async(req,res)=>res.json(await service.connect(req.params.provider,req.session))));
 app.get('/api/integrations/:provider/callback',wrap(async(req,res)=>{const id=providerId(req.params.provider);try{await service.callback(id,req.query,req.session);res.redirect('/?integration='+id+'&result=connected#configuracoes');}catch(e){if(e.status===403)return res.status(403).json({error:'Confirmação expirada ou inválida. Inicie novamente.'});res.redirect('/?integration='+id+'&result='+errorCode(e)+'#configuracoes');}}));
 app.get('/api/integrations/:provider/accounts',wrap(async(req,res)=>res.json(await service.accounts(req.params.provider))));
 app.put('/api/integrations/:provider/account',wrap(async(req,res)=>res.json(await service.selectAccount(req.params.provider,req.body))));
 app.post('/api/integrations/:provider/test',wrap(async(req,res)=>res.json(await service.test(req.params.provider))));
 app.post('/api/integrations/:provider/sync',wrap(async(req,res)=>res.json(await service.sync(req.params.provider,req.body))));
 app.post('/api/integrations/:provider/disconnect',wrap(async(req,res)=>res.json(await service.disconnect(req.params.provider))));
 app.get('/api/finance/marketing',(req,res)=>res.json(service.marketing(req.query.from,req.query.to)));
}
