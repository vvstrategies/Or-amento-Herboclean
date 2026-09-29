(() => {
  const fields = ['nome', 'especialidade', 'endereco', 'contato', 'apresentacao'];
  const input = field => document.getElementById('empresa-' + field);
  const status = document.getElementById('empresa-status');
  const preview = document.getElementById('empresa-logo-preview');
  const logoInput = document.getElementById('empresa-logo');
  let logo = '', loadingLogo = false;

  window.lerEmpresa = () => {
    if (loadingLogo) throw new Error('Aguarde o carregamento do logotipo.');
    return { ...Object.fromEntries(fields.map(field => [field, input(field).value.trim()])), logo };
  };
  const showLogo = () => {
    preview.hidden = !logo;
    if (logo) preview.src = logo;
    else preview.removeAttribute('src');
  };
  const save = () => {
    try {
      localStorage.setItem('orcamento-empresa-v1', JSON.stringify(window.lerEmpresa()));
      status.textContent = 'Identidade da empresa salva neste navegador.';
    } catch { status.textContent = 'Identidade aplicada a esta proposta. Não foi possível salvar no navegador.'; }
  };
  try {
    const saved = JSON.parse(localStorage.getItem('orcamento-empresa-v1') || 'null');
    if (saved) {
      for (const field of fields) if (typeof saved[field] === 'string') input(field).value = saved[field];
      if (typeof saved.logo === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(saved.logo)) logo = saved.logo;
      showLogo();
    }
  } catch { status.textContent = 'Preencha a identidade da empresa para esta proposta.'; }
  for (const field of fields) input(field).addEventListener('input', save);
  document.getElementById('empresa-sugerir').onclick = () => {
    const nome = input('nome').value.trim() || 'Nossa empresa';
    input('apresentacao').value = `${nome} apresenta os serviços e as condições desta proposta.`;
    save();
  };
  logoInput.onchange = async () => {
    const file = logoInput.files[0];
    if (!file) return;
    loadingLogo = true;
    let url;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Escolha uma logo PNG, JPG ou WebP de até 10 MB.');
      url = URL.createObjectURL(file);
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      logo = canvas.toDataURL('image/png');
      loadingLogo = false; showLogo(); save();
    } catch (error) { status.textContent = error.message; }
    finally { loadingLogo = false; if (url) URL.revokeObjectURL(url); logoInput.value = ''; }
  };
  document.getElementById('empresa-remover-logo').onclick = () => { logo = ''; showLogo(); save(); };
  // A identidade da empresa permanece ao limpar os dados de uma proposta.
  document.getElementById('formularioOrcamento').addEventListener('reset', () => {
    const values = fields.map(field => input(field).value);
    setTimeout(() => fields.forEach((field, i) => { input(field).value = values[i]; }), 0);
  });
})();
