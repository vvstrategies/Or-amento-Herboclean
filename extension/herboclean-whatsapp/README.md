# Herboclean — extensão de teste local

1. Inicie o piloto do projeto com `npm.cmd run pilot:whatsapp` e abra http://localhost:3310/painel.
2. No Chrome da Herboclean, abra `chrome://extensions`, habilite Modo do desenvolvedor e use **Carregar sem compactação** nesta pasta.
3. Recarregue o WhatsApp Web, confirme a conta +55 11 92612-6244 e abra o contato de teste +55 11 98649-5346.
4. Clique no ícone da extensão e entre com seu acesso local. Senhas: `.tools/whatsapp-pilot/ACESSOS-LOCAIS.txt`, na pasta do projeto.

Só prepara texto; Enviar é manual. Inserção exige telefone visível, conversa correspondente e campo vazio. Contato salvo que exibe só o nome: busque o cliente no painel e use Copiar, conferindo o destinatário. Não são lidas conversas em massa. O acesso da extensão se limita ao WhatsApp Web e ao painel local.

Este pacote não conecta à produção. Os links localhost só funcionam no computador do piloto. Instruções e roteiro completos em `docs/WHATSAPP-PILOTO.md` no projeto. A instalação e validação no WhatsApp real estão pendentes da revisão do usuário.

## Atualização 0.1.1

Corrige o erro de abertura `sidePanel.open() may only be called in response to a user gesture`. O Chrome abre o painel diretamente pelo ícone, com `openPanelOnActionClick`.

Se a extensão foi carregada desta pasta, clique em Recarregar no cartão dela em `chrome://extensions`. Se foi instalada a partir do ZIP, extraia novamente o ZIP atualizado na pasta usada anteriormente e recarregue o cartão. Confira a versão 0.1.1, recarregue a aba do WhatsApp Web e clique no ícone da Herboclean. Não é necessário desinstalar nem alterar permissões.

## Atualiza??o 0.1.2

A leitura da conversa aceita o telefone como texto do cabe?alho, mesmo sem `span[title]`. Quando `#main` n?o existe, usa o cont?iner que re?ne um ?nico cabe?alho e o campo de mensagem. Nomes, grupos e estruturas amb?guas continuam sem identifica??o autom?tica por telefone. A busca do cliente tamb?m ? retomada depois do login.

Recarregue a extens?o em `chrome://extensions`, confira **0.1.2**, recarregue o WhatsApp Web e reabra o painel. Para instala??es extra?das do ZIP, extraia o pacote atualizado na mesma pasta primeiro.

Testes automatizados passaram. A valida??o desta corre??o na conversa real ainda depende de recarregar a extens?o no perfil da Herboclean.
