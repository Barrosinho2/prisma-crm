/* ───────────────────────── registros: leads, clientes, projetos ───────────────────────── */
const optSocios = () => SOCIOS.map((k) => ({ v: k, l: socioNome(k) }));
const optList = (arr) => (arr || []).map((x) => ({ v: x, l: x }));
const byName = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });
const optClientes = () => Store.all('clientes').sort((a, b) => byName(a.nome, b.nome)).map((c) => ({ v: c.id, l: c.nome }));
const optProjetos = (clienteId) =>
  Store.all('projetos')
    .filter((p) => !clienteId || p.clienteId === clienteId)
    .sort((a, b) => byName(a.titulo, b.titulo))
    .map((p) => ({ v: p.id, l: clienteId ? p.titulo : `${p.titulo} · ${clienteNome(p.clienteId)}` }));
const usados = (col, k) => uniq(Store.all(col).map((r) => r[k]).filter(Boolean)).sort(byName);

function stageTone(k) {
  if (k === 'ganho') return 'good';
  if (k === 'perdido') return 'gray';
  return 'blue';
}
function followChip(date) {
  if (!date) return '';
  const t = today();
  if (date < t) return pill(`Atrasado · ${relDay(date)}`, 'bad', 'clock');
  if (date === t) return pill('Falar hoje', 'warn', 'clock');
  return pill(cap(relDay(date)), 'gray', 'clock');
}
function lancPill(l) {
  const s = Calc.lancStatus(l);
  if (s === 'pago') return pill(l.tipo === 'entrada' ? 'Recebido' : 'Pago', 'good', 'check');
  if (s === 'atrasado') return pill('Atrasado', 'bad', 'alert');
  if (l.vencimento === today()) return pill('Vence hoje', 'warn', 'clock');
  return pill('Em aberto', 'gray', 'clock');
}
function statusPill(k) {
  const s = STATUS[k] || STATUS.planejamento;
  return pill(s.l, s.tone);
}
function contactBlock(r) {
  const items = [];
  if (r.telefone) {
    const wa = waLink(r.telefone);
    items.push(`<div class="ct">${ic('phone')}<span class="ct-v">${esc(r.telefone)}</span>${wa ? `<a class="btn btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">${ic('whatsapp')}WhatsApp</a>` : ''}<button type="button" class="icon-btn sm" data-copy="${esc(r.telefone)}" aria-label="Copiar telefone">${ic('copy')}</button></div>`);
  }
  if (r.email) items.push(`<div class="ct">${ic('mail')}<span class="ct-v">${esc(r.email)}</span><button type="button" class="icon-btn sm" data-copy="${esc(r.email)}" aria-label="Copiar e-mail">${ic('copy')}</button></div>`);
  if (r.site) {
    const u = safeUrl(r.site);
    items.push(`<div class="ct">${ic('globe')}${u ? `<a class="ct-v" href="${esc(u)}" target="_blank" rel="noopener">${esc(r.site)}</a>` : `<span class="ct-v">${esc(r.site)}</span>`}</div>`);
  }
  return items.length ? `<section class="dsec"><h4>Contato</h4>${items.join('')}</section>` : '';
}
function bindCommon(el) {
  on(el, '[data-copy]', 'click', (e, b) => copyText(b.dataset.copy));
  on(el, '[data-open-lead]', 'click', (e, b) => showLead(b.dataset.openLead));
  on(el, '[data-open-cliente]', 'click', (e, b) => showCliente(b.dataset.openCliente));
  on(el, '[data-open-projeto]', 'click', (e, b) => showProjeto(b.dataset.openProjeto));
  on(el, '[data-open-lanc]', 'click', (e, b) => editLancamento(b.dataset.openLanc));
  on(el, '[data-pay]', 'click', (e, b) => { e.stopPropagation(); marcarPago(b.dataset.pay); });
}
function formFoot(saveLabel, extra = '') {
  return `${extra}<span class="grow"></span><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-save>${esc(saveLabel)}</button>`;
}
async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Salvando…';
  try {
    return await fn();
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
}

/* ══════════ LEADS ══════════ */
function leadFields(fechado) {
  return [
    { k: 'empresa', l: 'Empresa', req: true, ph: 'Nome da empresa', span: 2 },
    { k: 'contato', l: 'Contato', ph: 'Nome da pessoa' },
    { k: 'telefone', l: 'Telefone / WhatsApp', t: 'tel', ph: '(11) 99999-9999' },
    { k: 'servicos', l: 'Interesse', t: 'chips', opts: SERVICOS.map((s) => ({ v: s.k, l: s.l })), span: 2 },
    { k: 'valor', l: 'Valor estimado', t: 'money' },
    { k: 'origem', l: 'Origem', t: 'select', opts: () => optList(cfg().origens), empty: 'Selecione' },
    { k: 'etapa', l: 'Etapa', t: 'select', opts: ETAPAS.filter((e) => fechado || ABERTAS.includes(e.k)).map((e) => ({ v: e.k, l: e.l })) },
    { k: 'responsavel', l: 'Responsável', t: 'select', opts: optSocios() },
    { k: 'proximoContato', l: 'Próximo contato', t: 'date' },
    { k: 'proximaAcao', l: 'Próxima ação', ph: 'Ex.: enviar proposta' },
    { k: 'cargo', l: 'Cargo', ph: 'Ex.: sócia, gerente', more: true },
    { k: 'email', l: 'E-mail', t: 'email', ph: 'nome@empresa.com.br', more: true },
    { k: 'segmento', l: 'Segmento', ph: 'Ex.: saúde, varejo', list: usados('leads', 'segmento'), more: true },
    { k: 'cidade', l: 'Cidade', ph: 'Cidade, UF', list: usados('leads', 'cidade'), more: true },
    { k: 'site', l: 'Site ou Instagram', ph: 'empresa.com.br ou @perfil', span: 2, more: true },
    { k: 'notas', l: 'Observações', t: 'textarea', span: 2, more: true },
  ];
}

function editLead(id = null, preset = {}, opts = {}) {
  const cur = id ? Store.get('leads', id) : null;
  const vals = cur ? { ...cur } : { etapa: 'novo', responsavel: S.me || 'pedro', servicos: [], proximoContato: today(), ...preset };
  const fields = leadFields(cur && !ABERTAS.includes(cur.etapa));
  const built = buildForm(fields, vals);
  const fid = built.fid;
  const abrirMais = fields.some((f) => f.more && vals[f.k]);
  const html = (cur ? '' : colarHTML(fid, !!opts.colar)) + built.html.replace('class="form-grid"', `class="form-grid${abrirMais ? ' show-more' : ''}"`) + moreToggle(abrirMais);
  Drawer.open({
    focus: opts.colar && !cur ? `#${fid}_msg` : `#${fid}_empresa`,
    view: () => ({
      title: cur ? 'Editar lead' : 'Novo lead',
      sub: cur ? esc(cur.empresa) : 'Empresa interessada em site, automação ou sistema',
      body: html,
      foot: formFoot(cur ? 'Salvar alterações' : 'Criar lead'),
    }),
    bind: (el) => {
      bindForm(el, fid, fields);
      bindMoreToggle(el);
      if (!cur) bindColar(el, fid);
      on(el, '[data-cancel]', 'click', () => (cur ? showLead(cur.id) : Drawer.close()));
      on(el, '[data-save]', 'click', (e, btn) =>
        busy(btn, async () => {
          const v = readForm(el, fid, fields);
          if (!validateForm(el, fid, fields, v)) return;
          await saveLead(cur, v);
        })
      );
    },
  });
}

