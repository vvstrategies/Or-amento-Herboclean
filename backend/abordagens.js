// Abordagens da Black Friday 2026: página temporária em /abordagens, atrás do login.
// O conteúdo (nomes, mensagens, ofertas) não fica no código: entra pelo botão "Importar" da própria página
// e é guardado no config do banco. Remover depois da campanha (rotas, pasta backend/abordagens e as duas chaves).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from './database.js';

const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'abordagens');
export const ABORDAGENS_KEY='abordagens-bf-2026',ENVIADOS_KEY='abordagens-bf-2026-enviados';
const GRUPOS=new Set(['colchao','colchao-multi','desconto','preco-cheio','aviso']);
const isNum=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const isStr=(v,max)=>typeof v==='string'&&v.length<=max;

function margem(m,where){
  if(!m||typeof m!=='object')throw fail(400,`Margem ausente em ${where}.`);
  const out={};for(const k of ['preco','custo','lucro','vv','parceiro']){if(!isNum(m[k],-1e7,1e7))throw fail(400,`Margem inválida (${k}) em ${where}.`);out[k]=m[k]}
  out.lucroPct=isNum(m.lucroPct,-100,100)?m.lucroPct:0;return out;
}
function opcao(o,where){
  if(!o||typeof o!=='object'||!isStr(o.id,20)||!isStr(o.rotulo,40)||!isNum(o.preco,0,1e7))throw fail(400,`Opção inválida em ${where}.`);
  const p=o.parcelas||{};
  return {id:o.id,rotulo:o.rotulo,percentual:isNum(o.percentual,0,1)?o.percentual:null,preco:o.preco,
    parcelas:{n:isNum(p.n,1,21)?p.n:1,valor:isNum(p.valor,0,1e7)?p.valor:o.preco,total:isNum(p.total,0,1e7)?p.total:o.preco},
    brindes:Array.isArray(o.brindes)?o.brindes.slice(0,5).map(b=>({service:String(b?.service||'').slice(0,80),quantity:isNum(b?.quantity,0,1000)?b.quantity:1})):[],
    margem:margem(o.margem,where)};
}
// Valida e limpa o JSON gerado por docs/black-friday-2026/build-abordagens.mjs.
export function validarAbordagens(raw,exists){
  if(!raw||typeof raw!=='object'||raw.versao!==1||!Array.isArray(raw.clientes))throw fail(400,'Arquivo inválido: esperado o JSON das abordagens (versao 1).');
  if(!raw.clientes.length||raw.clientes.length>200)throw fail(400,'O arquivo precisa ter de 1 a 200 clientes.');
  const vistos=new Set(),faltando=[];
  const clientes=raw.clientes.map((c,i)=>{
    const where=`cliente ${i+1}`;
    if(!c||typeof c!=='object'||!isStr(c.proposalId,80)||!c.proposalId)throw fail(400,`proposalId ausente no ${where}.`);
    if(vistos.has(c.proposalId))throw fail(400,`Orçamento repetido: ${c.numero||c.proposalId}.`);vistos.add(c.proposalId);
    if(!exists(c.proposalId))faltando.push(c.numero||c.proposalId);
    if(!GRUPOS.has(c.grupo))throw fail(400,`Grupo inválido no ${where}.`);
    if(!isStr(c.mensagem,4000)||!c.mensagem.trim())throw fail(400,`Mensagem ausente no ${where}.`);
    if(!Array.isArray(c.opcoes)||c.opcoes.length<1||c.opcoes.length>2)throw fail(400,`Opções inválidas no ${where}.`);
    if(!isNum(c.precoOriginal,0,1e7)||!isNum(c.chance,0,1))throw fail(400,`Preço ou chance inválidos no ${where}.`);
    const tel=String(c.telefone||'').replace(/\D/g,'');
    return {proposalId:c.proposalId,numero:String(c.numero||'').slice(0,40),cliente:String(c.cliente||'').slice(0,120),telefone:tel.length>=10&&tel.length<=15?tel:null,
      cidade:String(c.cidade||'').slice(0,80),bairro:String(c.bairro||'').slice(0,80),servico:String(c.servico||'').slice(0,80),grupo:c.grupo,
      precoOriginal:c.precoOriginal,margemOriginal:margem(c.margemOriginal,where),opcoes:c.opcoes.map(o=>opcao(o,where)),
      chance:c.chance,motivoChance:String(c.motivoChance||'').slice(0,600),trechoCitado:String(c.trechoCitado||'').slice(0,600),mensagem:c.mensagem};
  });
  if(faltando.length)throw fail(400,'Orçamentos que não existem no app: '+faltando.join(', '));
  return {versao:1,validade:isStr(raw.validade,10)?raw.validade:'',divisao:String(raw.divisao||'').slice(0,20),importadoEm:new Date().toISOString(),clientes};
}

export function registerAbordagens(app,{repo}){
  const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
  // A página e o script ficam fora de public/ (o CDN da Hostinger serve public/ sem passar pelo login).
  app.get('/abordagens',(req,res)=>{if(!req.session)return res.redirect(302,'/');res.set(headers).type('html').send(fs.readFileSync(path.join(dir,'pagina.html')))});
  app.get('/abordagens/app.js',(req,res)=>{if(!req.session)return res.status(401).type('text/plain').send('');res.set(headers).type('application/javascript').send(fs.readFileSync(path.join(dir,'pagina.js')))});
  const enviados=()=>repo.config(ENVIADOS_KEY)||{};
  app.get('/api/abordagens',(req,res)=>{
    const dados=repo.config(ABORDAGENS_KEY),vivo={};
    for(const c of dados?.clientes||[]){const q=repo.proposal(c.proposalId,{includeArchived:true}),op=repo.operation(c.proposalId),s=op.schedule;
      vivo[c.proposalId]={existe:!!q,arquivado:!!q&&!repo.proposal(c.proposalId),numero:q?.number||c.numero,status:op.status||'generated',agendamento:s&&s.date?{data:s.date,hora:s.time||''}:null}}
    res.json({dados,enviados:enviados(),vivo});
  });
  app.post('/api/abordagens/importar',(req,res)=>{
    const dados=validarAbordagens(req.body,id=>!!repo.proposal(id,{includeArchived:true}));
    repo.setConfig(ABORDAGENS_KEY,dados);res.json({importados:dados.clientes.length});
  });
  app.put('/api/abordagens/:proposalId/enviado',(req,res)=>{
    const dados=repo.config(ABORDAGENS_KEY),id=req.params.proposalId;
    if(!dados?.clientes.some(c=>c.proposalId===id))throw fail(404,'Cliente não está na lista de abordagens.');
    if(typeof req.body?.enviado!=='boolean')throw fail(400,'Informe enviado: true ou false.');
    const value=repo.transaction(()=>{const all=enviados();if(req.body.enviado)all[id]={em:new Date().toISOString()};else delete all[id];repo.setConfig(ENVIADOS_KEY,all);return all[id]||null});
    res.json({proposalId:id,enviado:value});
  });
}
