export function registerAsaas(app,service,wrap){
  app.get('/api/asaas/status',(req,res)=>res.json(service.status()));
  app.get('/api/proposals/:id/payments',(req,res)=>res.json({payments:service.list(req.params.id)}));
  app.post('/api/proposals/:id/payments',wrap(async(req,res)=>res.json(await service.issue(req.params.id,req.body))));
  app.post('/api/proposals/:id/payments/:paymentId/cancel',wrap(async(req,res)=>res.json(await service.cancel(req.params.id,req.params.paymentId))));
}
