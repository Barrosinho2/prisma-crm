// Banco simulado com a mesma forma da capability `db` (subset usado pelo CRM), mais `user` e `downloads`.
(function () {
  const store = new Map(); // path -> data
  const seed = window.__MOCK_SEED__ || {};
  for (const [col, rows] of Object.entries(seed)) {
    if (col === 'config') { store.set('config/geral', JSON.parse(JSON.stringify(rows))); continue; }
    if (col === '__prefs') { store.set('data/users/u_teste/prefs', rows); continue; }
    for (const r of rows) { const { id, ...d } = r; store.set(`${col}/${id}`, JSON.parse(JSON.stringify(d))); }
  }
  const colListeners = new Map(); // colPath -> Set(fn)
  const docListeners = new Map(); // docPath -> Set(fn)
  window.__mockLog = [];
  window.__mockLeases = new Map();
  window.__mockFail = null; // ex.: {code:'invalid_argument'} para simular recusa
  const freeze = (o) => JSON.parse(JSON.stringify(o));
  const meta = { fromCache: false, hasPendingWrites: false };
  const docSnap = (path) => {
    const id = path.split('/').pop();
    const d = store.get(path);
    return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : freeze(d)), metadata: meta };
  };
  const colSnap = (col) => {
    const prefix = col + '/';
    const docs = [];
    for (const [p] of store) {
      if (p.startsWith(prefix) && p.slice(prefix.length).indexOf('/') === -1) docs.push(docSnap(p));
    }
    docs.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta };
  };
  const notify = (path) => {
    const col = path.split('/').slice(0, -1).join('/');
    setTimeout(() => {
      (colListeners.get(col) || []).forEach((fn) => fn(colSnap(col)));
      (docListeners.get(path) || []).forEach((fn) => fn(docSnap(path)));
    }, 5);
  };
  const delay = () => new Promise((r) => setTimeout(r, 15));
  function docRef(path) {
    const segs = path.split('/');
    if (segs.length % 2 !== 0) throw new TypeError('doc path precisa de número par de segmentos: ' + path);
    return {
      id: segs[segs.length - 1],
      path,
      async get() { await delay(); return docSnap(path); },
      async set(data) {
        await delay();
        if (window.__mockFail) throw window.__mockFail;
        if (typeof data !== 'object' || Array.isArray(data)) throw { code: 'invalid_argument', message: 'body' };
        store.set(path, freeze(data));
        window.__mockLog.push(['set', path]);
        notify(path);
      },
      async update(data) {
        await delay();
        if (window.__mockFail) throw window.__mockFail;
        if (!store.has(path)) throw { code: 'invalid_argument', message: 'missing' };
        const cur = store.get(path);
        const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v); else a[k] = v; } return a; };
        store.set(path, merge(freeze(cur), freeze(data)));
        window.__mockLog.push(['update', path]);
        notify(path);
      },
      async delete() {
        await delay();
        if (window.__mockFail) throw window.__mockFail;
        store.delete(path);
        window.__mockLog.push(['delete', path]);
        notify(path);
      },
      async acquire({ holder, ttlMs = 30000 } = {}) {
        await delay();
        const now = Date.now();
        const cur = window.__mockLeases.get(path);
        if (cur && cur.exp > now && cur.holder !== holder) return { acquired: false, expiresAt: new Date(cur.exp).toISOString() };
        const exp = now + Math.max(1000, Math.min(600000, ttlMs || 30000));
        window.__mockLeases.set(path, { holder, exp });
        window.__mockLog.push(['acquire', path]);
        return { acquired: true, version: 1, expiresAt: new Date(exp).toISOString(), holder };
      },
      onSnapshot(next, err) {
        if (!docListeners.has(path)) docListeners.set(path, new Set());
        docListeners.get(path).add(next);
        setTimeout(() => next(docSnap(path)), 20);
        return () => docListeners.get(path).delete(next);
      },
      collection(sub) { return colRef(path + '/' + sub); },
    };
  }
  function colRef(col) {
    if (col.split('/').length % 2 !== 1) throw new TypeError('collection path precisa de número ímpar de segmentos: ' + col);
    return {
      path: col,
      doc(id) { return docRef(col + '/' + (id || 'auto' + Math.random().toString(36).slice(2, 10))); },
      async add(data) { const r = this.doc(); await r.set(data); return r; },
      async get() { await delay(); return colSnap(col); },
      onSnapshot(next, err) {
        if (!colListeners.has(col)) colListeners.set(col, new Set());
        colListeners.get(col).add(next);
        setTimeout(() => next(colSnap(col)), 30);
        return () => colListeners.get(col).delete(next);
      },
      where() { return this; },
      orderBy() { return this; },
      limit() { return this; },
    };
  }
  const db = { doc: docRef, collection: colRef };
  const user = {
    async isOwner() { return true; },
    async canEdit() { return true; },
    async can(n) { return n === 'data.write' ? !window.__mockReadOnly : null; },
    async id() { return 'u_teste'; },
    async me() { return { id: 'u_teste', name: 'Rafael', avatarUrl: '', color: '#2457ff', email: null, isOwner: true, canEdit: true }; },
    async profiles(ids) { return Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: '', avatarUrl: '', color: '#888', email: null, isMe: i === 'u_teste', guest: false }])); },
  };
  window.__downloads = [];
  const downloads = { async save({ filename, data }) { window.__downloads.push({ filename, size: String(data).length, head: String(data).slice(0, 300) }); return { status: 'saved' }; } };
  window.__mockStore = store;
  // Claude simulado: a resposta vem de window.__mockSampleReply(prompt) (definida pelo teste)
  window.__sampleCalls = [];
  window.__mockSampleFail = null;
  const sample = async (input) => ({ text: 'ok', truncated: false, modelTierApplied: 'default' });
  sample.json = async (input, opts = {}) => {
    window.__sampleCalls.push(String(input));
    await new Promise((r) => setTimeout(r, 120));
    if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'cancelado' };
    if (window.__mockSampleFail) throw window.__mockSampleFail;
    return window.__mockSampleReply ? window.__mockSampleReply(String(input)) : { ehLead: true, etapa: 'contato' };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  window.claude = {
    use: (name) => new Promise((res) => setTimeout(() => res(name === 'db' ? db : name === 'user' ? user : name === 'downloads' ? downloads : name === 'sample' ? (window.__mockNoSample ? null : sample) : null), 40)),
  };
})();
