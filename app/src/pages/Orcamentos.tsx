import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { motion } from 'motion/react'
import { useDados } from '../lib/dados'
import { orcamentosDoMes, resumoMes } from '../lib/motor'
import { diasEntre, fimMes, inicioMes, nomeMes, partes, ultimoDia } from '../lib/formato'
import type { Categoria } from '../lib/tipos'
import { Cabecalho } from '../components/Layout'
import { Barra, Botao, Etiqueta, IconeCategoria, Painel, TituloPainel, Valor, Vazio, cn } from '../components/ui'
import { OrcamentoModal } from '../components/Formularios'

export default function Orcamentos() {
  const { banco, mesRef, hoje } = useDados()
  const [editar, setEditar] = useState<{ c: Categoria; l: number | null } | null>(null)
  const linhas = useMemo(() => orcamentosDoMes(banco, mesRef).filter(o => !o.categoria.oculta || o.usado > 0), [banco, mesRef])
  const com = linhas.filter(o => o.limite != null && o.limite > 0).sort((a, z) => (z.pct ?? 0) - (a.pct ?? 0))
  const sem = linhas.filter(o => o.limite == null || o.limite === 0).sort((a, z) => z.usado - a.usado)
  const orcado = com.reduce((a, o) => a + o.limite!, 0)
  const usado = com.reduce((a, o) => a + o.usado, 0)
  const excesso = com.reduce((a, o) => a + Math.max(0, o.usado - o.limite!), 0)
  const r = resumoMes(banco, mesRef)
  const objetivo = banco.config?.objetivo_economia_cents ?? 0
  const mesAtual = inicioMes(hoje) === mesRef
  const [a, m] = partes(mesRef)
  const progressoMes = mesAtual ? ((diasEntre(inicioMes(hoje), hoje) + 1) / ultimoDia(a, m)) * 100 : 100

  return (
    <div>
      <Cabecalho titulo="Orçamentos" sub="Quanto você pretende gastar em cada categoria." seletorMes />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Painel className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-[13px] text-taupe">Usado do orçamento em {nomeMes(mesRef, false).toLowerCase()}</p>
              <p className="mt-1"><Valor cents={usado} className="cifra text-[30px]" /> <span className="text-taupe">de <Valor cents={orcado} /></span></p></div>
            <div className="text-right"><p className="text-[13px] text-taupe">Restante</p><Valor cents={orcado - usado} className={cn('cifra text-[22px]', orcado - usado < 0 && 'text-despesa')} /></div>
          </div>
          <div className="relative mt-4">
            <Barra pct={orcado ? (usado / orcado) * 100 : 0} tom="auto" rotulo="Orçamento total" />
            {mesAtual && <span className="absolute -top-1 h-4 w-px bg-carvao/40" style={{ left: `${progressoMes}%` }} title="Hoje" />}
          </div>
          {mesAtual && <p className="mt-2 text-xs text-taupe">A marca indica quanto do mês já passou ({Math.round(progressoMes)}%).</p>}
        </Painel>
        <Painel className={cn('p-5', excesso > 0 && 'border-despesa/25')}>
          <p className="flex items-center gap-1.5 text-[13px] text-taupe"><L.Target className="h-4 w-4 text-vinho-suave" />Impacto na economia</p>
          {excesso > 0 ? (<>
            <p className="mt-2 text-sm">Gastos acima do limite somam <Valor cents={excesso} className="font-semibold text-despesa" />.</p>
            {objetivo > 0 && <p className="mt-1 text-xs text-taupe">Isso equivale a {Math.round((excesso / objetivo) * 100)}% do seu objetivo mensal de economia (<Valor cents={objetivo} />).</p>}
            <ul className="mt-3 space-y-1 text-xs">{com.filter(o => o.usado > o.limite!).map(o => <li key={o.categoria.id} className="flex justify-between"><span>{o.categoria.nome}</span><Valor cents={o.usado - o.limite!} className="text-despesa" sinal /></li>)}</ul>
          </>) : <p className="mt-2 text-sm text-taupe">Nenhuma categoria acima do limite{com.length ? ' neste mês.' : '. Defina limites para acompanhar.'}</p>}
          <p className="mt-3 border-t border-borda pt-3 text-xs text-taupe">Economia realizada no mês: <Valor cents={r.economia} className="font-medium text-carvao" />{objetivo > 0 && <> de <Valor cents={objetivo} /></>}</p>
        </Painel>
      </div>

      <Painel>
        <TituloPainel titulo="Categorias com limite" sub="Alerta em 80% e 100% do limite" />
        {com.length === 0 ? <Vazio compacto icone={L.ChartPie} titulo="Nenhum limite definido" texto="Escolha uma categoria abaixo e defina quanto pretende gastar por mês." /> : (
          <ul className="divide-y divide-borda/70">
            {com.map((o, i) => (
              <motion.li key={o.categoria.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-5 py-4 sm:grid-cols-[auto_200px_1fr_auto]">
                <IconeCategoria cor={o.categoria.cor} icone={o.categoria.icone} />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">{o.categoria.nome}
                    {o.pct! >= 100 ? <Etiqueta tom="despesa">100%+</Etiqueta> : o.pct! >= 80 ? <Etiqueta tom="atencao">{Math.round(o.pct!)}%</Etiqueta> : null}</p>
                  <p className="text-xs text-taupe"><Valor cents={o.usado} /> de <Valor cents={o.limite!} /></p>
                </div>
                <div className="col-span-3 sm:col-span-1"><Barra pct={o.pct!} tom="auto" rotulo={o.categoria.nome} />
                  <p className="mt-1 text-xs text-taupe">{o.restante! >= 0 ? <>Restam <Valor cents={o.restante!} /></> : <span className="text-despesa">Passou <Valor cents={-o.restante!} /></span>} · {Math.round(o.pct!)}%</p></div>
                <Botao tamanho="sm" variante="fantasma" className="col-start-3 row-start-1 sm:col-start-4" onClick={() => setEditar({ c: o.categoria, l: o.limite })}>Ajustar</Botao>
              </motion.li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel className="mt-4">
        <TituloPainel titulo="Sem limite definido" sub="Gasto no mês por categoria" />
        {sem.length === 0 ? <p className="px-5 pb-5 text-sm text-taupe">Todas as categorias têm limite.</p> : (
          <ul className="grid gap-px bg-borda/60 sm:grid-cols-2">
            {sem.map(o => (
              <li key={o.categoria.id} className="flex items-center gap-3 bg-cartao px-5 py-3">
                <IconeCategoria cor={o.categoria.cor} icone={o.categoria.icone} tamanho="sm" />
                <span className="flex-1 text-sm">{o.categoria.nome}</span>
                <Valor cents={o.usado} className="text-sm text-taupe" />
                <Botao tamanho="sm" variante="suave" onClick={() => setEditar({ c: o.categoria, l: null })}>Definir</Botao>
              </li>
            ))}
          </ul>
        )}
      </Painel>
      <p className="mt-3 px-1 text-xs text-taupe">Os gastos consideram despesas pagas e parcelas de cartão do mês ({nomeMes(mesRef)}, até {fimMes(mesRef).slice(8)}). Mudar um limite não apaga os limites de meses anteriores.</p>

      <OrcamentoModal categoria={editar?.c ?? null} limiteAtual={editar?.l ?? null} aoFechar={() => setEditar(null)} />
    </div>
  )
}
