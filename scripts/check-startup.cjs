const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const launcher = path.resolve(__dirname, 'start-local.cjs');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));

(async () => {
  const occupied = http.createServer((req, res) => { res.writeHead(404); res.end('Outro aplicativo'); });
  await listen(occupied);
  const port = occupied.address().port, origin = 'http://localhost:' + port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecoclean-startup-'));
  const options = { cwd: os.tmpdir(), windowsHide: true, timeout: 25000, env: { ...process.env, NODE_ENV: 'development', PORT: String(port), APP_ORIGIN: origin, DATA_DIR: dir } };
  try {
    await assert.rejects(run(process.execPath, [launcher, '--no-open'], options), error => error.stderr.includes('ocupada por outro servico'));
    assert.equal((await fetch(origin)).status, 404, 'O processo de outro aplicativo deve continuar intacto.');
  } finally { await close(occupied); }
  let pid;
  try {
    const first = await run(process.execPath, [launcher, '--no-open'], options);
    pid = Number(first.stdout.match(/PID: (\d+)/)?.[1]);
    assert.ok(pid, 'O primeiro inicio deve criar um servidor.');
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes('Herboclean | Orçamentos e agendamentos'));
    const second = await run(process.execPath, [launcher, '--no-open'], options);
    assert.ok(second.stdout.includes('ja estava em funcionamento'));
    assert.ok(!second.stdout.includes('PID:'), 'O segundo inicio deve reutilizar o servidor.');
    process.kill(pid, 0);
    assert.equal((await fetch(origin + '/api/session')).status, 200);
    console.log('PASS: porta ocupada preservada, inicio fora da pasta, servidor vivo apos o iniciador terminar e abertura repetida sem duplicacao.');
  } finally { if (pid) process.kill(pid); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
