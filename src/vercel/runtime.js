/* Prisma CRM na Vercel.
   Faz o login dos sócios (Supabase Auth) e entrega ao app a mesma interface que ele usa dentro do Claude
   (window.claude.use('db' | 'user' | 'downloads' | 'sample')), agora sobre o Postgres do Supabase,
   com tempo real. O app só começa (window.__prismaBoot) depois que a conta é confirmada como sócia. */
(function () {
  'use strict';

  const CFG = window.PRISMA_CFG || {};
  const SOCIOS = ['rafael', 'pedro'];
  const APAGADO = Symbol('apagado');
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const ehObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const comCodigo = (code, extra) => Object.assign(new Error(code), { code }, extra || {});

  if (!window.supabase || !CFG.url || !CFG.key) {
    document.body.innerHTML = '<p style="padding:24px;font:16px system-ui">Configuração do CRM incompleta.</p>';
    return;
  }
  const sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'prisma-crm-auth' },
  });

  let CONTA = null; // { uid, email, socio }
  let iniciado = false;
  let banco = null;

  /* ───────────── erros ───────────── */
  const ehErroDeRede = (msg) => /fetch|network|load failed|conex/i.test(String(msg || ''));
  function erroBanco(e, status) {
    const msg = (e && (e.message || e.details)) || 'erro';
    let code = 'internal';
    if (!status || ehErroDeRede(msg)) code = 'unavailable';
    else if (status === 401) code = 'unavailable';
    else if ((e && e.code === '42501') || status === 403) code = 'revoked';
    else if (status === 429) code = 'resource_exhausted';
    else if (status >= 500) code = 'unavailable';
    else if (status >= 400) code = 'invalid_argument';
    return comCodigo(code, { message: msg, status, pg: e && e.code });
  }

  /* ───────────── funções do servidor (Edge Functions) ───────────── */
  async function chamarFuncao(nome, corpo, logado, signal) {
    const headers = { 'Content-Type': 'application/json', apikey: CFG.key };
    if (logado) {
      const { data } = await sb.auth.getSession();
      if (data && data.session) headers.Authorization = 'Bearer ' + data.session.access_token;
    }
    let r;
    try {
      r = await fetch(`${CFG.url}/functions/v1/${nome}`, { method: 'POST', headers, body: JSON.stringify(corpo), signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw comCodigo('cancelled');
      throw comCodigo('rede');
    }
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (!r.ok) throw comCodigo((j && (j.erro || j.code)) || 'http', { status: r.status });
    return j || {};
  }

  /* ───────────── banco: coleções e documentos sobre a tabela docs ───────────── */
  function criarBanco() {
    const srv = new Map(); // caminho → { data, v }: o que o servidor tem
    const otm = new Map(); // caminho → { n, val }: escritas em andamento (aparecem na hora)
    const visto = new Map(); // caminho → marca da última mudança vista aqui
    const tumbas = new Map(); // caminho → { s: marca, t: ms } de quando foi apagado
    // a ordem dos acontecimentos usa um contador (não o relógio, que pode voltar ou pular)
    let seq = 0;
    const marca = () => ++seq;
    const agoraMs = () => performance.now();
    const porCol = new Map(); // coleção → caminhos conhecidos
    const ouvCol = new Map();
    const ouvDoc = new Map();
    const sujosCol = new Set();
    const sujosDoc = new Set();
    const ouvConexao = new Set();
    let pronto = false;
    let agendado = false;
    let carregando = null;
    let ultimaCarga = 0;
    let aoVivo = false;
    let jaInscrito = false;

    const colDe = (p) => p.slice(0, p.lastIndexOf('/'));
    const idDe = (p) => p.slice(p.lastIndexOf('/') + 1);
    const caminhoPrefs = () => `data/users/${CONTA.uid}/prefs`;
    const chamar = (fn, arg) => { try { fn(arg); } catch (e) { console.error(e); } };

    function indexar(p) {
      const c = colDe(p);
      let s = porCol.get(c);
      if (!s) porCol.set(c, (s = new Set()));
      s.add(p);
    }
    function ver(p) {
      const o = otm.get(p);
      if (o && 'val' in o) return o.val === APAGADO ? null : o.val;
      const s = srv.get(p);
      return s ? s.data : null;
    }
    function marcar(p) {
      indexar(p);
      sujosCol.add(colDe(p));
      sujosDoc.add(p);
      if (!agendado) {
        agendado = true;
        queueMicrotask(descarregar);
      }
    }
    function snapDoc(p, d) {
      return { id: idDe(p), ref: { path: p }, exists: !!d, data: () => (d ? clone(d) : undefined), metadata: { fromCache: false, hasPendingWrites: otm.has(p) } };
    }
    function snapCol(c) {
      const docs = [];
      let pend = false;
      for (const p of porCol.get(c) || []) {
        if (otm.has(p)) pend = true;
        const d = ver(p);
        if (d) docs.push(snapDoc(p, d));
      }
      return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn), metadata: { fromCache: false, hasPendingWrites: pend } };
    }
    function descarregar() {
      agendado = false;
      if (!pronto) return;
      const cols = [...sujosCol];
      const docs = [...sujosDoc];
      sujosCol.clear();
      sujosDoc.clear();
      for (const c of cols) for (const o of ouvCol.get(c) || []) chamar(o.ok, snapCol(c));
      for (const p of docs) for (const o of ouvDoc.get(p) || []) chamar(o.ok, snapDoc(p, ver(p)));
    }
    function ouvir(mapa, chave, ok, err, snap) {
      const o = { ok, err: err || (() => {}) };
      let s = mapa.get(chave);
      if (!s) mapa.set(chave, (s = new Set()));
      s.add(o);
      if (pronto) queueMicrotask(() => { if (s.has(o)) chamar(ok, snap()); });
      return () => s.delete(o);
    }

    /* carga completa: na entrada, ao reconectar e de tempos em tempos */
    function aplicarLista(linhas, inicio) {
      const presentes = new Set();
      for (const r of linhas) {
        const p = r.col + '/' + r.id;
        presentes.add(p);
        const tumba = tumbas.get(p);
        if (tumba && tumba.s > inicio) continue; // apagado depois que a busca começou
        const s = srv.get(p);
        const tocado = (visto.get(p) || 0) > inicio;
        if (s && tocado && r.versao < s.v) continue; // já chegou uma versão mais nova
        if (s && s.v === r.versao && igual(s.data, r.data)) continue;
        srv.set(p, { data: r.data, v: r.versao });
        marcar(p);
      }
      for (const p of [...srv.keys()]) {
        if (presentes.has(p) || (visto.get(p) || 0) > inicio) continue;
        srv.delete(p);
        marcar(p);
      }
      const velho = agoraMs() - 10 * 60000;
      for (const [p, t] of tumbas) if (t.t < velho) tumbas.delete(p);
    }
    function carregar() {
      if (carregando) return carregando;
      carregando = (async () => {
        const inicio = marca();
        const linhas = [];
        for (let de = 0; ; de += 1000) {
          const r = await sb.from('docs').select('col,id,data,versao').order('col').order('id').range(de, de + 999);
          if (r.error) throw erroBanco(r.error, r.status);
          linhas.push(...r.data);
          if (r.data.length < 1000) break;
        }
        aplicarLista(linhas, inicio);
        ultimaCarga = agoraMs();
        if (!pronto) {
          pronto = true;
          for (const c of ouvCol.keys()) sujosCol.add(c);
          for (const p of ouvDoc.keys()) sujosDoc.add(p);
          descarregar();
        }
      })();
      const atual = carregando;
      atual.finally(() => { if (carregando === atual) carregando = null; }).catch(() => {});
      return atual;
    }
    const recarregarQuieto = () => carregar().catch((e) => console.warn('recarregar', e));
    async function carregarComInsistencia() {
      for (let t = 0; ; t++) {
        try {
          await carregar();
          return;
        } catch (e) {
          console.warn('carregar dados', e);
          await sleep(Math.min(30000, 1000 * 2 ** t));
        }
      }
    }

    /* tempo real: uma inscrição na tabela inteira; a política de acesso filtra no servidor */
    function definirAoVivo(v) {
      if (aoVivo === v) return;
      aoVivo = v;
      ouvConexao.forEach((fn) => chamar(fn, v));
    }
    function aoMudarRemoto(payload) {
      const agora = marca();
      if (payload.eventType === 'DELETE') {
        const o = payload.old || {};
        if (o.col == null || o.id == null) return;
        const p = o.col + '/' + o.id;
        tumbas.set(p, { s: agora, t: agoraMs() });
        if (!srv.has(p)) return;
        srv.delete(p);
        visto.set(p, agora);
        marcar(p);
        return;
      }
      const r = payload.new || {};
      if (r.col == null || r.id == null) return;
      const p = r.col + '/' + r.id;
      if (!ehObj(r.data)) { buscarUm(p).catch(() => {}); return; } // conteúdo grande ou cortado: busca direto
      const s = srv.get(p);
      if (s && payload.eventType === 'UPDATE' && r.versao <= s.v) return; // já temos esta ou uma mais nova
      // criação atrasada: se não foi apagado no meio, a versão maior que já temos é mais nova
      if (s && payload.eventType === 'INSERT' && (r.versao === s.v ? igual(s.data, r.data) : r.versao < s.v && !tumbas.has(p))) return;
      srv.set(p, { data: r.data, v: r.versao });
      tumbas.delete(p);
      visto.set(p, agora);
      marcar(p);
    }
    function ligarTempoReal() {
      return new Promise((resolve) => {
        let feito = false;
        const fim = () => { if (!feito) { feito = true; resolve(); } };
        setTimeout(fim, 6000);
        sb.channel('prisma-crm-docs')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, aoMudarRemoto)
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              definirAoVivo(true);
              if (jaInscrito) recarregarQuieto(); // voltou depois de cair: busca o que mudou nesse meio tempo
              jaInscrito = true;
              fim();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              definirAoVivo(false);
              fim();
            }
          });
      });
    }

    /* escrita: aparece na hora, confirma no servidor e volta atrás se falhar */
    function mesclar(a, b) {
      if (!ehObj(a) || !ehObj(b)) return clone(b);
      const r = Object.assign({}, a);
      for (const k of Object.keys(b)) r[k] = ehObj(b[k]) && ehObj(r[k]) ? mesclar(r[k], b[k]) : clone(b[k]);
      return r;
    }
    async function escrever(p, tipo, corpo) {
      const col = colDe(p);
      const id = idDe(p);
      const t0 = marca();
      const atual = ver(p);
      const val = tipo === 'set' ? clone(corpo) : tipo === 'update' ? (atual ? mesclar(atual, corpo) : undefined) : APAGADO;
      let o = null;
      if (val !== undefined) {
        o = otm.get(p) || { n: 0 };
        o.n++;
        o.val = val;
        otm.set(p, o);
        visto.set(p, t0);
        marcar(p);
      }
      try {
        let r;
        if (tipo === 'set') r = await sb.from('docs').upsert({ col, id, data: corpo }, { onConflict: 'col,id' }).select('data,versao').single();
        else if (tipo === 'update') r = await sb.rpc('doc_atualiza', { p_col: col, p_id: id, p_dados: corpo });
        else r = await sb.from('docs').delete().eq('col', col).eq('id', id);
        if (r.error) throw erroBanco(r.error, r.status);
        if (tipo === 'delete') {
          srv.delete(p);
          tumbas.set(p, { s: marca(), t: agoraMs() });
        } else {
          const d = r.data;
          if (!d) throw comCodigo('invalid_argument', { message: 'o documento não existe' });
          const s = srv.get(p);
          if (!s || d.versao >= s.v || (visto.get(p) || 0) <= t0) srv.set(p, { data: d.data, v: d.versao });
          tumbas.delete(p);
        }
        visto.set(p, marca());
      } finally {
        if (o) {
          o.n--;
          if (o.n <= 0 && otm.get(p) === o) otm.delete(p);
        }
        marcar(p);
      }
    }
    async function buscarUm(p) {
      const t0 = marca();
      const r = await sb.from('docs').select('data,versao').eq('col', colDe(p)).eq('id', idDe(p)).maybeSingle();
      if (r.error) throw erroBanco(r.error, r.status);
      if (!otm.has(p) && (visto.get(p) || 0) < t0) {
        const s = srv.get(p);
        if (r.data && (!s || s.v !== r.data.versao || !igual(s.data, r.data.data))) {
          srv.set(p, { data: r.data.data, v: r.data.versao });
          marcar(p);
        } else if (!r.data && s) {
          srv.delete(p);
          marcar(p);
        }
      }
      return snapDoc(p, r.data ? r.data.data : null);
    }
    async function pegarTrava(p, opts) {
      const r = await sb.rpc('pega_trava', { p_caminho: p, p_dono: String((opts && opts.holder) || 'aba'), p_ms: Math.round((opts && opts.ttlMs) || 30000) });
      if (r.error) throw erroBanco(r.error, r.status);
      return { acquired: !!r.data };
    }

    /* "quem é você": na Vercel vem da conta, não de uma escolha */
    function refPrefs(p) {
      const dado = () => ({ socio: CONTA.socio });
      const nada = async () => {};
      return {
        id: 'prefs',
        path: p,
        set: nada,
        update: nada,
        delete: nada,
        get: async () => snapDoc(p, dado()),
        onSnapshot: (ok) => {
          queueMicrotask(() => chamar(ok, snapDoc(p, dado())));
          return () => {};
        },
      };
    }
    function ref(p) {
      if (p === caminhoPrefs()) return refPrefs(p);
      return {
        id: idDe(p),
        path: p,
        set: (corpo) => escrever(p, 'set', corpo),
        update: (corpo) => escrever(p, 'update', corpo),
        delete: () => escrever(p, 'delete'),
        get: () => buscarUm(p),
        onSnapshot: (ok, err) => ouvir(ouvDoc, p, ok, err, () => snapDoc(p, ver(p))),
        acquire: (opts) => pegarTrava(p, opts),
      };
    }
    const db = {
      collection: (c) => ({ id: c, path: c, doc: (id) => ref(c + '/' + id), onSnapshot: (ok, err) => ouvir(ouvCol, c, ok, err, () => snapCol(c)) }),
      doc: (p) => ref(p),
    };

    async function iniciar() {
      await ligarTempoReal(); // inscreve antes de buscar, para não perder nada entre uma coisa e outra
      await carregarComInsistencia();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && agoraMs() - ultimaCarga > 30000) recarregarQuieto();
      });
      window.addEventListener('online', recarregarQuieto);
      setInterval(() => { if (!document.hidden) recarregarQuieto(); }, 5 * 60000);
    }

    return {
      db,
      iniciar,
      aoVivo: () => aoVivo,
      aoMudarConexao: (fn) => { ouvConexao.add(fn); return () => ouvConexao.delete(fn); },
      estado: () => ({ pronto, aoVivo, docs: srv.size, pendentes: otm.size }),
      olhar: (p) => clone(ver(p)),
    };
  }

  /* ───────────── downloads e leitura com IA ───────────── */
  function baixar(nome, conteudo) {
    const tipo = /\.csv$/i.test(nome) ? 'text/csv' : /\.json$/i.test(nome) ? 'application/json' : 'application/octet-stream';
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function lerComIA(prompt, opts) {
    try {
      const j = await chamarFuncao('ler-conversa', { prompt }, true, opts && opts.signal);
      return j.json;
    } catch (e) {
      if (e.code === 'cancelled') throw e;
      if (e.status === 501) throw comCodigo('sampling_disabled');
      if (e.status === 429) throw comCodigo('rate_limited');
      if (e.status === 401 || e.status === 403) throw comCodigo('session_expired');
      throw comCodigo('internal');
    }
  }

  /* ───────────── ponte para o app ───────────── */
  function ligarPonte() {
    banco = criarBanco();
    const user = { id: async () => CONTA.uid, can: async () => true };
    const downloads = { save: async ({ filename, data }) => baixar(filename, data) };
    const sample = { json: (prompt, opts) => lerComIA(prompt, opts) };
    window.claude = {
      use: async (nome) => {
        if (nome === 'db') return banco.db;
        if (nome === 'user') return user;
        if (nome === 'downloads') return downloads;
        if (nome === 'sample') return sample;
        throw comCodigo('not_declared');
      },
    };
    window.PrismaHost = {
      tipo: 'vercel',
      endereco: location.origin + '/',
      conta: () => Object.assign({}, CONTA),
      async membros() {
        const r = await sb.from('membros').select('socio,user_id,email,convite_expira');
        if (r.error) throw erroBanco(r.error, r.status);
        return SOCIOS.map((s) => {
          const m = (r.data || []).find((x) => x.socio === s) || {};
          return { socio: s, email: m.email || '', ativo: !!m.user_id, conviteExpira: m.convite_expira || null, eu: m.user_id === CONTA.uid };
        });
      },
      gerarConvite: (socio) => chamarFuncao('acesso', { acao: 'convite', socio }, true),
      async trocarSenha(senha) {
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw comCodigo(error.code || 'erro', { status: error.status, message: error.message });
      },
      async sair() {
        try { await sb.auth.signOut({ scope: 'local' }); } catch { /* sai mesmo assim */ }
        location.reload();
      },
      aoVivo: () => banco.aoVivo(),
      aoMudarConexao: (fn) => banco.aoMudarConexao(fn),
    };
    window.__prismaRuntime = { estado: () => banco.estado(), olhar: (p) => banco.olhar(p), db: banco.db };
    banco.iniciar();
  }

  function iniciarApp() {
    if (iniciado) return;
    iniciado = true;
    ligarPonte();
    const r = $('#auth');
    if (r) r.remove();
    if (temaCedoAplicado) document.documentElement.removeAttribute('data-theme');
    document.body.classList.remove('auth-on');
    window.__prismaBoot();
  }

  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT' && iniciado) setTimeout(() => location.reload(), 50);
  });

  /* ───────────── telas de entrada ───────────── */
  let temaCedoAplicado = false;
  function temaCedo() {
    let t = null;
    try { t = localStorage.getItem('prisma-crm-tema'); } catch { t = null; }
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
      temaCedoAplicado = true;
    }
  }
  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

  const MARCA = '<svg class="mark" viewBox="0 0 40 32" aria-hidden="true"><path class="m-in" d="M1.5 16.5h12.25"/><path class="m-pass" d="M13.75 16.5 25.5 15"/><path class="m-prism" d="M20 4 31 26H9z"/><path class="m-r1" d="M25.5 15 38.5 9"/><path class="m-r2" d="M25.5 15 38.5 15.5"/><path class="m-r3" d="M25.5 15 38.5 22"/></svg>';
  const ARTE = `<svg class="auth-art" viewBox="0 0 480 320" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <path class="a-in" pathLength="1" d="M0 175H137.5"/>
      <path class="a-pass" pathLength="1" d="M137.5 175 255 160"/>
      <path class="a-prism" d="M200 50 310 270H90z"/>
      <path class="a-r a-r1" pathLength="1" d="M255 160 480 56.15"/>
      <path class="a-r a-r2" pathLength="1" d="M255 160 480 168.65"/>
      <path class="a-r a-r3" pathLength="1" d="M255 160 480 281.15"/>
    </svg>`;

  function moldura() {
    const r = $('#auth');
    if (!r.dataset.ok) {
      r.dataset.ok = '1';
      r.innerHTML = `<div class="auth-side">
          <div class="auth-brand">${MARCA}<span class="auth-word"><b>Prisma</b> CRM</span></div>
          ${ARTE}
          <p class="auth-slogan">Diferentes perspectivas.<br>Soluções inteligentes.</p>
        </div>
        <div class="auth-main"><div class="auth-box"></div></div>`;
    }
    return $('.auth-box', r);
  }
  function verSenha(box) {
    box.querySelectorAll('[data-ver]').forEach((b) => {
      b.addEventListener('click', () => {
        const inp = b.parentElement.querySelector('input');
        const mostrar = inp.type === 'password';
        inp.type = mostrar ? 'text' : 'password';
        b.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        b.setAttribute('aria-pressed', String(mostrar));
        b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      });
    });
  }
  function ocupado(btn, sim, txt) {
    if (sim) {
      btn.dataset.txt = btn.textContent;
      btn.textContent = txt;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      btn.textContent = btn.dataset.txt || btn.textContent;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }
  function mostrarErro(box, txt, campo) {
    const p = $('[data-erro]', box);
    p.textContent = txt;
    p.hidden = !txt;
    box.querySelectorAll('.field.bad').forEach((f) => f.classList.remove('bad'));
    if (campo) {
      const inp = $(campo, box);
      if (inp) {
        inp.closest('.field').classList.add('bad');
        inp.focus();
      }
    }
  }
  const SEM_REDE = 'Sem conexão com o servidor do CRM. Confira a internet e tente de novo.';
  function msgLogin(e) {
    const c = String((e && e.code) || '');
    const m = String((e && e.message) || '').toLowerCase();
    if (c === 'invalid_credentials' || m.includes('invalid login')) return 'E-mail ou senha incorretos.';
    if (c === 'email_not_confirmed') return 'Esta conta ainda não foi liberada. Use o código de acesso.';
    if ((e && e.status === 429) || c.includes('rate_limit')) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    if (!e || !e.status || ehErroDeRede(m)) return SEM_REDE;
    return 'Não foi possível entrar agora. Tente de novo em instantes.';
  }
  const MSG_CODIGO = {
    codigo: ['Código inválido ou vencido. Confira as letras ou peça um código novo ao seu sócio.', '#c_codigo'],
    email: ['Confira o e-mail.', '#c_email'],
    senha: ['A senha precisa ter pelo menos 8 caracteres.', '#c_senha'],
    senha_fraca: ['Essa senha é fácil de adivinhar. Use uma mais longa, misturando letras e números.', '#c_senha'],
    email_em_uso: ['Este e-mail já é usado pelo outro sócio. Use o seu.', '#c_email'],
    conta: ['Não foi possível liberar a conta com esse e-mail. Tente outro e-mail ou peça um código novo.', '#c_email'],
    rede: [SEM_REDE, null],
  };

  function telaEntrar(aviso, emailPadrao) {
    const box = moldura();
    box.innerHTML = `
      <h1 class="auth-t">Entrar</h1>
      <p class="auth-d">Use o e-mail e a senha da sua conta.</p>
      ${aviso ? `<p class="auth-aviso" role="alert">${esc(aviso)}</p>` : ''}
      <form class="auth-form" novalidate>
        <div class="field"><label for="a_email">E-mail</label><input id="a_email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required value="${esc(emailPadrao || lsGet('prisma-crm-email'))}"></div>
        <div class="field"><label for="a_senha">Senha</label><div class="auth-pass"><input id="a_senha" type="password" autocomplete="current-password" required><button type="button" class="auth-ver" data-ver aria-pressed="false" aria-label="Mostrar senha">Mostrar</button></div></div>
        <p class="auth-erro" data-erro role="alert" hidden></p>
        <button class="btn btn-primary auth-btn" type="submit">Entrar</button>
      </form>
      <div class="auth-alt">
        <p><b>Primeiro acesso ou esqueceu a senha?</b> Crie a senha com o código de acesso que o seu sócio gerou.</p>
        <button type="button" class="btn" data-ir-codigo>Usar código de acesso</button>
      </div>`;
    verSenha(box);
    const form = $('form', box);
    const btn = $('.auth-btn', box);
    $('[data-ir-codigo]', box).addEventListener('click', () => telaCodigo($('#a_email', box).value));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#a_email', box).value.trim().toLowerCase();
      const senha = $('#a_senha', box).value;
      if (!email) return mostrarErro(box, 'Digite o seu e-mail.', '#a_email');
      if (!senha) return mostrarErro(box, 'Digite a sua senha.', '#a_senha');
      mostrarErro(box, '');
      ocupado(btn, true, 'Entrando…');
      let res;
      try {
        res = await sb.auth.signInWithPassword({ email, password: senha });
      } catch (err) {
        res = { error: err };
      }
      if (res.error || !res.data || !res.data.session) {
        ocupado(btn, false);
        return mostrarErro(box, msgLogin(res.error), res.error && res.error.status === 400 ? '#a_senha' : null);
      }
      lsSet('prisma-crm-email', email);
      entrarComSessao(res.data.session);
    });
    (lsGet('prisma-crm-email') || emailPadrao ? $('#a_senha', box) : $('#a_email', box)).focus();
  }

  const formataCodigo = (v) => {
    const t = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    return t.replace(/(.{4})(?=.)/g, '$1-');
  };
  function telaCodigo(emailPadrao) {
    const box = moldura();
    box.innerHTML = `
      <h1 class="auth-t">Criar senha com o código</h1>
      <p class="auth-d">Vale para o primeiro acesso e para trocar uma senha esquecida. O código serve uma vez e vence em 7 dias.</p>
      <form class="auth-form" novalidate>
        <div class="field"><label for="c_codigo">Código de acesso</label><input id="c_codigo" class="auth-codigo" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="14" required></div>
        <div class="field"><label for="c_email">Seu e-mail</label><input id="c_email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required value="${esc(emailPadrao || '')}"><span class="hint">É com ele que você vai entrar daqui em diante.</span></div>
        <div class="field"><label for="c_senha">Nova senha</label><div class="auth-pass"><input id="c_senha" type="password" autocomplete="new-password" minlength="8" required><button type="button" class="auth-ver" data-ver aria-pressed="false" aria-label="Mostrar senha">Mostrar</button></div><span class="hint">Pelo menos 8 caracteres.</span></div>
        <p class="auth-erro" data-erro role="alert" hidden></p>
        <button class="btn btn-primary auth-btn" type="submit">Salvar senha e entrar</button>
      </form>
      <div class="auth-alt">
        <p>Sem código? Peça ao seu sócio. No CRM, em <b>Ajustes</b>, ele gera um código novo para você.</p>
        <button type="button" class="link" data-voltar>Voltar para entrar</button>
      </div>`;
    verSenha(box);
    const cod = $('#c_codigo', box);
    cod.addEventListener('input', () => { cod.value = formataCodigo(cod.value); });
    $('[data-voltar]', box).addEventListener('click', () => telaEntrar());
    const btn = $('.auth-btn', box);
    $('form', box).addEventListener('submit', async (e) => {
      e.preventDefault();
      const codigo = formataCodigo(cod.value);
      const email = $('#c_email', box).value.trim().toLowerCase();
      const senha = $('#c_senha', box).value;
      if (codigo.length !== 14) return mostrarErro(box, 'O código tem 12 letras e números, como ABCD-EF23-GH45.', '#c_codigo');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrarErro(box, MSG_CODIGO.email[0], '#c_email');
      if (senha.length < 8) return mostrarErro(box, MSG_CODIGO.senha[0], '#c_senha');
      mostrarErro(box, '');
      ocupado(btn, true, 'Salvando…');
      try {
        await chamarFuncao('acesso', { acao: 'primeiro-acesso', codigo, email, senha }, false);
      } catch (err) {
        ocupado(btn, false);
        const [txt, campo] = MSG_CODIGO[err.code] || ['Não foi possível salvar agora. Tente de novo em instantes.', null];
        return mostrarErro(box, txt, campo);
      }
      btn.textContent = 'Entrando…';
      const res = await sb.auth.signInWithPassword({ email, password: senha }).catch((err) => ({ error: err }));
      if (res.error || !res.data || !res.data.session) {
        ocupado(btn, false);
        telaEntrar('Senha criada. Entre com o seu e-mail e a senha nova.', email);
        return;
      }
      lsSet('prisma-crm-email', email);
      entrarComSessao(res.data.session);
    });
    cod.focus();
  }

  function telaEspera(txt) {
    const box = moldura();
    box.innerHTML = `<div class="auth-wait" role="status"><span class="auth-spin" aria-hidden="true"></span><p>${esc(txt)}</p></div>`;
  }
  function telaSemRede(tentar) {
    const box = moldura();
    box.innerHTML = `
      <h1 class="auth-t">Sem conexão</h1>
      <p class="auth-d">Não deu para falar com o servidor do CRM. Confira a internet e tente de novo.</p>
      <button type="button" class="btn btn-primary auth-btn" data-tentar>Tentar de novo</button>
      <div class="auth-alt"><button type="button" class="link" data-outra>Entrar com outra conta</button></div>`;
    $('[data-tentar]', box).addEventListener('click', tentar);
    $('[data-outra]', box).addEventListener('click', async () => {
      try { await sb.auth.signOut({ scope: 'local' }); } catch { /* segue */ }
      telaEntrar();
    });
  }

  async function entrarComSessao(session) {
    telaEspera('Abrindo o CRM…');
    let r;
    try {
      r = await sb.from('membros').select('socio,user_id,email,convite_expira');
    } catch (e) {
      r = { error: e, status: 0 };
    }
    if (r.error) {
      if (!r.status || ehErroDeRede(r.error.message)) return telaSemRede(() => entrarComSessao(session));
      try { await sb.auth.signOut({ scope: 'local' }); } catch { /* segue */ }
      return telaEntrar('Sua sessão terminou. Entre de novo.');
    }
    const eu = (r.data || []).find((m) => m.user_id === session.user.id);
    if (!eu || !SOCIOS.includes(eu.socio)) {
      try { await sb.auth.signOut({ scope: 'local' }); } catch { /* segue */ }
      return telaEntrar('Esta conta não tem acesso ao Prisma CRM. Se você é sócio, crie a senha com um código de acesso.', session.user.email);
    }
    CONTA = { uid: session.user.id, email: session.user.email || eu.email || '', socio: eu.socio };
    iniciarApp();
  }

  async function comecar() {
    temaCedo();
    telaEspera('Abrindo o CRM…');
    let sessao = null;
    try {
      const { data } = await sb.auth.getSession();
      sessao = data && data.session;
    } catch { sessao = null; }
    if (sessao) entrarComSessao(sessao);
    else telaEntrar();
  }
  comecar();
})();