async function saveLead(cur, v) {
  const t = nowISO();
  try {
    if (cur) {
      const changes = { ...v, atualizadoEm: t };
      let fu = null;
      if (v.etapa !== cur.etapa) {
        changes.etapaDesde = today();
        changes.historico = [...(cur.historico || []), { tipo: 'etapa', texto: `${ETAPA[cur.etapa].l} → ${ETAPA[v.etapa].l}`, data: t, autor: S.me }];
        // se a pessoa não mexeu no próximo contato, o piloto agenda pela etapa nova
        if ((v.proximoContato || '') === (cur.proximoContato || '')) {
          fu = followupAuto({ ...cur, ...v }, v.etapa);
          if (fu) Object.assign(changes, fu);
        }
      }
      await Store.patch('leads', cur.id, changes);
      if (fu) logFollowup(cur, fu);
      toast(fu ? `Lead atualizado. Próximo contato ${relDay(fu.proximoContato)}: ${fu.proximaAcao.toLowerCase()}.` : 'Lead atualizado.');
      showLead(cur.id);
    } else {
      const id = newId('ld');
      await Store.put('leads', id, { ...v, criadoEm: t, atualizadoEm: t, etapaDesde: today(), criadoPor: S.me, historico: [{ tipo: 'criado', texto: 'Lead criado', data: t, autor: S.me }] });
      toast(`${v.empresa} entrou no funil.`, { action: 'Abrir', onAction: () => showLead(id) });
      Drawer.close();
    }
  } catch (e) {
    /* o erro já foi avisado */
  }
}

