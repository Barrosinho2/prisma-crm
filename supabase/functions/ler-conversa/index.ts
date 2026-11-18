// Lê uma conversa do WhatsApp com o Claude (API da Anthropic) e devolve o JSON do lead.
// Só para sócios logados. Sem a chave ANTHROPIC_API_KEY nos segredos do projeto, responde 501
// e o CRM preenche o básico sozinho, sem IA.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MODELO = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function extrairJson(txt: string): unknown {
  const t = txt.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch { /* segue */ }
    }
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { code: 'method' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u, error } = await admin.auth.getUser(token);
  if (error || !u?.user) return resposta(401, { code: 'session_expired' });
  const { data: eu } = await admin.from('membros').select('socio').eq('user_id', u.user.id).maybeSingle();
  if (!eu) return resposta(403, { code: 'not_granted' });

  let corpo: { prompt?: unknown; ping?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return resposta(400, { code: 'invalid_argument' });
  }
  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (corpo.ping) return resposta(200, { ativo: !!chave });
  if (!chave) return resposta(501, { code: 'sampling_disabled' });
  const prompt = corpo.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 80000) return resposta(400, { code: 'invalid_argument' });

  let r: Response;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2048,
        system: 'Você preenche o CRM de uma empresa a partir de conversas comerciais. Responda somente com um objeto JSON válido, sem texto antes ou depois e sem cercas de código.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (e) {
    console.error('anthropic indisponível', e);
    return resposta(503, { code: 'unavailable' });
  }
  if (r.status === 429 || r.status === 529) return resposta(429, { code: 'rate_limited' });
  if (r.status === 401 || r.status === 403) return resposta(502, { code: 'bad_key' });
  if (!r.ok) return resposta(502, { code: 'upstream', status: r.status });
  const saida = await r.json();
  const texto = (saida.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  const json = extrairJson(texto);
  if (json === undefined) return resposta(502, { code: 'bad_output' });
  return resposta(200, { json });
});
