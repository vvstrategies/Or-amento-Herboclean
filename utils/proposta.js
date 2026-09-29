import '../public/company-config.js';
import '../public/brand-assets.js';
import '../public/model.js';
export const modelo = globalThis.EcoModel;

export function prepararProposta(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) throw Error('Envie os serviços com quantidade e preço unitário.');
  modelo.validate(raw);
  if (raw.company.logo && !modelo.image(raw.company.logo)) throw Error('Logotipo inválido. Use PNG, JPG ou WebP.');
  for (const item of raw.items) {
    if (!Array.isArray(item.photos) || item.photos.length > 6 || item.photos.some(p => !modelo.image(p))) throw Error('Envie até 6 imagens PNG, JPG ou WebP por serviço.');
  }
  const q = modelo.normalize(raw);
  modelo.validate(q);
  return q;
}