function showLead(id) {
  Drawer.open({
    refreshable: true,
    grace: Date.now() + 4000,
    view: () => {
      const l = Store.get('leads', id);
      if (!l) return null;
      const aberto = ABERTAS.includes(l.etapa);
      const et = ETAPA[l.etapa] || ETAPA.novo;
      const curI = aberto ? ABERTAS.indexOf(l.etapa) : -1;
      const stepper = aberto
        ? `<div class="stepper" role="group" aria-label="Etapa do funil">${ABERTAS.map((k, i) => `<button type="button" class="step${i < curI ? ' done' : ''}${i === curI ? ' cur' : ''}" data-stage="${k}" aria-pressed="${i === curI}"><i style="background:var(--ord-${i + 1})"></i><span>${esc(ETAPA[k].l)}</span></button>`).join('')}</div>`
        : '';
      const fechado =
        l.etapa === 'ganho'
          ? `<div class="banner b-good">${ic('trophy')}<div><b>Venda fechada${l.fechadoEm ? ' em ' + fmtDate(l.fechadoEm) : ''}</b>${l.projetoId && Store.get('projetos', l.projetoId) ? ` · <button type="button" class="link" data-open-projeto="${esc(l.projetoId)}">ver projeto</button>` : ''}${l.clienteId && Store.get('clientes', l.clienteId) ? ` · <button type="button" class="link" data-open-cliente="${esc(l.clienteId)}">ver cliente</button>` : ''}</div></div>`
          : l.etapa === 'perdido'
            ? `<div class="banner b-gray">${ic('xcircle')}<div><b>Perdido${l.perdidoEm ? ' em ' + fmtDate(l.perdidoEm) : ''}</b>${l.motivoPerda ? ' · ' + esc(l.motivoPerda) : ''}</div></div>`
            : '';
      const acoes = aberto
        ? `<div class="row-actions" data-write><button type="button" class="btn btn-good" data-win>${ic('trophy')}Marcar como ganho</button><button type="button" class="btn" data-lose>${ic('xcircle')}Marcar como perdido</button></div>`
        : `<div class="row-actions" data-write><button type="button" class="btn" data-reopen aria-haspopup="menu">${ic('repeat')}Reabrir no funil</button></div>`;
      const facts = [
        ['Valor estimado', l.valor ? money(l.valor) : '—'],
        ['Interesse', (l.servicos || []).map((k) => SERVICO[k]).join(', ') || '—'],
        ['Origem', l.origem || '—'],
        ['Segmento', l.segmento || '—'],
        ['Cidade', l.cidade || '—'],
        ['Responsável', socioNome(l.responsavel)],
        ['Criado em', l.criadoEm ? fmtDate(String(l.criadoEm).slice(0, 10)) : '—'],
        [aberto ? 'Nesta etapa há' : 'Etapa', aberto ? plural(Calc.diasNaEtapa(l), 'dia', 'dias') : et.l],
      ];
      const proximo = aberto
        ? `<section class="dsec" data-write><h4>Próximo contato</h4>
            <div class="next-form"><input type="date" id="nx_d_${esc(id)}" value="${esc(l.proximoContato || '')}" aria-label="Data do próximo contato"><input id="nx_a_${esc(id)}" value="${esc(l.proximaAcao || '')}" placeholder="O que fazer" aria-label="Próxima ação"><button type="button" class="btn btn-sm" data-next>Salvar</button></div>
            ${quickDates(`nx_d_${id}`)}
            ${l.proximoContato ? `<div class="next-chip">${followChip(l.proximoContato)}${l.proximaAcao ? `<span>${esc(l.proximaAcao)}</span>` : ''}<a class="link small gcal" href="${esc(gcalLink(`Falar com ${l.empresa}${l.proximaAcao ? ': ' + l.proximaAcao : ''}`, l.proximoContato, detalhesLead(l)))}" target="_blank" rel="noopener">${ic('agenda')}Google Agenda</a></div>` : '<p class="muted small">Sem próximo contato agendado.</p>'}</section>`
        : '';
      const sug = sugestaoLead(l);
      const sugHTML = sug ? `<section class="sug sug-${sug.tone}" data-write><p class="sug-h">${ic('spark')}O que fazer agora</p><p class="sug-t">${esc(sug.titulo)}</p><p class="sug-x">${esc(sug.texto)}</p>${sug.acts.length ? `<div class="sug-a">${sug.acts.map((a, i) => (a.href ? `<a class="btn btn-sm${i === 0 ? ' btn-primary' : ''}${a.ic === 'whatsapp' ? ' btn-wa' : ''}" href="${esc(a.href)}" target="_blank" rel="noopener"${a.msg ? ` data-msg-sent="${esc(a.msg)}"` : ''}>${ic(a.ic)}${esc(a.label)}</a>` : `<button type="button" class="btn btn-sm${a.primary || i === 0 ? ' btn-primary' : ''}" data-sug="${esc(a.fn)}">${ic(a.ic)}${esc(a.label)}</button>`)).join('')}</div>` : ''}</section>` : '';
      const msgTipos = ['primeiroContato', 'followup', 'proposta', 'fechamento'];
      const msgK = Drawer.msgK && Drawer.msgK[id] ? Drawer.msgK[id] : msgLeadTipo(l);
      const msgHTML = aberto ? `<section class="dsec" data-write><div class="dsec-h"><h4>Mensagem pronta</h4><div class="seg seg-sm seg-scroll" role="radiogroup" aria-label="Qual mensagem" id="mk_${esc(id)}">${msgTipos.map((k) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === msgK}">${esc(MSG_INFO[k].l)}</button>`).join('')}</div></div>${msgCard({ titulo: '', texto: msgLead(l, msgK), tel: l.telefone, email: l.email, assunto: `Prisma Systems · ${l.empresa}`, marca: msgK })}</section>` : '';
      const registrar = `<section class="dsec" data-write><h4>Registrar interação</h4>
          <div class="seg seg-sm" id="at_t_${esc(id)}" role="radiogroup" aria-label="Tipo de interação">${TIPOS_ATIV.map((t, i) => `<button type="button" role="radio" data-v="${t.k}" aria-checked="${i === 0}">${ic(t.ic)}<span>${t.l}</span></button>`).join('')}</div>
          <textarea id="at_x_${esc(id)}" rows="2" placeholder="O que foi conversado ou decidido"></textarea>
          <button type="button" class="link small cv-link" data-cv-lead>${ic('chat')}Ou importe a conversa do WhatsApp e o Claude atualiza o lead</button>
          <div class="at-foot">${aberto ? `<label class="check" for="at_n_${esc(id)}"><input type="checkbox" id="at_n_${esc(id)}"><span>Próximo contato em</span></label><input type="date" id="at_nd_${esc(id)}" value="${addDays(today(), 3)}" aria-label="Data do próximo contato">${quickDates(`at_nd_${id}`, `at_n_${id}`)}` : ''}<span class="grow"></span><button type="button" class="btn btn-primary btn-sm" data-reg>Registrar</button></div></section>`;
      const hist = (l.historico || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
      const timeline = `<section class="dsec"><h4>Histórico</h4>${hist.length ? `<ol class="timeline">${hist.map((h) => `<li class="tl tl-${esc(h.tipo)}"><span class="tl-ic">${ic(ATIV_IC[h.tipo] || 'note')}</span><div><p>${esc(h.texto)}</p><span>${esc(relTime(h.data))}${h.autor ? ' · ' + esc(socioNome(h.autor)) : h.tipo === 'auto' ? ' · piloto automático' : ''}</span></div></li>`).join('')}</ol>` : '<p class="muted">Nenhuma interação registrada ainda.</p>'}</section>`;
      return {
        title: `${esc(l.empresa)}${demoTag(l)}`,
        sub: `${pill(et.l, stageTone(l.etapa))}${[l.contato, l.cargo].filter(Boolean).length ? `<span>${[l.contato, l.cargo].filter(Boolean).map(esc).join(' · ')}</span>` : ''}`,
        head: avatar(l.responsavel, 'lg'),
        body: `${fechado}${stepper}${sugHTML}${acoes}<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${contactBlock(l)}${proximo}${msgHTML}${registrar}${l.notas ? `<section class="dsec"><h4>Observações</h4><p class="pre">${esc(l.notas)}</p></section>` : ''}${timeline}`,
        foot: `<button type="button" class="btn btn-ghost danger-text" data-del data-write>${ic('trash')}Excluir</button><span class="grow"></span><button type="button" class="btn" data-edit data-write>${ic('edit')}Editar lead</button>`,
      };
    },
    bind: (el) => {
      bindCommon(el);
      bindQuickDates(el);
      on(el, '[data-stage]', 'click', (e, b) => moveLead(id, b.dataset.stage));
      on(el, '[data-win]', 'click', () => winFlow({ leadId: id }));
      on(el, '[data-lose]', 'click', () => loseFlow(id));
      on(el, '[data-reopen]', 'click', (e, b) => Pop.open(b, ABERTAS.map((k) => ({ label: `Mover para ${ETAPA[k].l}`, fn: () => moveLead(id, k) }))));
      on(el, '[data-edit]', 'click', () => editLead(id));
      on(el, '[data-del]', 'click', async () => {
        if (await deleteRecord('leads', id, { titulo: 'Excluir este lead?', feito: 'Lead excluído.' })) Drawer.close();
      });
      on(el, '[data-next]', 'click', async (e, btn) => {
        const d = $(`#nx_d_${CSS.escape(id)}`, el).value;
        const a = $(`#nx_a_${CSS.escape(id)}`, el).value.trim();
        await busy(btn, async () => {
          try {
            await Store.patch('leads', id, { proximoContato: d || '', proximaAcao: a, atualizadoEm: nowISO() });
            toast(d ? `Próximo contato: ${relDay(d)}.` : 'Próximo passo atualizado.');
          } catch {}
        });
      });
      on(el, '[data-reg]', 'click', async (e, btn) => {
        const l = Store.get('leads', id);
        const txt = $(`#at_x_${CSS.escape(id)}`, el);
        const tipoBtn = $(`#at_t_${CSS.escape(id)} [aria-checked="true"]`, el);
        const tipo = tipoBtn ? tipoBtn.dataset.v : 'nota';
        if (!txt.value.trim()) {
          txt.focus();
          toast('Escreva o que aconteceu antes de registrar.', { type: 'error' });
          return;
        }
        const t = nowISO();
        const changes = { historico: [...(l.historico || []), { tipo, texto: txt.value.trim(), data: t, autor: S.me }], atualizadoEm: t };
        const chk = $(`#at_n_${CSS.escape(id)}`, el);
        if (chk && chk.checked) changes.proximoContato = $(`#at_nd_${CSS.escape(id)}`, el).value || '';
        await busy(btn, async () => {
          try {
            await Store.patch('leads', id, changes);
            txt.value = '';
            if (chk) chk.checked = false;
            toast('Interação registrada.');
          } catch {}
        });
      });
      const seg = $(`#at_t_${CSS.escape(id)}`, el);
      if (seg) seg.addEventListener('click', (e) => {
        const r = e.target.closest('[role=radio]');
        if (r) $$('[role=radio]', seg).forEach((b) => b.setAttribute('aria-checked', String(b === r)));
      });
      const mk = $(`#mk_${CSS.escape(id)}`, el);
      if (mk) mk.addEventListener('click', (e) => {
        const r = e.target.closest('[role=radio]');
        if (!r) return;
        Drawer.msgK = Object.assign(Drawer.msgK || {}, { [id]: r.dataset.v });
        Drawer.refresh();
      });
      on(el, '[data-msg-sent]', 'click', (e, b) => registrarMsgLead(id, b.dataset.msgSent));
      on(el, '[data-cv-lead]', 'click', () => abrirConversas({ leadId: id }));
      on(el, '[data-sug]', 'click', async (e, b) => {
        const f = b.dataset.sug;
        const l = Store.get('leads', id);
        if (!l) return;
        if (f.startsWith('stage:')) moveLead(id, f.slice(6));
        else if (f === 'ganho') winFlow({ leadId: id });
        else if (f === 'editar') editLead(id);
        else if (f === 'tarefa') editTarefa(null, { titulo: `Montar a proposta: ${l.empresa}`, vinculo: `lead:${id}`, prazo: addDiasUteis(today(), 2), responsavel: S.me || l.responsavel || 'rafael' });
        else if (f === 'amanha') {
          const d = addDiasUteis(today(), 1);
          try { await Store.patch('leads', id, { proximoContato: d, atualizadoEm: nowISO() }); toast(`Próximo contato com ${l.empresa}: ${relDay(d)}.`); } catch {}
        }
      });
    },
  });
}

