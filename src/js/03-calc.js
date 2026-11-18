/* ───────────────────────── cálculos derivados ───────────────────────── */
const Calc = {
  /* status de um lançamento: pago | atrasado | pendente */
  lancStatus(l, t = today()) {
    if (l.pagoEm) return 'pago';
    if (l.vencimento && l.vencimento < t) return 'atrasado';
    return 'pendente';
  },
  /* o saldo considera lançamentos pagos a partir da data do saldo inicial */
  saldoAtual(t = today()) {
    const c = cfg();
    const from = c.saldoInicialData || '';
    let s = +c.saldoInicial || 0;
    for (const l of Store.all('lancamentos')) {
      if (!l.pagoEm || l.pagoEm > t) continue;
      if (from && l.pagoEm < from) continue;
      s += l.tipo === 'entrada' ? +l.valor || 0 : -(+l.valor || 0);
    }
    return round2(s);
  },
  mes(m) {
    const out = { recebido: 0, pago: 0, previstoEntrada: 0, previstoSaida: 0, abertoEntrada: 0, abertoSaida: 0 };
    for (const l of Store.all('lancamentos')) {
      const v = +l.valor || 0;
      if (l.pagoEm && monthOf(l.pagoEm) === m) {
        if (l.tipo === 'entrada') out.recebido += v;
        else out.pago += v;
      }
      if (monthOf(l.vencimento) === m) {
        if (l.tipo === 'entrada') {
          out.previstoEntrada += v;
          if (!l.pagoEm) out.abertoEntrada += v;
        } else {
          out.previstoSaida += v;
          if (!l.pagoEm) out.abertoSaida += v;
        }
      }
    }
    out.resultado = out.recebido - out.pago;
    return out;
  },
  emAberto(tipo, t = today()) {
    const list = Store.all('lancamentos').filter((l) => l.tipo === tipo && !l.pagoEm);
    const atrasados = list.filter((l) => l.vencimento && l.vencimento < t);
    return { list, total: sum(list, (l) => l.valor), atrasados, totalAtrasado: sum(atrasados, (l) => l.valor) };
  },
  leadsAbertos() {
    return Store.all('leads').filter((l) => ABERTAS.includes(l.etapa));
  },
  pipeline() {
    const ab = Calc.leadsAbertos();
    return {
      n: ab.length,
      total: sum(ab, (l) => l.valor),
      ponderado: sum(ab, (l) => (+l.valor || 0) * (ETAPA[l.etapa] ? ETAPA[l.etapa].p : 0)),
    };
  },
  conversao() {
    const leads = Store.all('leads');
    const g = leads.filter((l) => l.etapa === 'ganho').length;
    const p = leads.filter((l) => l.etapa === 'perdido').length;
    return { ganhos: g, perdidos: p, taxa: g + p ? g / (g + p) : null };
  },
  vendasMes(m) {
    const ps = Store.all('projetos').filter((p) => monthOf(p.dataFechamento) === m && p.status !== 'cancelado');
    return { n: ps.length, total: sum(ps, (p) => p.valor) };
  },
  leadsNovosMes(m) {
    return Store.all('leads').filter((l) => monthOf(l.criadoEm) === m).length;
  },
  mrr() {
    let entrada = 0;
    let saida = 0;
    for (const r of Store.all('recorrencias')) {
      if (!r.ativo) continue;
      const v = r.frequencia === 'anual' ? (+r.valor || 0) / 12 : +r.valor || 0;
      if (r.tipo === 'entrada') entrada += v;
      else saida += v;
    }
    return { entrada, saida };
  },
  /* recorrências */
  recAplica(r, m) {
    if (!r.ativo) return false;
    if (r.inicio && m < r.inicio) return false;
    if (r.fim && m > r.fim) return false;
    if (r.frequencia === 'anual') return +m.slice(5, 7) === +r.mesAnual;
    return true;
  },
  recLancId(recId, m) {
    return `rec_${recId}_${m}`;
  },
  recLancada(r, m) {
    if (Store.get('lancamentos', Calc.recLancId(r.id, m))) return true;
    return Store.all('lancamentos').some((l) => l.recorrenciaId === r.id && l.competencia === m);
  },
  /* mês pulado: alguém excluiu o lançamento daquele mês de propósito */
  recPulada(r, m) {
    return Array.isArray(r.pulados) && r.pulados.includes(m);
  },
  recFeita(r, m) {
    return Calc.recLancada(r, m) || Calc.recPulada(r, m);
  },
  recPendentes(m) {
    return Store.all('recorrencias').filter((r) => Calc.recAplica(r, m) && !Calc.recFeita(r, m));
  },
  /* projeto */
  projetoFin(p) {
    const ls = Store.all('lancamentos').filter((l) => l.projetoId === p.id && l.tipo === 'entrada' && !l.recorrenciaId);
    const recebido = sum(ls.filter((l) => l.pagoEm), (l) => l.valor);
    const pendente = sum(ls.filter((l) => !l.pagoEm), (l) => l.valor);
    const base = +p.valor || 0;
    return { ls, recebido, pendente, semParcela: Math.max(0, round2(base - recebido - pendente)), pct: base ? Math.min(1, recebido / base) : 0 };
  },
  clienteFin(c) {
    const ls = Store.all('lancamentos').filter((l) => l.clienteId === c.id && l.tipo === 'entrada');
    const recs = Store.all('recorrencias').filter((r) => r.clienteId === c.id && r.ativo && r.tipo === 'entrada');
    return {
      recebido: sum(ls.filter((l) => l.pagoEm), (l) => l.valor),
      aberto: sum(ls.filter((l) => !l.pagoEm), (l) => l.valor),
      mrr: sum(recs, (r) => (r.frequencia === 'anual' ? r.valor / 12 : r.valor)),
      projetos: Store.all('projetos').filter((p) => p.clienteId === c.id),
    };
  },
  /* follow-ups e tarefas */
  followups(t = today()) {
    return Calc.leadsAbertos().filter((l) => l.proximoContato).map((l) => ({ lead: l, data: l.proximoContato, atrasado: l.proximoContato < t }));
  },
  tarefasAbertas() {
    return Store.all('tarefas').filter((x) => !x.feita);
  },
  diasNaEtapa(l) {
    const ref = l.etapaDesde || (l.criadoEm ? String(l.criadoEm).slice(0, 10) : '');
    return ref ? Math.max(0, daysBetween(String(ref).slice(0, 10), today())) : 0;
  },
  /* lead aberto, sem próximo contato marcado, há dias na mesma etapa e sem ninguém mexer */
  leadParado(l, dias = cfg().auto.diasParado, t = today()) {
    if (!ABERTAS.includes(l.etapa) || l.proximoContato) return false;
    const d = Calc.diasNaEtapa(l);
    const mexido = l.atualizadoEm ? daysBetween(String(l.atualizadoEm).slice(0, 10), t) : d;
    return d >= dias && mexido >= Math.min(7, dias);
  },
  /* fluxo mensal para gráficos */
  fluxo(mFim, n = 6) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const m = monthAdd(mFim, -i);
      const x = Calc.mes(m);
      out.push({ m, entradas: x.recebido, saidas: x.pago, resultado: x.resultado });
    }
    return out;
  },
  /* projeção do saldo para os próximos `dias` */
  projecao(dias = 90) {
    const t = today();
    const fim = addDays(t, dias);
    const ev = new Map();
    const add = (d, v, item) => {
      const k = d < t ? t : d;
      if (k > fim) return;
      if (!ev.has(k)) ev.set(k, { v: 0, itens: [] });
      const e = ev.get(k);
      e.v += v;
      e.itens.push(item);
    };
    let atrasadosEntrada = 0;
    let atrasadosSaida = 0;
    for (const l of Store.all('lancamentos')) {
      if (l.pagoEm || !l.vencimento) continue;
      const v = (l.tipo === 'entrada' ? 1 : -1) * (+l.valor || 0);
      if (l.vencimento < t) { if (l.tipo === 'entrada') atrasadosEntrada += +l.valor || 0; else atrasadosSaida += +l.valor || 0; }
      add(l.vencimento, v, { desc: l.descricao, v, tipo: l.tipo });
    }
    // recorrências ainda não lançadas dentro do horizonte
    let m = monthOf(t);
    const mFim = monthOf(fim);
    while (m <= mFim) {
      for (const r of Store.all('recorrencias')) {
        if (!Calc.recAplica(r, m) || Calc.recFeita(r, m)) continue;
        const d = dateInMonth(m, r.dia);
        if (d < t) continue;
        add(d, (r.tipo === 'entrada' ? 1 : -1) * (+r.valor || 0), { desc: r.descricao + ' (recorrente)', v: (r.tipo === 'entrada' ? 1 : -1) * r.valor, tipo: r.tipo, prev: true });
      }
      m = monthAdd(m, 1);
    }
    let saldo = Calc.saldoAtual(t);
    const pts = [];
    for (let i = 0; i <= dias; i++) {
      const d = addDays(t, i);
      const e = ev.get(d);
      if (e) saldo += e.v;
      pts.push({ d, v: round2(saldo), itens: e ? e.itens : [] });
    }
    return { pts, atrasadosEntrada, atrasadosSaida };
  },
};

