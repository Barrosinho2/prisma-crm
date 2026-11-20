// Motor de cálculos financeiros. Tudo a partir dos dados reais cadastrados.
//
// CRITÉRIO DE RELATÓRIOS (documentado também na tela):
// • Consumo (competência) — usado em "Despesas do mês", orçamentos, categorias:
//   despesas pagas pela conta contam na data em que foram pagas; compras no
//   cartão contam parcela a parcela, a parcela n no mês da compra + (n-1).
//   O pagamento da fatura NUNCA conta como despesa (a compra já contou).
// • Fluxo de caixa — o que entrou e saiu das contas: receitas recebidas,
//   despesas pagas pela conta e pagamentos de fatura.
// • Transferências entre contas próprias e dinheiro guardado em metas não são
//   receita nem despesa: só mudam onde o dinheiro está.

import type {
  Banco, Cartao, Categoria, Conta, Fatura, Lancamento, Meta, Recorrencia,
} from './tipos'
import {
  diaNoMes, diasEntre, fimMes, inicioMes, mesChave, mesmoMes, partes, somaDias, somaMeses, data, ultimoDia,
} from './formato'

export const CONTAS_LIVRES = new Set(['corrente', 'digital', 'dinheiro', 'poupanca'])

// ---------------------------------------------------------------- saldos
/** Saldo de cada conta. Com `ate`, considera só movimentos até essa data. */
export function saldos(b: Banco, ate?: string): Map<string, number> {
  const s = new Map<string, number>()
  const ok = (d: string | null | undefined) => !!d && (!ate || d <= ate)
  for (const c of b.contas) s.set(c.id, c.saldo_inicial_cents)
  const add = (id: string | null, v: number) => { if (id && s.has(id)) s.set(id, s.get(id)! + v) }
  for (const l of b.lancamentos) {
    if (l.status !== 'efetivado' || l.compra_id || !ok(l.data_efetiva)) continue
    add(l.conta_id, l.tipo === 'receita' ? l.valor_cents : -l.valor_cents)
  }
  for (const t of b.transferencias) {
    if (t.cancelada || !ok(t.data)) continue
    add(t.origem_id, -t.valor_cents); add(t.destino_id, t.valor_cents)
  }
  for (const p of b.pagamentos) {
    if (p.cancelado || !ok(p.data)) continue
    add(p.conta_id, -p.valor_cents)
  }
  const metas = new Map(b.metas.map(m => [m.id, m]))
  for (const mv of b.movimentos) {
    if (mv.cancelado || !ok(mv.data)) continue
    const meta = metas.get(mv.meta_id)
    if (!meta || !meta.conta_id || !mv.conta_id || meta.conta_id === mv.conta_id) continue // só separação
    if (mv.tipo === 'aporte') { add(mv.conta_id, -mv.valor_cents); add(meta.conta_id, mv.valor_cents) }
    else { add(meta.conta_id, -mv.valor_cents); add(mv.conta_id, mv.valor_cents) }
  }
  return s
}

export function patrimonio(b: Banco, ate?: string): number {
  let t = 0
  for (const v of saldos(b, ate).values()) t += v
  return t
}

// ---------------------------------------------------------------- metas
export function saldoMeta(b: Banco, metaId: string, ate?: string): number {
  let s = 0
  for (const mv of b.movimentos) {
    if (mv.meta_id !== metaId || mv.cancelado || (ate && mv.data > ate)) continue
    s += mv.tipo === 'aporte' ? mv.valor_cents : -mv.valor_cents
  }
  return s
}
export function economiaPeriodo(b: Banco, de: string, ate: string): number {
  let s = 0
  for (const mv of b.movimentos) {
    if (mv.cancelado || mv.data < de || mv.data > ate) continue
    s += mv.tipo === 'aporte' ? mv.valor_cents : -mv.valor_cents
  }
  return s
}
/** Dinheiro separado em metas que continua dentro de contas de uso livre. */
export function separadoEmContasLivres(b: Banco): number {
  const contas = new Map(b.contas.map(c => [c.id, c]))
  let t = 0
  for (const m of b.metas) {
    if (m.arquivada) continue
    const c = m.conta_id ? contas.get(m.conta_id) : undefined
    if (c && !CONTAS_LIVRES.has(c.tipo)) continue // já está numa conta de reserva
    t += Math.max(0, saldoMeta(b, m.id))
  }
  return t
}

