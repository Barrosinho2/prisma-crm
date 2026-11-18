// Testes do piloto automático: automações por evento, motor de calendário, mensagens, extrato e página.
import { chromium } from 'playwright';
import fs from 'node:fs';
const ROOT = '/home/claude/prisma-crm';
const seedBase = JSON.parse(fs.readFileSync(`${ROOT}/test/seed.json`, 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// os dados de exemplo são de 16/11/2026: o relógio do navegador fica parado nesse dia
const AGORA = new Date('2026-11-16T15:00:00Z');
const today = iso(new Date(AGORA));
const month = today.slice(0, 7);
const addDays = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };
const uteis = (s, n) => { let d = s; const fds = (x) => [0, 6].includes(new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)).getDay()); if (n <= 0) { while (fds(d)) d = addDays(d, 1); return d; } let k = 0; while (k < n) { d = addDays(d, 1); if (!fds(d)) k++; } return d; };
const prevMonth = (() => { const d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })();

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
let passes = 0;
const errors = [];
function ok(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); }
  else { fails++; console.log('  ✗ ' + msg); }
}
async function open({ prefs = { socio: 'rafael' }, extra = {}, config = null, viewport = { width: 1440, height: 900 }, hash = 'painel', semDemo = false } = {}) {
  const seed = semDemo ? {} : JSON.parse(JSON.stringify(seedBase));
  if (prefs) seed.__prefs = prefs;
  for (const [col, rows] of Object.entries(extra)) seed[col] = [...(seed[col] || []), ...rows];
  if (config) seed.config = config;
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  await ctx.clock.setFixedTime(AGORA);
  await ctx.addInitScript({ content: `window.__MOCK_SEED__ = ${JSON.stringify(seed)};` });
  await ctx.addInitScript({ path: `${ROOT}/test/mock.js` });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|wa\.me|mail\.google|calendar\.google/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|net::|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.goto(`file://${ROOT}/dist/index.html#${hash}`);
  await page.waitForTimeout(2200);
  return { ctx, page };
}
const db = (page, path) => page.evaluate((p) => { const v = window.__mockStore.get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, path);
const dbAll = (page, col) => page.evaluate((c) => { const out = []; for (const [p, v] of window.__mockStore) { const seg = p.split('/'); if (seg.length === 2 && seg[0] === c) out.push({ id: seg[1], ...v }); } return out; }, col);
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const go = (page, h) => page.evaluate((x) => (location.hash = x), h);
const rodar = (page) => page.evaluate(() => window.__prismaAuto(true));

/* ───────── 1. ao abrir: motor de calendário ───────── */
console.log('\n1) Motor ao abrir o CRM');
{
  const { page } = await open();
  const vc = await db(page, 'leads/ld_demo_visaoclara');
  ok(vc.proximoContato === today && vc.paradoAviso === today && /Retomar/.test(vc.proximaAcao), 'lead parado há 23 dias ganhou contato para hoje');
  ok(vc.historico[vc.historico.length - 1].tipo === 'auto', 'histórico do lead registra a ação do piloto');
  const log = await page.evaluate(() => window.__mockLog.filter((x) => x[0] === 'acquire').length);
  ok(log >= 1, 'motor pega a trava antes de mexer (uma aba por vez)');
  const est = await db(page, 'automacoes/estado');
  ok(est && est.ultimaRodada, 'estado do piloto gravado com a última rodada');
  const hist = await db(page, 'automacoes/log');
  ok(hist && hist.itens.some((x) => x.tipo === 'parado') && hist.itens.some((x) => x.tipo === 'recorrencias'), 'histórico tem o lead parado e as recorrências');
  const antes = (await dbAll(page, 'lancamentos')).length;
  await rodar(page);
  await settle(page, 600);
  ok((await dbAll(page, 'lancamentos')).length === antes, 'rodar de novo não duplica nada');
  ok(await page.isVisible('.attn-i .attn-acts a.btn-wa'), 'atenção mostra botão de WhatsApp com mensagem pronta');

  /* follow-up por etapa */
  console.log('\n2) Próximo contato a cada etapa e sugestões');
  await go(page, 'funil');
  await settle(page);
  await page.click('.lcard[data-id="ld_demo_movimento"]');
  await settle(page);
  ok((await page.textContent('.drawer .sug-t')) === 'Fazer o primeiro contato', 'lead novo sugere o primeiro contato');
  const href = await page.getAttribute('.drawer .sug a.btn-wa', 'href');
  ok(href && href.startsWith('https://wa.me/5519900001101?text=') && decodeURIComponent(href).includes('Prisma Systems'), 'botão do WhatsApp já leva a mensagem (' + (href || '').slice(0, 40) + '…)');
  await page.click('.drawer .step[data-stage="contato"]');
  await settle(page, 500);
  let mv = await db(page, 'leads/ld_demo_movimento');
  ok(mv.etapa === 'contato' && mv.proximoContato === uteis(today, 2) && mv.proximaAcao === 'Marcar a conversa de diagnóstico', `ao ir para Em contato, próximo contato em 2 dias úteis (${mv.proximoContato})`);
  ok((await page.textContent('.drawer .sug-t')) === 'Marcar a conversa de diagnóstico', 'sugestão muda com a etapa');
  ok(!!(await page.getAttribute('.drawer .sug a[href*="calendar.google.com"]', 'href')), 'sugestão de diagnóstico abre o Google Agenda já preenchido');
  await page.keyboard.press('Escape');
  await page.click('.lcard[data-id="ld_demo_pequenosaber"]');
  await settle(page);
  await page.click('.drawer .step[data-stage="diagnostico"]');
  await settle(page, 500);
  const ps = await db(page, 'leads/ld_demo_pequenosaber');
  ok(ps.etapa === 'diagnostico' && ps.proximoContato === '2026-11-19', 'contato já marcado para o futuro é mantido');
  await page.keyboard.press('Escape');
  await page.click('.lcard[data-id="ld_demo_sabor"]');
  await settle(page);
  ok((await page.textContent('.drawer .sug-t')) === 'Retomar o contato atrasado', 'follow-up atrasado vira a sugestão principal');
  const nWa = (await db(page, 'leads/ld_demo_sabor')).historico.length;
  await page.evaluate(() => { const a = document.querySelector('.drawer .msgc a.btn-wa'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
  await settle(page, 500);
  const sb = await db(page, 'leads/ld_demo_sabor');
  ok(sb.historico.length === nWa + 1 && sb.historico[sb.historico.length - 1].tipo === 'whatsapp', 'abrir a mensagem pronta registra no histórico');
  await page.click('.drawer #mk_ld_demo_sabor [data-v="proposta"]');
  await settle(page, 300);
  ok((await page.textContent('.drawer .msgc-x')).includes('proposta'), 'dá para trocar a mensagem pronta');
  await page.keyboard.press('Escape');

  /* venda com checklist */
  console.log('\n3) Venda cria as tarefas do projeto');
  await page.click('.lcard[data-id="ld_demo_recanto"]');
  await settle(page);
  ok((await page.textContent('.drawer .sug-t')) === 'Fechar a venda', 'negociação sugere registrar a venda');
  await page.click('.drawer [data-win]');
  await settle(page);
  const wf = await page.$eval('.drawer [data-form]', (e) => e.dataset.form);
  await page.selectOption(`#${wf}_servico`, 'site');
  await page.fill(`#${wf}_valor`, '6000');
  await page.fill(`#${wf}_prazo`, addDays(today, 30));
  await page.check(`#${wf}_entradaRecebida`);
  await page.click('.drawer [data-save]');
  await settle(page, 1500);
  const proj = (await dbAll(page, 'projetos')).find((p) => p.leadId === 'ld_demo_recanto');
  const ck = (await dbAll(page, 'tarefas')).filter((t) => proj && t.vinculo === `projeto:${proj.id}` && t.auto === 'checklist').sort((a, b) => a.prazo.localeCompare(b.prazo));
  ok(ck.length === 5 && ck.every((t) => t.responsavel === 'rafael'), `5 tarefas de site para quem executa (${ck.length})`);
  ok(ck.length && ck[ck.length - 1].prazo === addDays(today, 30) && ck[0].prazo > today, 'prazos distribuídos até a data de entrega');
  ok(ck.every((t) => t.demo === true), 'tarefas de venda de exemplo também são exemplo');
  const nfVenda = (await dbAll(page, 'tarefas')).find((t) => t.auto === 'notaFiscal' && proj && t.vinculo === `projeto:${proj.id}`);
  ok(!!nfVenda, 'entrada já recebida na venda gera a tarefa de nota fiscal');
  ok((await page.textContent('.toast:last-child')).includes('tarefas na agenda'), 'aviso da venda conta as tarefas criadas');
  await page.keyboard.press('Escape');

  /* pós-entrega */
  console.log('\n4) Pós-venda na entrega');
  await go(page, 'projetos');
  await settle(page);
  await page.evaluate(() => { const r = [...document.querySelectorAll('[data-projeto], [data-open-projeto], tr[data-id], .pcard')].find((x) => (x.dataset.projeto || x.dataset.openProjeto || x.dataset.id) === 'pj_demo_mendes'); if (r) r.click(); });
  await settle(page);
  if (!(await page.isVisible('.drawer-wrap.open'))) await page.evaluate(() => window.__abrirProjeto && window.__abrirProjeto('pj_demo_mendes'));
  await page.selectOption('#pst_pj_demo_mendes', 'entregue');
  await settle(page, 900);
  const pe = (await dbAll(page, 'tarefas')).filter((t) => t.id.startsWith('auto_pe_pj_demo_mendes_'));
  ok(pe.length === 3 && pe.every((t) => t.responsavel === 'pedro'), `depoimento, manutenção e saldo para quem vendeu (${pe.map((t) => t.id.split('_').pop()).join(', ')})`);
  ok(await page.isVisible('.drawer #pmk_pj_demo_mendes'), 'projeto entregue mostra mensagens de depoimento e manutenção');
  await page.selectOption('#pst_pj_demo_mendes', 'revisao');
  await settle(page, 500);
  await page.selectOption('#pst_pj_demo_mendes', 'entregue');
  await settle(page, 700);
  ok((await dbAll(page, 'tarefas')).filter((t) => t.id.startsWith('auto_pe_pj_demo_mendes_')).length === 3, 'entregar de novo não duplica as tarefas');
  await page.keyboard.press('Escape');

  /* nota fiscal e desfazer */
  console.log('\n5) Nota fiscal ao receber e desfazer');
  await go(page, 'financeiro');
  await settle(page);
  await page.click('#fit_aberto');
  await settle(page);
  await page.click('[data-pay="lc_demo_007"]');
  await settle(page, 600);
  const nf = await db(page, 'tarefas/auto_nf_lc_demo_007');
  ok(nf && nf.responsavel === 'rafael' && nf.vinculo === 'projeto:pj_demo_alicerce' && /nota fiscal/i.test(nf.titulo), 'tarefa de nota fiscal criada para quem emite');
  await page.click('.toast:last-child .toast-act');
  await settle(page, 600);
  ok(!(await db(page, 'lancamentos/lc_demo_007')).pagoEm && !(await db(page, 'tarefas/auto_nf_lc_demo_007')), '"Desfazer" volta o pagamento e tira a tarefa');

  /* pular mês de recorrência */
  console.log('\n6) Excluir lançamento de recorrência pula o mês');
  const rid = `rec_rc_demo_internet_${month}`;
  ok(!!(await db(page, `lancamentos/${rid}`)), 'lançamento da recorrência existe');
  await page.evaluate((id) => { location.hash = 'financeiro'; }, rid);
  await page.click('#fit_mes');
  await settle(page);
  await page.click(`tr[data-lanc="${rid}"]`);
  await settle(page);
  await page.click('.drawer [data-del]');
  await settle(page, 300);
  ok((await page.textContent('.modal .modal-text')).includes('pula só'), 'aviso explica que só o mês é pulado');
  await page.click('.modal .btn-danger');
  await settle(page, 600);
  ok(((await db(page, 'recorrencias/rc_demo_internet')).pulados || []).includes(month), 'mês marcado como pulado na recorrência');
  await rodar(page);
  await settle(page, 600);
  ok(!(await db(page, `lancamentos/${rid}`)), 'piloto não lança de novo o mês pulado');
  await page.click('.toast:last-child .toast-act').catch(() => {});
  await settle(page, 700);
  const back = await db(page, `lancamentos/${rid}`);
  ok(!!back && !((await db(page, 'recorrencias/rc_demo_internet')).pulados || []).includes(month), '"Desfazer" devolve o lançamento e tira o mês dos pulados');

  /* colar mensagem */
  console.log('\n7) Lead a partir de uma mensagem');
  await page.click('#newBtn');
  await page.click('#menuPop button:has-text("Lead de uma mensagem")');
  await settle(page, 400);
  const lf = await page.$eval('.drawer [data-form]', (e) => e.dataset.form);
  ok(await page.isVisible(`#${lf}_msg`), 'caixa de colar já vem aberta');
  await page.fill(`#${lf}_msg`, '[16/11/2026 10:32] João Silva: Boa tarde! Sou o João, dono da Padaria Pão Dourado. Queria automatizar os pedidos pelo WhatsApp, tenho uns 5 mil de orçamento. Meu número é (19) 98888-7777');
  await page.click('.drawer [data-paste-go]');
  await settle(page, 300);
  ok((await page.inputValue(`#${lf}_empresa`)) === 'Padaria Pão Dourado' && (await page.inputValue(`#${lf}_contato`)) === 'João Silva', 'empresa e contato preenchidos');
  ok((await page.inputValue(`#${lf}_telefone`)) === '(19) 98888-7777' && (await page.inputValue(`#${lf}_valor`)) === '5.000,00', 'telefone e valor preenchidos');
  ok((await page.getAttribute(`#${lf}_servicos .chip[data-v="automacao"]`, 'aria-pressed')) === 'true' && (await page.inputValue(`#${lf}_origem`)) === 'WhatsApp', 'interesse e origem marcados');
  ok((await page.textContent(`#${lf}_msgres`)).startsWith('Preenchido:'), 'resumo do que foi preenchido');
  await page.click('.drawer [data-save]');
  await settle(page, 600);
  const pd = (await dbAll(page, 'leads')).find((l) => l.empresa === 'Padaria Pão Dourado');
  ok(pd && pd.cargo === 'Dono' && pd.notas.includes('Mensagem recebida'), 'lead salvo com cargo e a mensagem nas observações');

  /* página do piloto */
  console.log('\n8) Página do piloto automático');
  await go(page, 'piloto');
  await settle(page, 600);
  ok((await page.$$('.pl-card')).length === 14 && (await page.$$('[role=switch]')).length === 7, '14 automações explicadas, 7 com liga/desliga');
  ok((await page.textContent('#pl_count')).startsWith('7 de 8'), 'contagem de automações ligadas');
  ok((await page.$$('#pl_log .lg-i')).length >= 4, 'histórico do que o piloto fez aparece na página');
  ok(await page.isVisible('#pl_followupEtapa .pl-last'), 'cartão mostra a última ação daquela automação');
  await page.click('[data-sw="followupEtapa"]');
  await settle(page, 600);
  ok((await db(page, 'config/geral')).auto.followupEtapa === false, 'desligar salva na hora');
  await page.click('#pl_leadParado summary');
  await page.fill('#pa_d', '10');
  await page.click('[data-aj-save="parado"]');
  await settle(page, 600);
  ok((await db(page, 'config/geral')).auto.diasParado === 10, 'ajuste de dias do lead parado salvo');
  await page.fill('#pl_pix', 'financeiro@prisma.exemplo');
  await page.fill('#pl_m_followup', 'Fala, {contato}! Tudo certo com a {empresa}?');
  ok((await page.textContent('#pl_mp_followup')) === 'Fala, Marina! Tudo certo com a Clínica Sorriso?', 'prévia da mensagem troca as palavras entre chaves');
  await page.click('#pl_msave');
  await settle(page, 600);
  const cfgM = await db(page, 'config/geral');
  ok(cfgM.pix === 'financeiro@prisma.exemplo' && cfgM.msgs.followup.startsWith('Fala,'), 'mensagens e chave Pix salvas');
  await go(page, 'funil');
  await settle(page);
  await page.click('.lcard[data-id="ld_demo_casanova"]');
  await settle(page);
  const pcAntes = (await db(page, 'leads/ld_demo_casanova')).proximoContato;
  await page.click('.drawer .step[data-stage="contato"]');
  await settle(page, 500);
  ok((await db(page, 'leads/ld_demo_casanova')).proximoContato === pcAntes, 'com a automação desligada, mudar de etapa não reagenda');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${ROOT}/shots/auto-funil.png` });
  await go(page, 'piloto');
  await settle(page, 700);
  await page.screenshot({ path: `${ROOT}/shots/piloto.png`, fullPage: false });
  await page.evaluate(() => document.querySelector('#main').scrollTo(0, 900));
  await settle(page, 300);
  await page.screenshot({ path: `${ROOT}/shots/piloto-2.png` });
}

/* ───────── 2. imposto, lembrete de cobrança e extrato ───────── */
console.log('\n9) Imposto do mês, lembrete de cobrança e extrato do banco');
{
  const config = { auto: { imposto: 'simples', impostoPct: 6, impostoDia: 20, diasCobranca: 2 }, saldoInicial: 5000, saldoInicialData: '2026-01-01' };
  const extra = {
    clientes: [{ id: 'cl_real_1', nome: 'Ótica Nova Visão', contato: 'Lucas Prado', telefone: '(11) 97777-6666', email: 'lucas@oticanova.exemplo', criadoEm: today + 'T10:00:00.000Z', criadoPor: 'pedro' }],
    lancamentos: [
      { id: 'lc_real_rec', tipo: 'entrada', descricao: 'Site Ótica · Entrada', valor: 10000, categoria: 'Projetos', vencimento: `${prevMonth}-10`, pagoEm: `${prevMonth}-10`, clienteId: 'cl_real_1', criadoEm: today + 'T10:00:00.000Z' },
      { id: 'lc_real_lembrar', tipo: 'entrada', descricao: 'Site Ótica · Parcela 2/3', valor: 1500, categoria: 'Projetos', vencimento: addDays(today, 2), pagoEm: null, clienteId: 'cl_real_1', criadoEm: today + 'T10:00:00.000Z' },
      { id: 'lc_real_baixa', tipo: 'entrada', descricao: 'Site Ótica · Parcela 1/3', valor: 1234.56, categoria: 'Projetos', vencimento: addDays(today, -3), pagoEm: null, clienteId: 'cl_real_1', criadoEm: today + 'T10:00:00.000Z' },
      { id: 'lc_real_conta', tipo: 'saida', descricao: 'Hostinger', valor: 49.9, categoria: 'Hospedagem & domínios', vencimento: addDays(today, -1), pagoEm: null, criadoEm: today + 'T10:00:00.000Z' },
    ],
  };
  const { page } = await open({ config, extra, semDemo: true });
  const das = await db(page, `lancamentos/imp_${prevMonth}`);
  ok(das && das.valor === 600 && das.vencimento === `${month}-20` && das.auto === 'imposto' && das.tipo === 'saida', `DAS do mês anterior lançado: 6% de R$ 10.000 (${das && das.valor})`);
  // um recebimento do mês anterior registrado depois: o DAS em aberto se ajusta sozinho
  await go(page, 'financeiro');
  await settle(page);
  await page.click('[data-nova="entrada"]');
  await settle(page, 300);
  const ef = await page.$eval('.drawer [data-form]', (e) => e.dataset.form);
  await page.fill(`#${ef}_descricao`, 'Consultoria avulsa');
  await page.fill(`#${ef}_valor`, '5.000');
  await page.fill(`#${ef}_vencimento`, `${prevMonth}-12`);
  await page.selectOption(`#${ef}_categoria`, 'Consultoria');
  await page.check(`#${ef}_pago`);
  await page.fill(`#${ef}_pagoEm`, `${prevMonth}-12`);
  await page.click('.drawer [data-save]');
  await settle(page, 600);
  await rodar(page);
  await settle(page, 700);
  ok((await db(page, `lancamentos/imp_${prevMonth}`)).valor === 900, 'DAS em aberto se ajusta quando entra um recebimento atrasado (R$ 900)');
  await go(page, 'painel');
  await settle(page, 300);
  ok(await page.isVisible('.attn-i.t-blue'), 'lembrete aparece 2 dias antes do vencimento');
  const lemb = await page.getAttribute('.attn-i.t-blue a.btn-wa', 'href');
  ok(lemb && lemb.includes('5511977776666') && decodeURIComponent(lemb).includes('Parcela 2/3'), 'lembrete abre o WhatsApp do cliente com a parcela');
  await page.evaluate(() => { const a = document.querySelector('.attn-i.t-blue a.btn-wa'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
  await settle(page, 600);
  ok((await db(page, 'lancamentos/lc_real_lembrar')).lembreteEm === today, 'lembrete enviado fica registrado');
  ok(!(await page.isVisible('.attn-i.t-blue')), 'e sai da lista de atenção');
  // apagar o DAS: não volta
  await go(page, 'financeiro');
  await settle(page);
  await page.click(`tr[data-lanc="imp_${prevMonth}"]`).catch(async () => { await page.click('#fi_body [data-m="0"]'); await settle(page); await page.click(`tr[data-lanc="imp_${prevMonth}"]`); });
  await settle(page);
  ok(await page.isVisible('.drawer .banner.b-blue'), 'lançamento do imposto explica que veio do piloto');
  await page.click('.drawer [data-del]');
  await settle(page, 300);
  await page.click('.modal .btn-danger');
  await settle(page, 500);
  await rodar(page);
  await settle(page, 700);
  ok(!(await db(page, `lancamentos/imp_${prevMonth}`)), 'DAS excluído não é lançado de novo');

  // extrato OFX
  const ofx = `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${today.replace(/-/g, '')}120000[-3:BRT]<TRNAMT>1234.56<FITID>A1<MEMO>PIX RECEBIDO OTICA NOVA VISAO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${today.replace(/-/g, '')}<TRNAMT>-49.90<FITID>A2<MEMO>HOSTINGER BR</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${today.replace(/-/g, '')}<TRNAMT>-23.40<FITID>A3<MEMO>TARIFA BANCARIA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  await page.setInputFiles('.vactions input[data-extrato]', { name: 'extrato.ofx', mimeType: 'application/x-ofx', buffer: Buffer.from(ofx, 'latin1') });
  await settle(page, 700);
  ok(await page.isVisible('.modal.modal-lg .ex-list'), 'revisão do extrato abre');
  const chips = await page.$$eval('.ex-chip b', (bs) => bs.map((b) => b.textContent));
  ok(chips.join(',') === '2,0,1', `2 batem, 0 já no CRM, 1 não encontrada (${chips.join(',')})`);
  await page.check('#ex_criar');
  await page.screenshot({ path: `${ROOT}/shots/extrato.png` });
  await page.click('.modal .btn-primary');
  await settle(page, 1500);
  const bx = await db(page, 'lancamentos/lc_real_baixa');
  const ct = await db(page, 'lancamentos/lc_real_conta');
  ok(bx.pagoEm === today && bx.extratoId === 'ofx_A1' && ct.pagoEm === today, 'parcela e conta marcadas como pagas na data do banco');
  const tarifa = (await dbAll(page, 'lancamentos')).find((l) => l.extratoId === 'ofx_A3');
  ok(tarifa && tarifa.pagoEm === today && tarifa.valor === 23.4 && /imposto|taxa/i.test(tarifa.categoria), `tarifa criada como despesa paga (${tarifa && tarifa.categoria})`);
  ok(!!(await db(page, 'tarefas/auto_nf_lc_real_baixa')), 'baixa de recebimento gera a tarefa de nota fiscal');
  await page.setInputFiles('.vactions input[data-extrato]', { name: 'extrato.ofx', mimeType: 'application/x-ofx', buffer: Buffer.from(ofx, 'latin1') });
  await settle(page, 700);
  const chips2 = await page.$$eval('.ex-chip b', (bs) => bs.map((b) => b.textContent));
  ok(chips2.join(',') === '0,3,0', `importar o mesmo extrato de novo não repete nada (${chips2.join(',')})`);
  await page.click('.modal .btn-ghost');
  // csv do banco (Inter): latin-1, ponto e vírgula, crédito/débito
  const csv = 'Extrato Conta Corrente\nData Lançamento;Histórico;Descrição;Valor;Saldo\n' + `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)};Pix enviado;Figma;-85,00;1.000,00\n`;
  await page.setInputFiles('.vactions input[data-extrato]', { name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') });
  await settle(page, 700);
  const linhas = await page.$$eval('.ex-i .ex-t b', (bs) => bs.map((b) => b.textContent));
  ok(linhas.length === 1 && linhas[0] === 'Pix enviado · Figma', `CSV em latin-1 lido com histórico e descrição (${linhas.join(' | ')})`);
  await page.click('.modal .btn-ghost');
  const lg = await db(page, 'automacoes/log');
  ok(lg.itens.some((x) => x.tipo === 'extrato') && lg.itens.some((x) => x.tipo === 'imposto'), 'extrato e imposto no histórico do piloto');
}

/* ───────── 3. comece por aqui ───────── */
console.log('\n10) Comece por aqui');
{
  const { page } = await open({ prefs: { socio: 'rafael' } });
  ok(await page.isVisible('.start'), 'painel mostra os primeiros passos');
  ok((await page.textContent('.start .panel-sub')).startsWith('1 de 7'), 'conta o que já foi feito (' + (await page.textContent('.start .panel-sub')) + ')');
  ok((await page.textContent('.start-list li.next b')) === 'Informe o saldo do caixa', 'próximo passo destacado');
  await page.click('.start-list li.next [data-start]');
  await settle(page, 400);
  ok((await page.evaluate(() => location.hash)) === '#ajustes', 'botão leva para onde resolve');
  await go(page, 'piloto');
  await settle(page, 300);
  await go(page, 'painel');
  await settle(page, 400);
  ok((await page.textContent('.start .panel-sub')).startsWith('2 de 7'), 'visitar o piloto conta como passo feito');
  await page.click('[data-start-hide]');
  await settle(page, 300);
  ok(!(await page.isVisible('.start')), '"Ocultar" tira o cartão');
  await go(page, 'ajustes');
  await settle(page, 400);
  await page.click('[data-inicio-mostrar]');
  await settle(page, 400);
  ok(await page.isVisible('.start'), 'Ajustes traz os passos de volta');
}

/* ───────── 4. celular ───────── */
console.log('\n11) Piloto no celular');
{
  const { page } = await open({ viewport: { width: 390, height: 844 }, hash: 'piloto' });
  await settle(page, 400);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('.pl-card')].some((c) => c.scrollWidth > c.clientWidth + 1));
  ok(!over, 'página do piloto sem rolagem lateral');
  await page.screenshot({ path: `${ROOT}/shots/piloto-cel.png` });
  await go(page, 'funil');
  await settle(page);
  await page.click('#fab');
  await page.click('#menuPop button:has-text("Lead de uma mensagem")');
  await settle(page, 400);
  await page.screenshot({ path: `${ROOT}/shots/colar-cel.png` });
  const fs16 = await page.$eval('.drawer .paste textarea', (t) => getComputedStyle(t).fontSize);
  ok(fs16 === '16px', 'caixa de colar com fonte de 16px (sem zoom no iPhone)');
  await page.keyboard.press('Escape');
  await go(page, 'painel');
  await settle(page, 500);
  await page.screenshot({ path: `${ROOT}/shots/painel-cel-inicio.png` });
  await go(page, 'funil');
  await settle(page);
  await page.click('.kjump button:nth-child(2)').catch(() => {});
  await page.click('.lcard[data-id="ld_demo_sabor"]');
  await settle(page, 500);
  await page.screenshot({ path: `${ROOT}/shots/lead-cel.png` });
}

console.log(`\n${passes} ok, ${fails} falhas`);
console.log(errors.length ? 'ERROS NO CONSOLE:\n' + errors.join('\n') : 'sem erros no console');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
