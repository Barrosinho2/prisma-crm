import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from 'react'
import { AnimatePresence, motion, animate, useMotionValue, useTransform } from 'motion/react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import * as L from 'lucide-react'
import { centavosParaTexto, paraCentavos, reais } from '../lib/formato'
import { useDados } from '../lib/dados'

export const cn = clsx

// ---------------------------------------------------------------- ícones
export const ICONES: Record<string, L.LucideIcon> = {
  home: L.House, utensils: L.Utensils, car: L.Car, 'heart-pulse': L.HeartPulse, 'graduation-cap': L.GraduationCap,
  repeat: L.Repeat, sparkles: L.Sparkles, 'shopping-bag': L.ShoppingBag, circle: L.Circle, briefcase: L.Briefcase,
  'trending-up': L.TrendingUp, 'plus-circle': L.CirclePlus, plane: L.Plane, gift: L.Gift, dumbbell: L.Dumbbell,
  wifi: L.Wifi, smartphone: L.Smartphone, baby: L.Baby, dog: L.Dog, shirt: L.Shirt, coffee: L.Coffee, fuel: L.Fuel,
  bus: L.Bus, film: L.Film, music: L.Music, book: L.Book, pill: L.Pill, receipt: L.Receipt, 'piggy-bank': L.PiggyBank,
  landmark: L.Landmark, wallet: L.Wallet, target: L.Target, laptop: L.Laptop, shield: L.ShieldCheck, tag: L.Tag,
}
export function Icone({ nome, className }: { nome: string; className?: string }) {
  const C = ICONES[nome] ?? L.Circle
  return <C className={className} strokeWidth={1.6} aria-hidden />
}

// ---------------------------------------------------------------- botões
type VarBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'suave'
interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarBotao
  tamanho?: 'sm' | 'md' | 'lg' | 'icone'
  carregando?: boolean
  icone?: L.LucideIcon
}
export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = 'secundario', tamanho = 'md', carregando, icone: Ic, className, children, disabled, ...r }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || carregando}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.98]',
        tamanho === 'sm' && 'h-8 px-3 text-[13px]',
        tamanho === 'md' && 'h-10 px-4 text-sm',
        tamanho === 'lg' && 'h-12 px-5 text-[15px]',
        tamanho === 'icone' && 'h-9 w-9 shrink-0',
        variante === 'primario' && 'bg-vinho text-marfim hover:bg-vinho-escuro shadow-[0_6px_18px_-8px_rgb(98_31_50/.6)]',
        variante === 'secundario' && 'bg-cartao text-carvao border border-borda hover:border-vinho-suave/50 hover:bg-white',
        variante === 'fantasma' && 'text-taupe hover:text-carvao hover:bg-creme/70',
        variante === 'suave' && 'bg-vinho-claro text-vinho hover:bg-[#EADADE]',
        variante === 'perigo' && 'bg-despesa text-white hover:bg-[#832F2F]',
        className,
      )}
      {...r}
    >
      {carregando ? <L.LoaderCircle className="h-4 w-4 animate-spin" /> : Ic ? <Ic className="h-4 w-4" strokeWidth={1.8} /> : null}
      {children}
    </button>
  )
})

// ---------------------------------------------------------------- cartões
export function Painel({ className, children, ...r }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-borda bg-cartao shadow-suave', className)} {...r}>{children}</div>
}
export function TituloPainel({ titulo, sub, acao }: { titulo: ReactNode; sub?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-carvao">{titulo}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-taupe">{sub}</p>}
      </div>
      {acao}
    </div>
  )
}

