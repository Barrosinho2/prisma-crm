/* ───────────────────────── domínio ───────────────────────── */
const ETAPAS = [
  { k: 'novo', l: 'Novo lead', p: 0.1 },
  { k: 'contato', l: 'Em contato', p: 0.2 },
  { k: 'diagnostico', l: 'Diagnóstico', p: 0.4 },
  { k: 'proposta', l: 'Proposta enviada', p: 0.6 },
  { k: 'negociacao', l: 'Negociação', p: 0.8 },
  { k: 'ganho', l: 'Ganho', p: 1 },
  { k: 'perdido', l: 'Perdido', p: 0 },
];
const ETAPA = Object.fromEntries(ETAPAS.map((e, i) => [e.k, { ...e, i }]));
const ABERTAS = ['novo', 'contato', 'diagnostico', 'proposta', 'negociacao'];
const SERVICOS = [
  { k: 'site', l: 'Site' },
  { k: 'automacao', l: 'Automação' },
  { k: 'sistema', l: 'Sistema' },
  { k: 'outro', l: 'Outro' },
];
const SERVICO = Object.fromEntries(SERVICOS.map((s) => [s.k, s.l]));
const STATUS_PROJ = [
  { k: 'planejamento', l: 'Planejamento', tone: 'gray' },
  { k: 'desenvolvimento', l: 'Em desenvolvimento', tone: 'blue' },
  { k: 'revisao', l: 'Em revisão', tone: 'warn' },
  { k: 'entregue', l: 'Entregue', tone: 'good' },
  { k: 'pausado', l: 'Pausado', tone: 'gray' },
  { k: 'cancelado', l: 'Cancelado', tone: 'bad' },
];
const STATUS = Object.fromEntries(STATUS_PROJ.map((s) => [s.k, s]));
const PROJ_ATIVOS = ['planejamento', 'desenvolvimento', 'revisao', 'pausado'];
const FORMAS = ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro'];
const TIPOS_ATIV = [
  { k: 'whatsapp', l: 'WhatsApp', ic: 'whatsapp' },
  { k: 'ligacao', l: 'Ligação', ic: 'phone' },
  { k: 'email', l: 'E-mail', ic: 'mail' },
  { k: 'reuniao', l: 'Reunião', ic: 'clientes' },
  { k: 'nota', l: 'Nota', ic: 'note' },
];
const ATIV_IC = { whatsapp: 'whatsapp', ligacao: 'phone', email: 'mail', reuniao: 'clientes', nota: 'note', proposta: 'note', criado: 'spark', etapa: 'arrow', ganho: 'trophy', perdido: 'xcircle', auto: 'plane' };
const SOCIOS = ['rafael', 'pedro'];
const DEFAULT_CONFIG = {
  socios: {
    rafael: { nome: 'Rafael', papel: 'Sócio operacional' },
    pedro: { nome: 'Pedro', papel: 'Sócio comercial' },
  },
  metaMensal: 0,
  saldoInicial: 0,
  saldoInicialData: '',
  origens: ['Instagram', 'Indicação', 'Google', 'LinkedIn', 'Prospecção ativa', 'Site da Prisma', 'WhatsApp', 'Outro'],
  categoriasEntrada: ['Projetos', 'Manutenção & mensalidades', 'Consultoria', 'Outras receitas'],
  categoriasSaida: ['Ferramentas & softwares', 'Hospedagem & domínios', 'Marketing & anúncios', 'Impostos & taxas', 'Contabilidade', 'Freelancers & terceiros', 'Equipamentos', 'Escritório & internet', 'Pró-labore & retiradas', 'Outras despesas'],
  motivosPerda: ['Preço', 'Sem orçamento agora', 'Escolheu concorrente', 'Sem resposta', 'Adiou o projeto', 'Fora do nosso escopo', 'Outro'],
  /* piloto automático: o que o CRM faz sozinho */
  auto: {
    recorrencias: true,
    followupEtapa: true,
    prazosEtapa: { novo: 0, contato: 2, diagnostico: 2, proposta: 3, negociacao: 2 },
    acoesEtapa: {
      novo: 'Fazer o primeiro contato',
      contato: 'Marcar a conversa de diagnóstico',
      diagnostico: 'Montar e enviar a proposta',
      proposta: 'Cobrar retorno da proposta',
      negociacao: 'Fechar as condições e enviar o contrato',
    },
    leadParado: true,
    diasParado: 14,
    checklistVenda: true,
    checklist: {
      site: ['Reunião de briefing com o cliente', 'Receber textos, fotos e acessos', 'Layout para aprovação', 'Desenvolver e revisar o site', 'Publicar e treinar o cliente'],
      automacao: ['Mapear o processo com o cliente', 'Receber os acessos das ferramentas', 'Montar e testar a automação', 'Ativar e acompanhar a primeira semana'],
      sistema: ['Levantar os requisitos', 'Protótipo para aprovação', 'Desenvolver as funcionalidades', 'Testes com o cliente', 'Implantar e treinar a equipe'],
      outro: ['Reunião de início com o cliente', 'Entregar e colher o aceite'],
    },
    posEntrega: true,
    notaFiscal: true,
    nfResponsavel: 'rafael',
    lembreteCobranca: true,
    diasCobranca: 2,
    imposto: 'off',
    impostoPct: 6,
    impostoValor: 0,
    impostoDia: 20,
  },
  pix: '',
  msgs: {
    primeiroContato: 'Oi, {contato}! Tudo bem? Aqui é o {eu}, da Prisma Systems. Vi que a {empresa} tem interesse em {servico}. Posso te fazer umas perguntas rápidas para entender o que vocês precisam?',
    followup: 'Oi, {contato}! Tudo certo? Passando para dar sequência à nossa conversa sobre {servico} para a {empresa}. Podemos falar esta semana?',
    proposta: 'Oi, {contato}! Conseguiu olhar a proposta que enviamos para a {empresa}? Se quiser, marco 15 minutos para tirar dúvidas e ajustar o que for preciso.',
    fechamento: 'Oi, {contato}! Para começarmos o projeto da {empresa} ainda este mês, posso te mandar o contrato com as condições que combinamos?',
    cobranca: 'Oi, {contato}! Tudo bem? Passando para lembrar do pagamento de {valor} ({descricao}), que vence {vencimento}. {pix}Qualquer dúvida, é só chamar. Obrigado!',
    atraso: 'Oi, {contato}! Tudo bem? Ainda não identificamos o pagamento de {valor} ({descricao}), que venceu {vencimento}. {pix}Se já pagou, me manda o comprovante e desconsidere esta mensagem. Obrigado!',
    depoimento: 'Oi, {contato}! Foi ótimo entregar o {projeto}. Pode deixar um depoimento curto sobre a experiência com a Prisma? Ajuda muito. E se conhecer alguém que precise de site, automação ou sistema, a indicação é muito bem-vinda!',
    manutencao: 'Oi, {contato}! Para o {projeto} seguir rodando sem preocupação, temos um plano mensal de manutenção, com atualizações, backup e suporte. Quer que eu mande os detalhes?',
  },
};
const IMPOSTO_MODOS = ['off', 'simples', 'mei'];
const COLS = ['leads', 'clientes', 'projetos', 'lancamentos', 'recorrencias', 'tarefas'];
const PREFIX = { leads: 'ld', clientes: 'cl', projetos: 'pj', lancamentos: 'lc', recorrencias: 'rc', tarefas: 'tf' };

