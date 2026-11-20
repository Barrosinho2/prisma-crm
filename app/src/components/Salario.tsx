import { useEffect, useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { useDados } from '../lib/dados'
import { reais } from '../lib/formato'
import type { Banco, Recorrencia } from '../lib/tipos'
import { Alternar, Botao, Campo, CampoValor, Entrada, Seletor, cn, useAcao } from './ui'

/** Recorrências de receita que formam o salário (pode ser recebido em partes). */
export function partesDoSalario(b: Banco): Recorrencia[] {
  const cats = new Set(b.categorias.filter(c => c.tipo === 'receita' && /sal[aá]rio/i.test(c.nome)).map(c => c.id))
  return b.recorrencias
    .filter(r => r.tipo === 'receita' && r.ativa && ((r.categoria_id && cats.has(r.categoria_id)) || /^sal[aá]rio/i.test(r.nome)))
    .sort((a, z) => a.dia - z.dia)
}

interface Parte { dia: number; pct: string }

/** Divide o total em centavos pelos percentuais; a última parte leva o arredondamento. */
export function dividir(total: number, pcts: number[]): number[] {
  const out: number[] = []
  let soma = 0
  pcts.forEach((p, i) => {
    const v = i === pcts.length - 1 ? total - soma : Math.round((total * p) / 100)
    out.push(v); soma += v
  })
  return out
}

export function ResumoSalario({ partes }: { partes: Recorrencia[] }) {
  const total = partes.reduce((a, r) => a + r.valor_cents, 0)
  return (
    <p className="text-sm text-taupe">
      <span className="font-semibold text-carvao">{reais(total)}</span> por mês
      {partes.length === 1 ? <> · todo dia {partes[0].dia}</> : partes.map(r => (
        <span key={r.id}> · {Math.round((r.valor_cents / total) * 1000) / 10}% dia {r.dia}</span>
      ))}
    </p>
  )
}

export function EditorSalario({ aoSalvar }: { aoSalvar?: () => void }) {
  const { banco, hoje, inserir, atualizar, rpc } = useDados()
  const { ocupado, executar } = useAcao()
  const existentes = useMemo(() => partesDoSalario(banco), [banco])
  const contas = banco.contas.filter(c => !c.arquivada)
  const cat = banco.categorias.find(c => c.tipo === 'receita' && /sal[aá]rio/i.test(c.nome))

  const [total, setTotal] = useState<number | null>(null)
  const [conta, setConta] = useState('')
  const [partes, setPartes] = useState<Parte[]>([{ dia: 5, pct: '100' }])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const t = existentes.reduce((a, r) => a + r.valor_cents, 0)
    if (existentes.length) {
      setTotal(t)
      setConta(existentes[0].conta_id ?? contas[0]?.id ?? '')
      setPartes(existentes.map(r => ({ dia: r.dia, pct: String(Math.round((r.valor_cents / t) * 1000) / 10).replace('.', ',') })))
    } else {
      setConta(contas[0]?.id ?? '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const emPartes = partes.length > 1
  const pcts = partes.map(p => Number(p.pct.replace(',', '.')) || 0)
  const somaPct = Math.round(pcts.reduce((a, p) => a + p, 0) * 100) / 100
  const valores = total ? dividir(total, pcts) : []

  function alternarPartes(v: boolean) {
    setPartes(v ? [{ dia: partes[0]?.dia ?? 5, pct: '60' }, { dia: 20, pct: '40' }] : [{ dia: partes[0]?.dia ?? 5, pct: '100' }])
  }

  async function salvar() {
    setErro(null)
    if (!total || total <= 0) return setErro('Informe o valor total do salário.')
    if (!conta) return setErro('Escolha a conta onde o salário entra.')
    if (Math.abs(somaPct - 100) > 0.001) return setErro(`As partes somam ${String(somaPct).replace('.', ',')}%. Precisam somar 100%.`)
    if (pcts.some(p => p <= 0)) return setErro('Cada parte precisa de um percentual maior que zero.')
    if (new Set(partes.map(p => p.dia)).size !== partes.length) return setErro('Cada parte precisa cair num dia diferente.')
    const ord = partes.map((p, i) => ({ ...p, valor: valores[i] })).sort((a, z) => a.dia - z.dia)
    const ok = await executar(async () => {
      for (let i = 0; i < ord.length; i++) {
        const p = ord[i]
        const nome = ord.length === 1 ? 'Salário' : `Salário · parte ${i + 1} de ${ord.length}`
        const campos = { nome, valor_cents: p.valor, dia: p.dia, conta_id: conta, categoria_id: cat?.id ?? null, ativa: true, forma_pagamento: 'transferencia' }
        const atual = existentes[i]
        if (atual) {
          await atualizar('recorrencias', atual.id, campos)
          await rpc('fin_aplicar_recorrencia', { p_id: atual.id })
        } else {
          await inserir('recorrencias', { ...campos, tipo: 'receita', inicio: hoje })
        }
      }
      // partes que deixaram de existir: encerradas hoje (o que já foi recebido fica no histórico)
      for (const r of existentes.slice(ord.length)) {
        await atualizar('recorrencias', r.id, { ativa: false, fim: r.inicio > hoje ? r.inicio : hoje })
        await rpc('fin_aplicar_recorrencia', { p_id: r.id })
      }
      await rpc('fin_gerar_previsoes')
    }, emPartes ? 'Salário em partes salvo. As previsões foram atualizadas.' : 'Salário salvo. As previsões foram atualizadas.')
    if (ok) aoSalvar?.()
  }

  if (!contas.length) return <p className="mt-2 text-sm text-taupe">Cadastre uma conta primeiro para saber onde o salário entra.</p>

  return (
    <div className="mt-3 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Salário total por mês"><CampoValor valor={total} aoMudar={setTotal} /></Campo>
        <Campo rotulo="Conta onde entra"><Seletor value={conta} onChange={e => setConta(e.target.value)}>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-borda bg-cartao px-4 py-3">
        <div><p className="text-sm font-medium">Recebo em mais de uma data</p><p className="text-xs text-taupe">Ex.: 60% no dia 5 e 40% no dia 20.</p></div>
        <Alternar ligado={emPartes} aoMudar={alternarPartes} rotulo="Recebo em mais de uma data" />
      </div>

      <ul className="space-y-2">
        {partes.map((p, i) => (
          <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[120px_120px_1fr_auto]">
            <Campo rotulo={emPartes ? `Parte ${i + 1} · dia` : 'Dia do recebimento'}>
              <Seletor value={p.dia} onChange={e => setPartes(partes.map((x, k) => (k === i ? { ...x, dia: +e.target.value } : x)))}>
                {Array.from({ length: 31 }, (_, d) => <option key={d + 1} value={d + 1}>{d + 1}</option>)}
              </Seletor>
            </Campo>
            {emPartes ? (
              <Campo rotulo="Percentual">
                <div className="relative">
                  <Entrada inputMode="decimal" value={p.pct} className="pr-8" onChange={e => setPartes(partes.map((x, k) => (k === i ? { ...x, pct: e.target.value.replace(/[^\d,.]/g, '') } : x)))} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-taupe">%</span>
                </div>
              </Campo>
            ) : <span />}
            <p className={cn('num pb-3 text-sm text-taupe max-sm:col-span-2 max-sm:row-start-2 max-sm:pb-0', !emPartes && 'max-sm:hidden')}>{total ? reais(valores[i] ?? 0) : '—'}</p>
            {emPartes && partes.length > 2 ? (
              <button className="mb-1.5 grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-despesa" aria-label={`Remover parte ${i + 1}`} onClick={() => setPartes(partes.filter((_, k) => k !== i))}><L.X className="h-4 w-4" /></button>
            ) : <span />}
          </li>
        ))}
      </ul>

      {emPartes && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={cn(Math.abs(somaPct - 100) > 0.001 ? 'text-despesa' : 'text-taupe')}>Soma: {String(somaPct).replace('.', ',')}% de 100%</span>
          {partes.length < 4 && <Botao tamanho="sm" variante="fantasma" icone={L.Plus} onClick={() => setPartes([...partes, { dia: 28, pct: '0' }])}>Adicionar parte</Botao>}
        </div>
      )}

      {erro && <p role="alert" className="rounded-xl bg-despesa-fundo px-3 py-2 text-sm text-despesa">{erro}</p>}
      <div className="flex justify-end"><Botao variante="primario" carregando={ocupado} onClick={salvar}>Salvar salário</Botao></div>
    </div>
  )
}