/* ── o que fazer agora com o lead (cartão no topo do lead) ── */
function detalhesLead(l) {
  return [`Lead: ${l.empresa}`, l.contato ? `Contato: ${l.contato}` : '', l.telefone ? `Telefone: ${l.telefone}` : '', l.telefone && waLink(l.telefone) ? `WhatsApp: ${waLink(l.telefone)}` : '', l.email ? `E-mail: ${l.email}` : '', l.proximaAcao ? `Próxima ação: ${l.proximaAcao}` : '', '', 'Criado pelo Prisma CRM'].filter((x, i, a) => x || i === a.length - 2).join('\n');
}
function sugestaoLead(l) {
  if (!ABERTAS.includes(l.etapa)) return null;
  const t = today();
  const acts = [];
  const zap = (tipo, label = 'Mandar no WhatsApp') => {
    const href = waMsgLink(l.telefone, msgLead(l, tipo));
    if (href) acts.push({ href, label, ic: 'whatsapp', msg: tipo });
  };
  let titulo = '';
  let texto = '';
  let tone = 'blue';
  if (l.proximoContato && l.proximoContato < t) {
    titulo = 'Retomar o contato atrasado';
    texto = `Era para falar com ${l.contato ? primeiroNome(l.contato) : l.empresa} ${relDay(l.proximoContato)}${l.proximaAcao ? `: ${l.proximaAcao.charAt(0).toLowerCase()}${l.proximaAcao.slice(1)}` : ''}.`;
    tone = 'bad';
    zap(msgLeadTipo(l));
    acts.push({ fn: 'amanha', label: 'Passar para amanhã', ic: 'clock' });
  } else if (l.etapa === 'novo') {
    titulo = 'Fazer o primeiro contato';
    texto = 'Lead novo costuma responder melhor nas primeiras horas.';
    zap('primeiroContato');
    acts.push({ fn: 'stage:contato', label: 'Já falei: Em contato', ic: 'arrow' });
  } else if (l.etapa === 'contato') {
    titulo = 'Marcar a conversa de diagnóstico';
    texto = 'Meia hora para entender o processo, o prazo e o orçamento do cliente.';
    acts.push({ href: gcalLink(`Diagnóstico: ${l.empresa}`, l.proximoContato && l.proximoContato >= t ? l.proximoContato : addDiasUteis(t, 1), detalhesLead(l)), label: 'Marcar no Google Agenda', ic: 'agenda' });
    acts.push({ fn: 'stage:diagnostico', label: 'Mover para Diagnóstico', ic: 'arrow' });
  } else if (l.etapa === 'diagnostico') {
    titulo = 'Montar e enviar a proposta';
    texto = 'Com o diagnóstico feito, a proposta precisa sair enquanto o assunto está quente.';
    acts.push({ fn: 'tarefa', label: 'Criar tarefa da proposta', ic: 'check' });
    acts.push({ fn: 'stage:proposta', label: 'Proposta enviada', ic: 'arrow' });
  } else if (l.etapa === 'proposta') {
    const d = Calc.diasNaEtapa(l);
    if (d >= 3) {
      titulo = 'Cobrar o retorno da proposta';
      texto = `A proposta foi enviada há ${plural(d, 'dia', 'dias')}.`;
      zap('proposta');
    } else {
      titulo = 'Aguardar o retorno da proposta';
      texto = `Sem resposta, vale cobrar ${relDay(addDiasUteis(l.etapaDesde || t, 3))}.`;
    }
    acts.push({ fn: 'stage:negociacao', label: 'Respondeu: Negociação', ic: 'arrow' });
  } else if (l.etapa === 'negociacao') {
    titulo = 'Fechar a venda';
    texto = 'Combinadas as condições, use Marcar como ganho: o CRM cria o cliente, o projeto, as parcelas e as tarefas de uma vez.';
    zap('fechamento', 'Mandar a mensagem de fechamento');
  }
  if (!l.telefone && !l.email) acts.push({ fn: 'editar', label: 'Adicionar telefone', ic: 'phone' });
  return { titulo, texto, tone, acts };
}

async function moveLead(id, stage) {
  const l = Store.get('leads', id);
  if (!l || l.etapa === stage) return;
  if (S.readOnly) return toast('Você tem acesso somente de leitura.', { type: 'error' });
  if (stage === 'ganho') return winFlow({ leadId: id });
  if (stage === 'perdido') return loseFlow(id);
  const t = nowISO();
  const de = ETAPA[l.etapa] ? ETAPA[l.etapa].l : l.etapa;
  const fu = followupAuto(l, stage);
  try {
    await Store.patch('leads', id, {
      etapa: stage,
      etapaDesde: today(),
      atualizadoEm: t,
      historico: [...(l.historico || []), { tipo: 'etapa', texto: `${de} → ${ETAPA[stage].l}`, data: t, autor: S.me }],
      ...(fu || {}),
    });
    if (fu) {
      logFollowup(l, fu);
      toast(`${l.empresa} foi para ${ETAPA[stage].l}. Próximo contato ${relDay(fu.proximoContato)}: ${fu.proximaAcao.charAt(0).toLowerCase()}${fu.proximaAcao.slice(1)}.`, { action: 'Abrir', ms: 5000, onAction: () => showLead(id) });
    } else toast(`Lead movido para ${ETAPA[stage].l}: ${l.empresa}.`);
  } catch {}
}

function loseFlow(id) {
  const l = Store.get('leads', id);
  if (!l) return;
  const fields = [
    { k: 'motivo', l: 'Motivo', t: 'select', opts: optList(cfg().motivosPerda), req: true, empty: 'Selecione' },
    { k: 'obs', l: 'Detalhes', t: 'textarea', ph: 'Opcional: o que aprender com essa negociação' },
  ];
  const { fid, html } = buildForm(fields, {});
  Modal.open({
    title: `Marcar ${l.empresa} como perdido`,
    body: html,
    onOpen: (root) => bindForm(root, fid, fields),
    actions: [
      { label: 'Cancelar', kind: 'ghost' },
      {
        label: 'Marcar como perdido',
        kind: 'danger',
        onClick: async (root) => {
          const v = readForm(root, fid, fields);
          if (!validateForm(root, fid, fields, v)) return false;
          const t = nowISO();
          try {
            await Store.patch('leads', id, {
              etapa: 'perdido',
              motivoPerda: v.motivo,
              perdidoEm: today(),
              etapaDesde: today(),
              atualizadoEm: t,
              historico: [...(l.historico || []), { tipo: 'perdido', texto: `Perdido: ${v.motivo}${v.obs ? ' — ' + v.obs : ''}`, data: t, autor: S.me }],
            });
          } catch {
            return false;
          }
          toast(`${l.empresa} foi marcado como perdido.`);
        },
      },
    ],
  });
}

