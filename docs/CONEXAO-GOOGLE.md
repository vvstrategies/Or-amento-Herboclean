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

## Referências oficiais

- [OAuth para aplicações Web no servidor](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Criação de eventos e anexos](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Atualização do evento existente](https://developers.google.com/workspace/calendar/api/v3/reference/events/update)
- [Upload e IDs pré-gerados no Drive](https://developers.google.com/workspace/drive/api/guides/manage-uploads)

A validação automatizada usa um simulador local dessas APIs e não comprova permissões da conta real. A conexão e o primeiro evento real são a validação final da sua configuração Google.
