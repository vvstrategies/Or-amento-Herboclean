# Fase 2 — DRE Gerencial e despesas

Checkpoint local, sem publicação em produção. Esta é uma ferramenta interna de gestão por competência, não uma demonstração contábil oficial.

## Acesso e validação

Abra o servidor pelo `start.bat` da pasta **orcamento-universal** e entre com a senha já existente. Menu **Financeiro**: Visão geral, DRE Gerencial e Despesas. O endereço local padrão é http://localhost:3100/#financeiro.

Use **Ver demonstração** para explorar dados fictícios sem gravar lançamentos. Há meses positivos, negativos, recorrência e projeções. Para validar com a sua operação: confira as premissas, estime os custos antes da execução, conclua um atendimento informando a data real, registre uma despesa da mesma competência e abra a DRE. Não publique antes da validação deste checkpoint.

## Auditoria da base

Foi encontrada a instalação em `C:\Users\geved\OneDrive\Área de Trabalho\VV\orcamento-universal`, após a movimentação da pasta anterior. Base Express, JavaScript, SQLite local, PDFKit; custos da Fase 1 em snapshots versionados. Não foram adicionados Workers, D1, R2, banco remoto, APIs pagas ou integrações bancárias. Google OAuth, Calendar, Drive e PDF comercial continuam na estrutura existente. Nenhuma credencial foi alterada.

Antes da implementação: 5 propostas e 5 estimativas financeiras. Backup SQLite consistente e cópia dos arquivos de código em `data/backups/phase2-1789997641204/`. O manifesto `docs/phase2-original-hashes.json` permite conferir a integridade do projeto original irmão. O original não recebe migrations nem novas despesas.

## Competência e receita

- **Realizado**: apenas atendimentos concluídos, na data de realização confirmada no diálogo de conclusão (`serviceCompletedAt`). O momento de registro fica separado em `completionRecordedAt`.
- O valor é a receita base PIX da proposta, conforme a Fase 1. O acréscimo comercial do cartão não é receita adicional desta análise nem uma segunda despesa financeira.
- Pagamento/recebimento, criação da proposta, emissão de PDF e aprovação não determinam o mês da receita.
- Conclusão grava, em uma transação, status, data e reconhecimento financeiro único por proposta. Repetir a conclusão não duplica receita.
- Reconhecimento guarda valor base, versão da proposta, referência e composição da estimativa. Alterar depois o nome do cliente ou a proposta não reescreve o reconhecimento.
- **Projetado**: soma concluídos e agendados no período, uma vez por atendimento, mais despesas previstas. Agendados usam a data de início da agenda. Orçamentos gerados e cancelados ficam de fora.
- Migração de concluídos antigos: usa data explícita, se houver; alternativamente, término do agendamento, identificado como referência inferida na tela. Sem nenhuma data confiável, o atendimento fica fora dos totais e aparece na lista “Informar datas”, com justificativa obrigatória.
- Atendimentos concluídos não podem ser cancelados/reabertos pela API comum: possuem reconhecimento histórico. Ajustes de receita podem ser registrados como descontos/estornos justificados; correções contábeis complexas ficam para evolução posterior.

## Custos da Fase 1

A DRE não recalcula combustível, quilômetros, materiais ou demais custos com premissas atuais. Lê a estimativa salva; na conclusão guarda a composição reconhecida. Uma estimativa incompatível com o orçamento atual é tratada como ausente.

Custo ausente/incompleto não é zero. Receita e despesas permanecem visíveis; custo total, contribuição e resultado ficam **Pendentes**, com os atendimentos identificados para conferência. Custos conhecidos continuam disponíveis no domínio.

A Fase 1 possui estimativas, não lançamentos de custo real. Portanto, atualmente a qualidade mostra custos estimados e zero realizados. Não há falsa classificação como custo real só porque o atendimento foi concluído. O resultado é rotulado estimado. Captura de custo realizado pertence à evolução prevista para a Fase 3.

A DRE não consulta Google Routes nem outro serviço de distância.

## Despesas e categorias

Cada despesa guarda:
- ID, descrição, categoria, valor em centavos, competência mensal obrigatória;
- vencimento opcional, pagamento opcional e independente;
- status, natureza, fixo/variável, fornecedor, observações;
- componente de veículo opcional, recorrência de origem;
- revisão concorrente, criação/alteração, administrador responsável.

