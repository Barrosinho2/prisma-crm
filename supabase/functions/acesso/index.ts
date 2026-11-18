// Acesso dos sócios ao Prisma CRM.
//   { acao: 'primeiro-acesso', codigo, email, senha }  → cria (ou troca) a senha de quem tem um código válido
//   { acao: 'convite', socio }                          → um sócio logado gera um código novo (para o outro, ou para trocar senha)
// O código vale uma vez, por 7 dias, e fica guardado só como hash sha-256.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const SOCIOS = ['rafael', 'pedro'];
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function normalizaCodigo(s: unknown): string | null {
  const t = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.length === 12 ? `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}` : null;
}
async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function novoCodigo(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  let c = '';
  for (let i = 0; i < 12; i++) {
    c += ALFABETO[b[i] % ALFABETO.length];
    if (i === 3 || i === 7) c += '-';
  }
  return c;
}
function erroDeSenha(e: { code?: string; message?: string } | null): string {
  const m = `${e?.code ?? ''} ${e?.message ?? ''}`.toLowerCase();
  if (m.includes('weak') || m.includes('password')) return 'senha_fraca';
  if (m.includes('already') || m.includes('exists') || m.includes('registered')) return 'email_em_uso';
  return 'conta';
}

async function usuarioPorEmail(email: string) {
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email ?? '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function primeiroAcesso(corpo: Record<string, unknown>) {
  const codigo = normalizaCodigo(corpo.codigo);
  const email = String(corpo.email ?? '').trim().toLowerCase();
  const senha = String(corpo.senha ?? '');
  if (!codigo) return resposta(400, { erro: 'codigo' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return resposta(400, { erro: 'email' });
  if (senha.length < 8 || senha.length > 72) return resposta(400, { erro: 'senha' });

  const { data: m, error } = await admin
    .from('membros')
    .select('socio, user_id, email, convite_expira')
    .eq('convite_hash', await sha256(codigo))
    .maybeSingle();
  if (error) return resposta(500, { erro: 'interno' });
  if (!m || !m.convite_expira || new Date(m.convite_expira).getTime() < Date.now()) return resposta(400, { erro: 'codigo' });

  const { data: outro } = await admin.from('membros').select('socio').eq('email', email).neq('socio', m.socio).maybeSingle();
  if (outro) return resposta(400, { erro: 'email_em_uso' });

  let uid: string | null = m.user_id;
  if (uid) {
    // já tinha conta: o código serve para trocar a senha (e o e-mail, se mudou)
    const { error: e } = await admin.auth.admin.updateUserById(uid, { email, password: senha, email_confirm: true });
    if (e) return resposta(400, { erro: erroDeSenha(e) });
  } else {
    const { data: criado, error: e } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (criado?.user) uid = criado.user.id;
    else {
      if (erroDeSenha(e) === 'senha_fraca') return resposta(400, { erro: 'senha_fraca' });
      // já existe uma conta com esse e-mail: reaproveita
      const u = await usuarioPorEmail(email);
      if (!u) return resposta(400, { erro: 'conta' });
      const { error: e2 } = await admin.auth.admin.updateUserById(u.id, { password: senha, email_confirm: true });
      if (e2) return resposta(400, { erro: erroDeSenha(e2) });
      uid = u.id;
    }
  }
  const { error: e3 } = await admin
    .from('membros')
    .update({ user_id: uid, email, convite_hash: null, convite_expira: null, atualizado_em: new Date().toISOString() })
    .eq('socio', m.socio);
  if (e3) return resposta(500, { erro: e3.code === '23505' ? 'email_em_uso' : 'interno' });
  return resposta(200, { ok: true, socio: m.socio });
}

async function convite(req: Request, corpo: Record<string, unknown>) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u, error } = await admin.auth.getUser(token);
  if (error || !u?.user) return resposta(401, { erro: 'sessao' });
  const { data: eu } = await admin.from('membros').select('socio').eq('user_id', u.user.id).maybeSingle();
  if (!eu) return resposta(403, { erro: 'sem_acesso' });
  const socio = String(corpo.socio ?? '');
  if (!SOCIOS.includes(socio)) return resposta(400, { erro: 'socio' });
  const codigo = novoCodigo();
  const expira = new Date(Date.now() + VALIDADE_MS).toISOString();
  const { error: e } = await admin
    .from('membros')
    .update({ convite_hash: await sha256(codigo), convite_expira: expira, atualizado_em: new Date().toISOString() })
    .eq('socio', socio);
  if (e) return resposta(500, { erro: 'interno' });
  return resposta(200, { codigo, expira });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { erro: 'metodo' });
  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return resposta(400, { erro: 'corpo' });
  }
  try {
    if (corpo.acao === 'primeiro-acesso') return await primeiroAcesso(corpo);
    if (corpo.acao === 'convite') return await convite(req, corpo);
    return resposta(400, { erro: 'acao' });
  } catch (e) {
    console.error('acesso', e);
    return resposta(500, { erro: 'interno' });
  }
});