// ---------------------------------------------------------------- consumo (competência)
export interface ItemConsumo {
  data: string
  valor: number
  categoria_id: string | null
  descricao: string
  origem: 'conta' | 'cartao'
  ref: string
}
export function consumo(b: Banco, de: string, ate: string): ItemConsumo[] {
  const out: ItemConsumo[] = []
  for (const l of b.lancamentos) {
    if (l.tipo !== 'despesa' || l.status !== 'efetivado' || l.compra_id) continue
    const d = l.data_efetiva!
    if (d < de || d > ate) continue
    out.push({ data: d, valor: l.valor_cents, categoria_id: l.categoria_id, descricao: l.descricao, origem: 'conta', ref: l.id })
  }
  const compras = new Map(b.compras.map(c => [c.id, c]))
  for (const p of b.parcelas) {
    const c = compras.get(p.compra_id)
    if (!c || c.cancelada) continue
    const d = p.numero === 1 ? c.data_compra : p.competencia
    if (d < de || d > ate) continue
    out.push({
      data: d, valor: p.valor_cents, categoria_id: c.categoria_id,
      descricao: c.parcelas > 1 ? `${c.descricao} (${p.numero}/${c.parcelas})` : c.descricao,
      origem: 'cartao', ref: c.id,
    })
  }
  return out
}
export const soma = (xs: { valor: number }[]) => xs.reduce((a, x) => a + x.valor, 0)

export function receitasRecebidas(b: Banco, de: string, ate: string): Lancamento[] {
  return b.lancamentos.filter(l => l.tipo === 'receita' && l.status === 'efetivado' && l.data_efetiva! >= de && l.data_efetiva! <= ate)
}

/** Saídas de caixa: despesas pagas pela conta + pagamentos de fatura. */
export function saidasCaixa(b: Banco, de: string, ate: string): number {
  let t = 0
  for (const l of b.lancamentos)
    if (l.tipo === 'despesa' && l.status === 'efetivado' && !l.compra_id && l.data_efetiva! >= de && l.data_efetiva! <= ate) t += l.valor_cents
  for (const p of b.pagamentos) if (!p.cancelado && p.data >= de && p.data <= ate) t += p.valor_cents
  return t
}

export interface ResumoMes {
  receita: number
  despesa: number
  resultado: number
  economia: number
}
export function resumoMes(b: Banco, mesIso: string): ResumoMes {
  const de = inicioMes(mesIso), ate = fimMes(mesIso)
  const receita = receitasRecebidas(b, de, ate).reduce((a, l) => a + l.valor_cents, 0)
  const despesa = soma(consumo(b, de, ate))
  return { receita, despesa, resultado: receita - despesa, economia: economiaPeriodo(b, de, ate) }
}

export function porCategoria(b: Banco, de: string, ate: string): { categoria: Categoria | null; valor: number }[] {
  const cats = new Map(b.categorias.map(c => [c.id, c]))
  const m = new Map<string, number>()
  for (const it of consumo(b, de, ate)) {
    const k = it.categoria_id ?? '_'
    m.set(k, (m.get(k) ?? 0) + it.valor)
  }
  return [...m.entries()]
    .map(([k, valor]) => ({ categoria: cats.get(k) ?? null, valor }))
    .sort((a, z) => z.valor - a.valor)
}

// ---------------------------------------------------------------- cartões e faturas
/** Mesma regra do banco: fatura em que uma compra (ou sua 1ª parcela) cai. */
export function faturaDaCompra(cartao: Pick<Cartao, 'dia_fechamento' | 'dia_vencimento'>, dataCompra: string, parcelaIdx = 0) {
  const df = cartao.dia_fechamento, dv = cartao.dia_vencimento
  let fech = diaNoMes(dataCompra, df)
  if (dataCompra >= fech) fech = diaNoMes(somaMeses(inicioMes(dataCompra), 1), df)
  const m = somaMeses(inicioMes(fech), parcelaIdx)
  const f = diaNoMes(m, df)
  const v = dv > df ? diaNoMes(m, dv) : diaNoMes(somaMeses(m, 1), dv)
  return { fechamento: f, vencimento: v }
}

