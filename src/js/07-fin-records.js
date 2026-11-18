/* ───────────────────────── registros: lançamentos, recorrências, tarefas ───────────────────────── */
function monthOptions(cur, from = -18, to = 24) {
  const base = thisMonth();
  const list = [];
  for (let i = from; i <= to; i++) list.push(monthAdd(base, i));
  if (cur && !list.includes(cur)) list.push(cur);
  return list.sort().map((m) => ({ v: m, l: monthLabel(m) }));
}
const catsFor = (tipo) => optList(tipo === 'entrada' ? cfg().categoriasEntrada : cfg().categoriasSaida);
const ehRetirada = (cat) => /pró-labore|pro-labore|retirada/i.test(cat || '');

function lancFields(isNew) {
  return [
    { k: 'tipo', l: 'Tipo', t: 'seg', opts: [{ v: 'entrada', l: 'Entrada', ic: 'in' }, { v: 'saida', l: 'Saída', ic: 'out' }], span: 2 },
    { k: 'descricao', l: 'Descrição', req: true, span: 2, ph: 'Ex.: Parcela 2/3 do site, Assinatura do Figma' },
    { k: 'valor', l: 'Valor', t: 'money', req: true, positive: true },
    { k: 'vencimento', l: 'Vencimento', t: 'date', req: true },
    { k: 'categoria', l: 'Categoria', t: 'select', opts: (v) => catsFor(v.tipo), req: true, empty: 'Selecione' },
    { k: 'forma', l: 'Forma', t: 'select', opts: optList(FORMAS), empty: '—' },
    { k: 'pago', l: 'Já foi pago ou recebido', t: 'check' },
    { k: 'pagoEm', l: 'Data do pagamento', t: 'date', show: (v) => v.pago },
    { k: 'clienteId', l: 'Cliente', t: 'select', opts: optClientes, empty: 'Nenhum' },
    { k: 'projetoId', l: 'Projeto', t: 'select', opts: (v) => optProjetos(v.clienteId), empty: 'Nenhum' },
    { k: 'socio', l: 'Sócio', t: 'select', opts: optSocios(), empty: '—', show: (v) => v.tipo === 'saida' && ehRetirada(v.categoria) },
    { k: 'repetir', l: 'Repetir todo mês (cria uma recorrência)', t: 'check', span: 2, show: () => isNew },
    { k: 'notas', l: 'Observações', t: 'textarea', span: 2, rows: 2 },
  ];
}

