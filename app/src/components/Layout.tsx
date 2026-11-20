import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import * as L from 'lucide-react'
import { cn, Botao } from './ui'
import { useDados } from '../lib/dados'
import { supabase } from '../lib/supabase'
import { dataLonga, nomeMes, somaMeses, inicioMes } from '../lib/formato'
import { TransacaoModal, type TipoNova } from './Formularios'

export const NAV = [
  { to: '/', r: 'Dashboard', i: L.LayoutDashboard },
  { to: '/transacoes', r: 'Transações', i: L.ArrowLeftRight },
  { to: '/contas', r: 'Contas e saldos', i: L.Landmark },
  { to: '/cartoes', r: 'Cartões de crédito', i: L.CreditCard },
  { to: '/a-pagar', r: 'Contas a pagar', i: L.CalendarClock },
  { to: '/orcamentos', r: 'Orçamentos', i: L.ChartPie },
  { to: '/metas', r: 'Metas financeiras', i: L.Target },
  { to: '/calendario', r: 'Calendário', i: L.CalendarDays },
  { to: '/relatorios', r: 'Relatórios', i: L.ChartColumn },
  { to: '/configuracoes', r: 'Configurações', i: L.Settings },
]

// ---------- "+ Nova transação" disponível em qualquer tela ----------
const NovaCtx = createContext<(t?: TipoNova) => void>(() => {})
export const useNovaTransacao = () => useContext(NovaCtx)

function Marca({ recolhida }: { recolhida?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="40" height="40" rx="11" fill="#621F32" />
        <circle cx="20" cy="20" r="9.5" fill="none" stroke="#F8F5F0" strokeWidth="1.8" />
        <circle cx="20" cy="20" r="5" fill="none" stroke="#C9A9B3" strokeWidth="1.2" />
      </svg>
      {!recolhida && (
        <div className="leading-tight">
          <p className="titulo text-[19px] text-marfim">Finanças</p>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-[#C9A9B3]">pessoais</p>
        </div>
      )}
    </div>
  )
}

function ItemNav({ to, r, i: Ic, recolhida, onClick }: { to: string; r: string; i: L.LucideIcon; recolhida?: boolean; onClick?: () => void }) {
  return (
    <NavLink to={to} end={to === '/'} onClick={onClick} title={recolhida ? r : undefined}
      className={({ isActive }) => cn(
        'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors',
        isActive ? 'bg-white/[0.08] text-marfim' : 'text-[#CDB9BF] hover:bg-white/[0.04] hover:text-marfim',
        recolhida && 'justify-center px-0',
      )}>
      {({ isActive }) => (<>
        {isActive && <motion.span layoutId="nav-ativo" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#E4CBD2]" />}
        <Ic className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
        {!recolhida && <span className="truncate">{r}</span>}
      </>)}
    </NavLink>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { banco, salvarConfig } = useDados()
  const [recolhida, setRecolhida] = useState(() => {
    try { return localStorage.getItem('fin:sidebar') === '1' } catch { return false }
  })
  const [mais, setMais] = useState(false)
  const [nova, setNova] = useState<TipoNova | null>(null)
  const loc = useLocation()
  useEffect(() => { try { localStorage.setItem('fin:sidebar', recolhida ? '1' : '0') } catch { /* sem armazenamento */ } }, [recolhida])
  useEffect(() => { setMais(false); window.scrollTo({ top: 0 }) }, [loc.pathname])
  // atalho de teclado: N abre nova transação
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(alvo.tagName) && !document.querySelector('[role=dialog]')) {
        e.preventDefault(); setNova('despesa')
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])
  const oculto = !!banco.config?.ocultar_valores

  return (
    <NovaCtx.Provider value={t => setNova(t ?? 'despesa')}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-cartao focus:px-4 focus:py-2">Pular para o conteúdo</a>
      {/* sidebar desktop */}
      <aside className={cn('fixed inset-y-0 left-0 z-40 hidden flex-col bg-vinho-escuro transition-[width] duration-300 lg:flex', recolhida ? 'w-[76px]' : 'w-[256px]')}>
        <div className={cn('flex h-20 items-center', recolhida ? 'justify-center' : 'px-5')}><Marca recolhida={recolhida} /></div>
        <nav className={cn('rolagem-fina flex-1 space-y-0.5 overflow-y-auto', recolhida ? 'px-3' : 'px-3.5')} aria-label="Principal">
          {NAV.map(n => <ItemNav key={n.to} {...n} recolhida={recolhida} />)}
        </nav>
        <div className={cn('space-y-1 border-t border-white/[0.07] py-4', recolhida ? 'px-3' : 'px-3.5')}>
          <button onClick={() => salvarConfig({ ocultar_valores: !oculto })} title={oculto ? 'Mostrar valores' : 'Ocultar valores'}
            className={cn('flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14px] text-[#CDB9BF] hover:bg-white/[0.04] hover:text-marfim', recolhida && 'justify-center px-0')}>
            {oculto ? <L.EyeOff className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <L.Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />}
            {!recolhida && (oculto ? 'Mostrar valores' : 'Ocultar valores')}
          </button>
          <button onClick={() => setRecolhida(v => !v)} title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className={cn('flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14px] text-[#CDB9BF] hover:bg-white/[0.04] hover:text-marfim', recolhida && 'justify-center px-0')}>
            {recolhida ? <L.PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <L.PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.6} />}
            {!recolhida && 'Recolher menu'}
          </button>
        </div>
      </aside>

      <div className={cn('min-h-dvh transition-[padding] duration-300', recolhida ? 'lg:pl-[76px]' : 'lg:pl-[256px]')}>
        <main id="conteudo" className="mx-auto max-w-[1360px] px-4 pb-32 pt-4 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* navegação inferior no celular */}
      <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-cartao/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {[NAV[0], NAV[1]].map(n => <AbaInferior key={n.to} to={n.to} r={n.to === '/' ? 'Início' : 'Transações'} i={n.i} />)}
          <div className="grid place-items-center">
            <button onClick={() => setNova('despesa')} aria-label="Nova transação"
              className="grid h-12 w-12 -translate-y-3 place-items-center rounded-2xl bg-vinho text-marfim shadow-[0_10px_24px_-8px_rgb(98_31_50/.7)] active:scale-95">
              <L.Plus className="h-5 w-5" />
            </button>
          </div>
          <AbaInferior to="/a-pagar" r="A pagar" i={L.CalendarClock} />
          <button onClick={() => setMais(true)} className={cn('flex flex-col items-center gap-1 text-[11px]', mais ? 'text-vinho' : 'text-taupe')}>
            <L.Menu className="h-5 w-5" strokeWidth={1.6} />Mais
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mais && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-vinho-escuro/40" onClick={() => setMais(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-vinho-escuro px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
              <div className="mb-3 flex items-center justify-between px-1"><Marca /><Botao variante="fantasma" tamanho="icone" className="text-[#CDB9BF] hover:bg-white/5" onClick={() => setMais(false)} aria-label="Fechar"><L.X className="h-5 w-5" /></Botao></div>
              <div className="grid grid-cols-2 gap-1">
                {NAV.map(n => <ItemNav key={n.to} {...n} onClick={() => setMais(false)} />)}
                <button onClick={() => salvarConfig({ ocultar_valores: !oculto })} className="flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] text-[#CDB9BF]">
                  {oculto ? <L.EyeOff className="h-[18px] w-[18px]" /> : <L.Eye className="h-[18px] w-[18px]" />}{oculto ? 'Mostrar valores' : 'Ocultar valores'}
                </button>
                <button onClick={() => supabase.auth.signOut()} className="flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] text-[#CDB9BF]"><L.LogOut className="h-[18px] w-[18px]" />Sair</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <TransacaoModal aberto={!!nova} tipoInicial={nova ?? 'despesa'} aoFechar={() => setNova(null)} />
    </NovaCtx.Provider>
  )
}