export interface InfoFatura {
  fatura: Fatura
  total: number
  pago: number
  restante: number
  status: 'aberta' | 'fechada' | 'paga' | 'vencida'
  qtd: number
}
export function infoFaturas(b: Banco, hojeIso: string): Map<string, InfoFatura> {
  const compras = new Map(b.compras.map(c => [c.id, c]))
  const out = new Map<string, InfoFatura>()
  for (const f of b.faturas) out.set(f.id, { fatura: f, total: 0, pago: 0, restante: 0, status: 'aberta', qtd: 0 })
  for (const p of b.parcelas) {
    const c = compras.get(p.compra_id)
    const i = out.get(p.fatura_id)
    if (!c || c.cancelada || !i) continue
    i.total += p.valor_cents; i.qtd++
  }
  for (const pg of b.pagamentos) {
    const i = out.get(pg.fatura_id)
    if (!pg.cancelado && i) i.pago += pg.valor_cents
  }
  for (const i of out.values()) {
    i.restante = Math.max(0, i.total - i.pago)
    if (i.total > 0 && i.restante === 0) i.status = 'paga'
    else if (hojeIso < i.fatura.fechamento) i.status = 'aberta'
    else if (hojeIso > i.fatura.vencimento && i.restante > 0) i.status = 'vencida'
    else if (i.total === 0) i.status = hojeIso >= i.fatura.fechamento ? 'paga' : 'aberta'
    else i.status = 'fechada'
  }
  return out
}

export function resumoCartao(b: Banco, cartao: Cartao, hojeIso: string) {
  const info = infoFaturas(b, hojeIso)
  const doCartao = [...info.values()].filter(i => i.fatura.cartao_id === cartao.id)
    .sort((a, z) => a.fatura.vencimento.localeCompare(z.fatura.vencimento))
  const usado = doCartao.reduce((a, i) => a + i.restante, 0)
  const atual = doCartao.find(i => hojeIso < i.fatura.fechamento) ?? null
  const aPagar = doCartao.filter(i => i.status === 'fechada' || i.status === 'vencida')
  const proximas = doCartao.filter(i => atual && i.fatura.vencimento > atual.fatura.vencimento)
  // se ainda não existe fatura aberta (nenhuma compra), mostra as datas da próxima
  const datasAtual = atual?.fatura ?? faturaDaCompra(cartao, hojeIso)
  return {
    faturas: doCartao,
    usado,
    disponivel: cartao.limite_cents - usado,
    atual,
    datasAtual,
    aPagar,
    proximas,
  }
}

// ---------------------------------------------------------------- contas a pagar
export function vencido(l: Lancamento, hojeIso: string): boolean {
  return l.status === 'pendente' && l.data_prevista < hojeIso
}
export function statusVisivel(l: Lancamento, hojeIso: string): 'pendente' | 'pago' | 'recebido' | 'vencido' | 'cancelado' | 'previsto' {
  if (l.status === 'cancelado') return 'cancelado'
  if (l.status === 'efetivado') return l.tipo === 'receita' ? 'recebido' : 'pago'
  if (vencido(l, hojeIso)) return 'vencido'
  return l.tipo === 'receita' ? 'previsto' : 'pendente'
}

// ---------------------------------------------------------------- disponível para gastar
export function disponivelParaGastar(b: Banco, hojeIso: string) {
  const s = saldos(b)
  const fim = fimMes(hojeIso)
  let saldoLivre = 0
  for (const c of b.contas) if (!c.arquivada && CONTAS_LIVRES.has(c.tipo)) saldoLivre += s.get(c.id) ?? 0
  const contasPendentes = b.lancamentos
    .filter(l => l.tipo === 'despesa' && l.status === 'pendente' && !l.cartao_id && l.data_prevista <= fim)
    .reduce((a, l) => a + l.valor_cents, 0)
  let faturas = 0
  for (const i of infoFaturas(b, hojeIso).values()) if (i.fatura.vencimento <= fim) faturas += i.restante
  const reservado = separadoEmContasLivres(b)
  return {
    saldoLivre, contasPendentes, faturas, reservado,
    valor: saldoLivre - contasPendentes - faturas - reservado,
  }
}