function editLancamento(id = null, preset = {}) {
  const cur = id ? Store.get('lancamentos', id) : null;
  if (id && !cur) return;
  const vals = cur ? { ...cur, pago: !!cur.pagoEm } : { tipo: 'saida', vencimento: today(), pago: false, forma: 'Pix', ...preset };
  if (preset.pago === undefined && !cur) vals.pago = false;
  const fields = lancFields(!cur);
  const { fid, html } = buildForm(fields, vals);
  const daRec = cur && cur.recorrenciaId ? Store.get('recorrencias', cur.recorrenciaId) : null;
  const cliCob = cur && cur.tipo === 'entrada' && !cur.pagoEm && cur.clienteId ? Store.get('clientes', cur.clienteId) : null;
  const cobHTML = cliCob ? `<section class="dsec" data-write><h4>${cur.vencimento && cur.vencimento < today() ? 'Cobrar o cliente' : 'Lembrar o cliente'}</h4>${msgCard({ titulo: '', texto: msgCobranca(cur), tel: cliCob.telefone, email: cliCob.email, assunto: `Prisma Systems · ${cur.descricao}` })}</section>` : '';
  const autoHTML = cur && cur.auto === 'imposto' ? `<div class="banner b-blue">${ic('plane')}<div>Lançado pelo piloto automático. ${esc(cur.notas || '')}</div></div>` : '';
  Drawer.open({
    focus: cur ? `#${fid}_valor` : `#${fid}_descricao`,
    view: () => ({
      title: cur ? 'Editar lançamento' : vals.tipo === 'entrada' ? 'Nova entrada' : 'Nova despesa',
      sub: cur ? `${lancPill(cur)}${demoTag(cur)}` : 'Registre um valor a receber ou a pagar',
      body: `${daRec ? `<div class="banner b-blue">${ic('repeat')}<div>Gerado pela recorrência <b>${esc(daRec.descricao)}</b> (${monthLabel(cur.competencia || monthOf(cur.vencimento))}). Mudanças aqui valem só para este mês.</div></div>` : ''}${autoHTML}${cobHTML}${html}`,
      foot: formFoot(cur ? 'Salvar alterações' : 'Salvar lançamento', cur ? `<button type="button" class="btn btn-ghost danger-text" data-del>${ic('trash')}Excluir</button><button type="button" class="btn btn-ghost" data-dup>${ic('copy2')}Duplicar</button>` : ''),
    }),
    bind: (el) => {
      on(el, '[data-dup]', 'click', () => {
        const { id: _i, pagoEm: _p, recorrenciaId: _r, competencia: _c, criadoEm: _ce, demo: _d, ...base } = cur;
        editLancamento(null, { ...base, vencimento: addMonths(cur.vencimento || today(), 1), pago: false });
        toast('Cópia aberta com vencimento no mês seguinte. Confira e salve.');
      });
      bindForm(el, fid, fields, (v, root) => {
        const t = $('#drawer_t', root);
        if (!cur && t) t.textContent = v.tipo === 'entrada' ? 'Nova entrada' : 'Nova despesa';
      });
      on(el, '[data-cancel]', 'click', () => Drawer.close());
      on(el, '[data-del]', 'click', async () => {
        const txt = cur.recorrenciaId && daRec ? `Ele veio da recorrência ${daRec.descricao}: excluir pula só ${monthLabel(cur.competencia || monthOf(cur.vencimento)).toLowerCase()}, e o piloto automático não lança este mês de novo. Os outros meses continuam.` : cur.auto === 'imposto' ? 'O piloto automático não lança de novo o imposto deste mês.' : '';
        if (await deleteRecord('lancamentos', id, { titulo: 'Excluir este lançamento?', texto: txt, feito: cur.recorrenciaId ? 'Lançamento excluído. Este mês da recorrência foi pulado.' : 'Lançamento excluído.' })) Drawer.close();
      });
      on(el, '[data-save]', 'click', (e, btn) =>
        busy(btn, async () => {
          const v = readForm(el, fid, fields);
          if (!validateForm(el, fid, fields, v)) return;
          const data = {
            tipo: v.tipo || 'saida',
            descricao: v.descricao,
            valor: v.valor,
            vencimento: v.vencimento,
            categoria: v.categoria,
            forma: v.forma || '',
            pagoEm: v.pago ? v.pagoEm || today() : null,
            clienteId: v.clienteId || null,
            projetoId: v.projetoId || null,
            socio: v.tipo === 'saida' && ehRetirada(v.categoria) ? v.socio || null : null,
            notas: v.notas || '',
          };
          try {
            if (cur) {
              const ch = { ...data, atualizadoEm: nowISO() };
              await Store.patch('lancamentos', cur.id, ch);
              const nf = !cur.pagoEm && data.pagoEm ? await notaFiscalAuto({ ...cur, ...data }).catch(() => null) : null;
              toast(nf ? 'Lançamento atualizado. Tarefa de nota fiscal criada.' : 'Lançamento atualizado.');
            } else if (v.repetir) {
              const rid = newId('rc');
              const m = monthOf(v.vencimento);
              const demo = herdaDemo(data);
              await Store.put('recorrencias', rid, { tipo: data.tipo, descricao: data.descricao, valor: data.valor, categoria: data.categoria, frequencia: 'mensal', dia: +v.vencimento.slice(8, 10), mesAnual: null, inicio: m, fim: '', ativo: true, clienteId: data.clienteId, projetoId: data.projetoId, forma: data.forma, criadoEm: nowISO(), criadoPor: S.me, ...demo });
              await Store.put('lancamentos', Calc.recLancId(rid, m), { ...data, recorrenciaId: rid, competencia: m, criadoEm: nowISO(), criadoPor: S.me, ...demo });
              toast('Lançamento salvo e recorrência criada.');
            } else {
              const nid = newId('lc');
              const novo = { ...data, criadoEm: nowISO(), criadoPor: S.me, ...herdaDemo(data) };
              await Store.put('lancamentos', nid, novo);
              const nf = novo.pagoEm ? await notaFiscalAuto({ ...novo, id: nid }).catch(() => null) : null;
              toast(data.tipo === 'entrada' ? (nf ? 'Entrada registrada. Tarefa de nota fiscal criada.' : 'Entrada registrada.') : 'Despesa registrada.');
            }
            Drawer.close();
          } catch {}
        })
      );
    },
  });
}

