# Fase 1 — Custos e rentabilidade por atendimento

## Objetivo e acesso
Versão local do **orcamento-universal**, em http://localhost:3100. Entre com a senha existente.

- **Configurações → Custos e rentabilidade**: materiais, percentuais por serviço, endereço de saída, ida e volta e veículo.
- **Orçamentos → Ver orçamento → Rentabilidade estimada**: cálculo, composição, distância, custos manuais e versões.
- **Ver exemplo BlueCare**, nas configurações financeiras: demonstração fictícia sem gravar propostas, mudar premissas ou consultar APIs.

Não há deploy de produção nesta fase. A instalação original da Herboclean não recebe estas alterações.

## Definição de receita e custo
A receita estimada é o **valor PIX/base** de `EcoModel.totals(q).pix`, centralizado em `quotedRevenue`. Os preços comerciais e o cálculo de cartão existentes permanecem iguais. O preço de cartão usa gross-up para compensar taxas; como o meio de pagamento efetivo ainda não é conhecido, `paymentFeeCost = 0`. Não descontamos uma taxa novamente do preço-base.

Custo direto estimado inclui materiais, combustível, desgaste do veículo, pedágio, estacionamento, outros deslocamentos e custos adicionais descritos pelo usuário. Margem de contribuição estimada é receita menos esses custos. Não é lucro líquido, resultado contábil nem confirmação de recebimento.

A interface diferencia valor orçado, receita contratada e receita operacional conforme o status. Não foi adicionado dashboard agregado nem informação financeira aos cards; o detalhe concentra os custos.

## Cálculo e precisão
Dinheiro é armazenado em **centavos inteiros**; percentuais em pontos-base (20% = 2000); distâncias em metros; consumo em centésimos de km/L (11,5 = 1150).

Os produtos e divisões financeiras usam inteiros BigInt com arredondamento metade para cima. O total de litros não é arredondado antes de calcular combustível. Valores ausentes não viram custo zero silenciosamente: a estimativa fica incompleta, mostra as pendências e não apresenta margem até resolvê-las.

- Materiais por item = receita base do item × percentual / 100; soma dos custos arredondados por item. Percentual específico do serviço tem preferência sobre o padrão global.
- Distância total = distância de ida × 2, quando ida e volta está habilitada (padrão).
- Litros = distância total em km ÷ consumo em km/L.
- Combustível = litros × preço por litro.
- Custo operacional do veículo = distância total em km × custo adicional por km.
- Deslocamento = combustível + veículo + pedágio + estacionamento + outros deslocamentos.
- Custo direto = materiais + deslocamento + demais custos diretos + taxa financeira (zero nesta fase).
- Margem = receita − custo direto.
- Margem percentual = margem ÷ receita × 100. Com receita zero, o percentual fica indefinido (“—”), sem divisão inválida.

Percentuais, distância e custos negativos são rejeitados. Margem negativa é permitida: mostra que os custos estimados excedem a venda.

### Cenário BlueCare
Dados fictícios: origem Carapicuíba, destino Osasco; ida simulada de 18 km; consumo 11,5 km/L; combustível R$ 6,19/L; veículo R$ 0,30/km; materiais 20%.

| Componente | Valor |
| --- | ---: |
| Receita base | R$ 400,00 |
| Materiais | R$ 80,00 |
| Distância considerada | 36 km |
| Combustível | R$ 19,38 |
| Veículo | R$ 10,80 |
| Custo direto | R$ 110,18 |
| Margem de contribuição | R$ 289,82 |
| Margem percentual | 72,46% |

O briefing exemplificava R$ 19,37 de combustível. Com precisão integral, 36 ÷ 11,5 × 6,19 = 19,377391..., arredondado para **R$ 19,38**. A diferença de um centavo é intencional.

## Configurações
Materiais e dados reais do veículo começam sem valor presumido. O custo adicional por km começa em zero. A origem usa a localização da empresa, podendo ser substituída pelo endereço da garagem/base. Caso a empresa tenha apenas uma região cadastrada, informe um endereço de saída completo antes de usar rota automática.

Um veículo padrão possui identificador próprio no snapshot, nome, combustível, consumo, preço e custo adicional. Não depende de API de veículos ou postos. Este MVP não implementa gestão de frota.

No atendimento é possível:
- informar distância manual;
- desconsiderar combustível/distância e custo por km, mantendo custos adicionais explicitamente informados;
- substituir materiais por valor manual, conservando a referência calculada;
- registrar pedágio, estacionamento, outros deslocamentos e até 30 custos diretos com descrição;
- optar por novas premissas ou preservar as premissas da última versão.