// ---------------------------------------------------------------- orçamentos
export function limiteVigente(b: Banco, categoriaId: string, mesIso: string): number | null {
  const mes = inicioMes(mesIso)
  let melhor: { competencia: string; limite_cents: number } | null = null
  for (const o of b.orcamentos)
    if (o.categoria_id === categoriaId && o.competencia <= mes && (!melhor || o.competencia > melhor.competencia)) melhor = o
  return melhor ? melhor.limite_cents : null
}
export function orcamentosDoMes(b: Banco, mesIso: string) {
  const de = inicioMes(mesIso), ate = fimMes(mesIso)
  const gastos = new Map<string, number>()
  for (const it of consumo(b, de, ate)) if (it.categoria_id) gastos.set(it.categoria_id, (gastos.get(it.categoria_id) ?? 0) + it.valor)
  return b.categorias
    .filter(c => c.tipo === 'despesa')
    .map(c => {
      const limite = limiteVigente(b, c.id, mesIso)
      const usado = gastos.get(c.id) ?? 0
      return { categoria: c, limite, usado, restante: limite == null ? null : limite - usado, pct: limite ? (usado / limite) * 100 : null }
    })
}

// ---------------------------------------------------------------- despesas essenciais
/** Média mensal das categorias essenciais nos últimos meses completos (até 3). */
export function essenciaisMensais(b: Banco, hojeIso: string): { valor: number | null; fonte: 'configurado' | 'historico' | 'recorrencias' | 'mes_atual' | null; meses: number } {
  if (b.config?.essenciais_cents) return { valor: b.config.essenciais_cents, fonte: 'configurado', meses: 0 }
  const essenciais = new Set(b.categorias.filter(c => c.essencial).map(c => c.id))
  const primeiro = primeiroMovimento(b)
  const vals: number[] = []
  for (let i = 1; i <= 3; i++) {
    const m = somaMeses(inicioMes(hojeIso), -i)
    if (!primeiro || fimMes(m) < primeiro || inicioMes(m) < inicioMes(primeiro)) break
    const v = consumo(b, m, fimMes(m)).filter(x => x.categoria_id && essenciais.has(x.categoria_id)).reduce((a, x) => a + x.valor, 0)
    vals.push(v)
  }
  if (vals.length && vals.some(v => v > 0)) return { valor: Math.round(vals.reduce((a, v) => a + v, 0) / vals.length), fonte: 'historico', meses: vals.length }
  const rec = b.recorrencias.filter(r => r.ativa && r.tipo === 'despesa' && (r.essencial || (r.categoria_id && essenciais.has(r.categoria_id))))
  if (rec.length) return { valor: rec.reduce((a, r) => a + r.valor_cents, 0), fonte: 'recorrencias', meses: 0 }
  const atual = consumo(b, inicioMes(hojeIso), hojeIso).filter(x => x.categoria_id && essenciais.has(x.categoria_id)).reduce((a, x) => a + x.valor, 0)
  if (atual > 0) return { valor: atual, fonte: 'mes_atual', meses: 0 }
  return { valor: null, fonte: null, meses: 0 }
}

export function primeiroMovimento(b: Banco): string | null {
  let p: string | null = null
  const ver = (d: string | null | undefined) => { if (d && (!p || d < p)) p = d }
  for (const l of b.lancamentos) if (l.status === 'efetivado') ver(l.data_efetiva)
  for (const c of b.compras) if (!c.cancelada) ver(c.data_compra)
  for (const t of b.transferencias) if (!t.cancelada) ver(t.data)
  return p
}

// ---------------------------------------------------------------- recorrências (sem materializar)
export function ocorrenciaNoMes(r: Recorrencia, mesIso: string): string | null {
  if (!r.ativa) return null
  const d = diaNoMes(mesIso, r.dia)
  if (d < r.inicio) return null
  if (r.fim && d > r.fim) return null
  return d
}

// ---------------------------------------------------------------- projeção
export interface Cenario {
  economiaExtra: number // centavos por mês
  reducoes: Record<string, number> // categoria_id -> % (0-100)
}
export interface PontoProjecao {
  mes: string
  rotulo: string
  realizado: number | null
  previsto: number | null
  simulado: number | null
  receitas: number
  despesasFixas: number
  faturas: number
  variaveis: number
}

