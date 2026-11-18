// Testes da versão Vercel: login dos sócios, ponte para o banco e tempo real entre dois navegadores.
// O Supabase é simulado aqui no Node (mesmas regras de acesso da migração e das Edge Functions).
import { chromium } from 'playwright';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { servir } from './servidor.mjs';

const ROOT = '/home/claude/prisma-crm';
const FAKE = fs.readFileSync(`${ROOT}/test/fake-supabase.js`, 'utf8');
const seed = JSON.parse(fs.readFileSync(`${ROOT}/test/seed.json`, 'utf8'));
const SB = 'https://plnnmlooqbzwwcfsqmxg.supabase.co';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const ALF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const gerarCodigo = () => { const b = crypto.randomBytes(12); let c = ''; for (let i = 0; i < 12; i++) { c += ALF[b[i] % ALF.length]; if (i === 3 || i === 7) c += '-'; } return c; };
const normCodigo = (s) => { const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return t.length === 12 ? `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}` : null; };
const ehObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const mescla = (a, b) => { if (!ehObj(a) || !ehObj(b)) return clone(b); const r = { ...a }; for (const k of Object.keys(b)) r[k] = ehObj(b[k]) && ehObj(r[k]) ? mescla(r[k], b[k]) : clone(b[k]); return r; };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