/* ══════════ FECHAR VENDA (lead → cliente + projeto + parcelas) ══════════ */
function planoParcelas(v) {
  const total = round2(v.valor || 0);
  if (!(total > 0) || v.pagamento === 'nenhum') return [];
  const first = v.primeiroVenc || today();
  const n = Math.max(1, Math.min(36, Math.round(+v.parcelas || 1)));
  const pctE = Math.min(99, Math.max(1, +v.entradaPct || 50)) / 100;
  const split = (amount, k) => {
    const base = Math.floor((amount * 100) / k) / 100;
    const arr = Array(k).fill(base);
    arr[k - 1] = round2(amount - base * (k - 1));
    return arr;
  };
  const out = [];
  if (v.pagamento === 'avista') out.push({ label: 'Pagamento à vista', venc: first, valor: total });
  else if (v.pagamento === 'metade') {
    const e = round2(total * pctE);
    out.push({ label: 'Entrada', venc: first, valor: e });
    out.push({ label: 'Saldo na entrega', venc: v.segundoVenc || v.prazo || addDays(first, 30), valor: round2(total - e) });
  } else if (v.pagamento === 'entrada_parcelas') {
    const e = round2(total * pctE);
    out.push({ label: 'Entrada', venc: first, valor: e });
    split(round2(total - e), n).forEach((x, i) => out.push({ label: `Parcela ${i + 1}/${n}`, venc: addMonths(first, i + 1), valor: x }));
  } else if (v.pagamento === 'parcelado') {
    split(total, n).forEach((x, i) => out.push({ label: `Parcela ${i + 1}/${n}`, venc: addMonths(first, i), valor: x }));
  }
  return out;
}

function winFlow({ leadId = null, clienteId = null } = {}) {
  const lead = leadId ? Store.get('leads', leadId) : null;
  const temClientes = Store.all('clientes').length > 0;
  const pre = clienteId || (lead && lead.clienteId && Store.get('clientes', lead.clienteId) ? lead.clienteId : '');
  const servico = (lead && lead.servicos && lead.servicos[0]) || 'site';
  const vals = {
    clienteModo: pre ? 'existente' : lead || !temClientes ? 'novo' : 'existente',
    clienteId: pre,
    nome: lead ? lead.empresa : '',
    contato: lead ? lead.contato || '' : '',
    telefone: lead ? lead.telefone || '' : '',
    titulo: lead ? `${SERVICO[servico]} — ${lead.empresa}` : '',
    servico,
    valor: lead ? lead.valor || null : null,
    dataFechamento: today(),
    prazo: '',
    vendedor: lead ? lead.responsavel || 'pedro' : S.me || 'pedro',
    executor: 'rafael',
    pagamento: 'metade',
    entradaPct: 50,
    parcelas: 3,
    primeiroVenc: today(),
    segundoVenc: '',
    forma: 'Pix',
    entradaRecebida: false,
    manutencao: null,
    manutencaoDia: 10,
  };
  const novo = (v) => v.clienteModo === 'novo';
  const fields = [
    { k: 'clienteModo', l: 'Cliente', t: 'seg', opts: [{ v: 'novo', l: 'Cliente novo' }, { v: 'existente', l: 'Cliente existente' }], span: 2 },
    { k: 'clienteId', l: 'Escolha o cliente', t: 'select', opts: optClientes, empty: 'Selecione', req: true, span: 2, show: (v) => !novo(v) },
    { k: 'nome', l: 'Nome da empresa', req: true, span: 2, show: novo },
    { k: 'contato', l: 'Contato', show: novo },
    { k: 'telefone', l: 'Telefone', t: 'tel', show: novo },
    { k: 'titulo', l: 'Nome do projeto', req: true, span: 2, ph: 'Ex.: Site institucional' },
    { k: 'servico', l: 'Serviço principal', t: 'select', opts: SERVICOS.map((s) => ({ v: s.k, l: s.l })) },
    { k: 'valor', l: 'Valor total', t: 'money', req: true, positive: true },
    { k: 'dataFechamento', l: 'Fechado em', t: 'date', req: true },
    { k: 'prazo', l: 'Prazo de entrega', t: 'date' },
    { k: 'vendedor', l: 'Vendido por', t: 'select', opts: optSocios() },
    { k: 'executor', l: 'Execução', t: 'select', opts: optSocios() },
    {
      k: 'pagamento',
      l: 'Condição de pagamento',
      t: 'select',
      span: 2,
      opts: [
        { v: 'avista', l: 'À vista' },
        { v: 'metade', l: 'Entrada + saldo na entrega' },
        { v: 'entrada_parcelas', l: 'Entrada + parcelas mensais' },
        { v: 'parcelado', l: 'Parcelado, sem entrada' },
        { v: 'nenhum', l: 'Não gerar parcelas agora' },
      ],
    },
    { k: 'entradaPct', l: 'Entrada (%)', t: 'number', min: 1, max: 99, show: (v) => ['metade', 'entrada_parcelas'].includes(v.pagamento) },
    { k: 'parcelas', l: 'Número de parcelas', t: 'number', min: 1, max: 36, show: (v) => ['entrada_parcelas', 'parcelado'].includes(v.pagamento) },
    { k: 'primeiroVenc', l: 'Primeiro vencimento', t: 'date', show: (v) => v.pagamento !== 'nenhum' },
    { k: 'segundoVenc', l: 'Vencimento do saldo', t: 'date', hint: 'Vazio: usa o prazo de entrega ou 30 dias depois', show: (v) => v.pagamento === 'metade' },
    { k: 'forma', l: 'Forma de pagamento', t: 'select', opts: optList(FORMAS), show: (v) => v.pagamento !== 'nenhum' },
    { k: 'entradaRecebida', l: 'O primeiro pagamento já caiu na conta', t: 'check', span: 2, show: (v) => v.pagamento !== 'nenhum' },
    { k: 'manutencao', l: 'Mensalidade de manutenção', t: 'money', hint: 'Opcional. Vira receita recorrente a partir do mês seguinte.' },
    { k: 'manutencaoDia', l: 'Dia da mensalidade', t: 'number', min: 1, max: 31, show: (v) => v.manutencao > 0 },
  ];
  const { fid, html } = buildForm(fields, vals);
  Drawer.open({
    focus: lead ? `#${fid}_valor` : `#${fid}_titulo`,
    view: () => ({
      title: lead ? `Fechar venda: ${esc(lead.empresa)}` : 'Nova venda',
      sub: 'Cria o cliente, o projeto e as parcelas a receber no caixa',
      body: `${html}<div class="plan" id="plan_${fid}" aria-live="polite"></div>`,
      foot: formFoot('Registrar venda'),
    }),
    bind: (el) => {
      const paintPlan = (v) => {
        const box = $(`#plan_${fid}`, el);
        const p = planoParcelas(v);
        if (!p.length) {
          box.innerHTML = v.pagamento === 'nenhum' ? '<p class="muted small">Nenhuma parcela será criada. Você pode adicionar depois, no projeto.</p>' : '<p class="muted small">Informe o valor para ver as parcelas.</p>';
          return;
        }
        box.innerHTML = `<h4>Parcelas que vão para o caixa</h4><ol>${p.map((x, i) => `<li><span>${esc(x.label)}</span><span>${fmtDate(x.venc)}</span><b>${money(x.valor)}</b>${i === 0 && v.entradaRecebida ? pill('Recebida', 'good', 'check') : ''}</li>`).join('')}</ol>`;
      };
      bindForm(el, fid, fields, (v) => {
        paintPlan(v);
        const tituloEl = fieldEl(el, fid, 'titulo');
        if (tituloEl && !tituloEl.dataset.touched && lead) tituloEl.value = `${SERVICO[v.servico]} — ${lead.empresa}`;
      });
      fieldEl(el, fid, 'titulo').addEventListener('input', (e) => (e.target.dataset.touched = '1'));
      on(el, '[data-cancel]', 'click', () => (lead ? showLead(lead.id) : Drawer.close()));
      on(el, '[data-save]', 'click', (e, btn) =>
        busy(btn, async () => {
          const v = readForm(el, fid, fields);
          if (!validateForm(el, fid, fields, v)) return;
          const pid = await registrarVenda(v, lead);
          if (pid) {
            const n = registrarVenda.tarefas || 0;
            toast(n ? `Venda registrada: parcelas no financeiro e ${plural(n, 'tarefa', 'tarefas')} na agenda de ${socioNome(v.executor)}.` : 'Venda registrada. As parcelas já estão no financeiro.', { ms: 6000 });
            showProjeto(pid);
          }
        })
      );
    },
  });
}

