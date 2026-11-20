import { useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { useDados } from '../lib/dados'
import { infoFaturas, statusVisivel } from '../lib/motor'
import { dataBR, diasEntre, fimMes, inicioMes, mesCurto, nomeMes, somaDias } from '../lib/formato'
import type { Lancamento, Recorrencia } from '../lib/tipos'
import { Cabecalho } from '../components/Layout'
import { Abas, Botao, Etiqueta, IconeCategoria, Painel, Valor, Vazio, cn, useAcao, useAvisos } from '../components/ui'
import { ConfirmarModal, PagarFaturaModal, RecorrenciaModal, TransacaoModal } from '../components/Formularios'

type Aba = 'pendentes' | 'receitas' | 'pagas' | 'recorrentes'

export default function APagar() {
  const { banco, hoje, mesRef, rpc, atualizar } = useDados()
  const { executar } = useAcao()
  const { confirmar } = useAvisos()
  const [aba, setAba] = useState<Aba>('pendentes')
  const [nova, setNova] = useState<null | 'despesa' | 'receita'>(null)
  const [conf, setConf] = useState<Lancamento | null>(null)
  const [editar, setEditar] = useState<Lancamento | null>(null)
  const [rec, setRec] = useState<Recorrencia | null>(null)
  const [pagarFatura, setPagarFatura] = useState<string | null>(null)
  const cats = useMemo(() => new Map(banco.categorias.map(c => [c.id, c])), [banco.categorias])
  const contas = useMemo(() => new Map(banco.contas.map(c => [c.id, c.nome])), [banco.contas])
  const cartoes = useMemo(() => new Map(banco.cartoes.map(c => [c.id, c.nome])), [banco.cartoes])
  const alerta = banco.config?.alerta_dias ?? 3

  const pend = useMemo(() => banco.lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pendente').sort((a, z) => a.data_prevista.localeCompare(z.data_prevista)), [banco.lancamentos])
  const faturas = useMemo(() => [...infoFaturas(banco, hoje).values()].filter(i => i.restante > 0 && i.status !== 'aberta').sort((a, z) => a.fatura.vencimento.localeCompare(z.fatura.vencimento)), [banco, hoje])
  const vencidas = pend.filter(l => l.data_prevista < hoje)
  const proximas = pend.filter(l => l.data_prevista >= hoje && l.data_prevista <= somaDias(hoje, alerta))
  const pagasMes = banco.lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'efetivado' && !l.compra_id && l.data_efetiva! >= inicioMes(mesRef) && l.data_efetiva! <= fimMes(mesRef))
  const receitasPrev = banco.lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pendente').sort((a, z) => a.data_prevista.localeCompare(z.data_prevista))
  const recorr = banco.recorrencias.slice().sort((a, z) => Number(z.ativa) - Number(a.ativa) || a.tipo.localeCompare(z.tipo) || a.dia - z.dia)
  const somaV = (xs: Lancamento[]) => xs.reduce((a, l) => a + l.valor_cents, 0)
  const aVencerMes = pend.filter(l => l.data_prevista >= hoje && l.data_prevista <= fimMes(hoje))

  const umClique = (l: Lancamento) => executar(() => rpc('fin_confirmar', { p_id: l.id, p_data: hoje }), l.tipo === 'receita' ? 'Recebimento confirmado.' : 'Marcado como pago hoje.')

  function Item({ l }: { l: Lancamento }) {
    const c = l.categoria_id ? cats.get(l.categoria_id) : null
    const st = statusVisivel(l, hoje)
    const dias = diasEntre(hoje, l.data_prevista)
    const quando = l.status === 'efetivado' ? `${l.tipo === 'receita' ? 'recebido' : 'pago'} em ${dataBR(l.data_efetiva)}`
      : st === 'vencido' ? `venceu há ${-dias} ${-dias === 1 ? 'dia' : 'dias'}` : dias === 0 ? 'vence hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`
    return (
      <li className={cn('group flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5', st === 'vencido' && 'bg-despesa-fundo/40')}>
        <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-center leading-none', st === 'vencido' ? 'border-despesa/30 text-despesa' : 'border-borda bg-marfim')}>
          <div><p className="text-[15px] font-semibold">{(l.data_efetiva ?? l.data_prevista).slice(8)}</p><p className="text-[9.5px] uppercase">{mesCurto(l.data_efetiva ?? l.data_prevista)}</p></div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-medium">{l.descricao}{l.recorrencia_id && <L.Repeat className="h-3.5 w-3.5 shrink-0 text-taupe" aria-label="recorrente" />}</p>
          <p className="truncate text-xs text-taupe">
            {c && <span>{c.nome} · </span>}{l.cartao_id ? `cartão ${cartoes.get(l.cartao_id)}` : contas.get(l.conta_id ?? '') ?? 'sem conta'} · <span className={st === 'vencido' ? 'font-medium text-despesa' : ''}>{quando}</span>
          </p>
        </div>
        <Etiqueta className="max-sm:hidden" tom={st === 'vencido' ? 'despesa' : st === 'pago' || st === 'recebido' ? 'receita' : 'atencao'}>{st}</Etiqueta>
        <Valor cents={l.valor_cents} className="w-28 text-right text-sm font-semibold" />
        <div className="flex w-full justify-end gap-1 sm:w-auto">
          {l.status === 'pendente' ? (<>
            <Botao tamanho="sm" variante="primario" icone={L.Check} onClick={() => umClique(l)} title={l.tipo === 'receita' ? 'Confirmar recebimento com a data de hoje' : 'Marcar como pago hoje'}>{l.tipo === 'receita' ? 'Recebido' : 'Pago'}</Botao>
            <Botao tamanho="icone" variante="fantasma" onClick={() => setConf(l)} title="Outra data ou valor" aria-label="Confirmar com outra data ou valor"><L.CalendarClock className="h-4 w-4" /></Botao>
            <Botao tamanho="icone" variante="fantasma" onClick={() => setEditar(l)} title="Editar" aria-label="Editar"><L.Pencil className="h-4 w-4" /></Botao>
            <Botao tamanho="icone" variante="fantasma" title="Cancelar esta cobrança" aria-label="Cancelar" onClick={async () => {
              if (await confirmar({ titulo: 'Cancelar esta cobrança?', texto: l.recorrencia_id ? 'Só esta ocorrência é cancelada; as próximas continuam.' : 'Ela sai das contas a pagar.', botao: 'Cancelar cobrança', perigo: true }))
                executar(() => atualizar('lancamentos', l.id, { status: 'cancelado' }), 'Cobrança cancelada.')
            }}><L.X className="h-4 w-4" /></Botao>
          </>) : (
            <Botao tamanho="sm" variante="fantasma" icone={L.Undo2} onClick={() => executar(() => rpc('fin_desfazer', { p_id: l.id }), 'Voltou para pendente.')}>Desfazer</Botao>
          )}
        </div>
      </li>
    )
  }

  return (
    <div>
      <Cabecalho titulo="Contas a pagar" sub="Vencimentos, assinaturas e despesas fixas."
        acoes={<Botao variante="suave" icone={L.Plus} onClick={() => setNova('despesa')}>Nova conta a pagar</Botao>} />

      {banco.config?.alertas_ativos !== false && (vencidas.length > 0 || proximas.length > 0 || faturas.some(f => f.status === 'vencida')) && (
        <div role="status" className={cn('mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm', vencidas.length ? 'border-despesa/25 bg-despesa-fundo text-despesa' : 'border-atencao/25 bg-atencao-fundo text-atencao')}>
          <L.Bell className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {vencidas.length > 0 && <><b>{vencidas.length} {vencidas.length === 1 ? 'conta atrasada' : 'contas atrasadas'}</b> (<Valor cents={somaV(vencidas)} />). </>}
            {proximas.length > 0 && <>{proximas.length} {proximas.length === 1 ? 'vence' : 'vencem'} nos próximos {alerta} dias (<Valor cents={somaV(proximas)} />). </>}
            {faturas.filter(f => f.status === 'vencida').length > 0 && <>Há fatura de cartão vencida.</>}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Resumo r="Atrasadas" v={somaV(vencidas)} n={vencidas.length} tom="text-despesa" />
        <Resumo r="A vencer neste mês" v={somaV(aVencerMes)} n={aVencerMes.length} />
        <Resumo r="Faturas a pagar" v={faturas.reduce((a, f) => a + f.restante, 0)} n={faturas.length} />
        <Resumo r={`Pagas em ${mesCurto(mesRef)}`} v={somaV(pagasMes)} n={pagasMes.length} tom="text-receita" />
      </div>

      <Abas className="mb-4" valor={aba} aoMudar={setAba} opcoes={[
        { v: 'pendentes', r: `Pendentes (${pend.length + faturas.length})` },
        { v: 'receitas', r: `Receitas previstas (${receitasPrev.length})` },
        { v: 'pagas', r: 'Pagas no mês' },
        { v: 'recorrentes', r: 'Fixas e assinaturas' },
      ]} />

      <Painel className="overflow-hidden">
        {aba === 'pendentes' && (pend.length + faturas.length === 0 ? <Vazio icone={L.CalendarCheck} titulo="Tudo em dia" texto="Nenhuma conta pendente." acao={<Botao variante="suave" icone={L.Plus} onClick={() => setNova('despesa')}>Nova conta a pagar</Botao>} /> : (
          <ul className="divide-y divide-borda/70">
            {faturas.map(i => (
              <li key={i.fatura.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5', i.status === 'vencida' && 'bg-despesa-fundo/40')}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-borda bg-vinho-claro text-vinho"><L.CreditCard className="h-5 w-5" strokeWidth={1.6} /></span>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">Fatura {cartoes.get(i.fatura.cartao_id)}</p><p className="text-xs text-taupe">vence {dataBR(i.fatura.vencimento)}{i.pago > 0 && ' · pagamento parcial'}</p></div>
                <Etiqueta tom={i.status === 'vencida' ? 'despesa' : 'atencao'}>{i.status === 'vencida' ? 'vencida' : 'fechada'}</Etiqueta>
                <Valor cents={i.restante} className="w-28 text-right text-sm font-semibold" />
                <div className="flex w-full justify-end sm:w-auto"><Botao tamanho="sm" variante="primario" onClick={() => setPagarFatura(i.fatura.id)}>Pagar fatura</Botao></div>
              </li>
            ))}
            {pend.map(l => <Item key={l.id} l={l} />)}
          </ul>
        ))}
        {aba === 'receitas' && (receitasPrev.length === 0 ? <Vazio icone={L.Briefcase} titulo="Nenhuma receita prevista" texto="Cadastre seu salário como receita recorrente para ver as previsões aqui." acao={<Botao variante="suave" icone={L.Plus} onClick={() => setNova('receita')}>Nova receita</Botao>} /> : (
          <>
            <p className="border-b border-borda bg-marfim px-5 py-2.5 text-xs text-taupe">Valores previstos não entram no saldo nem no disponível para gastar até você confirmar o recebimento.</p>
            <ul className="divide-y divide-borda/70">{receitasPrev.map(l => <Item key={l.id} l={l} />)}</ul>
          </>
        ))}
        {aba === 'pagas' && (pagasMes.length === 0 ? <Vazio icone={L.Receipt} titulo={`Nada pago em ${nomeMes(mesRef)}`} /> : <ul className="divide-y divide-borda/70">{pagasMes.sort((a, z) => z.data_efetiva!.localeCompare(a.data_efetiva!)).map(l => <Item key={l.id} l={l} />)}</ul>)}
        {aba === 'recorrentes' && (recorr.length === 0 ? <Vazio icone={L.Repeat} titulo="Nenhuma recorrência" texto="Ao criar uma transação, marque “Repete todo mês” para salário, internet, streaming, academia..." /> : (
          <ul className="divide-y divide-borda/70">
            {recorr.map(r => {
              const c = r.categoria_id ? cats.get(r.categoria_id) : null
              return (
                <li key={r.id} className={cn('flex items-center gap-3 px-4 py-3.5 sm:px-5', !r.ativa && 'opacity-55')}>
                  <IconeCategoria cor={c?.cor ?? (r.tipo === 'receita' ? '#3F6E52' : '#817678')} icone={c?.icone ?? (r.tipo === 'receita' ? 'briefcase' : 'repeat')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.nome}</p>
                    <p className="truncate text-xs text-taupe">todo dia {r.dia} · {r.cartao_id ? `cartão ${cartoes.get(r.cartao_id)}` : contas.get(r.conta_id ?? '') ?? '—'}{r.fim && ` · até ${dataBR(r.fim)}`}{r.essencial && ' · essencial'}</p>
                  </div>
                  <Etiqueta tom={!r.ativa ? 'neutro' : r.tipo === 'receita' ? 'receita' : 'vinho'}>{!r.ativa ? 'encerrada' : r.tipo === 'receita' ? 'receita' : 'despesa'}</Etiqueta>
                  <Valor cents={r.valor_cents} className="w-24 text-right text-sm font-semibold" />
                  <Botao tamanho="icone" variante="fantasma" onClick={() => setRec(r)} title="Editar recorrência" aria-label="Editar recorrência"><L.Pencil className="h-4 w-4" /></Botao>
                </li>
              )
            })}
          </ul>
        ))}
      </Painel>

      <p className="mt-3 px-1 text-xs text-taupe">Uma conta só fica “paga” quando você confirma. Passar da data de vencimento não marca nada como pago.</p>

      <TransacaoModal aberto={!!nova} tipoInicial={nova ?? 'despesa'} pendenteInicial aoFechar={() => setNova(null)} />
      <TransacaoModal aberto={!!editar} editar={editar} aoFechar={() => setEditar(null)} />
      <ConfirmarModal lanc={conf} aoFechar={() => setConf(null)} />
      <RecorrenciaModal rec={rec} aoFechar={() => setRec(null)} />
      <PagarFaturaModal faturaId={pagarFatura} aoFechar={() => setPagarFatura(null)} />
    </div>
  )
}

function Resumo({ r, v, n, tom }: { r: string; v: number; n: number; tom?: string }) {
  return (
    <Painel className="p-4 sm:p-5">
      <p className="text-[13px] text-taupe">{r}</p>
      <Valor cents={v} className={cn('titulo mt-1.5 block text-[22px] sm:text-[26px]', tom)} />
      <p className="text-xs text-taupe">{n} {n === 1 ? 'item' : 'itens'}</p>
    </Painel>
  )
}
