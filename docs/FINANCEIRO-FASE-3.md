# Fase 3 — Inteligência de rentabilidade e precificação

Módulo de rentabilidade replicado do Universal para a instalação **Herboclean**. Marca e dados próprios preservados. Nenhuma implantação em produção foi feita.

## Acesso e roteiro de validação

URL: http://localhost:3000/#financeiro. Iniciador: `start.bat` nesta pasta.

1. Em **Configurações → Inteligência e precificação**, confira margem alvo (padrão 70%), mínimo opcional, durações e classificação das despesas.
2. Abra um orçamento na biblioteca. Calcule a estimativa interna. **Dados para análise** permite informar cidade, UF, bairro, identificador do cliente e tempo previsto.
3. Use **Simular preço e desconto**. Simular não salva preços. **Aplicar [total] ao orçamento** é a confirmação explícita. Recalcule a estimativa depois de aplicar; custos percentuais podem mudar.
4. Aprove e agende. Após executar o serviço, use **Marcar como concluído**, confirmando a data. A opção **Registrar custos reais após concluir** é desmarcada por padrão.
5. Preencha receita final, materiais, deslocamento, outros custos e tempo real. Valores iniciais são sugestões da estimativa. Limpar um campo preserva o fallback. Confirme o tempo sugerido pela agenda somente se corresponder ao realizado.
6. No **Financeiro → Inteligência / Rentabilidade**, explore visão geral, serviços, regiões, clientes, estimado × realizado e precificação. Clique nos indicadores e nomes para ver os atendimentos envolvidos.
7. Defina metas mensais e confira realizado, projeção e atingimento. Use **Ver demonstração** para explorar seis casos fictícios A–F sem gravar dados na empresa.

## Auditoria e preservação

Base existente: Node.js 24, Express, SQLite local, frontend JavaScript sem framework, PDFKit, Google OAuth/Calendar/Drive. A Fase 3 estende FinanceService/DreService e o mesmo banco. Não introduz outro sistema financeiro, serviço externo, chave, pacote, autenticação ou infraestrutura.

O código local é executado diretamente, sem Git inicializado nesta cópia e sem scripts de build, lint ou compilação TypeScript. O comando `npm.cmd run check` verifica a sintaxe dos arquivos próprios. A verificação funcional usa as suítes Node e Edge. Não foram alegados checks inexistentes.

Backup e preservação documentados em `ATUALIZACAO-RENTABILIDADE-INTEGRACOES.md`.

Não houve alteração de .env, credenciais, contas Google, agenda externa, PDFs guardados, assets de marca, D1, R2 ou Workers. As demonstrações e testes usam memória/bancos temporários e Google simulado. O servidor local da Herboclean utiliza os novos módulos.

## Modelagem e migrations

Migration aditiva e idempotente: `backend/profit-migration.js`; marcador `profit-schema-version = 3`.

- `finance_actuals`: versões por proposal_id, JSON de valores confirmados, competência, data, administrador e motivo. Correção exige versão esperada e motivo. Não apaga versões anteriores.
- `finance_contexts`: cidade, UF, bairro, chave de cliente e tempo previsto; revisão otimista e alterações auditadas. Índices de cidade e cliente.
- `finance_goals`: metas mensais versionadas, motivo e administrador.
- Configurações `profit-settings-v1` e histórico de padrões futuros `profit-goal-defaults-v1`.
- Reutiliza `finance_audit`, `finance_estimates`, `finance_recognitions`, despesas, categorias, impostos e índices de competência existentes. As estimativas anteriores não são regravadas.
- Novos reconhecimentos guardam os itens comerciais necessários à análise, sem fotos. Registros antigos usam o snapshot da estimativa ou a proposta de mesma revisão; quando a identidade do serviço não é recuperável, o dado fica não identificado.

Dados internos são obtidos em APIs privadas sob `/api/profitability`. Proposta comercial, backup comercial, PDF e evento Google não incorporam esses campos.

## Realizado, estimado e competência

