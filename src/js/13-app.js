/* ───────────────────────── app: rotas, moldura, busca, inicialização ───────────────────────── */
const ROUTES = { painel: Painel, funil: Funil, clientes: Clientes, projetos: Projetos, financeiro: Fin, agenda: Agenda, piloto: Piloto, sites: AreaSites, automacoes: AreaAutomacoes, sistemas: AreaSistemas, ajustes: Ajustes };
const ROUTE_TITLE = { painel: 'Painel', funil: 'Funil', clientes: 'Clientes', projetos: 'Projetos', financeiro: 'Financeiro', agenda: 'Agenda', piloto: 'Piloto automático', ajustes: 'Ajustes' };

const Router = {
  cur: null,
  route(forced) {
    const h = forced || location.hash.replace(/^#/, '');
    const key = ROUTES[h] ? h : 'painel';
    if (Router.cur !== key) {
      Router.cur = key;
      Tip.hide();
      Pop.close();
      const v = $('#view');
      v.innerHTML = '';
      ROUTES[key].mount(v);
      if (!reduceMotion()) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
      const main = $('#main');
      if (main) main.scrollTop = 0;
    }
    Router.render();
    $$('[data-route]').forEach((a) => {
      if (a.dataset.route === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    closeRail();
  },
  render() {
    const v = ROUTES[Router.cur];
    if (!v) return;
    try {
      v.render();
    } catch (e) {
      console.error(e);
    }
  },
};

/* ── moldura: badges, status de sincronização, avisos ── */
function renderChrome() {
  const t = today();
  const pronto = dadosProntos();
  // badges
  const setBadge = (route, n, tone = '') => {
    $$(`[data-route="${route}"] .badge`).forEach((b) => {
      b.hidden = !n;
      b.textContent = n > 99 ? '99+' : String(n);
      b.className = 'badge' + (tone ? ' ' + tone : '');
    });
  };
  if (pronto) {
    const atras = Calc.followups(t).filter((f) => f.data <= t).length + Calc.tarefasAbertas().filter((x) => x.prazo && x.prazo <= t).length;
    setBadge('agenda', atras, Calc.followups(t).some((f) => f.data < t) || Calc.tarefasAbertas().some((x) => x.prazo && x.prazo < t) ? 'hot' : '');
    const finAtras = Store.all('lancamentos').filter((l) => !l.pagoEm && l.vencimento && l.vencimento < t).length;
    setBadge('financeiro', finAtras, finAtras ? 'hot' : '');
    setBadge('funil', Calc.leadsAbertos().length);
    const nAuto = autoLigadas();
    $$('[data-route="piloto"] .pl-dot').forEach((d) => { d.hidden = false; d.className = 'pl-dot' + (nAuto ? ' on' : ''); d.title = `${nAuto} de ${AUTO_TOGGLES.length + 1} automações ligadas`; });
    for (const [r, A] of Object.entries(AREAS)) setBadge(r, Calc.leadsAbertos().filter((l) => (l.servicos || []).includes(A.k)).length);
  }
  // status
  const sync = $('#sync');
  if (sync) {
    let cls = 'wait';
    let txt = 'Conectando…';
    if (S.mode === 'local') { cls = 'off'; txt = 'Sem banco'; }
    else if (S.mode === 'cloud') {
      if (S.fatal) { cls = 'err'; txt = 'Desconectado'; }
      else if (Store.pendingWrites()) { cls = 'wait'; txt = 'Salvando…'; }
      else if (S.ready && Host && !Host.aoVivo()) { cls = 'wait'; txt = 'Reconectando…'; }
      else if (S.ready) { cls = 'ok'; txt = 'Sincronizado'; }
      else if (S.timedOut) { cls = 'err'; txt = 'Sem resposta'; }
    }
    sync.className = 'sync ' + cls;
    $('span', sync).textContent = txt;
  }
  // eu
  const chip = $('#meChip');
  if (chip) {
    chip.innerHTML = S.me ? `${avatar(S.me)}<span><b>${esc(meNome())}</b><small>${esc(S.config.socios[S.me].papel || '')}</small></span>` : `<span class="av av-none">?</span><span><b>Quem é você?</b><small>Escolher sócio</small></span>`;
  }
  // avisos
  const banners = [];
  if (S.mode === 'local') banners.push(`<div class="banner b-warn">${ic('alert')}<div>${S.localReason === 'nodb' ? '<b>O banco do CRM não respondeu.</b> O que você fizer agora não será salvo. Recarregue a página para tentar de novo.' : '<b>Cópia local, sem banco de dados.</b> Abra o CRM pelo Claude para salvar e compartilhar com o seu sócio.'}</div></div>`);
  if (S.mode === 'cloud' && S.timedOut && !S.ready) banners.push(`<div class="banner b-warn">${ic('alert')}<div><b>Os dados ainda não chegaram.</b> A página continua tentando; confira a sua conexão. O que aparece pode estar desatualizado.</div></div>`);
  if (S.fatal === 'unavailable') banners.push(`<div class="banner b-warn">${ic('alert')}<div><b>A conexão com o banco caiu.</b> Recarregue a página para voltar a sincronizar.</div></div>`);
  if (S.readOnly) banners.push(Host ? `<div class="banner b-gray">${ic('alert')}<div><b>Esta conta perdeu o acesso para alterar o CRM.</b> Saia e entre de novo. Se continuar, peça um código de acesso novo ao seu sócio.</div></div>` : `<div class="banner b-gray">${ic('alert')}<div><b>Acesso somente de leitura.</b> Para registrar dados, peça ao dono do CRM acesso de Editor.</div></div>`);
  if (pronto && Store.hasDemo() && Router.cur !== 'ajustes') banners.push(`<div class="banner b-demo">${ic('spark')}<div><b>Você está vendo dados de exemplo.</b><span class="hide-sm"> Explore à vontade. Quando for usar de verdade, apague todos de uma vez; o que vocês cadastrarem fica.</span></div><button type="button" class="btn btn-sm" data-cleardemo data-write>Apagar exemplos</button></div>`);
  const bh = banners.join('');
  const box = $('#banners');
  if (box && box.dataset.sig !== bh) {
    box.dataset.sig = bh;
    box.innerHTML = bh;
    on(box, '[data-cleardemo]', 'click', () => apagarExemplos());
  }
  document.body.classList.toggle('readonly', !!S.readOnly);
}

/* ── pergunta "quem é você" uma vez ── */
let perguntouMe = false;
function maybeAskMe() {
  if (perguntouMe || S.me || !S.prefsLoaded || !dadosProntos() || S.readOnly) return;
  perguntouMe = true;
  const m = Modal.open({
    title: 'Quem está usando este acesso?',
    body: `<p class="modal-text">Assim o CRM registra quem fez cada contato e mostra a agenda certa. Dá para trocar depois em Ajustes.</p><div class="me-pick">${SOCIOS.map((k) => `<button type="button" class="me-opt" data-me="${k}">${avatar(k, 'lg')}<span><b>${esc(socioNome(k))}</b><small>${esc(S.config.socios[k].papel || '')}</small></span></button>`).join('')}</div>`,
    actions: [{ label: 'Agora não', kind: 'ghost' }],
  });
  on(m.el, '[data-me]', 'click', (e, b) => {
    Store.setMe(b.dataset.me);
    m.close();
    toast(`Bem-vindo, ${socioNome(b.dataset.me)}.`);
  });
}

/* ── menu lateral no celular ── */
function openRail() {
  $('#rail').classList.add('open');
  $('#scrim').hidden = false;
}
function closeRail() {
  const r = $('#rail');
  if (r) r.classList.remove('open');
  const s = $('#scrim');
  if (s) s.hidden = true;
}

/* ── busca global ── */
function setupSearch() {
  const input = $('#gsearch');
  const box = $('#gresults');
  let results = [];
  let sel = -1;
  const paint = () => {
    if (!input.value.trim()) { box.hidden = true; return; }
    results = searchAll(input.value);
    sel = results.length ? 0 : -1;
    box.innerHTML = results.length ? results.map((r, i) => `<button type="button" role="option" id="gr_${i}" aria-selected="${i === sel}" data-i="${i}">${ic(r.ic)}<span><b>${esc(r.title)}</b><small>${esc(r.kind)}${r.sub ? ' · ' + esc(r.sub) : ''}</small></span></button>`).join('') : '<p class="muted small sr-empty">Nada encontrado.</p>';
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    $$('[data-i]', box).forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(+b.dataset.i); }));
  };
  const pick = (i) => {
    const r = results[i];
    if (!r) return;
    box.hidden = true;
    input.value = '';
    input.blur();
    r.open();
  };
  const move = (d) => {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length;
    $$('[role=option]', box).forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)));
    input.setAttribute('aria-activedescendant', 'gr_' + sel);
  };
  input.addEventListener('input', paint);
  input.addEventListener('focus', () => { if (input.value.trim()) paint(); });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); }
  });
}