class Fake {
  constructor() {
    this.users = new Map();
    this.tokens = new Map();
    this.membros = { rafael: { socio: 'rafael' }, pedro: { socio: 'pedro' } };
    this.docs = new Map();
    this.travas = new Map();
    this.assinantes = new Map();
    this.falhar = 0;
    this.atraso = 20;
  }
  usuario(email, senha, socio) {
    const id = crypto.randomUUID();
    this.users.set(id, { id, email, senha });
    if (socio) Object.assign(this.membros[socio], { user_id: id, email });
    return id;
  }
  convite(socio) {
    const c = gerarCodigo();
    Object.assign(this.membros[socio], { convite_hash: sha(c), convite_expira: new Date(Date.now() + 7 * 864e5).toISOString() });
    return c;
  }
  semear(s) {
    for (const [col, lista] of Object.entries(s)) {
      if (!Array.isArray(lista)) continue;
      for (const r of lista) { const { id, ...data } = r; this.docs.set(`${col}/${id}`, { col, id, data, versao: 1 }); }
    }
  }
  ehMembro(uid) { return !!uid && Object.values(this.membros).some((m) => m.user_id === uid); }
  emitir(ev) {
    for (const [page, uid] of this.assinantes) {
      if (page.isClosed()) { this.assinantes.delete(page); continue; }
      if (!this.ehMembro(uid)) continue;
      setTimeout(() => page.evaluate((e) => window.__fakeRt && window.__fakeRt.entregar(e), ev).catch(() => {}), this.atraso);
    }
  }
  async handle(page, op, a, token) {
    await sleep(this.atraso);
    const uid = this.tokens.get(token) || null;
    if (op === 'auth.entrar') {
      const u = [...this.users.values()].find((x) => x.email === String(a.email).toLowerCase());
      if (!u || u.senha !== a.password) return { data: null, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
      const t = 'tok_' + crypto.randomUUID();
      this.tokens.set(t, u.id);
      return { data: { session: { access_token: t, user: { id: u.id, email: u.email } } }, error: null };
    }
    if (op === 'auth.atualizar') {
      const u = this.users.get(uid);
      if (!u) return { data: null, error: { code: 'not_authenticated', status: 401, message: 'no session' } };
      if (a.password === u.senha) return { data: null, error: { code: 'same_password', status: 422, message: 'same' } };
      u.senha = a.password;
      return { data: { user: { id: u.id } }, error: null };
    }
    if (op === 'rt.inscrever') { this.assinantes.set(page, uid); return { data: {} }; }
    if (op === 'tabela') return this.tabela(a, uid);
    if (op === 'rpc') return this.rpc(a, uid);
    return { data: null, error: { message: 'op?' }, status: 400 };
  }
  falha() {
    if (this.falhar > 0) { this.falhar--; return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }; }
    return null;
  }
  tabela(q, uid) {
    const pick = (o, cols) => (!cols || cols === '*' ? clone(o) : Object.fromEntries(cols.split(',').map((c) => [c.trim(), clone(o[c.trim()])])));
    const passa = (r) => q.filtros.every(([t, c, v]) => (t === 'eq' ? r[c] === v : r[c] !== v));
    if (q.table === 'membros') {
      if (q.op !== 'select') return { data: null, error: { code: '42501', message: 'permission denied for table membros' }, status: 403 };
      if (!this.ehMembro(uid)) return { data: [], error: null, status: 200 };
      return { data: Object.values(this.membros).filter(passa).map((m) => pick({ user_id: null, email: null, convite_expira: null, ...m }, q.cols)), error: null, status: 200 };
    }
    if (q.op === 'select') {
      if (!this.ehMembro(uid)) return { data: q.um ? null : [], error: null, status: 200 };
      let rows = [...this.docs.values()].filter(passa).sort((x, y) => (x.col < y.col ? -1 : x.col > y.col ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      if (q.faixa) rows = rows.slice(q.faixa[0], q.faixa[1] + 1);
      rows = rows.map((r) => pick(r, q.cols));
      return { data: q.um ? rows[0] || null : rows, error: null, status: 200 };
    }
    const f = this.falha();
    if (f) return f;
    if (!this.ehMembro(uid)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "docs"' }, status: 403 };
    if (q.op === 'upsert') {
      const row = q.corpo;
      const k = `${row.col}/${row.id}`;
      const ex = this.docs.get(k);
      const r = { col: row.col, id: row.id, data: clone(row.data), versao: ex ? ex.versao + 1 : 1 };
      this.docs.set(k, r);
      this.emitir({ eventType: ex ? 'UPDATE' : 'INSERT', new: clone(r), old: ex ? clone(ex) : {} });
      const out = pick(r, q.retorno || 'data,versao');
      return { data: q.um ? out : [out], error: null, status: 201 };
    }
    if (q.op === 'delete') {
      for (const r of [...this.docs.values()].filter(passa)) {
        this.docs.delete(`${r.col}/${r.id}`);
        this.emitir({ eventType: 'DELETE', old: { col: r.col, id: r.id }, new: {} });
      }
      return { data: null, error: null, status: 204 };
    }
    return { data: null, error: { message: 'op?' }, status: 400 };
  }
  rpc({ nome, args }, uid) {
    const f = this.falha();
    if (f) return f;
    if (nome === 'doc_atualiza') {
      const k = `${args.p_col}/${args.p_id}`;
      const ex = this.docs.get(k);
      if (!this.ehMembro(uid) || !ex) return { data: null, error: null, status: 200 };
      const r = { ...ex, data: mescla(ex.data, args.p_dados), versao: ex.versao + 1 };
      this.docs.set(k, r);
      this.emitir({ eventType: 'UPDATE', new: clone(r), old: clone(ex) });
      return { data: { data: clone(r.data), versao: r.versao }, error: null, status: 200 };
    }
    if (nome === 'pega_trava') {
      if (!this.ehMembro(uid)) return { data: null, error: { code: '42501', message: 'permission denied' }, status: 403 };
      const t = this.travas.get(args.p_caminho);
      const agora = Date.now();
      if (!t || t.expira < agora || t.dono === args.p_dono) { this.travas.set(args.p_caminho, { dono: args.p_dono, expira: agora + args.p_ms }); return { data: true, error: null, status: 200 }; }
      return { data: false, error: null, status: 200 };
    }
    return { data: null, error: { message: 'função?' }, status: 404 };
  }
  async funcao(route) {
    const req = route.request();
    const json = (status, obj) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: CORS, body: 'ok' });
    await sleep(this.atraso);
    const nome = new URL(req.url()).pathname.split('/').pop();
    const corpo = JSON.parse(req.postData() || '{}');
    const uid = this.tokens.get((req.headers().authorization || '').replace(/^Bearer\s+/i, '')) || null;
    if (nome === 'ler-conversa') return json(501, { code: 'sampling_disabled' });
    if (nome !== 'acesso') return json(404, { erro: 'nada' });
    if (corpo.acao === 'convite') {
      if (!uid) return json(401, { erro: 'sessao' });
      if (!this.ehMembro(uid)) return json(403, { erro: 'sem_acesso' });
      const codigo = this.convite(corpo.socio);
      return json(200, { codigo, expira: this.membros[corpo.socio].convite_expira });
    }
    if (corpo.acao !== 'primeiro-acesso') return json(400, { erro: 'acao' });
    const codigo = normCodigo(corpo.codigo);
    const email = String(corpo.email || '').trim().toLowerCase();
    const senha = String(corpo.senha || '');
    if (!codigo) return json(400, { erro: 'codigo' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { erro: 'email' });
    if (senha.length < 8) return json(400, { erro: 'senha' });
    const m = Object.values(this.membros).find((x) => x.convite_hash === sha(codigo));
    if (!m || new Date(m.convite_expira).getTime() < Date.now()) return json(400, { erro: 'codigo' });
    if (Object.values(this.membros).some((x) => x.socio !== m.socio && x.email === email)) return json(400, { erro: 'email_em_uso' });
    let id = m.user_id;
    if (id) Object.assign(this.users.get(id), { email, senha });
    else id = this.usuario(email, senha, null);
    Object.assign(m, { user_id: id, email, convite_hash: null, convite_expira: null });
    return json(200, { ok: true, socio: m.socio });
  }
}

/* ───────── preparação ───────── */
const fake = new Fake();
fake.semear(seed);
fake.usuario('rafael@prisma.teste', 'senha-do-rafael', 'rafael');
let codPedro = fake.convite('pedro');
fake.usuario('intruso@fora.teste', 'senha-do-intruso', null);
const server = await servir();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
let passes = 0;
const erros = [];
function ok(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); } else { fails++; console.log('  ✗ ' + msg); }
}
async function abrir({ viewport = { width: 1440, height: 900 }, colorScheme = 'light', isMobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', colorScheme, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route('**/vendor/supabase-*.js', (r) => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: FAKE }));
  await ctx.route(`${SB}/functions/v1/**`, (r) => fake.funcao(r));
  await ctx.exposeBinding('__srv', (src, op, a, token) => fake.handle(src.page, op, a, token));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|status of 400/.test(m.text())) erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  await page.goto(server.url + '/');
  await page.waitForSelector('.auth-box h1, #meChip b', { timeout: 5000 });
  return { ctx, page };
}
const noApp = (page) => page.waitForFunction(() => !document.body.classList.contains('auth-on') && document.querySelector('#meChip b'), null, { timeout: 8000 }).then(() => true).catch(() => false);
const olhar = (page, p) => page.evaluate((x) => window.__prismaRuntime.olhar(x), p);
const esperar = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(80); } return false; };
const ir = (page, r) => page.evaluate((x) => (location.hash = x), r);

