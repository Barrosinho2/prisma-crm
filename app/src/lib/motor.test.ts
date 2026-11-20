import { describe, expect, it } from 'vitest'
import { bancoVazio, type Banco } from './tipos'
import {
  consumo, disponivelParaGastar, faturaDaCompra, infoFaturas, patrimonio, projetar, resumoMes, saldoMeta, saldos,
  limiteVigente, orcamentosDoMes, analise, resumoCartao,
} from './motor'
import { diaNoMes, paraCentavos, somaMeses } from './formato'
import { dividir } from '../components/Salario'

const HOJE = '2026-11-19'

function base(): Banco {
  const b = bancoVazio()
  b.contas = [
    { id: 'A', nome: 'Corrente', tipo: 'corrente', saldo_inicial_cents: 100000, data_saldo_inicial: '2026-11-01', cor: null, ordem: 0, arquivada: false },
    { id: 'B', nome: 'Digital', tipo: 'digital', saldo_inicial_cents: 0, data_saldo_inicial: '2026-11-01', cor: null, ordem: 1, arquivada: false },
    { id: 'R', nome: 'Reserva', tipo: 'reserva', saldo_inicial_cents: 0, data_saldo_inicial: '2026-11-01', cor: null, ordem: 2, arquivada: false },
  ]
  b.categorias = [
    { id: 'ali', nome: 'Alimentação', tipo: 'despesa', icone: 'x', cor: '#000000', ordem: 1, oculta: false, essencial: true },
    { id: 'laz', nome: 'Lazer', tipo: 'despesa', icone: 'x', cor: '#000000', ordem: 2, oculta: false, essencial: false },
  ]
  return b
}
const lanc = (o: Partial<Banco['lancamentos'][0]>): Banco['lancamentos'][0] => ({
  id: Math.random().toString(), tipo: 'despesa', descricao: 'x', valor_cents: 100, data_prevista: HOJE, data_efetiva: null,
  status: 'pendente', categoria_id: null, conta_id: 'A', cartao_id: null, compra_id: null, forma_pagamento: null,
  recorrencia_id: null, competencia: null, obs: null, ...o,
})

describe('dinheiro', () => {
  it('converte texto em centavos sem ponto flutuante', () => {
    expect(paraCentavos('1.234,56')).toBe(123456)
    expect(paraCentavos('0,1')).toBe(10)
    expect(paraCentavos('R$ 2.500,00')).toBe(250000)
    expect(paraCentavos('19.99')).toBe(1999)
    expect(paraCentavos('1.000')).toBe(100000)
    expect(paraCentavos('abc')).toBeNull()
    expect(paraCentavos('1,234')).toBeNull()
  })
})

describe('Teste 1 — salário', () => {
  it('saldo só aumenta quando o recebimento é confirmado', () => {
    const b = base()
    b.lancamentos.push(lanc({ id: 's', tipo: 'receita', valor_cents: 250000, data_prevista: '2026-11-05', recorrencia_id: 'r', competencia: '2026-11-01' }))
    expect(saldos(b).get('A')).toBe(100000)
    expect(resumoMes(b, HOJE).receita).toBe(0)
    b.lancamentos[0] = { ...b.lancamentos[0], status: 'efetivado', data_efetiva: '2026-11-05' }
    expect(saldos(b).get('A')).toBe(350000)
    expect(resumoMes(b, HOJE).receita).toBe(250000)
  })
  it('receita prevista não entra no disponível para gastar', () => {
    const b = base()
    b.lancamentos.push(lanc({ tipo: 'receita', valor_cents: 250000, data_prevista: '2026-11-25' }))
    expect(disponivelParaGastar(b, HOJE).valor).toBe(100000)
  })
})

describe('Teste 2 — despesa comum', () => {
  it('reduz o saldo em R$ 100', () => {
    const b = base()
    b.lancamentos.push(lanc({ valor_cents: 10000, status: 'efetivado', data_efetiva: HOJE, categoria_id: 'ali' }))
    expect(saldos(b).get('A')).toBe(90000)
    expect(resumoMes(b, HOJE).despesa).toBe(10000)
  })
})

describe('Teste 3 — transferência', () => {
  it('não muda o patrimônio nem conta como receita/despesa', () => {
    const b = base()
    const antes = patrimonio(b)
    b.transferencias.push({ id: 't', origem_id: 'A', destino_id: 'B', valor_cents: 20000, data: HOJE, descricao: null, cancelada: false })
    expect(patrimonio(b)).toBe(antes)
    expect(saldos(b).get('A')).toBe(80000)
    expect(saldos(b).get('B')).toBe(20000)
    expect(resumoMes(b, HOJE)).toMatchObject({ receita: 0, despesa: 0 })
  })
})