Prioridade por componente: **valor real informado → estimativa preservada → pendente**. Zero é valor confirmado; vazio não é zero. Outros custos reais são uma lista nomeada; confirmar lista vazia significa zero, desmarcar a confirmação mantém o estimado.

Deslocamento pode ser informado como total ou como combustível + veículo + pedágio + estacionamento + outros. Os dois modos são mutuamente exclusivos, evitando duplicação. Quilômetros e minutos reais são opcionais.

A receita final confirmada substitui a receita estimada na DRE, sem modificar o preço ou PDF comercial. Ela representa o valor do serviço sem o acréscimo repassado do cartão. Não se deduz novamente uma taxa já excluída dessa base. O mesmo desconto não deve ser lançado novamente como dedução.

A DRE mantém a competência original da realização. Uma correção altera a leitura daquela competência, com trilha de versões; o reconhecimento e a estimativa originais continuam preservados. Classificação do custo: real, estimado, misto ou pendente. Custos pendentes não são convertidos silenciosamente em zero. Valores conhecidos continuam compondo o subtotal conhecido.

## Fórmulas

Valores monetários são centavos inteiros. Rateios conservam o total usando maiores restos; divisões monetárias usam arredondamento racional com BigInt. Preços mínimos/referências são arredondados para cima em um centavo para não ficar abaixo da margem alvo.

| Indicador | Cálculo |
| --- | --- |
| Custo direto | Materiais + deslocamento + outros custos diretos |
| Contribuição do atendimento | Receita final/base − custo direto utilizado |
| Margem do atendimento | Contribuição ÷ receita × 100 |
| Margem consolidada | Soma das contribuições ÷ soma das receitas × 100 |
| Ticket médio | Receita ÷ número de atendimentos distintos |
| Margem de contribuição por hora | Contribuição dos atendimentos com tempo real ÷ horas reais desses atendimentos |
| Variação de custo | Custo utilizado − custo estimado |
| Variação de margem | Margem utilizada em R$ − margem estimada em R$ |
| Preço por margem alvo | Custo do snapshot ÷ (1 − margem alvo) |
| Desconto máximo | Máximo de zero e [preço atual − custo ÷ (1 − margem mínima)] |
| Equilíbrio | Despesas fixas ÷ taxa disponível para cobrir fixos |

Na DRE, contribuição usa receita **líquida de deduções e impostos**, conforme a Fase 2. Na análise dos atendimentos, usa receita base antes dessas deduções. As telas explicam essa diferença. Não é lucro líquido.

Taxa do equilíbrio = (receita bruta − deduções − custos diretos − despesas operacionais variáveis) ÷ receita bruta. Só aparece com classificação revisada, receita, custos completos, despesas fixas e taxa positiva. O cálculo mantém o mix do período. R$ 8.000 / 70% exige R$ 11.428,58 ao arredondar conservadoramente para cima.

Custo R$ 100 / (1 − 75%) = preço R$ 400. Acrescentar 75% ao custo resultaria R$ 175 e seria **markup**, não margem de 75%. Margem zero/receita zero é tratada sem divisão inválida.

## Análises, filtros e amostra

Períodos: mês atual/anterior, últimos 3/6 meses, ano ou intervalo personalizado, até 24 meses. Filtros adicionais: serviço, cidade, concluídos/agendados/todos, origem do custo. Ordenação: receita, contribuição maior/menor, volume e ticket.

- Serviço: receita, ticket, custo médio, contribuição, margem ponderada, tempo e contribuição/hora.
- Regiões: cidades e bairros explicitamente informados. O endereço livre não é interpretado automaticamente.
- Cliente: identificação por contato normalizado ou identificador manual. Na ausência, cada orçamento mantém chave própria; homônimos não são fundidos.
- Evolução: gráficos simples e tabela mensal de margem, ticket, custo médio e resultado operacional.
- Cobertura: contagem e percentual de custos reais, estimados, mistos e pendentes.
- Estimado × realizado: médias, diferenças e amostra comparável por materiais, deslocamento e total.
- Preço histórico por serviço: só com pelo menos **5 atendimentos reais**, um único item, quantidade válida e mesma unidade.

