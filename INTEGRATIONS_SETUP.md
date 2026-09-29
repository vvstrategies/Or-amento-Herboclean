# Integrações do Herboclean

Implementação local sincronizada do produto Universal para esta instalação Herboclean, por solicitação do usuário. Marca, dados e credenciais próprios foram preservados. Não houve deploy nem autorização externa nesta atualização.

## Acesso e configuração

URL local: http://localhost:3000

- **Configurações → Integrações**: Calendar, Rotas e distância, Google Ads e Meta Ads.
- **Financeiro → Marketing**: gastos, campanhas e detalhamento diário.
- **Financeiro → DRE Gerencial**: Marketing · Mídia paga na composição das despesas.
- **Ver demonstração das integrações** e **Ver demonstração** em Marketing utilizam dados fictícios em memória; não sincronizam nem gravam gastos.

Arquivo de configuração do servidor nesta instalação:
`C:\Users\geved\OneDrive\Área de Trabalho\VV\orçamento\.env`

O modelo é `.env.example`. Para uma instalação nova, copie-o para `.env`; nesta instalação, edite o arquivo existente sem substituí-lo, preservando Calendar e os demais valores. Cadastre secrets diretamente no servidor, nunca no HTML, JavaScript público, chat ou Git. Reinicie o processo desta instalação após alterar as variáveis. Cada empresa usa pasta de dados, chave de criptografia e configurações próprias.

| Variável | Uso |
| --- | --- |
| APP_ORIGIN | Origem exata do sistema. Local: http://localhost:3000; HTTPS obrigatório no modo production |
| PORT | Porta local, 3000 nesta instalação |
| DATA_DIR | Diretório privado do SQLite, PDFs e chave local; preservar o existente |
| HEIGIT_API_KEY | Chave privada por instalação para Pelias e openrouteservice; somente no servidor |
| HEIGIT_API_BASE_URL | Base atual; padrão https://api.heigit.org |
| HEIGIT_DIRECTIONS_DAILY_LIMIT | Limite local de Directions por dia UTC; padrão 100 |
| HEIGIT_GEOCODING_DAILY_LIMIT | Limite local de geocodificação por dia UTC; padrão 100 |
| ROUTE_CACHE_HOURS | Validade do cache de rota; padrão 24 |
| GOOGLE_TOKEN_ENCRYPTION_KEY | Chave estável de 32 bytes em base64 no modo production; compartilhada pelo cofre do servidor |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI / GOOGLE_CALENDAR_ID | Integração Calendar/Drive existente, mantida separada |

Em desenvolvimento, o cofre usa `data/token-key` quando não há chave no ambiente. **Não troque nem apague a chave de uma instalação conectada**: tokens já persistidos dependem dela. Preserve-a no backup privado da instalação. Exportações comerciais e financeiras não incluem tokens.

## Callbacks exatos

Para APP_ORIGIN=http://localhost:3000:

- Calendar/Drive: `http://localhost:3000/api/google/callback`
- Google Ads: `http://localhost:3000/api/integrations/google-ads/callback`
- Meta Ads: `http://localhost:3000/api/integrations/meta-ads/callback`

Os callbacks de anúncios derivam de APP_ORIGIN. Cadastre cada URI exatamente no aplicativo correspondente. A autorização deve começar pelo botão do sistema, com a sessão do administrador aberta no mesmo navegador; o retorno valida sessão, provedor, expiração e uso único do state.

Em hospedagem futura, use a origem HTTPS aprovada. Se o painel da Meta não aceitar HTTP/localhost no modo de desenvolvimento escolhido, será necessário um endereço HTTPS de teste autorizado antes da validação real; não foi criado túnel ou deploy nesta etapa.

## Rotas e distância — openrouteservice / HeiGIT

Configure uma chave própria desta instalação em `HEIGIT_API_KEY` no `.env` e reinicie o servidor. A chave é usada somente no backend; ela não é enviada ao navegador, PDF, banco comum ou logs.

O sistema usa `GET https://api.heigit.org/pelias/v1/search` para endereço → coordenadas e `POST https://api.heigit.org/openrouteservice/v2/directions/driving-car` para Directions. Para Directions são enviados somente origem e destino na ordem `[longitude, latitude]`; preço, custos, margem, observações, nome, telefone e e-mail não são enviados.

