# Arquitetura implementada

A evolução autorizada mantém o frontend HTML/CSS/JavaScript e o gerador existentes. Express expõe a API; SQLite e arquivos privados dão persistência. Não há CRM, cadastro público, framework novo ou serviço de hospedagem criado.

## Componentes

- `templates/index.html`: fonte da página, sincronizada para a entrada HTTP e arquivo local.
- `public/app.js`: editor, marca, fotos, valores e geração.
- `public/workspace.js`: biblioteca, duas listas, detalhe, confirmação e configurações.
- `public/auth.js`: entrada e sessão; CSRF somente em memória.
- `public/store.js`: adaptador IndexedDB preservado para uso offline e migração explícita.
- `public/remote-store.js`: persistência HTTP após autenticação.
- `backend/app.js`: rotas, validação, importação e controle de acesso.
- `backend/database.js`: SQLite, snapshots, versões, operações e idempotência.
- `backend/security.js`: scrypt, sessões, origem/CSRF, limite de tentativas e criptografia.
- `backend/google.js`: OAuth Authorization Code com PKCE/estado vinculado à sessão, renovação, Drive e Calendar por REST.
- `backend/service.js`: transações operacionais e recuperação após falhas.

O modelo de preço e o renderizador compartilhado de PDF não foram alterados. A função de saída do servidor passou a gravar em diretório privado. Fotos ficam incorporadas em snapshots JSON no banco; PDFs ficam no filesystem privado.

## Estados

`generated` → confirmar aprovação e agendamento → `scheduled`.

A confirmação depende de resposta bem-sucedida do Google. Cancelar o evento devolve a proposta a `generated`. `completed` e `cancelled` são filtros de histórico, sem listas adicionais. Estados antigos `awaiting`/`approved` e pré-agendamentos viram `generated`, com data preservada como sugestão; não são considerados eventos reais.

## Transações e falhas

A edição usa revisão otimista para impedir sobrescrita por uma aba com versão antiga. Geração e agendamento são serializados por proposta. Travas no banco expiram em cinco minutos; uma operação interrompida pode precisar desse intervalo antes da recuperação.

O sistema persiste a intenção e o ID do evento antes da chamada remota. PDFs têm fingerprint de conteúdo e versões imutáveis. Arquivos Drive usam ID pré-gerado persistido antes do upload. Uma resposta perdida pode ser recuperada consultando os mesmos IDs. Não existe transação distribuída entre Google e SQLite: a intenção pendente registra essa incerteza até a confirmação local.

A chave de confirmação é verificada contra o conteúdo da solicitação. Duplo clique não cria outro evento. Reagendamento preserva ID e usa ETag na atualização. Cancelamento atua no ID registrado e verifica a propriedade privada da aplicação. `sendUpdates=none` e ausência de participantes impedem o envio automático de convites pelo sistema.

## Privacidade e implantação

Uma empresa e uma senha de acesso; sessões privadas, CSRF, validação de Host/Origin, rate limit e endpoints de documentos protegidos. Somente código e assets da marca são públicos. Não há CORS aberto. Tokens são cifrados no servidor; backups portáveis nunca contêm tokens, senha ou sessões.

A instância local escuta em loopback. Uma implantação futura exige HTTPS, proxy que preserve o Host configurado, Node 24+, uma instância com volume persistente, senha configurada pelo terminal e chave estável em secrets. Não foi feito deploy nem criado recurso externo. SQLite nativo em Node 24 ainda pode emitir aviso experimental; a versão 24.14.0 foi usada nos testes.

Backups JSON restauram os documentos, com novos IDs e sem reativar vínculos Google. A recuperação integral do mesmo ambiente requer copiar `data` com o processo parado e conservar a chave. Múltiplas réplicas e filesystem efêmero não fazem parte desta implementação.

## Limites de verificação

Testes controlados cobrem autenticação, CSRF, documentos privados, revisões, persistência, criptografia, OAuth, upload, perda de resposta, falha após criação remota, reagendamento e cancelamento. Edge verificou acesso, migração, duas listas, confirmação, PDFs, recarga e layouts desktop/mobile sem erros relevantes no console.

A conta Google corporativa não foi conectada: falta cadastrar as credenciais OAuth e realizar o consentimento. A confirmação de um evento na agenda real permanece como validação final dessa configuração, conforme [CONEXAO-GOOGLE.md](CONEXAO-GOOGLE.md).
