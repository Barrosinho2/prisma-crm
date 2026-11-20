import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/500.css'
import './index.css'
import { supabase } from './lib/supabase'
import { DadosProvider, useDados } from './lib/dados'
import { AvisosProvider, Esqueleto, Botao } from './components/ui'
import { Layout } from './components/Layout'
import { Entrar, SemAcesso } from './pages/Entrar'

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Transacoes = lazy(() => import('./pages/Transacoes'))
const Contas = lazy(() => import('./pages/Contas'))
const Cartoes = lazy(() => import('./pages/Cartoes'))
const APagar = lazy(() => import('./pages/APagar'))
const Orcamentos = lazy(() => import('./pages/Orcamentos'))
const Metas = lazy(() => import('./pages/Metas'))
const Calendario = lazy(() => import('./pages/Calendario'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))

// depois que o painel abre, já baixa as outras telas: a navegação fica instantânea
// e uma atualização do site não deixa telas sem arquivo
const paginas = [
  () => import('./pages/Transacoes'), () => import('./pages/Contas'), () => import('./pages/Cartoes'), () => import('./pages/APagar'),
  () => import('./pages/Orcamentos'), () => import('./pages/Metas'), () => import('./pages/Calendario'), () => import('./pages/Relatorios'),
  () => import('./pages/Configuracoes'),
]
function preCarregar() {
  const ir = () => paginas.forEach(f => f().catch(() => {}))
  if ('requestIdleCallback' in window) (window as unknown as { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(ir)
  else setTimeout(ir, 1500)
}

function Carregando() {
  return (
    <div className="space-y-6">
      <Esqueleto className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Esqueleto key={i} className="h-28" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><Esqueleto className="h-80 lg:col-span-2" /><Esqueleto className="h-80" /></div>
    </div>
  )
}

function Rotas() {
  const { carregando, erro, recarregar, banco } = useDados()
  useEffect(() => { if (!carregando) preCarregar() }, [carregando])
  if (carregando) return <Layout><Carregando /></Layout>
  if (erro && !banco.config && !banco.contas.length)
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div><p className="titulo text-2xl">Não foi possível carregar seus dados</p><p className="mt-2 text-sm text-taupe">{erro}</p>
          <Botao className="mt-5" variante="primario" onClick={() => recarregar()}>Tentar de novo</Botao></div>
      </div>
    )
  return (
    <Layout>
      {erro && <div role="alert" className="mb-4 rounded-xl bg-despesa-fundo px-4 py-2.5 text-sm text-despesa">{erro} <button className="ml-2 underline" onClick={() => recarregar()}>Tentar de novo</button></div>}
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transacoes" element={<Transacoes />} />
          <Route path="/contas" element={<Contas />} />
          <Route path="/cartoes" element={<Cartoes />} />
          <Route path="/a-pagar" element={<APagar />} />
          <Route path="/orcamentos" element={<Orcamentos />} />
          <Route path="/metas" element={<Metas />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [titular, setTitular] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const uid = sessao?.user.id
  useEffect(() => {
    if (!uid) { setTitular(null); return }
    supabase.from('fin_titulares').select('user_id').eq('user_id', uid).maybeSingle()
      .then(({ data, error }) => setTitular(error ? true /* deixa o RLS decidir; a tela mostra o erro */ : !!data))
  }, [uid])

  if (sessao === undefined || (sessao && titular === null))
    return <div className="grid min-h-dvh place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-borda border-t-vinho" /></div>
  if (!sessao) return <Entrar />
  if (!titular) return <SemAcesso email={sessao.user.email ?? ''} />
  return (
    <DadosProvider key={uid}>
      <Rotas />
    </DadosProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AvisosProvider>
        <App />
      </AvisosProvider>
    </BrowserRouter>
  </StrictMode>,
)
