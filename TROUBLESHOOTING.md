# 🆘 TROUBLESHOOTING E FAQ

## ❓ Perguntas Frequentes

### P: Por quanto tempo o orçamento é válido?
**R:** 30 dias por padrão. Você pode mudar no arquivo `utils/pdfGenerator.js` procurando por `Validade: 30 dias`.

### P: Quais são as opções de pagamento?
**R:** 
- **PIX:** 5% de desconto à vista
- **Cartão:** Até 4x sem juros

Ambas aparecem automaticamente no PDF.

### P: Posso enviar mais de 10 fotos?
**R:** Não, máximo 10 fotos por orçamento. Se precisar de mais, gere 2 orçamentos separados.

### P: Qual o tamanho máximo de cada foto?
**R:** Até 10MB por foto. Recomendado: 2-5MB (fotos comuns de celular).

### P: Quanto custa usar o sistema?
**R:** Grátis! Você só paga pela API da Anthropic (Claude). Cada orçamento custa aproximadamente R$0,30 a R$0,50 em requisições de IA.

### P: Preciso estar online o tempo todo?
**R:** Sim, o sistema precisa de conexão com internet para:
- Comunicar com Claude (análise de fotos)
- Gerar os PDFs (será tudo local após análise)

### P: Posso usar no celular?
**R:** Sim! Se o servidor está rodando no PC, acesse pelo celular:
1. Descubra o IP: `ipconfig` no PowerShell (procure "IPv4")
2. No celular: `http://[SEU_IP]:3000`
3. Exemplo: `http://192.168.1.50:3000`

### P: Os PDFs ficam guardados onde?
**R:** Em `public/orcamentos/`. Você pode:
- Movê-los para sua pasta de arquivos
- Fazer backup
- Organizar por cliente

---

## 🔧 Erros Comuns e Soluções

### Erro 1: "ANTHROPIC_API_KEY is undefined"

**Problema:** Chave da API não foi configurada

**Solução:**
1. Abra o arquivo `.env`
2. Verifique se tem `ANTHROPIC_API_KEY=sua_chave_aqui`
3. Se não tiver chave, gere uma em: https://console.anthropic.com/
4. Salve o arquivo `.env`
5. Reinicie o servidor (Ctrl+C e `npm start`)

```env
// Correto:
ANTHROPIC_API_KEY=sk-ant-v0-abc123xyz
PORT=3000

// Errado:
ANTHROPIC_API_KEY=
ANTHROPIC_API_KEY=sua_chave_aqui
```

---

### Erro 2: "Port 3000 already in use"

**Problema:** Outra aplicação está usando a porta 3000

**Solução:**
1. Abra o arquivo `.env`
2. Mude `PORT=3000` para `PORT=3001` (ou outro número)
3. Salve o arquivo
4. Inicie novamente: `npm start`
5. Acesse: `http://localhost:3001`

```env
PORT=3001  // Tente 3001, 3002, 3003, etc
```

---

### Erro 3: "Cannot find module 'pdfkit'"

**Problema:** Dependências não foram instaladas

**Solução:**
```powershell
npm install
```

Se continuar:
```powershell
npm install --force
npm cache clean --force
npm install
```

---

### Erro 4: "Arquivo .env não encontrado"

**Problema:** O arquivo de configuração não existe

**Solução:**
1. Navegue até a pasta do projeto
2. Crie um novo arquivo chamado `.env`
3. Copie o conteúdo de `.env.example`
4. Adicione sua chave da API

Ou pelo PowerShell:
```powershell
Copy-Item ".env.example" ".env"
# Depois edite o .env com sua chave
```

---

### Erro 5: "PDF não é gerado / Fica em branco"

**Problema:** Falha na geração do PDF

**Solução:**
1. Verifique permissões da pasta `public/orcamentos`
2. Libere espaço em disco (mínimo 1GB livre)
3. Reinicie o servidor
4. Tente gerar novamente

Verificar espaço em disco:
```powershell
Get-Volume
```

---

### Erro 6: "Conexão recusada / Não consegue acessar localhost:3000"

**Problema:** Servidor não iniciou corretamente

**Solução:**
1. Verifique se aparecem as mensagens:
   ```
   🚀 Servidor rodando em http://localhost:3000
   📸 Pronto para receber orçamentos com fotos!
   ```

2. Se não aparecer, procure por erros no console
3. Comum: falta de dependências
   ```powershell
   npm install
   npm start
   ```

---

### Erro 7: "Arquivo muito grande / Timeout ao enviar"

**Problema:** Foto maior que 10MB ou conexão lenta

**Solução:**
1. Comprima a foto (máximo 5MB é ideal)
2. Reduza resolução usando:
   - Windows: Paint → Redimensionar
   - Online: https://tinypng.com
3. Tente novamente

---

### Erro 8: "IA não consegue analisar a foto"

**Problema:** Foto muito escura, desfocada ou inválida

**Solução:**
1. Tente outra foto mais clara
2. Verifique se é uma imagem válida (.jpg, .png, .webp)
3. Se for arquivo corrompido, tente retomar
4. Alguns formatos raros não funcionam