async function registrarVenda(v, lead) {
  const t = nowISO();
  const demo = herdaDemo({ leadId: lead && lead.id, clienteId: v.clienteModo === 'novo' ? null : v.clienteId });
  try {
    let cid = v.clienteId;
    let nomeCliente = clienteNome(cid);
    if (v.clienteModo === 'novo') {
      cid = newId('cl');
      nomeCliente = v.nome;
      await Store.put('clientes', cid, {
        nome: v.nome,
        contato: v.contato || '',
        telefone: v.telefone || '',
        email: lead ? lead.email || '' : '',
        segmento: lead ? lead.segmento || '' : '',
        cidade: lead ? lead.cidade || '' : '',
        site: lead ? lead.site || '' : '',
        origem: lead ? lead.origem || '' : '',
        documento: '',
        desde: v.dataFechamento,
        leadId: lead ? lead.id : null,
        notas: '',
        criadoEm: t,
        criadoPor: S.me,
        ...demo,
      });
    }
    const pid = newId('pj');
    await Store.put('projetos', pid, {
      titulo: v.titulo,
      clienteId: cid,
      servico: v.servico,
      valor: v.valor,
      dataFechamento: v.dataFechamento,
      prazo: v.prazo || '',
      status: 'planejamento',
      vendedor: v.vendedor,
      executor: v.executor,
      leadId: lead ? lead.id : null,
      pagamento: { tipo: v.pagamento, entradaPct: v.entradaPct, parcelas: v.parcelas, forma: v.forma },
      notas: '',
      criadoEm: t,
      criadoPor: S.me,
      ...demo,
    });
    const plano = planoParcelas(v);
    let jaRecebida = null;
    for (let i = 0; i < plano.length; i++) {
      const p = plano[i];
      const lid = newId('lc');
      if (i === 0 && v.entradaRecebida) jaRecebida = lid;
      await Store.put('lancamentos', lid, {
        tipo: 'entrada',
        descricao: `${v.titulo} · ${p.label}`,
        valor: p.valor,
        categoria: 'Projetos',
        vencimento: p.venc,
        pagoEm: i === 0 && v.entradaRecebida ? today() : null,
        forma: v.forma,
        clienteId: cid,
        projetoId: pid,
        criadoEm: t,
        criadoPor: S.me,
        ...demo,
      });
    }
    if (v.manutencao > 0) {
      await Store.put('recorrencias', newId('rc'), {
        tipo: 'entrada',
        descricao: `Manutenção — ${nomeCliente}`,
        valor: v.manutencao,
        categoria: 'Manutenção & mensalidades',
        frequencia: 'mensal',
        dia: Math.min(31, Math.max(1, +v.manutencaoDia || 10)),
        mesAnual: null,
        inicio: monthAdd(monthOf(v.dataFechamento), 1),
        fim: '',
        ativo: true,
        clienteId: cid,
        projetoId: pid,
        forma: v.forma || 'Pix',
        criadoEm: t,
        criadoPor: S.me,
        ...demo,
      });
    }
    registrarVenda.tarefas = 0;
    try { registrarVenda.tarefas = await checklistVenda(pid, v, demo); } catch (e) { console.warn('checklist', e); }
    if (jaRecebida) {
      const lr = Store.get('lancamentos', jaRecebida) || { id: jaRecebida, tipo: 'entrada', clienteId: cid, projetoId: pid, valor: plano[0].valor, descricao: `${v.titulo} · ${plano[0].label}`, ...demo };
      try { await notaFiscalAuto(lr); } catch {}
    }
    if (lead) {
      await Store.patch('leads', lead.id, {
        etapa: 'ganho',
        etapaDesde: today(),
        fechadoEm: v.dataFechamento,
        clienteId: cid,
        projetoId: pid,
        atualizadoEm: t,
        historico: [...(lead.historico || []), { tipo: 'ganho', texto: `Venda fechada: ${v.titulo} · ${money(v.valor)}`, data: t, autor: S.me }],
      });
    }
    return pid;
  } catch (e) {
    console.warn(e);
    return null;
  }
}

