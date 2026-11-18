// Testes: leads a partir das conversas exportadas do WhatsApp (txt do Android e zip do iPhone).
import { chromium } from 'playwright';
import fs from 'node:fs';
import zlib from 'node:zlib';
const ROOT = '/home/claude/prisma-crm';
const seedBase = JSON.parse(fs.readFileSync(`${ROOT}/test/seed.json`, 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// os dados de exemplo são de 16/11/2026: o relógio do navegador fica parado nesse dia
const AGORA = new Date('2026-11-16T15:00:00Z');
const today = iso(new Date(AGORA));
const addDays = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); d.setDate(d.getDate() + n); return iso(d); };

/* zip no formato do iPhone (tamanhos no descritor depois dos dados) */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0808, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(0, 18); lh.writeUInt32LE(0, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const dd = Buffer.alloc(16);
    dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(comp.length, 8); dd.writeUInt32LE(data.length, 12);
    locals.push(lh, name, comp, dd);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0808, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length + 16;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const marina = `16/10/2026 09:12 - As mensagens e as chamadas são protegidas com a criptografia de ponta a ponta. Somente as pessoas que fazem parte da conversa podem ler, ouvir ou compartilhar esse conteúdo.
16/10/2026 09:12 - Marina Sorriso: Oi Pedro! Aqui é a Marina, da Clínica Odonto Bem Estar. Queria um site com agendamento online
16/10/2026 09:30 - Pedro Prisma: Oi Marina! Claro, posso te fazer umas perguntas?
16/10/2026 09:31 - Marina Sorriso: Pode sim
quero que os pacientes marquem sozinhos
02/11/2026 14:05 - Pedro Prisma: Segue a proposta: site com agendamento por R$ 4.800
02/11/2026 14:20 - Marina Sorriso: Achei um pouco caro, vou ver com meu sócio
02/11/2026 14:21 - Marina Sorriso: <Mídia oculta>
10/11/2026 10:00 - Pedro Prisma: Oi Marina, conseguiu ver com seu sócio?`;
const otica = `[05/11/2026, 18:40:12] +55 11 97777-6666: Boa noite, vocês fazem automação de WhatsApp?
[05/11/2026, 18:45:03] Pedro Prisma: Fazemos sim! Qual o seu negócio?
[05/11/2026, 18:47:55] +55 11 97777-6666: Tenho uma ótica, Ótica Nova Visão
‎[05/11/2026, 18:48:10] +55 11 97777-6666: ‎áudio ocultado`;
const lucia = `14/11/2026 11:00 - Pedro Prisma: Oi Lúcia, te mandei os exemplos de cardápio digital
15/11/2026 16:30 - Lúcia Ferraz: Gostei! Me manda a proposta`;
const mae = `10/11/2026 20:00 - Mãe: Filho, vem almoçar domingo?
10/11/2026 20:05 - Pedro Prisma: Vou sim mãe`;
const movimento = `12/11/2026 08:00 - Carla Movimento: Bom dia, queria saber do site da academia
12/11/2026 08:10 - Pedro Prisma: Bom dia Carla! Te ligo amanhã`;

const respostas = `(p) => {
  const hoje = '${today}';
  const mais = (n) => { const d = new Date(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10)); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  if (p.includes('Marina Sorriso')) return { ehLead: true, empresa: 'Clínica Odonto Bem Estar', contato: 'Marina', servicos: ['site'], valor: 4800, origem: 'WhatsApp', etapa: 'negociacao', proximoContato: mais(2), proximaAcao: 'Cobrar o retorno da proposta', resumo: 'Marina quer um site com agendamento online. A proposta de R$ 4.800 foi enviada e ela achou caro; vai ver com o sócio.', marcos: [{ data: '2026-10-16', texto: 'Pediu um site com agendamento online' }, { data: '2026-11-02', texto: 'Recebeu a proposta de R$ 4.800 e achou caro' }] };
  if (p.includes('97777-6666')) return { ehLead: true, empresa: 'Ótica Nova Visão', contato: '', telefone: '', servicos: ['automacao'], valor: null, etapa: 'contato', proximoContato: hoje, proximaAcao: 'Entender o volume de atendimentos', resumo: 'Ótica quer automatizar o atendimento no WhatsApp.', marcos: [{ data: '2026-11-05', texto: 'Perguntou sobre automação de WhatsApp' }] };
  if (p.includes('Lúcia Ferraz')) return { ehLead: true, empresa: 'Restaurante Sabor da Serra', contato: 'Lúcia Ferraz', servicos: ['site'], valor: 3200, etapa: 'proposta', proximoContato: mais(3), proximaAcao: 'Ligar para fechar', resumo: 'Gostou dos exemplos de cardápio digital e pediu a proposta.', marcos: [{ data: '2026-11-15', texto: 'Gostou dos exemplos e pediu a proposta' }] };
  if (p.includes('Carla Movimento')) return { ehLead: true, empresa: 'Academia Movimento Fit', contato: 'Carla', servicos: ['site'], valor: 2500, etapa: 'contato', proximoContato: mais(1), proximaAcao: 'Ligar para a Carla', resumo: 'Carla quer um site para a academia.', marcos: [{ data: '2026-11-12', texto: 'Pediu informações do site' }] };
  return { ehLead: false };
}`;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
let passes = 0;
const errors = [];
function ok(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); }
  else { fails++; console.log('  ✗ ' + msg); }
}
async function open({ viewport = { width: 1440, height: 900 }, socio = 'pedro' } = {}) {
  const seed = JSON.parse(JSON.stringify(seedBase));
  seed.__prefs = { socio };
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  await ctx.clock.setFixedTime(AGORA);
  await ctx.addInitScript({ content: `window.__MOCK_SEED__ = ${JSON.stringify(seed)}; window.__mockSampleReply = ${respostas};` });
  await ctx.addInitScript({ path: `${ROOT}/test/mock.js` });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|net::|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.goto(`file://${ROOT}/dist/index.html#funil`);
  await page.waitForTimeout(2200);
  return { ctx, page };
}
const db = (page, path) => page.evaluate((p) => { const v = window.__mockStore.get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, path);
const dbAll = (page, col) => page.evaluate((c) => { const out = []; for (const [p, v] of window.__mockStore) { const seg = p.split('/'); if (seg.length === 2 && seg[0] === c) out.push({ id: seg[1], ...v }); } return out; }, col);
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const arq = (name, data, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') });

console.log('\n1) Importar várias conversas');
{
  const { page } = await open();
  await page.click('[data-conversas-abrir]');
  await settle(page);
  ok(await page.isVisible('.cv-passos'), 'drawer explica como exportar a conversa no WhatsApp');
  await page.screenshot({ path: `${ROOT}/shots/conversas-inicio.png` });
  await page.setInputFiles('input[data-conversas]', [
    arq('Conversa do WhatsApp com Marina Sorriso.txt', marina),
    arq('WhatsApp Chat - +55 11 97777-6666.zip', zip([{ name: '_chat.txt', data: otica }]), 'application/zip'),
    arq('Conversa do WhatsApp com Lúcia Ferraz.txt', lucia),
    arq('Conversa do WhatsApp com Mãe.txt', mae),
    arq('notas.txt', 'lista de compras\npão\nleite'),
  ]);
  await page.waitForSelector('.cv-card', { timeout: 8000 });
  await settle(page, 300);
  const calls = await page.evaluate(() => window.__sampleCalls);
  ok(calls.length === 4, `o Claude leu as 4 conversas válidas (${calls.length})`);
  const pm = calls.find((c) => c.includes('Marina Sorriso')) || '';
  ok(pm.includes('Lado da Prisma: Pedro Prisma') && pm.includes('Participantes (número de mensagens): Marina Sorriso (4), Pedro Prisma (3)') && pm.includes('quero que os pacientes marquem sozinhos'), 'pedido ao Claude identifica quem é da Prisma e junta mensagens de várias linhas');
  ok(!pm.includes('criptografia') && pm.includes('[mídia]'), 'avisos do WhatsApp saem e mídia vira [mídia]');
  const po = calls.find((c) => c.includes('97777-6666')) || '';
  ok(po.includes('05/11/2026 18:47 +55 11 97777-6666: Tenho uma ótica') && po.includes('[mídia]'), 'zip do iPhone lido (formato [data, hora] e caracteres invisíveis)');
  const cards = await page.$$eval('.cv-card', (cs) => cs.map((c) => ({ t: c.querySelector('h3').textContent, a: c.querySelector('[data-cv-acao]').value, off: c.classList.contains('off') })));
  ok(cards.length === 4, `4 cartões para conferir (${cards.map((c) => c.t).join(', ')})`);
  ok(cards.find((c) => c.t === 'Marina Sorriso').a === 'criar' && cards.find((c) => c.t === 'Lúcia Ferraz').a === 'atualizar:ld_demo_sabor', 'lead novo para a Marina e atualização para o lead que já existia');
  ok(cards.find((c) => c.t === 'Mãe').a === 'ignorar' && cards.find((c) => c.t === 'Mãe').off, 'conversa pessoal vem marcada para ignorar');
  ok((await page.textContent('.cv-root .banner.b-gray')).includes('notas.txt'), 'arquivo que não é conversa fica de fora, com aviso');
  const fo = await page.$eval('.cv-card:nth-of-type(2) [id$="_telefone"]', (i) => i.value).catch(() => '');
  const telOtica = await page.evaluate(() => { const c = [...document.querySelectorAll('.cv-card')].find((x) => x.querySelector('h3').textContent.includes('97777')); return c ? c.querySelector('[id$="_telefone"]').value : ''; });
  ok(telOtica === '+55 11 97777-6666', 'telefone vem do nome do contato não salvo');
  ok((await page.textContent('[data-cv-salvar]')).trim() === 'Salvar 3 leads', 'botão conta o que vai ser salvo');
  await page.screenshot({ path: `${ROOT}/shots/conversas-revisao.png` });
  // ajuste feito na conferência vale
  await page.evaluate(() => { const c = [...document.querySelectorAll('.cv-card')].find((x) => x.querySelector('h3').textContent.includes('97777')); c.querySelector('[id$="_contato"]').value = 'Rogério'; });
  await page.click('[data-cv-salvar]');
  await settle(page, 1200);
  const leads = await dbAll(page, 'leads');
  const ma = leads.find((l) => l.empresa === 'Clínica Odonto Bem Estar');
  ok(ma && ma.etapa === 'negociacao' && ma.valor === 4800 && ma.servicos.join() === 'site' && ma.responsavel === 'pedro' && ma.origem === 'WhatsApp', 'lead da Marina criado com etapa, valor, interesse, dono e origem');
  ok(ma && ma.criadoEm.slice(0, 10) === '2026-10-16' && ma.etapaDesde === '2026-11-10' && ma.proximoContato === addDays(today, 2), 'datas da conversa: primeiro contato, última mensagem e próximo contato');
  ok(ma && ma.historico.filter((h) => h.tipo === 'whatsapp').map((h) => h.data.slice(0, 10)).join() === '2026-10-16,2026-11-02' && ma.historico.some((h) => h.tipo === 'nota' && h.texto.includes('achou caro')) && ma.notas.includes('Resumo'), 'momentos da conversa no histórico, com as datas reais, e resumo nas observações');
  const ot = leads.find((l) => l.empresa === 'Ótica Nova Visão');
  ok(ot && ot.telefone === '+55 11 97777-6666' && ot.contato === 'Rogério' && ot.servicos.join() === 'automacao', 'lead da ótica com o telefone e o ajuste feito na conferência');
  const sb = await db(page, 'leads/ld_demo_sabor');
  ok(sb.etapa === 'proposta' && sb.valor === 3200 && sb.proximoContato === addDays(today, 3) && sb.proximaAcao === 'Ligar para fechar', 'lead existente avançou de etapa e ganhou valor e próximo passo');
  ok(sb.historico.some((h) => h.tipo === 'etapa' && h.texto.includes('pela conversa do WhatsApp')) && sb.historico.some((h) => h.tipo === 'whatsapp' && h.texto.includes('pediu a proposta')), 'histórico do lead existente registra a mudança e o que foi conversado');
  ok(!leads.some((l) => /m[ãa]e/i.test(l.empresa + l.contato)), 'conversa pessoal não virou lead');
  const lg = await db(page, 'automacoes/log');
  ok(lg && lg.itens.some((x) => x.tipo === 'conversas' && x.txt.includes('2 leads novos') && x.txt.includes('1 lead atualizado')), 'importação aparece no histórico do piloto');

  console.log('\n2) Importar de novo e sem o Claude');
  await page.click('[data-conversas-abrir]');
  await settle(page);
  await page.evaluate(() => { window.__mockSampleFail = { code: 'not_granted', message: 'negado' }; });
  await page.setInputFiles('input[data-conversas]', [arq('Conversa do WhatsApp com Marina Sorriso.txt', marina)]);
  await page.waitForSelector('.cv-card', { timeout: 8000 });
  ok((await page.$eval('[data-cv-acao]', (s) => s.value)) === `atualizar:${ma.id}`, 'a mesma conversa importada de novo atualiza o lead criado antes');
  ok((await page.textContent('.cv-root .banner.b-warn')).includes('não foi autorizado') && (await page.textContent('.cv-ht small')).includes('lido sem o Claude'), 'sem autorização do Claude, avisa e preenche o básico');
  const etapaLocal = await page.$eval('.cv-card [id$="_etapa"]', (s) => s.value);
  ok(etapaLocal === 'negociacao', 'leitura básica não faz o lead voltar de etapa');
  await page.click('[data-cv-fechar]');
  await settle(page);
  await page.evaluate(() => { window.__mockSampleFail = null; });

  console.log('\n3) Atualizar um lead pela conversa');
  await page.click('.lcard[data-id="ld_demo_movimento"]');
  await settle(page);
  await page.click('.drawer [data-cv-lead]');
  await settle(page);
  ok((await page.textContent('#drawer_t')).includes('Academia Movimento Fit'), 'a importação abre já ligada ao lead');
  await page.setInputFiles('input[data-conversas]', [arq('Conversa do WhatsApp com Carla Movimento.txt', movimento)]);
  await page.waitForSelector('.cv-card', { timeout: 8000 });
  ok((await page.$eval('[data-cv-acao]', (s) => s.value)) === 'atualizar:ld_demo_movimento', 'conversa vai direto para o lead aberto');
  await page.click('[data-cv-salvar]');
  await settle(page, 900);
  const mv = await db(page, 'leads/ld_demo_movimento');
  ok(mv.valor === 2500 && mv.proximoContato === addDays(today, 1) && mv.historico.some((h) => h.texto.includes('Pediu informações do site')), 'lead atualizado com valor, próximo contato e histórico');
}

console.log('\n4) No celular');
{
  const { page } = await open({ viewport: { width: 390, height: 844 } });
  await page.click('#fab');
  await page.click('#menuPop button:has-text("Leads das conversas do WhatsApp")');
  await settle(page);
  await page.screenshot({ path: `${ROOT}/shots/conversas-cel-inicio.png` });
  await page.setInputFiles('input[data-conversas]', [arq('Conversa do WhatsApp com Marina Sorriso.txt', marina), arq('Conversa do WhatsApp com Mãe.txt', mae)]);
  await page.waitForSelector('.cv-card', { timeout: 8000 });
  await settle(page, 300);
  const over = await page.evaluate(() => [...document.querySelectorAll('.cv-card')].some((c) => c.scrollWidth > c.clientWidth + 1) || document.querySelector('.drawer-b').scrollWidth > document.querySelector('.drawer-b').clientWidth + 1);
  ok(!over, 'conferência cabe na tela do celular');
  await page.screenshot({ path: `${ROOT}/shots/conversas-cel-revisao.png` });
}

console.log(`\n${passes} ok, ${fails} falhas`);
console.log(errors.length ? 'ERROS NO CONSOLE:\n' + errors.join('\n') : 'sem erros no console');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
