const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Instale Node.js 24 ou superior para abrir o Herboclean.');
  require('dotenv').config({ path: path.join(root, '.env') });
  const port = Number(process.env.PORT || 3000);
  const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
  const url = new URL(origin);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT invalida no .env.');
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || Number(url.port || 80) !== port || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw Error('Para o iniciador local, APP_ORIGIN deve ser http://localhost:PORT. Para hospedagem externa, use npm start.');
  }
  const address = url.origin;
  async function ready() {
    let health;
    try { health = await fetch(address + '/api/health', { signal: AbortSignal.timeout(2000), redirect: 'manual' }); }
    catch (error) {
      if (error.cause?.code === 'ECONNREFUSED' || error.cause?.errors?.every(e => e.code === 'ECONNREFUSED')) return false;
      throw Error('A porta nao respondeu a tempo. Verifique se outro programa esta usando a porta ' + port + '.');
    }
    const data = await health.json().catch(() => null);
    if (!health.ok || data?.status !== 'ok' || data?.product !== 'herboclean') throw Error('A porta ' + port + ' esta ocupada por outro servico. Ele foi preservado; encerre-o ou ajuste PORT e APP_ORIGIN no .env.');
    const page = await fetch(address + '/', { signal: AbortSignal.timeout(3000), redirect: 'manual' });
    if (!page.ok || !(await page.text()).includes('Herboclean | Orçamentos e agendamentos')) throw Error('A porta responde, mas nao entrega a pagina do Herboclean. Verifique public/index.html e o processo nessa porta.');
    return true;
  }

  if (await ready()) console.log('Herboclean ja estava em funcionamento.');
  else {
    if (!fs.existsSync(path.join(root, 'public/index.html'))) throw Error('A pagina public/index.html nao foi encontrada. Execute node scripts/sync-ui.cjs.');
    const dir = path.resolve(root, process.env.DATA_DIR || 'data');
    fs.mkdirSync(dir, { recursive: true });
    const output = path.join(dir, 'server-output.log'), errors = path.join(dir, 'server-error.log');
    const out = fs.openSync(output, 'a'), err = fs.openSync(errors, 'a');
    let child;
    try {
      fs.writeSync(out, `\nInicio local: ${new Date().toISOString()}\n`);
      child = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env: process.env, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
    } finally { fs.closeSync(out); fs.closeSync(err); }
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.unref();
    let running = false;
    for (let i = 0; i < 40; i++) {
      await pause(250);
      if (spawnError) throw Error('Nao foi possivel iniciar o Node. Verifique a instalacao.');
      if (await ready()) { running = true; break; }
      if (child.exitCode !== null) break;
    }
    if (!running) throw Error('O servidor nao iniciou. Consulte ' + errors);
    console.log('Herboclean iniciado em segundo plano. PID: ' + child.pid);
  }
  console.log('Disponivel em ' + address);
  if (!process.argv.includes('--no-open')) {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', address], { detached: true, windowsHide: true, stdio: 'ignore' });
    browser.on('error', () => console.log('Abra o endereco acima no navegador.'));
    browser.unref();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
