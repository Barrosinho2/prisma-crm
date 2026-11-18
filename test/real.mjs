// Teste de ponta a ponta contra o Supabase de verdade (projeto prisma-crm), com o site servido localmente.
// Uso: CODIGO_RAFAEL=XXXX-XXXX-XXXX CODIGO_PEDRO=XXXX-XXXX-XXXX node test/real.mjs
// Cria duas contas de teste (@example.com) ligadas aos sócios; depois é preciso desfazer pelo SQL.
import { chromium } from 'playwright';
import { servir } from './servidor.mjs';

const ROOT = '/home/claude/prisma-crm';
const SB = 'https://plnnmlooqbzwwcfsqmxg.supabase.co';
const KEY = JSON.parse((await import('node:fs')).readFileSync(`${ROOT}/src/vercel/config.json`, 'utf8')).key;
const { CODIGO_RAFAEL, CODIGO_PEDRO } = process.env;
if (!CODIGO_RAFAEL || !CODIGO_PEDRO) { console.error('faltam os códigos'); process.exit(2); }
const sufixo = Date.now().toString(36);
const EMAIL_A = `rafael.teste.${sufixo}@example.com`;
const EMAIL_B = `pedro.teste.${sufixo}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await servir();
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', ...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : [])],
});
let fails = 0;
let passes = 0;
const erros = [];
function ok(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); } else { fails++; console.log('  ✗ ' + msg); }
}
async function abrir() {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[0-3]/.test(m.text())) erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  await page.goto(server.url + '/');
  await page.waitForSelector('.auth-box h1', { timeout: 15000 });
  return { ctx, page };
}
const noApp = (page) => page.waitForFunction(() => !document.body.classList.contains('auth-on') && document.querySelector('#meChip b'), null, { timeout: 20000 }).then(() => true).catch(() => false);
const esperar = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* tenta de novo */ } await sleep(150); } return false; };
const olhar = (page, p) => page.evaluate((x) => window.__prismaRuntime.olhar(x), p);
async function primeiroAcesso(page, codigo, email, senha) {
  await page.click('[data-ir-codigo]');
  await page.fill('#c_codigo', codigo);
  await page.fill('#c_email', email);
  await page.fill('#c_senha', senha);
  await page.click('.auth-btn');
  return noApp(page);
}

console.log('\n1) Sem login, o banco não entrega nada');
{
  const r = await fetch(`${SB}/rest/v1/docs?select=col,id&limit=1`, { headers: { apikey: KEY } });
  const corpo = await r.text();
  ok(r.status === 401 || r.status === 403 || corpo === '[]', `anônimo não lê documentos (${r.status})`);
  const m = await fetch(`${SB}/rest/v1/membros?select=socio,email`, { headers: { apikey: KEY } });
  ok(m.status === 401 || m.status === 403 || (await m.text()) === '[]', `anônimo não lê os sócios (${m.status})`);
  const f = await fetch(`${SB}/functions/v1/acesso`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'primeiro-acesso', codigo: 'AAAA-BBBB-CCCC', email: 'x@example.com', senha: '12345678' }) });
  ok(f.status === 400 && (await f.json()).erro === 'codigo', 'código inventado é recusado pela função');
}

console.log('\n2) Primeiro acesso dos dois sócios');
const A = await abrir();
const B = await abrir();
ok(await primeiroAcesso(A.page, CODIGO_RAFAEL, EMAIL_A, 'teste-rafael-123'), 'Rafael cria a senha e entra');
ok(await primeiroAcesso(B.page, CODIGO_PEDRO, EMAIL_B, 'teste-pedro-123'), 'Pedro cria a senha e entra');
ok((await A.page.textContent('#meChip b')) === 'Rafael' && (await B.page.textContent('#meChip b')) === 'Pedro', 'cada um entra como ele mesmo');
ok(await esperar(async () => (await A.page.evaluate(() => window.__prismaRuntime.estado())).aoVivo), 'tempo real ligado no navegador do Rafael');
ok(await esperar(async () => (await B.page.evaluate(() => window.__prismaRuntime.estado())).aoVivo), 'tempo real ligado no navegador do Pedro');

console.log('\n3) Tempo real de verdade');
{
  const a = A.page;
  const b = B.page;
  await a.evaluate(() => (location.hash = 'funil'));
  await b.evaluate(() => (location.hash = 'funil'));
  await a.click('#newBtn');
  await a.click('#menuPop button:has-text("Lead")');
  await a.waitForSelector('.drawer [data-form]');
  const fid = await a.$eval('.drawer [data-form]', (e) => e.dataset.form);
  await a.fill(`#${fid}_empresa`, 'Teste Tempo Real');
  await a.fill(`#${fid}_contato`, 'Lívia');
  const t0 = Date.now();
  await a.click('.drawer [data-save]');
  ok(await esperar(async () => !!(await b.$('.lcard:has-text("Teste Tempo Real")'))), 'lead criado pelo Rafael aparece para o Pedro');
  console.log(`    (chegou em ${Date.now() - t0} ms)`);
  const id = await b.$eval('.lcard:has-text("Teste Tempo Real")', (e) => e.dataset.id);
  await b.click(`.lcard[data-id="${id}"]`);
  await b.waitForSelector('.drawer .step[data-stage="contato"]');
  await b.click('.drawer .step[data-stage="contato"]');
  ok(await esperar(async () => (await olhar(a, `leads/${id}`))?.etapa === 'contato'), 'Pedro muda a etapa e o Rafael vê');
  await b.keyboard.press('Escape');
  await a.evaluate((x) => window.__prismaRuntime.db.collection('leads').doc(x).delete(), id);
  ok(await esperar(async () => !(await b.$(`.lcard[data-id="${id}"]`))), 'apagado pelo Rafael, some para o Pedro');
}

