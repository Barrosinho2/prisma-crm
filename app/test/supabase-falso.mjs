// Supabase simulado em memória, só para testes de interface com Playwright.
// Imita as rotas de auth, REST (PostgREST) e as funções RPC usadas pelo app.
import { randomUUID } from 'node:crypto'

const HOJE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const data = (a, m, d) => new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10)
const partes = s => s.split('-').map(Number)
const ultimo = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate()
const diaNoMes = (iso, d) => { const [a, m] = partes(iso); return data(a, m, Math.min(d, ultimo(a, m))) }
const inicioMes = iso => iso.slice(0, 8) + '01'
const somaMeses = (iso, n) => { const [a, m] = partes(iso); const t = new Date(Date.UTC(a, m - 1 + n, 1)); return t.toISOString().slice(0, 10) }

export function criarFalso({ email = 'rafael@teste.com', senha = 'senha-teste-123' } = {}) {
  const uid = randomUUID()
  const db = {}
  const T = n => (db[n] ??= [])
  db.fin_titulares = [{ user_id: uid }]
  const padroes = {
    fin_contas: () => ({ saldo_inicial_cents: 0, data_saldo_inicial: HOJE(), cor: null, ordem: 0, arquivada: false }),
    fin_categorias: () => ({ icone: 'circle', cor: '#875364', ordem: 0, oculta: false, essencial: false }),
    fin_cartoes: () => ({ instituicao: null, conta_pagamento_id: null, cor: '#621F32', arquivado: false }),
    fin_recorrencias: () => ({ parcelas_anteriores: 0, categoria_id: null, conta_id: null, cartao_id: null, forma_pagamento: null, fim: null, ativa: true, essencial: false, obs: null }),
    fin_lancamentos: () => ({ data_efetiva: null, status: 'pendente', categoria_id: null, conta_id: null, cartao_id: null, compra_id: null, forma_pagamento: null, recorrencia_id: null, competencia: null, obs: null }),
    fin_transferencias: () => ({ descricao: null, cancelada: false }),
    fin_pagamentos_fatura: () => ({ cancelado: false }),
    fin_metas: () => ({ prazo: null, conta_id: null, emergencia: false, meses_alvo: null, icone: 'target', arquivada: false }),
    fin_movimentos_meta: () => ({ conta_id: null, obs: null, cancelado: false }),
    fin_orcamentos: () => ({}),
    fin_config: () => ({ nome: null, dia_salario: null, objetivo_economia_cents: 0, essenciais_cents: null, moeda: 'BRL', ocultar_valores: false, alerta_dias: 3, alertas_ativos: true, onboarding: {} }),
  }
  const novo = (t, o) => ({ id: randomUUID(), user_id: uid, criado_em: new Date().toISOString(), ...(padroes[t]?.() ?? {}), ...o })

  function registrarCompra({ p_id, p_cartao, p_descricao, p_total_cents, p_parcelas, p_data, p_categoria = null, p_obs = null, p_ja_pagas = 0 }) {
    if (T('fin_compras').some(c => c.id === p_id)) return p_id
    const c = T('fin_cartoes').find(x => x.id === p_cartao)
    if (!c) throw { code: '22023', message: 'Cartão não encontrado.' }
    T('fin_compras').push(novo('fin_compras', { id: p_id, cartao_id: p_cartao, descricao: p_descricao, valor_total_cents: p_total_cents, parcelas: p_parcelas, data_compra: p_data, categoria_id: p_categoria, obs: p_obs, cancelada: false, parcelas_pagas_antes: p_ja_pagas }))
    let fech = diaNoMes(p_data, c.dia_fechamento)
    if (p_data >= fech) fech = diaNoMes(somaMeses(inicioMes(p_data), 1), c.dia_fechamento)
    const base = Math.floor(p_total_cents / p_parcelas), resto = p_total_cents - base * p_parcelas
    for (let i = p_ja_pagas; i < p_parcelas; i++) {
      const m = somaMeses(inicioMes(fech), i)
      const f = diaNoMes(m, c.dia_fechamento)
      const v = c.dia_vencimento > c.dia_fechamento ? diaNoMes(m, c.dia_vencimento) : diaNoMes(somaMeses(m, 1), c.dia_vencimento)
      let fat = T('fin_faturas').find(x => x.cartao_id === p_cartao && x.vencimento === v)
      if (!fat) { fat = novo('fin_faturas', { cartao_id: p_cartao, fechamento: f, vencimento: v }); T('fin_faturas').push(fat) }
      T('fin_parcelas').push(novo('fin_parcelas', { compra_id: p_id, fatura_id: fat.id, numero: i + 1, valor_cents: base + (i === 0 ? resto : 0), competencia: somaMeses(inicioMes(p_data), i) }))
    }
    return p_id
  }

  const rpcs = {
    fin_iniciar() {
      if (!T('fin_config').length) T('fin_config').push(novo('fin_config', {}))
      if (!T('fin_categorias').length) [['Moradia', 'home', true], ['Alimentação', 'utensils', true], ['Transporte', 'car', true], ['Lazer', 'sparkles', false], ['Assinaturas', 'repeat', false], ['Outros', 'circle', false]]
        .forEach(([n, i, e], k) => T('fin_categorias').push(novo('fin_categorias', { nome: n, tipo: 'despesa', icone: i, essencial: e, ordem: k + 1, cor: ['#621F32', '#875364', '#9C6B4E', '#B0855B', '#7A6A8C', '#817678'][k] })))
      if (!T('fin_categorias').some(c => c.tipo === 'receita')) T('fin_categorias').push(novo('fin_categorias', { nome: 'Salário', tipo: 'receita', icone: 'briefcase', ordem: 1, cor: '#4E7A5E' }))
      return null
    },
    fin_gerar_previsoes() {
      const lim = somaMeses(inicioMes(HOJE()), 2); let n = 0
      for (const r of T('fin_recorrencias')) {
        if (!r.ativa) continue
        for (let m = inicioMes(r.inicio); m < lim; m = somaMeses(m, 1)) {
          const d = diaNoMes(m, r.dia)
          if (d < r.inicio || (r.fim && d > r.fim)) continue
          if (T('fin_lancamentos').some(l => l.recorrencia_id === r.id && l.competencia === m)) continue
          T('fin_lancamentos').push(novo('fin_lancamentos', { tipo: r.tipo, descricao: r.nome, valor_cents: r.valor_cents, data_prevista: d, categoria_id: r.categoria_id, conta_id: r.conta_id, cartao_id: r.cartao_id, forma_pagamento: r.forma_pagamento, recorrencia_id: r.id, competencia: m }))
          n++
        }
      }
      return n
    },
    fin_aplicar_recorrencia({ p_id }) {
      const r = T('fin_recorrencias').find(x => x.id === p_id)
      for (const l of T('fin_lancamentos')) if (l.recorrencia_id === p_id && l.status === 'pendente' && l.competencia >= inicioMes(HOJE()))
        Object.assign(l, r.ativa ? { descricao: r.nome, valor_cents: r.valor_cents, data_prevista: diaNoMes(l.competencia, r.dia), conta_id: r.conta_id, categoria_id: r.categoria_id } : { status: 'cancelado' })
      return 1
    },
    fin_registrar_compra: registrarCompra,
    fin_registrar_compra_em_andamento: registrarCompra,
    fin_confirmar({ p_id, p_data, p_valor_cents = null, p_conta = null }) {
      const l = T('fin_lancamentos').find(x => x.id === p_id)
      if (l.status === 'efetivado') return 'ja_efetivado'
      if (l.cartao_id && l.tipo === 'despesa') {
        const cid = randomUUID()
        registrarCompra({ p_id: cid, p_cartao: l.cartao_id, p_descricao: l.descricao, p_total_cents: p_valor_cents ?? l.valor_cents, p_parcelas: 1, p_data, p_categoria: l.categoria_id })
        Object.assign(l, { status: 'efetivado', data_efetiva: p_data, compra_id: cid, valor_cents: p_valor_cents ?? l.valor_cents })
      } else Object.assign(l, { status: 'efetivado', data_efetiva: p_data, conta_id: p_conta ?? l.conta_id, valor_cents: p_valor_cents ?? l.valor_cents })
      return 'efetivado'
    },
    fin_desfazer({ p_id }) {
      const l = T('fin_lancamentos').find(x => x.id === p_id)
      if (l.compra_id) T('fin_compras').find(c => c.id === l.compra_id).cancelada = true
      Object.assign(l, { status: 'pendente', data_efetiva: null, compra_id: null })
      return null
    },
  }

  const filtros = url => {
    const f = []
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
      const m = v.match(/^eq\.(.*)$/)
      if (m) f.push(r => String(r[k]) === m[1])
    }
    return r => f.every(fn => fn(r))
  }

  const json = (status, body, headers = {}) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: body === undefined ? '' : JSON.stringify(body) })
  const usuario = { id: uid, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
  let logado = false

  async function tratar(route) {
    const req = route.request()
    const url = new URL(req.url())
    const metodo = req.method()
    if (metodo === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    const corpo = req.postData() ? JSON.parse(req.postData()) : null
    const p = url.pathname
    try {
      if (p === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'password' && (corpo.email !== email || corpo.password !== senha))
          return route.fulfill(json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' }))
        logado = true
        return route.fulfill(json(200, { access_token: 'tok-' + uid, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ref', user: usuario }))
      }
      if (p === '/auth/v1/user') return route.fulfill(metodo === 'PUT' ? json(200, usuario) : json(200, usuario))
      if (p === '/auth/v1/logout') { logado = false; return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }) }
      if (p.startsWith('/rest/v1/rpc/')) {
        const nome = p.split('/').pop()
        const r = rpcs[nome](corpo ?? {})
        return route.fulfill(json(200, r))
      }
      if (p.startsWith('/rest/v1/')) {
        const t = p.split('/').pop()
        const tab = T(t)
        const objeto = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
        if (metodo === 'GET' || metodo === 'HEAD') {
          let rows = tab.filter(filtros(url))
          const off = +(url.searchParams.get('offset') ?? 0), lim = url.searchParams.get('limit')
          rows = rows.slice(off, lim ? off + +lim : undefined)
          if (objeto) return rows.length === 1 ? route.fulfill(json(200, rows[0])) : rows.length === 0 ? route.fulfill(json(406, { code: 'PGRST116', message: 'no rows' })) : route.fulfill(json(406, {}))
          return route.fulfill(json(200, rows))
        }
        if (metodo === 'POST') {
          const prefer = req.headers()['prefer'] ?? ''
          const conflito = (url.searchParams.get('on_conflict') ?? 'id').split(',')
          const linhas = Array.isArray(corpo) ? corpo : [corpo]
          for (const l of linhas) {
            const ex = tab.find(r => conflito.every(c => (c === 'user_id' ? r.user_id === uid : r[c] === l[c])))
            if (ex) { if (prefer.includes('merge-duplicates')) Object.assign(ex, l); continue }
            if (t === 'fin_movimentos_meta' && l.tipo === 'retirada') {
              const g = T('fin_movimentos_meta').filter(m => m.meta_id === l.meta_id && !m.cancelado).reduce((a, m) => a + (m.tipo === 'aporte' ? m.valor_cents : -m.valor_cents), 0)
              if (l.valor_cents > g) return route.fulfill(json(400, { code: 'P0001', message: 'A meta não tem esse valor guardado.' }))
            }
            tab.push(t === 'fin_config' ? { ...padroes.fin_config(), user_id: uid, ...l } : novo(t, l))
          }
          return route.fulfill(json(201, prefer.includes('return=representation') ? linhas : undefined))
        }
        if (metodo === 'PATCH') {
          const rows = tab.filter(filtros(url))
          rows.forEach(r => Object.assign(r, corpo))
          return route.fulfill(json(200, (req.headers()['prefer'] ?? '').includes('representation') ? rows : undefined))
        }
        if (metodo === 'DELETE') {
          const f = filtros(url)
          let n = 0
          for (let i = tab.length - 1; i >= 0; i--) {
            if (!f(tab[i])) continue
            const r = tab[i]
            const usado = t === 'fin_contas' && (T('fin_lancamentos').some(l => l.conta_id === r.id) || T('fin_transferencias').some(x => x.origem_id === r.id || x.destino_id === r.id))
            if (usado) return route.fulfill(json(409, { code: '23503', message: 'update or delete on table violates foreign key constraint' }))
            if (t === 'fin_lancamentos' && (r.status === 'efetivado' || r.recorrencia_id)) continue
            tab.splice(i, 1); n++
          }
          return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'content-range': `*/${n}` } })
        }
      }
      return route.fulfill(json(404, { message: 'rota não simulada: ' + p }))
    } catch (e) {
      return route.fulfill(json(400, { code: e.code ?? 'XX000', message: e.message ?? String(e) }))
    }
  }
  return { tratar, db, uid, email, senha, get logado() { return logado } }
}
