import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Jimp, loadFont } from 'jimp';
import { SANS_64_BLACK } from 'jimp/fonts';
import { normalizarEmpresa } from './utils/empresa.js';
import { gerarPDFOrcamento } from './utils/pdfGenerator.js';

fs.mkdirSync('validacao', { recursive: true });
const font = await loadFont(SANS_64_BLACK);
const logo = new Jimp({ width: 440, height: 230, color: 0xe9f1eaff });
logo.print({ font, x: 125, y: 70, text: 'LOGO' });
await logo.write('validacao/logo-exemplo.png');
const empresa = {
  nome: 'Empresa de exemplo',
  especialidade: 'Higienização de estofados e carpetes',
  endereco: 'Endereço da empresa • Cidade',
  contato: 'Contato da empresa',
  apresentacao: 'A Empresa de exemplo atua na higienização de estofados e carpetes, com foco no cuidado dos tecidos e na conservação dos ambientes. Nossa proposta apresenta os serviços e as condições de atendimento para que você tenha clareza sobre cada etapa da contratação.',
  logo: await logo.getBase64('image/png')
};
assert.deepEqual(normalizarEmpresa(JSON.stringify(empresa)), empresa);
assert.throws(() => normalizarEmpresa('{invalido'));
assert.throws(() => normalizarEmpresa({ logo: 'https://example.com/logo.png' }));
assert.throws(() => normalizarEmpresa({ logo: 'data:image/svg+xml;base64,AAAA' }));
const analise = { tipo_item: 'Cadeira estofada', condicao: 'Boa', tamanho: 'Médio', materiais: 'Tecido', descricao_detalhada: 'Higienização de assento e encosto.' };
const dados = { empresa, cliente: 'Cliente de exemplo', endereco: 'Endereço do atendimento', custoMaterial: 150, valorMaoDeObra: 400, valorTotal: 650, analises: [analise, analise, analise] };
for (const [nome, alteracoes] of [
  ['proposta-com-marca', {}],
  ['proposta-sem-logo', { empresa: { ...empresa, logo: '' } }],
  ['proposta-extensa', { empresa: { ...empresa, apresentacao: empresa.apresentacao.repeat(4).slice(0, 1200) }, analises: Array.from({ length: 20 }, () => analise) }]
]) {
  const generated = await gerarPDFOrcamento({ ...dados, ...alteracoes });
  const destination = `validacao/${nome}.pdf`;
  fs.copyFileSync(generated, destination);
  assert.equal(fs.readFileSync(destination).subarray(0, 5).toString(), '%PDF-');
}
console.log('OK: identidade validada e PDFs gerados com logo, sem logo e com múltiplas páginas.');
