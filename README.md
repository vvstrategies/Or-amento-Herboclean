# Herboclean — orçamentos e agendamentos

Sistema interno para criar propostas com fotos e a identidade da Herboclean, guardar PDFs e confirmar atendimentos no Google Agenda.

## Começar

1. Instale Node.js 24 ou superior. As dependências deste projeto já estão instaladas neste computador.
2. Execute `start.bat`: ele inicia em segundo plano, verifica o acesso e abre o navegador. Para executar no terminal, use `npm start` e mantenha o terminal aberto.
3. Abra **http://localhost:3000**. No primeiro acesso, escolha uma senha de pelo menos 12 caracteres.
4. Use **Configurações** para salvar identidade e condições da empresa uma única vez.
5. Crie propostas informando cliente, endereço, fotos, serviço, quantidade e preço desejado no PIX.

Depois de reiniciar o Windows, execute `start.bat` novamente. Repetir a abertura reutiliza o servidor existente. O iniciador informa conflitos de porta sem encerrar outros aplicativos. Os registros ficam em `data/server-output.log` e `data/server-error.log` (ou na pasta DATA_DIR configurada).

O acesso por `index.html` continua disponível para consultar/exportar dados antigos e gerar PDF offline. Para usar armazenamento no servidor e Google, utilize o endereço acima. São armazenamentos diferentes: arquivos locais não são enviados automaticamente.

## Duas listas

- **Orçamentos gerados:** propostas salvas, prontas para confirmar o atendimento.
- **Agendados:** propostas aprovadas com evento confirmado no Google Agenda.

No detalhe, **Aprovar e agendar** abre data, horário e duração. Confira os dados e confirme. O sistema gera/reutiliza a versão atual do PDF, envia o arquivo ao Drive e cria o evento na agenda da conta conectada. Só depois da confirmação do Google a proposta muda de lista. Não há etapa separada de aprovado ou pré-agendado.

Reagendar atualiza o mesmo evento. Cancelar pede confirmação, remove o evento e devolve a proposta à lista de gerados, preservando os PDFs. Concluídos e cancelados ficam disponíveis no filtro de histórico, sem pipelines adicionais. Não são enviados convites aos clientes.

## Google

Siga [o guia de conexão](docs/CONEXAO-GOOGLE.md). São necessários um cliente OAuth do tipo Aplicativo da Web, Calendar API e Drive API habilitadas e autorização da conta da empresa.

O código está implementado e foi testado com respostas controladas das APIs. **A criação na conta Google real ainda depende de configurar o OAuth e conectar a conta.** Os exemplos visuais não criam eventos externos.

## Armazenamento e segurança

- SQLite em `data/ecoclean.sqlite`: propostas, fotos incorporadas nos snapshots, configurações, rascunho, estados, versões, sessões e operações de sincronização.
- PDFs privados em `data/pdfs`. O arquivo gerado é guardado; visualizar e baixar não recria uma versão antiga.
- Cookies de sessão HttpOnly/SameSite, duração de 12 horas, proteção CSRF, verificação de origem e limite de tentativas de senha.
- Senha com scrypt. Tokens Google com AES-256-GCM, somente no servidor. Nunca são incluídos no backup JSON.
- Em desenvolvimento, a chave é criada em `data/token-key`. Preserve-a junto do banco para continuar lendo a conexão Google.
- O servidor escuta apenas em `127.0.0.1`. PDFs antigos que ainda estejam em `public/orcamentos` não são servidos pelo novo servidor.
- O aplicativo HTTP mantém CSP sem `unsafe-eval`; PDFKit roda no servidor. No modo arquivo, o navegador carrega PDFKit para gerar o PDF offline.

`npm run access:reset` permite definir outra senha no terminal do servidor, com entrada oculta. Encerra as sessões anteriores. Use-o também para configurar o acesso antes de uma implantação em produção.

## Dados antigos, importação e backup

Em **Configurações → Importar dados deste navegador**, uma confirmação copia propostas, fotos, PDFs e identidade para o servidor. Os originais locais são preservados. Repetir a mesma migração não duplica propostas idênticas. Se os dados estavam no arquivo `index.html`, abra esse arquivo, exporte o backup e importe-o na versão do servidor.

O backup JSON v4 inclui propostas, fotos, condições, rascunho, status e PDFs. Importa formatos v1–v4. Importar um backup cria cópias com novos IDs e preserva a biblioteca existente. A migração direta usa identificação de origem para evitar duplicações. Agendamentos importados não recuperam vínculos externos ativos; a data fica como sugestão para nova confirmação, evitando interferir nos eventos originais.

Para recuperação integral do servidor, pare o processo e copie a pasta `data` inteira, incluindo banco, PDFs e chave. Em produção, preserve também a chave do gerenciador de secrets. Não copie apenas o arquivo SQLite com o servidor em execução, pois o banco usa WAL. O backup JSON permite restaurar documentos sem os tokens Google; será necessário reconectar a conta.

## PDF e valores

Logo, cores, tipografia, apresentação e diferenciais da Herboclean permanecem configurados. Os nove serviços solicitados estão no catálogo. O preço preenchido é o valor no PIX. O investimento total inclui o repasse estimado das taxas de crédito e antecipação; padrão de 3 parcelas. As taxas são editáveis conforme o contrato da Asaas. Exemplo com data de proposta 10/09/2026: PIX R$ 200,00; cartão R$ 215,58, em 3x de R$ 71,86.

Propostas curtas ocupam uma página; propostas extensas continuam em páginas adicionais. O PDF direto não inclui caminho local nem cabeçalho/rodapé da impressão do navegador. Alterações futuras geram outra versão; as anteriores permanecem intactas. Uma nova confirmação/reagendamento atualiza o anexo com a versão atual.