// ---------------------------------------------------------------- valores
// ---------- ocultar um valor específico (olhinho em cada cartão de saldo) ----------
const CHAVE_OCULTOS = 'fin:ocultos'
function lerOcultos(): string[] {
  try { return JSON.parse(localStorage.getItem(CHAVE_OCULTOS) ?? '[]') } catch { return [] }
}
/** Estado de ocultação de um cartão. Fica salvo no aparelho e sincroniza entre os cartões abertos. */
export function useOculto(chave: string): [boolean, () => void] {
  const [lista, setLista] = useState<string[]>(lerOcultos)
  useEffect(() => {
    const atualizar = () => setLista(lerOcultos())
    window.addEventListener('fin:ocultos', atualizar); window.addEventListener('storage', atualizar)
    return () => { window.removeEventListener('fin:ocultos', atualizar); window.removeEventListener('storage', atualizar) }
  }, [])
  const alternar = useCallback(() => {
    const atual = lerOcultos()
    const nova = atual.includes(chave) ? atual.filter(k => k !== chave) : [...atual, chave]
    try { localStorage.setItem(CHAVE_OCULTOS, JSON.stringify(nova)) } catch { /* sem armazenamento */ }
    setLista(nova)
    window.dispatchEvent(new Event('fin:ocultos'))
  }, [chave])
  return [lista.includes(chave), alternar]
}
/** Botão de olho para mostrar/ocultar o valor de um cartão. */
export function BotaoOlho({ oculto, alternar, claro, className }: { oculto: boolean; alternar: () => void; claro?: boolean; className?: string }) {
  const { banco } = useDados()
  const global = !!banco.config?.ocultar_valores
  const escondido = oculto || global
  return (
    <button type="button" onClick={alternar} disabled={global} aria-pressed={escondido}
      aria-label={escondido ? 'Mostrar valor' : 'Ocultar valor'} title={global ? 'Todos os valores estão ocultos (botão do menu)' : escondido ? 'Mostrar valor' : 'Ocultar valor'}
      className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg transition disabled:opacity-50',
        claro ? 'text-[#E4CBD2] hover:bg-white/10 hover:text-white' : 'text-taupe hover:bg-creme hover:text-carvao', className)}>
      {escondido ? <L.EyeOff className="h-3.5 w-3.5" /> : <L.Eye className="h-3.5 w-3.5" />}
    </button>
  )
}

export function Valor({ cents, className, sinal, curto, ocultar }: { cents: number; className?: string; sinal?: boolean; curto?: boolean; ocultar?: boolean }) {
  const { banco } = useDados()
  const oculto = banco.config?.ocultar_valores || ocultar
  if (oculto) return <span className={cn('num tracking-widest', className)} aria-label="valor oculto">R$ ••••</span>
  const txt = reais(Math.abs(cents))
  const pre = sinal ? (cents > 0 ? '+ ' : cents < 0 ? '− ' : '') : cents < 0 ? '− ' : ''
  return <span className={cn('num whitespace-nowrap', className)}>{pre}{curto ? txt.replace(/,00$/, '') : txt}</span>
}
export function NumeroAnimado({ cents, className, ocultar }: { cents: number; className?: string; ocultar?: boolean }) {
  const { banco } = useDados()
  const mv = useMotionValue(cents)
  const txt = useTransform(mv, v => (cents < 0 ? '− ' : '') + reais(Math.abs(Math.round(v))))
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) { primeira.current = false; mv.set(cents); return }
    const c = animate(mv, cents, { duration: 0.6, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [cents, mv])
  if (banco.config?.ocultar_valores || ocultar) return <span className={cn('num tracking-widest', className)} aria-label="valor oculto">R$ ••••</span>
  return <motion.span className={cn('num whitespace-nowrap', className)}>{txt}</motion.span>
}

// ---------------------------------------------------------------- formulários
export function Campo({ rotulo, erro, ajuda, children, className }: { rotulo: ReactNode; erro?: string | null; ajuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-carvao/80">{rotulo}</span>
      {children}
      {erro ? <span className="mt-1 block text-xs text-despesa" role="alert">{erro}</span>
        : ajuda ? <span className="mt-1 block text-xs text-taupe">{ajuda}</span> : null}
    </label>
  )
}
const baseCampo = 'w-full h-11 rounded-xl border border-borda bg-white/70 px-3.5 text-[15px] sm:text-sm text-carvao placeholder:text-taupe/70 transition focus:border-vinho-suave focus:bg-white focus:outline-none focus:ring-4 focus:ring-vinho/5 disabled:opacity-60'
export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada({ className, ...r }, ref) {
  return <input ref={ref} className={cn(baseCampo, className)} {...r} />
})
export function Seletor({ className, children, ...r }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(baseCampo, 'appearance-none pr-9', className)} {...r}>{children}</select>
      <L.ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-taupe" />
    </div>
  )
}
export function AreaTexto({ className, ...r }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseCampo, 'h-auto min-h-[76px] py-2.5', className)} {...r} />
}
/** Campo de valor em reais; devolve centavos inteiros (ou null). */
export function CampoValor({ valor, aoMudar, autoFocus, id, placeholder = '0,00', disabled }: {
  valor: number | null; aoMudar: (c: number | null) => void; autoFocus?: boolean; id?: string; placeholder?: string; disabled?: boolean
}) {
  const [txt, setTxt] = useState(valor != null ? centavosParaTexto(valor) : '')
  const foco = useRef(false)
  useEffect(() => { if (!foco.current) setTxt(valor != null ? centavosParaTexto(valor) : '') }, [valor])
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-taupe">R$</span>
      <input
        id={id} disabled={disabled} autoFocus={autoFocus} inputMode="decimal" placeholder={placeholder} value={txt}
        className={cn(baseCampo, 'num pl-10')}
        onFocus={() => { foco.current = true }}
        onChange={e => { const v = e.target.value.replace(/[^\d.,-]/g, ''); setTxt(v); aoMudar(paraCentavos(v)) }}
        onBlur={() => { foco.current = false; const c = paraCentavos(txt); if (c != null) setTxt(centavosParaTexto(c)) }}
      />
    </div>
  )
}
export function Alternar({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => aoMudar(!ligado)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', ligado ? 'bg-vinho' : 'bg-borda')}>
      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', ligado && 'translate-x-5')} />
    </button>
  )
}

