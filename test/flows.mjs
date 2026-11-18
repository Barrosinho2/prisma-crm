// Testes de ponta a ponta dos fluxos principais, com o banco simulado.
import { chromium } from 'playwright';
import fs from 'node:fs';
const ROOT = '/home/claude/prisma-crm';
const seedBase = JSON.parse(fs.readFileSync(`${ROOT}/test/seed.json`, 'utf8'));
// os dados de exemplo são de 16/11/2026: o relógio do navegador fica parado nesse dia
const AGORA = new Date('2026-11-16T15:00:00Z');
const today = (() => { const d = new Date(AGORA); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const month = today.slice(0, 7);

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
let passes = 0;
const errors = [];
function ok(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); }
  else { fails++; console.log('  ✗ ' + msg); }
}
async function open({ prefs = { socio: 'rafael' }, readOnly = false, viewport = { width: 1440, height: 900 } } = {}) {
  const seed = JSON.parse(JSON.stringify(seedBase));
  if (prefs) seed.__prefs = prefs;
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  await ctx.clock.setFixedTime(AGORA);
  await ctx.addInitScript({ content: `window.__MOCK_SEED__ = ${JSON.stringify(seed)}; window.__mockReadOnly = ${readOnly};` });
  await ctx.addInitScript({ path: `${ROOT}/test/mock.js` });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error'].includes(m.type()) && !/fonts\.g|net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.goto(`file://${ROOT}/dist/index.html#painel`);
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const db = (page, path) => page.evaluate((p) => { const v = window.__mockStore.get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, path);
const dbAll = (page, col) => page.evaluate((c) => { const out = []; for (const [p, v] of window.__mockStore) { const seg = p.split('/'); if (seg.length === 2 && seg[0] === c) out.push({ id: seg[1], ...v }); } return out; }, col);
const settle = (page, ms = 400) => page.waitForTimeout(ms);

/* ───────── 1. fluxo comercial completo ───────── */
console.log('\n1) Lead → etapas → interação → venda');
{
  const { page } = await open();
  await page.click('#newBtn');
  await page.click('#menuPop button:has-text("Lead")');
  await settle(page, 300);
  const fid = await page.$eval('.drawer [data-form]', (e) => e.dataset.form);
  await page.fill(`#${fid}_empresa`, 'Teste Ltda');
  await page.fill(`#${fid}_contato`, 'Joana');
  await page.fill(`#${fid}_valor`, '4.500');
  await page.click(`#${fid}_servicos .chip[data-v="site"]`);
  await page.selectOption(`#${fid}_origem`, 'Google');
  await page.click('.drawer [data-save]');
  await settle(page, 500);
  let lead = (await dbAll(page, 'leads')).find((l) => l.empresa === 'Teste Ltda');
  ok(lead && lead.valor === 4500 && lead.servicos.join() === 'site' && lead.etapa === 'novo' && lead.criadoPor === 'rafael', 'lead criado com valor, interesse, etapa e autor');
  ok(lead && lead.historico.length === 1, 'histórico começa com "Lead criado"');

  await page.evaluate(() => (location.hash = 'funil'));
  await settle(page);
  await page.click(`.lcard[data-id="${lead.id}"]`);
  await settle(page);
  ok(await page.isVisible('.drawer-wrap.open'), 'drawer do lead abre pelo cartão');
  await page.click('.drawer .step[data-stage="contato"]');
  await settle(page, 500);
  lead = await db(page, `leads/${lead.id}`);
  ok(lead.etapa === 'contato' && lead.historico.length === 2 && lead.historico[1].tipo === 'etapa', 'mudança de etapa grava etapa e histórico');

  const atId = await page.$eval('.drawer textarea[id^="at_x_"]', (e) => e.id);
  await page.fill('#' + atId, 'Pediu orçamento com prazo de 30 dias');
  await page.click('.drawer [data-reg]');
  await settle(page, 500);
  lead = (await dbAll(page, 'leads')).find((l) => l.empresa === 'Teste Ltda');
  ok(lead.historico.length === 3 && lead.historico[2].texto.includes('30 dias') && lead.historico[2].tipo === 'whatsapp', 'interação registrada no histórico');

  await page.click('.drawer [data-win]');
  await settle(page);
  const wf = await page.$eval('.drawer [data-form]', (e) => e.dataset.form);
  const valorPre = await page.inputValue(`#${wf}_valor`);
  ok(valorPre === '4.500,00', 'valor da venda vem do lead (' + valorPre + ')');
  await page.selectOption(`#${wf}_pagamento`, 'entrada_parcelas');
  await page.fill(`#${wf}_entradaPct`, '40');
  await page.fill(`#${wf}_parcelas`, '2');
  await page.check(`#${wf}_entradaRecebida`);
  await page.fill(`#${wf}_manutencao`, '180');
  await settle(page, 200);
  const planItems = await page.$$eval('.plan li', (els) => els.map((e) => e.textContent));
  ok(planItems.length === 3, 'prévia mostra entrada + 2 parcelas');
  await page.click('.drawer [data-save]');
  await settle(page, 1200);
  const cli = (await dbAll(page, 'clientes')).find((c) => c.nome === 'Teste Ltda');
  const proj = (await dbAll(page, 'projetos')).find((p) => p.clienteId === (cli && cli.id));
  const parcelas = (await dbAll(page, 'lancamentos')).filter((l) => proj && l.projetoId === proj.id);
  const rec = (await dbAll(page, 'recorrencias')).find((r) => cli && r.clienteId === cli.id);
  lead = (await dbAll(page, 'leads')).find((l) => l.empresa === 'Teste Ltda');
  ok(!!cli && cli.leadId === lead.id, 'cliente criado a partir do lead');
  ok(!!proj && proj.valor === 4500 && proj.status === 'planejamento', 'projeto criado');
  const total = parcelas.reduce((a, l) => a + l.valor, 0);
  ok(parcelas.length === 3 && Math.abs(total - 4500) < 0.001, `3 parcelas somando 4500 (${parcelas.map((l) => l.valor).join(' + ')})`);
  ok(parcelas.filter((l) => l.pagoEm === today).length === 1, 'entrada marcada como recebida hoje');
  ok(rec && rec.valor === 180 && rec.inicio > month && rec.tipo === 'entrada', 'mensalidade de manutenção virou recorrência a partir do mês seguinte');
  ok(lead.etapa === 'ganho' && lead.projetoId === proj.id, 'lead marcado como ganho e ligado ao projeto');
  ok(await page.isVisible('.drawer-wrap.open') && (await page.textContent('#drawer_t')).includes(proj.titulo), 'drawer do projeto abre depois da venda');

  /* marcar pago */
  console.log('\n2) Caixa: marcar recebido, lançar recorrências, despesa recorrente');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (location.hash = 'financeiro'));
  await settle(page);
  const pend = parcelas.find((l) => !l.pagoEm);
  // a 1ª parcela vence no mês seguinte: navega até lá
  if (pend.vencimento.slice(0, 7) !== month) { await page.click('#fi_body [data-m="1"]'); await settle(page); }
  await page.click(`tr[data-lanc="${pend.id}"] [data-pay]`);
  await settle(page, 500);
  ok((await db(page, `lancamentos/${pend.id}`)).pagoEm === today, 'botão "Recebido" grava a data de hoje');
  await page.click('#fi_body [data-m="0"]').catch(() => {});
  await settle(page);
  ok(!!(await db(page, `lancamentos/rec_rc_demo_internet_${month}`)) && !!(await db(page, `lancamentos/rec_rc_demo_suporte_pao_${month}`)), 'piloto lançou sozinho as recorrências do mês, com códigos únicos');
  ok(!(await page.$('[data-lancar]')) && !(await page.$('#fi_body .banner b')), 'nenhum aviso de recorrência pendente no mês atual');
  const logRec = await db(page, 'automacoes/log');
  ok(logRec && logRec.itens.some((x) => x.tipo === 'recorrencias'), 'lançamento automático aparece no histórico do piloto');
  await page.click('[data-nova="saida"]');
  await settle(page, 300);
  const lf = await page.$eval('.drawer [data-form]', (e) => e.dataset.form);
  await page.fill(`#${lf}_descricao`, 'Hostinger');
  await page.fill(`#${lf}_valor`, '49,90');
  await page.selectOption(`#${lf}_categoria`, 'Hospedagem & domínios');
  await page.check(`#${lf}_repetir`);
  await page.click('.drawer [data-save]');
  await settle(page, 700);
  const rh = (await dbAll(page, 'recorrencias')).find((r) => r.descricao === 'Hostinger');
  ok(rh && rh.valor === 49.9 && rh.tipo === 'saida', 'despesa com "repetir" cria recorrência (49,90)');
  ok(rh && !!(await db(page, `lancamentos/rec_${rh.id}_${month}`)), 'e o lançamento do mês ligado a ela');

  /* agenda */
  console.log('\n3) Agenda');
  await page.evaluate(() => (location.hash = 'agenda'));
  await settle(page);
  await page.fill('#ag_qt', 'Ligar para o contador');
  await page.press('#ag_qt', 'Enter');
  await settle(page, 500);
  const tf = (await dbAll(page, 'tarefas')).find((t) => t.titulo === 'Ligar para o contador');
  ok(tf && tf.responsavel === 'rafael' && tf.prazo === today && tf.feita === false, 'tarefa rápida criada para hoje');
  await page.click(`[data-tick="${tf.id}"]`);
  await settle(page, 500);
  ok((await db(page, `tarefas/${tf.id}`)).feita === true, 'tarefa concluída pelo check');
  await page.click('.ag-done summary');
  await page.click(`.ag-done [data-tick="${tf.id}"]`);
  await settle(page, 500);
  ok((await db(page, `tarefas/${tf.id}`)).feita === false, 'tarefa reaberta');

  /* perder lead */
  console.log('\n4) Perder lead, excluir e desfazer');
  await page.evaluate(() => (location.hash = 'funil'));
  await settle(page);
  await page.click('.lcard[data-id="ld_demo_sabor"]');
  await settle(page);
  await page.click('.drawer [data-lose]');
  await settle(page, 300);
  const mf = await page.$eval('.modal [data-form]', (e) => e.dataset.form);
  await page.selectOption(`#${mf}_motivo`, 'Escolheu concorrente');
  await page.click('.modal .btn-danger');
  await settle(page, 500);
  const sabor = await db(page, 'leads/ld_demo_sabor');
  ok(sabor.etapa === 'perdido' && sabor.motivoPerda === 'Escolheu concorrente', 'lead perdido com motivo');
  await page.keyboard.press('Escape');
  await settle(page, 300);
  await page.evaluate(() => (location.hash = 'agenda'));
  await settle(page);
  await page.click(`[data-open="tarefa:${tf.id}"]`);
  await settle(page, 300);
  await page.click('.drawer [data-del]');
  await settle(page, 300);
  await page.click('.modal .btn-danger');
  await settle(page, 500);
  ok((await db(page, `tarefas/${tf.id}`)) === null, 'tarefa excluída');
  await page.click('.toast:last-child .toast-act');
  await settle(page, 500);
  ok(!!(await db(page, `tarefas/${tf.id}`)), '"Desfazer" recupera a tarefa');

  /* ajustes e exportação */
  console.log('\n5) Ajustes, exportação e limpeza dos exemplos');
  await page.evaluate(() => (location.hash = 'ajustes'));
  await settle(page);
  ok(await page.isDisabled('#aj_gsave'), 'botão salvar começa desabilitado');
  const gfid = await page.$eval('#aj_body [data-form]', (e) => e.dataset.form);
  await page.fill(`#${gfid}_metaMensal`, '12000');
  await page.click('#aj_gsave');
  await settle(page, 600);
  ok((await db(page, 'config/geral')).metaMensal === 12000, 'meta mensal salva no banco');
  await page.fill('#la_origens', 'Feira de negócios');
  await page.press('#la_origens', 'Enter');
  await page.click('#aj_lsave');
  await settle(page, 600);
  ok((await db(page, 'config/geral')).origens.includes('Feira de negócios'), 'nova origem salva na lista');
  await page.click('[data-exp="json"]');
  await settle(page, 400);
  await page.click('[data-exp="lanc"]');
  await settle(page, 400);
  const dls = await page.evaluate(() => window.__downloads);
  ok(dls.length === 2 && /prisma-crm-backup-.*\.json/.test(dls[0].filename) && /\.csv$/.test(dls[1].filename) && dls[1].head.includes('Tipo;Descrição'), 'backup .json e planilha .csv oferecidos para download');
  await page.click('#aj_dados [data-cleardemo]');
  await settle(page, 300);
  await page.click('.modal .btn-danger');
  await page.waitForTimeout(9000);
  const restam = {};
  for (const c of ['leads', 'clientes', 'projetos', 'lancamentos', 'recorrencias', 'tarefas']) restam[c] = await dbAll(page, c);
  const demoLeft = Object.values(restam).flat().filter((r) => r.demo).length;
  ok(demoLeft === 0, 'nenhum registro de exemplo sobrou');
  ok(restam.leads.length === 1 && restam.clientes.length === 1 && restam.projetos.length === 1 && restam.lancamentos.length === 4 && restam.recorrencias.length === 2, `registros reais preservados e derivados de exemplos removidos (${Object.entries(restam).map(([k, v]) => k + ':' + v.length).join(', ')})`);
  ok(!(await page.$('#banners .b-demo')), 'aviso de exemplos some');
  await page.evaluate(() => (location.hash = 'painel'));
  await settle(page, 800);
  ok((await page.textContent('#hero_v')).includes('R$'), 'painel continua funcionando sem os exemplos');
  await page.screenshot({ path: `${ROOT}/shots/pos-limpeza.png` });
}

/* ───────── 2. primeiro acesso: quem é você ───────── */
console.log('\n6) Primeiro acesso e somente leitura');
{
  const { page } = await open({ prefs: null });
  ok(await page.isVisible('.modal .me-pick'), 'pergunta "quem está usando" no primeiro acesso');
  await page.click('.modal [data-me="pedro"]');
  await settle(page, 500);
  ok((await db(page, 'data/users/u_teste/prefs')).socio === 'pedro', 'escolha salva na área pessoal do usuário');
  ok((await page.textContent('#meChip')).includes('Pedro'), 'menu lateral mostra Pedro');
}
{
  const { page } = await open({ readOnly: true });
  ok(await page.evaluate(() => document.body.classList.contains('readonly')), 'modo somente leitura ativado quando não pode gravar');
  ok(!(await page.isVisible('#newBtn')), 'botão Novo some para quem só lê');
  ok(await page.isVisible('#banners .b-gray'), 'aviso de somente leitura visível');
}

/* ───────── 3. banco vazio ───────── */
console.log('\n7) Banco vazio');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript({ content: `window.__MOCK_SEED__ = { __prefs: { socio: 'rafael' } };` });
  await ctx.addInitScript({ path: `${ROOT}/test/mock.js` });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror(vazio): ' + e.message));
  await page.goto(`file://${ROOT}/dist/index.html#painel`);
  await page.waitForTimeout(1500);
  ok((await page.textContent('#hero_v')).includes('0,00'), 'painel vazio mostra saldo zero');
  for (const r of ['funil', 'clientes', 'projetos', 'financeiro', 'agenda', 'ajustes']) {
    await page.evaluate((h) => (location.hash = h), r);
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => (location.hash = 'funil'));
  await page.waitForTimeout(350);
  ok(await page.isVisible('.empty'), 'funil vazio mostra convite para cadastrar');
  await page.screenshot({ path: `${ROOT}/shots/vazio-funil.png` });
}

console.log(`\n${passes} ok, ${fails} falhas`);
console.log(errors.length ? 'ERROS NO CONSOLE:\n' + errors.join('\n') : 'sem erros no console');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
