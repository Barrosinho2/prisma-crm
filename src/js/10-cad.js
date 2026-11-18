/* ───────────────────────── CLIENTES ───────────────────────── */
const Clientes = {
  q: '',
  ordem: 'recebido',
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Clientes</h1><p class="vsub" id="cl_sub"></p></div><div class="vactions"><button type="button" class="btn" data-new-venda data-write>${ic('trophy')}Nova venda</button><button type="button" class="btn btn-primary" data-new-cli data-write>${ic('plus')}Novo cliente</button></div></div>
      <div class="toolbar" role="search"><label class="tb-search">${ic('search')}<input id="cl_q" type="search" placeholder="Buscar por nome, contato ou CNPJ" aria-label="Buscar clientes" autocomplete="off"></label>
      <select id="cl_ord" aria-label="Ordenar"><option value="recebido">Mais faturados</option><option value="nome">Nome (A–Z)</option><option value="recente">Clientes mais recentes</option><option value="aberto">Mais valores a receber</option></select></div>
      <div class="vbody" id="cl_body"></div>`;
    const q = $('#cl_q', root);
    q.value = Clientes.q;
    q.addEventListener('input', () => { Clientes.q = q.value; Clientes.render(); });
    const o = $('#cl_ord', root);
    o.value = Clientes.ordem;
    o.addEventListener('change', () => { Clientes.ordem = o.value; Clientes.render(); });
    on(root, '[data-new-cli]', 'click', () => editCliente());
    on(root, '[data-new-venda]', 'click', () => winFlow());
  },
  render() {
    const body = $('#cl_body');
    if (!body) return;
    if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
    const all = Store.all('clientes');
    const mrrTotal = Calc.mrr().entrada;
    $('#cl_sub').textContent = all.length ? `${plural(all.length, 'cliente', 'clientes')}${mrrTotal ? `, ${money0(mrrTotal)} por mês em receita recorrente` : ''}.` : 'Clientes aparecem aqui quando uma venda é fechada.';
    if (!all.length) {
      body.innerHTML = emptyState('Nenhum cliente ainda', 'Ao marcar um lead como ganho, o cliente é criado com o projeto e as parcelas.', `<button type="button" class="btn btn-primary" data-new-cli data-write>${ic('plus')}Cadastrar cliente</button>`);
      on(body, '[data-new-cli]', 'click', () => editCliente());
      return;
    }
    const n = norm(Clientes.q).trim();
    let rows = all
      .filter((c) => !n || [c.nome, c.contato, c.documento, c.email, c.cidade].some((x) => norm(x).includes(n)))
      .map((c) => ({ c, f: Calc.clienteFin(c) }));
    const ord = Clientes.ordem;
    rows.sort((a, b) => (ord === 'nome' ? byName(a.c.nome, b.c.nome) : ord === 'recente' ? String(b.c.desde || '').localeCompare(String(a.c.desde || '')) : ord === 'aberto' ? b.f.aberto - a.f.aberto : b.f.recebido - a.f.recebido));
    body.innerHTML = rows.length
      ? `<div class="tbl-wrap panel"><table class="tbl tbl-click tbl-cards k2"><thead><tr><th>Cliente</th><th>Contato</th><th class="num">Projetos</th><th class="num">Recebido</th><th class="num">A receber</th><th class="num">Recorrente</th><th>Desde</th></tr></thead><tbody>${rows
          .map(({ c, f }) => `<tr data-id="${esc(c.id)}" tabindex="0"><td class="ga-main"><b>${esc(c.nome)}</b>${demoTag(c)}<small class="cell-sub">${esc([c.segmento, c.cidade].filter(Boolean).join(' · '))}</small></td><td class="ga-sub">${esc(c.contato || '—')}<small class="cell-sub">${esc(c.telefone || c.email || '')}</small></td><td class="num hide-sm">${f.projetos.length}</td><td class="num ga-val" data-label="recebido">${money0(f.recebido)}</td><td class="num ga-side"${f.aberto ? ' data-label="a receber"' : ''}>${f.aberto ? money0(f.aberto) : '<span class="dash">—</span>'}</td><td class="num hide-sm">${f.mrr ? money0(f.mrr) + '/mês' : '—'}</td><td class="hide-sm">${c.desde ? fmtDate(c.desde) : '—'}</td></tr>`)
          .join('')}</tbody></table></div>`
      : emptyState('Nenhum cliente encontrado', 'Tente outro nome ou limpe a busca.');
    $$('tr[data-id]', body).forEach((tr) => {
      tr.addEventListener('click', () => showCliente(tr.dataset.id));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') showCliente(tr.dataset.id); });
    });
  },
};

/* ───────────────────────── PROJETOS ───────────────────────── */
const Projetos = {
  filtro: 'ativos',
  serv: '',
  q: '',
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Projetos</h1><p class="vsub" id="pj_sub"></p></div><div class="vactions"><button type="button" class="btn btn-primary" data-new-venda data-write>${ic('plus')}Nova venda</button></div></div>
      <div class="toolbar" role="search">
        <div class="seg seg-sm" role="radiogroup" aria-label="Status" id="pj_f"><button type="button" role="radio" data-v="ativos">Em andamento</button><button type="button" role="radio" data-v="entregue">Entregues</button><button type="button" role="radio" data-v="todos">Todos</button></div>
        <label class="tb-search">${ic('search')}<input id="pj_q" type="search" placeholder="Buscar projeto ou cliente" aria-label="Buscar projetos" autocomplete="off"></label>
        <select id="pj_serv" aria-label="Serviço"><option value="">Todos os serviços</option>${SERVICOS.map((s) => `<option value="${s.k}">${s.l}</option>`).join('')}</select>
      </div>
      <div class="vbody" id="pj_body"></div>`;
    $('#pj_f', root).addEventListener('click', (e) => {
      const b = e.target.closest('[role=radio]');
      if (!b) return;
      Projetos.filtro = b.dataset.v;
      Projetos.render();
    });
    const q = $('#pj_q', root);
    q.value = Projetos.q;
    q.addEventListener('input', () => { Projetos.q = q.value; Projetos.render(); });
    const s = $('#pj_serv', root);
    s.value = Projetos.serv;
    s.addEventListener('change', () => { Projetos.serv = s.value; Projetos.render(); });
    on(root, '[data-new-venda]', 'click', () => winFlow());
  },
  render() {
    const body = $('#pj_body');
    if (!body) return;
    $$('#pj_f [role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === Projetos.filtro)));
    if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
    const all = Store.all('projetos');
    const ativos = all.filter((p) => PROJ_ATIVOS.includes(p.status));
    const aReceber = sum(ativos.concat(all.filter((p) => p.status === 'entregue')), (p) => Calc.projetoFin(p).pendente);
    $('#pj_sub').textContent = all.length ? `${plural(ativos.length, 'projeto em andamento', 'projetos em andamento')}, ${money0(sum(ativos, (p) => p.valor))} em carteira e ${money0(aReceber)} a receber.` : '';
    if (!all.length) {
      body.innerHTML = emptyState('Nenhum projeto ainda', 'Registre uma venda para criar o projeto e as parcelas no caixa.', `<button type="button" class="btn btn-primary" data-new-venda data-write>${ic('plus')}Registrar venda</button>`);
      on(body, '[data-new-venda]', 'click', () => winFlow());
      return;
    }
    const n = norm(Projetos.q).trim();
    const list = all
      .filter((p) => (Projetos.filtro === 'ativos' ? PROJ_ATIVOS.includes(p.status) : Projetos.filtro === 'entregue' ? p.status === 'entregue' : true))
      .filter((p) => !Projetos.serv || p.servico === Projetos.serv)
      .filter((p) => !n || norm(p.titulo).includes(n) || norm(clienteNome(p.clienteId)).includes(n))
      .sort((a, b) => {
        const order = ['revisao', 'desenvolvimento', 'planejamento', 'pausado', 'entregue', 'cancelado'];
        return order.indexOf(a.status) - order.indexOf(b.status) || String(a.prazo || '9999').localeCompare(String(b.prazo || '9999'));
      });
    const t = today();
    body.innerHTML = list.length
      ? `<div class="tbl-wrap panel"><table class="tbl tbl-click tbl-cards k3"><thead><tr><th>Projeto</th><th>Status</th><th class="num">Valor</th><th class="col-pay">Recebido</th><th>Prazo</th><th>Equipe</th></tr></thead><tbody>${list
          .map((p) => {
            const f = Calc.projetoFin(p);
            const late = p.prazo && PROJ_ATIVOS.includes(p.status) && p.status !== 'pausado' && p.prazo < t;
            return `<tr data-id="${esc(p.id)}" tabindex="0"><td class="ga-main"><b>${esc(p.titulo)}</b>${demoTag(p)}<small class="cell-sub">${esc(clienteNome(p.clienteId))} · ${esc(SERVICO[p.servico] || '')}</small></td><td class="ga-sub">${statusPill(p.status)}</td><td class="num ga-val">${money0(p.valor)}</td><td class="col-pay ga-full"><div class="paycell">${meter(f.pct)}<small>${money0(f.recebido)} recebido${f.pendente ? ` · ${money0(f.pendente)} a receber` : ''}</small></div></td><td class="ga-side">${p.prazo ? (late ? pill(`Atrasado · ${fmtDateShort(p.prazo)}`, 'bad', 'alert') : `<span class="nowrap">${fmtDate(p.prazo)}</span>`) : '<span class="muted dash">—</span>'}</td><td class="hide-sm"><span class="av-pair">${avatar(p.vendedor, 'sm')}${avatar(p.executor, 'sm')}</span></td></tr>`;
          })
          .join('')}</tbody></table></div>`
      : emptyState('Nenhum projeto com esses filtros', 'Troque o filtro de status ou limpe a busca.');
    $$('tr[data-id]', body).forEach((tr) => {
      tr.addEventListener('click', () => showProjeto(tr.dataset.id));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') showProjeto(tr.dataset.id); });
    });
  },
};