O endereço operacional é cacheado quando a empresa é salva. O endereço do atendimento é cacheado por orçamento no primeiro cálculo. A rota é cacheada por provider + origem + destino + perfil. Endereços alterados usam uma nova chave; estimativas históricas mantêm seus snapshots. Recalcular rota ignora o cache. Ida e volta continua sendo calculada internamente com uma única distância de ida.

Em **Configurações → Integrações**, a Central mostra Directions, geocoding, reutilizações de cache, falhas e recálculos; quota restante aparece somente quando o provider a informa. Sem chave, em caso de 429, timeout, erro do provider ou endereço ambíguo, informe a distância manualmente e o orçamento continua disponível.

Atribuição exibida na Central: © openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors. Consulte https://api.heigit.org/ e https://staging.openrouteservice.org/terms-of-service/.

## Google Ads

1. Prepare um projeto Google Cloud para a integração e habilite/solicite o acesso à **Google Ads API** correspondente ao projeto.
2. Configure o consentimento OAuth e um cliente do tipo **Aplicativo da Web**, dedicado a anúncios, preferencialmente em projeto Cloud separado do Calendar/Drive.
3. Cadastre o callback Google Ads acima. Durante os testes com público externo, adicione o administrador como usuário de teste. Complete as exigências de verificação/publicação aplicáveis ao público definitivo.
4. Configure GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET no backend e reinicie.
5. Em Integrações, clique **Conectar Google Ads** e autorize uma conta com acesso aos anúncios.
6. Clique **Selecionar conta**, escolha a conta anunciante, confira moeda/fuso e use **Testar conexão**.
7. Faça a primeira sincronização de 30 ou 90 dias. A interface também permite um período de até 90 dias por consulta.

Escopo exclusivo: `https://www.googleapis.com/auth/adwords`. OAuth Authorization Code com PKCE S256; tokens de acesso e renovação criptografados no servidor. O escopo oficial é amplo, mas o adaptador implementa somente consultas, sem criar/editar campanhas.

O adaptador lista contas acessíveis diretamente e clientes de contas gerenciadoras (MCC), preservando `login-customer-id` quando necessário. Uma conta ativa por instalação/provedor. Contas anteriores continuam no histórico. Consulte as permissões da conta se a listagem vier vazia.

**Atualização importante da API:** a política oficial informa o encerramento dos developer tokens em 09/09/2026; o acesso passou a ser identificado pelo projeto Google Cloud proprietário das credenciais OAuth. Por isso esta implementação não exige GOOGLE_ADS_DEVELOPER_TOKEN nem envia o header antigo. Em caso de CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION, regularize o acesso do projeto, não o token antigo. Algumas páginas anteriores de autenticação ainda contêm instruções legadas.

