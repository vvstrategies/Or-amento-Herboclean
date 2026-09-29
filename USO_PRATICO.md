# 📚 GUIA COMPLETO DE USO - SISTEMA DE ORÇAMENTOS

## 🎯 Caso de Uso Prático

Você recebeu uma ligação de um cliente chamado **Carlos Silva** em **São Paulo** que quer limpar:
- 1 sofá grande
- 2 poltronas
- 3 cadeiras estofadas

Quer saber o valor antes de contratar. Aqui está como fazer:

---

## PASSO 1: Fotografar os Estofados

1. **Tire fotos claras** dos itens:
   - De frente
   - Zoom em manchas/problemas
   - Vista geral do ambiente

2. **Qualidade das fotos:**
   - Boa iluminação (natural é melhor)
   - Foco nítido no item
   - Máximo 10MB por foto

3. **Guarde em uma pasta:**
   - `C:\Fotos\Carlos_Silva\`
   - Com nomes tipo: `sofa.jpg`, `poltrona1.jpg`, etc

---

## PASSO 2: Iniciar o Sistema

1. **Abra o terminal PowerShell** (Windows + R, digite `powershell`)

2. **Navigate até a pasta:**
   ```powershell
   cd "C:\Users\seu_usuario\Downloads\orçamento"
   ```

3. **Inicie o servidor:**
   ```powershell
   npm start
   ```

4. **Aguarde aparecer:**
   ```
   🚀 Servidor rodando em http://localhost:3000
   📸 Pronto para receber orçamentos com fotos!
   ```

5. **Abra o navegador:** http://localhost:3000

---

## PASSO 3: Preencher o Formulário

### Informações do Cliente
```
Nome: Carlos Silva
Telefone: (11) 98765-4321
E-mail: carlos.silva@email.com
Endereço: Rua das Flores, 123 - São Paulo, SP
```

### Dados do Serviço
```
Quantidade de Itens: 6 (1 sofá + 2 poltronas + 3 cadeiras)
Serviço: Limpeza Profunda
Observações: Cliente quer também impermeabilização
```

### Upload de Fotos
```
1. Clique na área "Clique ou arraste fotos aqui"
2. Selecione as 5 fotos dos estofados
3. Aguarde o preview aparecer
4. Veja as imagens miniaturizadas
5. Se errou, clique no ✕ para remover
```

---

## PASSO 4: Gerar Orçamento

1. **Clique em:** "✨ Gerar Orçamento"
2. **Aguarde o processamento:**
   - Spinner girando = IA analisando fotos
   - Pode levar 15-30 segundos
3. **Pronto!** Você verá:
   ```
   ✅ Orçamento gerado com sucesso!
   
   • Cliente: Carlos Silva
   • Valor Total: R$ 2.450,00
   📥 Baixar PDF do Orçamento
   ```

---

## PASSO 5: Visualizar o PDF

1. **Clique em:** "📥 Baixar PDF do Orçamento"
2. **O arquivo será salvo** em `Downloads` como:
   ```
   Orcamento-1694123456789.pdf
   ```

3. **Abra e verifique:**
   - Logo e cores da sua empresa ✓
   - Dados do cliente corretos ✓
   - Descrição de cada item ✓
   - Valores calculados corretamente ✓
   - Opções de pagamento (PIX 5% desc. / Cartão 4x) ✓

---

## PASSO 6: Enviar ao Cliente

### Opção 1: WhatsApp
1. Clique em WhatsApp (abra com cliente)
2. Escreva:
   ```
   Olá Carlos! 👋
   
   Seguindo a proposta de limpeza dos seus estofados:
   
   📋 Serviço: Limpeza Profunda
   📦 Itens: Sofá + 2 Poltronas + 3 Cadeiras
   💰 Valor Total: R$ 2.450,00
   
   Opções de Pagamento:
   • PIX: R$ 2.327,50 (5% desc)
   • Cartão: 4x R$ 612,50
   
   Orçamento válido por 30 dias.
   
   Quer agendar? 😊
   ```
3. Anexe o PDF

### Opção 2: Email
1. Coloque no assunto:
   ```
   Orçamento de Limpeza de Estofados - Carlos Silva
   ```

2. No corpo:
   ```
   Prezado Carlos,
   
   Segue em anexo o orçamento solicitado para limpeza 
   de seus estofados.
   
   Valor Total: R$ 2.450,00
   Validade: 30 dias
   
   Dúvidas? Entre em contato!
   
   Atenciosamente,
   Sua Empresa
   ```

3. Anexe o PDF

---

## 📊 EXEMPLO DE PDF GERADO

O PDF conterá:

```
═══════════════════════════════════════════════════════
                ORÇAMENTO DE LIMPEZA
     Higienização & Impermeabilização de Estofados
═══════════════════════════════════════════════════════

