// Exporta o banco do Prisma CRM no mesmo formato do "Exportar backup" do app
// (dá para restaurar em Ajustes → Importar backup).
// Só responde para a rotina de backup do repositório Barrosinho2/prisma-crm no GitHub Actions:
// ela se identifica com o token OIDC do próprio GitHub, então não existe senha guardada em lugar nenhum.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const REPO = 'Barrosinho2/prisma-crm';
const PUBLICO = 'prisma-crm-backup';
const COLS = ['leads', 'clientes', 'projetos', 'lancamentos', 'recorrencias', 'tarefas'];
const JWKS = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405, { erro: 'metodo' });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: 'https://token.actions.githubusercontent.com', audience: PUBLICO });
    if (String(payload.repository).toLowerCase() !== REPO.toLowerCase()) return resposta(403, { erro: 'repositorio' });
  } catch {
    return resposta(401, { erro: 'token' });
  }

  const linhas: { col: string; id: string; data: Record<string, unknown>; versao: number; atualizado_em: string }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from('docs').select('col,id,data,versao,atualizado_em').order('col').order('id').range(de, de + 999);
    if (error) return resposta(500, { erro: 'banco' });
    linhas.push(...data);
    if (data.length < 1000) break;
  }
  const saida: Record<string, unknown> = { app: 'prisma-crm', versao: 1, exportadoEm: new Date().toISOString(), documentos: linhas.length };
  for (const c of COLS) saida[c] = linhas.filter((l) => l.col === c).map((l) => ({ ...l.data, id: l.id }));
  saida.config = linhas.find((l) => l.col === 'config' && l.id === 'geral')?.data ?? null;
  // tudo o que não é coleção do app (piloto automático etc.), para restauração completa pelo SQL
  saida.outros = linhas.filter((l) => !COLS.includes(l.col) && !(l.col === 'config' && l.id === 'geral'));
  return resposta(200, saida);
});