/* ───────── 1. entrada do Rafael ───────── */
console.log('\n1) Tela de entrada e login');
const A = await abrir();
{
  const { page } = A;
  ok(await page.isVisible('#auth .auth-box h1'), 'abre na tela de entrada');
  ok(!(await page.isVisible('#app')), 'o CRM fica escondido antes do login');
  ok((await page.textContent('.auth-t')) === 'Entrar', 'título "Entrar"');
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${ROOT}/shots/vercel-entrar.png` });
  await page.fill('#a_email', 'rafael@prisma.teste');
  await page.fill('#a_senha', 'errada-123');
  await page.click('.auth-btn');
  await page.waitForSelector('[data-erro]:not([hidden])');
  ok((await page.textContent('[data-erro]')) === 'E-mail ou senha incorretos.', 'senha errada mostra o aviso certo');
  await page.click('[data-ver]');
  ok((await page.getAttribute('#a_senha', 'type')) === 'text', 'botão Mostrar revela a senha');
  await page.fill('#a_senha', 'senha-do-rafael');
  await page.click('.auth-btn');
  ok(await noApp(page), 'entra no CRM com e-mail e senha');
  ok((await page.textContent('#meChip b')) === 'Rafael', 'o CRM sabe que é o Rafael, sem perguntar');
  ok(!(await page.$('#auth')), 'tela de entrada sai da página');
  ok(await esperar(async () => (await page.textContent('#sync span')) === 'Sincronizado'), 'indicador mostra Sincronizado');
  const est = await page.evaluate(() => window.__prismaRuntime.estado());
  ok(est.pronto && est.aoVivo && est.docs >= 113, `carregou os ${est.docs} documentos e está ao vivo`);
  ok(!(await page.isVisible('.modal-wrap')), 'não pergunta "quem é você"');
}

/* ───────── 2. primeiro acesso do Pedro ───────── */
console.log('\n2) Primeiro acesso com código');
const B = await abrir();
{
  const { page } = B;
  await page.click('[data-ir-codigo]');
  ok((await page.textContent('.auth-t')) === 'Criar senha com o código', 'abre a tela do código');
  await page.type('#c_codigo', 'abcd ef23gh45');
  ok((await page.inputValue('#c_codigo')) === 'ABCD-EF23-GH45', 'código ganha maiúsculas e traços enquanto digita');
  await page.fill('#c_email', 'pedro@prisma.teste');
  await page.fill('#c_senha', 'senha-do-pedro');
  await page.click('.auth-btn');
  await page.waitForSelector('[data-erro]:not([hidden])');
  ok((await page.textContent('[data-erro]')).startsWith('Código inválido ou vencido'), 'código errado é recusado');
  ok(await page.evaluate(() => document.querySelector('#c_codigo').closest('.field').classList.contains('bad')), 'campo do código fica marcado');
  await page.fill('#c_codigo', codPedro);
  await page.fill('#c_senha', '1234');
  await page.click('.auth-btn');
  ok((await page.textContent('[data-erro]')).includes('8 caracteres'), 'senha curta é recusada antes de enviar');
  await page.fill('#c_senha', 'senha-do-pedro');
  await page.click('.auth-btn');
  ok(await noApp(page), 'cria a senha e já entra no CRM');
  ok((await page.textContent('#meChip b')) === 'Pedro', 'entra como Pedro');
  ok(fake.membros.pedro.email === 'pedro@prisma.teste' && !fake.membros.pedro.convite_hash, 'conta ligada ao sócio e código gasto');
}

/* ───────── 3. tempo real entre os dois ───────── */
console.log('\n3) O que um registra aparece para o outro');
let idLead;
{
  const a = A.page;
  const b = B.page;
  await ir(a, 'funil');
  await ir(b, 'funil');
  await a.click('#newBtn');
  await a.click('#menuPop button:has-text("Lead")');
  await a.waitForSelector('.drawer [data-form]');
  const fid = await a.$eval('.drawer [data-form]', (e) => e.dataset.form);
  await a.fill(`#${fid}_empresa`, 'Tempo Real Ltda');
  await a.fill(`#${fid}_contato`, 'Lívia');
  await a.click('.drawer [data-save]');
  ok(await esperar(async () => [...fake.docs.values()].some((d) => d.col === 'leads' && d.data.empresa === 'Tempo Real Ltda')), 'lead salvo no banco');
  idLead = [...fake.docs.values()].find((d) => d.col === 'leads' && d.data.empresa === 'Tempo Real Ltda').id;
  ok(await esperar(async () => !!(await b.$(`.lcard[data-id="${idLead}"]`)), 2000), 'aparece no funil do Pedro em menos de 2 s');
  ok((await olhar(b, `leads/${idLead}`)).criadoPor === 'rafael', 'chega com o autor certo');
  await b.click(`.lcard[data-id="${idLead}"]`);
  await b.waitForSelector('.drawer .step[data-stage="contato"]');
  await b.click('.drawer .step[data-stage="contato"]');
  ok(await esperar(async () => (await olhar(a, `leads/${idLead}`))?.etapa === 'contato'), 'Pedro muda a etapa e o Rafael vê');
  ok(await esperar(async () => !!(await a.$(`.kcol[data-stage="contato"] .lcard[data-id="${idLead}"]`))), 'o cartão muda de coluna na tela do Rafael');
  await b.keyboard.press('Escape');
  await a.evaluate((id) => window.__prismaRuntime.db.collection('leads').doc(id).delete(), idLead);
  ok(await esperar(async () => !(await b.$(`.lcard[data-id="${idLead}"]`))), 'apagado por um, some para o outro');
}