/** Gasto variável médio por categoria (consumo que não veio de recorrência), meses completos. */
export function variaveisMedios(b: Banco, hojeIso: string): { porCategoria: Map<string, number>; total: number; meses: number } {
  const porCat = new Map<string, number>()
  const primeiro = primeiroMovimento(b)
  const recorrentes = new Set(b.lancamentos.filter(l => l.recorrencia_id).map(l => l.id))
  const comprasRec = new Set(b.lancamentos.filter(l => l.recorrencia_id && l.compra_id).map(l => l.compra_id!))
  let meses = 0
  for (let i = 1; i <= 3; i++) {
    const m = somaMeses(inicioMes(hojeIso), -i)
    if (!primeiro || inicioMes(m) < inicioMes(primeiro)) break
    meses++
    for (const it of consumo(b, m, fimMes(m))) {
      if (it.origem === 'conta' && recorrentes.has(it.ref)) continue
      if (it.origem === 'cartao' && comprasRec.has(it.ref)) continue
      const k = it.categoria_id ?? '_'
      porCat.set(k, (porCat.get(k) ?? 0) + it.valor)
    }
  }
  // parcelas futuras já estão nas faturas; aqui só a média do que é avulso
  if (meses) for (const [k, v] of porCat) porCat.set(k, Math.round(v / meses))
  let total = 0
  for (const v of porCat.values()) total += v
  return { porCategoria: porCat, total, meses }
}

export function projetar(b: Banco, hojeIso: string, meses: number, cenario?: Cenario): PontoProjecao[] {
  const s = saldos(b)
  let saldo = 0
  for (const c of b.contas) if (!c.arquivada) saldo += s.get(c.id) ?? 0
  const info = infoFaturas(b, hojeIso)
  const variaveis = variaveisMedios(b, hojeIso)
  const pontos: PontoProjecao[] = []
  // histórico: saldo realizado ao fim dos 3 meses anteriores
  for (let i = 3; i >= 1; i--) {
    const m = somaMeses(inicioMes(hojeIso), -i)
    const primeiro = primeiroMovimento(b)
    if (!primeiro || fimMes(m) < primeiro) continue
    pontos.push({ mes: m, rotulo: rotuloMes(m), realizado: patrimonio(b, fimMes(m)), previsto: null, simulado: null, receitas: 0, despesasFixas: 0, faturas: 0, variaveis: 0 })
  }
  pontos.push({ mes: inicioMes(hojeIso), rotulo: 'Hoje', realizado: saldo, previsto: saldo, simulado: cenario ? saldo : null, receitas: 0, despesasFixas: 0, faturas: 0, variaveis: 0 })

  let prev = saldo, sim = saldo
  for (let i = 0; i <= meses; i++) {
    const m = somaMeses(inicioMes(hojeIso), i)
    const de = i === 0 ? somaDias(hojeIso, 0) : m
    const ate = fimMes(m)
    let receitas = 0, fixas = 0, fat = 0
    const geradas = new Set<string>()
    for (const l of b.lancamentos) {
      if (l.status !== 'pendente') continue
      if (l.recorrencia_id && mesChave(l.competencia!) === mesChave(m)) geradas.add(l.recorrencia_id)
      const d = l.data_prevista
      // pendências vencidas entram no mês atual
      const noPeriodo = i === 0 ? d <= ate : d >= m && d <= ate
      if (!noPeriodo) continue
      if (l.cartao_id && l.tipo === 'despesa') continue // vira compra no cartão → fatura
      if (l.tipo === 'receita') receitas += l.valor_cents
      else fixas += l.valor_cents
    }
    for (const r of b.recorrencias) {
      if (geradas.has(r.id)) continue
      const d = ocorrenciaNoMes(r, m)
      if (!d || d < de) continue
      if (r.tipo === 'receita') receitas += r.valor_cents
      else if (r.cartao_id) fat += r.valor_cents
      else fixas += r.valor_cents
    }
    for (const it of info.values()) {
      const v = it.fatura.vencimento
      if ((i === 0 ? v <= ate : v >= m && v <= ate)) fat += it.restante
    }
    // gasto variável: proporcional aos dias restantes no mês atual
    const fator = i === 0 ? (diasEntre(hojeIso, ate) + 1) / ultimoDia(...(partes(m).slice(0, 2) as [number, number])) : 1
    const varPrev = Math.round(variaveis.total * fator)
    let varSim = varPrev
    if (cenario) {
      let red = 0
      for (const [cat, p] of Object.entries(cenario.reducoes)) red += (variaveis.porCategoria.get(cat) ?? 0) * (p / 100)
      varSim = Math.round((variaveis.total - red) * fator)
    }
    prev = prev + receitas - fixas - fat - varPrev
    sim = sim + receitas - fixas - fat - varSim + (cenario ? Math.round(cenario.economiaExtra * (i === 0 ? fator : 1)) : 0)
    pontos.push({
      mes: m, rotulo: i === 0 ? 'Fim do mês' : rotuloMes(m), realizado: null, previsto: prev, simulado: cenario ? sim : null,
      receitas, despesasFixas: fixas, faturas: fat, variaveis: varPrev,
    })
  }
  return pontos
}
function rotuloMes(m: string) {
  const n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const [a, mm] = partes(m)
  return `${n[mm - 1]}/${String(a).slice(2)}`
}

