import { useState } from 'react'
import { motion } from 'motion/react'
import * as L from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Botao, Campo, Entrada } from '../components/ui'

export function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setOcupado(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setOcupado(false)
    if (error) setErro(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : /fetch|network/i.test(error.message) ? 'Sem conexão. Tente de novo.' : error.message)
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-vinho-escuro lg:block">
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
          <defs><pattern id="g" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0v56" fill="none" stroke="#F8F5F0" strokeWidth=".6" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#g)" />
        </svg>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute -right-40 top-1/2 h-[560px] w-[560px] -translate-y-1/2 rounded-full border border-[#C9A9B3]/25">
          <div className="absolute inset-16 rounded-full border border-[#C9A9B3]/20" />
          <div className="absolute inset-36 rounded-full border border-[#C9A9B3]/15" />
        </motion.div>
        <div className="relative flex h-full flex-col justify-between p-14">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="h-10 w-10"><rect width="40" height="40" rx="11" fill="#621F32" /><circle cx="20" cy="20" r="9.5" fill="none" stroke="#F8F5F0" strokeWidth="1.8" /><circle cx="20" cy="20" r="5" fill="none" stroke="#C9A9B3" strokeWidth="1.2" /></svg>
            <p className="titulo text-xl text-marfim">Finanças <span className="font-sans text-xs uppercase tracking-[0.22em] text-[#C9A9B3]">pessoais</span></p>
          </div>
          <div className="max-w-md">
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.8 }}
              className="titulo text-[44px] leading-[1.1] text-marfim">Seu dinheiro, suas decisões, seu futuro.</motion.h1>
            <p className="mt-5 text-[15px] leading-relaxed text-[#CDB9BF]">Saiba quanto você tem, quanto pode gastar, quanto precisa pagar e quanto está conseguindo guardar.</p>
          </div>
          <p className="text-xs text-[#CDB9BF]/70">Dados protegidos e visíveis só para você.</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <motion.form onSubmit={entrar} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <svg viewBox="0 0 40 40" className="mb-6 h-11 w-11"><rect width="40" height="40" rx="11" fill="#621F32" /><circle cx="20" cy="20" r="9.5" fill="none" stroke="#F8F5F0" strokeWidth="1.8" /><circle cx="20" cy="20" r="5" fill="none" stroke="#C9A9B3" strokeWidth="1.2" /></svg>
          </div>
          <h2 className="titulo text-[32px] text-carvao">Bem-vindo de volta.</h2>
          <p className="mt-2 text-[15px] text-taupe">Entre para ver suas finanças.</p>
          <div className="mt-8 space-y-4">
            <Campo rotulo="E-mail"><Entrada type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus /></Campo>
            <Campo rotulo="Senha">
              <div className="relative">
                <Entrada type={ver ? 'text' : 'password'} autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} className="pr-11" />
                <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 text-taupe hover:text-carvao">
                  {ver ? <L.EyeOff className="h-4 w-4" /> : <L.Eye className="h-4 w-4" />}
                </button>
              </div>
            </Campo>
          </div>
          {erro && <p role="alert" className="mt-4 rounded-xl bg-despesa-fundo px-3 py-2 text-sm text-despesa">{erro}</p>}
          <Botao type="submit" variante="primario" tamanho="lg" carregando={ocupado} className="mt-6 w-full">Entrar</Botao>
        </motion.form>
      </div>
    </div>
  )
}

export function SemAcesso({ email }: { email: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-borda bg-cartao"><L.Lock className="h-5 w-5 text-vinho-suave" /></div>
        <h1 className="titulo text-2xl">Acesso não liberado</h1>
        <p className="mt-2 text-sm text-taupe">A conta <b className="text-carvao">{email}</b> não tem acesso a este sistema de finanças pessoais.</p>
        <Botao className="mt-6" onClick={() => supabase.auth.signOut()}>Sair</Botao>
      </div>
    </div>
  )
}