/* ───────────────────────── store ─────────────────────────
   Nuvem: capability `db` do artifact (tempo real, compartilhado entre os sócios).
   Local: só em memória — usado quando o banco não está disponível (nada é salvo). */
const Store = (() => {
  const st = {
    mode: 'loading', // 'cloud' | 'local'
    db: null,
    user: null,
    uid: null,
    canWrite: null,
    readOnly: false,
    me: null,
    prefsLoaded: false,
    config: clone(DEFAULT_CONFIG),
    loaded: new Set(),
    ready: false,
    timedOut: false,
    fatal: null,
    version: 0,
    autoLog: [],
    autoEstado: { feitos: {} },
  };
  COLS.forEach((c) => (st[c] = new Map()));
  const listeners = new Set();
  let scheduled = false;
  let loadTimer = null;

  function emit() {
    st.version++;
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      listeners.forEach((fn) => {
        try { fn(); } catch (e) { console.error(e); }
      });
    };
    if (document.hidden) setTimeout(run, 30);
    else requestAnimationFrame(run);
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* junta o que está no banco com os padrões, campo a campo: chaves novas ganham o padrão, tipos errados são descartados */
  function deepMerge(def, raw) {
    if (Array.isArray(def)) return Array.isArray(raw) && raw.length ? raw.map(String) : clone(def);
    if (def && typeof def === 'object') {
      const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const out = {};
      for (const k of Object.keys(def)) out[k] = deepMerge(def[k], src[k]);
      return out;
    }
    if (raw === undefined || raw === null) return def;
    if (typeof def === 'number') {
      const n = +raw;
      return isFinite(n) ? n : def;
    }
    if (typeof def === 'boolean') return !!raw;
    return String(raw);
  }
  function mergeConfig(raw) {
    const c = deepMerge(DEFAULT_CONFIG, raw && typeof raw === 'object' ? raw : null);
    for (const s of SOCIOS) if (!c.socios[s].nome.trim()) c.socios[s].nome = DEFAULT_CONFIG.socios[s].nome;
    // uma lista de tarefas pode ficar vazia de propósito (serviço sem checklist)
    const rc = raw && raw.auto && raw.auto.checklist;
    if (rc && typeof rc === 'object') for (const s of Object.keys(c.auto.checklist)) if (Array.isArray(rc[s])) c.auto.checklist[s] = rc[s].map(String);
    if (!IMPOSTO_MODOS.includes(c.auto.imposto)) c.auto.imposto = 'off';
    if (!SOCIOS.includes(c.auto.nfResponsavel)) c.auto.nfResponsavel = 'rafael';
    for (const k of Object.keys(c.auto.prazosEtapa)) c.auto.prazosEtapa[k] = Math.max(0, Math.min(60, Math.round(c.auto.prazosEtapa[k])));
    c.auto.diasParado = Math.max(3, Math.min(90, Math.round(c.auto.diasParado)));
    c.auto.diasCobranca = Math.max(1, Math.min(15, Math.round(c.auto.diasCobranca)));
    c.auto.impostoDia = Math.max(1, Math.min(28, Math.round(c.auto.impostoDia)));
    for (const s of Object.keys(c.auto.checklist)) c.auto.checklist[s] = c.auto.checklist[s].map((x) => x.trim()).filter(Boolean);
    return c;
  }

  const ALL_KEYS = () => [...COLS, 'config'];
  function markLoaded(key) {
    st.loaded.add(key);
    if (!st.ready && ALL_KEYS().every((k) => st.loaded.has(k))) {
      st.ready = true;
      st.timedOut = false;
      clearTimeout(loadTimer);
    }
  }

  async function waitForClaude() {
    for (let i = 0; i < 15; i++) {
      if (window.claude && typeof window.claude.use === 'function') return window.claude;
      await sleep(100);
    }
    return null;
  }

  async function init() {
    const claude = await waitForClaude();
    let db = null;
    let user = null;
    if (claude) {
      try {
        [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      } catch (e) {
        console.warn('capabilities indisponíveis', e);
      }
    }
    st.user = user;
    if (!db) return startLocal(!!claude);
    st.db = db;
    st.mode = 'cloud';
    try { st.uid = user ? await user.id() : null; } catch { st.uid = null; }
    try {
      const cw = user ? await user.can('data.write') : null;
      st.canWrite = cw;
      if (cw === false) st.readOnly = true;
    } catch { st.canWrite = null; }

    loadTimer = setTimeout(() => {
      if (!st.ready) { st.timedOut = true; emit(); }
    }, 10000);

    for (const c of COLS) {
      db.collection(c).onSnapshot(
        (snap) => {
          const m = new Map();
          snap.docs.forEach((d) => {
            if (d.exists) m.set(d.id, Object.assign({}, d.data(), { id: d.id }));
          });
          st[c] = m;
          if (!snap.metadata.fromCache) markLoaded(c);
          emit();
        },
        (err) => subError(c, err)
      );
    }
    db.doc('config/geral').onSnapshot(
      (s) => {
        st.config = mergeConfig(s.exists ? s.data() : null);
        if (!s.metadata.fromCache) markLoaded('config');
        emit();
      },
      (err) => subError('config', err)
    );
    db.doc('automacoes/log').onSnapshot(
      (s) => {
        const d = s.exists ? s.data() : null;
        logServidor = d && Array.isArray(d.itens) ? d.itens.filter((x) => x && typeof x === 'object') : [];
        st.autoLog = juntaLog();
        emit();
      },
      (err) => console.warn('histórico do piloto indisponível', err)
    );
    if (st.uid) {
      db.doc(`data/users/${st.uid}/prefs`).onSnapshot(
        (s) => {
          const p = s.exists ? s.data() : {};
          st.me = SOCIOS.includes(p.socio) ? p.socio : st.me || localMe();
          st.prefsLoaded = true;
          emit();
        },
        () => { st.me = localMe(); st.prefsLoaded = true; emit(); }
      );
    } else {
      st.me = localMe();
      st.prefsLoaded = true;
    }
    emit();
  }

  function subError(key, err) {
    console.warn('assinatura encerrada', key, err);
    if (err && err.code === 'revoked') {
      st.readOnly = true;
      st.fatal = 'revoked';
    } else if (err && err.code === 'unavailable') {
      st.fatal = 'unavailable';
    }
    markLoaded(key);
    emit();
  }

  function startLocal(hadClaude) {
    st.mode = 'local';
    st.localReason = hadClaude ? 'nodb' : 'file';
    const seed = window.__PRISMA_SEED__;
    if (seed && typeof seed === 'object') {
      for (const c of COLS) {
        (seed[c] || []).forEach((r) => st[c].set(r.id, clone(r)));
      }
      if (seed.config) st.config = mergeConfig(seed.config);
    }
    st.me = localMe();
    st.prefsLoaded = true;
    ALL_KEYS().forEach(markLoaded);
    emit();
  }

  function localMe() {
    try {
      const v = localStorage.getItem('prisma-crm-me');
      return SOCIOS.includes(v) ? v : null;
    } catch { return null; }
  }

  /* ── fila de escrita: uma por documento ── */
  const queue = new Map();
  function enqueue(path, fn) {
    const prev = queue.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    queue.set(path, next);
    next.finally(() => { if (queue.get(path) === next) queue.delete(path); }).catch(() => {});
    return next;
  }
  function pendingWrites() { return queue.size; }

  function cleanData(o) {
    const out = JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' && !isFinite(v) ? 0 : v)));
    delete out.id;
    return out;
  }

  let lastErrToast = 0;
  function writeError(e, op = 'set') {
    const code = e && e.code;
    console.warn('falha ao gravar', e);
    const now = Date.now();
    const quiet = now - lastErrToast < 2500;
    lastErrToast = now;
    // update num documento que não existe mais (o outro sócio apagou) também volta invalid_argument
    if (code === 'invalid_argument' && op === 'update') {
      if (!quiet) toast('Esse registro foi apagado ou mudou enquanto você editava. Confira e tente de novo.', { type: 'error' });
      return;
    }
    if (code === 'invalid_argument' && st.canWrite !== true) {
      st.readOnly = true;
      emit();
      if (!quiet) toast('Sem permissão para alterar os dados. Peça ao dono do CRM acesso de Editor.', { type: 'error' });
      return;
    }
    if (quiet) return;
    if (code === 'quota_exceeded') toast('O banco do CRM chegou ao limite de registros. Exporte um backup em Ajustes e apague registros antigos.', { type: 'error', ms: 8000 });
    else if (code === 'resource_exhausted') toast('Muitas alterações em sequência. Espere alguns segundos e tente de novo.', { type: 'error' });
    else if (code === 'revoked') { st.readOnly = true; emit(); toast('Seu acesso a este CRM mudou. Recarregue a página.', { type: 'error' }); }
    else toast('Não foi possível salvar. Verifique a conexão e tente de novo.', { type: 'error' });
  }

  async function guarded(path, fn, op = 'set') {
    if (st.readOnly) {
      toast('Você tem acesso somente de leitura.', { type: 'error' });
      throw new Error('readonly');
    }
    return enqueue(path, async () => {
      try {
        await fn();
      } catch (e) {
        if (e && e.code === 'unavailable') {
          await sleep(300 + Math.random() * 600);
          try { await fn(); return; } catch (e2) { writeError(e2, op); throw e2; }
        }
        writeError(e, op);
        throw e;
      }
    });
  }

  /* cria ou substitui o documento inteiro */
  function put(col, id, data) {
    const body = cleanData(data);
    if (st.mode === 'local') {
      if (st.readOnly) return Promise.reject(new Error('readonly'));
      st[col].set(id, Object.assign({}, body, { id }));
      emit();
      return Promise.resolve();
    }
    return guarded(`${col}/${id}`, () => st.db.collection(col).doc(id).set(body));
  }
  /* mescla campos num documento existente */
  function patch(col, id, partial) {
    const body = cleanData(partial);
    if (st.mode === 'local') {
      const cur = st[col].get(id);
      if (!cur) return Promise.resolve();
      st[col].set(id, Object.assign({}, cur, body, { id }));
      emit();
      return Promise.resolve();
    }
    return guarded(`${col}/${id}`, () => st.db.collection(col).doc(id).update(body), 'update');
  }
  function remove(col, id) {
    if (st.mode === 'local') {
      st[col].delete(id);
      emit();
      return Promise.resolve();
    }
    return guarded(`${col}/${id}`, () => st.db.collection(col).doc(id).delete(), 'delete');
  }
  function saveConfig(cfg) {
    const body = cleanData(cfg);
    if (st.mode === 'local') {
      st.config = mergeConfig(body);
      emit();
      return Promise.resolve();
    }
    return guarded('config/geral', () => st.db.doc('config/geral').set(body));
  }
  async function setMe(socio) {
    st.me = socio;
    try { localStorage.setItem('prisma-crm-me', socio); } catch {}
    emit();
    if (st.mode === 'cloud' && st.uid) {
      try {
        await enqueue(`data/users/${st.uid}/prefs`, () => st.db.doc(`data/users/${st.uid}/prefs`).set({ socio, atualizadoEm: nowISO() }));
      } catch (e) {
        console.warn('preferência não salva no banco', e);
      }
    }
  }

  /* operações em lote (importar, apagar exemplos): uma por vez, com espera quando o banco pede calma */
  async function bulk(items, onProgress) {
    if (st.readOnly) throw Object.assign(new Error('readonly'), { code: 'readonly' });
    let done = 0;
    for (const it of items) {
      if (st.mode === 'local') {
        if (it.op === 'remove') st[it.col].delete(it.id);
        else if (it.op === 'config') st.config = mergeConfig(it.data);
        else st[it.col].set(it.id, Object.assign({}, cleanData(it.data), { id: it.id }));
      } else {
        let attempt = 0;
        for (;;) {
          try {
            if (it.op === 'remove') await st.db.collection(it.col).doc(it.id).delete();
            else if (it.op === 'config') await st.db.doc('config/geral').set(cleanData(it.data));
            else await st.db.collection(it.col).doc(it.id).set(cleanData(it.data));
            break;
          } catch (e) {
            attempt++;
            const code = e && e.code;
            if ((code === 'resource_exhausted' || code === 'unavailable') && attempt < 5) {
              await sleep(1500 * attempt);
              continue;
            }
            throw e;
          }
        }
        await sleep(60);
      }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
    emit();
    return done;
  }

  /* ── piloto automático: histórico, trava e estado ── */
  const LOG_MAX = 40;
  const TAB = newId('tab');
  let logServidor = [];
  const logPendente = [];
  function juntaLog() {
    const vistos = new Set();
    return [...logPendente, ...logServidor]
      .filter((x) => { const k = x.id || x.em + x.txt; if (vistos.has(k)) return false; vistos.add(k); return true; })
      .sort((a, b) => String(b.em).localeCompare(String(a.em)))
      .slice(0, LOG_MAX);
  }
  function logAuto(item) {
    const it = Object.assign({ id: newId('lg'), em: nowISO(), por: st.me || null }, item);
    logPendente.push(it);
    st.autoLog = juntaLog();
    emit();
    if (st.mode !== 'cloud' || st.readOnly) return Promise.resolve();
    return enqueue('automacoes/log', async () => {
      const itens = juntaLog();
      try {
        await st.db.doc('automacoes/log').set({ itens, atualizadoEm: nowISO() });
        logServidor = itens;
        logPendente.splice(0, logPendente.length);
      } catch (e) {
        console.warn('histórico do piloto não salvo', e);
      }
    });
  }
  /* só uma aba por vez roda as automações de calendário (as duas acabariam fazendo a mesma coisa) */
  async function trava(ms = 30000) {
    if (st.mode !== 'cloud') return true;
    const ref = st.db.doc('automacoes/trava');
    if (typeof ref.acquire !== 'function') return true;
    try {
      const r = await ref.acquire({ holder: TAB, ttlMs: ms });
      return !!(r && r.acquired);
    } catch (e) {
      const code = e && e.code;
      if (code === 'capability_removed' || code === 'capability_disabled') return true;
      console.warn('trava do piloto', e);
      return false;
    }
  }
  async function lerEstado() {
    if (st.mode !== 'cloud') return clone(st.autoEstado);
    const s = await st.db.doc('automacoes/estado').get();
    const d = s.exists ? s.data() : {};
    st.autoEstado = Object.assign({ feitos: {} }, clone(d || {}));
    if (!st.autoEstado.feitos || typeof st.autoEstado.feitos !== 'object') st.autoEstado.feitos = {};
    return clone(st.autoEstado);
  }
  async function gravarEstado(est) {
    st.autoEstado = clone(est);
    if (st.mode !== 'cloud') return;
    await enqueue('automacoes/estado', () => st.db.doc('automacoes/estado').set(cleanData(est)));
  }

  function all(col) { return Array.from(st[col].values()); }
  function get(col, id) { return id ? st[col].get(id) || null : null; }
  function totalDocs() { return COLS.reduce((a, c) => a + st[c].size, 0); }
  function hasDemo() { return COLS.some((c) => all(c).some((r) => r.demo)); }

  return { st, init, subscribe, emit, put, patch, remove, saveConfig, setMe, bulk, all, get, totalDocs, hasDemo, pendingWrites, mergeConfig, writeError, logAuto, trava, lerEstado, gravarEstado };
})();

const S = Store.st;
const cfg = () => S.config;
const socioNome = (k) => (k && S.config.socios[k] ? S.config.socios[k].nome : '—');
const meNome = () => socioNome(S.me);
