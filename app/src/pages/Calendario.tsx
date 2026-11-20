import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useDados } from '../lib/dados'
import { eventosDoMes, type EventoCal } from '../lib/motor'
import { dataLonga, diaSemana, fimMes, inicioMes, partes, somaDias } from '../lib/formato'
import { Cabecalho } from '../components/Layout'
import { Botao, Etiqueta, Painel, Valor, Vazio, cn } from '../components/ui'
import { ConfirmarModal } from '../components/Formularios'
import type { Lancamento } from '../lib/tipos'

const COR: Record<EventoCal['tipo'], string> = {
  receita: '#3F6E52', despesa: '#621F32', fatura: '#B0855B', fechamento: '#817678', transferencia: '#4F6A84', meta: '#875364',
}
const ROTULO: Record<EventoCal['tipo'], string> = {
  receita: 'Recebimento', despesa: 'Conta / despesa', fatura: 'Vencimento de fatura', fechamento: 'Fechamento de cartão', transferencia: 'Transferência', meta: 'Meta',
}

export default function Calendario() {
  const { banco, hoje, mesRef } = useDados()
  const [sel, setSel] = useState(inicioMes(hoje) === mesRef ? hoje : mesRef)
  const [conf, setConf] = useState<Lancamento | null>(null)
  const eventos = useMemo(() => eventosDoMes(banco, mesRef, hoje), [banco, mesRef, hoje])
  const porDia = useMemo(() => {
    const m = new Map<string, EventoCal[]>()
    for (const e of eventos) m.set(e.data, [...(m.get(e.data) ?? []), e])
    return m
  }, [eventos])
  if (sel.slice(0, 7) !== mesRef.slice(0, 7)) setSel(inicioMes(hoje) === mesRef ? hoje : mesRef)

  const ini = inicioMes(mesRef)
  const primeiro = somaDias(ini, -diaSemana(ini))
  const ultimo = fimMes(mesRef)
  const dias: string[] = []
  for (let d = primeiro; d <= ultimo || dias.length % 7 !== 0; d = somaDias(d, 1)) dias.push(d)
  const doDia = porDia.get(sel) ?? []
  const lanc = new Map(banco.lancamentos.map(l => [l.id, l]))

  const totMes = eventos.reduce((a, e) => {
    if (e.tipo === 'receita') a.ent += e.valor
    if (e.tipo === 'despesa' || e.tipo === 'fatura') a.sai += e.valor
    return a
  }, { ent: 0, sai: 0 })

  return (
    <div>
      <Cabecalho titulo="Calendário" sub="Recebimentos, vencimentos e faturas do mês." seletorMes />
      <div className="grid gap-4 lg:grid-cols-12">
        <Painel className="p-3 sm:p-5 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-taupe">
            {(['receita', 'despesa', 'fatura', 'fechamento'] as const).map(t => <span key={t} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COR[t] }} />{ROTULO[t]}</span>)}
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-taupe" />previsto</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-taupe">
            {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(d => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Dias do mês">
            {dias.map(d => {
              const ev = porDia.get(d) ?? []
              const fora = d.slice(0, 7) !== mesRef.slice(0, 7)
              const venc = ev.some(e => e.vencido)
              return (
                <button key={d} role="gridcell" aria-selected={sel === d} disabled={fora} onClick={() => setSel(d)}
                  aria-label={`${dataLonga(d)}${ev.length ? `, ${ev.length} eventos` : ''}`}
                  className={cn('relative flex aspect-square flex-col rounded-xl border p-1.5 text-left transition sm:aspect-[1.15] sm:p-2',
                    fora ? 'border-transparent text-taupe/40' : 'border-borda/70 hover:border-vinho-suave/50',
                    sel === d && 'border-vinho bg-vinho-claro/50', d === hoje && sel !== d && 'bg-creme/70', venc && !fora && 'border-despesa/40')}>
                  <span className={cn('num text-[13px] sm:text-sm', d === hoje && 'grid h-6 w-6 place-items-center rounded-full bg-vinho text-marfim')}>{partes(d)[2]}</span>
                  {!fora && ev.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-0.5 sm:gap-1">
                      {ev.slice(0, 4).map((e, i) => <span key={i} className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" style={e.realizado ? { background: COR[e.tipo] } : { border: `1.5px solid ${COR[e.tipo]}` }} />)}
                      {ev.length > 4 && <span className="text-[9px] leading-none text-taupe">+{ev.length - 4}</span>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-borda px-1 pt-3 text-xs text-taupe">
            <span>Entradas no mês <Valor cents={totMes.ent} className="font-medium text-receita" /></span>
            <span>Saídas (contas + faturas) <Valor cents={totMes.sai} className="font-medium text-carvao" /></span>
          </div>
        </Painel>

        <Painel className="lg:col-span-4">
          <div className="border-b border-borda px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-taupe">Dia selecionado</p>
            <p className="mt-0.5 text-[17px] font-semibold first-letter:uppercase">{dataLonga(sel)}</p>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={sel} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {doDia.length === 0 ? <Vazio compacto icone={L.CalendarDays} titulo="Nada neste dia" /> : (
                <ul className="divide-y divide-borda/70">
                  {doDia.map((e, i) => {
                    const l = e.ref ? lanc.get(e.ref) : undefined
                    return (
                      <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={e.realizado ? { background: COR[e.tipo] } : { border: `2px solid ${COR[e.tipo]}` }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{e.titulo}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Etiqueta>{ROTULO[e.tipo]}</Etiqueta>
                            {e.tipo !== 'fechamento' && <Etiqueta tom={e.vencido ? 'despesa' : e.realizado ? 'receita' : 'atencao'}>{e.vencido ? 'vencido' : e.realizado ? 'realizado' : 'previsto'}</Etiqueta>}
                          </div>
                          {l && l.status === 'pendente' && <Botao tamanho="sm" variante="suave" className="mt-2" onClick={() => setConf(l)}>{l.tipo === 'receita' ? 'Confirmar recebimento' : 'Marcar como pago'}</Botao>}
                        </div>
                        <Valor cents={e.valor} className={cn('text-sm font-semibold', e.tipo === 'receita' && 'text-receita')} />
                      </li>
                    )
                  })}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>
        </Painel>
      </div>
      <ConfirmarModal lanc={conf} aoFechar={() => setConf(null)} />
    </div>
  )
}
