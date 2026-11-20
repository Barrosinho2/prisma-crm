import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { motion } from 'motion/react'
import { useDados } from '../lib/dados'
import { CONTAS_LIVRES, saldos } from '../lib/motor'
import { dataBR } from '../lib/formato'
import { TIPOS_CONTA, type Banco, type Conta } from '../lib/tipos'
import { Cabecalho, useNovaTransacao } from '../components/Layout'
import { BotaoOlho, Botao, Etiqueta, Modal, NumeroAnimado, Painel, TituloPainel, Valor, Vazio, cn, useAcao, useAvisos, useOculto } from '../components/ui'
import { ContaModal } from '../components/Formularios'

const ICONE_TIPO = { corrente: L.Landmark, digital: L.Smartphone, poupanca: L.PiggyBank, dinheiro: L.Banknote, reserva: L.ShieldCheck }

interface Mov { data: string; desc: string; valor: number; tipo: string }
function movimentosDaConta(b: Banco, id: string): Mov[] {
  const out: Mov[] = []
  const contas = new Map(b.contas.map(c => [c.id, c.nome]))
  for (const l of b.lancamentos) if (l.conta_id === id && l.status === 'efetivado' && !l.compra_id)
    out.push({ data: l.data_efetiva!, desc: l.descricao, valor: l.tipo === 'receita' ? l.valor_cents : -l.valor_cents, tipo: l.tipo === 'receita' ? 'Receita' : 'Despesa' })
  for (const t of b.transferencias) if (!t.cancelada && (t.origem_id === id || t.destino_id === id))
    out.push({ data: t.data, desc: t.origem_id === id ? `Para ${contas.get(t.destino_id)}` : `De ${contas.get(t.origem_id)}`, valor: t.origem_id === id ? -t.valor_cents : t.valor_cents, tipo: 'Transferência' })
  const fat = new Map(b.faturas.map(f => [f.id, f])), car = new Map(b.cartoes.map(c => [c.id, c.nome]))
  for (const p of b.pagamentos) if (!p.cancelado && p.conta_id === id)
    out.push({ data: p.data, desc: `Fatura ${car.get(fat.get(p.fatura_id)?.cartao_id ?? '') ?? ''}`, valor: -p.valor_cents, tipo: 'Pagamento de fatura' })
  const metas = new Map(b.metas.map(m => [m.id, m]))
  for (const mv of b.movimentos) {
    const m = metas.get(mv.meta_id)
    if (mv.cancelado || !m || !m.conta_id || !mv.conta_id || m.conta_id === mv.conta_id) continue
    const entra = (mv.tipo === 'aporte' && m.conta_id === id) || (mv.tipo === 'retirada' && mv.conta_id === id)
    const sai = (mv.tipo === 'aporte' && mv.conta_id === id) || (mv.tipo === 'retirada' && m.conta_id === id)
    if (entra || sai) out.push({ data: mv.data, desc: `${mv.tipo === 'aporte' ? 'Guardado em' : 'Retirado de'} ${m.nome}`, valor: entra ? mv.valor_cents : -mv.valor_cents, tipo: 'Meta' })
  }
  return out.sort((a, z) => z.data.localeCompare(a.data))
}

