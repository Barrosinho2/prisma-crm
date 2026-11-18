// Supabase simulado para os testes da versão Vercel. Toda chamada vai para o servidor simulado no Node
// (window.__srv, ligado pelo teste); o tempo real chega por window.__fakeRt.entregar(evento).
(function () {
  const LS = 'prisma-crm-auth';
  const lerSessao = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };
  const gravarSessao = (s) => { if (s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS); };

  window.__fakeRt = {
    canais: [],
    entregar(ev) {
      for (const ch of this.canais) if (ch.vivo) ch.cbs.forEach((cb) => { try { cb(ev); } catch (e) { console.error(e); } });
    },
    cair() { for (const ch of this.canais) { ch.vivo = false; ch.status && ch.status('CHANNEL_ERROR'); } },
    voltar() { for (const ch of this.canais) { ch.vivo = true; ch.status && ch.status('SUBSCRIBED'); } },
  };

  function createClient() {
    const ouvintes = new Set();
    const avisar = (ev, s) => ouvintes.forEach((fn) => { try { fn(ev, s); } catch (e) { console.error(e); } });
    const token = () => (lerSessao() || {}).access_token || null;
    const srv = (op, args) => window.__srv(op, args, token());

    const auth = {
      async getSession() { return { data: { session: lerSessao() }, error: null }; },
      onAuthStateChange(cb) {
        ouvintes.add(cb);
        setTimeout(() => cb('INITIAL_SESSION', lerSessao()), 0);
        return { data: { subscription: { unsubscribe: () => ouvintes.delete(cb) } } };
      },
      async signInWithPassword({ email, password }) {
        const r = await srv('auth.entrar', { email, password });
        if (r.error) return { data: { session: null, user: null }, error: r.error };
        gravarSessao(r.data.session);
        avisar('SIGNED_IN', r.data.session);
        return { data: { session: r.data.session, user: r.data.session.user }, error: null };
      },
      async signOut() {
        gravarSessao(null);
        avisar('SIGNED_OUT', null);
        return { error: null };
      },
      async updateUser(attrs) {
        const r = await srv('auth.atualizar', attrs);
        return { data: r.data, error: r.error };
      },
    };

    function from(table) {
      const q = { table, op: 'select', cols: '*', filtros: [], ordem: [], faixa: null, um: null, corpo: null };
      const b = {
        select(cols) { if (q.op === 'select') q.cols = cols || '*'; else q.retorno = cols || '*'; return b; },
        order(c) { q.ordem.push(c); return b; },
        range(a, z) { q.faixa = [a, z]; return b; },
        eq(c, v) { q.filtros.push(['eq', c, v]); return b; },
        neq(c, v) { q.filtros.push(['neq', c, v]); return b; },
        maybeSingle() { q.um = 'talvez'; return b; },
        single() { q.um = 'sim'; return b; },
        upsert(row) { q.op = 'upsert'; q.corpo = row; return b; },
        delete() { q.op = 'delete'; return b; },
        then(ok, err) { return srv('tabela', q).then(ok, err); },
      };
      return b;
    }
    const rpc = (nome, args) => ({ then: (ok, err) => srv('rpc', { nome, args }).then(ok, err) });
    function channel(nome) {
      const ch = { nome, cbs: [], status: null, vivo: false };
      ch.on = (tipo, filtro, cb) => { ch.cbs.push(cb); return ch; };
      ch.subscribe = (statusCb) => {
        ch.status = statusCb;
        window.__fakeRt.canais.push(ch);
        srv('rt.inscrever', {}).then(() => { ch.vivo = true; statusCb('SUBSCRIBED'); });
        return ch;
      };
      return ch;
    }
    return { auth, from, rpc, channel, removeChannel() {} };
  }
  window.supabase = { createClient };
})();