Status:
- **Prevista**: apenas projeção.
- **Reconhecida · a pagar**: obrigação da competência; entra no realizado sem exigir pagamento.
- **Paga**: também reconhecida; pagamento em outro mês não desloca a despesa.
- **Cancelada**: excluída dos totais, preservada para consulta.

Editar, pagar ou cancelar é feito em **Despesas → Detalhes**. Alterações pedem motivo e revisão; conflitos entre abas retornam 409. Lançamentos cancelados não são sobrescritos.

Categorias iniciais: Marketing, Pessoal, Administrativo, Infraestrutura, Veículos, Tecnologia, Contabilidade, Aluguel, Utilidades, Seguros, Financeiro, Outros e Pró-labore. Podem ser criadas, renomeadas ou desativadas. Desativar bloqueia novos vínculos e preserva o histórico.

Naturezas:
- **Despesa operacional**: reduz o resultado operacional.
- **Investimento**: mostrado separadamente, sem redução automática do resultado.
- **Dedução da receita**: desconto, estorno ou outra redução justificada. Não use para classificar uma saída comum. Imposto gerencial tem ajuste próprio, sem exigir lançamento duplicado de despesa.

A busca usa descrição, fornecedor e categoria. Há filtros de competência, categoria, status e reconhecimento; listagem em páginas de 20 registros. As consultas são limitadas a 24 meses por vez. O detalhamento também pagina os registros.

## Recorrências

Mensal e anual, com início, versões de vigência, valor, categoria, natureza, fixo/variável, fornecedor e dia de vencimento. A anual é integral no mês correspondente ao aniversário do início; não há rateio em 12 meses nesta fase.

Ocorrências previstas são geradas ao abrir um intervalo, inclusive o intervalo anterior usado na comparação. Não há cron nem geração indiscriminada de anos futuros. A restrição única `(rule_id, competence)` garante idempotência, inclusive após atualização/reinício.

Mudanças pedem “Alterar a partir de”. Aplicam-se somente às ocorrências **previstas** a partir do mês escolhido; anteriores, reconhecidas, pagas e canceladas são preservadas. O mês de efeito de uma edição não pode anteceder o mês atual. Ex.: R$ 350 em setembro e outubro; alteração com efeito em novembro gera R$ 400 em novembro, sem reescrever os dois primeiros meses. Desativar cancela apenas previsões elegíveis e impede novas gerações na vigência.

Uma ocorrência pode ter seus dados corrigidos, com motivo, sem alterar a regra ou os demais meses. A competência de uma ocorrência recorrente é fixa; para mover, cancele e crie lançamento avulso.

## Impostos e histórico

Opcional, padrão **0%**, em Configurações → DRE Gerencial. Percentual em pontos-base inteiros (6% = 600). Nenhum regime fiscal é inferido.

Ao abrir um mês, a aplicação materializa uma referência mensal do percentual. Trocar a configuração não altera meses já abertos. O mês pode usar um valor manual no lugar do estimado. Em DRE → Imposto gerencial → Ajustar:
- valor manual com motivo e confirmação; ou
- recálculo explícito pelo percentual atual, também com motivo e confirmação.

O percentual original e o histórico anterior permanecem guardados. O cálculo estimado de referência permanece consultável mesmo com valor manual. Novos atendimentos reconhecidos ou alterações explícitas de despesas naturalmente atualizam o mês; não existe fechamento contábil imutável nesta fase.

GET dos relatórios não grava dados: consumidores de API que não materializarem o período recebem imposto provisório identificado no retorno. A interface usa POST autenticado em `/api/finance/prepare` antes de consultar. Comparações usam intervalos anteriores com o mesmo número de meses.

## Fórmulas

Todos os valores monetários são centavos inteiros, com arredondamento racional da Fase 1.

```
Receita bruta = soma da receita base dos atendimentos elegíveis
Imposto estimado = receita bruta × percentual mensal / 10.000
Deduções = imposto (manual ou estimado) + descontos/estornos registrados
Receita líquida = receita bruta − deduções
Custos diretos = soma dos snapshots completos da Fase 1
Margem de contribuição = receita líquida − custos diretos
Despesas operacionais = soma das despesas operacionais elegíveis
Resultado operacional = margem de contribuição − despesas operacionais
Margem operacional (%) = resultado operacional / receita líquida × 100
Margem de contribuição (%) = contribuição / receita líquida × 100
```

Sem denominador positivo, percentuais são “—”. Valores negativos são preservados. Sem custos completos, não se apresenta resultado artificial. Investimentos não integram despesas operacionais. Variações usam o valor absoluto do período anterior; base anterior zero/ausente é “Sem base comparável”. Crescimento das despesas não recebe avaliação positiva automática.