function novoMenu(anchor) {
  if (S.readOnly) return toast('Você tem acesso somente de leitura.', { type: 'error' });
  Pop.open(anchor, [
    { label: 'Lead', ic: 'funil', fn: () => editLead() },
    { label: 'Lead de uma mensagem', ic: 'paste', fn: () => editLead(null, {}, { colar: true }) },
    { label: 'Leads das conversas do WhatsApp', ic: 'chat', fn: () => abrirConversas() },
    { label: 'Venda fechada', ic: 'trophy', fn: () => winFlow() },
    { label: 'Entrada no caixa', ic: 'in', fn: () => editLancamento(null, { tipo: 'entrada', categoria: 'Projetos' }) },
    { label: 'Despesa', ic: 'out', fn: () => editLancamento(null, { tipo: 'saida' }) },
    { label: 'Tarefa', ic: 'check', fn: () => editTarefa() },
    { sep: true },
    { label: 'Cliente', ic: 'clientes', fn: () => editCliente() },
    { label: 'Recorrência', ic: 'repeat', fn: () => editRecorrencia() },
  ]);
}

function setupChrome() {
  $('#menuBtn').addEventListener('click', openRail);
  Tema.aplicar();
  $('#themeBtn').addEventListener('click', () => Tema.ciclo());
  $('#scrim').addEventListener('click', closeRail);
  $('#newBtn').addEventListener('click', (e) => novoMenu(e.currentTarget));
  const fab = $('#fab');
  if (fab) fab.addEventListener('click', (e) => novoMenu(e.currentTarget));
  $('#meChip').addEventListener('click', () => go('ajustes'));
  // navegação feita pelo código: alguns visualizadores interceptam cliques em links e não trocam o #
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const key = a.getAttribute('href').slice(1);
    if (!ROUTES[key]) return;
    e.preventDefault();
    closeRail();
    go(key);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (Pop.isOpen()) { Pop.close(); return; }
      const m = Modal.top();
      if (m) { m.close(); return; }
      if (Drawer.isOpen()) { Drawer.close(); return; }
      if ($('#rail').classList.contains('open')) closeRail();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); $('#gsearch').focus(); $('#gsearch').select(); return; }
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); $('#gsearch').focus(); }
    else if ((e.key === 'n' || e.key === 'N') && !Modal.top() && !Drawer.isOpen()) { e.preventDefault(); novoMenu($('#newBtn')); }
  });
  window.addEventListener('hashchange', () => Router.route());
  window.addEventListener('scroll', () => Tip.hide(), true);
  // no toque, o tooltip fica até tocar fora do gráfico
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.chart, .hb')) Tip.hide(); }, true);
  if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) $('#gsearch').placeholder = 'Buscar no CRM';
  setupSearch();
}

