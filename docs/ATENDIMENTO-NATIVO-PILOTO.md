# Atendimento nativo — piloto da Herboclean

Este piloto substitui a extensão como experiência principal de teste. Ainda não possui conexão com o WhatsApp: mensagens recebidas, enviadas e anexos são simulados e persistidos apenas no banco local. Não exige VPS, Docker ou assinatura.

## Abrir

Execute `npm run pilot:whatsapp` na pasta do projeto e abra `http://localhost:3310/#atendimento`. Os acessos dos quatro administradores estão em `.tools/whatsapp-pilot/ACESSOS-LOCAIS.txt`. Dados em `.tools/whatsapp-pilot`, separados da produção. O servidor aceita acesso somente pelo próprio computador (`127.0.0.1`); o teste móvel foi feito com viewport de 390 × 844 no navegador.

## Roteiro de validação

1. Entre com seu acesso local e selecione uma conversa de exemplo.
2. Digite uma mensagem e use Enviar. O registro aparece somente na simulação.
3. Use **Simular mensagem recebida** para representar a resposta do cliente.
4. Clique no nome do contato para consultar ou editar a ficha completa: nome, WhatsApp, aniversário, e-mail, contato na empresa, endereço, tipo de cliente, origem, observações e campos personalizados. A origem oferece Meta Ads, Google Ads, Indicação, Orgânico e Cliente antigo.
5. Use **Gerar orçamento** no cabeçalho. O editor abre ao lado do chat no desktop; no celular ocupa um painel sobre a conversa e pode ser fechado para retomá-la.
6. Nome e telefone vêm do cliente. Preencha endereço/e-mail, selecione os serviços, quantidades e preços. Anexe até seis imagens PNG, JPG ou WebP por serviço (20 MB por arquivo antes da compressão), amplie as miniaturas ou remova uma foto. O rascunho é salvo por usuário e conversa, com controle de revisão para evitar sobrescrita entre abas.
7. Gere o PDF. A proposta fica disponível no módulo Orçamentos local; nome, telefone, endereço e e-mail são atualizados no cliente já vinculado à conversa, inclusive se o telefone tiver mudado.
8. Abra o PDF ou adicione-o à conversa simulada. Nada é transmitido a um número real.
9. Para clientes com propostas, o cabeçalho oferece **Ver orçamento(s)** e **Agendar/Reagendar**, além de um botão para criar outra proposta. O painel permite selecionar qual orçamento consultar e visualizar seu PDF dentro do app.
10. O agendamento usa a mesma janela de data, horário, duração e revisão do kanban. No piloto, **Confirmar simulação** atualiza a coluna e o status no banco local, sem criar evento no Google. Os testes também cobrem reagendamento e cancelamento local.

## Escopo desta versão

Lista, busca, filtro de não lidas, chat, perfil completo editável, histórico e visualização de orçamentos, fotos por serviço, editor compacto com múltiplos serviços, condições de pagamento e PDF real. Preserva o design e os cálculos compartilhados com o app. O agendamento é local e simulado; rotas, Google Agenda, cobranças e entrega por WhatsApp não são executados por esse fluxo. O botão de anexar o PDF simula a entrega; não representa confirmação de envio/leitura do WhatsApp.

Interface e fluxos locais aprovados pelo responsável em 17/10/2026, com autorização para continuar a implementação e atualizar o repositório em uma branch de desenvolvimento. O deploy continua dependendo de autorização específica. O serviço real de WhatsApp e a operação simultânea com quatro atendentes em produção serão uma etapa posterior.

## Verificações

`npm run test:chat` valida autenticação e CSRF, mensagens idempotentes, rascunhos persistentes e separados por usuário, conflito entre abas, fotos no rascunho e PDF, limite de imagens, ficha completa, vínculo de anexos, agendamento/reagendamento/cancelamento simulados, rejeição de horários passados, ausência de chamadas externas e desativação das rotas no servidor normal. `node scripts/check-operations.mjs` verifica o modelo compartilhado de agendamento. `npm run check` verifica sintaxe.

Backup anterior à implementação: `.tools/before-native-chat-20261016-104903`. O piloto apenas habilita as rotas via `chatPilot: true`; elas não são registradas com `production: true` nem no launcher normal.