function AbaInferior({ to, r, i: Ic }: { to: string; r: string; i: L.LucideIcon }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cn('flex flex-col items-center gap-1 text-[11px]', isActive ? 'text-vinho' : 'text-taupe')}>
      <Ic className="h-5 w-5" strokeWidth={1.6} />{r}
    </NavLink>
  )
}

// ---------- cabeçalho de cada página ----------
export function Cabecalho({ titulo, sub, acoes, seletorMes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode; seletorMes?: boolean }) {
  const { hoje } = useDados()
  const nova = useNovaTransacao()
  return (
    <header className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="mb-1 hidden text-[13px] text-taupe first-letter:uppercase lg:block">{dataLonga(hoje)}</p>
        <h1 className="titulo text-[28px] leading-tight text-carvao sm:text-[34px]">{titulo}</h1>
        {sub && <p className="mt-1 text-[15px] text-taupe">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {seletorMes && <SeletorMes />}
        {acoes}
        <Botao variante="primario" icone={L.Plus} onClick={() => nova()} className="max-lg:hidden" title="Atalho: N">Nova transação</Botao>
        <Perfil />
      </div>
    </header>
  )
}

export function SeletorMes() {
  const { mesRef, setMesRef, hoje } = useDados()
  const atual = inicioMes(hoje) === mesRef
  return (
    <div className="flex h-10 items-center rounded-xl border border-borda bg-cartao">
      <button className="grid h-full w-9 place-items-center text-taupe hover:text-carvao" onClick={() => setMesRef(somaMeses(mesRef, -1))} aria-label="Mês anterior"><L.ChevronLeft className="h-4 w-4" /></button>
      <button className="min-w-[132px] px-1 text-sm font-medium text-carvao" onClick={() => setMesRef(inicioMes(hoje))} title={atual ? undefined : 'Voltar para o mês atual'}>
        {nomeMes(mesRef)}
      </button>
      <button className="grid h-full w-9 place-items-center text-taupe hover:text-carvao" onClick={() => setMesRef(somaMeses(mesRef, 1))} aria-label="Próximo mês"><L.ChevronRight className="h-4 w-4" /></button>
    </div>
  )
}

function Perfil() {
  const { banco } = useDados()
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState('')
  useEffect(() => { supabase.auth.getUser().then(r => setEmail(r.data.user?.email ?? '')) }, [])
  const nome = banco.config?.nome || email.split('@')[0] || 'Perfil'
  return (
    <div className="relative hidden lg:block">
      <button onClick={() => setAberto(v => !v)} aria-haspopup="menu" aria-expanded={aberto}
        className="grid h-10 w-10 place-items-center rounded-xl border border-borda bg-cartao text-sm font-semibold text-vinho hover:border-vinho-suave/50">
        {nome.slice(0, 1).toUpperCase()}
      </button>
      <AnimatePresence>
        {aberto && (<>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute right-0 top-12 z-50 w-60 rounded-2xl border border-borda bg-cartao p-2 shadow-elevada">
            <div className="px-3 py-2"><p className="text-sm font-medium">{nome}</p><p className="truncate text-xs text-taupe">{email}</p></div>
            <NavLink to="/configuracoes" onClick={() => setAberto(false)} className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm hover:bg-creme"><L.Settings className="h-4 w-4" />Configurações</NavLink>
            <button onClick={() => supabase.auth.signOut()} className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-despesa hover:bg-despesa-fundo"><L.LogOut className="h-4 w-4" />Sair</button>
          </motion.div>
        </>)}
      </AnimatePresence>
    </div>
  )
}
