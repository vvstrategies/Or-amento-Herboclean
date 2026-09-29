# Sincronização do produto e padrão Asaas — 21/09/2026

A pedido do usuário, as funcionalidades atuais do produto universal também foram levadas à instalação consolidada da Herboclean. A restrição anterior de não alterar essa instalação foi substituída por esta autorização específica.

## Instalações independentes

- Herboclean: pasta `orçamento`, http://localhost:3000, banco `data/ecoclean.sqlite`.
- Universal: pasta `orcamento-universal`, http://localhost:3100, banco `data/orcamento.sqlite`.

Foram transferidos custos por atendimento/Fase 1, DRE e despesas/Fase 2, recorrências, exportações privadas, edição da identidade e catálogo, confirmação da competência, proteções contra alterações concorrentes e demais componentes atuais da interface e do backend.

A Herboclean mantém marca, logo, textos, localização, telefone, condições comerciais, senha, cookies, dados locais, banco, chave de criptografia, conta Google, workspace de Drive/Calendar, eventos e PDFs. A migração `backend/herboclean-installation.js` reconhece a empresa existente como configurada; não passa seus dados pelo reset neutro do universal.

Não foram copiados dados da Clean SP/universal para a Herboclean. As premissas internas de custos e impostos continuam próprias de cada instalação. Novos serviços mantêm m² para carpete e tapete, e unidades para os demais; itens de propostas anteriores permanecem intactos.

## PIX e cartão

O preço preenchido no serviço é a base PIX. O investimento total no cartão incorpora as taxas por gross-up, preservando o líquido estimado desejado. O valor PIX é apresentado como condição com desconto em relação ao preço do cartão. Padrão de 3 parcelas sem juros adicionais sobre o total apresentado.

Perfil aplicado ao universal, igual ao que estava salvo na Herboclean:

| Parâmetro | Valor |
| --- | ---: |
| Tarifa fixa por venda | R$ 0,49 |
| Crédito em 1x | 2,99% |
| Crédito em 2 a 6x | 3,49% |
| Crédito em 7 a 12x | 3,99% |
| Crédito em 13 a 21x | 4,29% |
| Antecipação em 1x / parcelado | 1,70% ao mês |
| Antecipação padrão | Ativada |
| Prazo de referência por parcela | 32 dias |
| Parcelamento padrão | 3x |

Os percentuais de crédito não promocionais foram conferidos na [tabela pública Asaas](https://www.asaas.com/precos-e-taxas). Promoções de novos clientes não foram aplicadas. A antecipação de **1,70% é a referência configurada na Herboclean**, não uma afirmação da taxa atual de todos os contratos. A página pública divulga outras condições de antecipação e orienta conferir a própria conta. As taxas permanecem editáveis.

O cálculo considera prazo de cada parcela, ajuste para fins de semana e mês comercial de 30 dias; feriados e condições específicas da conta podem alterar o líquido efetivo. Referência: [orientações do simulador Asaas](https://blog.asaas.com/release/simulador-de-vendas-com-taxas-de-antecipacao/).

O preço do cartão em 1x também cobre a taxa de crédito. PIX permanece exatamente no valor informado, conforme a regra comercial solicitada; não foi adicionado custo PIX da plataforma. Não foi criada integração de cobrança, nem foram emitidos links, transações ou pagamentos.

## Como usar

Crie **Novo orçamento**, preencha preço base e quantidade. O cartão é calculado automaticamente.

Em Condições comerciais:
- **Taxas Asaas e recebimento** permite editar cada parâmetro.
- **Aplicar padrão Asaas** recupera o perfil acima para a proposta aberta.
- **Usar estas condições nos próximos orçamentos** salva a preferência da empresa.

As condições atuais do universal foram atualizadas uma vez. Propostas já salvas, seus PDFs e rascunhos que apontam para propostas existentes não foram reprecificados. Para aplicar a regra a um orçamento anterior, abra-o e use explicitamente **Aplicar padrão Asaas**, salvando a revisão desejada.

A identidade do universal segue neutra no primeiro acesso; apenas o perfil comercial e o catálogo de serviços têm os padrões solicitados.

## Segurança da atualização

Backups prévios em `data/backups/sync-product-*`, com cópia do código e SQLite consistente em cada instalação. Hashes protegem a conferência de .env, chave local e PDFs arquivados.

`docs/product-sync-manifest.json` na Herboclean relaciona arquivos transferidos e adaptações específicas. O script `scripts/sync-herboclean.cjs` na base universal é uma ferramenta local de manutenção: sem argumento, apenas orienta; com `--apply`, cria outro backup e aplica a cópia com adaptações. Não copia .env, bancos ou credenciais entre empresas. Após futuras mudanças, valide os testes e reinicie os servidores locais; não há sincronização automática em produção.

Relatórios de integridade da atualização ficam em `docs/product-sync-verification.json`. Os testes usam dados temporários, Google simulado e nenhuma chamada paga ao Routes.

O ponto de validação permanece local; não houve publicação em produção.
