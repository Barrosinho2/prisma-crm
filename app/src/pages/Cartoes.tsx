import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { motion } from 'motion/react'
import { useDados } from '../lib/dados'
import { infoFaturas, resumoCartao, type InfoFatura } from '../lib/motor'
import { dataBR, mesCurto, nomeMes } from '../lib/formato'
import type { Cartao } from '../lib/tipos'
import { Cabecalho, useNovaTransacao } from '../components/Layout'
import { Abas, Barra, Botao, Etiqueta, IconeCategoria, Painel, TituloPainel, Valor, Vazio, cn, useAcao, useAvisos } from '../components/ui'
import { CartaoModal, PagarFaturaModal } from '../components/Formularios'

const TOM_STATUS = { aberta: 'info', fechada: 'atencao', paga: 'receita', vencida: 'despesa' } as const

export default function Cartoes() {
  const { banco, hoje, atualizar } = useDados()
  const nova = useNovaTransacao()
  const { confirmar } = useAvisos()
  const { executar } = useAcao()
  const ativos = banco.cartoes.filter(c => !c.arquivado)
  const [selId, setSelId] = useState<string | null>(null)
  const sel = ativos.find(c => c.id === selId) ?? ativos[0] ?? null
  const [modal, setModal] = useState<{ aberto: boolean; editar: Cartao | null }>({ aberto: false, editar: null })
  const [pagar, setPagar] = useState<string | null>(null)
  const [aba, setAba] = useState<'faturas' | 'compras'>('faturas')
  const [faturaVer, setFaturaVer] = useState<string | null>(null)

  const resumo = useMemo(() => (sel ? resumoCartao(banco, sel, hoje) : null), [banco, sel, hoje])
  const infos = useMemo(() => infoFaturas(banco, hoje), [banco, hoje])
  const cats = useMemo(() => new Map(banco.categorias.map(c => [c.id, c])), [banco.categorias])

  if (ativos.length === 0)
    return (
      <div>
        <Cabecalho titulo="Cartões de crédito" sub="Limite, faturas e parcelamentos." />
        <Painel><Vazio icone={L.CreditCard} titulo="Nenhum cartão cadastrado" texto="Cadastre seu cartão com os dias de fechamento e vencimento. As compras parceladas são distribuídas automaticamente nas faturas." acao={<Botao variante="primario" icone={L.Plus} onClick={() => setModal({ aberto: true, editar: null })}>Cadastrar cartão</Botao>} /></Painel>
        <CartaoModal aberto={modal.aberto} editar={modal.editar} aoFechar={() => setModal({ aberto: false, editar: null })} />
      </div>
    )

  const faturaSel = faturaVer ? infos.get(faturaVer) : resumo?.atual ?? resumo?.aPagar[0] ?? null
  const comprasFatura = faturaSel ? banco.parcelas.filter(p => p.fatura_id === faturaSel.fatura.id).map(p => ({ p, c: banco.compras.find(c => c.id === p.compra_id)! })).filter(x => x.c && !x.c.cancelada) : []
  const comprasCartao = sel ? banco.compras.filter(c => c.cartao_id === sel.id).sort((a, z) => z.data_compra.localeCompare(a.data_compra)) : []

  return (
    <div>
      <Cabecalho titulo="Cartões de crédito" sub="Limite, faturas e parcelamentos."
        acoes={<><Botao icone={L.ShoppingBag} onClick={() => nova('cartao')}>Nova compra</Botao><Botao variante="suave" icone={L.Plus} onClick={() => setModal({ aberto: true, editar: null })}>Novo cartão</Botao></>} />

      <div className="rolagem-fina -mx-4 mb-6 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
        {ativos.map((c, i) => {
          const r = resumoCartao(banco, c, hoje)
          const ativo = sel?.id === c.id
          return (
            <motion.button key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={() => { setSelId(c.id); setFaturaVer(null) }} aria-pressed={ativo}
              className={cn('relative flex min-h-[196px] w-[300px] shrink-0 flex-col justify-between sm:aspect-[1.7] overflow-hidden rounded-2xl p-5 text-left text-marfim shadow-suave transition sm:w-auto',
                ativo ? 'ring-2 ring-vinho-suave ring-offset-2 ring-offset-marfim' : 'opacity-90 hover:opacity-100')}
              style={{ background: `linear-gradient(135deg, ${c.cor} 0%, #2B0E18 140%)` }}>
              <svg className="pointer-events-none absolute -right-10 -bottom-16 h-52 w-52 opacity-[0.12]" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="48" fill="none" stroke="#fff" /><circle cx="50" cy="50" r="32" fill="none" stroke="#fff" /></svg>
              <div className="flex items-start justify-between">
                <div><p className="titulo text-lg leading-tight">{c.nome}</p><p className="text-xs text-white/60">{c.instituicao ?? 'Cartão de crédito'}</p></div>
                <L.CreditCard className="h-5 w-5 text-white/60" strokeWidth={1.4} />
              </div>
              <div className="relative mt-6">
                <p className="text-[11px] uppercase tracking-wider text-white/55">Disponível</p>
                <Valor cents={r.disponivel} className="titulo text-2xl" />
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#E4CBD2]" style={{ width: `${Math.min(100, c.limite_cents ? (r.usado / c.limite_cents) * 100 : 0)}%` }} /></div>
                <p className="mt-1.5 flex justify-between text-[11px] text-white/60"><span>fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}</span><span>limite <Valor cents={c.limite_cents} curto /></span></p>
              </div>
            </motion.button>
          )
        })}
      </div>

      {sel && resumo && (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-4">
            <Painel className="p-5">
              <div className="flex items-start justify-between">
                <div><p className="text-[13px] text-taupe">Fatura atual (aberta)</p>
                  <Valor cents={resumo.atual?.total ?? 0} className="titulo mt-1 block text-[30px]" />
                  <p className="text-xs text-taupe">fecha {dataBR(resumo.datasAtual.fechamento)} · vence {dataBR(resumo.datasAtual.vencimento)}</p>
                </div>
                <div className="flex gap-0.5">
                  <button title="Editar cartão" aria-label="Editar cartão" onClick={() => setModal({ aberto: true, editar: sel })} className="grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-carvao"><L.Pencil className="h-4 w-4" /></button>
                  <button title="Arquivar cartão" aria-label="Arquivar cartão" onClick={async () => { if (await confirmar({ titulo: `Arquivar "${sel.nome}"?`, texto: 'O histórico e as faturas continuam guardados.', botao: 'Arquivar' })) executar(() => atualizar('cartoes', sel.id, { arquivado: true }), 'Cartão arquivado.') }} className="grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-carvao"><L.Archive className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-taupe">Limite total</span><Valor cents={sel.limite_cents} /></div>
                <div className="flex justify-between"><span className="text-taupe">Comprometido</span><Valor cents={resumo.usado} /></div>
                <Barra pct={sel.limite_cents ? (resumo.usado / sel.limite_cents) * 100 : 0} tom="auto" rotulo="Limite usado" />
                <div className="flex justify-between font-medium"><span>Disponível</span><Valor cents={resumo.disponivel} className={resumo.disponivel < 0 ? 'text-despesa' : ''} /></div>
              </div>
            </Painel>

            {resumo.aPagar.length > 0 && (
              <Painel className="border-atencao/30 p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium"><L.Bell className="h-4 w-4 text-atencao" />Faturas a pagar</p>
                <ul className="space-y-3">{resumo.aPagar.map(i => (
                  <li key={i.fatura.id} className="flex items-center justify-between gap-3">
                    <div><p className="text-sm font-medium">Vence {dataBR(i.fatura.vencimento)}</p><Etiqueta tom={TOM_STATUS[i.status]}>{i.status}{i.pago > 0 && ' · parcial'}</Etiqueta></div>
                    <div className="text-right"><Valor cents={i.restante} className="block font-medium" /><Botao tamanho="sm" variante="primario" className="mt-1" onClick={() => setPagar(i.fatura.id)}>Pagar</Botao></div>
                  </li>
                ))}</ul>
              </Painel>
            )}

            <Painel>
              <TituloPainel titulo="Próximas faturas" sub="Inclui parcelas futuras" />
              {resumo.faturas.filter(i => i.status !== 'paga' || i.fatura.id === faturaSel?.fatura.id).length === 0 ? <p className="px-5 pb-5 text-sm text-taupe">Nenhuma fatura ainda.</p> : (
                <ul className="px-2 pb-3">{resumo.faturas.filter(i => i.total > 0).slice(-14).map(i => (
                  <li key={i.fatura.id}>
                    <button onClick={() => { setFaturaVer(i.fatura.id); setAba('faturas') }} className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-marfim', faturaSel?.fatura.id === i.fatura.id && 'bg-vinho-claro/60')}>
                      <span className="flex items-center gap-2"><span className="w-14 text-left capitalize">{mesCurto(i.fatura.vencimento, true)}</span><Etiqueta tom={TOM_STATUS[i.status]}>{i.status}</Etiqueta></span>
                      <Valor cents={i.total} className="font-medium" />
                    </button>
                  </li>
                ))}</ul>
              )}
            </Painel>
          </div>

          <Painel className="lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <Abas valor={aba} aoMudar={setAba} opcoes={[{ v: 'faturas', r: 'Fatura' }, { v: 'compras', r: 'Histórico de compras' }]} />
              {aba === 'faturas' && faturaSel && <span className="text-sm text-taupe">Vencimento <b className="text-carvao">{dataBR(faturaSel.fatura.vencimento)}</b> · {nomeMes(faturaSel.fatura.vencimento)}</span>}
            </div>
            {aba === 'faturas' ? (
              faturaSel && comprasFatura.length ? (
                <>
                  <ResumoFatura i={faturaSel} onPagar={() => setPagar(faturaSel.fatura.id)} />
                  <ul className="divide-y divide-borda/70 px-2 pb-2">
                    {comprasFatura.sort((a, z) => z.c.data_compra.localeCompare(a.c.data_compra)).map(({ p, c }) => {
                      const cat = c.categoria_id ? cats.get(c.categoria_id) : null
                      return (
                        <li key={p.id} className="flex items-center gap-3 px-3 py-3">
                          <IconeCategoria cor={cat?.cor ?? '#817678'} icone={cat?.icone ?? 'shopping-bag'} />
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.descricao}</p><p className="text-xs text-taupe">{dataBR(c.data_compra)}{c.parcelas > 1 && ` · parcela ${p.numero} de ${c.parcelas}`}</p></div>
                          <Valor cents={p.valor_cents} className="text-sm font-medium" />
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : <Vazio compacto icone={L.Receipt} titulo="Fatura sem compras" texto="Compras feitas antes do fechamento entram aqui." acao={<Botao variante="suave" icone={L.Plus} onClick={() => nova('cartao')}>Nova compra</Botao>} />
            ) : comprasCartao.length ? (
              <ul className="mt-3 divide-y divide-borda/70 px-2 pb-2">
                {comprasCartao.map(c => {
                  const cat = c.categoria_id ? cats.get(c.categoria_id) : null
                  return (
                    <li key={c.id} className={cn('flex items-center gap-3 px-3 py-3', c.cancelada && 'opacity-50')}>
                      <IconeCategoria cor={cat?.cor ?? '#817678'} icone={cat?.icone ?? 'shopping-bag'} />
                      <div className="min-w-0 flex-1"><p className={cn('truncate text-sm font-medium', c.cancelada && 'line-through')}>{c.descricao}</p><p className="text-xs text-taupe">{dataBR(c.data_compra)} · {c.parcelas > 1 ? `${c.parcelas}x de ` : 'à vista'}{c.parcelas > 1 && <Valor cents={Math.floor(c.valor_total_cents / c.parcelas)} />}{c.cancelada && ' · cancelada'}</p></div>
                      <Valor cents={c.valor_total_cents} className="text-sm font-medium" />
                    </li>
                  )
                })}
              </ul>
            ) : <Vazio compacto icone={L.ShoppingBag} titulo="Nenhuma compra neste cartão" />}
          </Painel>
        </div>
      )}

      <p className="mt-4 px-1 text-xs text-taupe">Cada compra conta uma vez nos relatórios (parcela a parcela, no mês de cada uma). Pagar a fatura reduz o saldo da conta e a dívida do cartão, sem criar nova despesa.</p>

      <CartaoModal aberto={modal.aberto} editar={modal.editar} aoFechar={() => setModal({ aberto: false, editar: null })} />
      <PagarFaturaModal faturaId={pagar} aoFechar={() => setPagar(null)} />
    </div>
  )
}

function ResumoFatura({ i, onPagar }: { i: InfoFatura; onPagar: () => void }) {
  return (
    <div className="mx-5 mt-4 mb-2 grid grid-cols-2 gap-3 rounded-xl bg-marfim p-4 sm:grid-cols-4">
      <div><p className="text-xs text-taupe">Total</p><Valor cents={i.total} className="font-semibold" /></div>
      <div><p className="text-xs text-taupe">Pago</p><Valor cents={i.pago} className="font-semibold" /></div>
      <div><p className="text-xs text-taupe">Fechamento</p><p className="num text-sm font-semibold">{dataBR(i.fatura.fechamento)}</p></div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Etiqueta tom={TOM_STATUS[i.status]}>{i.status}</Etiqueta>
        {i.restante > 0 && i.status !== 'aberta' && <Botao tamanho="sm" variante="primario" onClick={onPagar}>Pagar</Botao>}
        {i.restante > 0 && i.status === 'aberta' && <Botao tamanho="sm" onClick={onPagar} title="Pagamento antecipado">Antecipar</Botao>}
      </div>
    </div>
  )
}