describe('Teste 4 — cartão', () => {
  const cartao = { dia_fechamento: 10, dia_vencimento: 17 }
  it('calcula a fatura igual ao banco', () => {
    expect(faturaDaCompra(cartao, '2026-11-09')).toEqual({ fechamento: '2026-11-10', vencimento: '2026-11-17' })
    expect(faturaDaCompra(cartao, '2026-11-10')).toEqual({ fechamento: '2026-12-10', vencimento: '2026-12-17' })
    expect(faturaDaCompra(cartao, '2026-11-20', 2)).toEqual({ fechamento: '2027-02-10', vencimento: '2027-02-17' })
    expect(faturaDaCompra({ dia_fechamento: 28, dia_vencimento: 5 }, '2026-12-29')).toEqual({ fechamento: '2027-01-28', vencimento: '2027-02-05' })
    expect(diaNoMes('2027-02-01', 31)).toBe('2027-02-28')
    expect(somaMeses('2026-01-31', 1)).toBe('2026-02-28')
  })
  it('compra parcelada não duplica e o pagamento da fatura não é despesa', () => {
    const b = base()
    b.cartoes = [{ id: 'c', nome: 'Cartão', instituicao: null, limite_cents: 500000, dia_fechamento: 10, dia_vencimento: 17, conta_pagamento_id: 'A', cor: '#621F32', arquivado: false }]
    b.compras = [{ id: 'k', cartao_id: 'c', descricao: 'Notebook', valor_total_cents: 120000, parcelas: 3, data_compra: '2026-11-20', categoria_id: 'laz', obs: null, cancelada: false }]
    b.faturas = [
      { id: 'f1', cartao_id: 'c', fechamento: '2026-12-10', vencimento: '2026-12-17' },
      { id: 'f2', cartao_id: 'c', fechamento: '2027-01-10', vencimento: '2027-01-17' },
      { id: 'f3', cartao_id: 'c', fechamento: '2027-02-10', vencimento: '2027-02-17' },
    ]
    b.parcelas = [1, 2, 3].map(n => ({ id: 'p' + n, compra_id: 'k', fatura_id: 'f' + n, numero: n, valor_cents: 40000, competencia: somaMeses('2026-11-01', n - 1) }))
    // consumo total de todos os meses = valor da compra (uma vez só)
    expect(consumo(b, '2026-01-01', '2027-12-31').reduce((a, x) => a + x.valor, 0)).toBe(120000)
    expect(resumoMes(b, HOJE).despesa).toBe(40000)
    expect(resumoCartao(b, b.cartoes[0], HOJE).disponivel).toBe(380000)
    b.pagamentos.push({ id: 'pg', fatura_id: 'f1', conta_id: 'A', valor_cents: 40000, data: '2026-12-17', cancelado: false })
    expect(consumo(b, '2026-01-01', '2027-12-31').reduce((a, x) => a + x.valor, 0)).toBe(120000)
    expect(saldos(b).get('A')).toBe(60000)
    expect(infoFaturas(b, '2026-12-18').get('f1')!.status).toBe('paga')
    expect(resumoCartao(b, b.cartoes[0], '2026-12-18').disponivel).toBe(420000)
  })
})

describe('Teste 5 — meta', () => {
  it('guardar R$ 150 não é despesa e protege o valor', () => {
    const b = base()
    b.metas = [{ id: 'm', nome: 'Viagem', alvo_cents: 600000, prazo: null, conta_id: 'R', emergencia: false, meses_alvo: null, icone: 't', arquivada: false }]
    b.movimentos = [{ id: 'mv', meta_id: 'm', tipo: 'aporte', valor_cents: 15000, data: HOJE, conta_id: 'A', obs: null, cancelado: false }]
    expect(resumoMes(b, HOJE)).toMatchObject({ despesa: 0, economia: 15000 })
    expect(saldos(b).get('A')).toBe(85000)
    expect(saldos(b).get('R')).toBe(15000)
    expect(patrimonio(b)).toBe(100000)
    expect(saldoMeta(b, 'm')).toBe(15000)
    expect(disponivelParaGastar(b, HOJE).valor).toBe(85000)
  })
  it('meta sem conta própria só separa: o dinheiro fica protegido no disponível', () => {
    const b = base()
    b.metas = [{ id: 'm', nome: 'PC', alvo_cents: 600000, prazo: null, conta_id: null, emergencia: false, meses_alvo: null, icone: 't', arquivada: false }]
    b.movimentos = [{ id: 'mv', meta_id: 'm', tipo: 'aporte', valor_cents: 15000, data: HOJE, conta_id: 'A', obs: null, cancelado: false }]
    expect(saldos(b).get('A')).toBe(100000)
    expect(disponivelParaGastar(b, HOJE).valor).toBe(85000)
  })
})

