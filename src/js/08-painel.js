/* ───────────────────────── PAINEL ───────────────────────── */
function skeleton() {
  return `<div class="skel" aria-busy="true" aria-label="Carregando dados"><div class="sk sk-hero"></div><div class="sk sk-row"></div><div class="sk-grid"><div class="sk"></div><div class="sk"></div></div></div>`;
}
const dadosProntos = () => S.ready || S.timedOut || S.mode === 'local';

function delta(cur, prev, upGood, prevMonth) {
  if (!prev) return '';
  const r = (cur - prev) / Math.abs(prev);
  if (Math.abs(r) < 0.005) return `<span class="delta flat">igual a ${monthLabel(prevMonth, 'short')}</span>`;
  const good = r > 0 === upGood;
  return `<span class="delta ${good ? 'up-good' : 'up-bad'}">${ic(r > 0 ? 'trend-up' : 'trend-down')}${pct(Math.abs(r))} vs ${monthLabel(prevMonth, 'short')}</span>`;
}

const Painel = {
  mes: thisMonth(),
  animated: false,
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Painel</h1><p class="vsub" id="pn_sub"></p></div>
      <div class="month-nav" role="group" aria-label="Período do painel"><button type="button" class="icon-btn" data-m="-1" aria-label="Mês anterior">${ic('left')}</button><span id="pn_mes" aria-live="polite"></span><button type="button" class="icon-btn" data-m="1" aria-label="Próximo mês">${ic('right')}</button><button type="button" class="btn btn-ghost btn-sm" data-m="0" id="pn_hoje">Voltar ao mês atual</button></div></div>
      <div class="vbody" id="pn_body"></div>`;
    on(root, '[data-m]', 'click', (e, b) => {
      const d = +b.dataset.m;
      Painel.mes = d === 0 ? thisMonth() : monthAdd(Painel.mes, d);
      Painel.render();
    });
  },
  render() {
    const m = Painel.mes;
    $('#pn_mes').textContent = monthLabel(m);
    $('#pn_hoje').hidden = m === thisMonth();
    const body = $('#pn_body');
    if (!dadosProntos()) {
      body.innerHTML = skeleton();
      return;
    }
    const hora = new Date().getHours();
    const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    $('#pn_sub').textContent = `${saud}${S.me ? ', ' + meNome() : ''}. ${cap(weekdayLabel(today()))}, ${fmtDateShort(today())}.`;

    const prevM = monthAdd(m, -1);
    const saldo = Calc.saldoAtual();
    const mx = Calc.mes(m);
    const mp = Calc.mes(prevM);
    const rec = Calc.emAberto('entrada');
    const pag = Calc.emAberto('saida');
    const pipe = Calc.pipeline();
    const conv = Calc.conversao();
    const vend = Calc.vendasMes(m);
    const vendP = Calc.vendasMes(prevM);
    const novos = Calc.leadsNovosMes(m);
    const novosP = Calc.leadsNovosMes(prevM);
    const mrr = Calc.mrr();
    const meta = cfg().metaMensal;
    const animate = !Painel.animated && !reduceMotion();

    const hero = `<section class="hero" id="hero">
      ${heroArt()}
      <div class="hero-main">
        <p class="hero-l">Saldo em caixa hoje</p>
        <p class="hero-v${saldo < 0 ? ' neg' : ''}" id="hero_v">${money(saldo)}</p>
        <p class="hero-s">${mrr.entrada ? `Receita recorrente de ${money0(mrr.entrada)} por mês. ` : ''}Custos fixos de ${money0(mrr.saida)} por mês.</p>
      </div>
      <dl class="hero-side">
        <div><dt>Resultado de ${MESES[+m.slice(5, 7) - 1]}</dt><dd>${signedMoney0(mx.resultado)}</dd><small>${money0(mx.recebido)} entrou, ${money0(mx.pago)} saiu</small></div>
        <div><dt>A receber</dt><dd>${money0(rec.total)}</dd><small>${rec.atrasados.length ? `${money0(rec.totalAtrasado)} em atraso` : 'nada em atraso'}</small></div>
        <div><dt>A pagar</dt><dd>${money0(pag.total)}</dd><small>${pag.atrasados.length ? `${money0(pag.totalAtrasado)} em atraso` : 'nada em atraso'}</small></div>
      </dl>
    </section>`;

    const f6 = Calc.fluxo(m, 6);
    const sparkIn = spark(f6.map((x) => x.entradas), 'Recebido nos últimos 6 meses');
    const sparkOut = spark(f6.map((x) => x.saidas), 'Despesas nos últimos 6 meses');
    const sparkLeads = spark([5, 4, 3, 2, 1, 0].map((i) => Calc.leadsNovosMes(monthAdd(m, -i))), 'Leads novos nos últimos 6 meses');
    const kpis = [
      { l: 'Recebido no mês', sp: sparkIn, v: money0(mx.recebido), d: delta(mx.recebido, mp.recebido, true, prevM), x: meta ? `${meter(mx.recebido / meta, mx.recebido >= meta ? 'done' : '')}<small>${pct(mx.recebido / meta)} da meta de ${money0(meta)}</small>` : `<button type="button" class="link small" data-goto="ajustes">Definir uma meta mensal</button>` },
      { l: 'Despesas pagas', sp: sparkOut, v: money0(mx.pago), d: delta(mx.pago, mp.pago, false, prevM) },
      { l: 'Vendas fechadas', v: money0(vend.total), d: delta(vend.total, vendP.total, true, prevM), x: `<small>${plural(vend.n, 'projeto', 'projetos')}</small>` },
      { l: 'Leads novos', sp: sparkLeads, v: fmtNum(novos), d: delta(novos, novosP, true, prevM) },
      { l: 'Em negociação', v: money0(pipe.total), x: `<small>${plural(pipe.n, 'lead aberto', 'leads abertos')}, previsão de ${money0(pipe.ponderado)}</small>` },
      { l: 'Conversão', v: conv.taxa === null ? '—' : pct(conv.taxa), x: `<small>${conv.taxa === null ? 'nenhum negócio fechado ainda' : `${conv.ganhos} ganhos em ${conv.ganhos + conv.perdidos} negócios fechados`}</small>` },
    ];
    const kpiHTML = `<section class="kpis" aria-label="Indicadores de ${monthLabel(m)}">${kpis.map((k) => `<div class="kpi"><span class="kpi-l">${esc(k.l)}</span><span class="kpi-row"><b class="kpi-v">${k.v}</b>${k.sp || ''}</span>${k.d || ''}${k.x || ''}</div>`).join('')}</section>`;

    const aten = itensAtencao();
    const linkHTML = (a, i) => {
      if (!a.link) return '';
      if (a.link.href) return `<a class="btn btn-sm btn-wa attn-link" href="${esc(a.link.href)}" target="_blank" rel="noopener" data-attn-link="${i}" aria-label="${esc(a.link.label)}: ${esc(a.txt)}">${ic(a.link.ic)}<span>${esc(a.link.label)}</span></a>`;
      return `<button type="button" class="btn btn-sm attn-link" data-attn-fn="${i}" aria-label="${esc(a.link.label)}: ${esc(a.txt)}">${ic(a.link.ic)}<span>${esc(a.link.label)}</span></button>`;
    };
    const atenHTML = `<section class="panel attn"><div class="panel-h"><div><h3>Precisa de atenção</h3><p class="panel-sub">${aten.length ? plural(aten.length, 'item', 'itens') : 'Tudo em dia'}</p></div><button type="button" class="btn btn-ghost btn-sm" data-goto="agenda">Abrir agenda</button></div>
      ${aten.length ? `<ul class="attn-list">${aten.slice(0, 7).map((a, i) => `<li class="attn-i t-${a.tone}"><button type="button" class="attn-main" data-attn="${i}"><span class="attn-ic">${ic(a.ic)}</span><span class="attn-txt"><b>${esc(a.txt)}</b><small>${esc(a.meta || '')}</small></span></button><span class="attn-acts" data-write>${linkHTML(a, i)}${a.action ? `<button type="button" class="btn btn-sm" data-attn-act="${i}">${esc(a.action.label)}</button>` : ''}</span></li>`).join('')}</ul>${aten.length > 7 ? `<p class="muted small attn-more">Mais ${aten.length - 7} na agenda.</p>` : ''}` : `<div class="attn-ok">${ic('check')}<p>Nenhum follow-up, conta ou tarefa atrasada.</p></div>`}</section>`;

    // gráficos
    const fluxo = Calc.fluxo(m, 6);
    Charts.set('pn_flow', flowChartSpec(fluxo, m));
    const leadsAb = Calc.leadsAbertos();
    const funRows = ABERTAS.map((k, i) => {
      const ls = leadsAb.filter((l) => l.etapa === k);
      const v = sum(ls, (l) => l.valor);
      return { label: ETAPA[k].l, value: ls.length, sub: v ? moneyShort(v) : '', tip: [{ value: plural(ls.length, 'lead', 'leads'), label: 'nesta etapa' }, { value: money0(v), label: 'valor estimado' }, { value: money0(v * ETAPA[k].p), label: `previsão (${pct(ETAPA[k].p)})` }], onClick: () => go('funil') };
    });
    Charts.set('pn_funil', hbarSpec(funRows, { fmt: (v) => fmtNum(v), colors: ABERTAS.map((k, i) => `var(--ord-${i + 1})`), head: ['Etapa', 'Leads'], empty: 'Nenhum lead aberto. Cadastre o primeiro no funil.' }));
    const ano = m.slice(0, 4);
    const projAno = Store.all('projetos').filter((p) => String(p.dataFechamento || '').slice(0, 4) === ano && p.status !== 'cancelado');
    const servRows = SERVICOS.map((s) => {
      const ps = projAno.filter((p) => (p.servico || 'outro') === s.k);
      return { label: s.l, value: sum(ps, (p) => p.valor), n: ps.length, tip: [{ value: money(sum(ps, (p) => p.valor)), label: 'vendido' }, { value: plural(ps.length, 'projeto', 'projetos'), label: '' }] };
    })
      .filter((r) => r.value > 0 || r.label !== 'Outro')
      .sort((a, b) => b.value - a.value);
    Charts.set('pn_serv', hbarSpec(servRows, { fmt: moneyShort, head: ['Serviço', 'Vendido'], tableRow: (r) => [r.label, money(r.value)], empty: `Nenhuma venda registrada em ${ano}.` }));
    const leadsAll = Store.all('leads');
    const origens = uniq([...cfg().origens, ...leadsAll.map((l) => l.origem || 'Sem origem')]);
    const origRows = origens
      .map((o) => {
        const ls = leadsAll.filter((l) => (l.origem || 'Sem origem') === o);
        const g = ls.filter((l) => l.etapa === 'ganho').length;
        return { label: o, value: ls.length, sub: g ? `${g} ${g === 1 ? 'virou cliente' : 'viraram clientes'}` : '', tip: [{ value: plural(ls.length, 'lead', 'leads'), label: 'no total' }, { value: plural(g, 'ganho', 'ganhos'), label: '' }] };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
    Charts.set('pn_orig', hbarSpec(origRows, { fmt: (v) => fmtNum(v), head: ['Origem', 'Leads'], empty: 'Nenhum lead cadastrado ainda.' }));

    // próximos 7 dias
    const t = today();
    const fim = addDays(t, 7);
    const ag = [];
    Calc.leadsAbertos().forEach((l) => { if (l.proximoContato && l.proximoContato > t && l.proximoContato <= fim) ag.push({ d: l.proximoContato, ic: 'clock', txt: `Falar com ${l.empresa}`, sub: l.proximaAcao || '', who: l.responsavel, open: () => showLead(l.id) }); });
    Calc.tarefasAbertas().forEach((x) => { if (x.prazo && x.prazo > t && x.prazo <= fim) ag.push({ d: x.prazo, ic: 'check', txt: x.titulo, sub: vinculoLabel(x.vinculo), who: x.responsavel, open: () => editTarefa(x.id) }); });
    Store.all('lancamentos').forEach((l) => { if (!l.pagoEm && l.vencimento > t && l.vencimento <= fim) ag.push({ d: l.vencimento, ic: l.tipo === 'entrada' ? 'in' : 'out', txt: l.descricao, sub: `${l.tipo === 'entrada' ? 'Receber' : 'Pagar'} ${money(l.valor)}`, open: () => editLancamento(l.id) }); });
    ag.sort((a, b) => a.d.localeCompare(b.d));
    const agHTML = `<section class="panel"><div class="panel-h"><div><h3>Próximos 7 dias</h3><p class="panel-sub">Contatos, tarefas e vencimentos</p></div></div>${ag.length ? `<ul class="week">${ag.slice(0, 9).map((a, i) => `<li><button type="button" class="week-i" data-ag="${i}"><span class="week-d"><b>${+a.d.slice(8, 10)}</b><small>${DIAS_SEM[parseD(a.d).getDay()].slice(0, 3)}</small></span><span class="week-ic">${ic(a.ic)}</span><span class="week-t"><b>${esc(a.txt)}</b><small>${esc(a.sub)}</small></span>${a.who ? avatar(a.who, 'sm') : ''}</button></li>`).join('')}</ul>${ag.length > 9 ? `<p class="muted small attn-more">Mais ${ag.length - 9} na agenda.</p>` : ''}` : '<p class="muted pad">Nada agendado para os próximos dias.</p>'}</section>`;

    // sócios
    const socRows = [
      ['Leads abertos', (k) => Calc.leadsAbertos().filter((l) => l.responsavel === k).length],
      ['Follow-ups atrasados ou de hoje', (k) => Calc.followups().filter((f) => f.lead.responsavel === k && f.data <= t).length],
      ['Tarefas abertas', (k) => Calc.tarefasAbertas().filter((x) => x.responsavel === k).length],
      [`Vendido em ${MESES[+m.slice(5, 7) - 1]}`, (k) => money0(sum(Store.all('projetos').filter((p) => p.vendedor === k && monthOf(p.dataFechamento) === m && p.status !== 'cancelado'), (p) => p.valor))],
      ['Projetos em execução', (k) => Store.all('projetos').filter((p) => p.executor === k && PROJ_ATIVOS.includes(p.status)).length],
    ];
    const socHTML = `<section class="panel"><div class="panel-h"><div><h3>Sócios</h3><p class="panel-sub">Quem está com o quê</p></div></div><div class="tbl-wrap"><table class="tbl tbl-compact socios"><thead><tr><th></th>${SOCIOS.map((k) => `<th class="num"><span class="th-av">${avatar(k, 'sm')}${esc(socioNome(k))}</span></th>`).join('')}</tr></thead><tbody>${socRows.map(([l, f]) => `<tr><td>${esc(l)}</td>${SOCIOS.map((k) => `<td class="num">${esc(f(k))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;

    const legend = legendItem('var(--series-in)', 'Entradas') + legendItem('var(--series-out)', 'Saídas') + legendItem('var(--ink)', 'Resultado', 'dot');
    body.innerHTML = `${hero}${inicioHTML()}${kpiHTML}
      <div class="grid g-21">${chartPanel({ id: 'pn_flow', title: 'Entradas e saídas', sub: 'Últimos 6 meses, pela data do pagamento', legend, cls: 'fill' })}${atenHTML}</div>
      <div class="grid g-111">${chartPanel({ id: 'pn_funil', title: 'Funil de vendas', sub: `${plural(pipe.n, 'lead aberto', 'leads abertos')} por etapa` })}${chartPanel({ id: 'pn_serv', title: 'Vendas por serviço', sub: `Projetos fechados em ${ano}` })}${chartPanel({ id: 'pn_orig', title: 'De onde vêm os leads', sub: 'Todos os leads, por origem' })}</div>
      <div class="grid g-11">${agHTML}${socHTML}</div>`;

    Charts.mount(body);
    on(body, '[data-goto]', 'click', (e, b) => go(b.dataset.goto));
    on(body, '[data-attn]', 'click', (e, b) => aten[+b.dataset.attn].open());
    on(body, '[data-attn-act]', 'click', (e, b) => aten[+b.dataset.attnAct].action.fn());
    on(body, '[data-attn-link]', 'click', (e, b) => { const a = aten[+b.dataset.attnLink]; if (a && a.link && a.link.onClick) a.link.onClick(); });
    on(body, '[data-attn-fn]', 'click', (e, b) => { const a = aten[+b.dataset.attnFn]; if (a && a.link && a.link.fn) a.link.fn(); });
    bindInicio(body);
    on(body, '[data-ag]', 'click', (e, b) => ag[+b.dataset.ag].open());
    bindHero($('#hero', body), saldo, animate);
    Painel.animated = true;
  },
};

/* ── "Comece por aqui": passos para deixar o CRM pronto, conferidos pelos próprios dados ── */
function lsGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function passosInicio() {
  const real = (col) => Store.all(col).filter((r) => !r.demo);
  const outro = S.me === 'rafael' ? 'pedro' : S.me === 'pedro' ? 'rafael' : null;
  const outroEntrou = outro && COLS.some((c) => real(c).some((r) => r.criadoPor === outro || (r.historico || []).some((h) => h.autor === outro)));
  return [
    { k: 'me', t: 'Diga quem é você', d: 'Assim o CRM registra quem fez cada contato e monta a sua agenda.', ok: !!S.me, b: 'Escolher', fn: () => go('ajustes') },
    { k: 'saldo', t: 'Informe o saldo do caixa', d: 'Quanto há na conta hoje. O painel e a projeção partem desse valor.', ok: !!cfg().saldoInicialData, b: 'Informar', fn: () => go('ajustes') },
    { k: 'fixos', t: 'Cadastre os custos fixos', d: 'Hospedagem, ferramentas, contador: entram sozinhos no caixa todo mês.', ok: real('recorrencias').some((r) => r.tipo === 'saida'), b: 'Cadastrar', fn: () => editRecorrencia(null, { tipo: 'saida', forma: 'Cartão' }) },
    { k: 'lead', t: 'Coloque os leads no funil', d: 'Importe as conversas do WhatsApp: o Claude lê e preenche cada lead.', ok: real('leads').length > 0, b: 'Importar conversas', fn: () => abrirConversas() },
    { k: 'piloto', t: 'Confira o piloto automático', d: 'Veja o que o CRM faz sozinho e ajuste ao jeito de vocês.', ok: lsGet('prisma-crm-piloto-visto') === '1', b: 'Abrir', fn: () => go('piloto') },
    outro && Host ? { k: 'socio', t: `Chame o ${socioNome(outro)}`, d: `Gere um código de acesso e mande para o ${socioNome(outro)}. Ele cria a senha e entra no CRM.`, ok: !!outroEntrou || Conta.ativo(outro), b: 'Gerar código', fn: () => Conta.convite(outro) } : null,
    outro && !Host ? { k: 'socio', t: `Chame o ${socioNome(outro)}`, d: `Compartilhe o CRM com o ${socioNome(outro)} como Editor. Vale assim que ele registrar algo.`, ok: !!outroEntrou, b: 'Como fazer', fn: () => go('ajustes') } : null,
    { k: 'demo', t: 'Apague os exemplos', d: 'Quando estiver pronto para usar de verdade. O que vocês cadastraram fica.', ok: !Store.hasDemo(), b: 'Apagar', fn: () => apagarExemplos() },
  ].filter(Boolean);
}
function inicioHTML() {
  if (S.readOnly || lsGet('prisma-crm-inicio-oculto') === '1') return '';
  const ps = passosInicio();
  const feitos = ps.filter((x) => x.ok).length;
  if (feitos === ps.length) return '';
  const prox = ps.findIndex((x) => !x.ok);
  return `<section class="panel start" aria-labelledby="st_t"><div class="panel-h"><div><h3 id="st_t">Comece por aqui</h3><p class="panel-sub">${feitos} de ${ps.length} passos para deixar o CRM pronto</p></div><button type="button" class="btn btn-ghost btn-sm" data-start-hide>Ocultar</button></div>
    <div class="start-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${ps.length}" aria-valuenow="${feitos}" aria-label="Passos concluídos"><i style="width:${((feitos / ps.length) * 100).toFixed(1)}%"></i></div>
    <ol class="start-list">${ps.map((x, i) => `<li class="${x.ok ? 'ok' : ''}${i === prox ? ' next' : ''}"><span class="st-n" aria-hidden="true">${x.ok ? ic('check') : i + 1}</span><span class="st-t"><b>${esc(x.t)}</b><small>${esc(x.d)}</small></span>${x.ok ? '<span class="sr">concluído</span>' : `<button type="button" class="btn btn-sm${i === prox ? ' btn-primary' : ''}" data-start="${i}">${esc(x.b)}</button>`}</li>`).join('')}</ol></section>`;
}
function bindInicio(body) {
  const ps = passosInicio();
  on(body, '[data-start]', 'click', (e, b) => { const x = ps[+b.dataset.start]; if (x) x.fn(); });
  on(body, '[data-start-hide]', 'click', () => {
    try { localStorage.setItem('prisma-crm-inicio-oculto', '1'); } catch {}
    toast('Passos ocultados. Dá para ver o que falta em Ajustes.');
    Painel.render();
  });
}

function heroArt() {
  // luz branca entra pela esquerda, atravessa o prisma e sai em cinco raios azuis
  return `<svg class="hero-art" viewBox="0 0 640 240" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
    <path class="ha-in" d="M40 -10 325.4 110"/>
    <path class="ha-pass" d="M325.4 110 401 125"/>
    <path class="ha-prism" d="M360 30 440 215H280Z"/>
    <g class="ha-rays">
      <path class="r1" d="M401 125 700 4"/>
      <path class="r2" d="M401 125 700 72"/>
      <path class="r3" d="M401 125 700 140"/>
      <path class="r4" d="M401 125 700 208"/>
      <path class="r5" d="M401 125 700 276"/>
    </g>
  </svg>`;
}
function bindHero(hero, saldo, animate) {
  if (!hero) return;
  if (animate) {
    hero.classList.add('intro');
    const el = $('#hero_v', hero);
    const t0 = performance.now();
    const dur = 900;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      if (el.isConnected) el.textContent = money(saldo * e);
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
      else if (el.isConnected) el.textContent = money(saldo);
    };
    requestAnimationFrame(step);
  }
  if (reduceMotion()) return;
  let raf = 0;
  hero.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      hero.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      hero.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      hero.style.setProperty('--px', ((x - 0.5) * 2).toFixed(3));
      hero.style.setProperty('--py', ((y - 0.5) * 2).toFixed(3));
    });
  });
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--px', '0');
    hero.style.setProperty('--py', '0');
  });
}