/* ══════════ CLIENTES ══════════ */
function clienteFields() {
  return [
    { k: 'nome', l: 'Empresa', req: true, span: 2 },
    { k: 'contato', l: 'Contato' },
    { k: 'telefone', l: 'Telefone / WhatsApp', t: 'tel' },
    { k: 'email', l: 'E-mail', t: 'email' },
    { k: 'documento', l: 'CNPJ ou CPF' },
    { k: 'segmento', l: 'Segmento', list: uniq([...usados('clientes', 'segmento'), ...usados('leads', 'segmento')]) },
    { k: 'cidade', l: 'Cidade', list: uniq([...usados('clientes', 'cidade'), ...usados('leads', 'cidade')]) },
    { k: 'site', l: 'Site ou Instagram', span: 2 },
    { k: 'desde', l: 'Cliente desde', t: 'date' },
    { k: 'origem', l: 'Origem', t: 'select', opts: () => optList(cfg().origens), empty: '—' },
    { k: 'notas', l: 'Observações', t: 'textarea', span: 2 },
  ];
}
function editCliente(id = null) {
  const cur = id ? Store.get('clientes', id) : null;
  const vals = cur ? { ...cur } : { desde: today() };
  const fields = clienteFields();
  const { fid, html } = buildForm(fields, vals);
  Drawer.open({
    focus: `#${fid}_nome`,
    view: () => ({ title: cur ? 'Editar cliente' : 'Novo cliente', sub: cur ? esc(cur.nome) : 'Empresa que já compra da Prisma', body: html, foot: formFoot(cur ? 'Salvar alterações' : 'Criar cliente') }),
    bind: (el) => {
      bindForm(el, fid, fields);
      on(el, '[data-cancel]', 'click', () => (cur ? showCliente(cur.id) : Drawer.close()));
      on(el, '[data-save]', 'click', (e, btn) =>
        busy(btn, async () => {
          const v = readForm(el, fid, fields);
          if (!validateForm(el, fid, fields, v)) return;
          try {
            if (cur) {
              await Store.patch('clientes', cur.id, { ...v, atualizadoEm: nowISO() });
              toast('Cliente atualizado.');
              showCliente(cur.id);
            } else {
              const nid = newId('cl');
              await Store.put('clientes', nid, { ...v, criadoEm: nowISO(), criadoPor: S.me });
              toast('Cliente criado.');
              showCliente(nid);
            }
          } catch {}
        })
      );
    },
  });
}
function showCliente(id) {
  Drawer.open({
    refreshable: true,
    grace: Date.now() + 4000,
    view: () => {
      const c = Store.get('clientes', id);
      if (!c) return null;
      const fin = Calc.clienteFin(c);
      const projs = fin.projetos.sort((a, b) => String(b.dataFechamento).localeCompare(String(a.dataFechamento)));
      const lancs = Store.all('lancamentos').filter((l) => l.clienteId === id).sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
      const recs = Store.all('recorrencias').filter((r) => r.clienteId === id);
      const lead = c.leadId ? Store.get('leads', c.leadId) : null;
      const facts = [
        ['Cliente desde', c.desde ? fmtDate(c.desde) : '—'],
        ['Segmento', c.segmento || '—'],
        ['Cidade', c.cidade || '—'],
        ['Origem', c.origem || '—'],
        ['CNPJ/CPF', c.documento || '—'],
        ['Contato', c.contato || '—'],
      ];
      return {
        title: `${esc(c.nome)}${demoTag(c)}`,
        sub: `${plural(projs.length, 'projeto', 'projetos')}${fin.mrr ? ` · ${money(fin.mrr)}/mês recorrente` : ''}`,
        body: `<div class="mini-kpis"><div><span>Recebido</span><b>${money0(fin.recebido)}</b></div><div><span>A receber</span><b>${money0(fin.aberto)}</b></div><div><span>Recorrente</span><b>${fin.mrr ? money0(fin.mrr) + '/mês' : '—'}</b></div></div>
          <div class="row-actions" data-write><button type="button" class="btn btn-primary" data-venda>${ic('plus')}Nova venda</button><button type="button" class="btn" data-lanc>${ic('coin')}Novo lançamento</button></div>
          <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${contactBlock(c)}
          <section class="dsec"><h4>Projetos</h4>${projs.length ? `<ul class="mini-list">${projs.map((p) => { const pf = Calc.projetoFin(p); return `<li><button type="button" class="mini-row" data-open-projeto="${esc(p.id)}"><span class="mr-main"><b>${esc(p.titulo)}</b><small>${esc(SERVICO[p.servico] || '')} · fechado ${fmtDate(p.dataFechamento)}</small></span><span class="mr-side">${statusPill(p.status)}<small>${money0(pf.recebido)} de ${money0(p.valor)}</small></span></button></li>`; }).join('')}</ul>` : '<p class="muted">Nenhum projeto ainda.</p>'}</section>
          ${recs.length ? `<section class="dsec"><h4>Recorrências</h4><ul class="mini-list">${recs.map((r) => `<li><div class="mini-row static"><span class="mr-main"><b>${esc(r.descricao)}</b><small>${r.frequencia === 'anual' ? 'Anual' : 'Mensal'}, dia ${esc(r.dia)}</small></span><span class="mr-side">${r.ativo ? pill('Ativa', 'good') : pill('Pausada', 'gray')}<small>${money(r.valor)}</small></span></div></li>`).join('')}</ul></section>` : ''}
          <section class="dsec"><h4>Lançamentos</h4>${lancs.length ? `<ul class="mini-list">${lancs.slice(0, 12).map((l) => lancMiniRow(l)).join('')}</ul>${lancs.length > 12 ? `<p class="muted small">Mais ${lancs.length - 12} no financeiro.</p>` : ''}` : '<p class="muted">Nenhum lançamento.</p>'}</section>
          ${lead ? `<section class="dsec"><h4>Origem no funil</h4><button type="button" class="link" data-open-lead="${esc(lead.id)}">Ver histórico do lead ${esc(lead.empresa)}</button></section>` : ''}
          ${c.notas ? `<section class="dsec"><h4>Observações</h4><p class="pre">${esc(c.notas)}</p></section>` : ''}`,
        foot: `<button type="button" class="btn btn-ghost danger-text" data-del data-write>${ic('trash')}Excluir</button><span class="grow"></span><button type="button" class="btn" data-edit data-write>${ic('edit')}Editar cliente</button>`,
      };
    },
    bind: (el) => {
      bindCommon(el);
      on(el, '[data-venda]', 'click', () => winFlow({ clienteId: id }));
      on(el, '[data-lanc]', 'click', () => editLancamento(null, { tipo: 'entrada', clienteId: id, categoria: 'Projetos' }));
      on(el, '[data-edit]', 'click', () => editCliente(id));
      on(el, '[data-del]', 'click', async () => {
        const n = Store.all('projetos').filter((p) => p.clienteId === id).length;
        if (await deleteRecord('clientes', id, { titulo: 'Excluir este cliente?', texto: n ? `Os ${plural(n, 'projeto', 'projetos')} e lançamentos ligados a ele continuam no CRM, sem cliente.` : '', feito: 'Cliente excluído.' })) Drawer.close();
      });
    },
  });
}
function lancMiniRow(l) {
  const sign = l.tipo === 'entrada' ? '' : '−';
  return `<li><button type="button" class="mini-row" data-open-lanc="${esc(l.id)}"><span class="mr-main"><b>${esc(l.descricao)}</b><small>${l.pagoEm ? `${l.tipo === 'entrada' ? 'recebido' : 'pago'} em ${fmtDate(l.pagoEm)}` : `vence ${relDay(l.vencimento)}`}</small></span><span class="mr-side">${lancPill(l)}<small class="${l.tipo === 'entrada' ? 'pos' : 'neg'}">${sign}${money(l.valor)}</small></span></button>${!l.pagoEm ? `<button type="button" class="btn btn-sm mini-pay" data-pay="${esc(l.id)}" data-write>${ic('check')}${l.tipo === 'entrada' ? 'Recebido' : 'Pago'}</button>` : ''}</li>`;
}