/* itens que pedem atenção (painel e agenda) */
function itensAtencao() {
  const t = today();
  const A = cfg().auto;
  const items = [];
  for (const f of Calc.followups(t)) {
    const wa = waMsgLink(f.lead.telefone, msgLead(f.lead));
    const link = wa ? { href: wa, label: 'WhatsApp', ic: 'whatsapp' } : null;
    if (f.data < t) items.push({ sev: 3, ic: 'clock', tone: 'bad', txt: `Follow-up atrasado com ${f.lead.empresa}`, meta: `${relDay(f.data)}${f.lead.proximaAcao ? ' · ' + f.lead.proximaAcao : ''}`, open: () => showLead(f.lead.id), dono: f.lead.responsavel, link });
    else if (f.data === t) items.push({ sev: 2, ic: 'clock', tone: 'warn', txt: `Falar hoje com ${f.lead.empresa}`, meta: f.lead.proximaAcao || 'Follow-up', open: () => showLead(f.lead.id), dono: f.lead.responsavel, link });
  }
  const linkCobranca = (l, tipoMsg, marcar) => {
    const c = Store.get('clientes', l.clienteId);
    const texto = msgCobranca(l, tipoMsg);
    const wa = c ? waMsgLink(c.telefone, texto) : '';
    const onClick = marcar ? () => Store.patch('lancamentos', l.id, { lembreteEm: today() }).catch(() => {}) : null;
    if (wa) return { href: wa, label: tipoMsg === 'atraso' ? 'Cobrar' : 'Lembrar', ic: 'whatsapp', onClick };
    return { label: 'Copiar mensagem', ic: 'copy', fn: () => { copyText(texto, 'Mensagem copiada. Cole no WhatsApp ou no e-mail do cliente.'); if (onClick) onClick(); } };
  };
  const rec = Calc.emAberto('entrada', t);
  for (const l of rec.atrasados) items.push({ sev: 3, ic: 'coin', tone: 'bad', txt: `Recebimento atrasado: ${l.descricao}`, meta: `${money(l.valor)} · venceu ${relDay(l.vencimento)}${l.clienteId ? ' · ' + clienteNome(l.clienteId) : ''}`, open: () => editLancamento(l.id), action: { label: 'Recebido', fn: () => marcarPago(l.id) }, link: l.clienteId ? linkCobranca(l, 'atraso') : null });
  const pag = Calc.emAberto('saida', t);
  for (const l of pag.atrasados) items.push({ sev: 3, ic: 'coin', tone: 'bad', txt: `Conta atrasada: ${l.descricao}`, meta: `${money(l.valor)} · venceu ${relDay(l.vencimento)}`, open: () => editLancamento(l.id), action: { label: 'Paga', fn: () => marcarPago(l.id) } });
  for (const l of Store.all('lancamentos')) {
    if (!l.pagoEm && l.vencimento === t) items.push({ sev: 2, ic: 'coin', tone: 'warn', txt: `${l.tipo === 'entrada' ? 'Receber' : 'Pagar'} hoje: ${l.descricao}`, meta: money(l.valor), open: () => editLancamento(l.id), action: { label: l.tipo === 'entrada' ? 'Recebido' : 'Paga', fn: () => marcarPago(l.id) }, link: l.tipo === 'entrada' && l.clienteId ? linkCobranca(l, 'cobranca') : null });
  }
  if (A.lembreteCobranca) {
    const ate = addDays(t, A.diasCobranca);
    for (const l of rec.list) {
      if (!l.clienteId || !l.vencimento || l.vencimento <= t || l.vencimento > ate || l.lembreteEm) continue;
      items.push({ sev: 2, ic: 'bell', tone: 'blue', txt: `Lembrar ${clienteNome(l.clienteId)}: vence ${relDay(l.vencimento)}`, meta: `${l.descricao} · ${money(l.valor)}`, open: () => editLancamento(l.id), link: linkCobranca(l, 'cobranca', true), auto: true });
    }
  }
  for (const x of Calc.tarefasAbertas()) {
    if (!x.prazo) continue;
    if (x.prazo < t) items.push({ sev: 3, ic: 'check', tone: 'bad', txt: `Tarefa atrasada: ${x.titulo}`, meta: `${socioNome(x.responsavel)} · ${relDay(x.prazo)}`, open: () => editTarefa(x.id), action: { label: 'Concluir', fn: () => toggleTarefa(x.id) }, dono: x.responsavel });
    else if (x.prazo === t) items.push({ sev: 2, ic: 'check', tone: 'warn', txt: `Tarefa para hoje: ${x.titulo}`, meta: socioNome(x.responsavel), open: () => editTarefa(x.id), action: { label: 'Concluir', fn: () => toggleTarefa(x.id) }, dono: x.responsavel });
  }
  const pend = A.recorrencias && !S.readOnly ? [] : Calc.recPendentes(thisMonth());
  if (pend.length) items.push({ sev: 2, ic: 'repeat', tone: 'warn', txt: `${plural(pend.length, 'recorrência', 'recorrências')} de ${MESES[+thisMonth().slice(5, 7) - 1]} sem lançar`, meta: pend.map((r) => r.descricao).slice(0, 3).join(', '), open: () => { Fin.tab = 'recorrencias'; go('financeiro'); }, action: { label: 'Lançar', fn: () => lancarRecorrencias(thisMonth()) } });
  for (const p of Store.all('projetos')) {
    if (PROJ_ATIVOS.includes(p.status) && p.status !== 'pausado' && p.prazo && p.prazo < t) items.push({ sev: 2, ic: 'alert', tone: 'warn', txt: `Prazo vencido: ${p.titulo}`, meta: `${clienteNome(p.clienteId)} · ${relDay(p.prazo)}`, open: () => showProjeto(p.id) });
  }
  for (const l of Calc.leadsAbertos()) {
    if (!Calc.leadParado(l, A.diasParado, t)) continue;
    const d = Calc.diasNaEtapa(l);
    items.push({ sev: 1, ic: 'alert', tone: 'gray', txt: `${l.empresa} está parado em ${ETAPA[l.etapa].l.toLowerCase()}`, meta: `${d} dias sem avançar e sem próximo contato`, open: () => showLead(l.id), dono: l.responsavel, action: { label: 'Falar amanhã', fn: () => Store.patch('leads', l.id, { proximoContato: addDiasUteis(today(), 1), atualizadoEm: nowISO() }).then(() => toast(`Próximo contato com ${l.empresa}: ${relDay(addDiasUteis(today(), 1))}.`)).catch(() => {}) } });
  }
  return items.sort((a, b) => b.sev - a.sev);
}

/* registro criado a partir de um exemplo também é exemplo (sai junto em "Apagar exemplos") */
function herdaDemo(refs = {}) {
  const ids = [
    ['leads', refs.leadId],
    ['clientes', refs.clienteId],
    ['projetos', refs.projetoId],
    ['recorrencias', refs.recorrenciaId],
  ];
  if (refs.vinculo) {
    const [tipo, id] = String(refs.vinculo).split(':');
    ids.push([{ lead: 'leads', cliente: 'clientes', projeto: 'projetos' }[tipo], id]);
  }
  const demo = ids.some(([col, id]) => col && id && Store.get(col, id) && Store.get(col, id).demo);
  return demo ? { demo: true } : {};
}

function clienteNome(id) {
  const c = Store.get('clientes', id);
  return c ? c.nome : 'Sem cliente';
}
function projetoNome(id) {
  const p = Store.get('projetos', id);
  return p ? p.titulo : '';
}