Exemplo testado: receita R$ 10.000, imposto 6% = R$ 600, líquida R$ 9.400, custos R$ 2.000, contribuição R$ 7.400, despesas R$ 4.000, resultado R$ 3.400, margem operacional **36,17% sobre a receita líquida**.

## Possível dupla contagem

Em Configurações → DRE Gerencial, declare os componentes já embutidos no custo adicional/km: manutenção, pneus, óleo, seguro, IPVA e depreciação. Despesas de veículo informam seu componente e recebem aviso não bloqueante quando coincidir. O administrador decide se é a mesma obrigação ou uma despesa independente. Há aviso adicional para descrições de imposto quando existe percentual gerencial.

As taxas comerciais já repassadas ao cliente não são deduzidas novamente pela DRE. Não há cálculo automático de depreciação, imposto fiscal ou seguro.

## Persistência, APIs e privacidade

Migration aditiva independente: `backend/dre-migration.js`; marcador `dre-schema-version = 2`. A migration da Fase 1 não foi alterada.

Tabelas:
- `finance_categories`: categoria estável, disponibilidade e revisão.
- `finance_expenses`: competência, categoria, status, natureza, regra, dados e revisão.
- `finance_recurrences`: regras com versões de vigência.
- `finance_recognitions`: reconhecimento único por proposta e data/competência indexadas.
- `finance_periods`: premissas de imposto de cada mês.
- `finance_audit`: antes/depois, entidade, administrador e instante.

Índices de competência, categoria, status e data de realização; recorrência/competência únicas. Sem exclusão física de despesas pela interface.

APIs em `/api/finance/*`, depois da autenticação, CSRF e configuração obrigatória da empresa. Relatórios e exportações usam Cache-Control: no-store. Não há novos papéis/permissões: administrador único da instalação. Relatórios agregados não exibem endereço/telefone; nomes aparecem somente no detalhamento interno.

CSV e PDF internos são autenticados, identificados como DRE Gerencial e separados do PDF comercial. O CSV inclui totais, despesas e atendimentos, com proteção contra interpretação de fórmulas. O PDF interno resume DRE, categorias e qualidade dos custos. Nenhum custo, margem ou DRE é incluído no evento do Google ou no PDF comercial.

**Exportar histórico financeiro**, nas configurações da Fase 1, agora produz versão 2: premissas das duas fases, estimativas, categorias, despesas, recorrências, reconhecimentos, períodos e auditoria. É um arquivo privado de consulta/guarda, não uma importação automática. O importador comercial não restaura financeiro. Para restauração integral administrativa, use backup consistente do SQLite e arquivos da instalação. Não foram implementados importador bancário nem importador financeiro.

## Arquivos principais

Novos:
- backend/dre-domain.js, dre-service.js, dre-migration.js, dre-routes.js, dre-export.js, dre-demo.js
- public/dre.js, dre.css
- scripts/check-dre.mjs, check-dre-browser.cjs
- docs/FINANCEIRO-FASE-2.md e evidências locais

Integrados: backend/app.js, backend/service.js, public/workspace.js, templates/index.html, public/index.html, index.html, package.json, scripts/check-workspace.cjs e documentação. Renderizadores comerciais, modelo de preços e migration da Fase 1 permanecem intactos.

## Testes e limites

`npm.cmd test`: regressões do produto/Fase 1 e testes da Fase 2. `npm.cmd run check`: sintaxe dos arquivos JavaScript. `npm.cmd run test:browser`: Edge real, desktop 1512 px e celular 390 px, dados temporários e Google simulado.

Cobertura: fluxo orçamento → custos → agendamento → conclusão → DRE; competência diferente do pagamento; custos históricos; geração recorrente repetida; mudança futura e conservação de despesas reconhecidas; impostos manuais/estimados; investimentos; categorias e paginação; autenticação/CSRF; PDF comercial imutável; Calendar sem custos; nenhuma chamada a Routes; exportações privadas; demonstração sem dados gravados.

O projeto não possui configuração de lint, compilador TypeScript nem etapa de build. Não se afirma que essas etapas inexistentes foram executadas. A interface HTML é sincronizada por `scripts/sync-ui.cjs`.

Fora desta fase: custo realizado por atendimento, fechamento contábil, conciliação, integração Asaas/bancos, controle bancário, parcelas a receber, emissão fiscal, RBAC, SaaS multiempresa e depreciação contábil.