---

### Erro 9: "Valores estão muito altos/baixos"

**Problema:** A IA estimou valores incorretos

**Solução:**
1. Ajuste em `routes/orcamento.js`:
   ```javascript
   const valorHora = 120; // Mude aqui
   ```

2. Ou edite manualmente o PDF antes de enviar

3. Gere novo orçamento com dados diferentes

---

### Erro 10: "Node.js não é reconhecido"

**Problema:** Node.js não foi instalado ou não está no PATH

**Solução:**
1. Instale Node.js: https://nodejs.org/ (LTS)
2. Reinicie o PowerShell
3. Verifique instalação:
   ```powershell
   node --version
   npm --version
   ```

4. Se ainda não funcionar, adicione ao PATH manualmente

---

## 📱 Usando em Dispositivo Móvel

### iOS / Android

1. **Encontrar IP do computador:**
   ```powershell
   ipconfig
   # Procure por "IPv4 Address: 192.168.X.X"
   ```

2. **No celular, abra o navegador e acesse:**
   ```
   http://192.168.1.50:3000
   (adapte o IP para o seu)
   ```

3. **Pronto!** Pode usar normalmente
   - Tirar fotos direto do celular
   - Preencher formulário
   - Gerar orçamento

### Dicas:
- Use Wi-Fi (mesma rede que o PC)
- Certifique-se que firewall permite conexão
- Se não conseguir, reinicie o router

---

## 🔒 Segurança

### Proteger sua Chave API
1. **Nunca compartilhe** seu `.env`
2. **Nunca faça commit** do `.env` no Git
3. Se vazar sua chave:
   - Vá em https://console.anthropic.com/
   - Delete a chave vazada
   - Crie uma nova
   - Atualize o `.env`

### Dados dos Clientes
- Os PDFs ficam em `public/orcamentos/`
- As fotos temporárias são deletadas após uso
- Nada é enviado para servidor externo (apenas análise na API)

---

## ⚡ Performance

### Se o sistema está lento:

1. **Feche outros programas** que usam muita RAM
2. **Reinicie o servidor:** `npm start`
3. **Limite fotos:** máximo 10 fotos por orçamento
4. **Foto menor:** redimensione para 2-3MB

### Tempo típico:
- Upload: 2-5 segundos
- Análise por IA: 10-20 segundos
- Geração PDF: 2-3 segundos
- **Total: 15-30 segundos**

---

## 🗑️ Limpeza e Manutenção

### Apagar orçamentos antigos:
```powershell
# Abra a pasta e delete manualmente
cd "C:\Users\seu_usuario\Downloads\orçamento\public\orcamentos"
dir  # Ver arquivos
# Delete os antigos
```

### Apagar cache do navegador:
```
Ctrl + Shift + Delete
Selecione: Imagens, arquivos em cache
Clique: Limpar dados
```

### Reiniciar o sistema:
```powershell
# Feche o servidor (Ctrl+C)
npm cache clean --force
npm install
npm start
```

---

## 🚀 Otimizações

### Para velocidade ainda maior:

1. **Usar SSD:** Arquivos em disco SSD são mais rápidos
2. **Mais RAM:** Se tiver menos de 8GB, feche outros programas
3. **Cache:** Sistema já cacheando em memória
4. **Conexão:** Fibra/banda larga é muito mais rápida

---

## 📞 Se Nada Funcionar

1. **Colete as informações:**
   - Versão do Node: `node --version`
   - Versão npm: `npm --version`
   - Sistema operacional: Windows 10/11?
   - Mensagem de erro exata

2. **Tente em ordem:**
   - Feche e abra PowerShell novamente
   - Reinicie o computador
   - Desinstale e reinstale Node.js
   - Limpe tudo: `npm cache clean --force`

3. **Verifique online:**
   - Google: "Error message aqui"
   - Stack Overflow
   - GitHub Issues

---

## 🎓 Aprendendo Mais

### Sobre Node.js:
- https://nodejs.org/en/docs/
- https://www.w3schools.com/nodejs/

### Sobre Claude API:
- https://docs.anthropic.com/
- https://console.anthropic.com/

### Sobre Express.js:
- https://expressjs.com/
- https://www.w3schools.com/express/

---

## ✅ Checklist de Troubleshooting

- [ ] Arquivo `.env` existe e tem a chave API?
- [ ] `npm install` foi executado sem erros?
- [ ] Node.js está instalado? (`node --version`)
- [ ] Porta 3000 está disponível?
- [ ] Servidor iniciou com as mensagens corretas?
- [ ] Navegador consegue acessar `localhost:3000`?
- [ ] Fotos estão no formato correto (.jpg, .png)?
- [ ] Fotos não excedem 10MB?
- [ ] Conexão com internet está ativa?
- [ ] Firewall permite a porta 3000?

Se tudo okay, o sistema deve funcionar perfeitamente! 🎉

---

**Dúvida persistente?**
- Releia a seção correspondente neste arquivo
- Verifique o GUIA_RAPIDO.md
- Consulte o README.md