/* ───────── 4. falha ao salvar ───────── */
console.log('\n4) Se o servidor falhar, a tela volta ao que estava');
{
  const a = A.page;
  const alvo = 'leads/ld_demo_movimento';
  const antes = (await olhar(a, alvo)).etapa;
  fake.falhar = 2; // a primeira tentativa e a repetição automática
  await a.click('.lcard[data-id="ld_demo_movimento"]');
  await a.waitForSelector('.drawer .step[data-stage="diagnostico"]');
  await a.click('.drawer .step[data-stage="diagnostico"]');
  ok(await esperar(async () => /Não foi possível salvar/.test((await a.textContent('#toasts')) || '')), 'avisa que não salvou');
  ok(await esperar(async () => (await olhar(a, alvo)).etapa === antes), 'a etapa volta para a que estava');
  ok(fake.docs.get(alvo).data.etapa === antes, 'nada mudou no banco');
  fake.falhar = 0;
  await a.keyboard.press('Escape');
}

/* ───────── 5. queda e volta da conexão ───────── */
console.log('\n5) Reconexão busca o que mudou');
{
  const a = A.page;
  const b = B.page;
  await b.evaluate(() => window.__fakeRt.cair());
  ok(await esperar(async () => (await b.textContent('#sync span')) === 'Reconectando…'), 'indicador mostra Reconectando…');
  await a.evaluate(() => window.__prismaRuntime.db.collection('tarefas').doc('tf_teste_reconexao').set({ titulo: 'Criada sem o Pedro ver', prazo: '2026-11-20', feita: false, responsavel: 'pedro', criadoEm: new Date().toISOString() }));
  await a.evaluate(() => window.__prismaRuntime.db.collection('clientes').doc('cl_demo_mendes').delete());
  await sleep(300);
  ok(!(await olhar(b, 'tarefas/tf_teste_reconexao')), 'sem conexão, o Pedro ainda não tem a tarefa');
  await b.evaluate(() => window.__fakeRt.voltar());
  ok(await esperar(async () => !!(await olhar(b, 'tarefas/tf_teste_reconexao'))), 'ao voltar, a tarefa aparece');
  ok(await esperar(async () => !(await olhar(b, 'clientes/cl_demo_mendes'))), 'e o cliente apagado some');
  ok(await esperar(async () => (await b.textContent('#sync span')) === 'Sincronizado'), 'indicador volta para Sincronizado');
}