console.log('\n4) Leitura com IA sem chave configurada');
{
  const r = await A.page.evaluate(async () => { try { const s = await window.claude.use('sample'); await s.json('teste'); return 'leu'; } catch (e) { return e.code; } });
  ok(r === 'sampling_disabled' || r === 'leu', `sem chave da Anthropic, o CRM cai para o preenchimento básico (${r})`);
}

console.log('\n5) Código novo pelo Ajustes e troca de senha');
{
  const a = A.page;
  const b = B.page;
  await a.evaluate(() => (location.hash = 'ajustes'));
  await a.waitForSelector('#aj_acesso [data-convite="pedro"]', { timeout: 10000 });
  ok(await esperar(async () => (await a.textContent('#aj_acesso')).includes(EMAIL_B)), 'Ajustes lista o e-mail do Pedro');
  await a.click('#aj_acesso [data-convite="pedro"]');
  await a.waitForSelector('.modal .codigo-grande', { timeout: 10000 });
  const novo = (await a.textContent('.modal .codigo-grande')).trim();
  ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(novo), 'a função gera o código');
  await a.click('.modal-f button:has-text("Fechar")');
  await b.evaluate(() => window.PrismaHost.sair()).catch(() => {});
  await b.waitForSelector('#a_senha', { timeout: 15000 });
  ok(await primeiroAcesso(b, novo, EMAIL_B, 'teste-pedro-456'), 'Pedro troca a senha com o código novo');
  await b.evaluate(() => window.PrismaHost.sair()).catch(() => {});
  await b.waitForSelector('#a_senha', { timeout: 15000 });
  await b.fill('#a_email', EMAIL_B);
  await b.fill('#a_senha', 'teste-pedro-123');
  await b.click('.auth-btn');
  await b.waitForSelector('[data-erro]:not([hidden])', { timeout: 10000 });
  ok((await b.textContent('[data-erro]')) === 'E-mail ou senha incorretos.', 'a senha antiga não entra mais');
  await b.fill('#a_senha', 'teste-pedro-456');
  await b.click('.auth-btn');
  ok(await noApp(b), 'a senha nova entra');
}

await browser.close();
await server.fechar();
console.log(`\n${passes} ok, ${fails} falhas`);
console.log(erros.length ? 'erros no console:\n  ' + erros.join('\n  ') : 'sem erros no console');
console.log(`contas de teste: ${EMAIL_A}, ${EMAIL_B}`);
process.exit(fails ? 1 : 0);
