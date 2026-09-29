/**
 * EXEMPLO: Como usar o sistema de geração de orçamentos
 * 
 * Este arquivo demonstra como integrar o gerador de orçamentos
 * em outras aplicações ou workflows
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

// Função auxiliar para fazer requisição
async function gerarOrcamentoAPI(dadosCliente, caminhosFotos) {
  try {
    // Preparar FormData
    const form = new FormData();
    form.append('cliente', dadosCliente.nome);
    form.append('endereco', dadosCliente.endereco);
    form.append('servico', dadosCliente.servico);
    form.append('quantidade', dadosCliente.quantidade);

    // Adicionar fotos
    for (const caminho of caminhosFotos) {
      const stream = fs.createReadStream(caminho);
      form.append('fotos', stream);
    }

    // Fazer requisição
    const response = await fetch('http://localhost:3000/api/gerar-orcamento', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const resultado = await response.json();
    return resultado;

  } catch (erro) {
    console.error('Erro:', erro);
    throw erro;
  }
}

// EXEMPLO DE USO:
// ================

const dadosCliente = {
  nome: 'João Silva',
  endereco: 'Rua das Flores, 123 - São Paulo, SP',
  servico: 'Limpeza Profunda',
  quantidade: 3
};

const fotos = [
  'C:/Users/seu_usuario/Desktop/foto1.jpg',
  'C:/Users/seu_usuario/Desktop/foto2.jpg'
];

// gerarOrcamentoAPI(dadosCliente, fotos)
//   .then(resultado => {
//     console.log('✅ Orçamento gerado!');
//     console.log('📄 URL:', resultado.caminhoOrcamento);
//     console.log('💰 Valor Total:', resultado.dados.valorTotal);
//   })
//   .catch(erro => {
//     console.error('❌ Erro:', erro.message);
//   });

export { gerarOrcamentoAPI };