CLIENTE
Nome: Carlos Silva
Endereço: Rua das Flores, 123 - São Paulo, SP

DESCRIÇÃO DO SERVIÇO          QTD    UNIT.      TOTAL
───────────────────────────────────────────────────
Sofá Grande                    1    R$300      R$300
Condição: Bom | Tamanho: Grande
Materiais: Tecido

Poltrona Estofada             1    R$150      R$150
Condição: Regular | Tamanho: Médio
Materiais: Veludo

Cadeira Estofada              1    R$100      R$100
Condição: Bom | Tamanho: Pequeno
Materiais: Tecido Misto

═══════════════════════════════════════════════════════

RESUMO FINANCEIRO
Mão de Obra:                          R$ 1.200,00
Materiais:                            R$   600,00
                                    ─────────────
INVESTIMENTO TOTAL                    R$ 2.100,00

FORMAS DE PAGAMENTO
┌─────────────────────┬─────────────────────┐
│ PIX                 │ CARTÃO              │
│ R$ 1.995,00         │ R$ 525,00/parcela   │
│ 5% de desconto      │ Em até 4x sem juros │
│ à vista             │                     │
└─────────────────────┴─────────────────────┘

NOSSOS DIFERENCIAIS
• Análise Profissional com IA
• Orçamento Customizado
• Transparência Total
• Garantia de Satisfação

───────────────────────────────────────────────────
Obrigado pela confiança em nossos serviços!
```

---

## 💡 DICAS IMPORTANTES

### Para Melhor Análise da IA
✅ Fotos bem iluminadas
✅ Foco nos estofados
✅ Zoom em manchas/pontos críticos
✅ Múltiplos ângulos do mesmo item
❌ Fotos escuras
❌ Fotos desfocadas
❌ Muitas fotos do mesmo ângulo

### Valores Calculados
```
Mão de Obra = Tempo Estimado × R$120/hora
Materiais = Conforme estimado para cada item
Valor Total = Mão de Obra + Materiais + 25% lucro
```

### Se o Cliente Negociar
1. Abra novamente no navegador: http://localhost:3000
2. Preencha novamente (não precisa de fotos)
3. Gere novo orçamento com valores ajustados
4. Crie um novo PDF com nome diferente
5. Envie versão 2 ao cliente

---

## 🔄 WORKFLOW TÍPICO DO DIA

```
08:00 - Cliente liga
08:15 - Você marca visita/agendamento
10:00 - Você fotografa os estofados
10:30 - Volta ao escritório
10:35 - Abre o sistema (npm start)
10:40 - Preenche dados no formulário
10:41 - Envia fotos
10:42 - Gera PDF
10:50 - Envia orçamento via WhatsApp
11:00 - Cliente recebe
12:00 - Cliente liga confirmando serviço!
```

---

## ⚙️ AJUSTANDO VALORES NO PDF

Se o cliente pediu mudança:

**Opção 1: Ajuste Rápido (Sem Regenerar)**
1. Abra o PDF em editor (Word, Google Docs)
2. Mude os valores manualmente
3. Salve e envie

**Opção 2: Regenerar com Novos Valores**
1. Volte ao navegador
2. Mude a quantidade ou serviço
3. Gere novamente
4. Substitua o PDF anterior

---

## 📞 COMUNICAÇÃO COM CLIENTE

### Mensagem WhatsApp Profissional
```
Olá [CLIENTE]! 👋

Encerramos a análise de seus estofados ✨

📋 RESUMO:
• Serviço: [TIPO]
• Quantidade: [N] itens
• Valor: R$ [TOTAL]

💰 FORMAS DE PAGAMENTO:
📱 PIX: R$ [VALOR_PIX] (5% desconto)
💳 Cartão: [PARCELAS]x R$ [VALOR]

✅ Orçamento válido por 30 dias

Segue em anexo o PDF completo.

Quer agendar? 😊
```

### Email Profissional
```
Prezado(a) [CLIENTE],

Segue em anexo o orçamento solicitado.

Serviço: [TIPO DE LIMPEZA]
Valor Total: R$ [VALOR]
Validade: 30 dias

Diferenciais:
✓ Análise Profissional
✓ Produtos Premium
✓ Garantia de Satisfação
✓ Agendamento Flexível

Dúvidas? Estamos à disposição!

Atenciosamente,
[NOME DA EMPRESA]
[TELEFONE]
[EMAIL]
[ENDEREÇO]
```

---

## 🎓 CONCLUSÃO

Com este sistema você:
- ⏱️ Economiza 30 minutos por orçamento
- 📊 Faz orçamentos mais profissionais
- 🎯 Aumenta fechamento de vendas
- 🤖 Usa IA para análise precisa
- 📱 Pode usar no celular

Bom trabalho! 🚀
