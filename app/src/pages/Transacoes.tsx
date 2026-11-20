import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useDados } from '../lib/dados'
import { statusVisivel } from '../lib/motor'
import { dataBR, fimMes, inicioMes, nomeMes, paraCentavos } from '../lib/formato'
import { FORMAS, type Compra, type Lancamento } from '../lib/tipos'
import { Cabecalho, useNovaTransacao } from '../components/Layout'
import { Botao, Campo, Entrada, Etiqueta, IconeCategoria, Modal, Painel, Seletor, Valor, Vazio, cn, useAcao, useAvisos } from '../components/ui'
import { ConfirmarModal, TransacaoModal } from '../components/Formularios'
import { MenuExportar } from '../components/MenuExportar'

type Tipo = 'receita' | 'despesa' | 'cartao' | 'transferencia' | 'fatura' | 'meta'
interface Linha {
  id: string
  tipo: Tipo
  data: string
  desc: string
  cat: string | null
  contaIds: string[]
  onde: string
  forma: string
  status: string
  tom: 'receita' | 'despesa' | 'atencao' | 'neutro' | 'vinho' | 'info'
  valor: number
  recorrente: boolean
  lanc?: Lancamento
  compra?: Compra
  cancelavel?: { tabela: 'transferencias' | 'pagamentos' | 'movimentos'; campo: 'cancelada' | 'cancelado' }
}

const ROTULO_TIPO: Record<Tipo, string> = { receita: 'Receita', despesa: 'Despesa', cartao: 'Cartão', transferencia: 'Transferência', fatura: 'Pagamento de fatura', meta: 'Meta' }

