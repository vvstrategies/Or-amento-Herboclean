# Guia rápido Herboclean

Execute `start.bat`: o servidor fica em segundo plano e o navegador abre http://localhost:3000. A janela de inicialização pode fechar normalmente. Após reiniciar o Windows, execute `start.bat` outra vez. Defina uma senha no primeiro acesso.

**Configurações:** identidade, condições, backup, importação dos dados antigos e conexão Google.

**Orçamentos gerados:** crie, consulte e edite as propostas. No detalhe, clique em **Aprovar e agendar**, escolha o horário e confirme.

**Agendados:** atendimentos com evento confirmado no Google. Reagendar preserva o evento; cancelar devolve a proposta para a lista de gerados.

A conexão Google requer configurar o cliente OAuth conforme [o guia](docs/CONEXAO-GOOGLE.md). Não há eventos reais até conectar a conta.

Os dados do arquivo `index.html` continuam acessíveis no modo offline. Exporte seu backup por ele e importe no servidor. O sistema não transfere dados antigos sem sua confirmação.

Veja [README.md](README.md) para armazenamento, segurança, valores, PDF e recuperação.
