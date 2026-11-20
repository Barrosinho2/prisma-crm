import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useDados } from '../lib/dados'
import {
  analise, consumo, economiaPeriodo, porCategoria, projetar, receitasRecebidas, saidasCaixa, saldoMeta, serieSaldo, soma, type Cenario,
} from '../lib/motor'
import { dataBR, fimMes, inicioMes, mesCurto, nomeMes, somaMeses } from '../lib/formato'
import { Cabecalho } from '../components/Layout'
import { Abas, Barra, Botao, Campo, CampoValor, Etiqueta, IconeCategoria, Painel, Seletor, TituloPainel, Valor, Vazio, cn, useAcao, useAvisos } from '../components/ui'
import { CORES_GRAF, DicaGrafico, eixo, useFmtEixo } from '../components/Graficos'
import { MenuExportar } from '../components/MenuExportar'
import type { Tabela } from '../lib/exportar'

type Rel = 'fluxo' | 'categorias' | 'saldo' | 'economia' | 'recorrentes' | 'comparacao' | 'metas' | 'projecao'
const RELS: { v: Rel; r: string; i: L.LucideIcon }[] = [
  { v: 'fluxo', r: 'Receitas × despesas', i: L.ChartColumn },
  { v: 'categorias', r: 'Por categoria', i: L.ChartPie },
  { v: 'saldo', r: 'Evolução do saldo', i: L.ChartLine },
  { v: 'economia', r: 'Economia mensal', i: L.PiggyBank },
  { v: 'recorrentes', r: 'Gastos recorrentes', i: L.Repeat },
  { v: 'comparacao', r: 'Comparar meses', i: L.ArrowLeftRight },
  { v: 'metas', r: 'Progresso das metas', i: L.Target },
  { v: 'projecao', r: 'Projeção e simulação', i: L.TrendingUp },
]

