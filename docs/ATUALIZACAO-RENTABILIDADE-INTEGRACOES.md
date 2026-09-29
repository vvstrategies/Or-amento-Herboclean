# Herboclean — rentabilidade e integrações

Atualização local em 22/09/2026, solicitada pelo usuário para igualar as últimas funcionalidades do Universal. A instalação mantém seu banco, marca, credenciais e dados.

## Acesso

**http://localhost:3000**

- Configurações → Integrações: Calendar, Maps, Google Ads e Meta Ads.
- Financeiro → Marketing: gastos por plataforma/campanha/dia e integração com a DRE.
- Financeiro → Inteligência / Rentabilidade: serviços, cidades, clientes, estimado × realizado e precificação.
- No atendimento: dados para análise, simulador de preço/desconto e registro opcional de custos reais após conclusão.
- Configurações: premissas de rentabilidade, margem mínima, durações e metas.

As taxas e condições Asaas existentes foram mantidas. A simulação não altera o preço sem a ação explícita de aplicar. Custos e dados de marketing continuam privados, fora da proposta/PDF comercial.

## Paridade e adaptações

Os módulos de domínio, cálculo, migração, provedores e painéis foram replicados do Universal. Foram conferidos 27 módulos compartilhados idênticos por hash. Adaptações específicas preservadas:

- Porta e origem locais 3000, título/produto Herboclean.
- Banco data/ecoclean.sqlite, cookies e armazenamento do navegador existentes.
- Logo/assets, cores, catálogo, textos e configurações da empresa.
- Adaptador de adoção da instalação existente: sem exigir novo onboarding.
- Credenciais e chave local próprias, sem transferência de dados do Universal.

A instalação Universal não foi modificada nesta replicação: 160 arquivos de código/configuração/documentação conferidos.

## Banco e segurança

Dez tabelas aditivas: finance_actuals, finance_contexts, finance_goals, integration_connections, integration_oauth_states, integration_accounts, ad_spend_daily, integration_sync_runs, ad_spend_revisions e proposal_attribution. Nenhuma tabela antiga recriada. SQLite integrity_check: ok.

Backup consistente antes da atualização:
`C:\Users\geved\OneDrive\Área de Trabalho\VV\orçamento\data\backups\rentabilidade-integracoes-1790107064732`

Todas as tabelas anteriores comparadas sem alterações, incluindo:
- 6 propostas;
- 6 operações/agendamentos;
- 7 PDFs, também conferidos por hash;
- 5 referências de arquivos no Drive;
- 2 reconhecimentos de receita e 2 períodos financeiros.

.env, chave de criptografia, senha/conta Google, configurações comerciais e identidade preservados. Nenhum dado fictício foi gravado nas tabelas novas. Backup parcial de tentativas interrompidas foi descartado após a conclusão do backup válido.

## Testes

- npm.cmd run check: PASS, 90 arquivos JavaScript.
- npm.cmd test: PASS, nove suítes incluindo atualização da Herboclean, rentabilidade e integrações.
- npm.cmd run test:browser: PASS, desktop 1512 px e celular 390 px; console sem erros.
- Página, profit.js e integrations.js: HTTP 200.
- APIs privadas e guia sem autenticação: HTTP 401.
- Tokens/credenciais externos não foram usados nos testes; provedores simulados e bancos temporários.

Relatório verificável com arquivos alterados, contagens e comparação:
[herboclean-latest-verification.json](herboclean-latest-verification.json).

## Ativação das conexões reais

O código está presente, mas as novas conexões Maps/Ads/Meta dependem das credenciais próprias da Herboclean e da autorização de suas contas. A conexão Calendar/Drive existente foi preservada.

[Guia com variáveis, secrets e callbacks desta instalação](../INTEGRATIONS_SETUP.md).

Callbacks de anúncios:
- http://localhost:3000/api/integrations/google-ads/callback
- http://localhost:3000/api/integrations/meta-ads/callback

Sincronização diária desativada por padrão; requer ativação após conferir a primeira importação. Cache Routes de 24 horas e distância manual disponíveis. Gastos importados são atualizados sem duplicação, moedas não BRL ficam fora da DRE, e possíveis despesas manuais duplicadas geram aviso.

Nenhum deploy nem alteração de campanhas foi realizado. Os testes reais de consentimento e consultas externas ficam para depois da configuração das credenciais.
