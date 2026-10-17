# Piloto local de atendimento Herboclean

> Histórico da primeira abordagem com extensão. A experiência atual é o [atendimento nativo](ATENDIMENTO-NATIVO-PILOTO.md), aprovado em 17/10/2026. A extensão permanece apenas como referência; não é necessária para testar o chat atual. Publicação na branch de desenvolvimento autorizada; deploy ainda pendente.

Implementação local na branch `feat/whatsapp-assistido`, a partir de `0df7e20cabc13cc20d7d69e9a10c18f8519517f2`. A atualização do GitHub e o deploy dependem de aprovação do responsável. Multilimp não faz parte deste piloto.

## Abrir e entrar

- Sistema: http://localhost:3310/
- Painel: http://localhost:3310/painel
- Contas locais: Victor (`victor`), João (`joao`), Ronaldo (`ronaldo`) e Kleber (`kleber`). Todos são administradores.
- Senhas individuais: `.tools/whatsapp-pilot/ACESSOS-LOCAIS.txt`. São exclusivas deste ambiente de teste e não devem ser utilizadas em produção.
- Para iniciar novamente: `npm.cmd run pilot:whatsapp` nesta pasta, ou `scripts/iniciar-piloto-whatsapp.cmd`.

O servidor escuta somente em `127.0.0.1:3310`. O piloto tem banco próprio em `.tools/whatsapp-pilot`, um contato fictício com o telefone de teste autorizado e uma proposta de R$ 180. Nenhum orçamento real, sessão Google, chave Asaas ou token de produção foi copiado. As integrações externas estão desativadas; o teste de rota real não faz parte deste ambiente.

Os links de PDF gerados no localhost abrem somente neste computador. Não os encaminhe a clientes como propostas reais.

## Carregar a extensão para testar no WhatsApp

1. No Chrome usado para o WhatsApp Business da Herboclean, abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor** e escolha **Carregar sem compactação**.
3. Selecione a pasta `extension/herboclean-whatsapp` deste projeto. Se usar o ZIP de `dist`, extraia primeiro e selecione a pasta que contém `manifest.json`.
4. Abra ou recarregue `https://web.whatsapp.com/`. Confira pessoalmente que a conta conectada é **+55 11 92612-6244**. O piloto não verifica a conta por interfaces internas do WhatsApp.
5. Abra a conversa do número de teste **+55 11 98649-5346** e clique no ícone da extensão Herboclean.
6. Entre no painel com um dos acessos locais. Se o telefone estiver visível no cabeçalho, o cadastro correspondente será procurado automaticamente. Se aparecer apenas o nome, busque e confirme o cliente manualmente.
7. Prepare uma resposta, revise o destinatário e o texto. **Inserir no WhatsApp** exige telefone visível, mesma conversa e campo de mensagem vazio. Neste piloto só o número de teste é permitido. Quando a inserção não estiver disponível, use **Copiar** e confira o destinatário ao colar.
8. O botão Enviar continua sob controle da pessoa no WhatsApp. A extensão não envia mensagens, não simula Enter e não confirma entrega/leitura.

A extensão solicita painel lateral e acesso à página do WhatsApp Web. Lê apenas o cabeçalho da conversa aberta e manipula o campo de composição a pedido da pessoa. Não lê o histórico em massa nem usa cookies, sessões internas, Baileys ou APIs privadas do WhatsApp. A senha do sistema e o token do painel ficam fora do content script. A versão empacotada aponta exclusivamente para o localhost.

## O que validar