// ---------------------------------------------------------------- séries para gráficos
export type Periodo = 'semana' | 'mes' | '3m' | '6m' | 'ano'
export interface PontoFluxo { rotulo: string; receitas: number; despesas: number; resultado: number }
export function serieFluxo(b: Banco, periodo: Periodo, refIso: string): PontoFluxo[] {
  const pts: PontoFluxo[] = []
  const ponto = (rotulo: string, de: string, ate: string) => {
    const r = receitasRecebidas(b, de, ate).reduce((a, l) => a + l.valor_cents, 0)
    const d = soma(consumo(b, de, ate))
    pts.push({ rotulo, receitas: r, despesas: d, resultado: r - d })
  }
  if (periodo === 'semana') {
    const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
    for (let i = 6; i >= 0; i--) {
      const d = somaDias(refIso, -i)
      ponto(`${nomes[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}`, d, d)
    }
  } else if (periodo === 'mes') {
    const ini = inicioMes(refIso), fim = fimMes(refIso)
    let d = ini, sem = 1
    while (d <= fim) {
      const ate = somaDias(d, 6) > fim ? fim : somaDias(d, 6)
      ponto(`${d.slice(8)}–${ate.slice(8)}`, d, ate)
      d = somaDias(ate, 1); sem++
    }
  } else {
    const n = periodo === '3m' ? 3 : periodo === '6m' ? 6 : 12
    for (let i = n - 1; i >= 0; i--) {
      const m = somaMeses(inicioMes(refIso), -i)
      ponto(rotuloMes(m), m, fimMes(m))
    }
  }
  return pts
}

export function serieSaldo(b: Banco, hojeIso: string, meses: number) {
  const pts: { rotulo: string; saldo: number }[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const m = somaMeses(inicioMes(hojeIso), -i)
    const ate = i === 0 ? hojeIso : fimMes(m)
    pts.push({ rotulo: rotuloMes(m), saldo: patrimonio(b, ate) })
  }
  return pts
}

