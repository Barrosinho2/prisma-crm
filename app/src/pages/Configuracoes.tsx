import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import * as L from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/dados'
import { essenciaisMensais } from '../lib/motor'
import { reais } from '../lib/formato'
import { TIPOS_CONTA, type Categoria, type TipoConta } from '../lib/tipos'
import { Cabecalho } from '../components/Layout'
import { Abas, Alternar, Botao, Campo, CampoValor, Entrada, Etiqueta, IconeCategoria, Modal, Painel, Seletor, TituloPainel, Valor, cn, useAcao, useAvisos } from '../components/ui'
import { CategoriaModal } from '../components/Formularios'
import { EditorSalario, ResumoSalario, partesDoSalario } from '../components/Salario'

export default function Configuracoes() {
  const { banco, hoje, salvarConfig } = useDados()
  const { executar } = useAcao()
  const [params, setParams] = useSearchParams()
  const [assistente, setAssistente] = useState(params.get('inicio') === '1')
  const cfg = banco.config
  const [nome, setNome] = useState(cfg?.nome ?? '')
  const [objetivo, setObjetivo] = useState<number | null>(cfg?.objetivo_economia_cents ?? 0)
  const [essenciais, setEssenciais] = useState<number | null>(cfg?.essenciais_cents ?? null)
  const [alertaDias, setAlertaDias] = useState(cfg?.alerta_dias ?? 3)
  const [editarSalario, setEditarSalario] = useState(false)
  const ess = essenciaisMensais({ ...banco, config: cfg ? { ...cfg, essenciais_cents: null } : null }, hoje)
  const salario = partesDoSalario(banco)

  useEffect(() => { if (params.get('inicio') === '1') setAssistente(true) }, [params])

  return (
    <div>
      <Cabecalho titulo="Configurações" sub="Preferências, renda, categorias e segurança."
        acoes={<Botao icone={L.Sparkles} variante="suave" onClick={() => setAssistente(true)}>Configuração inicial</Botao>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Painel>
          <TituloPainel titulo="Perfil e renda" />
          <div className="grid gap-4 px-5 pb-5">
            <Campo rotulo="Seu nome"><Entrada value={nome} onChange={e => setNome(e.target.value)} onBlur={() => nome !== (cfg?.nome ?? '') && executar(() => salvarConfig({ nome: nome.trim() || null }), 'Nome salvo.')} maxLength={80} /></Campo>
            <div className="rounded-xl border border-borda bg-marfim/60 p-4">
              <p className="text-sm font-medium">Salário fixo</p>
              {salario.length ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <ResumoSalario partes={salario} />
                  <Botao tamanho="sm" onClick={() => setEditarSalario(true)}>Alterar</Botao>
                </div>
              ) : <EditorSalario />}
              <p className="mt-2 text-xs text-taupe">Começa a partir de hoje (o que já entrou está no saldo inicial das contas). Gera a previsão de cada mês automaticamente. O saldo só aumenta quando você confirma o recebimento.</p>
            </div>
          </div>
        </Painel>

        <Painel>
          <TituloPainel titulo="Planejamento" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Campo rotulo="Objetivo mensal de economia"><CampoValor valor={objetivo} aoMudar={setObjetivo} /></Campo>
            <Campo rotulo="Despesas essenciais por mês" ajuda={essenciais ? 'Valor fixo informado por você.' : ess.valor ? `Calculado: ${reais(ess.valor)} (deixe em branco para usar)` : 'Opcional. Usado na reserva de emergência.'}>
              <CampoValor valor={essenciais} aoMudar={setEssenciais} placeholder="automático" />
            </Campo>
            <div className="sm:col-span-2">
              <Botao variante="primario" onClick={() => executar(() => salvarConfig({ objetivo_economia_cents: objetivo ?? 0, essenciais_cents: essenciais || null }), 'Planejamento salvo.')}>Salvar planejamento</Botao>
            </div>
          </div>
        </Painel>

        <Painel>
          <TituloPainel titulo="Notificações e visualização" />
          <div className="space-y-4 px-5 pb-5">
            <Linha r="Avisos de vencimento no sistema" a="Mostra contas próximas do vencimento e atrasadas."><Alternar ligado={cfg?.alertas_ativos !== false} aoMudar={v => executar(() => salvarConfig({ alertas_ativos: v }))} rotulo="Avisos de vencimento" /></Linha>
            <Linha r="Avisar com antecedência de" a="dias antes do vencimento">
              <Seletor value={alertaDias} onChange={e => { setAlertaDias(+e.target.value); executar(() => salvarConfig({ alerta_dias: +e.target.value }), 'Preferência salva.') }} className="h-9 w-24">{[1, 2, 3, 5, 7, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}</Seletor>
            </Linha>
            <Linha r="Ocultar valores na tela" a="Útil em lugares públicos."><Alternar ligado={!!cfg?.ocultar_valores} aoMudar={v => salvarConfig({ ocultar_valores: v })} rotulo="Ocultar valores" /></Linha>
            <div className="grid grid-cols-3 gap-3 border-t border-borda pt-4 text-sm">
              <div><p className="text-xs text-taupe">Moeda</p><p className="font-medium">Real (BRL)</p></div>
              <div><p className="text-xs text-taupe">Datas</p><p className="font-medium">DD/MM/AAAA</p></div>
              <div><p className="text-xs text-taupe">Fuso horário</p><p className="font-medium">São Paulo</p></div>
            </div>
          </div>
        </Painel>

        <Seguranca />

        <Categorias />

        <Painel>
          <TituloPainel titulo="Contas" sub={`${banco.contas.filter(c => !c.arquivada).length} ativas`} acao={<Link to="/contas"><Botao tamanho="sm">Gerenciar</Botao></Link>} />
          <ul className="divide-y divide-borda/70 px-5 pb-3">{banco.contas.filter(c => !c.arquivada).map(c => (
            <li key={c.id} className="flex items-center justify-between py-2.5 text-sm"><span>{c.nome}</span><span className="text-xs text-taupe">{TIPOS_CONTA[c.tipo]}</span></li>
          ))}</ul>
        </Painel>
      </div>

      <Painel className="mt-4 p-5 text-xs leading-relaxed text-taupe">
        <p className="flex items-start gap-2"><L.ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-vinho-suave" />Seus dados ficam num banco PostgreSQL com acesso restrito por usuário (Row Level Security). Valores são guardados em centavos inteiros. Alterações em movimentações ficam registradas. Este sistema não se conecta a bancos: tudo é lançado por você.</p>
      </Painel>

      <Modal aberto={editarSalario} aoFechar={() => setEditarSalario(false)} titulo="Salário fixo" sub="Valem para as previsões ainda não recebidas, deste mês em diante. O que já foi recebido não muda.">
        <EditorSalario aoSalvar={() => setEditarSalario(false)} />
      </Modal>
      <Assistente aberto={assistente} aoFechar={() => { setAssistente(false); if (params.get('inicio')) { params.delete('inicio'); setParams(params, { replace: true }) } }} />
    </div>
  )
}

function Linha({ r, a, children }: { r: string; a?: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{r}</p>{a && <p className="text-xs text-taupe">{a}</p>}</div>{children}</div>
}

function Seguranca() {
  const { avisar } = useAvisos()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { supabase.auth.getUser().then(r => setEmail(r.data.user?.email ?? '')) }, [])
  return (
    <Painel>
      <TituloPainel titulo="Conta e segurança" sub={email} />
      <form className="grid gap-3 px-5 pb-5 sm:grid-cols-2" onSubmit={async e => {
        e.preventDefault()
        if (senha.length < 8) return avisar('A senha precisa ter pelo menos 8 caracteres.', 'erro')
        if (senha !== senha2) return avisar('As senhas não conferem.', 'erro')
        setOcupado(true)
        const { error } = await supabase.auth.updateUser({ password: senha })
        setOcupado(false)
        if (error) avisar(/reauth|recent/i.test(error.message) ? 'Por segurança, saia e entre de novo antes de trocar a senha.' : error.message, 'erro')
        else { avisar('Senha alterada.'); setSenha(''); setSenha2('') }
      }}>
        <Campo rotulo="Nova senha"><Entrada type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} minLength={8} /></Campo>
        <Campo rotulo="Repita a senha"><Entrada type="password" autoComplete="new-password" value={senha2} onChange={e => setSenha2(e.target.value)} /></Campo>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Botao type="submit" carregando={ocupado} disabled={!senha}>Trocar senha</Botao>
          <Botao type="button" variante="fantasma" icone={L.LogOut} onClick={() => supabase.auth.signOut()}>Sair</Botao>
        </div>
        <p className="text-xs text-taupe sm:col-span-2">Este login é o mesmo usado no outro sistema ligado a este banco de dados; trocar a senha aqui vale para os dois.</p>
      </form>
    </Painel>
  )
}