describe('disponível para gastar', () => {
  it('desconta contas pendentes e faturas do mês', () => {
    const b = base()
    b.lancamentos.push(lanc({ valor_cents: 5000, data_prevista: '2026-11-25' }))
    b.lancamentos.push(lanc({ valor_cents: 7000, data_prevista: '2026-12-02' })) // mês que vem: não entra
    expect(disponivelParaGastar(b, HOJE).valor).toBe(95000)
  })
})

describe('orçamento', () => {
  it('limite vale do mês em diante, sem apagar o histórico', () => {
    const b = base()
    b.orcamentos = [
      { id: 'o1', categoria_id: 'ali', competencia: '2026-09-01', limite_cents: 50000 },
      { id: 'o2', categoria_id: 'ali', competencia: '2026-11-01', limite_cents: 60000 },
    ]
    expect(limiteVigente(b, 'ali', '2026-10-15')).toBe(50000)
    expect(limiteVigente(b, 'ali', '2026-11-15')).toBe(60000)
    expect(limiteVigente(b, 'ali', '2026-08-15')).toBeNull()
    b.lancamentos.push(lanc({ valor_cents: 48000, status: 'efetivado', data_efetiva: HOJE, categoria_id: 'ali' }))
    const o = orcamentosDoMes(b, HOJE).find(x => x.categoria.id === 'ali')!
    expect(o.pct).toBe(80)
  })
})

describe('projeção e análise', () => {
  it('projeta com recorrências e não altera dados', () => {
    const b = base()
    b.recorrencias = [{ id: 'r', tipo: 'receita', nome: 'Salário', valor_cents: 250000, dia: 5, categoria_id: null, conta_id: 'A', cartao_id: null, forma_pagamento: null, inicio: '2026-11-01', fim: null, ativa: true, essencial: false, obs: null }]
    const copia = JSON.stringify(b)
    const p = projetar(b, HOJE, 3, { economiaExtra: 20000, reducoes: {} })
    expect(JSON.stringify(b)).toBe(copia)
    const fim = p[p.length - 1]
    expect(fim.previsto).toBe(100000 + 3 * 250000)
    expect(fim.simulado).toBe(fim.previsto! + 3 * 20000 + Math.round(20000 * (12 / 30)))
  })
  it('não inventa comparação sem histórico', () => {
    const b = base()
    const a = analise(b, HOJE)
    expect(a.some(x => x.texto.includes('histórico suficiente'))).toBe(true)
  })
})

describe('salário em partes', () => {
  it('divide sem perder centavos', () => {
    expect(dividir(250000, [60, 40])).toEqual([150000, 100000])
    expect(dividir(308500, [60, 40])).toEqual([185100, 123400])
    expect(dividir(100001, [33.3, 33.3, 33.4]).reduce((a, v) => a + v, 0)).toBe(100001)
  })
})

import { fimPorParcelas, numeroParcela, primeiraOcorrencia, totalParcelas } from './motor'
describe('prazo das recorrências', () => {
  it('conta parcelas e calcula o fim', () => {
    expect(primeiraOcorrencia('2026-11-19', 10)).toBe('2026-12-10')
    expect(primeiraOcorrencia('2026-11-19', 25)).toBe('2026-11-25')
    expect(fimPorParcelas('2026-11-19', 10, 12)).toBe('2027-11-10')
    expect(fimPorParcelas('2026-11-19', 25, 1)).toBe('2026-11-25')
    expect(totalParcelas('2026-11-19', 10, fimPorParcelas('2026-11-19', 10, 12))).toBe(12)
    expect(totalParcelas('2026-11-19', 31, fimPorParcelas('2026-11-19', 31, 6))).toBe(6)
    expect(totalParcelas('2026-11-19', 10, '2027-02-05')).toBe(2)
    expect(numeroParcela({ inicio: '2026-11-19', dia: 10 }, '2027-02-01')).toBe(3)
  })
})