async function marcarPago(id) {
  const l = Store.get('lancamentos', id);
  if (!l || l.pagoEm) return;
  try {
    await Store.patch('lancamentos', id, { pagoEm: today(), atualizadoEm: nowISO() });
  } catch {
    return;
  }
  let nf = null;
  try { nf = await notaFiscalAuto(l); } catch {}
  toast(`${l.tipo === 'entrada' ? 'Recebido' : 'Pago'}: ${l.descricao} (${money(l.valor)}).${nf ? ' Tarefa de nota fiscal criada.' : ''}`, {
    action: 'Desfazer',
    ms: 6000,
    onAction: () => {
      Store.patch('lancamentos', id, { pagoEm: null }).catch(() => {});
      desfazNotaFiscal(nf);
    },
  });
}

/* ── recorrências ── */
function recFields() {
  return [
    { k: 'tipo', l: 'Tipo', t: 'seg', opts: [{ v: 'saida', l: 'Despesa fixa', ic: 'out' }, { v: 'entrada', l: 'Receita recorrente', ic: 'in' }], span: 2 },
    { k: 'descricao', l: 'Descrição', req: true, span: 2, ph: 'Ex.: Hospedagem, Figma, Manutenção mensal' },
    { k: 'valor', l: 'Valor', t: 'money', req: true, positive: true },
    { k: 'categoria', l: 'Categoria', t: 'select', opts: (v) => catsFor(v.tipo), req: true, empty: 'Selecione' },
    { k: 'frequencia', l: 'Frequência', t: 'seg', opts: [{ v: 'mensal', l: 'Mensal' }, { v: 'anual', l: 'Anual' }] },
    { k: 'dia', l: 'Dia do vencimento', t: 'number', min: 1, max: 31, req: true },
    { k: 'mesAnual', l: 'Mês do vencimento', t: 'select', opts: MESES.map((m, i) => ({ v: i + 1, l: cap(m) })), show: (v) => v.frequencia === 'anual' },
    { k: 'inicio', l: 'A partir de', t: 'select', opts: (v) => monthOptions(v.inicio), req: true },
    { k: 'fim', l: 'Até', t: 'select', opts: (v) => monthOptions(v.fim, -6, 36), empty: 'Sem data para acabar' },
    { k: 'clienteId', l: 'Cliente', t: 'select', opts: optClientes, empty: 'Nenhum', show: (v) => v.tipo === 'entrada' },
    { k: 'forma', l: 'Forma', t: 'select', opts: optList(FORMAS), empty: '—' },
    { k: 'ativo', l: 'Ativa (entra nos lançamentos do mês)', t: 'check', span: 2 },
  ];
}
function editRecorrencia(id = null, preset = {}) {
  const cur = id ? Store.get('recorrencias', id) : null;
  if (id && !cur) return;
  const vals = cur ? { ...cur } : { tipo: 'saida', frequencia: 'mensal', dia: 10, mesAnual: +thisMonth().slice(5, 7), inicio: thisMonth(), fim: '', ativo: true, forma: 'Cartão', ...preset };
  const fields = recFields();
  const { fid, html } = buildForm(fields, vals);
  Drawer.open({
    focus: `#${fid}_descricao`,
    view: () => ({
      title: cur ? 'Editar recorrência' : 'Nova recorrência',
      sub: cur ? esc(cur.descricao) + demoTag(cur) : 'Custos fixos e mensalidades que se repetem',
      body: `${html}${cur && (cur.pulados || []).length ? `<section class="dsec"><h4>Meses pulados</h4><ul class="pulados">${cur.pulados.slice().sort().map((m) => `<li><span>${esc(monthLabel(m))}</span><button type="button" class="btn btn-sm btn-ghost" data-despular="${esc(m)}" data-write>Voltar a lançar</button></li>`).join('')}</ul></section>` : ''}<p class="muted small form-note">${cfg().auto.recorrencias ? 'O piloto automático lança esta recorrência no caixa no começo de cada mês.' : 'Todo mês, o CRM avisa quando há recorrências para lançar.'} Os lançamentos já criados não mudam quando você edita a recorrência.</p>`,
      foot: formFoot(cur ? 'Salvar alterações' : 'Criar recorrência', cur ? `<button type="button" class="btn btn-ghost danger-text" data-del>${ic('trash')}Excluir</button>` : ''),
    }),
    bind: (el) => {
      bindForm(el, fid, fields);
      on(el, '[data-cancel]', 'click', () => Drawer.close());
      on(el, '[data-despular]', 'click', async (e, b) => {
        const r = Store.get('recorrencias', id);
        if (!r) return;
        try {
          await Store.patch('recorrencias', id, { pulados: (r.pulados || []).filter((m) => m !== b.dataset.despular) });
          toast(`${monthLabel(b.dataset.despular)} volta a ser lançado.`);
          b.closest('li').remove();
          Auto.agendar(800);
        } catch {}
      });
      on(el, '[data-del]', 'click', async () => {
        if (await deleteRecord('recorrencias', id, { titulo: 'Excluir esta recorrência?', texto: 'Os lançamentos que ela já gerou continuam no caixa.', feito: 'Recorrência excluída.' })) Drawer.close();
      });
      on(el, '[data-save]', 'click', (e, btn) =>
        busy(btn, async () => {
          const v = readForm(el, fid, fields);
          if (!validateForm(el, fid, fields, v)) return;
          const data = { ...v, dia: Math.min(31, Math.max(1, +v.dia || 1)), mesAnual: v.frequencia === 'anual' ? +v.mesAnual || 1 : null, clienteId: v.tipo === 'entrada' ? v.clienteId || null : null, fim: v.fim || '' };
          try {
            if (cur) await Store.patch('recorrencias', cur.id, { ...data, atualizadoEm: nowISO() });
            else await Store.put('recorrencias', newId('rc'), { ...data, criadoEm: nowISO(), criadoPor: S.me, ...herdaDemo(data) });
            const lancaJa = cfg().auto.recorrencias && data.ativo && Calc.recAplica(data, thisMonth());
            toast(cur ? 'Recorrência atualizada.' : lancaJa ? 'Recorrência criada. O lançamento deste mês entra no caixa em instantes.' : 'Recorrência criada.');
            if (lancaJa) Auto.agendar(900);
            Drawer.close();
          } catch {}
        })
      );
    },
  });
}
let lancandoRec = false;
async function lancarRecorrencias(m) {
  if (lancandoRec) return;
  const pend = Calc.recPendentes(m);
  if (!pend.length) return toast(`Nada para lançar em ${monthLabel(m).toLowerCase()}.`);
  lancandoRec = true;
  let n = 0;
  try {
    for (const r of pend) {
      if (await criarSeNaoExiste('lancamentos', Calc.recLancId(r.id, m), corpoRecorrencia(r, m))) n++;
    }
  } catch {
    /* aviso já exibido */
  } finally {
    lancandoRec = false;
  }
  if (n) toast(`${plural(n, 'lançamento criado', 'lançamentos criados')} em ${monthLabel(m).toLowerCase()}.`);
}