export default function Contas() {
  const { banco, atualizar, excluir } = useDados()
  const nova = useNovaTransacao()
  const { confirmar } = useAvisos()
  const { executar } = useAcao()
  const [modal, setModal] = useState<{ aberto: boolean; editar: Conta | null }>({ aberto: false, editar: null })
  const [historico, setHistorico] = useState<Conta | null>(null)
  const [arquivadas, setArquivadas] = useState(false)
  const s = useMemo(() => saldos(banco), [banco])
  const ativas = banco.contas.filter(c => !c.arquivada).sort((a, z) => a.ordem - z.ordem || a.nome.localeCompare(z.nome))
  const arq = banco.contas.filter(c => c.arquivada)
  const total = ativas.reduce((a, c) => a + (s.get(c.id) ?? 0), 0)
  const livre = ativas.filter(c => CONTAS_LIVRES.has(c.tipo)).reduce((a, c) => a + (s.get(c.id) ?? 0), 0)
  const reserva = total - livre
  const movs = historico ? movimentosDaConta(banco, historico.id) : []

  async function apagar(c: Conta) {
    if (!(await confirmar({ titulo: `Excluir "${c.nome}"?`, texto: 'Só é possível excluir contas sem nenhuma movimentação. Se ela já foi usada, arquive.', botao: 'Excluir', perigo: true }))) return
    await executar(() => excluir('contas', c.id), 'Conta excluída.')
  }

  return (
    <div>
      <Cabecalho titulo="Contas e saldos" sub="Onde seu dinheiro está agora."
        acoes={<><Botao icone={L.ArrowLeftRight} onClick={() => nova('transferencia')}>Transferir</Botao><Botao icone={L.Plus} variante="suave" onClick={() => setModal({ aberto: true, editar: null })}>Nova conta</Botao></>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <CartaoResumo chave="patrimonio" escuro rotulo="Patrimônio em contas" cents={total} nota={`${ativas.length} ${ativas.length === 1 ? 'conta ativa' : 'contas ativas'}`} />
        <CartaoResumo chave="contas-livres" rotulo="Em contas de uso livre" cents={livre} nota="corrente, digital, poupança e espécie" />
        <CartaoResumo chave="contas-reserva" rotulo="Em contas de reserva" cents={reserva} nota="fora do disponível para gastar" />
      </div>

      {ativas.length === 0 ? (
        <Painel><Vazio icone={L.Landmark} titulo="Nenhuma conta cadastrada" texto="Comece pela conta onde recebe o salário, informando o saldo de hoje." acao={<Botao variante="primario" icone={L.Plus} onClick={() => setModal({ aberto: true, editar: null })}>Cadastrar conta</Botao>} /></Painel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ativas.map((c, i) => {
            const Ic = ICONE_TIPO[c.tipo]
            const v = s.get(c.id) ?? 0
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Painel className="group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-elevada">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: c.cor ?? '#621F32' }} />
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: (c.cor ?? '#621F32') + '14', color: c.cor ?? '#621F32' }}><Ic className="h-5 w-5" strokeWidth={1.6} /></span>
                      <div><p className="font-medium">{c.nome}</p><p className="text-xs text-taupe">{TIPOS_CONTA[c.tipo]}</p></div>
                    </div>
                    <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <BotaoIcone i={L.Pencil} r="Editar" f={() => setModal({ aberto: true, editar: c })} />
                      <BotaoIcone i={L.Archive} r="Arquivar" f={async () => { if (await confirmar({ titulo: `Arquivar "${c.nome}"?`, texto: 'Ela sai das listas e do saldo do painel, mas o histórico continua.', botao: 'Arquivar' })) executar(() => atualizar('contas', c.id, { arquivada: true }), 'Conta arquivada.') }} />
                      <BotaoIcone i={L.Trash2} r="Excluir" f={() => apagar(c)} />
                    </div>
                  </div>
                  <SaldoConta id={c.id} cents={v} inicial={c.saldo_inicial_cents} desde={c.data_saldo_inicial} />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Botao tamanho="sm" icone={L.SlidersHorizontal} onClick={() => setModal({ aberto: true, editar: c })}>Ajustar saldo</Botao>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setHistorico(c)}>Ver movimentações</Botao>
                  </div>
                </Painel>
              </motion.div>
            )
          })}
        </div>
      )}

      {arq.length > 0 && (
        <div className="mt-8">
          <button className="mb-3 inline-flex items-center gap-1.5 text-sm text-taupe hover:text-carvao" onClick={() => setArquivadas(v => !v)}>
            <L.ChevronRight className={cn('h-4 w-4 transition', arquivadas && 'rotate-90')} />Contas arquivadas ({arq.length})
          </button>
          {arquivadas && (
            <Painel><ul className="divide-y divide-borda">{arq.map(c => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{c.nome} <span className="text-taupe">· <Valor cents={s.get(c.id) ?? 0} /></span></span>
                <Botao tamanho="sm" icone={L.ArchiveRestore} onClick={() => executar(() => atualizar('contas', c.id, { arquivada: false }), 'Conta reativada.')}>Reativar</Botao>
              </li>
            ))}</ul></Painel>
          )}
        </div>
      )}

      <Painel className="mt-6 p-5 text-sm text-taupe">
        <p className="flex items-start gap-2"><L.Info className="mt-0.5 h-4 w-4 shrink-0 text-vinho-suave" />Transferências entre suas contas não contam como receita nem despesa e não mudam o patrimônio. Contas do tipo “reserva” ficam fora do valor disponível para gastar.</p>
      </Painel>

      <ContaModal aberto={modal.aberto} editar={modal.editar} aoFechar={() => setModal({ aberto: false, editar: null })} />
      <Modal aberto={!!historico} aoFechar={() => setHistorico(null)} largura="lg" titulo={historico?.nome ?? ''} sub={historico ? <>Saldo atual <Valor cents={s.get(historico.id) ?? 0} className="font-medium text-carvao" /></> : undefined}>
        {movs.length === 0 ? <Vazio compacto icone={L.Receipt} titulo="Sem movimentações" /> : (
          <Painel className="overflow-hidden">
            <TituloPainel titulo="Histórico" sub={`${movs.length} movimentações efetivadas`} />
            <ul className="divide-y divide-borda/70">
              {(() => {
                let corrente = s.get(historico!.id) ?? 0
                return movs.map((m, i) => {
                  const depois = corrente
                  corrente -= m.valor
                  return (
                    <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <span className="num w-20 shrink-0 text-taupe">{dataBR(m.data)}</span>
                      <div className="min-w-0 flex-1"><p className="truncate font-medium">{m.desc}</p><Etiqueta>{m.tipo}</Etiqueta></div>
                      <div className="text-right"><Valor cents={m.valor} sinal className={m.valor > 0 ? 'font-medium text-receita' : 'font-medium'} /><p className="text-xs text-taupe">saldo <Valor cents={depois} /></p></div>
                    </li>
                  )
                })
              })()}
              <li className="flex items-center gap-3 bg-marfim px-5 py-3 text-sm text-taupe"><span className="num w-20">{dataBR(historico?.data_saldo_inicial)}</span><span className="flex-1">Saldo inicial</span><Valor cents={historico?.saldo_inicial_cents ?? 0} /></li>
            </ul>
          </Painel>
        )}
      </Modal>
    </div>
  )
}