/* ══════════ PROJETOS ══════════ */
function projetoFields() {
  return [
    { k: 'titulo', l: 'Nome do projeto', req: true, span: 2 },
    { k: 'clienteId', l: 'Cliente', t: 'select', opts: optClientes, empty: 'Selecione', req: true, span: 2 },
    { k: 'servico', l: 'Serviço', t: 'select', opts: SERVICOS.map((s) => ({ v: s.k, l: s.l })) },
    { k: 'status', l: 'Status', t: 'select', opts: STATUS_PROJ.map((s) => ({ v: s.k, l: s.l })) },
    { k: 'valor', l: 'Valor total', t: 'money', req: true },
    { k: 'dataFechamento', l: 'Fechado em', t: 'date' },
    { k: 'prazo', l: 'Prazo de entrega', t: 'date' },
    { k: 'entregueEm', l: 'Entregue em', t: 'date', show: (v) => v.status === 'entregue' },
    { k: 'vendedor', l: 'Vendido por', t: 'select', opts: optSocios() },
    { k: 'executor', l: 'Execução', t: 'select', opts: optSocios() },
    { k: 'notas', l: 'Observações', t: 'textarea', span: 2 },
  ];
}
function editProjeto(id) {
  const cur = Store.get('projetos', id);
  if (!cur) return;
  const fields = projetoFields();
  const { fid, html } = buildForm(fields, { ...cur });
  Drawer.open({
    focus: `#${fid}_titulo`,
    view: () => ({ title: 'Editar projeto', sub: esc(cur.titulo), body: html, foot: formFoot('Salvar alterações') }),
    bind: (el) => {
      bindForm(el, fid, fields);
      on(el, '[data-cancel]', 'click', () => showProjeto(id));
      on(el, '[data-save]', 'click', (e, btn) =>
        busy(btn, async () => {
          const v = readForm(el, fid, fields);
          if (!validateForm(el, fid, fields, v)) return;
          if (v.status === 'entregue' && !v.entregueEm) v.entregueEm = today();
          try {
            const antes = cur.status;
            await Store.patch('projetos', id, { ...v, atualizadoEm: nowISO() });
            const n = v.status === 'entregue' && antes !== 'entregue' ? await posEntrega(id) : 0;
            toast(n ? `Projeto atualizado. ${plural(n, 'tarefa', 'tarefas')} de pós-venda na agenda.` : 'Projeto atualizado.');
            showProjeto(id);
          } catch {}
        })
      );
    },
  });
}
function showProjeto(id) {
  Drawer.open({
    refreshable: true,
    grace: Date.now() + 4000,
    view: () => {
      const p = Store.get('projetos', id);
      if (!p) return null;
      const f = Calc.projetoFin(p);
      const parcelas = f.ls.slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
      const recs = Store.all('recorrencias').filter((r) => r.projetoId === id);
      const atrasoPrazo = p.prazo && PROJ_ATIVOS.includes(p.status) && p.prazo < today();
      const facts = [
        ['Cliente', clienteNome(p.clienteId)],
        ['Serviço', SERVICO[p.servico] || '—'],
        ['Fechado em', fmtDate(p.dataFechamento)],
        ['Prazo de entrega', p.prazo ? fmtDate(p.prazo) + (atrasoPrazo ? ` (${relDay(p.prazo)})` : '') : '—'],
        ['Vendido por', socioNome(p.vendedor)],
        ['Execução', socioNome(p.executor)],
      ];
      if (p.status === 'entregue') facts.push(['Entregue em', fmtDate(p.entregueEm)]);
      const cli = Store.get('clientes', p.clienteId);
      const pmk = Drawer.msgK && Drawer.msgK[id] ? Drawer.msgK[id] : 'depoimento';
      const pmsg = p.status === 'entregue' && cli ? `<section class="dsec" data-write><div class="dsec-h"><h4>Mensagem pronta</h4><div class="seg seg-sm" role="radiogroup" aria-label="Qual mensagem" id="pmk_${esc(id)}">${['depoimento', 'manutencao'].map((k) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === pmk}">${esc(MSG_INFO[k].l)}</button>`).join('')}</div></div>${msgCard({ titulo: '', texto: msgProjeto(p, pmk), tel: cli.telefone, email: cli.email, assunto: `Prisma Systems · ${p.titulo}` })}</section>` : '';
      return {
        title: `${esc(p.titulo)}${demoTag(p)}`,
        sub: `${statusPill(p.status)}<button type="button" class="link" data-open-cliente="${esc(p.clienteId || '')}">${esc(clienteNome(p.clienteId))}</button>`,
        head: `<div class="av-pair">${avatar(p.vendedor)}${avatar(p.executor)}</div>`,
        body: `<div class="pay-sum"><div class="ps-top"><span>Recebido</span><b>${money(f.recebido)}</b><span class="muted">de ${money(p.valor)}</span></div>${meter(f.pct)}<div class="ps-bot"><span>${pct(f.pct)} recebido</span>${f.pendente ? `<span>${money(f.pendente)} a receber</span>` : ''}${f.semParcela ? `<span class="warn-text">${money(f.semParcela)} sem parcela lançada</span>` : ''}</div></div>
          <div class="field status-field" data-write><label for="pst_${esc(id)}">Status do projeto</label><select id="pst_${esc(id)}">${STATUS_PROJ.map((s) => `<option value="${s.k}"${s.k === p.status ? ' selected' : ''}>${esc(s.l)}</option>`).join('')}</select></div>
          <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${pmsg}
          <section class="dsec"><div class="dsec-h"><h4>Parcelas</h4><button type="button" class="btn btn-sm" data-add-parcela data-write>${ic('plus')}Adicionar parcela</button></div>${parcelas.length ? `<ul class="mini-list">${parcelas.map((l) => lancMiniRow(l)).join('')}</ul>` : '<p class="muted">Nenhuma parcela lançada.</p>'}</section>
          ${recs.length ? `<section class="dsec"><h4>Mensalidade</h4><ul class="mini-list">${recs.map((r) => `<li><button type="button" class="mini-row" data-rec="${esc(r.id)}"><span class="mr-main"><b>${esc(r.descricao)}</b><small>todo dia ${esc(r.dia)} · desde ${monthLabel(r.inicio || thisMonth())}</small></span><span class="mr-side">${r.ativo ? pill('Ativa', 'good') : pill('Pausada', 'gray')}<small>${money(r.valor)}</small></span></button></li>`).join('')}</ul></section>` : ''}
          ${p.notas ? `<section class="dsec"><h4>Observações</h4><p class="pre">${esc(p.notas)}</p></section>` : ''}`,
        foot: `<button type="button" class="btn btn-ghost danger-text" data-del data-write>${ic('trash')}Excluir</button><span class="grow"></span><button type="button" class="btn" data-edit data-write>${ic('edit')}Editar projeto</button>`,
      };
    },
    bind: (el) => {
      bindCommon(el);
      const sel = $(`#pst_${CSS.escape(id)}`, el);
      if (sel)
        sel.addEventListener('change', async () => {
          try {
            await mudarStatusProjeto(id, sel.value);
          } catch {}
        });
      on(el, '[data-rec]', 'click', (e, b) => editRecorrencia(b.dataset.rec));
      const pmkEl = $(`#pmk_${CSS.escape(id)}`, el);
      if (pmkEl) pmkEl.addEventListener('click', (e) => {
        const r = e.target.closest('[role=radio]');
        if (!r) return;
        Drawer.msgK = Object.assign(Drawer.msgK || {}, { [id]: r.dataset.v });
        Drawer.refresh();
      });
      on(el, '[data-add-parcela]', 'click', () => {
        const p = Store.get('projetos', id);
        const f = Calc.projetoFin(p);
        editLancamento(null, { tipo: 'entrada', clienteId: p.clienteId, projetoId: id, categoria: 'Projetos', descricao: `${p.titulo} · Parcela`, valor: f.semParcela || null });
      });
      on(el, '[data-edit]', 'click', () => editProjeto(id));
      on(el, '[data-del]', 'click', async () => {
        const pend = Store.all('lancamentos').filter((l) => l.projetoId === id && !l.pagoEm);
        let alsoPend = false;
        const ok = await deleteRecord('projetos', id, {
          titulo: 'Excluir este projeto?',
          feito: 'Projeto excluído.',
          html: pend.length ? `<label class="check" for="delpend"><input type="checkbox" id="delpend" checked><span>Excluir também ${plural(pend.length, 'parcela em aberto', 'parcelas em aberto')} (${money(sum(pend, (l) => l.valor))})</span></label>` : '',
          before: (root) => { const c = $('#delpend', root); alsoPend = !!(c && c.checked); },
        });
        if (!ok) return;
        if (alsoPend) for (const l of pend) { try { await Store.remove('lancamentos', l.id); } catch { break; } }
        Drawer.close();
      });
    },
  });
}
