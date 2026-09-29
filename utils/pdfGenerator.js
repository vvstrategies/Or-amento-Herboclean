import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizarEmpresa } from './empresa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cores do tema (Similar Oficial Clean)
const CORES = {
  primaria: '#2d5a3d',      // Verde escuro
  secundaria: '#d4af37',    // Dourado
  texto: '#333333',
  textoclaro: '#666666',
  fundo: '#f8f8f8'
};

export async function gerarPDFOrcamento(dados) {
  return new Promise((resolve, reject) => {
    try {
      const orcamentoDir = path.join(__dirname, '..', 'public', 'orcamentos');
      
      if (!fs.existsSync(orcamentoDir)) {
        fs.mkdirSync(orcamentoDir, { recursive: true });
      }

      const nomeOrcamento = `Orcamento-${Date.now()}.pdf`;
      const caminhoCompleto = path.join(orcamentoDir, nomeOrcamento);

      const empresa = normalizarEmpresa(dados.empresa);
      const doc = new PDFDocument({ margin: 0, size: 'A4', info: { Title: `Proposta - ${dados.cliente || ''}`, Author: empresa.nome } });
      const logoBuffer = empresa.logo ? Buffer.from(empresa.logo.split(',')[1], 'base64') : null;
      if (logoBuffer) doc.openImage(logoBuffer);
      const stream = fs.createWriteStream(caminhoCompleto);
      stream.on('error', reject);
      doc.on('error', reject);

      doc.pipe(stream);

      const cabecalho = () => {
        doc.rect(0, 0, 595, 34).fill(CORES.primaria);
        doc.rect(8, 0, 579, 5).fill(CORES.secundaria);
        doc.font('Helvetica').fontSize(7).fillColor('white');
        doc.text(empresa.nome.toUpperCase(), 32, 14, { width: 265, height: 13, ellipsis: true });
        doc.text(empresa.endereco, 307, 14, { width: 256, align: 'right', height: 13, ellipsis: true });
      };
      const rodape = () => {
        doc.strokeColor(CORES.secundaria).lineWidth(0.7).moveTo(40, 793).lineTo(555, 793).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(CORES.primaria)
          .text([empresa.nome, empresa.contato].filter(Boolean).join(' • '), 40, 805, { width: 515, align: 'center', height: 22, ellipsis: true });
      };
      cabecalho();
      let yPos = 54;
      if (empresa.logo) {
        doc.image(logoBuffer, 197.5, yPos, { fit: [200, 125], align: 'center', valign: 'center' });
        yPos += 137;
      }
      doc.font('Times-Bold').fontSize(27).fillColor(CORES.primaria)
        .text(empresa.nome.toUpperCase(), 40, yPos, { width: 515, align: 'center' });
      yPos = doc.y + 5;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(CORES.texto)
        .text(empresa.especialidade.toUpperCase(), 40, yPos, { width: 515, align: 'center' });
      yPos = doc.y + 9;
      doc.font('Times-Italic').fontSize(11).fillColor(CORES.secundaria)
        .text('Proposta Técnica de Higienização de Estofados e Carpetes', 40, yPos, { width: 515, align: 'center' });
      yPos = doc.y + 5;
      doc.font('Times-Bold').fontSize(18).fillColor(CORES.primaria)
        .text(dados.cliente || 'Cliente', 40, yPos, { width: 515, align: 'center' });
      yPos = doc.y + 6;
      doc.font('Helvetica').fontSize(9).fillColor(CORES.textoclaro)
        .text(dados.endereco || '', 40, yPos, { width: 515, align: 'center' });
      yPos = doc.y + 5;
      doc.fontSize(8).text(`Emissão: ${new Date().toLocaleDateString('pt-BR')} • Validade: 30 dias`, 40, yPos, { width: 515, align: 'center' });
      yPos = doc.y + 22;
      if (empresa.apresentacao) {
        doc.font('Times-Roman').fontSize(11).fillColor(CORES.texto)
          .text(empresa.apresentacao, 40, yPos, { width: 515, lineGap: 3 });
        yPos = doc.y + 22;
      }

      // ===== TABELA DE SERVIÇOS =====
      const tabelaCabecalho = () => {
      doc.rect(40, yPos, 515, 22).fill(CORES.primaria);
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold').text('ESCOPO DE HIGIENIZAÇÃO', 48, yPos + 6, { width: 499 });
      yPos += 22;
      doc.rect(40, yPos, 515, 25).fillAndStroke(CORES.primaria, CORES.primaria);
      
      // Cabeçalhos da tabela
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('DESCRIÇÃO DO SERVIÇO', 50, yPos + 7, { width: 300 });
      doc.text('QTD', 365, yPos + 7, { width: 50, align: 'center' });
      doc.text('UNIT.', 425, yPos + 7, { width: 55, align: 'right' });
      doc.text('TOTAL', 490, yPos + 7, { width: 55, align: 'right' });
      
      yPos += 30;
      };
      if (yPos > 650) { rodape(); doc.addPage(); cabecalho(); yPos = 55; }
      tabelaCabecalho();

      // Linhas da tabela
      if (dados.analises && dados.analises.length > 0) {
        dados.analises.forEach((analise, index) => {
          doc.font('Helvetica-Bold').fontSize(9);
          const alturaNome = doc.heightOfString(String(analise.tipo_item || ''), { width: 280 });
          doc.font('Helvetica').fontSize(8);
          const detalhe = [`Condição: ${analise.condicao} | Tamanho: ${analise.tamanho}`, `Materiais: ${analise.materiais}`, analise.descricao_detalhada || ''].join('\n');
          const alturaDetalhe = doc.heightOfString(detalhe, { width: 280, lineGap: 2 });
          const alturaLinha = Math.max(60, alturaNome + alturaDetalhe + 18);
          if (yPos + alturaLinha > 765) { rodape(); doc.addPage(); cabecalho(); yPos = 55; tabelaCabecalho(); }
          
          // Fundo alternado
          if (index % 2 === 0) {
            doc.rect(40, yPos, 515, alturaLinha).fill(CORES.fundo);
          }
          
          doc.strokeColor(CORES.primaria).lineWidth(0.5);
          doc.rect(40, yPos, 515, alturaLinha).stroke();
          
          // Conteúdo
          doc.fillColor(CORES.texto).fontSize(9).font('Helvetica-Bold');
          doc.text(analise.tipo_item, 50, yPos + 5, { width: 280 });
          
          doc.fontSize(8).font('Helvetica').fillColor(CORES.textoclaro);
          doc.text(detalhe, 50, yPos + alturaNome + 10, { width: 280, lineGap: 2 });
          
          // Valores
          doc.fillColor(CORES.texto).fontSize(9).font('Helvetica');
          doc.text('1', 365, yPos + 20, { width: 50, align: 'center' });
          doc.text(`R$ ${(parseFloat(dados.custoMaterial) / dados.analises.length).toFixed(2)}`, 425, yPos + 20, { width: 55, align: 'right' });
          
          const totalItem = (parseFloat(dados.custoMaterial) / dados.analises.length);
          doc.fillColor(CORES.primaria).font('Helvetica-Bold');
          doc.text(`R$ ${totalItem.toFixed(2)}`, 490, yPos + 20, { width: 55, align: 'right' });
          
          yPos += alturaLinha;
        });
      }

      // Linha final da tabela
      doc.strokeColor(CORES.primaria).lineWidth(2);
      doc.moveTo(40, yPos).lineTo(555, yPos).stroke();
      yPos += 5;
      rodape();
      doc.addPage();
      cabecalho();
      yPos = 65;

      // ===== RESUMO FINANCEIRO =====
      const colDescricao = 350;
      const colValor = 500;

      doc.fontSize(9).font('Helvetica').fillColor(CORES.textoclaro);
      doc.text('Mão de Obra:', colDescricao - 250, yPos, { width: 200 });
      doc.fillColor(CORES.texto).fontSize(10).font('Helvetica');
      doc.text(`R$ ${parseFloat(dados.valorMaoDeObra).toFixed(2)}`, colValor, yPos - 10, { width: 50, align: 'right' });

      yPos += 20;
      doc.fontSize(9).font('Helvetica').fillColor(CORES.textoclaro);
      doc.text('Materiais:', colDescricao - 250, yPos, { width: 200 });
      doc.fillColor(CORES.texto).fontSize(10).font('Helvetica');
      doc.text(`R$ ${parseFloat(dados.custoMaterial).toFixed(2)}`, colValor, yPos - 10, { width: 50, align: 'right' });

      yPos += 25;
      doc.strokeColor(CORES.secundaria).lineWidth(1.5);
      doc.moveTo(40, yPos).lineTo(555, yPos).stroke();
      yPos += 15;

      // Total em destaque
      doc.rect(40, yPos, 515, 40).fillAndStroke(CORES.primaria, CORES.secundaria);
      doc.fillColor('white').fontSize(18).font('Helvetica-Bold');
      doc.text('INVESTIMENTO TOTAL', 50, yPos + 5, { width: 400 });
      doc.fontSize(22).font('Helvetica-Bold');
      doc.text(`R$ ${parseFloat(dados.valorTotal).toFixed(2)}`, 420, yPos + 5, { width: 125, align: 'right' });

      yPos += 60;

      // ===== OPÇÕES DE PAGAMENTO =====
      doc.fontSize(12).font('Helvetica-Bold').fillColor(CORES.primaria);
      doc.text('FORMAS DE PAGAMENTO', 40, yPos);
      yPos += 25;

      const desconto = parseFloat(dados.valorTotal) * 0.05;
      const valorPix = parseFloat(dados.valorTotal) - desconto;
      
      // PIX
      doc.rect(40, yPos, 235, 60).fillAndStroke(CORES.fundo, CORES.secundaria);
      doc.lineWidth(2);
      doc.fillColor(CORES.primaria).fontSize(11).font('Helvetica-Bold');
      doc.text('PIX', 50, yPos + 8);
      doc.fillColor(CORES.secundaria).fontSize(14).font('Helvetica-Bold');
      doc.text(`R$ ${valorPix.toFixed(2)}`, 50, yPos + 22);
      doc.fillColor(CORES.textoclaro).fontSize(9).font('Helvetica');
      doc.text('5% de desconto à vista', 50, yPos + 38);

      // Cartão
      doc.rect(320, yPos, 235, 60).fillAndStroke(CORES.fundo, CORES.secundaria);
      doc.lineWidth(2);
      doc.fillColor(CORES.primaria).fontSize(11).font('Helvetica-Bold');
      doc.text('CARTÃO', 330, yPos + 8);
      doc.fillColor(CORES.secundaria).fontSize(12).font('Helvetica-Bold');
      const parcelado = (parseFloat(dados.valorTotal) / 4).toFixed(2);
      doc.text(`R$ ${parcelado} /parcela`, 330, yPos + 22);
      doc.fillColor(CORES.textoclaro).fontSize(8).font('Helvetica');
      doc.text('Em até 4x sem juros', 330, yPos + 38);

      yPos += 80;

      // ===== DIFERENCIAIS =====
      doc.fontSize(12).font('Helvetica-Bold').fillColor(CORES.primaria);
      doc.text('NOSSOS DIFERENCIAIS', 40, yPos);
      yPos += 20;

      const diferenciais = [
        'Análise Profissional com IA - Identificação precisa de cada tipo de estofado',
        'Orçamento Customizado - Detalhamento completo de cada item',
        'Transparência Total - Valores especificados e sem surpresas',
        'Garantia de Satisfação - Serviço de qualidade garantida'
      ];

      doc.fontSize(9).font('Helvetica').fillColor(CORES.texto);
      diferenciais.forEach(item => {
        doc.text(`• ${item}`, 50, yPos, { width: 495 });
        yPos += 16;
      });

      yPos += 10;

      rodape();

      doc.end();

      stream.on('finish', () => {
        console.log(`✅ PDF gerado: ${nomeOrcamento}`);
        resolve(caminhoCompleto);
      });

      stream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
}