## Modelagem e migração
Migração aditiva `backend/finance-migration.js`, versão 1, aplicada idempotentemente na inicialização:

| Estrutura | Finalidade |
| --- | --- |
| `config.financial-settings-v1` | Premissas financeiras, incluindo um veículo padrão |
| `finance_estimates` | Versões de estimativa por proposta, snapshots, entradas e resultados |
| `finance_routes` | Distância/duração de rota rodoviária e origem/destino |
| `finance_route_usage` | Contagem diária de tentativas externas para limitar consumo |

A chave estrangeira associa a estimativa à proposta. Nenhuma coluna financeira é adicionada ao snapshot comercial ou ao PDF. `kind: estimate`, `actual: null` e a versão do schema preparam a evolução para realizado, sem implementar essa fase agora.

Foi criado backup consistente de SQLite em `data/backups/before-finance-*.sqlite` antes de ativar a migração. Os dados continuam exclusivos desta instalação.

## Snapshots e histórico
Cada gravação explícita gera uma versão com:
- premissas de material/serviço e veículo;
- origem e destino utilizados;
- distância, provedor, duração, data da rota e origem manual/automática;
- ajustes manuais, referência automática de materiais e custos adicionais;
- receita, resultado, revisão comercial e data do cálculo.

Alterações em Configurações não recalculam documentos históricos. A interface mostra última versão e versão anterior; o banco conserva todas as versões gravadas.

Recálculo e consulta nova de rota só são permitidos em orçamento **em elaboração** (`generated`), sem operação pendente. Agendados/aprovados, concluídos e cancelados conservam seus números. Se um atendimento voltar explicitamente à elaboração, uma nova versão poderá ser criada; as anteriores continuam guardadas.

Alterar endereço ou itens da proposta marca a estimativa como desatualizada. Em orçamento aberto, a margem desatualizada deixa de aparecer como resultado atual. A distância anterior não pode ser reutilizada silenciosamente para outro destino. Mudar a origem ao optar por premissas atuais também exige nova rota ou confirmação da distância manual.

Revisão do orçamento, versão financeira e bloqueio por proposta protegem contra conflitos entre abas e ações de agendamento.

## Rota automática e alternativa manual
A abstração `RouteProvider` retorna distância em metros e duração em segundos. O cálculo financeiro só consome esses valores; não depende de Google.

O adaptador inicial usa **Google Maps Platform Routes API v2 — Compute Routes**:
- POST `https://routes.googleapis.com/directions/v2:computeRoutes`;
- origem e destino por endereço;
- modo `DRIVE`, preferência `TRAFFIC_UNAWARE`;
- máscara de resposta `routes.distanceMeters,routes.duration`;
- timeout de 10 segundos; sem alternativas, otimização ou pedágios automáticos.

