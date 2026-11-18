/* ───────────────────────── ÁREAS: Sites, Automações, Sistemas ───────────────────────── */
const AREAS = {
  sites: { k: 'site', titulo: 'Sites', ic: 'globe', desc: 'Sites institucionais, páginas comerciais, landing pages e experiências digitais com foco em identidade, desempenho e conversão.' },
  automacoes: { k: 'automacao', titulo: 'Automações', ic: 'bolt', desc: 'Soluções que reduzem tarefas repetitivas, otimizam processos internos e facilitam a comunicação e a gestão das empresas.' },
  sistemas: { k: 'sistema', titulo: 'Sistemas', ic: 'layers', desc: 'Painéis administrativos, plataformas de gerenciamento e ferramentas operacionais feitas para cada negócio.' },
};

function areaView(route) {
  const A = AREAS[route];
  const st = { aba: 'abertos' };
  return {
    mount(root) {
      root.innerHTML = `<div class="vhead"><div><h1 class="area-h">${ic(A.ic)}${esc(A.titulo)}</h1><p class="vsub">${esc(A.desc)}</p></div>
        <div class="vactions"><button type="button" class="btn" data-ar-venda data-write>${ic('trophy')}Nova venda</button><button type="button" class="btn btn-primary" data-ar-lead data-write>${ic('plus')}Novo lead</button></div></div>
        <div class="vbody" id="ar_body"></div>`;
      on(root, '[data-ar-lead]', 'click', () => editLead(null, { servicos: [A.k] }));
      on(root, '[data-ar-venda]', 'click', () => winFlow());
    },
    render() {
      const body = $('#ar_body');
      if (!body) return;
      if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
      const t = today();
      const ano = t.slice(0, 4);
      const leads = Store.all('leads').filter((l) => (l.servicos || []).includes(A.k));
      const abertos = leads.filter((l) => ABERTAS.includes(l.etapa)).sort(sortLeads);
      const ganhos = leads.filter((l) => l.etapa === 'ganho').length;
      const perdidos = leads.filter((l) => l.etapa === 'perdido').length;
      const projs = Store.all('projetos').filter((p) => p.servico === A.k && p.status !== 'cancelado');
      const ativos = projs.filter((p) => PROJ_ATIVOS.includes(p.status));
      const doAno = projs.filter((p) => String(p.dataFechamento || '').slice(0, 4) === ano);
      const ids = new Set(projs.map((p) => p.id));
      const lancs = Store.all('lancamentos').filter((l) => l.tipo === 'entrada' && ids.has(l.projetoId));
      const recebido = sum(lancs.filter((l) => l.pagoEm && l.pagoEm.slice(0, 4) === ano), (l) => l.valor);
      const aReceber = sum(lancs.filter((l) => !l.pagoEm), (l) => l.valor);
      const pipe = sum(abertos, (l) => l.valor);
      const ticket = projs.length ? sum(projs, (p) => p.valor) / projs.length : 0;
      const clientes = uniq(projs.map((p) => p.clienteId)).map((id) => Store.get('clientes', id)).filter(Boolean);

      const kpis = [
        ['Em negociação', money0(pipe), plural(abertos.length, 'lead aberto', 'leads abertos')],
        [`Vendido em ${ano}`, money0(sum(doAno, (p) => p.valor)), plural(doAno.length, 'projeto', 'projetos')],
        [`Recebido em ${ano}`, money0(recebido), aReceber ? `${money0(aReceber)} a receber` : 'nada pendente'],
        ['Em andamento', fmtNum(ativos.length), plural(clientes.length, 'cliente na área', 'clientes na área')],
        ['Ticket médio', projs.length ? money0(ticket) : '—', ganhos + perdidos ? `conversão de ${pct(ganhos / (ganhos + perdidos))}` : 'sem negócios fechados'],
      ];
      const tabs = [['abertos', `Negócios abertos (${abertos.length})`], ['projetos', `Projetos (${projs.length})`], ['clientes', `Clientes (${clientes.length})`]];
      let lista = '';
      if (st.aba === 'abertos') {
        lista = abertos.length
          ? `<table class="tbl tbl-click tbl-cards k3"><thead><tr><th>Empresa</th><th>Etapa</th><th class="num">Valor</th><th>Próximo contato</th><th>Resp.</th></tr></thead><tbody>${abertos.map((l) => `<tr data-lead="${esc(l.id)}" tabindex="0"><td class="ga-main"><b>${esc(l.empresa)}</b>${demoTag(l)}<small class="cell-sub">${esc([l.contato, l.cidade].filter(Boolean).join(' · '))}</small></td><td class="ga-sub">${pill(ETAPA[l.etapa].l, 'blue')}</td><td class="num ga-val">${l.valor ? money0(l.valor) : '<span class="dash">—</span>'}</td><td class="ga-full">${l.proximoContato ? followChip(l.proximoContato) : '<span class="muted dash">—</span>'}</td><td class="ga-side">${avatar(l.responsavel, 'sm')}</td></tr>`).join('')}</tbody></table>`
          : `<div class="pad">${emptyState(`Nenhum negócio de ${A.titulo.toLowerCase()} aberto`, 'Cadastre um lead com esse interesse para ele aparecer aqui.')}</div>`;
      } else if (st.aba === 'projetos') {
        const ord = ['revisao', 'desenvolvimento', 'planejamento', 'pausado', 'entregue'];
        const ps = projs.slice().sort((a, b) => ord.indexOf(a.status) - ord.indexOf(b.status));
        lista = ps.length
          ? `<table class="tbl tbl-click tbl-cards k3"><thead><tr><th>Projeto</th><th>Status</th><th class="num">Valor</th><th class="col-pay">Recebido</th><th>Prazo</th></tr></thead><tbody>${ps.map((p) => { const f = Calc.projetoFin(p); const late = p.prazo && PROJ_ATIVOS.includes(p.status) && p.status !== 'pausado' && p.prazo < t; return `<tr data-proj="${esc(p.id)}" tabindex="0"><td class="ga-main"><b>${esc(p.titulo)}</b>${demoTag(p)}<small class="cell-sub">${esc(clienteNome(p.clienteId))}</small></td><td class="ga-sub">${statusPill(p.status)}</td><td class="num ga-val">${money0(p.valor)}</td><td class="col-pay ga-full"><div class="paycell">${meter(f.pct)}<small>${money0(f.recebido)} recebido${f.pendente ? ` · ${money0(f.pendente)} a receber` : ''}</small></div></td><td class="ga-side">${p.prazo ? (late ? pill(`Atrasado · ${fmtDateShort(p.prazo)}`, 'bad', 'alert') : `<span class="nowrap">${fmtDate(p.prazo)}</span>`) : '<span class="muted dash">—</span>'}</td></tr>`; }).join('')}</tbody></table>`
          : `<div class="pad">${emptyState(`Nenhum projeto de ${A.titulo.toLowerCase()} ainda`, 'Quando uma venda dessa área for registrada, o projeto aparece aqui.')}</div>`;
      } else {
        lista = clientes.length
          ? `<table class="tbl tbl-click tbl-cards k2"><thead><tr><th>Cliente</th><th>Contato</th><th class="num">Projetos na área</th><th class="num">Valor vendido</th></tr></thead><tbody>${clientes.map((c) => { const cp = projs.filter((p) => p.clienteId === c.id); return `<tr data-cli="${esc(c.id)}" tabindex="0"><td class="ga-main"><b>${esc(c.nome)}</b>${demoTag(c)}<small class="cell-sub">${esc([c.segmento, c.cidade].filter(Boolean).join(' · '))}</small></td><td class="ga-sub">${esc(c.contato || '—')}</td><td class="num ga-side" data-label="projetos">${cp.length}</td><td class="num ga-val">${money0(sum(cp, (p) => p.valor))}</td></tr>`; }).join('')}</tbody></table>`
          : `<div class="pad">${emptyState('Nenhum cliente nesta área ainda', 'Clientes aparecem aqui quando compram um projeto dessa área.')}</div>`;
      }
      body.innerHTML = `<section class="kpis kpis-5" aria-label="Indicadores de ${esc(A.titulo)}">${kpis.map(([l, v, s]) => `<div class="kpi"><span class="kpi-l">${esc(l)}</span><b class="kpi-v">${v}</b><small>${esc(s)}</small></div>`).join('')}</section>
        <section class="panel"><div class="tabs in-panel" role="tablist" aria-label="Listas da área">${tabs.map(([k, l]) => `<button type="button" role="tab" data-aba="${k}" aria-selected="${st.aba === k}">${esc(l)}</button>`).join('')}</div><div class="tbl-wrap">${lista}</div></section>`;
      on(body, '[data-aba]', 'click', (e, b) => { st.aba = b.dataset.aba; this.render(); });
      const bindRows = (sel, fn) => $$(sel, body).forEach((tr) => { tr.addEventListener('click', () => fn(tr)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') fn(tr); }); });
      bindRows('tr[data-lead]', (tr) => showLead(tr.dataset.lead));
      bindRows('tr[data-proj]', (tr) => showProjeto(tr.dataset.proj));
      bindRows('tr[data-cli]', (tr) => showCliente(tr.dataset.cli));
    },
  };
}
const AreaSites = areaView('sites');
const AreaAutomacoes = areaView('automacoes');
const AreaSistemas = areaView('sistemas');