export default function Transacoes() {
  const { banco, hoje, mesRef, atualizar, excluir, rpc } = useDados()
  const nova = useNovaTransacao()
  const { confirmar } = useAvisos()
  const { executar } = useAcao()
  const [busca, setBusca] = useState('')
  const [de, setDe] = useState(inicioMes(mesRef))
  const [ate, setAte] = useState(fimMes(mesRef))
  const [tipo, setTipo] = useState<Tipo | ''>('')
  const [cat, setCat] = useState('')
  const [conta, setConta] = useState('')
  const [forma, setForma] = useState('')
  const [status, setStatus] = useState('')
  const [vMin, setVMin] = useState('')
  const [vMax, setVMax] = useState('')
  const [ordem, setOrdem] = useState<{ k: 'data' | 'valor' | 'desc'; asc: boolean }>({ k: 'data', asc: false })
  const [filtros, setFiltros] = useState(false)
  const [limite, setLimite] = useState(60)
  const [editar, setEditar] = useState<Lancamento | null>(null)
  const [confirmarL, setConfirmarL] = useState<Lancamento | null>(null)
  const [editarCompra, setEditarCompra] = useState<Compra | null>(null)

  const contas = useMemo(() => new Map(banco.contas.map(c => [c.id, c.nome])), [banco.contas])
  const cartoes = useMemo(() => new Map(banco.cartoes.map(c => [c.id, c.nome])), [banco.cartoes])
  const cats = useMemo(() => new Map(banco.categorias.map(c => [c.id, c])), [banco.categorias])

  const todas = useMemo<Linha[]>(() => {
    const out: Linha[] = []
    for (const l of banco.lancamentos) {
      if (l.compra_id) continue // aparece como compra no cartão
      const st = statusVisivel(l, hoje)
      out.push({
        id: l.id, tipo: l.tipo, data: l.data_efetiva ?? l.data_prevista, desc: l.descricao, cat: l.categoria_id,
        contaIds: l.conta_id ? [l.conta_id] : [], onde: l.cartao_id ? cartoes.get(l.cartao_id) ?? 'Cartão' : contas.get(l.conta_id ?? '') ?? '—',
        forma: l.cartao_id ? 'Crédito' : l.forma_pagamento ? FORMAS[l.forma_pagamento] : '—',
        status: st, tom: st === 'vencido' ? 'despesa' : st === 'cancelado' ? 'neutro' : st === 'pendente' || st === 'previsto' ? 'atencao' : l.tipo === 'receita' ? 'receita' : 'neutro',
        valor: l.tipo === 'receita' ? l.valor_cents : -l.valor_cents, recorrente: !!l.recorrencia_id, lanc: l,
      })
    }
    for (const c of banco.compras) out.push({
      id: c.id, tipo: 'cartao', data: c.data_compra, desc: c.descricao + (c.parcelas > 1 ? ` · ${c.parcelas}x` : ''), cat: c.categoria_id,
      contaIds: [], onde: cartoes.get(c.cartao_id) ?? 'Cartão', forma: 'Crédito', status: c.cancelada ? 'cancelado' : 'no cartão',
      tom: c.cancelada ? 'neutro' : 'vinho', valor: -c.valor_total_cents, recorrente: false, compra: c,
    })
    for (const t of banco.transferencias) out.push({
      id: t.id, tipo: 'transferencia', data: t.data, desc: t.descricao || `${contas.get(t.origem_id)} → ${contas.get(t.destino_id)}`, cat: null,
      contaIds: [t.origem_id, t.destino_id], onde: `${contas.get(t.origem_id) ?? '?'} → ${contas.get(t.destino_id) ?? '?'}`, forma: 'Transferência',
      status: t.cancelada ? 'cancelado' : 'efetivada', tom: t.cancelada ? 'neutro' : 'info', valor: t.valor_cents, recorrente: false,
      cancelavel: t.cancelada ? undefined : { tabela: 'transferencias', campo: 'cancelada' },
    })
    const faturas = new Map(banco.faturas.map(f => [f.id, f]))
    for (const p of banco.pagamentos) {
      const f = faturas.get(p.fatura_id)
      out.push({
        id: p.id, tipo: 'fatura', data: p.data, desc: `Fatura ${cartoes.get(f?.cartao_id ?? '') ?? ''} · venc. ${dataBR(f?.vencimento)}`, cat: null,
        contaIds: [p.conta_id], onde: contas.get(p.conta_id) ?? '—', forma: '—', status: p.cancelado ? 'cancelado' : 'pago',
        tom: p.cancelado ? 'neutro' : 'neutro', valor: -p.valor_cents, recorrente: false,
        cancelavel: p.cancelado ? undefined : { tabela: 'pagamentos', campo: 'cancelado' },
      })
    }
    const metas = new Map(banco.metas.map(m => [m.id, m]))
    for (const m of banco.movimentos) out.push({
      id: m.id, tipo: 'meta', data: m.data, desc: `${m.tipo === 'aporte' ? 'Guardado em' : 'Retirado de'} ${metas.get(m.meta_id)?.nome ?? 'meta'}`, cat: null,
      contaIds: m.conta_id ? [m.conta_id] : [], onde: contas.get(m.conta_id ?? '') ?? '—', forma: '—', status: m.cancelado ? 'cancelado' : m.tipo === 'aporte' ? 'guardado' : 'retirado',
      tom: m.cancelado ? 'neutro' : 'vinho', valor: m.tipo === 'aporte' ? -m.valor_cents : m.valor_cents, recorrente: false,
      cancelavel: m.cancelado ? undefined : { tabela: 'movimentos', campo: 'cancelado' },
    })
    return out
  }, [banco, hoje, contas, cartoes])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const min = paraCentavos(vMin), max = paraCentavos(vMax)
    const r = todas.filter(x =>
      (!de || x.data >= de) && (!ate || x.data <= ate) &&
      (!tipo || x.tipo === tipo) && (!cat || x.cat === cat) &&
      (!conta || x.contaIds.includes(conta) || x.compra?.cartao_id === conta || x.lanc?.cartao_id === conta) &&
      (!forma || x.forma === forma) && (!status || x.status === status) &&
      (min == null || Math.abs(x.valor) >= min) && (max == null || Math.abs(x.valor) <= max) &&
      (!q || x.desc.toLowerCase().includes(q) || x.onde.toLowerCase().includes(q) || (x.cat && cats.get(x.cat)?.nome.toLowerCase().includes(q)) || (x.lanc?.obs ?? x.compra?.obs ?? '').toLowerCase().includes(q)))
    r.sort((a, z) => {
      const s = ordem.k === 'data' ? a.data.localeCompare(z.data) || a.id.localeCompare(z.id) : ordem.k === 'valor' ? Math.abs(a.valor) - Math.abs(z.valor) : a.desc.localeCompare(z.desc, 'pt-BR')
      return ordem.asc ? s : -s
    })
    return r
  }, [todas, busca, de, ate, tipo, cat, conta, forma, status, vMin, vMax, ordem, cats])

  const totais = useMemo(() => {
    let ent = 0, sai = 0
    for (const x of filtradas) {
      if (x.status === 'cancelado' || x.tipo === 'transferencia' || x.tipo === 'fatura' || x.tipo === 'meta') continue
      if (x.status === 'pendente' || x.status === 'previsto' || x.status === 'vencido') continue
      if (x.valor > 0) ent += x.valor; else sai += -x.valor
    }
    return { ent, sai }
  }, [filtradas])

  const nFiltros = [tipo, cat, conta, forma, status, vMin, vMax].filter(Boolean).length
  const limpar = () => { setTipo(''); setCat(''); setConta(''); setForma(''); setStatus(''); setVMin(''); setVMax(''); setBusca('') }
  const ord = (k: 'data' | 'valor' | 'desc') => setOrdem(o => ({ k, asc: o.k === k ? !o.asc : k === 'desc' }))

  async function acaoExcluir(x: Linha) {
    if (x.lanc) {
      const l = x.lanc
      if (l.status === 'pendente' && !l.recorrencia_id) {
        if (await confirmar({ titulo: 'Excluir lançamento?', texto: `"${l.descricao}" ainda não foi pago/recebido e será removido.`, botao: 'Excluir', perigo: true }))
          await executar(() => excluir('lancamentos', l.id), 'Lançamento excluído.')
        return
      }
      const texto = l.status === 'efetivado'
        ? `"${l.descricao}" sairá dos saldos e relatórios. Ele continua no histórico como cancelado.`
        : `Esta ocorrência de "${l.descricao}" será cancelada. As próximas continuam.`
      if (await confirmar({ titulo: 'Cancelar lançamento?', texto, botao: 'Cancelar lançamento', perigo: true }))
        await executar(() => atualizar('lancamentos', l.id, { status: 'cancelado', data_efetiva: null }), 'Lançamento cancelado.')
      return
    }
    if (x.compra) {
      if (await confirmar({ titulo: 'Cancelar compra?', texto: `"${x.compra.descricao}" e todas as parcelas saem das faturas e relatórios. Pagamentos já feitos continuam registrados.`, botao: 'Cancelar compra', perigo: true }))
        await executar(() => atualizar('compras', x.compra!.id, { cancelada: true }), 'Compra cancelada.')
      return
    }
    if (x.cancelavel) {
      if (await confirmar({ titulo: 'Cancelar movimentação?', texto: 'Os saldos voltam a ser como antes. O registro fica no histórico como cancelado.', botao: 'Cancelar', perigo: true }))
        await executar(() => atualizar(x.cancelavel!.tabela, x.id, { [x.cancelavel!.campo]: true }), 'Movimentação cancelada.')
    }
  }

  const gerarTabela = () => ({
    titulo: 'Transações',
    colunas: ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta / cartão', 'Forma', 'Situação', 'Valor'],
    linhas: filtradas.map(x => [dataBR(x.data), ROTULO_TIPO[x.tipo], x.desc, x.cat ? cats.get(x.cat)?.nome ?? '' : '', x.onde, x.forma, x.status, x.valor]),
    dinheiro: [7],
  })

  const statusOpcoes = [...new Set(todas.map(x => x.status))]
  const formasOpcoes = [...new Set(todas.map(x => x.forma).filter(f => f !== '—'))]

  return (
    <div>
      <Cabecalho titulo="Transações" sub="Tudo o que entrou, saiu e está previsto." acoes={<MenuExportar gerar={gerarTabela} subtitulo={`Período: ${dataBR(de)} a ${dataBR(ate)}`} />} />

      <Painel className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <L.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-taupe" />
            <Entrada value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por descrição, conta, categoria..." className="pl-10" aria-label="Buscar" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Entrada type="date" value={de} onChange={e => setDe(e.target.value)} className="h-10 w-auto" aria-label="De" />
            <span className="text-taupe">–</span>
            <Entrada type="date" value={ate} onChange={e => setAte(e.target.value)} className="h-10 w-auto" aria-label="Até" />
            <Botao icone={L.SlidersHorizontal} onClick={() => setFiltros(v => !v)} aria-expanded={filtros}>
              Filtros{nFiltros > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-vinho px-1 text-[11px] text-marfim">{nFiltros}</span>}
            </Botao>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {filtros && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 gap-3 pt-4 md:grid-cols-4 xl:grid-cols-7">
                <Campo rotulo="Tipo"><Seletor value={tipo} onChange={e => setTipo(e.target.value as Tipo)}><option value="">Todos</option>{Object.entries(ROTULO_TIPO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</Seletor></Campo>
                <Campo rotulo="Categoria"><Seletor value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas</option>{banco.categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
                <Campo rotulo="Conta / cartão"><Seletor value={conta} onChange={e => setConta(e.target.value)}><option value="">Todas</option>{banco.contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}{banco.cartoes.map(c => <option key={c.id} value={c.id}>{c.nome} (cartão)</option>)}</Seletor></Campo>
                <Campo rotulo="Forma"><Seletor value={forma} onChange={e => setForma(e.target.value)}><option value="">Todas</option>{formasOpcoes.map(f => <option key={f}>{f}</option>)}</Seletor></Campo>
                <Campo rotulo="Situação"><Seletor value={status} onChange={e => setStatus(e.target.value)}><option value="">Todas</option>{statusOpcoes.map(s => <option key={s}>{s}</option>)}</Seletor></Campo>
                <Campo rotulo="Valor mínimo"><Entrada inputMode="decimal" value={vMin} onChange={e => setVMin(e.target.value)} placeholder="0,00" /></Campo>
                <Campo rotulo="Valor máximo"><Entrada inputMode="decimal" value={vMax} onChange={e => setVMax(e.target.value)} placeholder="0,00" /></Campo>
              </div>
              <div className="mt-3 flex justify-end"><Botao variante="fantasma" tamanho="sm" onClick={limpar}>Limpar filtros</Botao></div>
            </motion.div>
          )}
        </AnimatePresence>
      </Painel>

      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-[13px] text-taupe">
        <span>{filtradas.length} {filtradas.length === 1 ? 'registro' : 'registros'}</span>
        <span>Entradas efetivadas <Valor cents={totais.ent} className="font-medium text-receita" /></span>
        <span>Saídas efetivadas <Valor cents={totais.sai} className="font-medium text-carvao" /></span>
        <span className="hidden sm:inline">Transferências, faturas e metas não somam como receita/despesa.</span>
      </div>

      <Painel className="overflow-hidden">
        {filtradas.length === 0 ? (
          <Vazio icone={L.Receipt} titulo={todas.length ? 'Nada encontrado' : 'Nenhuma transação ainda'}
            texto={todas.length ? `Nenhum registro entre ${dataBR(de)} e ${dataBR(ate)} com esses filtros.` : 'Registre a primeira receita ou despesa.'}
            acao={todas.length ? <Botao onClick={() => { limpar(); setDe(''); setAte('') }}>Ver todo o período</Botao> : <Botao variante="primario" icone={L.Plus} onClick={() => nova()}>Nova transação</Botao>} />
        ) : (<>
          {/* tabela (tablet/desktop) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-[12px] uppercase tracking-wide text-taupe">
                  <Th onClick={() => ord('data')} ativo={ordem.k === 'data'} asc={ordem.asc}>Data</Th>
                  <Th onClick={() => ord('desc')} ativo={ordem.k === 'desc'} asc={ordem.asc}>Descrição</Th>
                  <th className="px-3 py-3 font-medium">Categoria</th>
                  <th className="px-3 py-3 font-medium">Conta</th>
                  <th className="hidden px-3 py-3 font-medium xl:table-cell">Forma</th>
                  <th className="px-3 py-3 font-medium">Situação</th>
                  <Th onClick={() => ord('valor')} ativo={ordem.k === 'valor'} asc={ordem.asc} direita>Valor</Th>
                  <th className="w-[112px]" />
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, limite).map(x => {
                  const c = x.cat ? cats.get(x.cat) : null
                  return (
                    <tr key={x.tipo + x.id} className={cn('group border-b border-borda/60 last:border-0 hover:bg-marfim/70', x.status === 'cancelado' && 'opacity-50')}>
                      <td className="num whitespace-nowrap px-3 py-3 pl-5 text-taupe">{dataBR(x.data)}</td>
                      <td className="max-w-[280px] px-3 py-3">
                        <div className="flex items-center gap-2"><span className={cn('truncate font-medium', x.status === 'cancelado' && 'line-through')}>{x.desc}</span>{x.recorrente && <L.Repeat className="h-3.5 w-3.5 shrink-0 text-taupe" aria-label="recorrente" />}</div>
                        <span className="text-xs text-taupe">{ROTULO_TIPO[x.tipo]}</span>
                      </td>
                      <td className="px-3 py-3">{c ? <span className="flex items-center gap-2"><IconeCategoria cor={c.cor} icone={c.icone} tamanho="sm" /><span className="truncate">{c.nome}</span></span> : <span className="text-taupe">—</span>}</td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-taupe">{x.onde}</td>
                      <td className="hidden px-3 py-3 text-taupe xl:table-cell">{x.forma}</td>
                      <td className="px-3 py-3"><Etiqueta tom={x.tom}>{x.status}</Etiqueta></td>
                      <td className="px-3 py-3 text-right"><Valor cents={x.valor} sinal={x.tipo !== 'transferencia'} className={cn('font-medium', x.valor > 0 && x.tipo !== 'transferencia' ? 'text-receita' : 'text-carvao')} /></td>
                      <td className="px-3 py-3 pr-4"><Acoes x={x} onEditar={setEditar} onEditarCompra={setEditarCompra} onConfirmar={setConfirmarL} onExcluir={acaoExcluir} onDesfazer={l => executar(() => rpc('fin_desfazer', { p_id: l.id }), 'Voltou para pendente.')} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* cartões (celular) */}
          <ul className="divide-y divide-borda/70 md:hidden">
            {filtradas.slice(0, limite).map(x => {
              const c = x.cat ? cats.get(x.cat) : null
              return (
                <li key={x.tipo + x.id} className={cn('flex items-center gap-3 px-4 py-3', x.status === 'cancelado' && 'opacity-50')}>
                  <IconeCategoria cor={c?.cor ?? '#817678'} icone={c?.icone ?? (x.tipo === 'transferencia' ? 'repeat' : x.tipo === 'meta' ? 'piggy-bank' : 'receipt')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{x.desc}</p>
                    <p className="truncate text-xs text-taupe">{dataBR(x.data)} · {x.onde}</p>
                    <Etiqueta tom={x.tom} className="mt-1">{x.status}</Etiqueta>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Valor cents={x.valor} sinal={x.tipo !== 'transferencia'} className={cn('text-sm font-medium', x.valor > 0 && x.tipo !== 'transferencia' ? 'text-receita' : '')} />
                    <Acoes x={x} onEditar={setEditar} onEditarCompra={setEditarCompra} onConfirmar={setConfirmarL} onExcluir={acaoExcluir} onDesfazer={l => executar(() => rpc('fin_desfazer', { p_id: l.id }), 'Voltou para pendente.')} />
                  </div>
                </li>
              )
            })}
          </ul>
          {filtradas.length > limite && <div className="border-t border-borda p-3 text-center"><Botao variante="fantasma" onClick={() => setLimite(l => l + 100)}>Mostrar mais ({filtradas.length - limite})</Botao></div>}
        </>)}
      </Painel>
      <p className="mt-3 px-1 text-xs text-taupe">Período padrão: {nomeMes(mesRef)}. Compras parceladas aparecem uma vez com o valor total; as parcelas ficam nas faturas.</p>

      <TransacaoModal aberto={!!editar} editar={editar} aoFechar={() => setEditar(null)} />
      <ConfirmarModal lanc={confirmarL} aoFechar={() => setConfirmarL(null)} />
      <EditarCompraModal compra={editarCompra} aoFechar={() => setEditarCompra(null)} />
    </div>
  )
}

function Th({ children, onClick, ativo, asc, direita }: { children: React.ReactNode; onClick: () => void; ativo: boolean; asc: boolean; direita?: boolean }) {
  return (
    <th className={cn('px-3 py-3 font-medium first:pl-5', direita && 'text-right')} aria-sort={ativo ? (asc ? 'ascending' : 'descending') : 'none'}>
      <button onClick={onClick} className={cn('inline-flex items-center gap-1 uppercase hover:text-carvao', ativo && 'text-carvao')}>
        {children}{ativo ? (asc ? <L.ArrowUp className="h-3 w-3" /> : <L.ArrowDown className="h-3 w-3" />) : <L.ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )
}

function Acoes({ x, onEditar, onEditarCompra, onConfirmar, onExcluir, onDesfazer }: {
  x: Linha; onEditar: (l: Lancamento) => void; onEditarCompra: (c: Compra) => void; onConfirmar: (l: Lancamento) => void; onExcluir: (x: Linha) => void; onDesfazer: (l: Lancamento) => void
}) {
  if (x.status === 'cancelado') return null
  const b = 'grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-carvao'
  return (
    <div className="flex justify-end gap-0.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
      {x.lanc?.status === 'pendente' && <button className={cn(b, 'text-vinho')} onClick={() => onConfirmar(x.lanc!)} title={x.lanc.tipo === 'receita' ? 'Confirmar recebimento' : 'Marcar como pago'} aria-label="Confirmar"><L.Check className="h-4 w-4" /></button>}
      {x.lanc?.status === 'efetivado' && <button className={b} onClick={() => onDesfazer(x.lanc!)} title="Desfazer confirmação" aria-label="Desfazer"><L.Undo2 className="h-4 w-4" /></button>}
      {x.lanc && <button className={b} onClick={() => onEditar(x.lanc!)} title="Editar" aria-label="Editar"><L.Pencil className="h-4 w-4" /></button>}
      {x.compra && <button className={b} onClick={() => onEditarCompra(x.compra!)} title="Editar" aria-label="Editar"><L.Pencil className="h-4 w-4" /></button>}
      {(x.lanc || x.compra || x.cancelavel) && <button className={cn(b, 'hover:text-despesa')} onClick={() => onExcluir(x)} title="Excluir / cancelar" aria-label="Excluir"><L.Trash2 className="h-4 w-4" /></button>}
    </div>
  )
}

function EditarCompraModal({ compra, aoFechar }: { compra: Compra | null; aoFechar: () => void }) {
  const { banco, atualizar } = useDados()
  const { ocupado, executar } = useAcao()
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  if (compra && aberta !== compra.id) { setAberta(compra.id); setDesc(compra.descricao); setCat(compra.categoria_id ?? '') }
  if (!compra && aberta) setAberta(null)
  return (
    <Modal aberto={!!compra} aoFechar={aoFechar} largura="sm" titulo="Editar compra" sub="Para mudar valor, parcelas, data ou cartão, cancele e registre de novo."
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (!compra || !desc.trim()) return
        if (await executar(() => atualizar('compras', compra.id, { descricao: desc.trim(), categoria_id: cat || null }), 'Compra atualizada.')) aoFechar()
      }}>Salvar</Botao></>}>
      <div className="grid gap-4">
        <Campo rotulo="Descrição"><Entrada value={desc} onChange={e => setDesc(e.target.value)} maxLength={120} /></Campo>
        <Campo rotulo="Categoria"><Seletor value={cat} onChange={e => setCat(e.target.value)}><option value="">Sem categoria</option>{banco.categorias.filter(c => c.tipo === 'despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
      </div>
    </Modal>
  )
}
