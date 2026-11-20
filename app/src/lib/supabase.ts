import { createClient } from '@supabase/supabase-js'

// Chaves públicas (publishable). A proteção dos dados é feita no banco
// por Row Level Security: cada usuário só acessa as próprias linhas.
const url = import.meta.env.VITE_SUPABASE_URL as string
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !chave) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).')
}

export const supabase = createClient(url, chave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'financas-auth' },
})

/** Traduz erros do banco para mensagens claras. */
export function mensagemErro(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string } | null
  const msg = err?.message ?? String(e)
  const code = err?.code ?? ''
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
  if (code === '23503') {
    if (/delete|update or delete/i.test(msg)) return 'Este item está sendo usado em lançamentos. Arquive ou oculte em vez de excluir.'
    return 'Um dos itens escolhidos não existe mais. Recarregue a página.'
  }
  if (code === '23505') return /categorias_nome/.test(msg) ? 'Já existe uma categoria com esse nome.' : /emergencia/.test(msg) ? 'Já existe uma reserva de emergência ativa.' : 'Este registro já foi salvo.'
  if (code === '23514') return 'Algum valor está fora do permitido. Confira os campos.'
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) return 'Sem permissão para esta ação.'
  if (code === 'PGRST301' || /JWT/i.test(msg)) return 'Sua sessão expirou. Entre novamente.'
  if (code === '22023' || code === 'P0001') return msg
  return msg.length < 140 ? msg : 'Não foi possível concluir. Tente novamente.'
}