// ---------------------------------------------------------------- análise (insights)
export interface Insight { tom: 'neutro' | 'bom' | 'atencao' | 'alerta'; texto: string }
export function analise(b: Banco, hojeIso: string): Insight[] {
  const out: Insight[] = []
  const mes = inicioMes(hojeIso), ant = somaMeses(mes, -1)
  const primeiro = primeiroMovimento(b)
  const temMesAnterior = !!primeiro && primeiro <= fimMes(ant)
  const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  // mesma janela de dias, para comparar de forma justa
  const dia = Math.min(partes(hojeIso)[2], ultimoDia(...(partes(ant).slice(0, 2) as [number, number])))
  const ateAnt = data(partes(ant)[0], partes(ant)[1], dia)

  if (temMesAnterior) {
    const atual = porCategoria(b, mes, hojeIso)
    const antes = new Map(porCategoria(b, ant, ateAnt).map(x => [x.categoria?.id ?? '_', x.valor]))
    for (const x of atual.slice(0, 6)) {
      const a = antes.get(x.categoria?.id ?? '_') ?? 0
      if (a < 5000 || x.valor < 5000) continue
      const v = ((x.valor - a) / a) * 100
      if (Math.abs(v) >= 15) {
        out.push({
          tom: v > 0 ? 'atencao' : 'bom',
          texto: `Seus gastos com ${x.categoria?.nome.toLowerCase() ?? 'sem categoria'} ${v > 0 ? 'aumentaram' : 'caíram'} ${Math.abs(Math.round(v))}% em relação ao mesmo período do mês anterior.`,
        })
      }
    }
    const dAtual = soma(consumo(b, mes, hojeIso)), dAnt = soma(consumo(b, ant, ateAnt))
    if (dAnt > 0 && dAtual > 0) {
      const v = ((dAtual - dAnt) / dAnt) * 100
      if (Math.abs(v) >= 5)
        out.push({ tom: v > 0 ? 'atencao' : 'bom', texto: `Até hoje você gastou ${fmt(dAtual)}, ${Math.abs(Math.round(v))}% ${v > 0 ? 'a mais' : 'a menos'} que no mesmo ponto do mês passado.` })
    }
  }
  for (const o of orcamentosDoMes(b, hojeIso)) {
    if (o.limite == null || o.limite === 0 || o.pct == null) continue
    if (o.pct >= 100) out.push({ tom: 'alerta', texto: `O orçamento de ${o.categoria.nome.toLowerCase()} foi ultrapassado: ${fmt(o.usado)} de ${fmt(o.limite)}.` })
    else if (o.pct >= 75) out.push({ tom: 'atencao', texto: `Você utilizou ${Math.round(o.pct)}% do orçamento de ${o.categoria.nome.toLowerCase()}.` })
  }
  // ritmo de economia por meta (precisa de pelo menos 2 meses de contribuições)
  for (const m of b.metas.filter(x => !x.arquivada)) {
    const movs = b.movimentos.filter(x => x.meta_id === m.id && !x.cancelado)
    if (!movs.length) continue
    const desde = movs.reduce((a, x) => (x.data < a ? x.data : a), movs[0].data)
    const mesesHist = diasEntre(desde, hojeIso) / 30.44
    const guardado = saldoMeta(b, m.id)
    const falta = m.alvo_cents - guardado
    if (falta <= 0) { out.push({ tom: 'bom', texto: `A meta "${m.nome}" foi alcançada.` }); continue }
    if (mesesHist < 2) continue
    const ritmo = guardado / mesesHist
    if (ritmo <= 0) continue
    const n = Math.ceil(falta / ritmo)
    out.push({ tom: 'neutro', texto: `Mantendo o ritmo atual de economia, a meta "${m.nome}" poderá ser alcançada em aproximadamente ${n} ${n === 1 ? 'mês' : 'meses'}. É uma estimativa, não uma garantia.` })
  }
  const venc = b.lancamentos.filter(l => l.tipo === 'despesa' && vencido(l, hojeIso))
  if (venc.length) out.push({ tom: 'alerta', texto: `Há ${venc.length} ${venc.length === 1 ? 'conta vencida' : 'contas vencidas'} somando ${fmt(venc.reduce((a, l) => a + l.valor_cents, 0))}.` })
  const disp = disponivelParaGastar(b, hojeIso)
  if (b.contas.length && disp.valor < 0)
    out.push({ tom: 'alerta', texto: `Os compromissos até o fim do mês passam do saldo livre em ${fmt(-disp.valor)}.` })
  if (!temMesAnterior)
    out.push({ tom: 'neutro', texto: 'Ainda não há histórico suficiente para comparar meses. As análises ficam mais precisas a partir do segundo mês de uso.' })
  return out
}

// ---------------------------------------------------------------- calendário
export interface EventoCal {
  data: string
  tipo: 'receita' | 'despesa' | 'fatura' | 'fechamento' | 'transferencia' | 'meta'
  titulo: string
  valor: number
  realizado: boolean
  vencido: boolean
  ref?: string
}
export function eventosDoMes(b: Banco, mesIso: string, hojeIso: string): EventoCal[] {
  const de = inicioMes(mesIso), ate = fimMes(mesIso)
  const ev: EventoCal[] = []
  const dentro = (d: string | null) => !!d && d >= de && d <= ate
  for (const l of b.lancamentos) {
    if (l.status === 'cancelado') continue
    const d = l.status === 'efetivado' ? l.data_efetiva : l.data_prevista
    if (!dentro(d)) continue
    ev.push({ data: d!, tipo: l.tipo, titulo: l.descricao, valor: l.valor_cents, realizado: l.status === 'efetivado', vencido: vencido(l, hojeIso), ref: l.id })
  }
  const cartoes = new Map(b.cartoes.map(c => [c.id, c]))
  for (const i of infoFaturas(b, hojeIso).values()) {
    const c = cartoes.get(i.fatura.cartao_id)
    if (!c || i.total === 0) continue
    if (dentro(i.fatura.vencimento))
      ev.push({ data: i.fatura.vencimento, tipo: 'fatura', titulo: `Fatura ${c.nome}`, valor: i.total, realizado: i.status === 'paga', vencido: i.status === 'vencida', ref: i.fatura.id })
    if (dentro(i.fatura.fechamento))
      ev.push({ data: i.fatura.fechamento, tipo: 'fechamento', titulo: `Fechamento ${c.nome}`, valor: i.total, realizado: hojeIso >= i.fatura.fechamento, vencido: false, ref: i.fatura.id })
  }
  for (const t of b.transferencias) if (!t.cancelada && dentro(t.data))
    ev.push({ data: t.data, tipo: 'transferencia', titulo: t.descricao || 'Transferência entre contas', valor: t.valor_cents, realizado: true, vencido: false })
  const metas = new Map(b.metas.map(m => [m.id, m]))
  for (const mv of b.movimentos) if (!mv.cancelado && dentro(mv.data))
    ev.push({ data: mv.data, tipo: 'meta', titulo: `${mv.tipo === 'aporte' ? 'Guardado em' : 'Retirado de'} ${metas.get(mv.meta_id)?.nome ?? 'meta'}`, valor: mv.valor_cents, realizado: true, vencido: false })
  return ev.sort((a, z) => a.data.localeCompare(z.data))
}

