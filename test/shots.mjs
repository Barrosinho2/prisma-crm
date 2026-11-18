// Abre o CRM com o banco simulado e tira capturas de cada tela.
import { chromium } from 'playwright';
import fs from 'node:fs';
const ROOT = '/home/claude/prisma-crm';
const seed = JSON.parse(fs.readFileSync(`${ROOT}/test/seed.json`, 'utf8'));
const args = process.argv.slice(2);
const scheme = args.includes('dark') ? 'dark' : 'light';
const mobile = args.includes('mobile');
const askMe = args.includes('askme');
const only = (args.find((a) => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
if (!askMe) seed.__prefs = { socio: 'rafael' };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  timezoneId: 'America/Sao_Paulo',
  locale: 'pt-BR',
  colorScheme: scheme,
});
await ctx.addInitScript({ content: `window.__MOCK_SEED__ = ${JSON.stringify(seed)};` });
await ctx.addInitScript({ path: `${ROOT}/test/mock.js` });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));

const tag = `${scheme}${mobile ? '-m' : ''}`;
async function shot(name, { full = true } = {}) {
  if (full) {
    // a rolagem acontece no <main>; aumenta a janela para caber tudo
    const h = await page.evaluate(() => Math.max(document.getElementById('main').scrollHeight, window.innerHeight));
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: Math.min(h, 4000) });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${ROOT}/shots/${name}-${tag}.png` });
    await page.setViewportSize(vp);
  } else {
    await page.screenshot({ path: `${ROOT}/shots/${name}-${tag}.png` });
  }
}
const want = (n) => !only.length || only.includes(n);

await page.goto(`file://${ROOT}/dist/index.html#painel`);
await page.waitForTimeout(2200);
if (askMe) { await shot('askme', { full: false }); }
if (want('painel')) await shot('painel');
for (const r of ['funil', 'clientes', 'projetos', 'financeiro', 'agenda', 'piloto', 'ajustes']) {
  if (!want(r)) continue;
  await page.evaluate((h) => (location.hash = h), r);
  await page.waitForTimeout(700);
  await shot(r);
}
if (want('drawer')) {
  await page.evaluate(() => (location.hash = 'funil'));
  await page.waitForTimeout(500);
  await page.click('.lcard[data-id="ld_demo_recanto"]');
  await page.waitForTimeout(600);
  await shot('lead', { full: false });
  await page.click('[data-win]');
  await page.waitForTimeout(600);
  await shot('venda', { full: false });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
if (want('fintabs')) {
  await page.evaluate(() => (location.hash = 'financeiro'));
  await page.waitForTimeout(400);
  for (const t of ['aberto', 'recorrencias', 'projecao']) {
    await page.click(`[role=tab][data-t="${t}"]`);
    await page.waitForTimeout(700);
    await shot('fin-' + t);
  }
}
console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'sem erros no console');
await browser.close();