function start(hot) {
  hot = hot || {};
  if (hot.painel) Painel.mes = hot.painel;
  if (hot.fin) Object.assign(Fin, hot.fin);
  if (hot.funil) Object.assign(Funil, hot.funil);
  if (window.claude && window.claude.hot && typeof window.claude.hot.snapshot === 'function') {
    try {
      window.claude.hot.snapshot(() => ({ painel: Painel.mes, fin: { tab: Fin.tab, mes: Fin.mes }, funil: { modo: Funil.modo } }));
    } catch {}
  }
  setupChrome();
  Store.subscribe(() => {
    Router.render();
    Drawer.refresh();
    renderChrome();
    maybeAskMe();
  });
  Router.route();
  renderChrome();
  Auto.iniciar();
  // só nos testes automatizados (banco simulado): permite rodar o piloto na hora
  if (window.__mockStore) window.__prismaAuto = (forcar = true) => Auto.rodar(forcar);
  Store.init().then(async () => {
    try {
      if (window.claude && typeof window.claude.use === 'function' && S.mode === 'cloud') S.downloads = await window.claude.use('downloads');
    } catch {
      S.downloads = null;
    }
    renderChrome();
  });
  // mantém o "hoje" correto se a aba ficar aberta de um dia para o outro
  let dia = today();
  setInterval(() => {
    if (today() !== dia) {
      dia = today();
      Store.emit();
    }
  }, 60000);
}

if (window.claude && window.claude.hot && typeof window.claude.hot.ready === 'function') window.claude.hot.ready(start);
else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
