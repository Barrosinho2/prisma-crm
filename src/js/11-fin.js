/* ───────────────────────── FINANCEIRO ───────────────────────── */
const Fin = {
  tab: 'mes',
  mes: thisMonth(),
  tipo: '',
  status: '',
  cat: '',
  q: '',
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Financeiro</h1><p class="vsub" id="fi_sub"></p></div><div class="vactions">${extratoBotao('btn btn-ghost')}<button type="button" class="btn" data-nova="entrada" data-write>${ic('in')}Nova entrada</button><button type="button" class="btn btn-primary" data-nova="saida" data-write>${ic('out')}Nova despesa</button></div></div>
      <div class="tabs" role="tablist" aria-label="Seções do financeiro" id="fi_tabs"><button type="button" role="tab" data-t="mes" id="fit_mes">Caixa do mês</button><button type="button" role="tab" data-t="aberto" id="fit_aberto">A receber e a pagar</button><button type="button" role="tab" data-t="recorrencias" id="fit_recorrencias">Recorrências</button><button type="button" role="tab" data-t="projecao" id="fit_projecao">Projeção</button></div>
      <div class="vbody" id="fi_body" role="tabpanel"></div>`;
    $('#fi_tabs', root).addEventListener('click', (e) => {
      const b = e.target.closest('[role=tab]');
      if (!b) return;
      Fin.tab = b.dataset.t;
      Fin.render();
    });
    $('#fi_tabs', root).addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const tabs = $$('[role=tab]', root);
      const i = tabs.findIndex((t) => t.dataset.t === Fin.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      const n = tabs[(i + tabs.length) % tabs.length];
      Fin.tab = n.dataset.t;
      Fin.render();
      n.focus();
    });
    on(root, '[data-nova]', 'click', (e, b) => editLancamento(null, { tipo: b.dataset.nova, categoria: b.dataset.nova === 'entrada' ? 'Projetos' : '' }));
  },
  render() {
    const body = $('#fi_body');
    if (!body) return;
    $$('#fi_tabs [role=tab]').forEach((t) => {
      t.setAttribute('aria-selected', String(t.dataset.t === Fin.tab));
      t.tabIndex = t.dataset.t === Fin.tab ? 0 : -1;
    });
    body.setAttribute('aria-labelledby', 'fit_' + Fin.tab);
    if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
    const saldo = Calc.saldoAtual();
    const rec = Calc.emAberto('entrada');
    const pag = Calc.emAberto('saida');
    $('#fi_sub').textContent = `Saldo em caixa hoje: ${money(saldo)}. A receber ${money0(rec.total)}, a pagar ${money0(pag.total)}.`;
    if (Fin.tab === 'aberto') return Fin.renderAberto(body, rec, pag);
    if (Fin.tab === 'recorrencias') return Fin.renderRec(body);
    if (Fin.tab === 'projecao') return Fin.renderProj(body);
    return Fin.renderMes(body, saldo);
  },
  renderMes(body, saldo) {
    const m = Fin.mes;
    const x = Calc.mes(m);
    const t = today();
    const pend = Calc.recPendentes(m);
    const doMes = Store.all('lancamentos').filter((l) => monthOf(l.vencimento) === m);
    const n = norm(Fin.q).trim();
    const list = doMes
      .filter((l) => !Fin.tipo || l.tipo === Fin.tipo)
      .filter((l) => !Fin.cat || l.categoria === Fin.cat)
      .filter((l) => !Fin.status || (Fin.status === 'aberto' ? !l.pagoEm : Calc.lancStatus(l, t) === Fin.status))
      .filter((l) => !n || norm(l.descricao).includes(n) || norm(clienteNome(l.clienteId)).includes(n))
      .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || (a.tipo === 'entrada' ? -1 : 1));
    const cats = uniq(doMes.map((l) => l.categoria).filter(Boolean)).sort(byName);
    const despCat = uniq(doMes.filter((l) => l.tipo === 'saida').map((l) => l.categoria || 'Sem categoria'))
      .map((c) => {
        const ls = doMes.filter((l) => l.tipo === 'saida' && (l.categoria || 'Sem categoria') === c);
        return { label: c, value: sum(ls, (l) => l.valor), tip: [{ value: money(sum(ls, (l) => l.valor)), label: 'no mês' }, { value: plural(ls.length, 'lançamento', 'lançamentos'), label: '' }] };
      })
      .sort((a, b) => b.value - a.value);
    Charts.set('fi_cat', hbarSpec(despCat, { fmt: moneyShort, head: ['Categoria', 'Valor'], tableRow: (r) => [r.label, money(r.value)], empty: 'Nenhuma despesa com vencimento neste mês.' }));
    const totE = sum(list.filter((l) => l.tipo === 'entrada'), (l) => l.valor);
    const totS = sum(list.filter((l) => l.tipo === 'saida'), (l) => l.valor);
    body.innerHTML = `
      <div class="fin-top">
        <div class="month-nav" role="group" aria-label="Mês"><button type="button" class="icon-btn" data-m="-1" aria-label="Mês anterior">${ic('left')}</button><span aria-live="polite">${monthLabel(m)}</span><button type="button" class="icon-btn" data-m="1" aria-label="Próximo mês">${ic('right')}</button>${m !== thisMonth() ? '<button type="button" class="btn btn-ghost btn-sm" data-m="0">Mês atual</button>' : ''}</div>
      </div>
      <section class="kpis kpis-4" aria-label="Resumo de ${monthLabel(m)}">
        <div class="kpi"><span class="kpi-l">Entradas recebidas</span><b class="kpi-v">${money0(x.recebido)}</b><small>${x.abertoEntrada ? `faltam ${money0(x.abertoEntrada)} de ${money0(x.previstoEntrada)} previstos` : x.previstoEntrada ? 'tudo o que vence no mês já entrou' : 'nada previsto para o mês'}</small></div>
        <div class="kpi"><span class="kpi-l">Saídas pagas</span><b class="kpi-v">${money0(x.pago)}</b><small>${x.abertoSaida ? `faltam ${money0(x.abertoSaida)} de ${money0(x.previstoSaida)} previstos` : x.previstoSaida ? 'tudo o que vence no mês já foi pago' : 'nada previsto para o mês'}</small></div>
        <div class="kpi"><span class="kpi-l">Resultado do mês</span><b class="kpi-v ${x.resultado < 0 ? 'neg' : ''}">${signedMoney0(x.resultado)}</b><small>previsto ${signedMoney0(x.previstoEntrada - x.previstoSaida)} com tudo pago</small></div>
        <div class="kpi"><span class="kpi-l">Saldo em caixa hoje</span><b class="kpi-v ${saldo < 0 ? 'neg' : ''}">${money0(saldo)}</b><small>${cfg().saldoInicialData ? `desde ${fmtDate(cfg().saldoInicialData)}` : 'soma de tudo que já foi pago'}</small></div>
      </section>
      ${pend.length && m <= monthAdd(thisMonth(), 1) ? (cfg().auto.recorrencias && m === thisMonth() && !S.readOnly ? `<div class="banner b-blue">${ic('plane')}<div><b>Lançando ${plural(pend.length, 'recorrência', 'recorrências')} de ${MESES[+m.slice(5, 7) - 1]} no caixa…</b> ${esc(pend.map((r) => r.descricao).join(', '))}.</div></div>` : `<div class="banner b-blue">${ic('repeat')}<div><b>${plural(pend.length, 'recorrência ainda não lançada', 'recorrências ainda não lançadas')} em ${MESES[+m.slice(5, 7) - 1]}:</b> ${esc(pend.map((r) => r.descricao).join(', '))}.${m > thisMonth() && cfg().auto.recorrencias ? ' O piloto automático lança no dia 1º; lance agora se quiser ver antes.' : ''}</div><button type="button" class="btn btn-sm btn-primary" data-lancar="${m}" data-write>Lançar agora</button></div>`) : ''}
      <div class="grid g-31">
        <section class="panel">
          <div class="toolbar in-panel">
            <div class="seg seg-sm" role="radiogroup" aria-label="Tipo" id="fi_tipo">${[['', 'Tudo'], ['entrada', 'Entradas'], ['saida', 'Saídas']].map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${Fin.tipo === v}">${l}</button>`).join('')}</div>
            <select id="fi_status" aria-label="Status"><option value="">Qualquer status</option><option value="aberto">Em aberto</option><option value="atrasado">Atrasados</option><option value="pago">Pagos ou recebidos</option></select>
            <select id="fi_cat" aria-label="Categoria"><option value="">Todas as categorias</option>${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
            <label class="tb-search">${ic('search')}<input id="fi_q" type="search" placeholder="Buscar descrição ou cliente" aria-label="Buscar lançamentos" autocomplete="off"></label>
          </div>
          ${list.length ? `<div class="tbl-wrap"><table class="tbl tbl-click fin-tbl tbl-cards kfin"><thead><tr><th>Vence</th><th>Descrição</th><th class="num">Valor</th><th>Status</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${list.map((l) => finRow(l)).join('')}</tbody><tfoot><tr><td colspan="2">${plural(list.length, 'lançamento', 'lançamentos')}</td><td class="num" colspan="3"><span class="pos">+${money(totE)}</span> <span class="neg">−${money(totS)}</span></td></tr></tfoot></table></div>` : `<div class="pad">${emptyState(doMes.length ? 'Nada com esses filtros' : 'Nenhum lançamento neste mês', doMes.length ? 'Limpe os filtros para ver tudo.' : 'Registre entradas e despesas, ou lance as recorrências do mês.', doMes.length ? '' : `<button type="button" class="btn btn-primary" data-nova2="saida" data-write>${ic('plus')}Nova despesa</button>`)}</div>`}
        </section>
        ${chartPanel({ id: 'fi_cat', title: 'Despesas por categoria', sub: `Com vencimento em ${MESES[+m.slice(5, 7) - 1]}` })}
      </div>`;
    on(body, '[data-m]', 'click', (e, b) => { const d = +b.dataset.m; Fin.mes = d === 0 ? thisMonth() : monthAdd(Fin.mes, d); Fin.render(); });
    on(body, '[data-lancar]', 'click', (e, b) => lancarRecorrencias(b.dataset.lancar));
    on(body, '[data-nova2]', 'click', (e, b) => editLancamento(null, { tipo: b.dataset.nova2 }));
    $('#fi_tipo', body).addEventListener('click', (e) => { const b = e.target.closest('[role=radio]'); if (!b) return; Fin.tipo = b.dataset.v; Fin.render(); });
    const st = $('#fi_status', body);
    st.value = Fin.status;
    st.addEventListener('change', () => { Fin.status = st.value; Fin.render(); });
    const ct = $('#fi_cat', body);
    ct.value = cats.includes(Fin.cat) ? Fin.cat : '';
    ct.addEventListener('change', () => { Fin.cat = ct.value; Fin.render(); });
    const q = $('#fi_q', body);
    q.value = Fin.q;
    q.addEventListener('input', () => {
      Fin.q = q.value;
      const pos = q.selectionStart;
      Fin.render();
      const nq = $('#fi_q');
      if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch {} }
    });
    bindFinRows(body);
    Charts.mount(body);
  },
  renderAberto(body, rec, pag) {
    const col = (titulo, d, tipo) => {
      const list = d.list.slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
      return `<section class="panel"><div class="panel-h"><div><h3>${titulo}</h3><p class="panel-sub">${money(d.total)}${d.atrasados.length ? ` · <span class="neg">${money(d.totalAtrasado)} em atraso</span>` : ''}</p></div><button type="button" class="btn btn-sm" data-nova3="${tipo}" data-write>${ic('plus')}Adicionar</button></div>
        ${list.length ? `<ul class="mini-list pad-x">${list.map((l) => lancMiniRow(l)).join('')}</ul>` : `<p class="muted pad">${tipo === 'entrada' ? 'Nada a receber.' : 'Nenhuma conta em aberto.'}</p>`}</section>`;
    };
    body.innerHTML = `<div class="grid g-11">${col('A receber', rec, 'entrada')}${col('A pagar', pag, 'saida')}</div>`;
    bindCommon(body);
    on(body, '[data-nova3]', 'click', (e, b) => editLancamento(null, { tipo: b.dataset.nova3 }));
  },
  renderRec(body) {
    const m = thisMonth();
    const recs = Store.all('recorrencias');
    const pend = Calc.recPendentes(m);
    const mrr = Calc.mrr();
    const sec = (titulo, tipo, vazio) => {
      const list = recs.filter((r) => r.tipo === tipo).sort((a, b) => (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) || (+a.dia || 0) - (+b.dia || 0));
      const tot = tipo === 'entrada' ? mrr.entrada : mrr.saida;
      return `<section class="panel"><div class="panel-h"><div><h3>${titulo}</h3><p class="panel-sub">${money(tot)} por mês${list.some((r) => r.frequencia === 'anual' && r.ativo) ? ' (anuais divididas por 12)' : ''}</p></div><button type="button" class="btn btn-sm" data-nrec="${tipo}" data-write>${ic('plus')}Adicionar</button></div>
        ${list.length ? `<div class="tbl-wrap"><table class="tbl tbl-click tbl-cards k2"><thead><tr><th>Descrição</th><th>Quando</th><th class="num">Valor</th><th>${esc(monthLabel(m, 'name'))}</th></tr></thead><tbody>${list
          .map((r) => {
            const aplica = Calc.recAplica(r, m);
            const lanc = aplica && Calc.recLancada(r, m);
            const pulada = aplica && !lanc && Calc.recPulada(r, m);
            return `<tr data-rec="${esc(r.id)}" tabindex="0" class="${r.ativo ? '' : 'off'}"><td class="ga-main"><b>${esc(r.descricao)}</b>${demoTag(r)}<small class="cell-sub">${esc(r.categoria || '')}${r.clienteId ? ' · ' + esc(clienteNome(r.clienteId)) : ''}</small></td><td class="nowrap ga-sub">${r.frequencia === 'anual' ? `todo ${esc(r.dia)} de ${MESES[(+r.mesAnual || 1) - 1]}` : `todo dia ${esc(r.dia)}`}</td><td class="num ga-val">${money(r.valor)}</td><td class="ga-side">${!r.ativo ? pill('Pausada', 'gray') : !aplica ? '<span class="muted small">não vence</span>' : lanc ? pill('Lançada', 'good', 'check') : pulada ? pill('Pulada', 'gray') : pill('A lançar', 'warn', 'repeat')}</td></tr>`;
          })
          .join('')}</tbody></table></div>` : `<p class="muted pad">${vazio}</p>`}</section>`;
    };
    const autoRec = cfg().auto.recorrencias;
    body.innerHTML = `${pend.length && !(autoRec && !S.readOnly) ? `<div class="banner b-blue">${ic('repeat')}<div><b>${plural(pend.length, 'recorrência de ' + MESES[+m.slice(5, 7) - 1] + ' ainda não lançada', 'recorrências de ' + MESES[+m.slice(5, 7) - 1] + ' ainda não lançadas')}.</b> Lançar cria os valores em aberto no caixa, com o vencimento de cada uma.</div><button type="button" class="btn btn-sm btn-primary" data-lancar="${m}" data-write>Lançar ${MESES[+m.slice(5, 7) - 1]}</button></div>` : pend.length ? `<div class="banner b-blue">${ic('plane')}<div><b>Lançando ${plural(pend.length, 'recorrência', 'recorrências')} de ${MESES[+m.slice(5, 7) - 1]} no caixa…</b></div></div>` : `<div class="banner b-good">${ic(autoRec ? 'plane' : 'check')}<div>Todas as recorrências de ${MESES[+m.slice(5, 7) - 1]} já estão no caixa.${autoRec ? ' O piloto automático lança as do próximo mês no dia 1º.' : ''}</div></div>`}
      <div class="grid g-11">${sec('Despesas fixas', 'saida', 'Cadastre assinaturas, hospedagem, contador e outros custos que se repetem.')}${sec('Receitas recorrentes', 'entrada', 'Mensalidades de manutenção e suporte aparecem aqui.')}</div>
      <section class="kpis kpis-3"><div class="kpi"><span class="kpi-l">Receita recorrente</span><b class="kpi-v">${money0(mrr.entrada)}</b><small>por mês</small></div><div class="kpi"><span class="kpi-l">Custos fixos</span><b class="kpi-v">${money0(mrr.saida)}</b><small>por mês</small></div><div class="kpi"><span class="kpi-l">Cobertura</span><b class="kpi-v">${mrr.saida ? pct(mrr.entrada / mrr.saida) : '—'}</b><small>dos custos fixos pagos pela receita recorrente</small></div></section>`;
    on(body, '[data-lancar]', 'click', (e, b) => lancarRecorrencias(b.dataset.lancar));
    on(body, '[data-nrec]', 'click', (e, b) => editRecorrencia(null, { tipo: b.dataset.nrec, forma: b.dataset.nrec === 'entrada' ? 'Pix' : 'Cartão' }));
    $$('tr[data-rec]', body).forEach((tr) => {
      tr.addEventListener('click', () => editRecorrencia(tr.dataset.rec));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') editRecorrencia(tr.dataset.rec); });
    });
  },
  renderProj(body) {
    const { pts, atrasadosEntrada, atrasadosSaida } = Calc.projecao(90);
    const at = (d) => pts[Math.min(d, pts.length - 1)].v;
    let minI = 0;
    pts.forEach((p, i) => { if (p.v < pts[minI].v) minI = i; });
    Charts.set('fi_proj', lineSpec(pts));
    const prox = [];
    pts.slice(0, 31).forEach((p) => p.itens.forEach((it) => prox.push({ d: p.d, ...it })));
    body.innerHTML = `<section class="kpis kpis-4" aria-label="Projeção">
        <div class="kpi"><span class="kpi-l">Hoje</span><b class="kpi-v">${money0(at(0))}</b><small>saldo depois do que vence hoje</small></div>
        <div class="kpi"><span class="kpi-l">Em 30 dias</span><b class="kpi-v ${at(30) < 0 ? 'neg' : ''}">${money0(at(30))}</b><small>${fmtDate(pts[30].d)}</small></div>
        <div class="kpi"><span class="kpi-l">Em 90 dias</span><b class="kpi-v ${at(90) < 0 ? 'neg' : ''}">${money0(at(90))}</b><small>${fmtDate(pts[90].d)}</small></div>
        <div class="kpi"><span class="kpi-l">Menor saldo previsto</span><b class="kpi-v ${pts[minI].v < 0 ? 'neg' : ''}">${money0(pts[minI].v)}</b><small>${minI === 0 ? 'hoje' : fmtDate(pts[minI].d)}</small></div>
      </section>
      <div class="grid g-21 top">
        ${chartPanel({ id: 'fi_proj', title: 'Saldo projetado para 90 dias', sub: 'Parte do saldo de hoje e soma o que vence: parcelas, contas e recorrências ainda não lançadas' })}
        <section class="panel"><div class="panel-h"><div><h3>Próximos 30 dias</h3><p class="panel-sub">O que mexe no caixa</p></div></div>${prox.length ? `<ul class="mini-list pad-x">${prox.slice(0, 8).map((it) => `<li><div class="mini-row static"><span class="mr-main"><b>${esc(it.desc)}</b><small>${it.d === today() ? 'hoje' : fmtDate(it.d)}${it.prev ? ' · previsto' : ''}</small></span><span class="mr-side"><small class="${it.v >= 0 ? 'pos' : 'neg'}">${signedMoney0(it.v)}</small></span></div></li>`).join('')}</ul>${prox.length > 8 ? `<p class="muted small attn-more">Mais ${prox.length - 8} até ${fmtDate(pts[30].d)}.</p>` : ''}` : '<p class="muted pad">Nada vence nos próximos 30 dias.</p>'}</section>
      </div>
      ${atrasadosEntrada || atrasadosSaida ? `<p class="muted small note">${ic('alert')}A projeção considera para hoje o que já está atrasado: ${money0(atrasadosEntrada)} a receber e ${money0(atrasadosSaida)} a pagar.</p>` : ''}`;
    Charts.mount(body);
  },
};

function finRow(l) {
  const s = Calc.lancStatus(l);
  const sign = l.tipo === 'entrada' ? '+' : '−';
  const sub = [l.categoria || '', l.clienteId ? clienteNome(l.clienteId) : '', l.socio ? socioNome(l.socio) : '', l.recorrenciaId ? 'recorrente' : ''].filter(Boolean).join(' · ');
  return `<tr data-lanc="${esc(l.id)}" tabindex="0" class="${s === 'atrasado' ? 'late' : ''}"><td class="nowrap ga-date">${fmtDateShort(l.vencimento)}</td><td class="ga-main"><span class="fin-desc">${ic(l.tipo === 'entrada' ? 'in' : 'out', l.tipo === 'entrada' ? 'ic-in' : 'ic-out')}<span><b>${esc(l.descricao)}</b>${demoTag(l)}${sub ? `<small class="cell-sub">${esc(sub)}</small>` : ''}</span></span></td><td class="num ga-val ${l.tipo === 'entrada' ? 'pos' : 'neg'}">${sign}${money(l.valor)}</td><td class="ga-stat">${lancPill(l)}</td><td class="act ga-act">${!l.pagoEm ? `<button type="button" class="btn btn-sm" data-pay="${esc(l.id)}" data-write>${ic('check')}${l.tipo === 'entrada' ? 'Recebido' : 'Pago'}</button>` : ''}</td></tr>`;
}
function bindFinRows(root) {
  $$('tr[data-lanc]', root).forEach((tr) => {
    tr.addEventListener('click', (e) => { if (!e.target.closest('[data-pay]')) editLancamento(tr.dataset.lanc); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) editLancamento(tr.dataset.lanc); });
  });
  on(root, '[data-pay]', 'click', (e, b) => { e.stopPropagation(); marcarPago(b.dataset.pay); });
}
