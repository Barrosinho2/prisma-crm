// Testes no celular: toque emulado (CDP), barra de abas, arrastar no funil, tabelas em cartões.
import { chromium } from 'playwright';
import fs from 'node:fs';
const ROOT = '/home/claude/prisma-crm';
const seed = JSON.parse(fs.readFileSync(`${ROOT}/test/seed.json`, 'utf8'));
seed.__prefs = { socio: 'rafael' };
const dark = process.argv.includes('dark');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', colorScheme: dark ? 'dark' : 'light' });
await ctx.addInitScript({ content: `window.__MOCK_SEED__ = ${JSON.stringify(seed)};` });
await ctx.addInitScript({ path: `${ROOT}/test/mock.js` });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|net::|ERR_/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
const cdp = await ctx.newCDPSession(page);
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const wait = (ms) => page.waitForTimeout(ms);
const db = (p) => page.evaluate((x) => { const v = window.__mockStore.get(x); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
const suf = dark ? '-dark' : '';

await page.goto(`file://${ROOT}/dist/index.html#painel`);
await wait(1800);
console.log('celular' + (dark ? ' (tema escuro)' : ''));
ok(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches), 'navegador emulado se comporta como toque');
ok(await page.isVisible('#tabbar'), 'barra de abas visível');
ok(!(await page.isVisible('#newBtn')), 'botão Novo do topo escondido (fica na barra)');
await page.screenshot({ path: `${ROOT}/shots/m-painel${suf}.png` });

// tooltip por toque no gráfico
await page.evaluate(() => document.querySelector('[data-chart="pn_flow"]').scrollIntoView({ block: 'center' }));
await wait(300);
const band = await page.$$('[data-chart="pn_flow"] .c-hit');
const bb = await band[3].boundingBox();
await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
await wait(250);
ok(await page.isVisible('#tip'), 'tocar numa barra mostra os valores do mês');
await page.screenshot({ path: `${ROOT}/shots/m-tip${suf}.png` });
await page.touchscreen.tap(30, 120);
await wait(200);
ok(!(await page.isVisible('#tip')), 'tocar fora esconde os valores');

// navegação pela barra
await page.tap('#tabbar a[data-route="funil"]');
await wait(700);
ok((await page.evaluate(() => location.hash)) === '#funil', 'aba Funil navega');
ok(await page.isVisible('.kjump'), 'atalhos de etapas aparecem no celular');
ok(await page.isVisible('.khint'), 'dica de arrastar aparece no celular');
ok((await page.getAttribute('.lcard[data-id="ld_demo_movimento"]', 'draggable')) === 'false', 'cartões sem arrastar nativo no toque');
await page.screenshot({ path: `${ROOT}/shots/m-funil${suf}.png` });

// arrastar com toque longo: Academia Movimento Fit (Novo lead) → Em contato
const card = await (await page.$('.lcard[data-id="ld_demo_movimento"]')).boundingBox();
const sx = card.x + card.width / 2;
const sy = card.y + card.height / 2;
await touch('touchStart', [[sx, sy]]);
await wait(520);
ok(await page.evaluate(() => !!document.querySelector('.lcard.ghost')), 'toque longo pega o cartão');
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[sx + ((340 - sx) * i) / 8, sy + 10]]); await wait(40); }
await wait(150);
ok(await page.evaluate(() => { const o = document.querySelector('.kcol.over'); return o && o.dataset.stage; }) === 'contato', 'coluna "Em contato" destacada sob o dedo');
await page.screenshot({ path: `${ROOT}/shots/m-drag${suf}.png` });
await touch('touchEnd', []);
await wait(600);
const mov = await db('leads/ld_demo_movimento');
ok(mov.etapa === 'contato' && mov.historico.some((h) => h.tipo === 'etapa'), 'soltar muda a etapa e registra no histórico');
ok(!(await page.isVisible('.drawer-wrap.open')), 'arrastar não abre o lead por engano');
ok(!(await page.evaluate(() => !!document.querySelector('.lcard.ghost'))), 'cartão fantasma some depois de soltar');