// ---------------------------------------------------------------- etiquetas e progresso
type Tom = 'neutro' | 'receita' | 'despesa' | 'atencao' | 'vinho' | 'info'
export function Etiqueta({ tom = 'neutro', children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap',
      tom === 'neutro' && 'bg-creme text-taupe',
      tom === 'receita' && 'bg-receita-fundo text-receita',
      tom === 'despesa' && 'bg-despesa-fundo text-despesa',
      tom === 'atencao' && 'bg-atencao-fundo text-atencao',
      tom === 'vinho' && 'bg-vinho-claro text-vinho',
      tom === 'info' && 'bg-[#E7ECF1] text-info', className)}>
      {children}
    </span>
  )
}
export function Barra({ pct, tom, fina, rotulo }: { pct: number; tom?: 'auto' | 'vinho' | 'receita'; fina?: boolean; rotulo?: string }) {
  const p = Math.max(0, Math.min(100, pct))
  const cor = tom === 'receita' ? 'bg-receita' : tom === 'vinho' || !tom ? 'bg-vinho'
    : pct >= 100 ? 'bg-despesa' : pct >= 80 ? 'bg-atencao' : 'bg-vinho-suave'
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-creme', fina ? 'h-1.5' : 'h-2')} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
      <motion.div className={cn('h-full rounded-full', cor)} initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  )
}

// ---------------------------------------------------------------- estados
export function Vazio({ icone: Ic = L.Sparkles, titulo, texto, acao, compacto }: { icone?: L.LucideIcon; titulo: string; texto?: ReactNode; acao?: ReactNode; compacto?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compacto ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-borda bg-marfim">
        <Ic className="h-5 w-5 text-vinho-suave" strokeWidth={1.5} />
      </div>
      <p className="titulo text-lg text-carvao">{titulo}</p>
      {texto && <p className="mt-1.5 max-w-sm text-sm text-taupe">{texto}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  )
}
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('esqueleto rounded-xl', className)} />
}

