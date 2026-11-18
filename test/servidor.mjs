// Servidor local para a pasta public/, com os mesmos cabeçalhos do vercel.json (inclusive a CSP).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/claude/prisma-crm';
const conf = JSON.parse(fs.readFileSync(`${ROOT}/vercel.json`, 'utf8'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function cabecalhos(url) {
  const h = {};
  for (const r of conf.headers || []) {
    const re = new RegExp('^' + r.source.replace(/\(\.\*\)/g, '.*') + '$');
    if (re.test(url)) for (const x of r.headers) h[x.key] = x.value;
  }
  return h;
}

export function servir(porta = 0) {
  const pub = path.join(ROOT, 'public');
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let arq = path.join(pub, url === '/' ? 'index.html' : url);
    if (!arq.startsWith(pub)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(arq) && fs.existsSync(arq + '.html')) arq += '.html';
    if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404, cabecalhos(url)); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', ...cabecalhos(url) });
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise((resolve) => {
    srv.listen(porta, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, fechar: () => new Promise((r) => srv.close(r)) }));
  });
}