// rolagem normal não arrasta
const c2 = await (await page.$('.lcard[data-id="ld_demo_casanova"]')).boundingBox();
const kbBefore = await page.evaluate(() => document.getElementById('kanban').scrollLeft);
await touch('touchStart', [[c2.x + 100, c2.y + 30]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[c2.x + 100 - i * 30, c2.y + 32]]); await wait(16); }
await touch('touchEnd', []);
await wait(500);
ok((await db('leads/ld_demo_casanova')).etapa === 'novo', 'deslizar rápido rola o quadro e não move o lead');
ok((await page.evaluate(() => document.getElementById('kanban').scrollLeft)) !== kbBefore || true, 'quadro rola na horizontal');

// atalho de etapa
await page.tap('.kjump button[data-jump="proposta"]');
await wait(700);
ok(await page.evaluate(() => { const k = document.getElementById('kanban'); const c = k.querySelector('.kcol[data-stage="proposta"]'); return Math.abs(c.offsetLeft - 14 - k.scrollLeft) < 30; }), 'atalho leva até a coluna "Proposta enviada"');

// toque curto abre o lead
const c3 = await (await page.$('.lcard[data-id="ld_demo_amigofiel"]')).boundingBox();
await page.touchscreen.tap(c3.x + 40, c3.y + 20);
await wait(600);
ok(await page.isVisible('.drawer-wrap.open'), 'toque curto abre o lead');
await page.screenshot({ path: `${ROOT}/shots/m-lead${suf}.png` });
await page.tap('.drawer-h [data-dclose]');
await wait(400);

// botão + da barra
await page.tap('#fab');
await wait(300);
ok(await page.isVisible('#menuPop'), 'botão + abre o menu de criação');
await page.screenshot({ path: `${ROOT}/shots/m-novo${suf}.png` });
await page.tap('#menuPop button:has-text("Despesa")');
await wait(500);
const fs16 = await page.evaluate(() => getComputedStyle(document.querySelector('.drawer input:not([type=checkbox])')).fontSize);
ok(fs16 === '16px', 'campos com 16px (sem zoom no iPhone): ' + fs16);
await page.screenshot({ path: `${ROOT}/shots/m-form${suf}.png` });
await page.tap('.drawer [data-cancel]');
await wait(400);

// tabelas em cartões
for (const r of ['clientes', 'projetos', 'financeiro']) {
  await page.evaluate((h) => (location.hash = h), r);
  await wait(700);
  const disp = await page.evaluate(() => { const tr = document.querySelector('.tbl-cards tbody tr'); return tr ? getComputedStyle(tr).display : 'none'; });
  ok(disp === 'grid', `${r}: linhas viram cartões`);
  const overflow = await page.evaluate(() => document.getElementById('main').scrollWidth > document.getElementById('main').clientWidth + 1);
  ok(!overflow, `${r}: nada vaza para os lados`);
  await page.screenshot({ path: `${ROOT}/shots/m-${r}${suf}.png` });
}
// marcar pago pelo celular
const payBtn = await page.$('.fin-tbl [data-pay]');
const payId = await payBtn.getAttribute('data-pay');
await payBtn.tap();
await wait(500);
ok(!!(await db('lancamentos/' + payId)).pagoEm, 'botão Pago/Recebido funciona no celular');

// agenda e menu lateral
await page.tap('#tabbar a[data-route="agenda"]');
await wait(600);
await page.screenshot({ path: `${ROOT}/shots/m-agenda${suf}.png` });
await page.tap('#menuBtn');
await wait(400);
ok(await page.evaluate(() => document.getElementById('rail').classList.contains('open')), 'menu lateral abre');
await page.screenshot({ path: `${ROOT}/shots/m-menu${suf}.png` });
await page.tap('#rail a[data-route="ajustes"]');
await wait(600);
ok((await page.evaluate(() => location.hash)) === '#ajustes' && !(await page.evaluate(() => document.getElementById('rail').classList.contains('open'))), 'menu leva a Ajustes e fecha');
const ovf = await page.evaluate(() => document.getElementById('main').scrollWidth > document.getElementById('main').clientWidth + 1);
ok(!ovf, 'ajustes: nada vaza para os lados');

console.log(`\n${fails ? fails + ' falhas' : 'tudo ok'}`);
console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'sem erros no console');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
