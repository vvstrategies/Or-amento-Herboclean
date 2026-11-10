// Páginas públicas exigidas pela tela de consentimento do Google: Política de Privacidade e Termos de Uso.
// O texto usa os dados da empresa cadastrados em Configurações; nada de dado de cliente aparece aqui.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=(title,company,body)=>`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(company.name)}</title>
<style>:root{color-scheme:light dark}body{margin:0;font:16px/1.65 system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f8f4;color:#13241c}main{max-width:760px;margin:0 auto;padding:40px 20px 64px}h1{font-size:28px;line-height:1.2;margin:0 0 6px}h2{font-size:18px;margin:28px 0 6px}p,li{margin:0 0 10px}small{color:#5b6b62}a{color:#044c3a}@media(prefers-color-scheme:dark){body{background:#0e1713;color:#e5eee8}small{color:#9fb2a7}a{color:#7fd1b0}}</style></head>
<body><main><h1>${esc(title)}</h1><p><small>${esc(company.name)} · última atualização em 10/11/2026</small></p>${body}</main></body></html>`;
const contact=c=>[c.email&&`e-mail <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`,c.phone&&`telefone ${esc(c.phone)}`].filter(Boolean).join(' ou ')||'os canais informados nas propostas';

export function privacyPage(company){
  return page('Política de Privacidade',company,`
<p>Este sistema é usado pela equipe da ${esc(company.name)} para preparar orçamentos, agendar atendimentos e acompanhar resultados. Esta política explica quais dados são tratados e como, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
<h2>Dados tratados</h2>
<ul><li>Dados de clientes informados pela equipe: nome, telefone, e-mail, aniversário, endereço do atendimento e, para empresas, razão social e CNPJ.</li>
<li>Fotos dos itens a serem higienizados, anexadas ao orçamento.</li>
<li>Dados das contas conectadas pela própria equipe: Google Agenda, Google Drive, Google Contatos, Google Ads, Meta Ads e Asaas.</li></ul>
<h2>Uso das contas Google</h2>
<ul><li><b>Google Agenda</b>: criar, atualizar e cancelar os eventos dos atendimentos agendados no sistema.</li>
<li><b>Google Drive</b>: guardar os PDFs das propostas em uma pasta criada pelo próprio sistema (acesso apenas aos arquivos que ele criou).</li>
<li><b>Google Contatos</b>: somente leitura, quando alguém da equipe clica em “Importar contato” para preencher o cadastro de um cliente. Apenas o contato escolhido é copiado para o formulário; a lista de contatos não é armazenada.</li>
<li><b>Google Ads</b>: leitura do gasto das campanhas para calcular custo por orçamento e retorno do investimento.</li></ul>
<p>O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google seguem a <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener">Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado. Esses dados não são vendidos, não são usados para publicidade e não são usados para treinar modelos de inteligência artificial.</p>
<h2>Armazenamento e segurança</h2>
<p>Os dados ficam no servidor do sistema. As autorizações das contas conectadas são guardadas criptografadas e nunca são exibidas no navegador. O acesso ao sistema exige senha.</p>
<h2>Compartilhamento</h2>
<p>Os dados só são enviados aos serviços que a própria equipe conectou e na medida necessária para a função descrita acima (por exemplo, o endereço do atendimento ao serviço de rotas para calcular a distância, ou os dados de cobrança ao Asaas).</p>
<h2>Seus direitos</h2>
<p>Você pode pedir acesso, correção ou exclusão dos seus dados, ou revogar uma autorização a qualquer momento. A autorização do Google também pode ser revogada em <a href="https://myaccount.google.com/permissions" rel="noopener">myaccount.google.com/permissions</a>.</p>
<h2>Contato</h2>
<p>Fale com a ${esc(company.name)} pelo ${contact(company)}.</p>`);
}
export function termsPage(company){
  return page('Termos de Uso',company,`
<p>Este sistema é de uso interno da equipe da ${esc(company.name)} para elaboração de orçamentos, agendamento e gestão comercial dos atendimentos.</p>
<h2>Acesso</h2><p>O acesso é restrito a pessoas autorizadas pela empresa, mediante senha. Quem usa o sistema é responsável pelos dados que cadastra e pelas contas que conecta.</p>
<h2>Contas conectadas</h2><p>As integrações com Google, Meta Ads e Asaas são opcionais e podem ser desconectadas a qualquer momento em Configurações. O sistema usa essas contas apenas para as funções descritas na <a href="/privacidade">Política de Privacidade</a>.</p>
<h2>Propostas</h2><p>Valores, condições e prazos das propostas são definidos pela empresa em cada orçamento e valem conforme o que estiver no documento enviado ao cliente.</p>
<h2>Disponibilidade</h2><p>O sistema depende de serviços de terceiros (Google, Asaas, serviço de rotas). Indisponibilidades desses serviços podem afetar temporariamente algumas funções.</p>
<h2>Contato</h2><p>Dúvidas sobre estes termos: ${contact(company)}.</p>`);
}
export function registerPublicPages(app,companyOf){
  const send=render=>(req,res)=>{const c=companyOf()||{};res.set('Cache-Control','public, max-age=3600').type('html').send(render({name:c.name||'Empresa',email:c.email||'',phone:c.phone||''}))};
  app.get(['/privacidade','/privacy'],send(privacyPage));
  app.get(['/termos','/terms'],send(termsPage));
}