Documentação oficial consultada:
- [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions)
- [Uso, cobrança e limites](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Tabela de preços](https://developers.google.com/maps/billing-and-pricing/pricing)

### Ativação futura e custos
**Não habilitado nesta entrega. Nenhuma chamada externa real foi executada.**

Calendar OAuth não autoriza este recurso. Para ativar, é necessário um projeto com Routes API e faturamento habilitados e uma chave própria de servidor, com restrições adequadas à API e ao ambiente. Configure no `.env` desta instalação, sem compartilhar a chave:

```dotenv
ROUTES_ENABLED=false
GOOGLE_ROUTES_API_KEY=
ROUTES_DAILY_LIMIT=100
```

A chamada só é liberada com `ROUTES_ENABLED=true` **e** chave presente. A chave nunca é enviada ao navegador ou gravada no snapshot.

Na tabela global consultada em 18/09/2026, Compute Routes Essentials tem franquia de **10.000 eventos mensais**, e a primeira faixa paga custa **US$ 5 por 1.000 eventos**. Preços, região e contrato devem ser confirmados antes da ativação. Tráfego em tempo real e outros recursos podem mudar o SKU; este adaptador não os solicita. O limite documentado do Compute Routes é 3.000 consultas/minuto. O sistema aplica adicionalmente um teto local de 100 tentativas/dia por padrão; isso não é garantia de custo zero. Configure também cotas e alertas no Google Cloud.

A API só é consultada ao clicar **Calcular deslocamento**. Abrir cards, navegar, gerar PDF e consultar histórico não dispara rotas. Origem/destino/provedor idênticos reutilizam cache local de até 24 horas; consultas em andamento são agrupadas no processo. Snapshots antigos conservam os dados usados no cálculo. Antes de ativar em produção, confirme as condições de armazenamento/retensão do provedor e configure uma política compatível.

Se não houver chave, ocorrer erro, endereço não reconhecido ou limite atingido, o usuário recebe uma mensagem e pode informar a distância de ida manualmente. Nunca usamos distância em linha reta.

## Separação comercial e privacidade
Os novos endpoints só são registrados depois dos bloqueios de autenticação, CSRF e configuração obrigatória. A aplicação atual possui um administrador; não foi criada hierarquia adicional de papéis.

- APIs privadas de configurações e estimativas separadas de `/api/proposals`.
- `EcoModel.toPublicProposal` é a barreira explícita de campos permitidos.
- A serialização comercial é aplicada no backend, na entrada do gerador de PDF e no download/preview.
- O renderizador recebe somente dados comerciais.
- O financeiro é montado no detalhe interno, fora de `#proposal`, e ocultado na impressão.
- Eventos Calendar e anexos Drive continuam derivados exclusivamente da proposta comercial.
- Logs não incluem chaves ou endereços de rota.

Testes inserem campos internos em vários níveis de uma proposta e verificam sua ausência no objeto realmente enviado ao renderizador. Um PDF já gerado também permanece byte a byte igual após editar a estimativa financeira.

## Exportação e recuperação
**Exportar histórico financeiro** gera JSON privado com todas as versões e premissas, para consulta e guarda. Não contém secrets, mas contém custos e endereços internos; não deve ser enviado ao cliente.

O backup comercial existente continua exportando/importando propostas, fotos, status e PDFs. Nesta fase ele não transporta custos. A importação de JSON financeiro ainda não está implementada. Para recuperação integral desta instalação, preserve o diretório `data/` com backup consistente do SQLite, PDFs e chave local. A cópia SQLite anterior à migração está guardada, mas não substitui backups regulares posteriores.

## Validação realizada
- `npm run check`: sintaxe de todos os arquivos JavaScript próprios; o projeto não tem pipeline de build, lint nem compilador TypeScript configurado. O domínio financeiro possui contratos JSDoc e tipos em `finance-types.d.ts`, além de validação de runtime.
- `npm test`: suíte existente e nova suíte financeira.
- `npm run test:browser`: Edge com perfil e banco temporários, inclusive desktop/celular.
- Cenário BlueCare, materiais por item, dinheiro/arredondamento, zero, negativos, custos manuais, ausência de premissas.
- Snapshots 20% → 15%, recálculo explícito, preservação de versão anterior.
- Endereço A → B, mudança de origem, cache, teto diário, erros e fallback.
- Acesso sem sessão, CSRF, bloqueio após agendamento/conclusão/cancelamento.
- Privacidade comercial/PDF e persistência após reabrir banco.
- Interface de premissas, exemplo BlueCare, cálculo manual, custos adicionais, histórico, navegação e fluxos de orçamento/agenda já existentes.

As rotas e serviços Google nos testes são simulados. A API real depende de credenciais e ativação posterior.

## Arquivos novos e alterados
Novos:
- `backend/finance-domain.js`, `finance-types.d.ts`: cálculo e contratos.
- `backend/finance-migration.js`: schema aditivo.
- `backend/finance-service.js`: snapshots, histórico, estado, cache e limites.
- `backend/routes-provider.js`: adaptador Google Routes.
- `backend/finance-demo.js`: demonstração fictícia.
- `public/finance.js`, `finance.css`: interface interna.
- `scripts/check-finance.mjs`, `check-syntax.cjs`: verificação.
- Este documento e registros de conferência.

Alterados:
- `backend/app.js`, `server.js`, `.env.example`: APIs e integração opcional.
- `backend/database.js`, `backend/service.js`, `public/model.js`, `utils/ecocleanPdf.js`, `public/pdf-download.js`, `public/pdf-renderer.js`: fronteira comercial explícita.
- `public/workspace.js`, `templates/index.html`, `public/index.html`, `index.html`: seção financeira autenticada.
- `scripts/check-workspace.cjs`, `package.json`: testes.
- `README.md`, `templates/README.md`: orientação.

## Limites do checkpoint
Sem deploy, ativação paga, DRE, despesas fixas, recebimentos, cálculo fiscal, gestão de frota, rota entre clientes, otimização ou dados realizados. Uma ida e volta estima o retorno como o dobro da ida. Trânsito e assimetria de trajeto não entram no cálculo. Não há pedágio automático.

A próxima etapa depende da validação deste checkpoint local pelo usuário.

