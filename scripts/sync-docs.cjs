const fs=require('node:fs');
const readme=fs.readFileSync('templates/README.md','utf8');
fs.writeFileSync('README.md',readme);fs.writeFileSync('LEIA-ME.md',readme);
fs.writeFileSync('config.js',`import { modelo } from './utils/proposta.js';
// A configuração usada no app e no servidor tem origem em public/model.js.
export const config = {
  empresa: modelo.company(),
  servicos: modelo.services,
  condicoes: modelo.terms(),
  cores: { primaria: '#044c3a', fundo: '#04241b', acento: '#a7cf21', papel: '#f7faf6', texto: '#10231c' }
};
`);