- Entrar com os quatro usuários. Em **Equipe**, adicionar uma pessoa de teste e excluir seu acesso a partir de outro administrador. As sessões do usuário excluído devem parar de funcionar. Não existe limite fixo de quatro pessoas. O histórico mantém autoria, e a pessoa não exclui o próprio acesso.
- Assumir e liberar o atendimento. Em outro painel, atualizar a ficha e verificar o responsável. Se alguém mudar o responsável antes de uma gravação, a alteração antiga deve ser recusada.
- Buscar por telefone e por nome. Nomes repetidos exigem escolha; o nome sozinho não é vínculo permanente com uma conversa.
- Salvar origem, etiquetas e notas. Conferir a atualização em **Clientes** no sistema completo.
- Criar um orçamento pelo painel. Usar o mesmo usuário no sistema. Nome, telefone, origem, endereço e etiquetas devem vir preenchidos. Os rascunhos são separados por usuário e aba. Duas cópias da mesma aba não podem sobrescrever a mesma revisão silenciosamente.
- Abrir uma proposta existente. Preparar o link do PDF, abrir o link neste computador, revogá-lo na aba **Equipe** e conferir que deixou de abrir. Validade padrão de sete dias; o link aponta para uma versão imutável do documento. PDF desatualizado precisa ser regenerado no sistema antes de preparar outra proposta.
- Atualizar o follow-up/pós-venda e verificar a etapa no kanban. Agendamento e cancelamento continuam pelas ações já existentes do sistema.
- Cadastrar respostas rápidas com `{nome}` e `{atendente}`.
- Trocar de conversa antes de inserir: o painel deve limpar a seleção e a mensagem anterior. Não substituir texto já digitado no WhatsApp. Não inserir em outro número.

## Limites desta entrega

O painel e o backend têm testes automatizados e validação no navegador. A instalação da extensão no Chrome da Herboclean e o comportamento na conversa real precisam ser validados pelo usuário antes de publicação. O WhatsApp pode alterar seu HTML; o adaptador fica isolado em `extension/herboclean-whatsapp/adapter.js` e deve falhar com orientação para copiar quando não reconhecer a tela.

Etiquetas sobre a lista de conversas do WhatsApp, fila de follow-ups, áudios, transcrição, IA e automação via Cloud API ficam para uma etapa posterior. O piloto oferece etapas e etiquetas no painel. Cobranças novas continuam sendo geradas pelo fluxo atual; o painel só utiliza links Asaas já existentes e pendentes da revisão atual. Não foram feitos pagamentos ou envios reais neste desenvolvimento.

## Dados, segurança e continuidade

As tabelas novas são aditivas: `team_users`, `session_actors`, `attendance_audit`, `user_drafts`, `attendance_owners` e `pdf_shares`. O acesso original de produção permanece disponível como `admin` com a senha anterior até que um administrador decida excluí-lo depois de cadastrar e testar outros acessos. O primeiro rascunho legado é recuperado na primeira aba do administrador original. PDFs e orçamentos históricos não são reescritos pela migração.

Todos os novos usuários têm os mesmos privilégios administrativos existentes. Exclusão é revogação lógica para manter autoria histórica; senhas são descartadas, sessões invalidadas e o identificador de login não é reciclado. O painel usa token próprio de 12 horas, aceito somente em `/api/panel/*`; o aplicativo principal mantém cookie HttpOnly e CSRF. Somente `/painel` aceita enquadramento pela extensão de ID `ibgjbfhgagpmhigpalogmjpaeknghcli`.

Para backup completo, preservar o SQLite consistente, PDFs, chave de criptografia e variáveis privadas em conjunto. O exportador JSON antigo do sistema é um exportador de propostas e não substitui o backup completo de contas e atendimento.

Backup de referência verificado no servidor: `/home/u564490911/herboclean-backups/before-whatsapp-1792076835835`. Instruções de restauração e espelho Git ficam na pasta local `../backups/herboclean-before-whatsapp-20261015-120716`.

Após aprovação do piloto, revisar as alterações, configurar os acessos reais, preparar o pacote da extensão para o domínio da Herboclean e autorizar separadamente atualização do repositório e deploy. Não copiar as senhas, os dados fictícios ou o banco do piloto para produção.

## Verificação técnica

`npm.cmd test` executa a regressão existente. `npm.cmd run test:whatsapp` cobre contas, revogação, autenticação, origem, isolamento e concorrência de rascunhos, clientes, responsáveis, etapas, respostas rápidas, PDF privado/compartilhado, expiração, revogação, CSP e o contrato do adaptador de inserção. `npm.cmd run check` verifica a sintaxe, incluindo os arquivos da extensão.
