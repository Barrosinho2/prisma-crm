import { useEffect, useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/dados'
import { faturaDaCompra, fimPorParcelas, infoFaturas, prazoRecorrencia, primeiraOcorrencia, saldoMeta, saldos, totalParcelas } from '../lib/motor'
import { dataBR, inicioMes, mesCurto, reais, somaMeses } from '../lib/formato'
import {
  FORMAS, TIPOS_CONTA, type Cartao, type Categoria, type Conta, type FormaPagamento, type Lancamento, type Meta,
  type Recorrencia, type TipoConta,
} from '../lib/tipos'
import { Abas, Alternar, AreaTexto, Botao, Campo, CampoValor, Entrada, ICONES, Icone, Modal, Seletor, cn, useAcao, useAvisos } from './ui'

export type TipoNova = 'despesa' | 'receita' | 'transferencia' | 'cartao'

function useListas() {
  const { banco } = useDados()
  return useMemo(() => ({
    contas: banco.contas.filter(c => !c.arquivada).sort((a, z) => a.ordem - z.ordem || a.nome.localeCompare(z.nome)),
    cartoes: banco.cartoes.filter(c => !c.arquivado),
    catDespesa: banco.categorias.filter(c => c.tipo === 'despesa' && !c.oculta).sort((a, z) => a.ordem - z.ordem),
    catReceita: banco.categorias.filter(c => c.tipo === 'receita' && !c.oculta).sort((a, z) => a.ordem - z.ordem),
  }), [banco])
}

function OpcoesContas({ contas }: { contas: Conta[] }) {
  return <>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</>
}
function OpcoesCategorias({ cats }: { cats: Categoria[] }) {
  return <><option value="">Sem categoria</option>{cats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</>
}
function Erros({ erro }: { erro: string | null }) {
  if (!erro) return null
  return <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-despesa-fundo px-3 py-2 text-sm text-despesa"><L.TriangleAlert className="h-4 w-4" />{erro}</p>
}

// =====================================================================
// Nova transação / editar lançamento
// =====================================================================
export function TransacaoModal({ aberto, aoFechar, tipoInicial = 'despesa', editar, pendenteInicial }: {
  aberto: boolean; aoFechar: () => void; tipoInicial?: TipoNova; editar?: Lancamento | null; pendenteInicial?: boolean
}) {
  const { hoje, inserir, atualizar, rpc } = useDados()
  const { contas, cartoes, catDespesa, catReceita } = useListas()
  const { ocupado, executar } = useAcao()
  const [tipo, setTipo] = useState<TipoNova>(tipoInicial)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState<number | null>(null)
  const [dataV, setData] = useState(hoje)
  const [efetivado, setEfetivado] = useState(true)
  const [conta, setConta] = useState('')
  const [destino, setDestino] = useState('')
  const [categoria, setCategoria] = useState('')
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [cartao, setCartao] = useState('')
  const [parcelas, setParcelas] = useState(1)
  const [recorrente, setRecorrente] = useState(false)
  const [fimRec, setFimRec] = useState<string | null>(null)
  const [pagarNoCartao, setPagarNoCartao] = useState(false)
  const [essencial, setEssencial] = useState(false)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setErro(null)
    if (editar) {
      setTipo(editar.tipo); setDescricao(editar.descricao); setValor(editar.valor_cents)
      setData(editar.data_efetiva ?? editar.data_prevista); setEfetivado(editar.status === 'efetivado')
      setConta(editar.conta_id ?? ''); setCategoria(editar.categoria_id ?? ''); setForma(editar.forma_pagamento ?? '')
      setObs(editar.obs ?? ''); setRecorrente(false); setPagarNoCartao(!!editar.cartao_id); setCartao(editar.cartao_id ?? '')
      return
    }
    setTipo(tipoInicial); setDescricao(''); setValor(null); setData(hoje); setEfetivado(!pendenteInicial)
    setConta(contas[0]?.id ?? ''); setDestino(contas[1]?.id ?? ''); setCategoria(''); setForma('')
    setCartao(cartoes[0]?.id ?? ''); setParcelas(1); setRecorrente(false); setFimRec(null); setPagarNoCartao(false); setEssencial(false); setObs('')
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  const cartaoSel = cartoes.find(c => c.id === cartao)
  const previa = tipo === 'cartao' && cartaoSel && dataV ? faturaDaCompra(cartaoSel, dataV) : null
  const cats = tipo === 'receita' ? catReceita : catDespesa
  const usaCartao = tipo === 'despesa' && pagarNoCartao && !efetivado

  async function salvar() {
    setErro(null)
    if (!valor || valor <= 0) return setErro('Informe um valor maior que zero.')
    if (!dataV) return setErro('Informe a data.')
    if (tipo === 'transferencia') {
      if (!conta || !destino) return setErro('Escolha as duas contas.')
      if (conta === destino) return setErro('As contas de origem e destino precisam ser diferentes.')
      const ok = await executar(() => inserir('transferencias', { origem_id: conta, destino_id: destino, valor_cents: valor, data: dataV, descricao: descricao.trim() || null }), 'Transferência registrada.')
      if (ok) aoFechar()
      return
    }
    if (!descricao.trim()) return setErro('Dê um nome à transação.')
    if (tipo === 'cartao') {
      if (!cartao) return setErro('Cadastre um cartão primeiro.')
      if (valor < parcelas) return setErro('Valor pequeno demais para tantas parcelas.')
      const ok = await executar(() => rpc('fin_registrar_compra', {
        p_id: crypto.randomUUID(), p_cartao: cartao, p_descricao: descricao.trim(), p_total_cents: valor,
        p_parcelas: parcelas, p_data: dataV, p_categoria: categoria || null, p_obs: obs.trim() || null,
      }), parcelas > 1 ? `Compra registrada em ${parcelas}x.` : 'Compra registrada no cartão.')
      if (ok) aoFechar()
      return
    }
    if (!usaCartao && !conta && (efetivado || recorrente)) return setErro('Escolha a conta.')
    if (usaCartao && !cartao) return setErro('Escolha o cartão.')

    if (editar) {
      const campos: Record<string, unknown> = {
        descricao: descricao.trim(), valor_cents: valor, categoria_id: categoria || null, forma_pagamento: forma || null,
        obs: obs.trim() || null, conta_id: usaCartao ? null : conta || null, cartao_id: usaCartao ? cartao : editar.compra_id ? editar.cartao_id : null,
      }
      if (editar.status === 'efetivado') campos.data_efetiva = dataV
      else campos.data_prevista = dataV
      const ok = await executar(() => atualizar('lancamentos', editar.id, campos), 'Alterações salvas.')
      if (ok) aoFechar()
      return
    }

    if (recorrente) {
      const dia = Number(dataV.slice(8, 10))
      const ok = await executar(async () => {
        const rid = crypto.randomUUID()
        await inserir('recorrencias', {
          id: rid, tipo, nome: descricao.trim(), valor_cents: valor, dia, categoria_id: categoria || null,
          conta_id: usaCartao ? null : conta || null, cartao_id: usaCartao ? cartao : null, forma_pagamento: forma || null,
          inicio: dataV, fim: fimRec, essencial, obs: obs.trim() || null,
        })
        await rpc('fin_gerar_previsoes')
        if (efetivado) {
          const { data } = await supabase.from('fin_lancamentos').select('id').eq('recorrencia_id', rid).eq('competencia', inicioMes(dataV)).maybeSingle()
          if (data?.id) await rpc('fin_confirmar', { p_id: data.id, p_data: dataV })
        }
      }, tipo === 'receita' ? 'Receita recorrente criada. As próximas aparecem como previstas.' : 'Despesa recorrente criada.')
      if (ok) aoFechar()
      return
    }

    const ok = await executar(() => inserir('lancamentos', {
      tipo, descricao: descricao.trim(), valor_cents: valor, data_prevista: dataV, data_efetiva: efetivado ? dataV : null,
      status: efetivado ? 'efetivado' : 'pendente', categoria_id: categoria || null,
      conta_id: usaCartao ? null : conta || null, cartao_id: usaCartao ? cartao : null,
      forma_pagamento: forma || null, obs: obs.trim() || null,
    }), efetivado ? 'Transação registrada.' : tipo === 'receita' ? 'Receita prevista registrada.' : 'Conta a pagar registrada.')
    if (ok) aoFechar()
  }

  const titulo = editar ? 'Editar transação' : 'Nova transação'
  const semContas = contas.length === 0
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo}
      sub={editar?.status === 'efetivado' ? 'A alteração fica registrada no histórico.' : undefined}
      rodape={<>
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" carregando={ocupado} onClick={salvar} disabled={semContas && tipo !== 'cartao'}>Salvar</Botao>
      </>}>
      {!editar && (
        <Abas className="mb-5 w-full [&>button]:flex-1" valor={tipo} aoMudar={setTipo}
          opcoes={[{ v: 'despesa', r: 'Despesa' }, { v: 'receita', r: 'Receita' }, { v: 'cartao', r: 'Cartão' }, { v: 'transferencia', r: 'Transferência' }]} />
      )}
      {semContas && tipo !== 'cartao' ? (
        <p className="rounded-xl bg-atencao-fundo px-4 py-3 text-sm text-atencao">Cadastre uma conta em <b>Contas e saldos</b> antes de registrar transações.</p>
      ) : (
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); salvar() }}>
          <Campo rotulo="Valor" className="sm:col-span-2">
            <CampoValor valor={valor} aoMudar={setValor} autoFocus />
          </Campo>
          {tipo !== 'transferencia' && (
            <Campo rotulo="Descrição" className="sm:col-span-2">
              <Entrada value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={120} placeholder={tipo === 'receita' ? 'Ex.: Salário' : tipo === 'cartao' ? 'Ex.: Notebook' : 'Ex.: Mercado'} />
            </Campo>
          )}
          {tipo === 'transferencia' ? (<>
            <Campo rotulo="De"><Seletor value={conta} onChange={e => setConta(e.target.value)}><OpcoesContas contas={contas} /></Seletor></Campo>
            <Campo rotulo="Para"><Seletor value={destino} onChange={e => setDestino(e.target.value)}><OpcoesContas contas={contas} /></Seletor></Campo>
            <Campo rotulo="Data"><Entrada type="date" value={dataV} onChange={e => setData(e.target.value)} /></Campo>
            <Campo rotulo="Descrição (opcional)"><Entrada value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={120} /></Campo>
            <p className="text-xs text-taupe sm:col-span-2">Transferências entre suas contas não contam como receita nem despesa: só mudam onde o dinheiro está.</p>
          </>) : tipo === 'cartao' ? (<>
            {cartoes.length === 0 ? <p className="rounded-xl bg-atencao-fundo px-4 py-3 text-sm text-atencao sm:col-span-2">Cadastre um cartão em <b>Cartões de crédito</b> primeiro.</p> : (<>
              <Campo rotulo="Cartão"><Seletor value={cartao} onChange={e => setCartao(e.target.value)}>{cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
              <Campo rotulo="Data da compra"><Entrada type="date" value={dataV} onChange={e => setData(e.target.value)} /></Campo>
              <Campo rotulo="Parcelas">
                <Seletor value={parcelas} onChange={e => setParcelas(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x${valor ? ' de ' + reais(Math.floor(valor / n)) : ''}`}</option>)}
                </Seletor>
              </Campo>
              <Campo rotulo="Categoria"><Seletor value={categoria} onChange={e => setCategoria(e.target.value)}><OpcoesCategorias cats={catDespesa} /></Seletor></Campo>
              {previa && (
                <div className="rounded-xl border border-borda bg-marfim px-4 py-3 text-[13px] text-taupe sm:col-span-2">
                  <L.CalendarClock className="mr-1.5 inline h-4 w-4 align-[-3px] text-vinho-suave" />
                  {parcelas > 1 ? '1ª parcela' : 'Entra'} na fatura que fecha em <b className="text-carvao">{dataBR(previa.fechamento)}</b> e vence em <b className="text-carvao">{dataBR(previa.vencimento)}</b>.
                  {parcelas > 1 && <> Última em {mesCurto(faturaDaCompra(cartaoSel!, dataV, parcelas - 1).vencimento, true)}.</>}
                </div>
              )}
            </>)}
          </>) : (<>
            <Campo rotulo={tipo === 'receita' ? (efetivado ? 'Data do recebimento' : 'Data prevista') : efetivado ? 'Data do pagamento' : 'Vencimento'}>
              <Entrada type="date" value={dataV} onChange={e => setData(e.target.value)} />
            </Campo>
            <Campo rotulo="Situação">
              <Seletor value={efetivado ? '1' : '0'} disabled={!!editar} onChange={e => setEfetivado(e.target.value === '1')}>
                <option value="1">{tipo === 'receita' ? 'Já recebida' : 'Já paga'}</option>
                <option value="0">{tipo === 'receita' ? 'Prevista (ainda não recebida)' : 'A pagar'}</option>
              </Seletor>
            </Campo>
            {usaCartao ? (
              <Campo rotulo="Cartão"><Seletor value={cartao} onChange={e => setCartao(e.target.value)}>{cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
            ) : (
              <Campo rotulo={tipo === 'receita' ? 'Conta de destino' : 'Conta'}>
                <Seletor value={conta} onChange={e => setConta(e.target.value)}><OpcoesContas contas={contas} /></Seletor>
              </Campo>
            )}
            <Campo rotulo="Categoria"><Seletor value={categoria} onChange={e => setCategoria(e.target.value)}><OpcoesCategorias cats={cats} /></Seletor></Campo>
            {!usaCartao && (
              <Campo rotulo="Forma de pagamento">
                <Seletor value={forma} onChange={e => setForma(e.target.value as FormaPagamento)}>
                  <option value="">—</option>
                  {Object.entries(FORMAS).filter(([k]) => k !== 'credito').map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                </Seletor>
              </Campo>
            )}
            {!editar && (
              <div className="space-y-3 rounded-xl border border-borda bg-marfim/70 p-4 sm:col-span-2">
                <Linha rotulo={tipo === 'receita' ? 'Repete todo mês (ex.: salário)' : 'Repete todo mês (assinatura, conta fixa)'}
                  ajuda={recorrente ? `Será gerada todo dia ${Number(dataV.slice(8, 10))}. ${tipo === 'receita' ? 'O saldo só aumenta quando você confirmar o recebimento.' : 'Cada mês aparece como conta a pagar.'}` : undefined}>
                  <Alternar ligado={recorrente} aoMudar={setRecorrente} rotulo="Recorrente" />
                </Linha>
                {recorrente && dataV && <div className="grid gap-3 sm:grid-cols-2"><CampoPrazo inicio={dataV} dia={Number(dataV.slice(8, 10))} fim={fimRec} aoMudar={setFimRec} receita={tipo === 'receita'} /></div>}
                {tipo === 'despesa' && !efetivado && cartoes.length > 0 && (
                  <Linha rotulo="Cobrada no cartão de crédito" ajuda="Ao confirmar, vira uma compra no cartão e entra na fatura.">
                    <Alternar ligado={pagarNoCartao} aoMudar={setPagarNoCartao} rotulo="Cobrada no cartão" />
                  </Linha>
                )}
                {tipo === 'despesa' && recorrente && (
                  <Linha rotulo="Despesa essencial" ajuda="Usada no cálculo da reserva de emergência.">
                    <Alternar ligado={essencial} aoMudar={setEssencial} rotulo="Essencial" />
                  </Linha>
                )}
              </div>
            )}
          </>)}
          {tipo !== 'transferencia' && (
            <Campo rotulo="Observações (opcional)" className="sm:col-span-2"><AreaTexto value={obs} onChange={e => setObs(e.target.value)} maxLength={500} rows={2} /></Campo>
          )}
          <button type="submit" hidden />
        </form>
      )}
      <Erros erro={erro} />
      {editar?.recorrencia_id && <p className="mt-3 text-xs text-taupe">Esta edição vale só para esta ocorrência. Para mudar todas as próximas, edite a recorrência em Contas a pagar.</p>}
    </Modal>
  )
}

function Linha({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div><p className="text-sm font-medium text-carvao">{rotulo}</p>{ajuda && <p className="mt-0.5 text-xs text-taupe">{ajuda}</p>}</div>
      {children}
    </div>
  )
}

// =====================================================================
// Prazo de uma recorrência: sem prazo, N parcelas ou até uma data
// =====================================================================
type ModoPrazo = 'sem' | 'parcelas' | 'data'
export function CampoPrazo({ inicio, dia, fim, aoMudar, receita }: { inicio: string; dia: number; fim: string | null; aoMudar: (fim: string | null) => void; receita?: boolean }) {
  const [modo, setModo] = useState<ModoPrazo>(fim ? 'parcelas' : 'sem')
  const [n, setN] = useState(() => (fim ? Math.max(1, totalParcelas(inicio, dia, fim)) : 12))
  const [data, setData] = useState(fim ?? '')
  // recalcula o fim quando muda o início, o dia ou o número de parcelas
  useEffect(() => {
    if (modo === 'parcelas') aoMudar(fimPorParcelas(inicio, dia, n))
    else if (modo === 'data') aoMudar(data || null)
    else aoMudar(null)
  }, [modo, n, data, inicio, dia]) // eslint-disable-line react-hooks/exhaustive-deps
  const primeira = primeiraOcorrencia(inicio, dia)
  const total = fim ? totalParcelas(inicio, dia, fim) : 0
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <Campo rotulo="Prazo">
        <Seletor value={modo} onChange={e => setModo(e.target.value as ModoPrazo)} aria-label="Prazo">
          <option value="sem">Sem prazo, até eu cancelar</option>
          <option value="parcelas">Número de parcelas</option>
          <option value="data">Até uma data</option>
        </Seletor>
      </Campo>
      {modo === 'parcelas' && (
        <Campo rotulo="Quantas parcelas no total">
          <Entrada type="number" inputMode="numeric" min={1} max={360} value={n} onChange={e => setN(Math.min(360, Math.max(1, Number(e.target.value) || 1)))} />
        </Campo>
      )}
      {modo === 'data' && <Campo rotulo="Última até"><Entrada type="date" value={data} min={primeira} onChange={e => setData(e.target.value)} /></Campo>}
      <p className="text-xs text-taupe sm:col-span-2">
        {modo === 'sem' ? `Repete todo mês até você ${receita ? 'encerrar' : 'cancelar'}.`
          : fim && total > 0 ? `${total} ${total === 1 ? 'parcela' : 'parcelas'}: de ${dataBR(primeira)} a ${dataBR(fimPorParcelas(inicio, dia, total))}.`
          : 'Escolha a data da última parcela.'}
      </p>
    </div>
  )
}

// =====================================================================
// Confirmar recebimento / pagamento
// =====================================================================
export function ConfirmarModal({ lanc, aoFechar }: { lanc: Lancamento | null; aoFechar: () => void }) {
  const { hoje, rpc } = useDados()
  const { contas, cartoes } = useListas()
  const { ocupado, executar } = useAcao()
  const [dataV, setData] = useState(hoje)
  const [valor, setValor] = useState<number | null>(null)
  const [conta, setConta] = useState('')
  useEffect(() => {
    if (!lanc) return
    setData(hoje); setValor(lanc.valor_cents); setConta(lanc.conta_id ?? contas[0]?.id ?? '')
  }, [lanc]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!lanc) return null
  const receita = lanc.tipo === 'receita'
  const noCartao = !!lanc.cartao_id
  return (
    <Modal aberto={!!lanc} aoFechar={aoFechar} largura="sm" titulo={receita ? 'Confirmar recebimento' : 'Confirmar pagamento'} sub={lanc.descricao}
      rodape={<>
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" carregando={ocupado} onClick={async () => {
          if (!valor || valor <= 0) return
          const ok = await executar(() => rpc('fin_confirmar', { p_id: lanc.id, p_data: dataV, p_valor_cents: valor, p_conta: noCartao ? null : conta || null }),
            receita ? 'Recebimento confirmado. Saldo atualizado.' : noCartao ? 'Lançado no cartão.' : 'Pagamento confirmado. Saldo atualizado.')
          if (ok) aoFechar()
        }}>{receita ? 'Confirmar recebimento' : 'Confirmar pagamento'}</Botao>
      </>}>
      <div className="grid gap-4">
        <Campo rotulo="Valor" ajuda={valor !== lanc.valor_cents ? `Previsto: ${reais(lanc.valor_cents)}` : undefined}><CampoValor valor={valor} aoMudar={setValor} /></Campo>
        <Campo rotulo={receita ? 'Data do recebimento' : 'Data do pagamento'}><Entrada type="date" value={dataV} onChange={e => setData(e.target.value)} /></Campo>
        {noCartao ? (
          <p className="text-sm text-taupe">Será lançado como compra no cartão <b className="text-carvao">{cartoes.find(c => c.id === lanc.cartao_id)?.nome}</b> e entrará na fatura.</p>
        ) : (
          <Campo rotulo={receita ? 'Conta que recebeu' : 'Conta usada'}><Seletor value={conta} onChange={e => setConta(e.target.value)}><OpcoesContas contas={contas} /></Seletor></Campo>
        )}
      </div>
    </Modal>
  )
}

// =====================================================================
// Conta financeira
// =====================================================================
const CORES = ['#621F32', '#875364', '#9C6B4E', '#5E7A6B', '#4F6A84', '#7A6A8C', '#B0855B', '#292526']
export function ContaModal({ aberto, aoFechar, editar }: { aberto: boolean; aoFechar: () => void; editar?: Conta | null }) {
  const { inserir, atualizar, hoje } = useDados()
  const { ocupado, executar } = useAcao()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoConta>('corrente')
  const [saldo, setSaldo] = useState<number | null>(0)
  const [cor, setCor] = useState(CORES[0])
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!aberto) return
    setErro(null); setNome(editar?.nome ?? ''); setTipo(editar?.tipo ?? 'corrente'); setSaldo(editar?.saldo_inicial_cents ?? 0); setCor(editar?.cor ?? CORES[0])
  }, [aberto, editar])
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={editar ? 'Editar conta' : 'Nova conta'} largura="sm"
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (!nome.trim()) return setErro('Dê um nome à conta.')
        if (saldo == null) return setErro('Informe o saldo inicial (pode ser 0).')
        const campos = { nome: nome.trim(), tipo, saldo_inicial_cents: saldo, cor }
        const ok = await executar(() => editar ? atualizar('contas', editar.id, campos) : inserir('contas', { ...campos, data_saldo_inicial: hoje }), editar ? 'Conta atualizada.' : 'Conta criada.')
        if (ok) aoFechar()
      }}>Salvar</Botao></>}>
      <div className="grid gap-4">
        <Campo rotulo="Nome"><Entrada value={nome} onChange={e => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Banco principal" /></Campo>
        <Campo rotulo="Tipo" ajuda={tipo === 'reserva' ? 'O saldo desta conta não entra no "disponível para gastar".' : undefined}>
          <Seletor value={tipo} onChange={e => setTipo(e.target.value as TipoConta)}>{Object.entries(TIPOS_CONTA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</Seletor>
        </Campo>
        <Campo rotulo="Saldo inicial" ajuda={editar ? 'Corrigir o saldo inicial recalcula o saldo atual.' : 'Quanto há nesta conta hoje.'}>
          <CampoValor valor={saldo} aoMudar={setSaldo} />
        </Campo>
        <Campo rotulo="Cor">
          <div className="flex flex-wrap gap-2">{CORES.map(c => (
            <button key={c} type="button" onClick={() => setCor(c)} aria-label={`Cor ${c}`} aria-pressed={cor === c}
              className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-cartao transition', cor === c && 'ring-2 ring-vinho-suave')} style={{ background: c }} />
          ))}</div>
        </Campo>
      </div>
      <Erros erro={erro} />
    </Modal>
  )
}

// =====================================================================
// Cartão de crédito
// =====================================================================
export function CartaoModal({ aberto, aoFechar, editar }: { aberto: boolean; aoFechar: () => void; editar?: Cartao | null }) {
  const { inserir, atualizar } = useDados()
  const { contas } = useListas()
  const { ocupado, executar } = useAcao()
  const [f, setF] = useState({ nome: '', instituicao: '', limite: null as number | null, fech: 1, venc: 10, conta: '', cor: CORES[0] })
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!aberto) return
    setErro(null)
    setF(editar ? { nome: editar.nome, instituicao: editar.instituicao ?? '', limite: editar.limite_cents, fech: editar.dia_fechamento, venc: editar.dia_vencimento, conta: editar.conta_pagamento_id ?? '', cor: editar.cor }
      : { nome: '', instituicao: '', limite: null, fech: 1, venc: 10, conta: contas[0]?.id ?? '', cor: CORES[0] })
  }, [aberto, editar]) // eslint-disable-line react-hooks/exhaustive-deps
  const dias = Array.from({ length: 31 }, (_, i) => i + 1)
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={editar ? 'Editar cartão' : 'Novo cartão'}
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (!f.nome.trim()) return setErro('Dê um nome ao cartão.')
        if (f.limite == null || f.limite < 0) return setErro('Informe o limite.')
        const campos = { nome: f.nome.trim(), instituicao: f.instituicao.trim() || null, limite_cents: f.limite, dia_fechamento: f.fech, dia_vencimento: f.venc, conta_pagamento_id: f.conta || null, cor: f.cor }
        const ok = await executar(() => editar ? atualizar('cartoes', editar.id, campos) : inserir('cartoes', campos), editar ? 'Cartão atualizado.' : 'Cartão cadastrado.')
        if (ok) aoFechar()
      }}>Salvar</Botao></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do cartão"><Entrada value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} maxLength={60} placeholder="Ex.: Cartão principal" /></Campo>
        <Campo rotulo="Instituição"><Entrada value={f.instituicao} onChange={e => setF({ ...f, instituicao: e.target.value })} maxLength={60} /></Campo>
        <Campo rotulo="Limite total" className="sm:col-span-2"><CampoValor valor={f.limite} aoMudar={v => setF({ ...f, limite: v })} /></Campo>
        <Campo rotulo="Dia de fechamento"><Seletor value={f.fech} onChange={e => setF({ ...f, fech: +e.target.value })}>{dias.map(d => <option key={d}>{d}</option>)}</Seletor></Campo>
        <Campo rotulo="Dia de vencimento"><Seletor value={f.venc} onChange={e => setF({ ...f, venc: +e.target.value })}>{dias.map(d => <option key={d}>{d}</option>)}</Seletor></Campo>
        <Campo rotulo="Conta que paga a fatura" className="sm:col-span-2"><Seletor value={f.conta} onChange={e => setF({ ...f, conta: e.target.value })}><option value="">—</option><OpcoesContas contas={contas} /></Seletor></Campo>
        <Campo rotulo="Cor" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">{CORES.map(c => (
            <button key={c} type="button" onClick={() => setF({ ...f, cor: c })} aria-label={`Cor ${c}`} aria-pressed={f.cor === c}
              className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-cartao', f.cor === c && 'ring-2 ring-vinho-suave')} style={{ background: c }} />
          ))}</div>
        </Campo>
        {editar && <p className="text-xs text-taupe sm:col-span-2">Mudar os dias vale para compras novas; faturas já criadas mantêm suas datas.</p>}
      </div>
      <Erros erro={erro} />
    </Modal>
  )
}

// =====================================================================
// Pagar fatura
// =====================================================================
export function PagarFaturaModal({ faturaId, aoFechar }: { faturaId: string | null; aoFechar: () => void }) {
  const { banco, hoje, inserir } = useDados()
  const { contas } = useListas()
  const { ocupado, executar } = useAcao()
  const info = faturaId ? infoFaturas(banco, hoje).get(faturaId) : null
  const cartao = info ? banco.cartoes.find(c => c.id === info.fatura.cartao_id) : null
  const [valor, setValor] = useState<number | null>(null)
  const [conta, setConta] = useState('')
  const [dataV, setData] = useState(hoje)
  useEffect(() => {
    if (!info) return
    setValor(info.restante); setConta(cartao?.conta_pagamento_id ?? contas[0]?.id ?? ''); setData(hoje)
  }, [faturaId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!info || !cartao) return null
  const saldo = saldos(banco).get(conta) ?? 0
  return (
    <Modal aberto={!!faturaId} aoFechar={aoFechar} largura="sm" titulo="Pagar fatura" sub={`${cartao.nome} · vence ${dataBR(info.fatura.vencimento)}`}
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (!valor || valor <= 0 || !conta) return
        const ok = await executar(() => inserir('pagamentos', { fatura_id: info.fatura.id, conta_id: conta, valor_cents: valor, data: dataV }), 'Pagamento da fatura registrado.')
        if (ok) aoFechar()
      }}>Registrar pagamento</Botao></>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-marfim p-3 text-center text-xs text-taupe">
          <div>Total<p className="num mt-0.5 text-sm font-semibold text-carvao">{reais(info.total)}</p></div>
          <div>Pago<p className="num mt-0.5 text-sm font-semibold text-carvao">{reais(info.pago)}</p></div>
          <div>Restante<p className="num mt-0.5 text-sm font-semibold text-vinho">{reais(info.restante)}</p></div>
        </div>
        <Campo rotulo="Valor pago" ajuda="Pode ser parcial."><CampoValor valor={valor} aoMudar={setValor} /></Campo>
        <Campo rotulo="Conta" ajuda={`Saldo atual: ${reais(saldo)}`}><Seletor value={conta} onChange={e => setConta(e.target.value)}><OpcoesContas contas={contas} /></Seletor></Campo>
        <Campo rotulo="Data"><Entrada type="date" value={dataV} onChange={e => setData(e.target.value)} /></Campo>
        <p className="text-xs text-taupe">O pagamento reduz o saldo da conta e a dívida do cartão. Ele não entra como nova despesa: as compras já foram contadas.</p>
      </div>
    </Modal>
  )
}

// =====================================================================
// Recorrência (salário, assinatura, conta fixa)
// =====================================================================
export function RecorrenciaModal({ rec, aoFechar }: { rec: Recorrencia | null; aoFechar: () => void }) {
  const { atualizar, rpc } = useDados()
  const { contas, cartoes, catDespesa, catReceita } = useListas()
  const { ocupado, executar } = useAcao()
  const { banco, hoje } = useDados()
  const { confirmar } = useAvisos()
  const [f, setF] = useState<Recorrencia | null>(null)
  useEffect(() => { setF(rec ? { ...rec } : null) }, [rec])
  if (!rec || !f) return null
  const cats = f.tipo === 'receita' ? catReceita : catDespesa
  const andamento = prazoRecorrencia(banco, rec)
  async function encerrar() {
    if (!f) return
    const ok = await confirmar({ titulo: `${f.tipo === 'receita' ? 'Encerrar' : 'Cancelar'} "${f.nome}"?`, botao: f.tipo === 'receita' ? 'Encerrar' : 'Cancelar recorrência', perigo: true,
      texto: 'As cobranças ainda não pagas de hoje em diante deixam de existir. O que já foi pago continua no histórico.' })
    if (!ok) return
    const feito = await executar(async () => {
      await atualizar('recorrencias', f.id, { ativa: false, fim: hoje >= f.inicio ? hoje : f.inicio })
      await rpc('fin_aplicar_recorrencia', { p_id: f.id })
    }, f.tipo === 'receita' ? 'Recorrência encerrada.' : 'Recorrência cancelada. Nenhuma nova cobrança será gerada.')
    if (feito) aoFechar()
  }
  return (
    <Modal aberto={!!rec} aoFechar={aoFechar} titulo={f.tipo === 'receita' ? 'Receita recorrente' : 'Despesa recorrente'}
      sub="As mudanças valem para as ocorrências pendentes deste mês em diante. O que já foi pago ou recebido não muda."
      rodape={<>{rec.ativa && <Botao variante="fantasma" className="text-despesa hover:bg-despesa-fundo sm:mr-auto" onClick={encerrar}>{f.tipo === 'receita' ? 'Encerrar recorrência' : 'Cancelar recorrência'}</Botao>}<Botao onClick={aoFechar}>Fechar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (!f.nome.trim() || f.valor_cents <= 0) return
        const ok = await executar(async () => {
          await atualizar('recorrencias', f.id, {
            nome: f.nome.trim(), valor_cents: f.valor_cents, dia: f.dia, categoria_id: f.categoria_id, conta_id: f.cartao_id ? null : f.conta_id,
            cartao_id: f.cartao_id, inicio: f.inicio, fim: f.fim || null, ativa: f.ativa, essencial: f.essencial,
          })
          await rpc('fin_aplicar_recorrencia', { p_id: f.id })
          await rpc('fin_gerar_previsoes')
        }, 'Recorrência atualizada.')
        if (ok) aoFechar()
      }}>Salvar</Botao></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" className="sm:col-span-2"><Entrada value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} maxLength={80} /></Campo>
        <Campo rotulo="Valor"><CampoValor valor={f.valor_cents} aoMudar={v => setF({ ...f, valor_cents: v ?? 0 })} /></Campo>
        <Campo rotulo="Dia do mês"><Seletor value={f.dia} onChange={e => setF({ ...f, dia: +e.target.value })}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</Seletor></Campo>
        {f.cartao_id ? (
          <Campo rotulo="Cartão"><Seletor value={f.cartao_id} onChange={e => setF({ ...f, cartao_id: e.target.value })}>{cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
        ) : (
          <Campo rotulo="Conta"><Seletor value={f.conta_id ?? ''} onChange={e => setF({ ...f, conta_id: e.target.value || null })}><OpcoesContas contas={contas} /></Seletor></Campo>
        )}
        <Campo rotulo="Categoria"><Seletor value={f.categoria_id ?? ''} onChange={e => setF({ ...f, categoria_id: e.target.value || null })}><OpcoesCategorias cats={cats} /></Seletor></Campo>
        <Campo rotulo="Começa em" className="sm:col-span-2"><Entrada type="date" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></Campo>
        <CampoPrazo key={rec.id} inicio={f.inicio} dia={f.dia} fim={f.fim} aoMudar={fim => setF(x => (x ? { ...x, fim } : x))} receita={f.tipo === 'receita'} />
        {andamento && andamento.total > 0 && (
          <div className="rounded-xl bg-marfim p-3 text-sm sm:col-span-2">
            <div className="mb-2 flex justify-between"><span>{andamento.pagas} de {andamento.total} {f.tipo === 'receita' ? 'recebidas' : 'pagas'}</span><span className="font-medium">{andamento.faltam === 0 ? 'concluída' : `faltam ${andamento.faltam}`}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-creme"><div className="h-full rounded-full bg-vinho" style={{ width: `${Math.min(100, (andamento.pagas / andamento.total) * 100)}%` }} /></div>
          </div>
        )}
        <div className="space-y-3 rounded-xl border border-borda bg-marfim/70 p-4 sm:col-span-2">
          <Linha rotulo="Ativa" ajuda={!f.ativa ? 'As ocorrências pendentes de hoje em diante serão canceladas.' : undefined}><Alternar ligado={f.ativa} aoMudar={v => setF({ ...f, ativa: v })} rotulo="Ativa" /></Linha>
          {f.tipo === 'despesa' && <Linha rotulo="Despesa essencial"><Alternar ligado={f.essencial} aoMudar={v => setF({ ...f, essencial: v })} rotulo="Essencial" /></Linha>}
        </div>
      </div>
    </Modal>
  )
}

// =====================================================================
// Metas
// =====================================================================
export function MetaModal({ aberto, aoFechar, editar, emergencia, alvoSugerido }: { aberto: boolean; aoFechar: () => void; editar?: Meta | null; emergencia?: boolean; alvoSugerido?: number | null }) {
  const { inserir, atualizar } = useDados()
  const { contas } = useListas()
  const { ocupado, executar } = useAcao()
  const [f, setF] = useState({ nome: '', alvo: null as number | null, prazo: '', conta: '', icone: 'target', meses: 6 })
  const [erro, setErro] = useState<string | null>(null)
  const ehEmerg = editar ? editar.emergencia : !!emergencia
  useEffect(() => {
    if (!aberto) return
    setErro(null)
    setF(editar ? { nome: editar.nome, alvo: editar.alvo_cents, prazo: editar.prazo ?? '', conta: editar.conta_id ?? '', icone: editar.icone, meses: editar.meses_alvo ?? 6 }
      : { nome: emergencia ? 'Reserva de emergência' : '', alvo: alvoSugerido ?? null, prazo: '', conta: contas.find(c => c.tipo === 'reserva')?.id ?? '', icone: emergencia ? 'shield' : 'target', meses: 6 })
  }, [aberto, editar]) // eslint-disable-line react-hooks/exhaustive-deps
  const icones = ['target', 'plane', 'laptop', 'home', 'car', 'gift', 'graduation-cap', 'piggy-bank', 'shield', 'heart-pulse', 'sparkles', 'landmark']
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={editar ? 'Editar meta' : ehEmerg ? 'Reserva de emergência' : 'Nova meta'}
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (!f.nome.trim()) return setErro('Dê um nome à meta.')
        if (!f.alvo || f.alvo <= 0) return setErro('Informe o valor desejado.')
        const campos = { nome: f.nome.trim(), alvo_cents: f.alvo, prazo: f.prazo || null, conta_id: f.conta || null, icone: f.icone, emergencia: ehEmerg, meses_alvo: ehEmerg ? f.meses : null }
        const ok = await executar(() => editar ? atualizar('metas', editar.id, campos) : inserir('metas', campos), editar ? 'Meta atualizada.' : 'Meta criada.')
        if (ok) aoFechar()
      }}>Salvar</Botao></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" className="sm:col-span-2"><Entrada value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} maxLength={60} placeholder="Ex.: Viagem" /></Campo>
        <Campo rotulo="Valor desejado"><CampoValor valor={f.alvo} aoMudar={v => setF({ ...f, alvo: v })} /></Campo>
        <Campo rotulo="Prazo (opcional)"><Entrada type="date" value={f.prazo} onChange={e => setF({ ...f, prazo: e.target.value })} /></Campo>
        <Campo rotulo="Onde o dinheiro fica" className="sm:col-span-2"
          ajuda={f.conta ? 'Cada contribuição transfere o valor para esta conta.' : 'Sem conta própria: o valor fica separado dentro da conta de origem e sai do "disponível para gastar".'}>
          <Seletor value={f.conta} onChange={e => setF({ ...f, conta: e.target.value })}>
            <option value="">Separar dentro da conta de origem</option>
            <OpcoesContas contas={contas} />
          </Seletor>
        </Campo>
        {!ehEmerg && (
          <Campo rotulo="Ícone" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">{icones.filter(i => ICONES[i]).map(i => (
              <button key={i} type="button" onClick={() => setF({ ...f, icone: i })} aria-label={i} aria-pressed={f.icone === i}
                className={cn('grid h-10 w-10 place-items-center rounded-xl border', f.icone === i ? 'border-vinho bg-vinho-claro text-vinho' : 'border-borda text-taupe hover:text-carvao')}>
                <Icone nome={i} className="h-4 w-4" />
              </button>
            ))}</div>
          </Campo>
        )}
      </div>
      <Erros erro={erro} />
    </Modal>
  )
}

export function MovimentoMetaModal({ meta, tipo, aoFechar }: { meta: Meta | null; tipo: 'aporte' | 'retirada'; aoFechar: () => void }) {
  const { banco, hoje, inserir } = useDados()
  const { contas } = useListas()
  const { ocupado, executar } = useAcao()
  const [valor, setValor] = useState<number | null>(null)
  const [conta, setConta] = useState('')
  const [dataV, setData] = useState(hoje)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  // id fixo por abertura: se o envio repetir, o banco não duplica
  const [idMov, setIdMov] = useState(() => crypto.randomUUID())
  useEffect(() => {
    if (!meta) return
    setValor(null); setErro(null); setData(hoje); setObs(''); setIdMov(crypto.randomUUID())
    setConta(contas.find(c => c.id !== meta.conta_id)?.id ?? '')
  }, [meta, tipo]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta) return null
  const guardado = saldoMeta(banco, meta.id)
  const contaMeta = banco.contas.find(c => c.id === meta.conta_id)
  return (
    <Modal aberto={!!meta} aoFechar={aoFechar} largura="sm" titulo={tipo === 'aporte' ? 'Guardar dinheiro' : 'Retirar da meta'} sub={`${meta.nome} · guardado ${reais(guardado)}`}
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        setErro(null)
        if (!valor || valor <= 0) return setErro('Informe o valor.')
        if (tipo === 'retirada' && valor > guardado) return setErro(`A meta tem ${reais(guardado)} guardados.`)
        const ok = await executar(() => inserir('movimentos', { id: idMov, meta_id: meta.id, tipo, valor_cents: valor, data: dataV, conta_id: conta || null, obs: obs.trim() || null }),
          tipo === 'aporte' ? 'Valor guardado na meta.' : 'Retirada registrada.')
        if (ok) aoFechar()
      }}>{tipo === 'aporte' ? 'Guardar' : 'Retirar'}</Botao></>}>
      <div className="grid gap-4">
        <Campo rotulo="Valor"><CampoValor valor={valor} aoMudar={setValor} autoFocus /></Campo>
        <Campo rotulo={tipo === 'aporte' ? 'Sai da conta' : 'Volta para a conta'}
          ajuda={contaMeta ? `${tipo === 'aporte' ? 'Vai para' : 'Sai de'}: ${contaMeta.nome}. Não é despesa, só muda onde o dinheiro está.` : 'O valor fica separado dentro da conta. Não é despesa.'}>
          <Seletor value={conta} onChange={e => setConta(e.target.value)}><OpcoesContas contas={contas.filter(c => c.id !== meta.conta_id)} /></Seletor>
        </Campo>
        <Campo rotulo="Data"><Entrada type="date" value={dataV} onChange={e => setData(e.target.value)} /></Campo>
        <Campo rotulo="Observação (opcional)"><Entrada value={obs} onChange={e => setObs(e.target.value)} maxLength={300} /></Campo>
      </div>
      <Erros erro={erro} />
    </Modal>
  )
}

// =====================================================================
// Categoria
// =====================================================================
export function CategoriaModal({ aberto, aoFechar, editar, tipoInicial = 'despesa' }: { aberto: boolean; aoFechar: () => void; editar?: Categoria | null; tipoInicial?: 'despesa' | 'receita' }) {
  const { inserir, atualizar, banco } = useDados()
  const { ocupado, executar } = useAcao()
  const [f, setF] = useState({ nome: '', tipo: tipoInicial as 'despesa' | 'receita', icone: 'tag', cor: CORES[1], essencial: false })
  useEffect(() => {
    if (!aberto) return
    setF(editar ? { nome: editar.nome, tipo: editar.tipo, icone: editar.icone, cor: editar.cor, essencial: editar.essencial } : { nome: '', tipo: tipoInicial, icone: 'tag', cor: CORES[1], essencial: false })
  }, [aberto, editar, tipoInicial])
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} largura="sm" titulo={editar ? 'Editar categoria' : 'Nova categoria'}
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (!f.nome.trim()) return
        const ordem = Math.max(0, ...banco.categorias.filter(c => c.tipo === f.tipo).map(c => c.ordem)) + 1
        const ok = await executar(() => editar ? atualizar('categorias', editar.id, { nome: f.nome.trim(), icone: f.icone, cor: f.cor, essencial: f.essencial })
          : inserir('categorias', { nome: f.nome.trim(), tipo: f.tipo, icone: f.icone, cor: f.cor, essencial: f.essencial, ordem }), 'Categoria salva.')
        if (ok) aoFechar()
      }}>Salvar</Botao></>}>
      <div className="grid gap-4">
        {!editar && <Abas valor={f.tipo} aoMudar={t => setF({ ...f, tipo: t })} opcoes={[{ v: 'despesa', r: 'Despesa' }, { v: 'receita', r: 'Receita' }]} />}
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} maxLength={40} /></Campo>
        <Campo rotulo="Ícone">
          <div className="flex flex-wrap gap-1.5">{Object.keys(ICONES).map(i => (
            <button key={i} type="button" onClick={() => setF({ ...f, icone: i })} aria-label={i} aria-pressed={f.icone === i}
              className={cn('grid h-9 w-9 place-items-center rounded-lg border', f.icone === i ? 'border-vinho bg-vinho-claro text-vinho' : 'border-borda text-taupe hover:text-carvao')}>
              <Icone nome={i} className="h-4 w-4" />
            </button>
          ))}</div>
        </Campo>
        <Campo rotulo="Cor">
          <div className="flex flex-wrap gap-2">{[...CORES, '#A35C6E', '#6B8E5A', '#3F6E52'].map(c => (
            <button key={c} type="button" onClick={() => setF({ ...f, cor: c })} aria-label={`Cor ${c}`} aria-pressed={f.cor === c}
              className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-cartao', f.cor === c && 'ring-2 ring-vinho-suave')} style={{ background: c }} />
          ))}</div>
        </Campo>
        {f.tipo === 'despesa' && <Linha rotulo="Essencial" ajuda="Moradia, alimentação, saúde... entram no cálculo da reserva de emergência."><Alternar ligado={f.essencial} aoMudar={v => setF({ ...f, essencial: v })} rotulo="Essencial" /></Linha>}
      </div>
    </Modal>
  )
}

// =====================================================================
// Orçamento (limite por categoria a partir de um mês)
// =====================================================================
export function OrcamentoModal({ categoria, aoFechar, limiteAtual }: { categoria: Categoria | null; aoFechar: () => void; limiteAtual: number | null }) {
  const { mesRef, recarregar } = useDados()
  const { avisar } = useAvisos()
  const { ocupado, executar } = useAcao()
  const [limite, setLimite] = useState<number | null>(null)
  const [aPartir, setAPartir] = useState(mesRef)
  useEffect(() => { if (categoria) { setLimite(limiteAtual); setAPartir(mesRef) } }, [categoria]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!categoria) return null
  const meses = Array.from({ length: 6 }, (_, i) => somaMeses(mesRef, i - 1))
  return (
    <Modal aberto={!!categoria} aoFechar={aoFechar} largura="sm" titulo={`Orçamento · ${categoria.nome}`} sub="O novo limite vale do mês escolhido em diante. Os meses anteriores mantêm o limite que tinham."
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={async () => {
        if (limite == null || limite < 0) return avisar('Informe o limite.', 'erro')
        const ok = await executar(async () => {
          const { data: u } = await supabase.auth.getUser()
          const { error } = await supabase.from('fin_orcamentos').upsert(
            { user_id: u.user!.id, categoria_id: categoria.id, competencia: inicioMes(aPartir), limite_cents: limite },
            { onConflict: 'user_id,categoria_id,competencia' })
          if (error) throw error
          await recarregar()
        }, 'Orçamento salvo.')
        if (ok) aoFechar()
      }}>Salvar</Botao></>}>
      <div className="grid gap-4">
        <Campo rotulo="Limite mensal" ajuda="Use 0 para acompanhar sem limite."><CampoValor valor={limite} aoMudar={setLimite} autoFocus /></Campo>
        <Campo rotulo="Vale a partir de">
          <Seletor value={aPartir} onChange={e => setAPartir(e.target.value)}>{meses.map(m => <option key={m} value={m}>{mesCurto(m, true)}</option>)}</Seletor>
        </Campo>
      </div>
    </Modal>
  )
}