/* ───────── 6. conta, convite e senha nova ───────── */
console.log('\n6) Ajustes: conta, código para o sócio e senha nova');
{
  const a = A.page;
  const b = B.page;
  await ir(a, 'ajustes');
  await a.waitForSelector('#aj_me .conta');
  ok((await a.textContent('#aj_me')).includes('rafael@prisma.teste'), 'mostra a conta de quem entrou');
  ok(await esperar(async () => (await a.textContent('#aj_acesso')).includes('pedro@prisma.teste')), 'lista o Pedro com o e-mail dele');
  await a.screenshot({ path: `${ROOT}/shots/vercel-ajustes.png`, fullPage: false });
  await a.click('#aj_acesso [data-convite="pedro"]');
  await a.waitForSelector('.modal .codigo-grande');
  const novo = (await a.textContent('.modal .codigo-grande')).trim();
  ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(novo), `gera um código no formato certo (${novo})`);
  ok(fake.membros.pedro.convite_hash === sha(novo), 'o banco guarda só o hash do código');
  ok(await a.isVisible('.modal-f button:has-text("Mandar no WhatsApp")'), 'oferece mandar pelo WhatsApp');
  await a.screenshot({ path: `${ROOT}/shots/vercel-codigo.png` });
  await a.click('.modal-f button:has-text("Fechar")');

  await ir(b, 'ajustes');
  await b.waitForSelector('#aj_me [data-sair]');
  await b.click('#aj_me [data-sair]');
  await b.click('.modal-f button:has-text("Sair")');
  await b.waitForSelector('#auth .auth-box h1', { timeout: 5000 });
  ok((await b.textContent('.auth-t')) === 'Entrar', 'Sair volta para a tela de entrada');
  ok((await b.inputValue('#a_email')) === 'pedro@prisma.teste', 'o e-mail fica lembrado');
  await b.click('[data-ir-codigo]');
  await b.fill('#c_codigo', novo);
  await b.fill('#c_email', 'pedro@prisma.teste');
  await b.fill('#c_senha', 'senha-nova-do-pedro');
  await b.click('.auth-btn');
  ok(await noApp(b), 'com o código novo, o Pedro cria outra senha e entra');
  await b.evaluate(() => window.PrismaHost.sair());
  await b.waitForSelector('#a_senha');
  await b.fill('#a_senha', 'senha-do-pedro');
  await b.click('.auth-btn');
  await b.waitForSelector('[data-erro]:not([hidden])');
  ok(true, 'a senha antiga deixa de valer');
  await b.fill('#a_senha', 'senha-nova-do-pedro');
  await b.click('.auth-btn');
  ok(await noApp(b), 'a senha nova funciona');

  await a.click('#aj_me [data-senha]');
  await a.fill('#ts_1', 'outra-senha-rafa');
  await a.fill('#ts_2', 'outra-senha-rafx');
  await a.click('.modal-f button:has-text("Salvar senha")');
  ok((await a.textContent('#ts_err')).includes('não estão iguais'), 'trocar senha confere a repetição');
  await a.fill('#ts_2', 'outra-senha-rafa');
  await a.click('.modal-f button:has-text("Salvar senha")');
  ok(await esperar(async () => /Senha trocada/.test(await a.textContent('#toasts'))), 'senha trocada');
  ok([...fake.users.values()].find((u) => u.email === 'rafael@prisma.teste').senha === 'outra-senha-rafa', 'senha nova gravada na conta');
}

