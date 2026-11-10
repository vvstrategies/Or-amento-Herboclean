# Conectar a agenda da Ecoclean

A integração está implementada. Para ativá-la, cadastre o aplicativo no Google e autorize a conta da empresa. Não envie Client Secret, tokens ou senhas pelo chat.

## 1. Configurar o aplicativo Google

No [Google Cloud Console](https://console.cloud.google.com/), selecione um projeto existente da empresa ou crie o projeto destinado a esta integração. Habilite **Google Calendar API** e **Google Drive API**.

Em **Google Auth Platform**, configure nome e e-mail de suporte do aplicativo. Se a empresa usa Google Workspace e a opção estiver disponível, público **Interno** limita o acesso à organização. Para uma conta comum, use **Externo** e, durante os testes, adicione o e-mail corporativo em usuários de teste. As exigências de publicação/verificação dependem do tipo de conta e público escolhido.

Crie um cliente OAuth do tipo **Aplicativo da Web**. Cadastre este URI de redirecionamento autorizado exatamente:

```
http://localhost:3000/api/google/callback
```

O sistema usa fluxo no servidor; não precisa de origem JavaScript autorizada para trocar tokens. Em implantação HTTPS futura, acrescente o callback correspondente ao domínio real.

Permissões solicitadas pelo código:

- `openid` e `email`: identificar a conta autorizada.
- `https://www.googleapis.com/auth/calendar.events.owned`: gerenciar eventos nas agendas pertencentes à conta conectada.
- `https://www.googleapis.com/auth/drive.file`: criar e acessar arquivos usados por este aplicativo.

O sistema não solicita acesso geral a todos os arquivos do Drive nem cadastra participantes no evento.

## 2. Salvar credenciais no servidor

Abra `.env` nesta pasta e acrescente as linhas abaixo com os valores do cliente OAuth. Não sobrescreva o arquivo inteiro se ele já existir.

```dotenv
APP_ORIGIN=http://localhost:3000
GOOGLE_CLIENT_ID=seu-client-id
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_CALENDAR_ID=primary
```

`primary` usa a agenda principal da conta que você conectar. Para outra agenda, informe o ID nas configurações dessa agenda. Ela deve pertencer à conta conectada, conforme a permissão solicitada.

Reinicie `start.bat` ou `npm start`. Acesse o endereço exato `http://localhost:3000`; `127.0.0.1` é uma origem diferente.

## 3. Autorizar a conta e conferir

Entre no sistema → **Configurações → Conectar Google**. Escolha a conta corporativa, confira as permissões e autorize. A tela deve voltar mostrando **Conectado** e o e-mail selecionado.

Abra um orçamento de teste → **Aprovar e agendar** → escolha uma data futura → revise → confirme. Confira na agenda:

- título com cliente e serviço;
- endereço na localização;
- serviços, contato, observações e valor PIX na descrição;
- PDF da proposta como anexo privado do Drive.

Só após a resposta do Google o orçamento aparece em **Agendados**. Nenhum convite é enviado ao cliente. O arquivo fica privado na pasta **Ecoclean - Orçamentos**, criada pelo aplicativo. O link do anexo não concede acesso público ao PDF.

## Reagendar, cancelar e desconectar

**Reagendar** altera o mesmo evento e conserva seu identificador. Se a proposta mudou, o evento recebe a versão atual do PDF; o documento anterior continua na biblioteca.

**Cancelar agendamento** pede confirmação antes de remover o evento. O orçamento volta à lista de gerados. **Desconectar Google** encerra o uso das credenciais pelo aplicativo e tenta revogar a autorização no Google; não remove eventos ou PDFs existentes. Se a revogação remota falhar, remova também o acesso nas permissões da conta Google. Reconecte a mesma conta para continuar administrando os eventos vinculados.

## Falhas e recuperação

Uma falha de rede não move uma proposta nova para Agendados. Os identificadores reservados de evento e arquivo ficam guardados no banco para que uma nova tentativa recupere o que já foi criado. O detalhe informa a falha e permite repetir ou cancelar a tentativa. Em uma falha de reagendamento, o último agendamento confirmado permanece visível até a nova confirmação.

Após encerramento inesperado do processo durante uma operação, a trava de concorrência pode exigir aguardar até 5 minutos. Se o Google pedir novo consentimento, use Reconectar Google. Não apague a pasta/arquivos usados pelo sistema no Drive; se estiverem na lixeira, restaure-os antes de tentar novamente.

Enquanto um aplicativo Externo permanecer em modo de teste, o Google pode expirar o refresh token após sete dias para estas permissões. Para uso contínuo, ajuste o estado de publicação e cumpra as exigências aplicáveis da própria plataforma.

## Google Contatos (Importar contato)

O botão **Importar contato → Google Contatos** usa a People API em modo **somente leitura** (`https://www.googleapis.com/auth/contacts.readonly`). A permissão é pedida só quando alguém clica em Google Contatos (autorização incremental, com `include_granted_scopes=true`): Agenda e Drive continuam conectados e nada é escrito nos contatos.

Ações no Google Cloud Console (mesmo projeto do `GOOGLE_CLIENT_ID`):

1. **APIs e serviços › Biblioteca** → ative **Google People API**.
2. **Tela de consentimento OAuth › Escopos** (ou *Acesso a dados*) → adicione `.../auth/contacts.readonly`. É um escopo sensível: com o app em produção o Google pode exigir verificação.
3. A URI de redirecionamento não muda: `APP_ORIGIN/api/google/callback`.

A agenda não é gravada: o seletor carrega 50 contatos por vez (ou busca por nome) direto da People API, e só o contato escolhido entra no formulário.

## Por que a conexão pedia reconexão com frequência

- O access token expira em ~1 hora; isso é normal. O servidor renova sozinho com o refresh token, que fica criptografado no SQLite (`DATA_DIR`) e sobrevive a reload, logout, restart e deploy.
- Antes, **qualquer** falha na renovação (rede, timeout, 5xx do Google) marcava a conta como "Reconectar". Agora só `invalid_grant` (token expirado ou revogado) faz isso; falhas temporárias aparecem como "Temporariamente indisponível" e a próxima tentativa segue sozinha.
- O refresh token nunca é sobrescrito por vazio; se o Google enviar um novo, ele substitui o anterior.
- Se o estado **Credencial revogada** voltar a aparecer a cada ~7 dias, a causa é o app OAuth em **Testing** (Tela de consentimento OAuth › Status de publicação). Isso só se resolve publicando o app (In production) no Google Cloud. Não é algo que o código consiga contornar.

## Referências oficiais

- [OAuth para aplicações Web no servidor](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Criação de eventos e anexos](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Atualização do evento existente](https://developers.google.com/workspace/calendar/api/v3/reference/events/update)
- [Upload e IDs pré-gerados no Drive](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [People API · connections.list](https://developers.google.com/people/api/rest/v1/people.connections/list) e [searchContacts](https://developers.google.com/people/api/rest/v1/people/searchContacts)

A validação automatizada usa um simulador local dessas APIs e não comprova permissões da conta real. A conexão e o primeiro evento real são a validação final da sua configuração Google.
