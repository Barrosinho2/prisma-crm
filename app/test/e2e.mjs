// Teste de ponta a ponta da interface, com o Supabase simulado.
// Uso: node test/e2e.mjs   (precisa de `npx vite build` antes)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { criarFalso } from './supabase-falso.mjs'

const PORTA = 4179
const BASE = `http://localhost:${PORTA}`
const FOTOS = new URL('../shots/', import.meta.url).pathname
mkdirSync(FOTOS, { recursive: true })
const falso = criarFalso()
const resultados = []
const ok = (nome, cond, extra = '') => { resultados.push({ nome, ok: !!cond, extra }); console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra ? ' — ' + extra : ''}`) }
const espera = ms => new Promise(r => setTimeout(r, ms))

const servidor = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORTA), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' })
await new Promise(r => { servidor.stdout.on('data', d => String(d).includes('localhost') && r()); setTimeout(r, 8000) })

const browser = await chromium.launch()
const erros = []
async function novaPagina(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...extra })
  await ctx.route(/supabase\.co/, r => falso.tratar(r))
  const page = await ctx.newPage()
  page.on('pageerror', e => erros.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push('console: ' + m.text()) })
  return { ctx, page }
}
const db = falso.db
const T = n => db[n] ?? []
const saldoConta = nome => {
  const c = T('fin_contas').find(x => x.nome === nome)
  let s = c.saldo_inicial_cents
  for (const l of T('fin_lancamentos')) if (l.conta_id === c.id && l.status === 'efetivado' && !l.compra_id) s += l.tipo === 'receita' ? l.valor_cents : -l.valor_cents
  for (const t of T('fin_transferencias')) if (!t.cancelada) { if (t.origem_id === c.id) s -= t.valor_cents; if (t.destino_id === c.id) s += t.valor_cents }
  for (const p of T('fin_pagamentos_fatura')) if (!p.cancelado && p.conta_id === c.id) s -= p.valor_cents
  for (const mv of T('fin_movimentos_meta')) {
    const m = T('fin_metas').find(x => x.id === mv.meta_id)
    if (mv.cancelado || !m?.conta_id || !mv.conta_id || m.conta_id === mv.conta_id) continue
    if (mv.tipo === 'aporte') { if (mv.conta_id === c.id) s -= mv.valor_cents; if (m.conta_id === c.id) s += mv.valor_cents }
  }
  return s
}

try {
  const { page } = await novaPagina({ width: 1440, height: 900 })
  // ---------- login ----------
  await page.goto(BASE)
  await page.getByLabel('E-mail').fill(falso.email)
  await page.getByLabel('Senha', { exact: true }).fill('errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  ok('login com senha errada mostra erro', await page.getByText('E-mail ou senha incorretos.').waitFor({ timeout: 8000 }).then(() => true).catch(() => false))
  await page.screenshot({ path: FOTOS + 'login.png' })
  await page.getByLabel('Senha', { exact: true }).fill(falso.senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByText('Disponível para gastar').first().waitFor({ timeout: 15000 })
  ok('entra e mostra o dashboard', true)
  ok('categorias padrão criadas', T('fin_categorias').length >= 6, String(T('fin_categorias').length) + ' ' + Object.keys(db).join(','))
  await espera(600)
  await page.screenshot({ path: FOTOS + 'dashboard-vazio.png', fullPage: true })

  // ---------- configuração inicial ----------
  await page.getByRole('button', { name: 'Configuração inicial' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Nome').fill('Conta principal')
  await dlg.getByLabel('Saldo hoje').fill('1.000,00')
  await dlg.getByRole('button', { name: 'Adicionar' }).click()
  await page.getByText('Conta adicionada.').waitFor()
  await dlg.getByLabel('Nome').fill('Reserva')
  await dlg.getByLabel('Tipo').selectOption('reserva')
  await dlg.getByLabel('Saldo hoje').fill('0')
  await dlg.getByRole('button', { name: 'Adicionar' }).click()
  await espera(500)
  ok('etapa 1: duas contas criadas', T('fin_contas').length === 2, T('fin_contas').map(c => `${c.nome}=${c.saldo_inicial_cents}`).join(', '))
  await dlg.getByRole('button', { name: 'Próxima etapa' }).click()
  await dlg.getByLabel('Salário total por mês').fill('2.500,00')
  await dlg.getByRole('combobox', { name: /^Dia do recebimento/ }).selectOption('5')
  await dlg.getByRole('button', { name: 'Salvar salário' }).click()
  await page.getByText(/Salário salvo/).waitFor()
  const sal = T('fin_recorrencias').find(r => r.tipo === 'receita')
  ok('etapa 2: salário recorrente criado', sal?.valor_cents === 250000 && sal.dia === 5)
  ok('salário gera previsões (não recebidas)', T('fin_lancamentos').filter(l => l.recorrencia_id === sal.id).length >= 1 && T('fin_lancamentos').every(l => l.status === 'pendente'))
  await dlg.getByLabel('Nome').fill('Internet')
  await dlg.getByLabel('Valor').fill('99,90')
  await dlg.getByRole('combobox', { name: /^Dia/ }).selectOption('10')
  await dlg.getByRole('button', { name: 'Adicionar' }).click()
  await page.getByText('Despesa fixa adicionada.').waitFor()
  await dlg.getByRole('button', { name: 'Próxima etapa' }).click()
  await dlg.getByLabel('Objetivo mensal').fill('300')
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Objetivo salvo.').waitFor()
  await dlg.getByRole('button', { name: 'Próxima etapa' }).click()
  await dlg.getByLabel('Nome').fill('Viagem')
  await dlg.getByLabel('Valor').fill('6.000,00')
  await dlg.getByRole('button', { name: 'Criar' }).click()
  await page.getByText('Meta criada.').waitFor()
  await dlg.getByRole('button', { name: 'Concluir' }).click()
  ok('configuração inicial completa', T('fin_metas').length === 1 && T('fin_config')[0]?.objetivo_economia_cents === 30000)

  // ---------- Teste 1: salário ----------
  ok('T1 saldo antes de confirmar = 1000,00', saldoConta('Conta principal') === 100000)
  await page.goto(BASE + '/a-pagar')
  await page.getByRole('tab', { name: /Receitas previstas/ }).click()
  const btnRecebido = page.getByRole('button', { name: 'Recebido' }).first()
  await btnRecebido.click()
  await page.getByText('Recebimento confirmado.').waitFor()
  ok('T1 saldo após confirmar = 3500,00', saldoConta('Conta principal') === 350000)
  await page.goto(BASE + '/contas')
  ok('T1 tela de contas mostra R$ 3.500,00', await page.getByText(/R\$\s3\.500,00/).first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false))

  // ---------- Teste 2: despesa ----------
  await page.goto(BASE + '/')
  await page.getByText('Disponível para gastar').first().waitFor()
  await page.keyboard.press('n')
  await page.getByRole('dialog').getByLabel('Valor').fill('100')
  await page.getByRole('dialog').getByLabel('Descrição').fill('Mercado')
  await page.getByRole('dialog').getByLabel('Categoria').selectOption({ label: 'Alimentação' })
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Transação registrada.').waitFor()
  ok('T2 despesa de R$ 100 reduz o saldo', saldoConta('Conta principal') === 340000)

  // ---------- Teste 3: transferência ----------
  await page.getByRole('button', { name: 'Nova transação' }).click()
  await page.getByRole('dialog').getByRole('tab', { name: 'Transferência' }).click()
  await page.getByRole('dialog').getByLabel('Valor').fill('200')
  await page.getByRole('dialog').getByRole('combobox', { name: /^De/ }).selectOption({ label: 'Conta principal' })
  await page.getByRole('dialog').getByRole('combobox', { name: /^Para/ }).selectOption({ label: 'Reserva' })
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Transferência registrada.').waitFor()
  ok('T3 patrimônio não muda', saldoConta('Conta principal') + saldoConta('Reserva') === 340000, `${saldoConta('Conta principal')} + ${saldoConta('Reserva')}`)
  ok('T3 transferência não vira lançamento', !T('fin_lancamentos').some(l => /transf/i.test(l.descricao)))

  // ---------- Teste 4: cartão ----------
  await page.goto(BASE + '/cartoes')
  await page.getByRole('button', { name: 'Cadastrar cartão' }).click()
  const dc = page.getByRole('dialog')
  await dc.getByLabel('Nome do cartão').fill('Cartão Teste')
  await dc.getByLabel('Limite total').fill('5.000,00')
  await dc.getByLabel('Dia de fechamento').selectOption('10')
  await dc.getByLabel('Dia de vencimento').selectOption('17')
  await dc.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Cartão cadastrado.').waitFor()
  await page.getByRole('button', { name: 'Nova compra' }).first().click()
  const dn = page.getByRole('dialog')
  await dn.getByLabel('Valor').fill('1.200,00')
  await dn.getByLabel('Descrição').fill('Notebook')
  await dn.getByLabel('Parcelas').selectOption('3')
  ok('T4 prévia da fatura aparece', await dn.getByText(/fatura que fecha em/).waitFor({ timeout: 4000 }).then(() => true).catch(() => false))
  await dn.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Compra registrada em 3x.').waitFor()
  const parc = T('fin_parcelas')
  ok('T4 três parcelas somando o total', parc.length === 3 && parc.reduce((a, p) => a + p.valor_cents, 0) === 120000)
  ok('T4 compra não criou despesa em conta', !T('fin_lancamentos').some(l => l.descricao === 'Notebook'))
  await espera(400)
  await page.screenshot({ path: FOTOS + 'cartoes.png', fullPage: true })
  await page.goto(BASE + '/transacoes')
  await page.getByPlaceholder(/Buscar/).fill('Notebook')
  ok('T4 compra aparece uma vez em transações', (await page.locator('table tbody tr').count()) === 1)

  // ---------- Teste 5: meta ----------
  const despAntes = T('fin_lancamentos').filter(l => l.tipo === 'despesa' && l.status === 'efetivado').length
  await page.goto(BASE + '/metas')
  await page.getByRole('button', { name: 'Guardar' }).last().click()
  await page.getByRole('dialog').getByLabel('Valor').fill('150')
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await page.getByText('Valor guardado na meta.').waitFor()
  ok('T5 aporte não vira despesa', T('fin_lancamentos').filter(l => l.tipo === 'despesa' && l.status === 'efetivado').length === despAntes)
  ok('T5 R$ 150 registrados na meta', T('fin_movimentos_meta').reduce((a, m) => a + m.valor_cents, 0) === 15000)
  await page.getByRole('button', { name: 'Retirar' }).last().click()
  await page.getByRole('dialog').getByLabel('Valor').fill('500')
  await page.getByRole('dialog').getByRole('button', { name: 'Retirar' }).click()
  ok('T5 retirada maior que o guardado é bloqueada', await page.getByRole('dialog').getByText(/A meta tem/).waitFor({ timeout: 4000 }).then(() => true).catch(() => false))
  await page.keyboard.press('Escape')

  // ---------- Teste 6: recorrência sem duplicar ----------
  for (let i = 0; i < 3; i++) { await page.reload(); await page.waitForLoadState('networkidle') }
  const net = T('fin_recorrencias').find(r => r.nome === 'Internet')
  const porMes = {}
  for (const l of T('fin_lancamentos').filter(l => l.recorrencia_id === net.id)) porMes[l.competencia] = (porMes[l.competencia] ?? 0) + 1
  ok('T6 assinatura sem cobrança duplicada no mês', Object.values(porMes).every(n => n === 1), JSON.stringify(porMes))

  // ---------- dashboard com dados ----------
  await page.goto(BASE + '/')
  await page.getByText('Disponível para gastar').first().waitFor()
  await espera(1200)
  const corpo = (await page.locator('main').innerText()).replace(/\u00a0/g, ' ')
  ok('dashboard: receita do mês R$ 2.500,00', corpo.includes('R$ 2.500,00'))
  await page.screenshot({ path: FOTOS + 'dashboard.png', fullPage: true })
  // ocultar valores
  await page.getByRole('button', { name: 'Ocultar valores' }).first().click()
  await espera(300)
  ok('ocultar valores esconde os números', (await page.locator('main').innerText()).includes('R$ ••••'))
  await page.getByRole('button', { name: 'Mostrar valores' }).first().click()

  // ---------- salário em partes (60% dia 5, 40% dia 20) ----------
  await page.goto(BASE + '/configuracoes')
  await page.getByRole('button', { name: 'Alterar' }).first().click()
  const ds = page.getByRole('dialog')
  await ds.getByRole('switch', { name: 'Recebo em mais de uma data' }).click()
  await page.screenshot({ path: FOTOS + 'salario-partes.png' })
  await ds.getByRole('button', { name: 'Salvar salário' }).click()
  await page.getByText(/Salário em partes salvo/).waitFor()
  const partesSal = T('fin_recorrencias').filter(r => r.tipo === 'receita' && r.ativa).sort((a, z) => a.dia - z.dia)
  ok('salário em partes: 60% dia 5 e 40% dia 20', partesSal.length === 2 && partesSal[0].dia === 5 && partesSal[0].valor_cents === 150000 && partesSal[1].dia === 20 && partesSal[1].valor_cents === 100000, partesSal.map(r => `${r.dia}:${r.valor_cents}`).join(' '))
  const porRecMes = {}
  for (const l of T('fin_lancamentos').filter(l => l.recorrencia_id && l.tipo === 'receita')) { const k = l.recorrencia_id + l.competencia; porRecMes[k] = (porRecMes[k] ?? 0) + 1 }
  const p2dez = T('fin_lancamentos').find(l => l.recorrencia_id === partesSal[1].id && l.competencia === '2026-12-01')
  const p1dez = T('fin_lancamentos').find(l => l.recorrencia_id === partesSal[0].id && l.competencia === '2026-12-01')
  ok('salário em partes: sem previsão duplicada e o já recebido não muda', Object.values(porRecMes).every(n => n === 1) && p2dez?.valor_cents === 100000 && p2dez.status === 'pendente' && p1dez?.status === 'efetivado' && p1dez.valor_cents === 250000, `${p1dez?.status}:${p1dez?.valor_cents} ${p2dez?.status}:${p2dez?.valor_cents}`)
  ok('salário em partes: resumo mostra as duas datas', await page.getByText(/60% dia 5/).waitFor({ timeout: 4000 }).then(() => true).catch(() => false))

  // ---------- Teste 8: todas as telas em 3 tamanhos ----------
  const rotas = ['/', '/transacoes', '/contas', '/cartoes', '/a-pagar', '/orcamentos', '/metas', '/calendario', '/relatorios', '/configuracoes']
  const tamanhos = [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }], ['celular', { width: 390, height: 844 }]]
  const tok = await page.evaluate(() => localStorage.getItem('financas-auth'))
  for (const [nome, vp] of tamanhos) {
    const { ctx, page: p } = await novaPagina(vp, nome === 'celular' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {})
    await p.goto(BASE + '/')
    await p.evaluate(t => localStorage.setItem('financas-auth', t), tok)
    for (const r of rotas) {
      await p.goto(BASE + r)
      await p.waitForLoadState('networkidle')
      await espera(900)
      const largura = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
      ok(`T8 ${nome} ${r} sem rolagem lateral`, largura[0] <= vp.width + 1 && largura[1] <= vp.width + 1, `${largura[0]}px / ${largura[1]}px`)
      await p.screenshot({ path: `${FOTOS}${nome}${r === '/' ? '-dashboard' : r.replace('/', '-')}.png`, fullPage: nome !== 'desktop' })
    }
    await ctx.close()
  }

  // relatórios: projeção e simulação
  await page.goto(BASE + '/relatorios')
  await page.getByRole('button', { name: 'Projeção e simulação' }).click()
  const antes = JSON.stringify(db)
  await page.getByLabel('E se eu economizar a mais por mês?').fill('200')
  await espera(500)
  ok('simulação não altera os dados', JSON.stringify(db) === antes)
  ok('simulação mostra linha simulada', await page.getByText('Com a simulação').waitFor({ timeout: 4000 }).then(() => true).catch(() => false))
  await page.screenshot({ path: FOTOS + 'projecao.png', fullPage: true })

  // exportação
  await page.goto(BASE + '/transacoes')
  await page.getByRole('button', { name: 'Exportar' }).click()
  const [down] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'CSV' }).click()])
  ok('exporta CSV', (await down.suggestedFilename()).endsWith('.csv'))
  await page.getByRole('button', { name: 'Exportar' }).click()
  const [down2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('menuitem', { name: 'Excel (.xlsx)' }).click()])
  ok('exporta Excel', (await down2.suggestedFilename()).endsWith('.xlsx'))
  await page.getByRole('button', { name: 'Exportar' }).click()
  const [down3] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('menuitem', { name: 'PDF' }).click()])
  ok('exporta PDF', (await down3.suggestedFilename()).endsWith('.pdf'))

  // sair
  await page.goto(BASE + '/configuracoes')
  await page.getByRole('button', { name: 'Sair' }).last().click()
  ok('sair volta para o login', await page.getByRole('button', { name: 'Entrar' }).waitFor({ timeout: 8000 }).then(() => true).catch(() => false))
} catch (e) {
  ok('execução sem exceção', false, e.message.split('\n')[0])
} finally {
  ok('sem erros no console do navegador', erros.length === 0, erros.slice(0, 5).join(' | '))
  await browser.close()
  servidor.kill()
  const f = resultados.filter(r => !r.ok).length
  console.log(`\n${resultados.length - f}/${resultados.length} verificações OK`)
  process.exit(f ? 1 : 0)
}