// ---------------------------------------------------------------- utilidades
export function contribuicaoSugerida(meta: Meta, guardado: number, hojeIso: string): number | null {
  if (!meta.prazo) return null
  const falta = meta.alvo_cents - guardado
  if (falta <= 0) return 0
  const [a1, m1] = partes(hojeIso), [a2, m2] = partes(meta.prazo)
  const meses = Math.max(1, (a2 - a1) * 12 + (m2 - m1))
  return Math.ceil(falta / meses)
}
export function mapaPorId<T extends { id: string }>(xs: T[]): Map<string, T> {
  return new Map(xs.map(x => [x.id, x]))
}
export function contaAtiva(c: Conta) { return !c.arquivada }
export { mesmoMes }

// ---------------------------------------------------------------- prazo das recorrências
/** Data da primeira ocorrência de uma recorrência (o dia no mês de início, ou no mês seguinte se já passou). */
export function primeiraOcorrencia(inicio: string, dia: number): string {
  const d = diaNoMes(inicio, dia)
  return d >= inicio ? d : diaNoMes(somaMeses(inicioMes(inicio), 1), dia)
}
/** Data da última ocorrência para um total de N parcelas. */
export function fimPorParcelas(inicio: string, dia: number, n: number): string {
  return diaNoMes(somaMeses(inicioMes(primeiraOcorrencia(inicio, dia)), Math.max(1, n) - 1), dia)
}
/** Quantas ocorrências existem entre o início e o fim (inclusive). */
export function totalParcelas(inicio: string, dia: number, fim: string): number {
  const p = primeiraOcorrencia(inicio, dia)
  if (fim < p) return 0
  const [a1, m1] = partes(p), [a2, m2] = partes(fim)
  let n = (a2 - a1) * 12 + (m2 - m1) + 1
  if (diaNoMes(fim, dia) > fim) n -= 1
  return Math.max(0, n)
}
/** Número da parcela de uma ocorrência (1 = primeira). */
export function numeroParcela(r: Pick<Recorrencia, 'inicio' | 'dia' | 'parcelas_anteriores'>, competencia: string): number {
  const [a1, m1] = partes(primeiraOcorrencia(r.inicio, r.dia)), [a2, m2] = partes(competencia)
  return (a2 - a1) * 12 + (m2 - m1) + 1 + (r.parcelas_anteriores ?? 0)
}
/** Total de parcelas de uma recorrência com prazo (inclui as pagas antes do sistema). */
export function totalDaRecorrencia(r: Pick<Recorrencia, 'inicio' | 'dia' | 'fim' | 'parcelas_anteriores'>): number {
  return r.fim ? totalParcelas(r.inicio, r.dia, r.fim) + (r.parcelas_anteriores ?? 0) : 0
}
export interface PrazoRecorrencia { total: number; pagas: number; faltam: number; ultima: string; encerrada: boolean }
/** Andamento de uma recorrência com prazo. null = sem prazo (até cancelar). */
export function prazoRecorrencia(b: Banco, r: Recorrencia): PrazoRecorrencia | null {
  if (!r.fim) return null
  const antes = r.parcelas_anteriores ?? 0
  const total = totalParcelas(r.inicio, r.dia, r.fim) + antes
  const pagas = antes + b.lancamentos.filter(l => l.recorrencia_id === r.id && l.status === 'efetivado').length
  return { total, pagas, faltam: Math.max(0, total - pagas), ultima: diaNoMes(r.fim, r.dia) > r.fim ? diaNoMes(somaMeses(inicioMes(r.fim), -1), r.dia) : diaNoMes(r.fim, r.dia), encerrada: !r.ativa }
}