Orçamentos com vários itens têm receita, custo e minutos rateados pela participação na receita original. Esse rateio não é medição individual de consumo. Filtros por serviço mostram métricas rateadas; o detalhamento e a comparação de estimativas mantêm o atendimento completo para permitir auditoria.

Sem quantidade/medição suficiente, não há referência histórica. Duas observações não geram conclusão de tendência. O mínimo de cinco permite leitura descritiva, não inferência causal ou garantia estatística.

Insights determinísticos, sem IA/API: desvio de materiais, deslocamento e custo total (mínimo 5 pares, desvio ≥5%); deslocamento médio por cidade acima da média real (mínimo 5 na cidade, diferença >10%); margem de serviço em pontos percentuais contra a média real (mínimo 5, diferença ≥5 p.p.). Cada insight informa a amostra e os registros. Não altera preços, premissas ou metas.

## Metas e precificação

Metas opcionais: receita, contribuição percentual da DRE, resultado operacional e ticket. Valores em branco não geram cobrança visual. Alterações são versionadas por mês, sem recalcular outros meses. Padrões futuros têm vigência e histórico; metas mensais explícitas prevalecem.

Projeção = realizado + serviços agendados e despesas previstas, conforme a DRE; sem extrapolação automática.

A simulação usa o custo da estimativa atualizada, mantido constante no cenário. Margem mínima gera aviso, sem bloquear a venda. Aplicação exige orçamento em elaboração, revisão/versão atualizadas e confirmação do total após arredondamento dos preços unitários. Não altera PDFs anteriores e não recalcula custos silenciosamente. A referência considera custo e margem, sem avaliar procura ou concorrência.

## Exportação e permissões

CSV analítico interno: proposta, data, serviços, cidade, origem, receita estimada/utilizada, custos estimado/real/utilizado, variações, contribuição e minutos. Não exporta telefone, e-mail, endereço completo ou fotos.

CSV da DRE inclui as colunas de estimado/real/variação. Exportação financeira JSON versão 3 inclui estimativas, realizados, contextos, metas, premissas e auditoria. O backup comercial continua separado; recuperação integral requer o banco e arquivos do diretório data.

APIs exigem sessão administrativa e empresa configurada; mutações exigem CSRF e mesma origem. Respostas internas não são armazenadas em cache. Não foi criado RBAC, SaaS multiempresa ou acesso público a custos.

## Testes e limites

- `npm.cmd run check`: sintaxe de JavaScript.
- `npm.cmd test`: regressões anteriores e `scripts/check-profit.mjs`.
- `npm.cmd run test:browser`: Edge desktop 1512 px e mobile 390 px, banco temporário e Google simulado.
- Casos: realizado/estimado, receita negociada, correções/versionamento, material real prioritário, fallback misto, dados faltantes, centavos, margem ponderada, margem/hora, preço correto, desconto, mínimo, equilíbrio, agrupamento sem unir homônimos, metas, histórico, amostra insuficiente, demonstração isolada, autenticação/CSRF, CSV e privacidade PDF/Calendar.
- Fluxo: orçamento → estimativa → aprovação/agendamento → conclusão → custos reais → DRE/analytics → simulação de preço futuro.
- Evidências visuais: `validacao/profit-*.png`.

Limites: não há análise por meio de pagamento efetivamente recebido ou por equipe porque a base atual não captura esses fatos de forma estruturada. Bairros só aparecem quando informados. Não há previsão automática de demanda, causalidade estatística, contabilidade fiscal ou lucro por hora. Referências dependem de qualidade e quantidade dos dados. Serviços múltiplos usam rateio explicitado; ficam fora da referência histórica de custo por unidade.

**Checkpoint:** implementação local para validação do usuário, sem deploy, conforme seções 167–169 do briefing.

## Resultado da atualização

Veja `ATUALIZACAO-RENTABILIDADE-INTEGRACOES.md` para os testes e a comparação de dados desta instalação.