## CEP e histórico de versões

No editor, o CEP aceita `00000-000` ou oito dígitos. A consulta pontual usa `BrasilAPI` como fonte principal e `ViaCEP` como fallback, por meio de `CepLookupProvider`. Resultados válidos são guardados em `cep_lookups`, um cache separado dos caches de geocodificação e rota. O preenchimento sugere logradouro, bairro, cidade, UF e IBGE; número e complemento permanecem editáveis. Após informar o número, o endereço completo segue para HeiGIT/Pelias e, então, para openrouteservice. Alterar CEP ou número gera um novo endereço comercial e a rota anterior deixa de ser usada.

O download usa `Proposta de orçamento para {cliente}.pdf`, preservando espaços e acentos e removendo somente caracteres inválidos para arquivos. Depois de gerar o PDF, o download começa antes do retorno automático à lista **Orçamentos gerados**.

Cada alteração comercial cria uma versão imutável da proposta com seu snapshot financeiro. Em **Histórico de versões**, a versão atual é identificada e as anteriores mantêm seus PDFs disponíveis. Excluir uma versão é um soft delete: PDFs e registros ficam preservados para auditoria, mas deixam de compor a listagem e os cálculos ativos. Ao excluir a versão atual, a versão válida anterior é promovida com o seu próprio snapshot, sem recalcular premissas antigas. Se houver apenas uma versão, a proposta é arquivada da lista ativa. Propostas agendadas ou concluídas não permitem excluir versões, para preservar atendimento, DRE e o evento existente no Google Agenda.

## Variáveis de ambiente

Consulte `.env.example`. Preencha os valores no `.env` privado, sem sobrescrever outras configurações existentes.

| Variável | Uso |
| --- | --- |
| PORT | Porta local, padrão 3000 |
| APP_ORIGIN | Endereço exato usado no navegador; sem barra final |
| NODE_ENV | development local; production exige HTTPS e chave explícita |
| DATA_DIR | Pasta persistente privada, padrão ./data |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Credenciais OAuth do aplicativo Web |
| GOOGLE_REDIRECT_URI | APP_ORIGIN + /api/google/callback |
| GOOGLE_CALENDAR_ID | primary ou ID de uma agenda pertencente à conta conectada |
| GOOGLE_TOKEN_ENCRYPTION_KEY | Chave estável de 32 bytes em base64; obrigatória em produção |

Não altere a chave após conectar sem uma migração das credenciais. A conexão existente depende dela.

## Arquitetura e implantação

Frontend HTML/CSS/JavaScript existente, Express, SQLite nativo do Node e arquivos privados. Não foi acrescentado framework, cadastro público, CRM ou infraestrutura paga. Detalhes em [ARQUITETURA.md](docs/ARQUITETURA.md).

Nenhum deploy externo foi realizado. Para acesso por outro dispositivo, será necessário definir a hospedagem: Node 24+, uma instância com disco persistente, proxy HTTPS para o servidor local, APP_ORIGIN e callback Google correspondentes, senha configurada e chave de criptografia estável em secrets. Hospedagem estática não executa este backend. Não use um filesystem efêmero nem várias réplicas sem revisar armazenamento e concorrência.

## Validação

- `npm test`: preços, marca, catálogo, PDF, estados, segurança, API, persistência, OAuth, Drive e Calendar com simulador local.
- `npm run test:browser`: Edge em perfil isolado, com servidor temporário e contas fictícias; acesso, migração, duas listas, revisão, duplo clique, PDF, reagendamento, cancelamento, edição, recarga, backup, desktop e celular.
- `node scripts/check-startup.cjs`: inicialização em segundo plano, abertura repetida, execução fora da pasta e conflito de porta, usando servidor temporário.
- `npm run test:offline`: gerador pelo arquivo local.
- `python scripts/review-pdf.py`: confere quantidade de páginas, fontes e limites dos textos; requer PyMuPDF em `.tools`. A comparação de pixels em `compare-pdfs.py` usa a marca antiga como referência histórica e não se aplica à troca autorizada de logo.

Não há etapa de compilação do frontend. Após editar `templates/index.html`, execute `node scripts/sync-ui.cjs`. O código de cálculo e renderização compartilhada permanece em `public/model.js` e `public/pdf-renderer.js`.

## Identidade Herboclean

Em 17/09/2026, o nome e o logo foram atualizados para Herboclean. O PNG fornecido está em `public/assets/herboclean.png`, sem alteração dos pixels. A interface e o PDF acomodam suas margens transparentes sobre fundo escuro. Identidade salva e rascunho recebem a marca nova uma única vez; PDFs arquivados mantêm seu conteúdo original. Contatos, preços, IDs internos e conexão Google são preservados. O Instagram existente não foi substituído por um endereço presumido.


Atualização do produto: consulte [funcionalidades e padrão Asaas](docs/ATUALIZACAO-PRODUTO-ASAAS.md). A instalação consolidada agora inclui custos, DRE, despesas e recorrências, mantendo os dados da Herboclean.

## Atualização de rentabilidade e integrações

A Herboclean também possui Inteligência / Rentabilidade, simulador de preço, metas e custos reais; Configurações → Integrações reúne Calendar, Maps, Google Ads e Meta Ads. Financeiro → Marketing apresenta gastos importados na DRE. [Configuração das integrações](INTEGRATIONS_SETUP.md) · [Atualização e validação](docs/ATUALIZACAO-RENTABILIDADE-INTEGRACOES.md).