/* ── tarefas ── */
function optVinculos() {
  const out = [];
  Calc.leadsAbertos().sort((a, b) => byName(a.empresa, b.empresa)).forEach((l) => out.push({ v: `lead:${l.id}`, l: `Lead · ${l.empresa}` }));
  Store.all('clientes').sort((a, b) => byName(a.nome, b.nome)).forEach((c) => out.push({ v: `cliente:${c.id}`, l: `Cliente · ${c.nome}` }));
  Store.all('projetos').filter((p) => PROJ_ATIVOS.includes(p.status)).sort((a, b) => byName(a.titulo, b.titulo)).forEach((p) => out.push({ v: `projeto:${p.id}`, l: `Projeto · ${p.titulo}` }));
  return out;
}
function vinculoLabel(v) {
  if (!v) return '';
  const [tipo, id] = String(v).split(':');
  if (tipo === 'lead') { const l = Store.get('leads', id); return l ? l.empresa : ''; }
  if (tipo === 'cliente') { const c = Store.get('clientes', id); return c ? c.nome : ''; }
  if (tipo === 'projeto') { const p = Store.get('projetos', id); return p ? p.titulo : ''; }
  return '';
}
function openVinculo(v) {
  const [tipo, id] = String(v || '').split(':');
  if (tipo === 'lead') showLead(id);
  else if (tipo === 'cliente') showCliente(id);
  else if (tipo === 'projeto') showProjeto(id);
}
function tarefaFields() {
  return [
    { k: 'titulo', l: 'Tarefa', req: true, span: 2, ph: 'Ex.: Enviar proposta revisada' },
    { k: 'responsavel', l: 'Responsável', t: 'select', opts: optSocios() },
    { k: 'prazo', l: 'Prazo', t: 'date' },
    { k: 'vinculo', l: 'Relacionada a', t: 'select', opts: optVinculos, empty: 'Nada específico', span: 2 },
    { k: 'notas', l: 'Observações', t: 'textarea', span: 2, rows: 2 },
  ];
}
function editTarefa(id = null, preset = {}) {
  const cur = id ? Store.get('tarefas', id) : null;
  if (id && !cur) return;
  const vals = cur ? { ...cur } : { responsavel: S.me || 'rafael', prazo: today(), ...preset };
  const fields = tarefaFields();
  const { fid, html } = buildForm(fields, vals);
  Drawer.open({
    focus: `#${fid}_titulo`,
    view: () => ({
      title: cur ? 'Editar tarefa' : 'Nova tarefa',
      sub: cur ? (cur.feita ? pill('Concluída', 'good', 'check') : pill('Aberta', 'gray')) + demoTag(cur) : 'Algo que um de vocês precisa fazer',
      body: html,
      foot: formFoot(cur ? 'Salvar alterações' : 'Criar tarefa', cur ? `<button type="button" class="btn btn-ghost danger-text" data-del>${ic('trash')}Excluir</button>` : ''),
    }),
    bind: (el) => {
      bindForm(el, fid, fields);
      on(el, '[data-cancel]', 'click', () => Drawer.close());
      on(el, '[data-del]', 'click', async () => {
        if (await deleteRecord('tarefas', id, { titulo: 'Excluir esta tarefa?', feito: 'Tarefa excluída.' })) Drawer.close();
      });
      on(el, '[data-save]', 'click', (e, btn) =>
        busy(btn, async () => {
          const v = readForm(el, fid, fields);
          if (!validateForm(el, fid, fields, v)) return;
          try {
            if (cur) await Store.patch('tarefas', cur.id, { ...v, atualizadoEm: nowISO() });
            else await Store.put('tarefas', newId('tf'), { ...v, feita: false, feitaEm: null, criadoEm: nowISO(), criadoPor: S.me, ...herdaDemo({ vinculo: v.vinculo }) });
            toast(cur ? 'Tarefa atualizada.' : 'Tarefa criada.');
            Drawer.close();
          } catch {}
        })
      );
    },
  });
}
async function toggleTarefa(id) {
  const x = Store.get('tarefas', id);
  if (!x) return;
  const feita = !x.feita;
  try {
    await Store.patch('tarefas', id, { feita, feitaEm: feita ? today() : null, concluidaPor: feita ? S.me : null });
  } catch {
    return;
  }
  if (feita) toast(`Concluída: ${x.titulo}`, { action: 'Desfazer', ms: 5000, onAction: () => Store.patch('tarefas', id, { feita: false, feitaEm: null }).catch(() => {}) });
}