// ---------------------------------------------------------------- dica
export function Dica({ texto, children }: { texto: string; children?: ReactNode }) {
  const id = useId()
  return (
    <span className="group relative inline-flex">
      <span tabIndex={0} aria-describedby={id} className="inline-flex cursor-help text-taupe/80 hover:text-carvao">
        {children ?? <L.Info className="h-3.5 w-3.5" />}
      </span>
      <span id={id} role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-60 max-w-[70vw] -translate-x-1/2 rounded-xl bg-carvao px-3 py-2 text-xs leading-relaxed text-marfim shadow-elevada group-hover:block group-focus-within:block">
        {texto}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------- abas
export function Abas<T extends string>({ opcoes, valor, aoMudar, className }: { opcoes: { v: T; r: ReactNode }[]; valor: T; aoMudar: (v: T) => void; className?: string }) {
  const id = useId()
  return (
    <div role="tablist" className={cn('rolagem-fina inline-flex max-w-full overflow-x-auto rounded-xl border border-borda bg-creme/60 p-0.5', className)}>
      {opcoes.map(o => (
        <button key={o.v} role="tab" aria-selected={valor === o.v} onClick={() => aoMudar(o.v)}
          className={cn('relative shrink-0 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors', valor === o.v ? 'text-carvao' : 'text-taupe hover:text-carvao')}>
          {valor === o.v && <motion.span layoutId={id} className="absolute inset-0 rounded-[10px] bg-cartao shadow-suave" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.r}</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- modal
export function Modal({ aberto, aoFechar, titulo, sub, children, rodape, largura = 'md' }: {
  aberto: boolean; aoFechar: () => void; titulo: ReactNode; sub?: ReactNode; children: ReactNode; rodape?: ReactNode; largura?: 'sm' | 'md' | 'lg'
}) {
  const ref = useRef<HTMLDivElement>(null)
  // guarda a função de fechar sem reexecutar o efeito (senão o foco "pula" a cada renderização)
  const fecharRef = useRef(aoFechar)
  fecharRef.current = aoFechar
  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement as HTMLElement | null
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharRef.current()
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex="0"]')
        if (!f.length) return
        const p = f[0], u = f[f.length - 1]
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus() }
        else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus() }
      }
    }
    document.addEventListener('keydown', tecla)
    const ov = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return
      const alvo = ref.current?.querySelector<HTMLElement>('[autofocus],input,select,textarea')
      alvo?.focus()
    }, 60)
    return () => { clearTimeout(t); document.removeEventListener('keydown', tecla); document.body.style.overflow = ov; anterior?.focus?.() }
  }, [aberto])
  // portal: a janela fica sempre sobre a tela inteira, independente de onde foi aberta
  return createPortal(
    <AnimatePresence>
      {aberto && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-vinho-escuro/35 backdrop-blur-[2px]" onClick={aoFechar}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined}
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn('relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-borda bg-cartao shadow-elevada sm:rounded-3xl',
              largura === 'sm' && 'sm:max-w-md', largura === 'md' && 'sm:max-w-xl', largura === 'lg' && 'sm:max-w-3xl')}>
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-borda sm:hidden" />
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
              <div>
                <h2 className="titulo text-[22px] leading-tight text-carvao">{titulo}</h2>
                {sub && <p className="mt-1 text-sm text-taupe">{sub}</p>}
              </div>
              <Botao variante="fantasma" tamanho="icone" onClick={aoFechar} aria-label="Fechar"><L.X className="h-4 w-4" /></Botao>
            </div>
            <div className="rolagem-fina flex-1 overflow-y-auto px-6 pb-5">{children}</div>
            {rodape && <div className="flex flex-col-reverse gap-2 border-t border-borda bg-marfim/60 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{rodape}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ---------------------------------------------------------------- avisos (toasts) e confirmação
interface Aviso { id: number; tom: 'ok' | 'erro' | 'info'; texto: string; acao?: { r: string; f: () => void } }
interface AvisosCtx {
  avisar: (texto: string, tom?: Aviso['tom'], acao?: Aviso['acao']) => void
  confirmar: (o: { titulo: string; texto?: ReactNode; botao?: string; perigo?: boolean }) => Promise<boolean>
}
const Ctx = createContext<AvisosCtx | null>(null)
export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [conf, setConf] = useState<null | { titulo: string; texto?: ReactNode; botao?: string; perigo?: boolean; r: (v: boolean) => void }>(null)
  const avisar = useCallback((texto: string, tom: Aviso['tom'] = 'ok', acao?: Aviso['acao']) => {
    const id = Date.now() + Math.random()
    setAvisos(a => [...a.slice(-2), { id, tom, texto, acao }])
    setTimeout(() => setAvisos(a => a.filter(x => x.id !== id)), tom === 'erro' ? 6500 : 3800)
  }, [])
  const confirmar = useCallback((o: { titulo: string; texto?: ReactNode; botao?: string; perigo?: boolean }) =>
    new Promise<boolean>(r => setConf({ ...o, r })), [])
  const fechar = (v: boolean) => { conf?.r(v); setConf(null) }
  return (
    <Ctx.Provider value={{ avisar, confirmar }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end" aria-live="polite">
        <AnimatePresence>
          {avisos.map(a => (
            <motion.div key={a.id} layout initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-carvao px-4 py-3 text-sm text-marfim shadow-elevada">
              {a.tom === 'ok' ? <L.CircleCheck className="h-4 w-4 shrink-0 text-[#9CC5A8]" /> : a.tom === 'erro' ? <L.TriangleAlert className="h-4 w-4 shrink-0 text-[#E9A3A3]" /> : <L.Info className="h-4 w-4 shrink-0 text-[#C9A9B3]" />}
              <span className="flex-1">{a.texto}</span>
              {a.acao && <button className="font-semibold text-[#E4CBD2] hover:text-white" onClick={() => { a.acao!.f(); setAvisos(x => x.filter(y => y.id !== a.id)) }}>{a.acao.r}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Modal aberto={!!conf} aoFechar={() => fechar(false)} titulo={conf?.titulo ?? ''} largura="sm"
        rodape={<>
          <Botao onClick={() => fechar(false)}>Voltar</Botao>
          <Botao variante={conf?.perigo ? 'perigo' : 'primario'} onClick={() => fechar(true)} autoFocus>{conf?.botao ?? 'Confirmar'}</Botao>
        </>}>
        {conf?.texto && <div className="text-sm leading-relaxed text-taupe">{conf.texto}</div>}
      </Modal>
    </Ctx.Provider>
  )
}
export function useAvisos() {
  const c = useContext(Ctx)
  if (!c) throw new Error('AvisosProvider ausente')
  return c
}

/** Executa uma ação com estado de carregamento, aviso de sucesso e erro traduzido. */
export function useAcao() {
  const { avisar } = useAvisos()
  const [ocupado, setOcupado] = useState(false)
  const travado = useRef(false)
  const executar = useCallback(async (f: () => Promise<unknown>, ok?: string) => {
    if (travado.current) return false // impede clique duplo
    travado.current = true; setOcupado(true)
    try {
      await f()
      if (ok) avisar(ok)
      return true
    } catch (e) {
      const { mensagemErro } = await import('../lib/supabase')
      avisar(mensagemErro(e), 'erro')
      return false
    } finally {
      travado.current = false; setOcupado(false)
    }
  }, [avisar])
  return { ocupado, executar }
}

export function PontoCor({ cor, className }: { cor: string; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: cor }} />
}
export function IconeCategoria({ cor, icone, tamanho = 'md' }: { cor: string; icone: string; tamanho?: 'sm' | 'md' }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl', tamanho === 'sm' ? 'h-7 w-7' : 'h-9 w-9')} style={{ background: cor + '14', color: cor }}>
      <Icone nome={icone} className={tamanho === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  )
}

// ---------------------------------------------------------------- menu de ações (⋯)
export interface AcaoMenu { r: string; i?: L.LucideIcon; f: () => void; perigo?: boolean; oculto?: boolean }
/** Menu de ações com rótulos. Abre sobre a tela (não é cortado por cartões) e vira para cima perto do rodapé. */
export function MenuAcoes({ acoes, rotulo = 'Mais ações' }: { acoes: AcaoMenu[]; rotulo?: string }) {
  const [pos, setPos] = useState<null | { top?: number; bottom?: number; right: number }>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const visiveis = acoes.filter(a => !a.oculto)
  useEffect(() => {
    if (!pos) return
    const fechar = () => setPos(null)
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPos(null); botao.current?.focus() } }
    window.addEventListener('scroll', fechar, true); window.addEventListener('resize', fechar); window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('scroll', fechar, true); window.removeEventListener('resize', fechar); window.removeEventListener('keydown', tecla) }
  }, [pos])
  if (!visiveis.length) return null
  function abrir() {
    const r = botao.current!.getBoundingClientRect()
    const altura = visiveis.length * 38 + 12
    const right = Math.max(8, window.innerWidth - r.right)
    setPos(window.innerHeight - r.bottom < altura + 16 ? { bottom: window.innerHeight - r.top + 6, right } : { top: r.bottom + 6, right })
  }
  return (
    <>
      <button ref={botao} type="button" onClick={() => (pos ? setPos(null) : abrir())} aria-haspopup="menu" aria-expanded={!!pos} aria-label={rotulo} title={rotulo}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-taupe transition hover:bg-creme hover:text-carvao">
        <L.Ellipsis className="h-4 w-4" />
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setPos(null)} />
          <motion.div role="menu" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.12 }}
            className="fixed z-[71] min-w-[210px] rounded-2xl border border-borda bg-cartao p-1.5 shadow-elevada" style={pos}>
            {visiveis.map(a => (
              <button key={a.r} role="menuitem" onClick={() => { setPos(null); a.f() }}
                className={cn('flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm', a.perigo ? 'text-despesa hover:bg-despesa-fundo' : 'text-carvao hover:bg-creme')}>
                {a.i && <a.i className={cn('h-4 w-4', !a.perigo && 'text-taupe')} />}{a.r}
              </button>
            ))}
          </motion.div>
        </>,
        document.body,
      )}
    </>
  )
}
