const texto = (valor, limite) => typeof valor === 'string' ? valor.trim().slice(0, limite) : '';

export function normalizarEmpresa(entrada = {}) {
  if (typeof entrada === 'string') {
    try { entrada = JSON.parse(entrada); } catch { throw new Error('Dados da empresa inválidos.'); }
  }
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw new Error('Dados da empresa inválidos.');
  const logo = texto(entrada.logo, 4000001);
  if (logo && (logo.length > 4000000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo))) {
    throw new Error('Envie o logotipo em PNG ou JPG.');
  }
  return {
    nome: texto(entrada.nome, 120) || 'Sua empresa',
    especialidade: texto(entrada.especialidade, 180) || 'Higienização de estofados e carpetes',
    apresentacao: texto(entrada.apresentacao, 1200),
    endereco: texto(entrada.endereco, 240),
    contato: texto(entrada.contato, 240),
    logo
  };
}
