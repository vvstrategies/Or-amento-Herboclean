# Evolução Ecoclean — checkpoint visual

## Continuação aprovada

O usuário aprovou a interface e autorizou a próxima etapa, pedindo apenas duas listas: **Orçamentos gerados** e **Agendados**. **Aprovar e agendar** passa a ser uma única ação com escolha/revisão de horário. Não haverá status intermediário visível; somente a confirmação real do Google move o orçamento para Agendados. Pré-agendamentos antigos serão preservados como sugestão de horário, sem fingir evento criado.

Plano ativo: (1) backend SQLite/arquivos privados/sessão; (2) API de propostas, PDFs e migração explícita; (3) OAuth e APIs Calendar/Drive com idempotência; (4) duas listas e ação única; (5) testes controlados e documentação; (6) orientar configuração Google apenas quando indispensável. Não há autorização para criar infraestrutura paga ou publicar dados.

Pedido: `C:\Users\geved\Downloads\prompt-sistema-orcamentos-agendamentos-ecoclean.md`, especialmente seções 30 e 31. Parar após a primeira versão visual testada e solicitar validação antes de integração real, persistência definitiva, autenticação ou deploy.

## Inspeção concluída

- Frontend sem framework; fonte da página em `templates/index.html`, sincronizada com as entradas raiz e `public`.
- Express em `server.js`, restrito a `127.0.0.1:3000`. Nenhum Git, Worker, D1, R2 ou configuração de deploy encontrado nesta pasta.
- IndexedDB `ecoclean-propostas` v2: `quotes` e `draft`; localStorage `ecoclean-settings-v2` guarda identidade e condições. Backups JSON v1/v2.
- Itens com serviço, quantidade, unidade, preço PIX, descrição e até seis fotos convertidas para JPEG; logo mantém transparência.
- Modelo de valores em `public/model.js`; PDFKit com diagramação compartilhada em `public/pdf-renderer.js`. PDF offline usa Blob; servidor grava PDF sem associação persistente à proposta.
- Os dois arquivos `reference-*.png` são referências do orçamento Oficial Clean; não há imagem de CRM nesta pasta. A interface seguirá as orientações visuais escritas e a marca Ecoclean.
- Antes de alterar o módulo, os testes de cálculos/PDF passaram. PDFs e hashes de referência em `validacao/antes-modulo`.

## Plano desta etapa

1. [x] Acrescentar navegação, biblioteca, filtros, detalhes e configurações, preservando o formulário.
2. [x] Guardar metadados operacionais e cópias imutáveis dos PDFs no navegador para demonstrar o fluxo completo. Preservar e ampliar o backup.
3. [x] Implementar aprovação, revisão de agendamento, pré-agendamento local, reagendamento e cancelamento com confirmação. Não afirmar que um evento foi criado no Google.
4. [x] Disponibilizar exemplos fictícios opcionais, isolados dos dados reais, para avaliar estados ainda inexistentes.
5. [x] Testar interface desktop/mobile, console, dados antigos, PDF e recuperação após recarga.
6. [x] Atualizar README e documentação de arquitetura. Entrega local para validação visual; aguardar aprovação antes da próxima etapa.

## Arquitetura proposta após aprovação

Manter HTML/JS + Express. Acrescentar SQLite e arquivos privados fora de `public` para propostas, fotos e versões de PDF; sessão interna de um workspace, cookies HttpOnly/SameSite, CSRF e endpoints autenticados. Dados atuais serão importados somente após ação explícita do usuário. Para acesso por outros dispositivos, hospedar esse backend com volume persistente e HTTPS; a escolha do destino depende da infraestrutura confirmada, sem criar recursos externos neste checkpoint.

Google: OAuth 2.0 no backend, tokens cifrados e chave em variável de ambiente; `state` vinculado à sessão. Calendar com escopo de eventos e Drive com `drive.file`, sem acesso ao Drive inteiro. Upload da versão exata do PDF uma vez, vinculação com `attachments`/`supportsAttachments`, evento sem convidados. ID de operação/evento persistido antes de chamar o Google, exclusão mútua por orçamento e reconciliação por ID em falhas parciais. Reagendamento atualiza o mesmo evento; cancelamento preserva orçamento e versões do documento.

Documentação oficial consultada nesta etapa:

- https://developers.google.com/workspace/calendar/api/guides/create-events
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth

## Limite explícito

Este checkpoint é local. IndexedDB continua temporariamente como armazenamento; não há autenticação nova, OAuth real nem sincronização Google. Pré-agendamentos não equivalem a eventos confirmados no Calendar. Nada é enviado para fora por abrir a biblioteca.

## Entrega para avaliação

- URL: http://localhost:3000/#orcamentos. Use **Explorar exemplos** para avaliar estados fictícios isolados.
- Principais arquivos: `templates/index.html`, `public/workspace.js`, `public/workspace.css`, `public/operations-model.js`, `public/store.js`, `public/app.js` e `public/pdf-download.js`.
- O núcleo `public/model.js`, `public/pdf-renderer.js` e `utils/ecocleanPdf.js` conserva os hashes da referência inicial.
- Testes em perfis isolados: migração de IndexedDB v2, filtros, desktop/celular, fotos, PDF imutável, aprovação, revisão, duplo clique, reagendamento com mesmo ID, cancelamento, recarga e backup/importação v3. Nenhum erro relevante no console.
- Comparação final antes/depois: quatro PDFs com textos, fontes, imagem e número de páginas idênticos, desconsiderando somente o número aleatório da proposta. PDFs curtos de um a três itens continuam com uma página; exemplo extenso com três páginas. Verificado também o PDF efetivamente baixado pela interface HTTP e offline.
- Proteção adicional testada: a geração de PDF não sobrescreve uma edição do orçamento salva enquanto o documento estava sendo produzido.
- Capturas em `validacao/workspace-*.png`; PDFs de referência em `validacao/antes-modulo`.
- Proposta detalhada de persistência, segurança e Google: `docs/ARQUITETURA.md`.
- Aguardar validação visual de navegação, cards, painel e fluxo de agendamento. Backend definitivo, OAuth real e deploy não foram executados.

## Implementação após aprovação — 10/09/2026

Concluídos: duas listas e ação única; SQLite; PDFs privados e versionados; acesso por senha; CSRF; OAuth/Drive/Calendar; migração explícita; recuperação de tentativas; testes de API e navegador; guias de execução/conexão. O gerador offline, os preços e a renderização de PDF foram preservados.

Pendente externo: configurar o cliente OAuth da empresa e autorizar a conta Google para validar o primeiro evento real. Nenhuma credencial foi exposta, nenhuma conta real recebeu evento de teste e nenhum deploy foi realizado. As regras antigas de parada no checkpoint foram superadas pela aprovação explícita do usuário.