/* ── excluir com desfazer ── */
function deleteRecord(col, id, { titulo = 'Excluir?', texto = '', feito = 'Excluído.', html = '', before = null } = {}) {
  const r = Store.get(col, id);
  if (!r) return Promise.resolve(false);
  return new Promise((resolve) => {
    let ok = false;
    Modal.open({
      title: titulo,
      body: `<p class="modal-text">${esc(texto || 'Você pode desfazer logo depois, pelo aviso que aparece embaixo.')}</p>${html}`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        {
          label: 'Excluir',
          kind: 'danger',
          onClick: async (root) => {
            if (before) before(root);
            const data = { ...r };
            try {
              await Store.remove(col, id);
            } catch {
              return false;
            }
            ok = true;
            // lançamento gerado por recorrência: o mês fica marcado como pulado para não ser lançado de novo
            const rec = col === 'lancamentos' && r.recorrenciaId && r.competencia ? Store.get('recorrencias', r.recorrenciaId) : null;
            if (rec && !(rec.pulados || []).includes(r.competencia)) Store.patch('recorrencias', rec.id, { pulados: [...(rec.pulados || []), r.competencia] }).catch(() => {});
            toast(feito, {
              action: 'Desfazer',
              ms: 7000,
              onAction: async () => {
                try { await Store.put(col, id, data); } catch { return; }
                const rr = rec && Store.get('recorrencias', rec.id);
                if (rr) Store.patch('recorrencias', rr.id, { pulados: (rr.pulados || []).filter((m) => m !== r.competencia) }).catch(() => {});
              },
            });
          },
        },
      ],
      onClose: () => resolve(ok),
    });
  });
}

