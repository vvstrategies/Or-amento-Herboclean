# 🎨 CUSTOMIZAÇÃO DO SISTEMA

## Personalizando para sua Empresa

Siga as instruções abaixo para adaptar o sistema com as informações e estilo da sua empresa.

---

## 1️⃣ INFORMAÇÕES DA EMPRESA

Edite o arquivo `config.js` e atualize:

```javascript
empresa: {
  nome: 'SUA EMPRESA DE LIMPEZA',
  telefone: '(11) 9 9999-9999',
  email: 'contato@suaempresa.com.br',
  website: 'www.suaempresa.com.br',
  endereco: 'São Paulo, SP'
}
```

---

## 2️⃣ CORES DO ORÇAMENTO

No arquivo `utils/pdfGenerator.js`, edite as cores:

```javascript
const CORES = {
  primaria: '#2d5a3d',      // Verde escuro (sua cor principal)
  secundaria: '#d4af37',    // Dourado (cor de destaque)
  texto: '#333333',
  textoclaro: '#666666',
  fundo: '#f8f8f8'
}
```

**Exemplos de cores:**
- Verde/Dourado: `#2d5a3d` / `#d4af37` (padrão atual)
- Azul/Dourado: `#003d7a` / `#d4af37`
- Cinza/Azul: `#404040` / `#0066cc`

---

## 3️⃣ VALORES E PREÇOS

No arquivo `routes/orcamento.js`, procure por:

```javascript
const valorHora = 120; // Mude para seu valor (R$)
// ...
(valorMaoDeObra * 0.25); // Mude 0.25 para sua margem (25% = 0.25, 30% = 0.30)
```

**Exemplos:**
- Valor/Hora = R$150, Margem = 30%
- Valor/Hora = R$100, Margem = 20%

---

## 4️⃣ SERVIÇOS OFERECIDOS

No arquivo `public/index.html`, edite os serviços no `<select>`:

```html
<option value="Limpeza Básica">Limpeza Básica</option>
<option value="Limpeza Profunda">Limpeza Profunda</option>
<option value="Impermeabilização">Impermeabilização</option>
<!-- Adicione ou remova conforme sua empresa oferece -->
```

---

## 5️⃣ CORES DO FRONTEND

No arquivo `public/index.html`, na seção `<style>`, edite:

```css
body {
    background: linear-gradient(135deg, #2d5a3d 0%, #1f3d2a 100%);
}

.header {
    background: linear-gradient(135deg, #2d5a3d 0%, #1f3d2a 100%);
    border-bottom: 4px solid #d4af37;
}
```

---

## 6️⃣ ADICIONAR LOGO

Para adicionar sua logo no PDF:

1. Edite `utils/pdfGenerator.js`
2. Procure por: `// ===== CABEÇALHO COM FUNDO COLORIDO =====`
3. Adicione código para desenhar imagem:

```javascript
// Adicionar logo (após doc.pipe(stream))
try {
  doc.image('caminho/para/logo.png', 50, 25, { width: 80 });
} catch (e) {
  console.log('Logo não encontrada');
}
```

---

## 7️⃣ TEXTOS E DIFERENCIAIS

No arquivo `utils/pdfGenerator.js`, procure por:

```javascript
const diferenciais = [
  'Análise Profissional com IA - Identificação precisa de cada tipo de estofado',
  'Orçamento Customizado - Detalhamento completo de cada item',
  'Transparência Total - Valores especificados e sem surpresas',
  'Garantia de Satisfação - Serviço de qualidade garantida'
];
```

Customize com seus diferenciais!

---

## 8️⃣ DESCONTO PIX

O desconto PIX é fixo em 5%. Para mudar:

No arquivo `utils/pdfGenerator.js`:

```javascript
const desconto = parseFloat(dados.valorTotal) * 0.05; // 0.05 = 5%
// Mude para 0.10 para 10% de desconto, etc
```

---

## 9️⃣ VALIDADE DO ORÇAMENTO

No arquivo `utils/pdfGenerator.js`, procure por:

```javascript
doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')} | Validade: 30 dias`, 40, 85);
```

Mude `30 dias` para sua validade padrão (15 dias, 20 dias, etc)

---

## 🔟 CONDIÇÕES E FORMAS DE PAGAMENTO

No arquivo `routes/orcamento.js`, customize os termos:

```javascript
// Adicione ao final da análise
const condicoes = {
  validade: '30 dias',
  adiantamento: '50%',
  prazo: 'Conforme agendamento',
  garantia: 'Satisfação garantida'
};
```

---

## ✅ CHECKLIST DE CUSTOMIZAÇÃO

- [ ] Alterei nome da empresa em `config.js`
- [ ] Alterei telefone, email e endereço em `config.js`
- [ ] Alterei cores em `pdfGenerator.js` (primária e secundária)
- [ ] Alterei valores de preço em `routes/orcamento.js`
- [ ] Adicionei serviços que ofereço no formulário
- [ ] Customizei diferenciais da empresa
- [ ] Testei gerando um orçamento
- [ ] Verifiquei o PDF gerado
- [ ] Compartilhei com cliente para feedback

---

## 🧪 TESTANDO

1. Inicie o servidor: `npm start`
2. Abra: http://localhost:3000
3. Preencha os dados de teste:
   - Cliente: "Teste"
   - Endereço: "São Paulo, SP"
   - Serviço: Qualquer um
   - Quantidade: 2

4. Envie 2-3 fotos de estofados
5. Clique em "✨ Gerar Orçamento"
6. Aguarde 15-30 segundos
7. Baixe e abra o PDF para verificar:
   - Cores estão corretas?
   - Valores aparecem certos?
   - Sua empresa está identificada?

---

## 📸 MELHORANDO A QUALIDADE

Para orçamentos ainda mais profissionais:

1. **Adicione marca d'água**
   - Editar `pdfGenerator.js`
   - Adicionar texto fantasma atrás do conteúdo

2. **Use fontes premium**
   - PDFKit suporta fontes customizadas
   - Adicione fonte `.ttf` à pasta do projeto

3. **Adicione QR Code**
   - Instale pacote: `npm install qrcode`
   - Gere QR code com link para aceitar orçamento

4. **Rodapé com logo**
   - Adicione imagem do logo no rodapé
   - Use `doc.image()` na seção de rodapé

---

## 🚀 PRÓXIMOS PASSOS

1. Customize tudo conforme sua empresa
2. Teste com dados reais
3. Ajuste valores baseado em seus custos
4. Use com seus clientes!

Boa sorte! 🎉