/* ───────── 7. conta sem acesso e sessão guardada ───────── */
console.log('\n7) Conta sem acesso e sessão guardada');
{
  const C = await abrir();
  const c = C.page;
  await c.fill('#a_email', 'intruso@fora.teste');
  await c.fill('#a_senha', 'senha-do-intruso');
  await c.click('.auth-btn');
  await c.waitForSelector('.auth-aviso');
  ok((await c.textContent('.auth-aviso')).startsWith('Esta conta não tem acesso'), 'quem não é sócio fica de fora');
  ok(!(await c.evaluate(() => !!window.__prismaRuntime)), 'o CRM nem começa para quem não é sócio');
  await C.ctx.close();

  const a = A.page;
  await a.reload();
  ok(await noApp(a), 'recarregar a página entra direto, sem pedir senha');
  ok((await a.textContent('#meChip b')) === 'Rafael', 'continua como Rafael');
}

/* ───────── 8. celular e tema escuro ───────── */
console.log('\n8) Celular e tema escuro');
{
  const M = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true });
  await M.page.waitForTimeout(1300);
  const larg = await M.page.evaluate(() => document.querySelector('#auth').scrollWidth);
  ok(larg <= 390, 'tela de entrada cabe no celular sem rolar para o lado');
  ok(await M.page.isVisible('.auth-btn'), 'botão Entrar visível no celular');
  await M.page.screenshot({ path: `${ROOT}/shots/vercel-entrar-celular.png` });
  await M.page.click('[data-ir-codigo]');
  await M.page.screenshot({ path: `${ROOT}/shots/vercel-codigo-celular.png` });
  await M.ctx.close();
  const D = await abrir({ colorScheme: 'dark' });
  await D.page.waitForTimeout(1300);
  await D.page.screenshot({ path: `${ROOT}/shots/vercel-entrar-escuro.png` });
  const fundo = await D.page.evaluate(() => getComputedStyle(document.querySelector('.auth-main')).backgroundColor + '|' + getComputedStyle(document.querySelector('.auth')).backgroundColor);
  ok(!fundo.includes('255, 255, 255'), `tema escuro na tela de entrada (${fundo})`);
  await D.ctx.close();
}

await browser.close();
await server.fechar();
const csp = erros.filter((e) => /Content Security Policy|Refused to/i.test(e));
console.log(`\n${passes} ok, ${fails} falhas`);
console.log(csp.length ? 'CSP bloqueou: ' + csp.join(' | ') : 'CSP sem bloqueios');
console.log(erros.length ? 'erros no console:\n  ' + erros.join('\n  ') : 'sem erros no console');
process.exit(fails || erros.length ? 1 : 0);