function Categorias() {
  const { banco, atualizar, excluir } = useDados()
  const { executar } = useAcao()
  const { confirmar } = useAvisos()
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa')
  const [modal, setModal] = useState<{ aberto: boolean; editar: Categoria | null }>({ aberto: false, editar: null })
  const lista = useMemo(() => banco.categorias.filter(c => c.tipo === tipo).sort((a, z) => a.ordem - z.ordem || a.nome.localeCompare(z.nome)), [banco.categorias, tipo])
  const mover = (i: number, d: -1 | 1) => {
    const a = lista[i], b = lista[i + d]
    if (!a || !b) return
    executar(async () => {
      // normaliza a ordem e troca os dois de lugar
      const nova = lista.map(c => c.id)
      ;[nova[i], nova[i + d]] = [nova[i + d], nova[i]]
      await Promise.all(nova.map((id, k) => supabase.from('fin_categorias').update({ ordem: k + 1 }).eq('id', id)))
      await atualizar('categorias', a.id, { ordem: i + d + 1 })
    })
  }
  return (
    <Painel className="lg:col-span-1">
      <TituloPainel titulo="Categorias" acao={<div className="flex items-center gap-2"><Abas valor={tipo} aoMudar={setTipo} opcoes={[{ v: 'despesa', r: 'Despesas' }, { v: 'receita', r: 'Receitas' }]} /><Botao tamanho="icone" variante="suave" onClick={() => setModal({ aberto: true, editar: null })} aria-label="Nova categoria" title="Nova categoria"><L.Plus className="h-4 w-4" /></Botao></div>} />
      <ul className="max-h-[420px] divide-y divide-borda/70 overflow-y-auto px-3 pb-3 rolagem-fina">
        {lista.map((c, i) => (
          <li key={c.id} className={cn('group flex items-center gap-3 px-2 py-2', c.oculta && 'opacity-50')}>
            <IconeCategoria cor={c.cor} icone={c.icone} tamanho="sm" />
            <span className="flex-1 truncate text-sm">{c.nome}{c.essencial && <Etiqueta tom="vinho" className="ml-2">essencial</Etiqueta>}{c.oculta && <Etiqueta className="ml-2">oculta</Etiqueta>}</span>
            <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              <Ic i={L.ArrowUp} r="Subir" f={() => mover(i, -1)} d={i === 0} />
              <Ic i={L.ArrowDown} r="Descer" f={() => mover(i, 1)} d={i === lista.length - 1} />
              <Ic i={L.Pencil} r="Editar" f={() => setModal({ aberto: true, editar: c })} />
              <Ic i={c.oculta ? L.Eye : L.EyeOff} r={c.oculta ? 'Mostrar' : 'Ocultar'} f={() => executar(() => atualizar('categorias', c.id, { oculta: !c.oculta }))} />
              <Ic i={L.Trash2} r="Excluir" f={async () => {
                if (await confirmar({ titulo: `Excluir "${c.nome}"?`, texto: 'Só funciona se a categoria nunca foi usada. Caso contrário, oculte.', botao: 'Excluir', perigo: true }))
                  executar(() => excluir('categorias', c.id), 'Categoria excluída.')
              }} />
            </div>
          </li>
        ))}
      </ul>
      <CategoriaModal aberto={modal.aberto} editar={modal.editar} tipoInicial={tipo} aoFechar={() => setModal({ aberto: false, editar: null })} />
    </Painel>
  )
}
function Ic({ i: I, r, f, d }: { i: L.LucideIcon; r: string; f: () => void; d?: boolean }) {
  return <button disabled={d} onClick={f} aria-label={r} title={r} className="grid h-7 w-7 place-items-center rounded-lg text-taupe hover:bg-creme hover:text-carvao disabled:opacity-30"><I className="h-3.5 w-3.5" /></button>
}

