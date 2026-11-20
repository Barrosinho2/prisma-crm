import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import * as L from 'lucide-react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDados } from '../lib/dados'
import {
  disponivelParaGastar, porCategoria, resumoMes, saldoMeta, saldos, serieFluxo, statusVisivel, infoFaturas, type Periodo,
} from '../lib/motor'
import { dataBR, diasEntre, fimMes, inicioMes, mesCurto, nomeMes, somaMeses } from '../lib/formato'
import { Cabecalho, useNovaTransacao } from '../components/Layout'
import { Abas, Barra, Botao, Dica, Etiqueta, IconeCategoria, NumeroAnimado, Painel, TituloPainel, Valor, Vazio, cn } from '../components/ui'
import { CORES_GRAF, DicaGrafico, eixo, useFmtEixo } from '../components/Graficos'
import { ConfirmarModal } from '../components/Formularios'
import type { Lancamento } from '../lib/tipos'

const entrada = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.04 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } })

export function Dashboard() {
  const { banco, hoje, mesRef, salvarConfig } = useDados()
  const nova = useNovaTransacao()
  const [periodo, setPeriodo] = useState<Periodo>('6m')
  const [confirmar, setConfirmar] = useState<Lancamento | null>(null)
  const [selecionadas, setSelecionadas] = useState<string[] | null>(() => {
    try { const v = localStorage.getItem('fin:contas-dash'); return v ? JSON.parse(v) : null } catch { return null }
  })
  const [escolher, setEscolher] = useState(false)
  const oculto = !!banco.config?.ocultar_valores

  const d = useMemo(() => {
    const s = saldos(banco)
    const ativas = banco.contas.filter(c => !c.arquivada)
    const sel = ativas.filter(c => !selecionadas || selecionadas.includes(c.id))
    const saldoSel = sel.reduce((a, c) => a + (s.get(c.id) ?? 0), 0)
    const r = resumoMes(banco, mesRef)
    const rAnt = resumoMes(banco, somaMeses(mesRef, -1))
    const previsto = banco.lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pendente' && l.data_prevista >= inicioMes(mesRef) && l.data_prevista <= fimMes(mesRef)).reduce((a, l) => a + l.valor_cents, 0)
    const cats = porCategoria(banco, inicioMes(mesRef), fimMes(mesRef))
    const catsAnt = new Map(porCategoria(banco, inicioMes(somaMeses(mesRef, -1)), fimMes(somaMeses(mesRef, -1))).map(x => [x.categoria?.id ?? '_', x.valor]))
    const disp = disponivelParaGastar(banco, hoje)
    const ultimas = [
      ...banco.lancamentos.filter(l => l.status === 'efetivado' && !l.compra_id).map(l => ({ id: l.id, data: l.data_efetiva!, desc: l.descricao, valor: l.tipo === 'receita' ? l.valor_cents : -l.valor_cents, cat: l.categoria_id, extra: banco.contas.find(c => c.id === l.conta_id)?.nome })),
      ...banco.compras.filter(c => !c.cancelada).map(c => ({ id: c.id, data: c.data_compra, desc: c.descricao, valor: -c.valor_total_cents, cat: c.categoria_id, extra: (banco.cartoes.find(k => k.id === c.cartao_id)?.nome ?? 'Cartão') + (c.parcelas > 1 ? ` · ${c.parcelas}x` : '') })),
    ].sort((a, z) => z.data.localeCompare(a.data)).slice(0, 6)
    const faturas = [...infoFaturas(banco, hoje).values()].filter(i => i.restante > 0)
    const proximas = [
      ...banco.lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pendente').map(l => ({ id: l.id, data: l.data_prevista, desc: l.descricao, valor: l.valor_cents, lanc: l, fatura: false })),
      ...faturas.map(i => ({ id: i.fatura.id, data: i.fatura.vencimento, desc: `Fatura ${banco.cartoes.find(c => c.id === i.fatura.cartao_id)?.nome ?? ''}`, valor: i.restante, lanc: null, fatura: true })),
    ].sort((a, z) => a.data.localeCompare(z.data)).slice(0, 5)
    const metas = banco.metas.filter(m => !m.arquivada).map(m => ({ m, g: saldoMeta(banco, m.id) })).slice(0, 4)
    const temDados = banco.lancamentos.some(l => l.status === 'efetivado') || banco.compras.length > 0
    return { s, ativas, sel, saldoSel, r, rAnt, previsto, cats, catsAnt, disp, ultimas, proximas, metas, temDados }
  }, [banco, mesRef, hoje, selecionadas])

  const serie = useMemo(() => serieFluxo(banco, periodo, periodo === 'semana' ? hoje : mesRef === inicioMes(hoje) ? hoje : fimMes(mesRef)), [banco, periodo, mesRef, hoje])
  const fmtEixo = useFmtEixo()
  const cats = useMemo(() => banco.categorias.reduce((m, c) => m.set(c.id, c), new Map<string, (typeof banco.categorias)[0]>()), [banco.categorias])
  const totalCat = d.cats.reduce((a, x) => a + x.valor, 0)
  const maior = d.cats[0]
  const variacao = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null)
  const varDesp = variacao(d.r.despesa, d.rAnt.despesa)
  const varRec = variacao(d.r.receita, d.rAnt.receita)
  const objetivo = banco.config?.objetivo_economia_cents ?? 0
  const mesAtual = mesRef === inicioMes(hoje)

  const salvarSel = (v: string[] | null) => {
    setSelecionadas(v)
    try { v ? localStorage.setItem('fin:contas-dash', JSON.stringify(v)) : localStorage.removeItem('fin:contas-dash') } catch { /* sem armazenamento */ }
  }

  return (
    <div>
      <Cabecalho titulo="Bem-vindo de volta." sub="Seu dinheiro, suas decisões, seu futuro." seletorMes
        acoes={<Botao variante="secundario" tamanho="icone" className="h-10 w-10" onClick={() => salvarConfig({ ocultar_valores: !oculto })} aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'} title={oculto ? 'Mostrar valores' : 'Ocultar valores'}>
          {oculto ? <L.EyeOff className="h-4 w-4" /> : <L.Eye className="h-4 w-4" />}
        </Botao>} />

      {banco.contas.length === 0 && (
        <motion.div {...entrada(0)}>
          <Painel className="mb-6 flex flex-col gap-4 border-vinho-suave/30 bg-gradient-to-br from-cartao to-vinho-claro/60 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="titulo text-xl">Vamos começar pelo essencial</p>
              <p className="mt-1 max-w-xl text-sm text-taupe">Cadastre suas contas com o saldo de hoje, seu salário e as despesas fixas. Leva poucos minutos e você pode pular etapas.</p>
            </div>
            <Link to="/configuracoes?inicio=1"><Botao variante="primario" icone={L.ArrowRight}>Configuração inicial</Botao></Link>
          </Painel>
        </motion.div>
      )}

      {/* indicadores */}
      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div {...entrada(1)} className="lg:col-span-5">
          <div className="relative h-full overflow-hidden rounded-2xl bg-vinho-escuro p-6 text-marfim shadow-elevada">
            <svg className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 opacity-[0.12]" viewBox="0 0 200 200" aria-hidden>
              <circle cx="100" cy="100" r="98" fill="none" stroke="#F8F5F0" /><circle cx="100" cy="100" r="70" fill="none" stroke="#F8F5F0" /><circle cx="100" cy="100" r="42" fill="none" stroke="#F8F5F0" />
            </svg>
            <div className="flex items-center gap-2 text-[13px] text-[#E4CBD2]">
              Disponível para gastar
              <Dica texto="Saldo das contas de uso livre, menos contas a pagar e faturas que vencem até o fim do mês, menos o que está separado em metas. Receitas ainda não recebidas não entram." />
            </div>
            <NumeroAnimado cents={d.disp.valor} className={cn('titulo mt-2 block text-[40px] leading-none sm:text-[46px]', d.disp.valor < 0 && 'text-[#F2B8B8]')} />
            <p className="mt-2 text-[13px] text-[#CDB9BF]">até {dataBR(fimMes(hoje))}</p>
            <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-[13px]">
              {[
                ['Saldo em contas livres', d.disp.saldoLivre, 1],
                ['Contas a pagar no mês', d.disp.contasPendentes, -1],
                ['Faturas a vencer no mês', d.disp.faturas, -1],
                ['Separado em metas', d.disp.reservado, -1],
              ].map(([r, v, s]) => (
                <div key={r as string} className="flex items-center justify-between text-[#E9DCDF]">
                  <span>{r as string}</span>
                  <Valor cents={(v as number) * (s as number)} sinal={(s as number) < 0 && (v as number) > 0} className="text-marfim" />
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-7">
          <motion.div {...entrada(2)}>
            <Painel className="relative h-full p-5">
              <div className="flex items-center justify-between text-[13px] text-taupe">
                <span className="flex items-center gap-1.5"><L.Landmark className="h-4 w-4 text-vinho-suave" strokeWidth={1.6} />Saldo disponível</span>
                <button onClick={() => setEscolher(v => !v)} className="rounded-lg p-1 hover:bg-creme" aria-label="Escolher contas" title="Escolher contas"><L.SlidersHorizontal className="h-3.5 w-3.5" /></button>
              </div>
              <NumeroAnimado cents={d.saldoSel} className="titulo mt-3 block text-[26px] leading-tight sm:text-[30px]" />
              <p className="mt-1.5 text-xs text-taupe">{d.sel.length === d.ativas.length ? `Todas as ${d.ativas.length} contas` : `${d.sel.length} de ${d.ativas.length} contas`}</p>
              {escolher && (<>
                <div className="fixed inset-0 z-20" onClick={() => setEscolher(false)} />
                <div className="absolute right-3 top-12 z-30 w-56 rounded-xl border border-borda bg-cartao p-2 shadow-elevada">
                  {d.ativas.length === 0 && <p className="p-2 text-xs text-taupe">Nenhuma conta.</p>}
                  {d.ativas.map(c => {
                    const on = !selecionadas || selecionadas.includes(c.id)
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-creme">
                        <input type="checkbox" checked={on} className="accent-[#621F32]" onChange={() => {
                          const atual = selecionadas ?? d.ativas.map(x => x.id)
                          const nv = on ? atual.filter(x => x !== c.id) : [...atual, c.id]
                          salvarSel(nv.length === d.ativas.length ? null : nv)
                        }} />
                        <span className="flex-1 truncate">{c.nome}</span>
                      </label>
                    )
                  })}
                </div>
              </>)}
            </Painel>
          </motion.div>
          <motion.div {...entrada(3)}>
            <Indicador icone={L.ArrowDownLeft} rotulo="Receita do mês" cents={d.r.receita} cor="text-receita"
              rodape={d.previsto > 0 ? <>+ <Valor cents={d.previsto} /> previsto</> : varRec != null && d.rAnt.receita ? `${varRec >= 0 ? '+' : ''}${varRec}% vs ${mesCurto(somaMeses(mesRef, -1))}` : 'recebido no período'} />
          </motion.div>
          <motion.div {...entrada(4)}>
            <Indicador icone={L.ArrowUpRight} rotulo="Despesas do mês" cents={d.r.despesa} cor="text-despesa"
              dica="Consumo do mês: despesas pagas pela conta e parcelas de cartão do mês. Pagamento de fatura e transferências não entram."
              rodape={varDesp != null && d.rAnt.despesa ? <span className={varDesp > 0 ? 'text-despesa' : 'text-receita'}>{varDesp > 0 ? '▲' : '▼'} {Math.abs(varDesp)}% vs {mesCurto(somaMeses(mesRef, -1))}</span> : 'sem duplicações'} />
          </motion.div>
          <motion.div {...entrada(5)}>
            <Indicador icone={L.PiggyBank} rotulo="Economia do mês" cents={d.r.economia} cor="text-vinho"
              dica="Valor guardado em metas e reservas no mês (aportes menos retiradas). Não é despesa."
              rodape={objetivo > 0 ? <div className="mt-1"><Barra pct={(d.r.economia / objetivo) * 100} tom="vinho" fina rotulo="Objetivo de economia" /><span className="mt-1 block">de <Valor cents={objetivo} curto /> planejados</span></div> : <Link to="/configuracoes" className="underline-offset-2 hover:underline">definir objetivo mensal</Link>} />
          </motion.div>
        </div>
      </div>

      {/* fluxo + distribuição */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <motion.div {...entrada(6)} className="lg:col-span-8">
          <Painel className="h-full">
            <TituloPainel titulo="Fluxo financeiro" sub="Receitas recebidas, despesas e resultado"
              acao={<Abas valor={periodo} aoMudar={setPeriodo} opcoes={[{ v: 'semana', r: '7d' }, { v: 'mes', r: 'Mês' }, { v: '3m', r: '3m' }, { v: '6m', r: '6m' }, { v: 'ano', r: 'Ano' }]} />} />
            <div className="h-[280px] px-2 pb-4">
              {d.temDados ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={serie} margin={{ top: 10, right: 12, left: 4, bottom: 0 }} barGap={4}>
                    <CartesianGrid stroke={CORES_GRAF.grade} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
                    <YAxis tick={eixo} axisLine={false} tickLine={false} tickFormatter={fmtEixo} width={64} />
                    <Tooltip content={<DicaGrafico rotulos={{ receitas: 'Receitas', despesas: 'Despesas', resultado: 'Resultado' }} />} cursor={{ fill: '#EEE9E2', opacity: 0.5 }} />
                    <Bar dataKey="receitas" fill={CORES_GRAF.receitas} radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={700} />
                    <Bar dataKey="despesas" fill={CORES_GRAF.despesas} radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={700} />
                    <Line dataKey="resultado" stroke={CORES_GRAF.resultado} strokeWidth={2} dot={{ r: 3, fill: CORES_GRAF.resultado }} type="monotone" animationDuration={900} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <Vazio compacto icone={L.ChartColumn} titulo="Sem movimentações ainda" texto="O gráfico aparece assim que você registrar receitas ou despesas." acao={<Botao variante="suave" icone={L.Plus} onClick={() => nova()}>Nova transação</Botao>} />}
            </div>
            {d.temDados && (
              <div className="flex flex-wrap gap-4 border-t border-borda px-5 py-3 text-xs text-taupe">
                <Legenda cor={CORES_GRAF.receitas} r="Receitas" /><Legenda cor={CORES_GRAF.despesas} r="Despesas" /><Legenda cor={CORES_GRAF.resultado} r="Resultado" linha />
              </div>
            )}
          </Painel>
        </motion.div>

        <motion.div {...entrada(7)} className="lg:col-span-4">
          <Painel className="h-full">
            <TituloPainel titulo="Distribuição de despesas" sub={nomeMes(mesRef)} />
            {totalCat > 0 ? (
              <div className="px-5 pb-5">
                <div className="relative mx-auto h-[180px] w-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={d.cats.map(x => ({ name: x.categoria?.nome ?? 'Sem categoria', value: x.valor, cor: x.categoria?.cor ?? '#BDB3B5' }))} dataKey="value" innerRadius={62} outerRadius={86} paddingAngle={2} stroke="none" animationDuration={800}>
                        {d.cats.map((x, i) => <Cell key={i} fill={x.categoria?.cor ?? '#BDB3B5'} />)}
                      </Pie>
                      <Tooltip content={<DicaGrafico />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div><p className="text-[11px] text-taupe">Total</p><Valor cents={totalCat} curto className="titulo text-lg" /></div>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {d.cats.slice(0, 5).map(x => (
                    <li key={x.categoria?.id ?? '_'} className="flex items-center gap-2 text-[13px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: x.categoria?.cor ?? '#BDB3B5' }} />
                      <span className="flex-1 truncate">{x.categoria?.nome ?? 'Sem categoria'}</span>
                      <span className="num text-taupe">{Math.round((x.valor / totalCat) * 100)}%</span>
                      <Valor cents={x.valor} className="w-24 text-right font-medium" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : <Vazio compacto icone={L.ChartPie} titulo="Nenhuma despesa no mês" texto="As categorias aparecem aqui conforme você registra gastos." />}
          </Painel>
        </motion.div>
      </div>

      {/* destaques */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
        <motion.div {...entrada(8)} className="lg:col-span-5">
          <Painel className="h-full">
            <TituloPainel titulo="Últimas transações" acao={<Link to="/transacoes" className="text-[13px] font-medium text-vinho hover:underline">Ver todas</Link>} />
            {d.ultimas.length ? (
              <ul className="divide-y divide-borda/70 px-2 pb-2">
                {d.ultimas.map(u => {
                  const c = u.cat ? cats.get(u.cat) : null
                  return (
                    <li key={u.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                      <IconeCategoria cor={c?.cor ?? '#817678'} icone={c?.icone ?? (u.valor > 0 ? 'trending-up' : 'receipt')} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{u.desc}</p><p className="truncate text-xs text-taupe">{dataBR(u.data)} · {u.extra}</p></div>
                      <Valor cents={u.valor} sinal className={cn('text-sm font-medium', u.valor > 0 ? 'text-receita' : 'text-carvao')} />
                    </li>
                  )
                })}
              </ul>
            ) : <Vazio compacto icone={L.Receipt} titulo="Nada por aqui ainda" />}
          </Painel>
        </motion.div>

        <motion.div {...entrada(9)} className="lg:col-span-4">
          <Painel className="h-full">
            <TituloPainel titulo="Próximos vencimentos" acao={<Link to="/a-pagar" className="text-[13px] font-medium text-vinho hover:underline">Ver todos</Link>} />
            {d.proximas.length ? (
              <ul className="space-y-1 px-2 pb-3">
                {d.proximas.map(p => {
                  const dias = diasEntre(hoje, p.data)
                  const st = p.lanc ? statusVisivel(p.lanc, hoje) : dias < 0 ? 'vencido' : 'pendente'
                  return (
                    <li key={p.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-marfim">
                      <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-center leading-none', st === 'vencido' ? 'border-despesa/30 bg-despesa-fundo text-despesa' : 'border-borda bg-marfim')}>
                        <div><p className="text-[15px] font-semibold">{p.data.slice(8)}</p><p className="text-[9.5px] uppercase">{mesCurto(p.data)}</p></div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.desc}</p>
                        <p className={cn('text-xs', st === 'vencido' ? 'text-despesa' : 'text-taupe')}>{st === 'vencido' ? `vencida há ${-dias} ${-dias === 1 ? 'dia' : 'dias'}` : dias === 0 ? 'vence hoje' : `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}</p>
                      </div>
                      <div className="text-right">
                        <Valor cents={p.valor} className="text-sm font-medium" />
                        {p.lanc ? <button onClick={() => setConfirmar(p.lanc)} className="block text-xs font-medium text-vinho opacity-80 hover:underline sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">Pagar</button>
                          : <Link to="/cartoes" className="block text-xs font-medium text-vinho opacity-80 hover:underline sm:opacity-0 sm:group-hover:opacity-100">Ver fatura</Link>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : <Vazio compacto icone={L.CalendarCheck} titulo="Nenhuma conta pendente" />}
          </Painel>
        </motion.div>

        <motion.div {...entrada(10)} className="md:col-span-2 lg:col-span-3">
          <div className="grid h-full gap-4">
            <Painel>
              <TituloPainel titulo="Metas" acao={<Link to="/metas" className="text-[13px] font-medium text-vinho hover:underline">Abrir</Link>} />
              {d.metas.length ? (
                <ul className="space-y-4 px-5 pb-5">
                  {d.metas.map(({ m, g }) => (
                    <li key={m.id}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]"><span className="truncate font-medium">{m.nome}</span><span className="num text-taupe">{Math.min(100, Math.round((g / m.alvo_cents) * 100))}%</span></div>
                      <Barra pct={(g / m.alvo_cents) * 100} tom="vinho" fina rotulo={m.nome} />
                    </li>
                  ))}
                </ul>
              ) : <Vazio compacto icone={L.Target} titulo="Sem metas" acao={<Link to="/metas"><Botao tamanho="sm" variante="suave">Criar meta</Botao></Link>} />}
            </Painel>
            <Painel className="p-5">
              <p className="text-[13px] text-taupe">Maior gasto do mês</p>
              {maior ? (<>
                <p className="mt-1 font-medium">{maior.categoria?.nome ?? 'Sem categoria'}</p>
                <p className="mt-0.5 text-xs text-taupe"><Valor cents={maior.valor} /> · {Math.round((maior.valor / totalCat) * 100)}% do total{(() => {
                  const ant = d.catsAnt.get(maior.categoria?.id ?? '_')
                  if (!ant) return ''
                  const v = Math.round(((maior.valor - ant) / ant) * 100)
                  return ` · ${v >= 0 ? '+' : ''}${v}% vs mês anterior`
                })()}</p>
              </>) : <p className="mt-1 text-sm text-taupe">—</p>}
              {!mesAtual && <Etiqueta tom="vinho" className="mt-3">{nomeMes(mesRef)}</Etiqueta>}
            </Painel>
          </div>
        </motion.div>
      </div>

      <ConfirmarModal lanc={confirmar} aoFechar={() => setConfirmar(null)} />
    </div>
  )
}

function Indicador({ icone: Ic, rotulo, cents, cor, rodape, dica }: { icone: L.LucideIcon; rotulo: string; cents: number; cor: string; rodape?: React.ReactNode; dica?: string }) {
  return (
    <Painel className="h-full p-5">
      <div className="flex items-center gap-1.5 text-[13px] text-taupe">
        <Ic className={cn('h-4 w-4', cor)} strokeWidth={1.8} />{rotulo}{dica && <Dica texto={dica} />}
      </div>
      <NumeroAnimado cents={cents} className="titulo mt-3 block text-[26px] leading-tight sm:text-[30px]" />
      {rodape && <div className="mt-1.5 text-xs text-taupe">{rodape}</div>}
    </Painel>
  )
}
function Legenda({ cor, r, linha }: { cor: string; r: string; linha?: boolean }) {
  return <span className="flex items-center gap-1.5"><span className={linha ? 'h-0.5 w-3 rounded' : 'h-2.5 w-2.5 rounded-[3px]'} style={{ background: cor }} />{r}</span>
}
