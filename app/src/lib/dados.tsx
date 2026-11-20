import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase, mensagemErro } from './supabase'
import { bancoVazio, type Banco, type Config } from './tipos'
import { hoje as hojeSP, inicioMes } from './formato'

export const TABELAS = {
  contas: 'fin_contas',
  categorias: 'fin_categorias',
  cartoes: 'fin_cartoes',
  recorrencias: 'fin_recorrencias',
  faturas: 'fin_faturas',
  compras: 'fin_compras',
  parcelas: 'fin_parcelas',
  lancamentos: 'fin_lancamentos',
  transferencias: 'fin_transferencias',
  pagamentos: 'fin_pagamentos_fatura',
  metas: 'fin_metas',
  movimentos: 'fin_movimentos_meta',
  orcamentos: 'fin_orcamentos',
} as const
export type Tabela = keyof typeof TABELAS

async function lerTudo(tabela: string) {
  const out: unknown[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from(tabela).select('*').order('id').range(de, de + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

interface Ctx {
  banco: Banco
  carregando: boolean
  erro: string | null
  hoje: string
  mesRef: string
  setMesRef: (m: string) => void
  recarregar: () => Promise<void>
  inserir: (t: Tabela, linha: Record<string, unknown>) => Promise<string>
  atualizar: (t: Tabela, id: string, campos: Record<string, unknown>) => Promise<void>
  excluir: (t: Tabela, id: string) => Promise<void>
  rpc: <T = unknown>(nome: string, args?: Record<string, unknown>) => Promise<T>
  salvarConfig: (campos: Partial<Config>) => Promise<void>
}
const DadosCtx = createContext<Ctx | null>(null)

export function DadosProvider({ children }: { children: ReactNode }) {
  const [banco, setBanco] = useState<Banco>(bancoVazio)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [hoje, setHoje] = useState(hojeSP())
  const [mesRef, setMesRef] = useState(inicioMes(hojeSP()))
  const seq = useRef(0)

  const recarregar = useCallback(async () => {
    const meu = ++seq.current
    try {
      const nomes = Object.keys(TABELAS) as Tabela[]
      const [cfg, ...listas] = await Promise.all([
        supabase.from('fin_config').select('*').maybeSingle(),
        ...nomes.map(n => lerTudo(TABELAS[n])),
      ])
      if (cfg.error) throw cfg.error
      if (meu !== seq.current) return // uma recarga mais nova já chegou
      const novo = bancoVazio()
      novo.config = (cfg.data as Config) ?? null
      nomes.forEach((n, i) => { (novo as unknown as Record<string, unknown[]>)[n] = listas[i] })
      setBanco(novo)
      setErro(null)
    } catch (e) {
      if (meu === seq.current) setErro(mensagemErro(e))
    } finally {
      if (meu === seq.current) setCarregando(false)
    }
  }, [])

  // primeiro acesso: categorias padrão + previsões das recorrências
  useEffect(() => {
    (async () => {
      try {
        await supabase.rpc('fin_iniciar')
        await supabase.rpc('fin_gerar_previsoes')
      } catch { /* a recarga mostra o erro */ }
      await recarregar()
    })()
  }, [recarregar])

  // virada do dia / mês e volta à aba
  useEffect(() => {
    const t = setInterval(() => setHoje(hojeSP()), 60_000)
    const foco = () => {
      if (document.visibilityState === 'visible') {
        setHoje(hojeSP())
        supabase.rpc('fin_gerar_previsoes').then(() => recarregar())
      }
    }
    document.addEventListener('visibilitychange', foco)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', foco) }
  }, [recarregar])

  const inserir = useCallback(async (t: Tabela, linha: Record<string, unknown>) => {
    const id = (linha.id as string) ?? crypto.randomUUID()
    // id gerado no navegador: se a requisição for repetida, não duplica
    const { error } = await supabase.from(TABELAS[t]).upsert({ ...linha, id }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    await recarregar()
    return id
  }, [recarregar])

  const atualizar = useCallback(async (t: Tabela, id: string, campos: Record<string, unknown>) => {
    const { error } = await supabase.from(TABELAS[t]).update(campos).eq('id', id)
    if (error) throw error
    await recarregar()
  }, [recarregar])

  const excluir = useCallback(async (t: Tabela, id: string) => {
    const { error, count } = await supabase.from(TABELAS[t]).delete({ count: 'exact' }).eq('id', id)
    if (error) throw error
    if (count === 0) throw new Error('Este item não pode ser excluído (já foi efetivado ou faz parte do histórico).')
    await recarregar()
  }, [recarregar])

  const rpc = useCallback(async <T,>(nome: string, args?: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(nome, args ?? {})
    if (error) throw error
    await recarregar()
    return data as T
  }, [recarregar])

  const salvarConfig = useCallback(async (campos: Partial<Config>) => {
    setBanco(b => (b.config ? { ...b, config: { ...b.config, ...campos } } : b))
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('fin_config').upsert({ user_id: u.user?.id, ...campos }, { onConflict: 'user_id' })
    if (error) { await recarregar(); throw error }
  }, [recarregar])

  const valor = useMemo<Ctx>(() => ({
    banco, carregando, erro, hoje, mesRef, setMesRef, recarregar, inserir, atualizar, excluir, rpc, salvarConfig,
  }), [banco, carregando, erro, hoje, mesRef, recarregar, inserir, atualizar, excluir, rpc, salvarConfig])

  return <DadosCtx.Provider value={valor}>{children}</DadosCtx.Provider>
}

export function useDados() {
  const c = useContext(DadosCtx)
  if (!c) throw new Error('useDados fora do provider')
  return c
}