export default function Relatorios() {
  const { banco, hoje } = useDados()
  const [rel, setRel] = useState<Rel>('fluxo')
  const insights = useMemo(() => analise(banco, hoje), [banco, hoje])

  return (
    <div>
      <Cabecalho titulo="Relatórios" sub="Entenda seus hábitos e para onde o dinheiro vai." />

      <Painel className="mb-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-borda bg-gradient-to-r from-vinho-claro/50 to-transparent px-5 py-4">
          <L.Lightbulb className="h-4 w-4 text-vinho" /><h2 className="titulo text-lg">Análise financeira</h2>
          <span className="ml-auto text-xs text-taupe">calculada com seus dados</span>
        </div>
        {insights.length === 0 ? <p className="px-5 py-4 text-sm text-taupe">Sem observações por enquanto.</p> : (
          <ul className="grid gap-px bg-borda/60 md:grid-cols-2 md:[&>li:last-child:nth-child(odd)]:col-span-2">
            {insights.map((x, i) => (
              <li key={i} className="flex items-start gap-3 bg-cartao px-5 py-3.5 text-sm">
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.tom === 'alerta' ? 'bg-despesa' : x.tom === 'atencao' ? 'bg-atencao' : x.tom === 'bom' ? 'bg-receita' : 'bg-vinho-suave')} />
                <p className="leading-relaxed">{x.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Relatórios" className="rolagem-fina -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {RELS.map(r => (
            <button key={r.v} onClick={() => setRel(r.v)} aria-current={rel === r.v}
              className={cn('flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition', rel === r.v ? 'bg-cartao font-medium text-carvao shadow-suave' : 'text-taupe hover:bg-creme/70 hover:text-carvao')}>
              <r.i className={cn('h-4 w-4', rel === r.v && 'text-vinho')} strokeWidth={1.7} />{r.r}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {rel === 'fluxo' && <RelFluxo />}
          {rel === 'categorias' && <RelCategorias />}
          {rel === 'saldo' && <RelSaldo />}
          {rel === 'economia' && <RelEconomia />}
          {rel === 'recorrentes' && <RelRecorrentes />}
          {rel === 'comparacao' && <RelComparacao />}
          {rel === 'metas' && <RelMetas />}
          {rel === 'projecao' && <RelProjecao />}
        </div>
      </div>
    </div>
  )
}

function useMeses(n: number) {
  const { hoje } = useDados()
  return Array.from({ length: n }, (_, i) => somaMeses(inicioMes(hoje), i - n + 1))
}
function Grafico({ children, altura = 300 }: { children: React.ReactElement; altura?: number }) {
  return <div className="px-2 pb-4" style={{ height: altura }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
}
function Cab({ titulo, sub, acao, exportar }: { titulo: string; sub?: string; acao?: React.ReactNode; exportar?: () => Tabela }) {
  return <TituloPainel titulo={titulo} sub={sub} acao={<div className="flex flex-wrap items-center gap-2">{acao}{exportar && <MenuExportar gerar={exportar} />}</div>} />
}

// ------------------------------------------------------------- 1. receitas x despesas
function RelFluxo() {
  const { banco } = useDados()
  const [n, setN] = useState<'6' | '12'>('12')
  const [criterio, setCriterio] = useState<'competencia' | 'caixa'>('competencia')
  const meses = useMeses(Number(n))
  const fmt = useFmtEixo()
  const dados = meses.map(m => {
    const r = receitasRecebidas(banco, m, fimMes(m)).reduce((a, l) => a + l.valor_cents, 0)
    const d = criterio === 'competencia' ? soma(consumo(banco, m, fimMes(m))) : saidasCaixa(banco, m, fimMes(m))
    return { rotulo: mesCurto(m, true), receitas: r, despesas: d, resultado: r - d }
  })
  const tot = dados.reduce((a, x) => ({ r: a.r + x.receitas, d: a.d + x.despesas }), { r: 0, d: 0 })
  return (
    <Painel>
      <Cab titulo="Receitas × despesas" sub={criterio === 'competencia' ? 'Despesas por consumo: compras no cartão contam parcela a parcela.' : 'Fluxo de caixa: o que saiu das contas, incluindo pagamentos de fatura.'}
        acao={<><Abas valor={criterio} aoMudar={setCriterio} opcoes={[{ v: 'competencia', r: 'Consumo' }, { v: 'caixa', r: 'Caixa' }]} /><Abas valor={n} aoMudar={setN} opcoes={[{ v: '6', r: '6m' }, { v: '12', r: '12m' }]} /></>}
        exportar={() => ({ titulo: 'Receitas x despesas', colunas: ['Mês', 'Receitas', 'Despesas', 'Resultado'], linhas: dados.map(x => [x.rotulo, x.receitas, x.despesas, x.resultado]), dinheiro: [1, 2, 3] })} />
      <div className="grid grid-cols-3 gap-3 px-5 pb-2 text-sm">
        <div><p className="text-xs text-taupe">Receitas</p><Valor cents={tot.r} className="font-semibold text-receita" /></div>
        <div><p className="text-xs text-taupe">Despesas</p><Valor cents={tot.d} className="font-semibold" /></div>
        <div><p className="text-xs text-taupe">Resultado</p><Valor cents={tot.r - tot.d} className={cn('font-semibold', tot.r - tot.d < 0 && 'text-despesa')} /></div>
      </div>
      <Grafico>
        <ComposedChart data={dados} margin={{ top: 10, right: 12, left: 4 }}>
          <CartesianGrid stroke={CORES_GRAF.grade} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
          <YAxis tick={eixo} axisLine={false} tickLine={false} tickFormatter={fmt} width={64} />
          <Tooltip content={<DicaGrafico rotulos={{ receitas: 'Receitas', despesas: 'Despesas', resultado: 'Resultado' }} />} cursor={{ fill: '#EEE9E2', opacity: 0.5 }} />
          <ReferenceLine y={0} stroke="#D8CFCA" />
          <Bar dataKey="receitas" fill={CORES_GRAF.receitas} radius={[5, 5, 0, 0]} maxBarSize={20} />
          <Bar dataKey="despesas" fill={CORES_GRAF.despesas} radius={[5, 5, 0, 0]} maxBarSize={20} />
          <Line dataKey="resultado" stroke={CORES_GRAF.resultado} strokeWidth={2} dot={{ r: 2.5 }} type="monotone" />
        </ComposedChart>
      </Grafico>
    </Painel>
  )
}

// ------------------------------------------------------------- 2. por categoria
function RelCategorias() {
  const { banco, hoje } = useDados()
  const [p, setP] = useState<'1' | '3' | '6' | '12'>('1')
  const de = somaMeses(inicioMes(hoje), -(Number(p) - 1)), ate = fimMes(hoje)
  const cats = porCategoria(banco, de, ate)
  const total = cats.reduce((a, x) => a + x.valor, 0)
  return (
    <Painel>
      <Cab titulo="Gastos por categoria" sub={`${dataBR(de)} a ${dataBR(ate)}`} acao={<Abas valor={p} aoMudar={setP} opcoes={[{ v: '1', r: 'Mês' }, { v: '3', r: '3m' }, { v: '6', r: '6m' }, { v: '12', r: '12m' }]} />}
        exportar={() => ({ titulo: 'Gastos por categoria', colunas: ['Categoria', 'Valor', '% do total', 'Média mensal'], linhas: cats.map(x => [x.categoria?.nome ?? 'Sem categoria', x.valor, `${((x.valor / total) * 100).toFixed(1)}%`, Math.round(x.valor / Number(p))]), dinheiro: [1, 3] })} />
      {total === 0 ? <Vazio compacto icone={L.ChartPie} titulo="Sem gastos no período" /> : (
        <ul className="space-y-4 px-5 pb-5">
          {cats.map(x => (
            <li key={x.categoria?.id ?? '_'} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <IconeCategoria cor={x.categoria?.cor ?? '#817678'} icone={x.categoria?.icone ?? 'circle'} tamanho="sm" />
              <div>
                <div className="mb-1 flex justify-between text-sm"><span>{x.categoria?.nome ?? 'Sem categoria'}</span><span className="num text-xs text-taupe">{((x.valor / total) * 100).toFixed(1)}%{Number(p) > 1 && <> · média <Valor cents={Math.round(x.valor / Number(p))} curto />/mês</>}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-creme"><div className="h-full rounded-full" style={{ width: `${(x.valor / cats[0].valor) * 100}%`, background: x.categoria?.cor ?? '#BDB3B5' }} /></div>
              </div>
              <Valor cents={x.valor} className="w-28 text-right text-sm font-medium" />
            </li>
          ))}
        </ul>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------- 3. evolução do saldo
function RelSaldo() {
  const { banco, hoje } = useDados()
  const fmt = useFmtEixo()
  const dados = serieSaldo(banco, hoje, 12)
  return (
    <Painel>
      <Cab titulo="Evolução do saldo" sub="Soma de todas as contas ao fim de cada mês (o mês atual até hoje)."
        exportar={() => ({ titulo: 'Evolucao do saldo', colunas: ['Mês', 'Saldo'], linhas: dados.map(x => [x.rotulo, x.saldo]), dinheiro: [1] })} />
      {banco.contas.length === 0 ? <Vazio compacto titulo="Cadastre suas contas" /> : (
        <Grafico>
          <ComposedChart data={dados} margin={{ top: 10, right: 12, left: 4 }}>
            <defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CORES_GRAF.saldo} stopOpacity={0.18} /><stop offset="100%" stopColor={CORES_GRAF.saldo} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke={CORES_GRAF.grade} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
            <YAxis tick={eixo} axisLine={false} tickLine={false} tickFormatter={fmt} width={64} />
            <Tooltip content={<DicaGrafico rotulos={{ saldo: 'Saldo' }} />} />
            <Area dataKey="saldo" stroke={CORES_GRAF.saldo} strokeWidth={2.2} fill="url(#gs)" type="monotone" />
          </ComposedChart>
        </Grafico>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------- 4. economia mensal
function RelEconomia() {
  const { banco } = useDados()
  const fmt = useFmtEixo()
  const meses = useMeses(12)
  const obj = banco.config?.objetivo_economia_cents ?? 0
  const dados = meses.map(m => ({ rotulo: mesCurto(m, true), economia: economiaPeriodo(banco, m, fimMes(m)) }))
  const media = Math.round(dados.reduce((a, x) => a + x.economia, 0) / dados.length)
  return (
    <Painel>
      <Cab titulo="Economia mensal" sub="Valor guardado em metas e reservas (aportes menos retiradas)."
        exportar={() => ({ titulo: 'Economia mensal', colunas: ['Mês', 'Economia'], linhas: dados.map(x => [x.rotulo, x.economia]), dinheiro: [1] })} />
      <div className="flex gap-8 px-5 pb-2 text-sm">
        <div><p className="text-xs text-taupe">Média mensal (12m)</p><Valor cents={media} className="font-semibold" /></div>
        {obj > 0 && <div><p className="text-xs text-taupe">Objetivo mensal</p><Valor cents={obj} className="font-semibold" /></div>}
      </div>
      <Grafico>
        <BarChart data={dados} margin={{ top: 10, right: 12, left: 4 }}>
          <CartesianGrid stroke={CORES_GRAF.grade} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
          <YAxis tick={eixo} axisLine={false} tickLine={false} tickFormatter={fmt} width={64} />
          <Tooltip content={<DicaGrafico rotulos={{ economia: 'Economia' }} />} cursor={{ fill: '#EEE9E2', opacity: 0.5 }} />
          {obj > 0 && <ReferenceLine y={obj} stroke={CORES_GRAF.resultado} strokeDasharray="5 4" label={{ value: 'objetivo', position: 'insideTopRight', fill: CORES_GRAF.resultado, fontSize: 11 }} />}
          <Bar dataKey="economia" fill={CORES_GRAF.saldo} radius={[5, 5, 0, 0]} maxBarSize={26} />
        </BarChart>
      </Grafico>
    </Painel>
  )
}

// ------------------------------------------------------------- 5. recorrentes
function RelRecorrentes() {
  const { banco } = useDados()
  const rec = banco.recorrencias.filter(r => r.ativa && r.tipo === 'despesa').sort((a, z) => z.valor_cents - a.valor_cents)
  const cats = new Map(banco.categorias.map(c => [c.id, c]))
  const total = rec.reduce((a, r) => a + r.valor_cents, 0)
  const renda = banco.recorrencias.filter(r => r.ativa && r.tipo === 'receita').reduce((a, r) => a + r.valor_cents, 0)
  return (
    <Painel>
      <Cab titulo="Gastos recorrentes" sub="Despesas fixas e assinaturas ativas."
        exportar={() => ({ titulo: 'Gastos recorrentes', colunas: ['Despesa', 'Categoria', 'Dia', 'Mensal', 'Anual'], linhas: rec.map(r => [r.nome, cats.get(r.categoria_id ?? '')?.nome ?? '', r.dia, r.valor_cents, r.valor_cents * 12]), dinheiro: [3, 4] })} />
      <div className="grid grid-cols-3 gap-3 px-5 pb-4 text-sm">
        <div><p className="text-xs text-taupe">Por mês</p><Valor cents={total} className="font-semibold" /></div>
        <div><p className="text-xs text-taupe">Por ano</p><Valor cents={total * 12} className="font-semibold" /></div>
        <div><p className="text-xs text-taupe">Da renda fixa</p><p className="font-semibold">{renda ? `${Math.round((total / renda) * 100)}%` : '—'}</p></div>
      </div>
      {rec.length === 0 ? <Vazio compacto icone={L.Repeat} titulo="Nenhuma despesa recorrente" /> : (
        <ul className="divide-y divide-borda/70 border-t border-borda">{rec.map(r => {
          const c = cats.get(r.categoria_id ?? '')
          return (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <IconeCategoria cor={c?.cor ?? '#817678'} icone={c?.icone ?? 'repeat'} tamanho="sm" />
              <span className="flex-1">{r.nome}<span className="ml-2 text-xs text-taupe">dia {r.dia}</span></span>
              <span className="hidden text-xs text-taupe sm:inline"><Valor cents={r.valor_cents * 12} />/ano</span>
              <Valor cents={r.valor_cents} className="w-24 text-right font-medium" />
            </li>
          )
        })}</ul>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------- 6. comparação
function RelComparacao() {
  const { banco, hoje } = useDados()
  const [a, setA] = useState(somaMeses(inicioMes(hoje), -1))
  const [b, setB] = useState(inicioMes(hoje))
  const meses = useMeses(13)
  const ca = new Map(porCategoria(banco, a, fimMes(a)).map(x => [x.categoria?.id ?? '_', x]))
  const cb = new Map(porCategoria(banco, b, fimMes(b)).map(x => [x.categoria?.id ?? '_', x]))
  const ids = [...new Set([...ca.keys(), ...cb.keys()])]
  const linhas = ids.map(id => {
    const x = ca.get(id) ?? cb.get(id)!
    const va = ca.get(id)?.valor ?? 0, vb = cb.get(id)?.valor ?? 0
    return { nome: x.categoria?.nome ?? 'Sem categoria', cat: x.categoria, va, vb, dif: vb - va, pct: va ? ((vb - va) / va) * 100 : null }
  }).sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))
  const ra = { r: receitasRecebidas(banco, a, fimMes(a)).reduce((s, l) => s + l.valor_cents, 0), d: soma(consumo(banco, a, fimMes(a))), e: economiaPeriodo(banco, a, fimMes(a)) }
  const rb = { r: receitasRecebidas(banco, b, fimMes(b)).reduce((s, l) => s + l.valor_cents, 0), d: soma(consumo(banco, b, fimMes(b))), e: economiaPeriodo(banco, b, fimMes(b)) }
  const sel = (v: string, f: (s: string) => void) => <Seletor value={v} onChange={e => f(e.target.value)} className="h-9 w-36">{meses.map(m => <option key={m} value={m}>{mesCurto(m, true)}</option>)}</Seletor>
  return (
    <Painel>
      <Cab titulo="Comparação entre meses" acao={<div className="flex items-center gap-2">{sel(a, setA)}<span className="text-taupe">vs</span>{sel(b, setB)}</div>}
        exportar={() => ({ titulo: 'Comparacao entre meses', colunas: ['Categoria', mesCurto(a, true), mesCurto(b, true), 'Diferença'], linhas: linhas.map(l => [l.nome, l.va, l.vb, l.dif]), dinheiro: [1, 2, 3] })} />
      <div className="grid grid-cols-3 gap-3 px-5 pb-4">
        {([['Receitas', ra.r, rb.r, true], ['Despesas', ra.d, rb.d, false], ['Economia', ra.e, rb.e, true]] as const).map(([r, x, y, bomSubir]) => {
          const v = x ? Math.round(((y - x) / x) * 100) : null
          const bom = v == null ? null : bomSubir ? v >= 0 : v <= 0
          return <div key={r} className="rounded-xl bg-marfim p-3"><p className="text-xs text-taupe">{r}</p><Valor cents={y} className="font-semibold" />{v != null && <p className={cn('text-xs', bom ? 'text-receita' : 'text-despesa')}>{v >= 0 ? '+' : ''}{v}% vs {mesCurto(a)}</p>}</div>
        })}
      </div>
      {linhas.length === 0 ? <Vazio compacto titulo="Sem gastos nesses meses" /> : (
        <div className="overflow-x-auto border-t border-borda">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-taupe"><th className="px-5 py-3 font-medium">Categoria</th><th className="px-3 py-3 text-right font-medium">{mesCurto(a, true)}</th><th className="px-3 py-3 text-right font-medium">{mesCurto(b, true)}</th><th className="px-5 py-3 text-right font-medium">Variação</th></tr></thead>
            <tbody>{linhas.map(l => (
              <tr key={l.nome} className="border-t border-borda/60">
                <td className="px-5 py-2.5"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: l.cat?.cor ?? '#BDB3B5' }} />{l.nome}</span></td>
                <td className="px-3 py-2.5 text-right"><Valor cents={l.va} className="text-taupe" /></td>
                <td className="px-3 py-2.5 text-right"><Valor cents={l.vb} /></td>
                <td className={cn('px-5 py-2.5 text-right', l.dif > 0 ? 'text-despesa' : l.dif < 0 ? 'text-receita' : 'text-taupe')}><Valor cents={l.dif} sinal />{l.pct != null && <span className="ml-1 text-xs">({l.pct >= 0 ? '+' : ''}{Math.round(l.pct)}%)</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------- 7. metas
function RelMetas() {
  const { banco } = useDados()
  const metas = banco.metas.filter(m => !m.arquivada).map(m => ({ m, g: saldoMeta(banco, m.id) }))
  return (
    <Painel>
      <Cab titulo="Progresso das metas" exportar={() => ({ titulo: 'Progresso das metas', colunas: ['Meta', 'Guardado', 'Objetivo', '%', 'Prazo'], linhas: metas.map(({ m, g }) => [m.nome, g, m.alvo_cents, `${Math.round((g / m.alvo_cents) * 100)}%`, m.prazo ? dataBR(m.prazo) : '']), dinheiro: [1, 2] })} />
      {metas.length === 0 ? <Vazio compacto icone={L.Target} titulo="Nenhuma meta" /> : (
        <ul className="space-y-5 px-5 pb-5">{metas.map(({ m, g }) => (
          <li key={m.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{m.nome}{m.emergencia && <Etiqueta tom="vinho" className="ml-2">reserva</Etiqueta>}</span><span className="text-xs text-taupe"><Valor cents={g} /> de <Valor cents={m.alvo_cents} /> · {Math.round((g / m.alvo_cents) * 100)}%</span></div>
            <Barra pct={(g / m.alvo_cents) * 100} tom={g >= m.alvo_cents ? 'receita' : 'vinho'} rotulo={m.nome} />
          </li>
        ))}</ul>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------- 8. projeção
function RelProjecao() {
  const { banco, hoje, salvarConfig } = useDados()
  const { confirmar } = useAvisos()
  const { executar } = useAcao()
  const fmt = useFmtEixo()
  const [h, setH] = useState<'0' | '3' | '6' | '12'>('6')
  const [extra, setExtra] = useState<number | null>(null)
  const [cat, setCat] = useState('')
  const [red, setRed] = useState(20)
  const temCenario = (extra ?? 0) > 0 || (!!cat && red > 0)
  const cenario: Cenario | undefined = temCenario ? { economiaExtra: extra ?? 0, reducoes: cat ? { [cat]: red } : {} } : undefined
  const pontos = useMemo(() => projetar(banco, hoje, Number(h), cenario), [banco, hoje, h, extra, cat, red]) // eslint-disable-line react-hooks/exhaustive-deps
  const fim = pontos[pontos.length - 1]
  const futuros = pontos.filter(p => p.previsto != null && p.rotulo !== 'Hoje')
  const catsDesp = banco.categorias.filter(c => c.tipo === 'despesa')
  const semHistorico = !banco.lancamentos.some(l => l.status === 'efetivado') && !banco.compras.length

  return (
    <div className="space-y-4">
      <Painel>
        <Cab titulo="Projeção de saldo" sub="Soma de todas as contas, considerando salário previsto, despesas fixas, contas futuras, parcelas e o seu gasto variável médio."
          acao={<Abas valor={h} aoMudar={setH} opcoes={[{ v: '0', r: 'Fim do mês' }, { v: '3', r: '3m' }, { v: '6', r: '6m' }, { v: '12', r: '12m' }]} />}
          exportar={() => ({ titulo: 'Projecao de saldo', colunas: ['Mês', 'Receitas previstas', 'Despesas fixas', 'Faturas', 'Gasto variável estimado', 'Saldo previsto', 'Saldo simulado'], linhas: futuros.map(p => [p.rotulo, p.receitas, p.despesasFixas, p.faturas, p.variaveis, p.previsto ?? 0, p.simulado ?? '']), dinheiro: [1, 2, 3, 4, 5] })} />
        <div className="grid grid-cols-2 gap-3 px-5 pb-2 sm:grid-cols-3">
          <div><p className="text-xs text-taupe">Saldo hoje</p><Valor cents={pontos.find(p => p.rotulo === 'Hoje')?.previsto ?? 0} className="font-semibold" /></div>
          <div><p className="text-xs text-taupe">Previsto em {fim.rotulo === 'Fim do mês' ? dataBR(fimMes(hoje)) : nomeMes(fim.mes).toLowerCase()}</p><Valor cents={fim.previsto ?? 0} className={cn('font-semibold', (fim.previsto ?? 0) < 0 && 'text-despesa')} /></div>
          {fim.simulado != null && <div><p className="text-xs text-taupe">Com a simulação</p><Valor cents={fim.simulado} className="font-semibold text-atencao" /> <span className="text-xs text-taupe">(<Valor cents={fim.simulado - (fim.previsto ?? 0)} sinal />)</span></div>}
        </div>
        <Grafico altura={320}>
          <LineChart data={pontos} margin={{ top: 14, right: 16, left: 4 }}>
            <CartesianGrid stroke={CORES_GRAF.grade} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
            <YAxis tick={eixo} axisLine={false} tickLine={false} tickFormatter={fmt} width={64} />
            <Tooltip content={<DicaGrafico rotulos={{ realizado: 'Confirmado', previsto: 'Previsto', simulado: 'Simulado' }} />} />
            <ReferenceLine y={0} stroke="#D8CFCA" />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: CORES_GRAF.eixo }} formatter={(v: string) => ({ realizado: 'Confirmado', previsto: 'Previsto', simulado: 'Simulado' } as Record<string, string>)[v] ?? v} />
            <Line dataKey="realizado" stroke={CORES_GRAF.realizado} strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} />
            <Line dataKey="previsto" stroke={CORES_GRAF.previsto} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2.5 }} />
            {temCenario && <Line dataKey="simulado" stroke={CORES_GRAF.simulado} strokeWidth={2} strokeDasharray="2 4" dot={{ r: 2.5 }} />}
          </LineChart>
        </Grafico>
        <p className="border-t border-borda px-5 py-3 text-xs text-taupe">
          <b className="text-carvao">Confirmado</b>: saldos reais. <b className="text-carvao">Previsto</b>: estimativa com seus compromissos e médias. <b className="text-carvao">Simulado</b>: o cenário abaixo. Projeções não são garantias.
          {semHistorico && ' Ainda não há histórico de gastos, então o gasto variável não entra na estimativa.'}
        </p>
      </Painel>

      <Painel className="p-5">
        <p className="mb-1 flex items-center gap-2 font-medium"><L.FlaskConical className="h-4 w-4 text-atencao" />Simular cenário</p>
        <p className="mb-4 text-sm text-taupe">Nada aqui altera seus dados.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="E se eu economizar a mais por mês?"><CampoValor valor={extra} aoMudar={setExtra} placeholder="200,00" /></Campo>
          <Campo rotulo="E se eu reduzir os gastos com..."><Seletor value={cat} onChange={e => setCat(e.target.value)}><option value="">—</option>{catsDesp.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
          <Campo rotulo={`...em ${red}%`}><input type="range" min={5} max={100} step={5} value={red} onChange={e => setRed(+e.target.value)} className="mt-3 w-full accent-[#621F32]" disabled={!cat} aria-label="Percentual de redução" /></Campo>
        </div>
        {temCenario && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-atencao-fundo px-4 py-3 text-sm">
            <span>Em {Number(h) || 1} {Number(h) === 1 ? 'mês' : 'meses'}, o cenário muda o saldo em <Valor cents={(fim.simulado ?? 0) - (fim.previsto ?? 0)} sinal className="font-semibold" />.</span>
            <div className="flex gap-2">
              {(extra ?? 0) > 0 && <Botao tamanho="sm" variante="secundario" onClick={async () => {
                const novo = (banco.config?.objetivo_economia_cents ?? 0) + (extra ?? 0)
                if (await confirmar({ titulo: 'Atualizar objetivo de economia?', texto: <>O objetivo mensal passa a ser <b>{(novo / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b>. Nenhum lançamento é criado.</>, botao: 'Atualizar objetivo' }))
                  executar(() => salvarConfig({ objetivo_economia_cents: novo }), 'Objetivo atualizado.')
              }}>Adotar como objetivo</Botao>}
              <Botao tamanho="sm" variante="fantasma" onClick={() => { setExtra(null); setCat('') }}>Limpar</Botao>
            </div>
          </div>
        )}
      </Painel>

      <Painel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-taupe"><th className="px-5 py-3 font-medium">Mês</th><th className="px-3 py-3 text-right font-medium">Receitas previstas</th><th className="px-3 py-3 text-right font-medium">Fixas e contas</th><th className="px-3 py-3 text-right font-medium">Faturas</th><th className="px-3 py-3 text-right font-medium">Variável (média)</th><th className="px-5 py-3 text-right font-medium">Saldo previsto</th></tr></thead>
          <tbody>{futuros.map(p => (
            <tr key={p.rotulo} className="border-t border-borda/60">
              <td className="px-5 py-2.5 capitalize">{p.rotulo}</td>
              <td className="px-3 py-2.5 text-right"><Valor cents={p.receitas} className="text-receita" /></td>
              <td className="px-3 py-2.5 text-right"><Valor cents={-p.despesasFixas} /></td>
              <td className="px-3 py-2.5 text-right"><Valor cents={-p.faturas} /></td>
              <td className="px-3 py-2.5 text-right"><Valor cents={-p.variaveis} className="text-taupe" /></td>
              <td className="px-5 py-2.5 text-right font-medium"><Valor cents={p.previsto ?? 0} className={(p.previsto ?? 0) < 0 ? 'text-despesa' : ''} /></td>
            </tr>
          ))}</tbody>
        </table>
      </Painel>
    </div>
  )
}