function BotaoIcone({ i: Ic, r, f }: { i: L.LucideIcon; r: string; f: () => void }) {
  return <button onClick={f} title={r} aria-label={r} className="grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-carvao"><Ic className="h-4 w-4" /></button>
}

function CartaoResumo({ chave, rotulo, cents, nota, escuro }: { chave: string; rotulo: string; cents: number; nota: string; escuro?: boolean }) {
  const [oculto, alternar] = useOculto(chave)
  return (
    <Painel className={cn('p-5', escuro && 'bg-vinho-escuro text-marfim')}>
      <div className="flex items-center justify-between"><p className={cn('text-[13px]', escuro ? 'text-[#E4CBD2]' : 'text-taupe')}>{rotulo}</p><BotaoOlho claro={escuro} oculto={oculto} alternar={alternar} /></div>
      <NumeroAnimado ocultar={oculto} cents={cents} className={cn('mt-2 block', escuro ? 'titulo text-[32px]' : 'cifra text-[26px]')} />
      <p className={cn('mt-1 text-xs', escuro ? 'text-[#CDB9BF]' : 'text-taupe')}>{nota}</p>
    </Painel>
  )
}
function SaldoConta({ id, cents, desde }: { id: string; cents: number; inicial?: number; desde: string }) {
  const [oculto, alternar] = useOculto('conta:' + id)
  return (<>
    <div className="mt-6 flex items-center gap-2">
      <Valor ocultar={oculto} cents={cents} className={cn('cifra block text-[27px]', cents < 0 && 'text-despesa')} />
      <BotaoOlho oculto={oculto} alternar={alternar} />
    </div>
    <p className="mt-1 text-xs text-taupe">Acompanhada desde {dataBR(desde)}</p>
  </>)
}