// =====================================================================
// Configuração inicial (pode pular qualquer etapa)
// =====================================================================
const ETAPAS = ['Contas e saldos', 'Salário', 'Despesas fixas', 'Economia', 'Primeira meta'] as const
function Assistente({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { banco, hoje, inserir, rpc, salvarConfig } = useDados()
  const { ocupado, executar } = useAcao()
  const [etapa, setEtapa] = useState(0)
  // etapa 1
  const [cNome, setCNome] = useState('')
  const [cTipo, setCTipo] = useState<TipoConta>('corrente')
  const [cSaldo, setCSaldo] = useState<number | null>(null)
  // etapa 3
  const [dNome, setDNome] = useState('')
  const [dValor, setDValor] = useState<number | null>(null)
  const [dDia, setDDia] = useState(10)
  const [dCat, setDCat] = useState('')
  // etapa 4
  const [obj, setObj] = useState<number | null>(banco.config?.objetivo_economia_cents || null)
  // etapa 5
  const [mNome, setMNome] = useState('')
  const [mAlvo, setMAlvo] = useState<number | null>(null)
  const [mPrazo, setMPrazo] = useState('')
  useEffect(() => { if (aberto) setEtapa(0) }, [aberto])
  const contas = banco.contas.filter(c => !c.arquivada)
  const despesasFixas = banco.recorrencias.filter(r => r.tipo === 'despesa' && r.ativa)
  const marcar = (k: string) => salvarConfig({ onboarding: { ...(banco.config?.onboarding ?? {}), [k]: true } }).catch(() => {})
  const prox = () => { marcar(ETAPAS[etapa]); etapa < ETAPAS.length - 1 ? setEtapa(etapa + 1) : aoFechar() }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} largura="lg" titulo="Configuração inicial" sub="Preencha o que quiser agora. Dá para pular qualquer etapa e voltar depois."
      rodape={<>
        <Botao variante="fantasma" onClick={aoFechar}>Fechar</Botao>
        {etapa > 0 && <Botao onClick={() => setEtapa(etapa - 1)}>Voltar</Botao>}
        <Botao variante="primario" onClick={prox}>{etapa < ETAPAS.length - 1 ? 'Próxima etapa' : 'Concluir'}</Botao>
      </>}>
      <ol className="mb-6 flex gap-1.5" aria-label="Etapas">
        {ETAPAS.map((e, i) => (
          <li key={e} className="flex-1">
            <button onClick={() => setEtapa(i)} className="w-full text-left" aria-current={i === etapa ? 'step' : undefined}>
              <span className={cn('block h-1 rounded-full transition', i <= etapa ? 'bg-vinho' : 'bg-borda')} />
              <span className={cn('mt-1.5 hidden text-[11px] sm:block', i === etapa ? 'font-medium text-carvao' : 'text-taupe')}>{i + 1}. {e}</span>
            </button>
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div key={etapa} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
          {etapa === 0 && (
            <div>
              <p className="titulo text-xl">Onde está seu dinheiro hoje?</p>
              <p className="mt-1 text-sm text-taupe">Cadastre cada conta com o saldo atual.</p>
              {contas.length > 0 && <ul className="mt-4 space-y-1.5">{contas.map(c => <li key={c.id} className="flex justify-between rounded-xl bg-marfim px-3 py-2 text-sm"><span>{c.nome} <span className="text-taupe">· {TIPOS_CONTA[c.tipo]}</span></span><Valor cents={c.saldo_inicial_cents} /></li>)}</ul>}
              <div className="mt-4 grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
                <Campo rotulo="Nome"><Entrada value={cNome} onChange={e => setCNome(e.target.value)} placeholder="Ex.: Conta principal" maxLength={60} /></Campo>
                <Campo rotulo="Tipo"><Seletor value={cTipo} onChange={e => setCTipo(e.target.value as TipoConta)}>{Object.entries(TIPOS_CONTA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</Seletor></Campo>
                <Campo rotulo="Saldo hoje"><CampoValor valor={cSaldo} aoMudar={setCSaldo} /></Campo>
                <Botao carregando={ocupado} icone={L.Plus} onClick={async () => {
                  if (!cNome.trim()) return
                  if (await executar(() => inserir('contas', { nome: cNome.trim(), tipo: cTipo, saldo_inicial_cents: cSaldo ?? 0, data_saldo_inicial: hoje }), 'Conta adicionada.')) { setCNome(''); setCSaldo(null) }
                }}>Adicionar</Botao>
              </div>
            </div>
          )}
          {etapa === 1 && (
            <div>
              <p className="titulo text-xl">Seu salário fixo</p>
              <p className="mt-1 text-sm text-taupe">Informe o valor e o dia de recebimento (ou as datas e percentuais, se recebe em partes). Cada mês aparece como previsto até você confirmar.</p>
              {partesDoSalario(banco).length > 0
                ? <p className="mt-4 flex items-center gap-2 rounded-xl bg-receita-fundo px-3 py-2 text-sm text-receita"><L.CircleCheck className="h-4 w-4" />Salário já configurado.</p>
                : <EditorSalario aoSalvar={() => setEtapa(2)} />}
            </div>
          )}
          {etapa === 2 && (
            <div>
              <p className="titulo text-xl">Despesas que se repetem</p>
              <p className="mt-1 text-sm text-taupe">Aluguel, internet, academia, streaming...</p>
              {despesasFixas.length > 0 && <ul className="mt-4 space-y-1.5">{despesasFixas.map(r => <li key={r.id} className="flex justify-between rounded-xl bg-marfim px-3 py-2 text-sm"><span>{r.nome} <span className="text-taupe">· dia {r.dia}</span></span><Valor cents={r.valor_cents} /></li>)}</ul>}
              {contas.length === 0 ? <p className="mt-4 text-sm text-atencao">Cadastre uma conta na primeira etapa.</p> : (
                <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_80px_1fr_auto] sm:items-end">
                  <Campo rotulo="Nome"><Entrada value={dNome} onChange={e => setDNome(e.target.value)} placeholder="Ex.: Internet" maxLength={80} /></Campo>
                  <Campo rotulo="Valor"><CampoValor valor={dValor} aoMudar={setDValor} /></Campo>
                  <Campo rotulo="Dia"><Seletor value={dDia} onChange={e => setDDia(+e.target.value)}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</Seletor></Campo>
                  <Campo rotulo="Categoria"><Seletor value={dCat} onChange={e => setDCat(e.target.value)}><option value="">—</option>{banco.categorias.filter(c => c.tipo === 'despesa' && !c.oculta).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Seletor></Campo>
                  <Botao carregando={ocupado} icone={L.Plus} onClick={async () => {
                    if (!dNome.trim() || !dValor) return
                    const cat = banco.categorias.find(c => c.id === dCat)
                    if (await executar(async () => {
                      await inserir('recorrencias', { tipo: 'despesa', nome: dNome.trim(), valor_cents: dValor, dia: dDia, conta_id: contas[0].id, categoria_id: dCat || null, inicio: hoje, essencial: !!cat?.essencial })
                      await rpc('fin_gerar_previsoes')
                    }, 'Despesa fixa adicionada.')) { setDNome(''); setDValor(null) }
                  }}>Adicionar</Botao>
                </div>
              )}
            </div>
          )}
          {etapa === 3 && (
            <div>
              <p className="titulo text-xl">Quanto quer guardar por mês?</p>
              <p className="mt-1 text-sm text-taupe">Serve de referência no painel e nos relatórios.</p>
              <div className="mt-4 flex max-w-sm items-end gap-3">
                <Campo rotulo="Objetivo mensal" className="flex-1"><CampoValor valor={obj} aoMudar={setObj} /></Campo>
                <Botao carregando={ocupado} onClick={() => executar(() => salvarConfig({ objetivo_economia_cents: obj ?? 0 }), 'Objetivo salvo.')}>Salvar</Botao>
              </div>
            </div>
          )}
          {etapa === 4 && (
            <div>
              <p className="titulo text-xl">Sua primeira meta</p>
              <p className="mt-1 text-sm text-taupe">Pode ser a reserva de emergência, uma viagem, um computador...</p>
              {banco.metas.length > 0 && <p className="mt-4 flex items-center gap-2 rounded-xl bg-receita-fundo px-3 py-2 text-sm text-receita"><L.CircleCheck className="h-4 w-4" />Você já tem {banco.metas.length} {banco.metas.length === 1 ? 'meta' : 'metas'}.</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
                <Campo rotulo="Nome"><Entrada value={mNome} onChange={e => setMNome(e.target.value)} placeholder="Ex.: Viagem" maxLength={60} /></Campo>
                <Campo rotulo="Valor"><CampoValor valor={mAlvo} aoMudar={setMAlvo} /></Campo>
                <Campo rotulo="Prazo (opcional)"><Entrada type="date" value={mPrazo} onChange={e => setMPrazo(e.target.value)} /></Campo>
                <Botao carregando={ocupado} icone={L.Plus} onClick={async () => {
                  if (!mNome.trim() || !mAlvo) return
                  if (await executar(() => inserir('metas', { nome: mNome.trim(), alvo_cents: mAlvo, prazo: mPrazo || null, conta_id: contas.find(c => c.tipo === 'reserva')?.id ?? null }), 'Meta criada.')) { setMNome(''); setMAlvo(null); setMPrazo('') }
                }}>Criar</Botao>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  )
}