/* ── busca global ── */
function searchAll(q) {
  const n = norm(q).trim();
  if (n.length < 2) return [];
  const hit = (...xs) => xs.some((x) => norm(x).includes(n));
  const out = [];
  for (const l of Store.all('leads')) if (hit(l.empresa, l.contato, l.email, l.telefone, l.cidade)) out.push({ kind: 'Lead', ic: 'funil', title: l.empresa, sub: `${ETAPA[l.etapa] ? ETAPA[l.etapa].l : ''}${l.contato ? ' · ' + l.contato : ''}`, open: () => showLead(l.id), rank: ABERTAS.includes(l.etapa) ? 0 : 2 });
  for (const c of Store.all('clientes')) if (hit(c.nome, c.contato, c.email, c.telefone, c.documento)) out.push({ kind: 'Cliente', ic: 'clientes', title: c.nome, sub: c.contato || c.segmento || '', open: () => showCliente(c.id), rank: 1 });
  for (const p of Store.all('projetos')) if (hit(p.titulo, clienteNome(p.clienteId))) out.push({ kind: 'Projeto', ic: 'projetos', title: p.titulo, sub: clienteNome(p.clienteId), open: () => showProjeto(p.id), rank: 1 });
  for (const l of Store.all('lancamentos')) if (hit(l.descricao)) out.push({ kind: 'Lançamento', ic: 'financeiro', title: l.descricao, sub: `${money(l.valor)} · ${fmtDate(l.vencimento)}`, open: () => editLancamento(l.id), rank: 3 });
  return out.sort((a, b) => a.rank - b.rank || byName(a.title, b.title)).slice(0, 9);
}
