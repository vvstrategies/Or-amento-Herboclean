// Simulador exclusivo dos testes. Não é importado pelo servidor da aplicação.
export function googleFixture(){
  const files=new Map(),events=new Map(),calls=[];let serial=0;
  const fixture={files,events,calls,loseEvent:false,loseUpload:false,failEvent:false};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  fixture.fetch=async(url,options={})=>{
    const u=new URL(url),method=options.method||'GET';calls.push({url:String(url),method});
    if(u.hostname==='oauth2.googleapis.com'){if(u.pathname==='/revoke')return json({});return json({access_token:'test-access-secret',refresh_token:'test-refresh-secret',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/drive.file'})}
    if(u.hostname==='openidconnect.googleapis.com')return json({sub:'test-account',email:'agenda@example.invalid',email_verified:true});
    if(u.pathname.endsWith('/generateIds'))return json({ids:['file-'+(++serial)]});
    if(u.pathname.startsWith('/upload/drive/')){const text=options.body.toString(),meta=JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]);const file={...meta,webViewLink:'https://drive.google.com/file/d/'+meta.id+'/view'};files.set(meta.id,file);if(fixture.loseUpload){fixture.loseUpload=false;throw Error('Resposta perdida após salvar arquivo')}return json(file)}
    if(u.pathname==='/drive/v3/files'&&method==='POST'){const body=JSON.parse(options.body);files.set(body.id,body);return json(body)}
    if(u.pathname.startsWith('/drive/v3/files/'))return files.has(u.pathname.split('/').pop())?json(files.get(u.pathname.split('/').pop())):json({},404);
    if(u.pathname.startsWith('/calendar/v3/')){
      const key=u.pathname.split('/events/')[1];
      if(method==='GET')return events.has(key)?json(events.get(key)):json({},404);
      if(method==='DELETE'){events.delete(key);return new Response(null,{status:204})}
      if(fixture.failEvent)return json({},503);
      const body=JSON.parse(options.body),id=key||body.id;
      if(method==='POST'&&events.has(id))return json({},409);
      const event={...body,id,status:'confirmed',etag:'"'+(++serial)+'"',htmlLink:'https://calendar.google.com/calendar/event?eid='+id};events.set(id,event);
      if(fixture.loseEvent){fixture.loseEvent=false;throw Error('Resposta perdida após criar evento')}return json(event);
    }
    throw Error('Chamada inesperada no teste: '+url);
  };
  return fixture;
}
