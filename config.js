import { modelo } from './utils/proposta.js';
// A configuração usada no app e no servidor tem origem em public/model.js.
export const config = {
  empresa: modelo.company(),
  servicos: modelo.services,
  condicoes: modelo.terms(),
  cores: { primaria: '#044c3a', fundo: '#04241b', acento: '#a7cf21', papel: '#f7faf6', texto: '#10231c' }
};
