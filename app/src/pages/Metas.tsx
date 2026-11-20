import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { useDados } from '../lib/dados'
import { contribuicaoSugerida, essenciaisMensais, saldoMeta } from '../lib/motor'
import { dataBR } from '../lib/formato'
import type { Meta } from '../lib/tipos'
import { Cabecalho } from '../components/Layout'
import { Barra, Botao, Dica, Etiqueta, Icone, Modal, Painel, Valor, Vazio, cn, useAcao, useAvisos } from '../components/ui'
import { MetaModal, MovimentoMetaModal } from '../components/Formularios'

export default function Metas() {
  const { banco, hoje, atualizar } = useDados()
  const { confirmar } = useAvisos()
  const { executar } = useAcao()
  const [modal, setModal] = useState<{ aberto: boolean; editar: Meta | null; emergencia?: boolean; alvo?: number | null }>({ aberto: false, editar: null })
  const [mov, setMov] = useState<{ meta: Meta; tipo: 'aporte' | 'retirada' } | null>(null)
  const [hist, setHist] = useState<Meta | null>(null)
  const [mesesSug, setMesesSug] = useState(6)
  const emerg = banco.metas.find(m => m.emergencia && !m.arquivada) ?? null
  const outras = banco.metas.filter(m => !m.emergencia && !m.arquivada)
  const arquivadas = banco.metas.filter(m => m.arquivada)
  const ess = useMemo(() => essenciaisMensais(banco, hoje), [banco, hoje])
  const contas = new Map(banco.contas.map(c => [c.id, c.nome]))

  const historico = hist ? banco.movimentos.filter(m => m.meta_id === hist.id).sort((a, z) => z.data.localeCompare(a.data)) : []

  return (
    <div>
      <Cabecalho titulo="Metas financeiras" sub="O que você está construindo, passo a passo."
        acoes={<Botao variante="suave" icone={L.Plus} onClick={() => setModal({ aberto: true, editar: null })}>Nova meta</Botao>} />

      {/* reserva de emergência */}
      <Painel className="mb-6 overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_1fr]">
          <div className="relative bg-vinho-escuro p-6 text-marfim sm:p-8">
            <svg className="pointer-events-none absolute right-0 top-0 h-full opacity-[0.08]" viewBox="0 0 200 200" aria-hidden><path d="M100 20 170 50v50c0 40-30 70-70 80-40-10-70-40-70-80V50z" fill="none" stroke="#fff" strokeWidth="1.5" /></svg>
            <p className="flex items-center gap-2 text-[13px] text-[#E4CBD2]"><L.ShieldCheck className="h-4 w-4" />Reserva de emergência</p>
            {emerg ? (() => {
              const g = saldoMeta(banco, emerg.id)
              const cobertos = ess.valor ? g / ess.valor : null
              return (<>
                <Valor cents={g} className="titulo mt-3 block text-[40px] leading-none" />
                <p className="mt-2 text-sm text-[#CDB9BF]">de <Valor cents={emerg.alvo_cents} /> · {Math.min(100, Math.round((g / emerg.alvo_cents) * 100))}% concluído</p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-[#E4CBD2]" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (g / emerg.alvo_cents) * 100)}%` }} transition={{ duration: 1 }} /></div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Botao variante="secundario" className="border-transparent bg-marfim text-vinho-escuro hover:bg-white" icone={L.Plus} onClick={() => setMov({ meta: emerg, tipo: 'aporte' })}>Guardar</Botao>
                  <Botao variante="fantasma" className="text-[#E4CBD2] hover:bg-white/5 hover:text-white" onClick={() => setMov({ meta: emerg, tipo: 'retirada' })}>Retirar</Botao>
                  <Botao variante="fantasma" className="text-[#E4CBD2] hover:bg-white/5 hover:text-white" onClick={() => setHist(emerg)}>Histórico</Botao>
                  <Botao variante="fantasma" className="text-[#E4CBD2] hover:bg-white/5 hover:text-white" onClick={() => setModal({ aberto: true, editar: emerg })}>Editar</Botao>
                </div>
                {cobertos != null && <p className="mt-5 text-sm text-[#E9DCDF]">Cobre <b className="text-marfim">{cobertos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {cobertos >= 0.95 && cobertos < 1.05 ? 'mês' : 'meses'}</b> de despesas essenciais.</p>}
              </>)
            })() : (
              <div className="mt-3">
                <p className="titulo text-2xl">Seu colchão para imprevistos</p>
                <p className="mt-2 max-w-md text-sm text-[#CDB9BF]">Um valor separado só para emergências, que não entra no disponível para gastar.</p>
              </div>
            )}
          </div>
          <div className="p-6 sm:p-8">
            <p className="flex items-center gap-1.5 text-sm font-medium">Despesas essenciais por mês
              <Dica texto="Usamos o valor que você configurou. Se não houver, a média dos últimos meses nas categorias marcadas como essenciais, ou a soma das despesas fixas essenciais." /></p>
            {ess.valor ? (<>
              <Valor cents={ess.valor} className="cifra mt-1 block text-[26px]" />
              <p className="text-xs text-taupe">{ess.fonte === 'configurado' ? 'valor configurado por você' : ess.fonte === 'mes_atual' ? 'gasto deste mês até agora nas categorias essenciais (fica mais preciso com o tempo)' : ess.fonte === 'historico' ? `média de ${ess.meses} ${ess.meses === 1 ? 'mês' : 'meses'} nas categorias essenciais` : 'soma das despesas fixas essenciais'}</p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[3, 6, 12].map(n => (
                  <button key={n} onClick={() => setMesesSug(n)} aria-pressed={mesesSug === n}
                    className={cn('rounded-xl border p-3 text-left transition', mesesSug === n ? 'border-vinho bg-vinho-claro/60' : 'border-borda hover:border-vinho-suave/50')}>
                    <p className="text-xs text-taupe">{n} meses</p><Valor cents={ess.valor! * n} curto className="text-sm font-semibold" />
                  </button>
                ))}
              </div>
              {emerg ? (
                emerg.alvo_cents !== ess.valor * mesesSug && <Botao className="mt-4" tamanho="sm" variante="suave" onClick={() => executar(() => atualizar('metas', emerg.id, { alvo_cents: ess.valor! * mesesSug, meses_alvo: mesesSug }), 'Objetivo da reserva atualizado.')}>Usar {mesesSug} meses como objetivo</Botao>
              ) : <Botao className="mt-4" variante="primario" icone={L.ShieldCheck} onClick={() => setModal({ aberto: true, editar: null, emergencia: true, alvo: ess.valor! * mesesSug })}>Criar reserva de {mesesSug} meses</Botao>}
            </>) : (
              <div className="mt-2 text-sm text-taupe">
                <p>Ainda não há dados para calcular. Informe o valor em <Link to="/configuracoes" className="font-medium text-vinho hover:underline">Configurações</Link> ou marque categorias como essenciais e registre seus gastos.</p>
                {!emerg && <Botao className="mt-4" variante="suave" icone={L.ShieldCheck} onClick={() => setModal({ aberto: true, editar: null, emergencia: true, alvo: null })}>Criar reserva com valor próprio</Botao>}
              </div>
            )}
          </div>
        </div>
      </Painel>

      {outras.length === 0 ? (
        <Painel><Vazio icone={L.Target} titulo="Nenhuma meta ainda" texto="Viagem, computador novo, um investimento... defina o valor e acompanhe o progresso." acao={<Botao variante="primario" icone={L.Plus} onClick={() => setModal({ aberto: true, editar: null })}>Criar meta</Botao>} /></Painel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {outras.map((m, i) => {
            const g = saldoMeta(banco, m.id)
            const pct = (g / m.alvo_cents) * 100
            const sug = contribuicaoSugerida(m, g, hoje)
            const atrasada = m.prazo && m.prazo < hoje && g < m.alvo_cents
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Painel className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-vinho-claro text-vinho"><Icone nome={m.icone} className="h-5 w-5" /></span>
                    <div className="flex gap-0.5">
                      <button onClick={() => setModal({ aberto: true, editar: m })} className="grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-carvao" aria-label="Editar" title="Editar"><L.Pencil className="h-4 w-4" /></button>
                      <button onClick={async () => { if (await confirmar({ titulo: `Arquivar "${m.nome}"?`, texto: 'O histórico continua guardado. O valor separado deixa de ser descontado do disponível.', botao: 'Arquivar' })) executar(() => atualizar('metas', m.id, { arquivada: true }), 'Meta arquivada.') }} className="grid h-8 w-8 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-carvao" aria-label="Arquivar" title="Arquivar"><L.Archive className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <p className="titulo mt-4 text-xl">{m.nome}</p>
                  <p className="mt-1 text-sm text-taupe"><Valor cents={g} className="font-semibold text-carvao" /> de <Valor cents={m.alvo_cents} /></p>
                  <div className="mt-4"><Barra pct={pct} tom={pct >= 100 ? 'receita' : 'vinho'} rotulo={m.nome} /></div>
                  <div className="mt-2 flex items-center justify-between text-xs text-taupe">
                    <span className="font-medium text-carvao">{Math.min(100, Math.round(pct))}% concluído</span>
                    {g < m.alvo_cents ? <span>faltam <Valor cents={m.alvo_cents - g} /></span> : <Etiqueta tom="receita">alcançada</Etiqueta>}
                  </div>
                  <div className="mt-4 space-y-1 border-t border-borda pt-3 text-xs text-taupe">
                    {m.prazo && <p className={atrasada ? 'text-despesa' : ''}>Prazo: {dataBR(m.prazo)}{atrasada && ' (passou)'}</p>}
                    {sug != null && sug > 0 && <p>Sugestão: guardar <Valor cents={sug} className="font-medium text-carvao" /> por mês para chegar no prazo.</p>}
                    <p>{m.conta_id ? `Guardado em: ${contas.get(m.conta_id) ?? '—'}` : 'Separado dentro das contas de origem'}</p>
                  </div>
                  <div className="mt-auto flex gap-2 pt-4">
                    <Botao tamanho="sm" variante="primario" icone={L.Plus} className="flex-1" onClick={() => setMov({ meta: m, tipo: 'aporte' })}>Guardar</Botao>
                    <Botao tamanho="sm" onClick={() => setMov({ meta: m, tipo: 'retirada' })} disabled={g <= 0}>Retirar</Botao>
                    <Botao tamanho="sm" variante="fantasma" icone={L.History} onClick={() => setHist(m)}>Histórico</Botao>
                  </div>
                </Painel>
              </motion.div>
            )
          })}
        </div>
      )}

      {arquivadas.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-taupe hover:text-carvao">Metas arquivadas ({arquivadas.length})</summary>
          <Painel className="mt-3"><ul className="divide-y divide-borda">{arquivadas.map(m => (
            <li key={m.id} className="flex items-center justify-between px-5 py-3 text-sm"><span>{m.nome} · <Valor cents={saldoMeta(banco, m.id)} /></span>
              <Botao tamanho="sm" icone={L.ArchiveRestore} onClick={() => executar(() => atualizar('metas', m.id, { arquivada: false }), 'Meta reativada.')}>Reativar</Botao></li>
          ))}</ul></Painel>
        </details>
      )}

      <p className="mt-4 px-1 text-xs text-taupe">Guardar dinheiro numa meta não é despesa: é uma transferência para a conta de reserva ou uma separação dentro da conta. Por isso não aparece nos gastos.</p>

      <MetaModal aberto={modal.aberto} editar={modal.editar} emergencia={modal.emergencia} alvoSugerido={modal.alvo} aoFechar={() => setModal({ aberto: false, editar: null })} />
      <MovimentoMetaModal meta={mov?.meta ?? null} tipo={mov?.tipo ?? 'aporte'} aoFechar={() => setMov(null)} />
      <Modal aberto={!!hist} aoFechar={() => setHist(null)} titulo={hist?.nome ?? ''} sub="Contribuições e retiradas">
        {historico.length === 0 ? <Vazio compacto titulo="Sem movimentações" /> : (
          <ul className="divide-y divide-borda/70">{historico.map(h => (
            <li key={h.id} className={cn('flex items-center justify-between gap-3 py-3 text-sm', h.cancelado && 'opacity-50')}>
              <div><p className="font-medium">{h.tipo === 'aporte' ? 'Guardado' : 'Retirado'}{h.cancelado && ' (cancelado)'}</p><p className="text-xs text-taupe">{dataBR(h.data)} · {contas.get(h.conta_id ?? '') ?? '—'}{h.obs && ` · ${h.obs}`}</p></div>
              <Valor cents={h.tipo === 'aporte' ? h.valor_cents : -h.valor_cents} sinal className={h.tipo === 'aporte' ? 'font-medium text-receita' : 'font-medium'} />
            </li>
          ))}</ul>
        )}
      </Modal>
    </div>
  )
}