Referências: [política atual de developer tokens/acesso](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [versões da API](https://developers.google.com/google-ads/api/docs/release-notes), [contas acessíveis](https://developers.google.com/google-ads/api/docs/account-management/listing-accounts), [paginação](https://developers.google.com/google-ads/api/docs/reporting/paging).

## Meta Ads

1. Configure um aplicativo Meta apropriado para Marketing API/Facebook Login, associado à empresa responsável.
2. Configure o login OAuth no servidor e o callback Meta acima. Cadastre os domínios/URIs e os dados de privacidade exigidos pelo painel.
3. Solicite somente **ads_read** para esta funcionalidade. O código não pede ads_management nem altera campanhas.
4. Em desenvolvimento, valide com um usuário que tenha papel de teste/admin no aplicativo e acesso à conta de anúncios. Para uso por pessoas fora desses papéis, conclua a revisão e o nível de acesso exigidos pela Meta.
5. Configure META_APP_ID e META_APP_SECRET e reinicie.
6. Use **Conectar Meta Ads**, selecione a conta anunciante e teste a conexão.
7. Importe 30/90 dias e confira os valores contra o Ads Manager.

O backend troca o código por token e solicita a versão de longa duração; valida ads_read. Chamadas de leitura usam Authorization Bearer e appsecret_proof. Expiração/revogação pede reconexão; não há renovação silenciosa infinita do token Meta.

Insights em nível de campanha, time_increment=1: gasto, moeda, impressões e cliques. A paginação usa somente o cursor recebido no host oficial; URLs arbitrárias de próxima página não são seguidas. Não se soma indiscriminadamente o campo actions para fingir conversões/vendas.

Referências: [Insights API](https://developers.facebook.com/docs/marketing-api/insights/), [autenticação Marketing API](https://developers.facebook.com/docs/marketing-api/get-started/authentication/), [SDK oficial Meta, versão e transporte](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/api.js), [campos de Ads Insights](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ads-insights.js). As páginas Meta limitaram a consulta automatizada nesta etapa; versão e campos foram conferidos no SDK oficial. Consentimento/revisão do aplicativo e respostas reais serão validados após cadastrar as credenciais.

## Gastos, sincronização e DRE

- Fatos diários em centavos inteiros, separados das despesas manuais. Google cost_micros é convertido por divisão de 10.000 com arredondamento; valores decimais Meta são convertidos sem multiplicação imprecisa de ponto flutuante.
- Unicidade: **provedor + conta anunciante + campanha + dia**. UPSERT em transação impede duplicação do mesmo período.
- Uma consulta completa é validada antes de gravar. Erro em qualquer página preserva os fatos anteriores. Linhas antigas que desaparecem de um relatório completo do mesmo período são zeradas com auditoria.
- Mudanças, inclusive 100 → 107, deixam revisão antes/depois, execução, data e conta de origem.
- Histórico de execuções com período, quantidade inserida/alterada, sucesso/falha e código seguro. Último sucesso fica visível mesmo após erro. Operação por provedor protegida por lease renovável; uma execução abandonada é marcada como interrompida quando o lease permite retomar.
- Períodos são dias no fuso da conta, sem converter a data para UTC. Moeda vem da conta/plataforma.
- Moedas diferentes de BRL ficam no histórico e em aviso no Marketing, **fora da DRE em BRL**, sem câmbio automático.
- A DRE soma mídia em Marketing · Mídia paga por mês e plataforma. Usa linhas virtuais de origem Google Ads/Meta Ads, sem gerar uma despesa manual por campanha/dia. Despesas automáticas não têm edição manual; corrija na fonte e sincronize.
- Despesas manuais potencialmente relacionadas a anúncios geram alerta de possível duplicidade no lançamento e na DRE. O sistema não apaga nem ignora um lançamento manual por conta própria; confira e cancele o duplicado se for o caso.
- Sincronização de períodos passados pode ajustar a DRE passada: a auditoria registra a revisão e o horário. Estimativas/custos dos serviços, propostas, PDFs e eventos existentes não são reescritos.
- Conversões Google ficam rotuladas como métricas da plataforma. Conversões Meta não são inferidas. Nenhuma vira receita do sistema. Não há ROI/ROAS interno inventado.
- Desconectar remove os tokens locais e tenta revogar a autorização externa, preservando gastos e auditoria. Se a revogação externa falhar, a interface informa como concluir na plataforma. Se Calendar e Ads estiverem conectados ao mesmo tempo, a desconexão apaga somente os tokens locais da integração escolhida; a revogação externa fica manual, evitando invalidar a outra conexão. Isso é conservador mesmo com projetos diferentes. Para isolamento externo completo, use projetos Google Cloud separados. A revogação Google pode remover todos os escopos e tokens dos clientes do mesmo projeto: [documentação oficial de revogação](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).

### Rotina diária

Desativada por padrão. Ative explicitamente em Configurações → Integrações. Janela padrão: últimos 7 dias, ajustável entre 1 e 30 dias.

O servidor verifica a rotina a cada minuto e faz uma tentativa por dia de cada conta, no fuso dela, enquanto estiver ligado. Reconsulta dias recentes para incorporar ajustes. Falhas ficam no histórico e podem ser repetidas manualmente; não há loop de retries diários ilimitado.

Alternativa de automação externa: executar `npm.cmd run integrations:sync` (Windows) ou `npm run integrations:sync` no diretório da instalação, com o mesmo DATA_DIR e ambiente privado. A rotina respeita a ativação e o controle de uma tentativa/dia. Não há endpoint cron público. Não foram criados Workers, cron remoto ou tarefa agendada nesta máquina.

Paginação limitada a 100 páginas/100.000 linhas por consulta; até três tentativas em falhas HTTP transitórias/limite, espera progressiva limitada. Timeout por chamada de anúncios: 20 segundos; openrouteservice: 10 segundos. Uma resposta Retry-After maior que o limite de espera encerra com aviso de quota. Operações muito grandes devem ser divididas em períodos menores.

## Auditoria e migrations

Arquitetura encontrada: Express, JavaScript no navegador, SQLite local, PDFs privados em arquivos, cofre AES-256-GCM, sessões de administrador e CSRF. A integração existente usa Calendar/Drive com OAuth separado; a Routes API já tinha uma primeira versão. Não há Workers, D1, R2, job remoto ou armazenamento de tokens no frontend nesta instalação. A pasta não é um repositório Git ativo; não há remoto configurado a atualizar.

Não foram encontrados campos de atribuição UTM/gclid/gbraid/wbraid/fbclid na implementação própria anterior. Preparados `proposal_attribution` e `backend/attribution-model.js`, com provider, campaignId, campaignName, source, medium e campos de tracking opcionais. Estrutura privada reservada: ainda não captura tracking automaticamente nem atribui receita.

Migration aditiva e idempotente, executada no createApp:

- integration_connections — metadados seguros e secret criptografado separado;
- integration_oauth_states — state com hash, sessão, provedor, expiração e verificador;
- integration_accounts — contas consultadas por conexão;
- integration_sync_runs — histórico de execuções;
- ad_spend_daily — fatos com chave única;
- ad_spend_revisions — antes/depois de mudanças;
- proposal_attribution — estrutura reservada, sem backfill inventado;
- índices de período e execução; marcador integrations-schema-version=1.

finance_routes e finance_route_usage existentes foram reutilizadas. Nenhuma tabela de propostas, operações, custos ou períodos foi recriada. Backup prévio consistente e comparações documentados em `docs/ATUALIZACAO-RENTABILIDADE-INTEGRACOES.md`.

## Arquivos e validação

Novos módulos: `backend/integration-*.js`, `backend/ad-spend-providers.js`, `backend/route-cache.js`, `backend/attribution-model.js`; interface `public/integrations.js` e `public/integrations.css`; rotina `scripts/sync-integrations.mjs`; testes `scripts/check-integrations.mjs` e `scripts/check-integrations-browser.cjs`.

Pontos adaptados: `backend/app.js`, `backend/routes-provider.js`, `backend/finance-service.js`, `backend/dre-service.js`, `backend/dre-export.js`, `backend/google.js`, `server.js`, `public/dre.js`, `public/workspace.js`, template e cópias sincronizadas de index.html, `.env.example`, `.gitignore`, `package.json`, testes de financeiro/navegador e README. O `.env` real não foi modificado.

Comandos locais:

```text
npm.cmd run check
npm.cmd test
npm.cmd run test:browser
```

A suíte usa bancos temporários, respostas HTTP simuladas e navegador oculto em desktop/mobile. Nenhum teste usa as credenciais da empresa. O resultado final e a conferência de preservação constam em `docs/ATUALIZACAO-RENTABILIDADE-INTEGRACOES.md`.

## Erros e pendências externas

- **Não configurado:** preencha as variáveis no backend e reinicie esta instalação.
- **ACCESS_DENIED / 403:** confira usuário de teste, consentimento, papéis e acesso à conta; não remova a proteção OAuth para contornar.
- **PROJECT_ACCESS:** revise o acesso Google Ads do projeto Cloud.
- **RECONNECT:** autorize novamente e confirme a conta selecionada.
- **API_DISABLED / BILLING / INVALID_KEY:** confira API, faturamento e restrições da chave de rotas.
- **QUOTA:** aguarde a janela da plataforma ou ajuste limites no painel; cache válido continua disponível.
- **CURRENCY:** dados importados em moeda diferente de BRL estão excluídos da DRE.
- **INTERRUPTED:** uma execução parou antes de terminar. Refaça a sincronização.
- **REVOCATION_SHARED:** desconexão local concluída; autorização externa preservada para não afetar a outra integração Google. Revogue manualmente somente quando puder reconectar as integrações do projeto.
- **REVOKE_FAILED:** acesso local já removido; conclua a revogação no painel da plataforma.

Ponto de parada: cadastrar credenciais/aplicativos, concluir permissões/revisões externas e validar as primeiras consultas reais. Essas etapas não foram simuladas como sucesso na instalação da empresa. Nenhum deploy foi realizado.
