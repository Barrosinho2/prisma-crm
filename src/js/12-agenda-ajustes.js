/* ───────────────────────── AGENDA ───────────────────────── */
const Agenda = {
  quem: 'todos',
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Agenda</h1><p class="vsub" id="ag_sub"></p></div><div class="vactions"><button type="button" class="btn btn-primary" data-ntask data-write>${ic('plus')}Nova tarefa</button></div></div>
      <div class="toolbar"><div class="seg seg-sm" role="radiogroup" aria-label="Mostrar a agenda de" id="ag_quem"></div></div>
      <form class="quick-add" id="ag_quick" data-write autocomplete="off"><span class="qa-ic">${ic('plus')}</span><input id="ag_qt" placeholder="Nova tarefa rápida, depois Enter" aria-label="Nova tarefa"><select id="ag_qr" aria-label="Responsável"></select><input type="date" id="ag_qd" aria-label="Prazo"><button type="submit" class="btn">Adicionar</button></form>
      <div class="vbody" id="ag_body"></div>`;
    $('#ag_quem', root).addEventListener('click', (e) => {
      const b = e.target.closest('[role=radio]');
      if (!b) return;
      Agenda.quem = b.dataset.v;
      Agenda.render();
    });
    $('#ag_qd', root).value = today();
    $('#ag_quick', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = $('#ag_qt', root);
      if (!t.value.trim()) { t.focus(); return; }
      const data = { titulo: t.value.trim(), responsavel: $('#ag_qr', root).value || S.me || 'rafael', prazo: $('#ag_qd', root).value || '', vinculo: '', notas: '', feita: false, feitaEm: null, criadoEm: nowISO(), criadoPor: S.me };
      try {
        await Store.put('tarefas', newId('tf'), data);
        t.value = '';
        toast('Tarefa adicionada.');
      } catch {}
      t.focus();
    });
    on(root, '[data-ntask]', 'click', () => editTarefa());
  },
  render() {
    const body = $('#ag_body');
    if (!body) return;
    const quemSeg = $('#ag_quem');
    quemSeg.innerHTML = [['todos', 'Todos'], ...SOCIOS.map((k) => [k, socioNome(k)])].map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${Agenda.quem === v}">${v !== 'todos' ? avatar(v, 'xs') : ''}<span>${esc(l)}</span></button>`).join('');
    const qr = $('#ag_qr');
    const curR = qr.value || (Agenda.quem !== 'todos' ? Agenda.quem : S.me || 'rafael');
    qr.innerHTML = SOCIOS.map((k) => `<option value="${k}"${k === curR ? ' selected' : ''}>${esc(socioNome(k))}</option>`).join('');
    if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
    const t = today();
    const amanha = addDays(t, 1);
    const semana = addDays(t, 7);
    const quem = Agenda.quem;
    const mine = (k) => quem === 'todos' || k === quem;
    const items = [];
    Calc.tarefasAbertas().filter((x) => mine(x.responsavel)).forEach((x) => items.push({ kind: 'tarefa', d: x.prazo || '', id: x.id, titulo: x.titulo, sub: vinculoLabel(x.vinculo), who: x.responsavel, rec: x }));
    Calc.leadsAbertos().filter((l) => l.proximoContato && mine(l.responsavel)).forEach((l) => items.push({ kind: 'follow', d: l.proximoContato, id: l.id, titulo: `Falar com ${l.empresa}`, sub: l.proximaAcao || ETAPA[l.etapa].l, who: l.responsavel, rec: l }));
    Store.all('lancamentos').filter((l) => !l.pagoEm && l.vencimento && l.vencimento <= addDays(t, 14)).forEach((l) => items.push({ kind: 'conta', d: l.vencimento, id: l.id, titulo: `${l.tipo === 'entrada' ? 'Receber' : 'Pagar'}: ${l.descricao}`, sub: money(l.valor) + (l.clienteId ? ' · ' + clienteNome(l.clienteId) : ''), rec: l }));
    const groups = [
      { k: 'atrasado', l: 'Atrasados', f: (i) => i.d && i.d < t },
      { k: 'hoje', l: 'Hoje', f: (i) => i.d === t },
      { k: 'amanha', l: 'Amanhã', f: (i) => i.d === amanha },
      { k: 'semana', l: 'Próximos 7 dias', f: (i) => i.d > amanha && i.d <= semana },
      { k: 'depois', l: 'Mais adiante', f: (i) => i.d > semana },
      { k: 'sem', l: 'Sem data', f: (i) => !i.d },
    ];
    const late = items.filter(groups[0].f).length;
    const hoje = items.filter(groups[1].f).length;
    $('#ag_sub').textContent = `${late ? plural(late, 'item atrasado', 'itens atrasados') + ' e ' : ''}${plural(hoje, 'item para hoje', 'itens para hoje')}. Contas aparecem até 14 dias antes do vencimento.`;
    const done = Store.all('tarefas').filter((x) => x.feita && x.feitaEm && x.feitaEm >= addDays(t, -7) && mine(x.responsavel)).sort((a, b) => String(b.feitaEm).localeCompare(String(a.feitaEm)));
    const rowHTML = (i) => {
      let lead = '';
      let act = '';
      const adiar = (i.kind === 'tarefa' || i.kind === 'follow') && i.d && i.d <= t ? `<button type="button" class="btn btn-sm btn-ghost" data-adiar="${i.kind}:${esc(i.id)}" data-write title="Passar para amanhã">Amanhã</button>` : '';
      if (i.kind === 'tarefa') { lead = `<button type="button" class="tick" data-tick="${esc(i.id)}" aria-label="Concluir: ${esc(i.titulo)}" data-write>${ic('check')}</button>`; act = adiar ? `<span class="ag-act">${adiar}</span>` : ''; }
      else if (i.kind === 'follow') {
        const wa = waMsgLink(i.rec.telefone, msgLead(i.rec));
        lead = `<span class="ag-ic">${ic('clock')}</span>`;
        act = `<span class="ag-act">${adiar}${wa ? `<a class="btn btn-sm btn-wa icon-only" href="${esc(wa)}" target="_blank" rel="noopener" data-wa-lead="${esc(i.id)}" aria-label="WhatsApp com mensagem pronta para ${esc(i.rec.empresa)}" title="WhatsApp com mensagem pronta">${ic('whatsapp')}</a>` : ''}<button type="button" class="btn btn-sm" data-flead="${esc(i.id)}">Registrar contato</button></span>`;
      } else {
        const cli = i.rec.tipo === 'entrada' && i.rec.clienteId ? Store.get('clientes', i.rec.clienteId) : null;
        const wa = cli ? waMsgLink(cli.telefone, msgCobranca(i.rec)) : '';
        lead = `<span class="ag-ic ${i.rec.tipo === 'entrada' ? 'in' : 'out'}">${ic(i.rec.tipo === 'entrada' ? 'in' : 'out')}</span>`;
        act = `<span class="ag-act" data-write>${wa ? `<a class="btn btn-sm btn-wa icon-only" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Cobrar ${esc(cli.nome)} no WhatsApp" title="Mensagem de cobrança no WhatsApp">${ic('whatsapp')}</a>` : ''}<button type="button" class="btn btn-sm" data-pay="${esc(i.id)}">${i.rec.tipo === 'entrada' ? 'Recebido' : 'Pago'}</button></span>`;
      }
      return `<li class="ag-i k-${i.kind}">${lead}<button type="button" class="ag-main" data-open="${i.kind}:${esc(i.id)}"><b>${esc(i.titulo)}</b>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</button><span class="ag-d ${i.d && i.d < t ? 'late' : ''}">${i.d ? esc(relDay(i.d)) : ''}</span>${i.who ? avatar(i.who, 'sm') : '<span class="av-ph"></span>'}${act || '<span class="ag-act"></span>'}</li>`;
    };
    const html = groups
      .map((g) => {
        const gi = items.filter(g.f).sort((a, b) => String(a.d).localeCompare(String(b.d)) || a.kind.localeCompare(b.kind));
        if (!gi.length) return '';
        return `<section class="ag-g g-${g.k}"><h2>${esc(g.l)} <span>${gi.length}</span></h2><ul class="ag-list">${gi.map(rowHTML).join('')}</ul></section>`;
      })
      .join('');
    body.innerHTML = (html || emptyState('Agenda livre', quem === 'todos' ? 'Nenhuma tarefa, follow-up ou conta por perto.' : `Nada pendente para ${socioNome(quem)}.`)) + (done.length ? `<details class="ag-done"><summary>Concluídas nos últimos 7 dias (${done.length})</summary><ul class="ag-list">${done.map((x) => `<li class="ag-i done"><button type="button" class="tick on" data-tick="${esc(x.id)}" aria-label="Reabrir: ${esc(x.titulo)}" data-write>${ic('check')}</button><button type="button" class="ag-main" data-open="tarefa:${esc(x.id)}"><b>${esc(x.titulo)}</b><small>concluída ${esc(relDay(x.feitaEm))}</small></button><span class="ag-d"></span>${avatar(x.responsavel, 'sm')}<span class="ag-act"></span></li>`).join('')}</ul></details>` : '');
    on(body, '[data-tick]', 'click', (e, b) => toggleTarefa(b.dataset.tick));
    on(body, '[data-flead]', 'click', (e, b) => showLead(b.dataset.flead));
    on(body, '[data-wa-lead]', 'click', (e, b) => { const l = Store.get('leads', b.dataset.waLead); if (l) registrarMsgLead(l.id, msgLeadTipo(l)); });
    on(body, '[data-adiar]', 'click', async (e, b) => {
      const [k, id] = b.dataset.adiar.split(':');
      const am = addDays(today(), 1);
      try {
        if (k === 'tarefa') await Store.patch('tarefas', id, { prazo: am, atualizadoEm: nowISO() });
        else await Store.patch('leads', id, { proximoContato: am, atualizadoEm: nowISO() });
        toast('Passou para amanhã.');
      } catch {}
    });
    on(body, '[data-pay]', 'click', (e, b) => marcarPago(b.dataset.pay));
    on(body, '[data-open]', 'click', (e, b) => {
      const [k, id] = b.dataset.open.split(':');
      if (k === 'tarefa') editTarefa(id);
      else if (k === 'follow') showLead(id);
      else editLancamento(id);
    });
  },
};

/* ───────────────────────── AJUSTES ───────────────────────── */
const Ajustes = {
  dirty: false,
  builtFrom: '',
  listas: null,
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Ajustes</h1><p class="vsub">Sócios, metas, caixa, listas e backup do Prisma CRM</p></div></div><div class="vbody" id="aj_body"></div>`;
    Ajustes.dirty = false;
    Ajustes.builtFrom = '';
  },
  render() {
    const body = $('#aj_body');
    if (!body) return;
    if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
    const sig = JSON.stringify(S.config);
    if (!Ajustes.dirty && sig !== Ajustes.builtFrom) Ajustes.build(body);
    Ajustes.renderDados();
    Ajustes.renderMe();
  },
  build(body) {
    const c = S.config;
    Ajustes.builtFrom = JSON.stringify(c);
    Ajustes.listas = { origens: [...c.origens], categoriasEntrada: [...c.categoriasEntrada], categoriasSaida: [...c.categoriasSaida], motivosPerda: [...c.motivosPerda] };
    const geral = [
      { k: 'nome_rafael', l: 'Sócio 1 (operacional)', req: true },
      { k: 'papel_rafael', l: 'Papel' },
      { k: 'nome_pedro', l: 'Sócio 2 (comercial)', req: true },
      { k: 'papel_pedro', l: 'Papel' },
      { k: 'metaMensal', l: 'Meta mensal de recebimentos', t: 'money', hint: 'Aparece no painel como progresso do mês' },
      { k: 'saldoInicial', l: 'Saldo inicial do caixa', t: 'money', hint: 'Quanto havia na conta na data abaixo' },
      { k: 'saldoInicialData', l: 'Data do saldo inicial', t: 'date', hint: 'Só pagamentos a partir desta data entram no saldo' },
    ];
    const gv = { nome_rafael: c.socios.rafael.nome, papel_rafael: c.socios.rafael.papel, nome_pedro: c.socios.pedro.nome, papel_pedro: c.socios.pedro.papel, metaMensal: c.metaMensal || null, saldoInicial: c.saldoInicial || null, saldoInicialData: c.saldoInicialData };
    const gf = buildForm(geral, gv);
    const listaHTML = (k, titulo, desc) => `<div class="lista" data-lista="${k}"><h4>${esc(titulo)}</h4><p class="muted small">${esc(desc)}</p><ul class="chips-edit" id="le_${k}"></ul><div class="lista-add"><input id="la_${k}" placeholder="Adicionar item" aria-label="Adicionar em ${esc(titulo)}"><button type="button" class="btn btn-sm" data-ladd="${k}">Adicionar</button></div></div>`;
    body.innerHTML = `
      <section class="panel aj"><div class="panel-h"><div><h3>${Host ? 'Sua conta' : 'Quem está usando este acesso'}</h3><p class="panel-sub">${Host ? 'Você entrou com e-mail e senha' : 'Usado para registrar quem fez cada coisa e filtrar a agenda'}</p></div></div><div class="pad" id="aj_me"></div></section>
      <section class="panel aj"><div class="panel-h"><div><h3>Piloto automático</h3><p class="panel-sub" id="aj_auto"></p></div><button type="button" class="btn btn-sm" data-goto-piloto>${ic('plane')}Abrir</button></div><div class="pad aj-row"><p class="muted small">Follow-ups, recorrências, tarefas de projeto, nota fiscal, cobranças e imposto: ligue, desligue e ajuste em um só lugar.</p><button type="button" class="link small" data-inicio-mostrar hidden>Mostrar os primeiros passos no painel</button></div></section>
      <section class="panel aj"><div class="panel-h"><div><h3>Aparência</h3><p class="panel-sub">Vale só para este navegador</p></div></div><div class="pad"><div class="seg" role="radiogroup" aria-label="Tema" id="aj_tema">${[['auto', 'Automático', 'auto'], ['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon']].map(([v, l, i]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${Tema.get() === v}">${ic(i)}<span>${l}</span></button>`).join('')}</div></div></section>
      <section class="panel aj" data-write><div class="panel-h"><div><h3>Empresa, metas e caixa</h3><p class="panel-sub">Vale para os dois sócios</p></div></div><div class="pad">${gf.html}<div class="aj-foot"><span class="muted small" id="aj_gmsg"></span><button type="button" class="btn btn-primary" id="aj_gsave" disabled>Salvar ajustes</button></div></div></section>
      <section class="panel aj" data-write><div class="panel-h"><div><h3>Listas</h3><p class="panel-sub">Opções que aparecem nos formulários</p></div></div><div class="pad listas">
        ${listaHTML('origens', 'Origens de lead', 'De onde os leads chegam')}
        ${listaHTML('categoriasEntrada', 'Categorias de entrada', 'Tipos de receita')}
        ${listaHTML('categoriasSaida', 'Categorias de despesa', 'Para onde o dinheiro vai')}
        ${listaHTML('motivosPerda', 'Motivos de perda', 'Por que um negócio não fecha')}
        <div class="aj-foot span-all"><span class="muted small" id="aj_lmsg"></span><button type="button" class="btn btn-primary" id="aj_lsave" disabled>Salvar listas</button></div>
      </div></section>
      <section class="panel aj"><div class="panel-h"><div><h3>Dados e backup</h3><p class="panel-sub" id="aj_count"></p></div></div><div class="pad" id="aj_dados"></div></section>
      <section class="panel aj"><div class="panel-h"><div><h3>${Host ? 'Acesso dos sócios' : 'Acesso compartilhado'}</h3></div></div><div class="pad prose" id="aj_acesso"></div></section>
      <p class="aj-sign">${prismMark('sm')}<span>Prisma CRM · Diferentes perspectivas. Soluções inteligentes.</span></p>`;
    let primeira = true;
    on(body, '[data-goto-piloto]', 'click', () => go('piloto'));
    const im = $('[data-inicio-mostrar]', body);
    if (im) {
      im.hidden = lsGet('prisma-crm-inicio-oculto') !== '1';
      im.addEventListener('click', () => {
        try { localStorage.removeItem('prisma-crm-inicio-oculto'); } catch {}
        go('painel');
      });
    }
    $('#aj_tema', body).addEventListener('click', (e) => {
      const b = e.target.closest('[role=radio]');
      if (!b) return;
      Tema.set(b.dataset.v);
      $$('#aj_tema [role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    bindForm(body, gf.fid, geral, () => {
      if (primeira) { primeira = false; return; }
      Ajustes.dirty = true;
      $('#aj_gsave').disabled = false;
      $('#aj_gmsg').textContent = 'Alterações não salvas';
    });
    $('#aj_gsave').addEventListener('click', (e) =>
      busy(e.currentTarget, async () => {
        const v = readForm(body, gf.fid, geral);
        if (!validateForm(body, gf.fid, geral, v)) return;
        const next = clone(S.config);
        next.socios.rafael = { nome: v.nome_rafael, papel: v.papel_rafael };
        next.socios.pedro = { nome: v.nome_pedro, papel: v.papel_pedro };
        next.metaMensal = v.metaMensal || 0;
        next.saldoInicial = v.saldoInicial || 0;
        next.saldoInicialData = v.saldoInicialData || '';
        try {
          await Store.saveConfig(next);
          Ajustes.dirty = false;
          Ajustes.builtFrom = '';
          toast('Ajustes salvos.');
          Ajustes.render();
        } catch {}
      })
    );
    const paintLista = (k) => {
      $(`#le_${k}`).innerHTML = Ajustes.listas[k].map((x, i) => `<li><span>${esc(x)}</span><button type="button" class="icon-btn xs" data-ldel="${k}:${i}" aria-label="Remover ${esc(x)}">${ic('close')}</button></li>`).join('');
      on($(`#le_${k}`), '[data-ldel]', 'click', (e, b) => {
        const [kk, i] = b.dataset.ldel.split(':');
        if (Ajustes.listas[kk].length <= 1) return toast('A lista precisa de pelo menos um item.', { type: 'error' });
        Ajustes.listas[kk].splice(+i, 1);
        markListas();
        paintLista(kk);
      });
    };
    const markListas = () => {
      Ajustes.dirty = true;
      $('#aj_lsave').disabled = false;
      $('#aj_lmsg').textContent = 'Alterações não salvas';
    };
    Object.keys(Ajustes.listas).forEach(paintLista);
    const addTo = (k) => {
      const inp = $(`#la_${k}`);
      const v = inp.value.trim();
      if (!v) return;
      if (Ajustes.listas[k].some((x) => norm(x) === norm(v))) return toast('Esse item já está na lista.', { type: 'error' });
      Ajustes.listas[k].push(v);
      inp.value = '';
      markListas();
      paintLista(k);
    };
    on(body, '[data-ladd]', 'click', (e, b) => addTo(b.dataset.ladd));
    Object.keys(Ajustes.listas).forEach((k) => $(`#la_${k}`).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTo(k); } }));
    $('#aj_lsave').addEventListener('click', (e) =>
      busy(e.currentTarget, async () => {
        const next = clone(S.config);
        Object.assign(next, clone(Ajustes.listas));
        try {
          await Store.saveConfig(next);
          Ajustes.dirty = false;
          Ajustes.builtFrom = '';
          toast('Listas salvas.');
          Ajustes.render();
        } catch {}
      })
    );
  },
  renderMe() {
    const ap = $('#aj_auto');
    if (ap) ap.textContent = `${autoLigadas()} de ${AUTO_TOGGLES.length + 1} automações ligadas`;
    const box = $('#aj_me');
    if (!box) return;
    if (Host) return Conta.renderMe(box);
    box.innerHTML = `<div class="me-pick" role="radiogroup" aria-label="Quem é você">${SOCIOS.map((k) => `<button type="button" role="radio" class="me-opt" data-me="${k}" aria-checked="${S.me === k}">${avatar(k, 'lg')}<span><b>${esc(socioNome(k))}</b><small>${esc(S.config.socios[k].papel || '')}</small></span></button>`).join('')}</div><p class="muted small">${S.mode === 'cloud' && S.uid ? 'A escolha fica salva na sua conta e vale em qualquer aparelho.' : 'A escolha fica salva neste navegador.'}</p>`;
    on(box, '[data-me]', 'click', (e, b) => { Store.setMe(b.dataset.me); toast(`Certo, ${socioNome(b.dataset.me)}.`); });
  },
  renderDados() {
    const box = $('#aj_dados');
    if (!box) return;
    const counts = COLS.map((c) => [c, Store.st[c].size]);
    const nomes = { leads: 'leads', clientes: 'clientes', projetos: 'projetos', lancamentos: 'lançamentos', recorrencias: 'recorrências', tarefas: 'tarefas' };
    $('#aj_count').textContent = `${fmtNum(Store.totalDocs())} registros no banco: ${counts.map(([c, n]) => `${n} ${nomes[c]}`).join(', ')}.`;
    const demos = COLS.reduce((a, c) => a + Store.all(c).filter((r) => r.demo).length, 0);
    box.innerHTML = `<div class="dados-acts">
        <button type="button" class="btn" data-exp="json">${ic('download')}Exportar backup completo (.json)</button>
        <button type="button" class="btn" data-exp="leads">${ic('download')}Leads em planilha (.csv)</button>
        <button type="button" class="btn" data-exp="lanc">${ic('download')}Lançamentos em planilha (.csv)</button>
        <label class="btn" data-write>${ic('upload')}Importar backup<input type="file" id="aj_imp" accept=".json,application/json" hidden></label>
      </div>
      ${demos ? `<div class="banner b-demo">${ic('spark')}<div><b>${plural(demos, 'registro de exemplo', 'registros de exemplo')} no CRM.</b> Apague quando for começar a usar com dados reais. Seus registros não são afetados.</div><button type="button" class="btn btn-sm" data-cleardemo data-write>Apagar exemplos</button></div>` : ''}
      <p class="muted small">O backup traz todos os registros e ajustes. A planilha abre no Excel ou no Google Planilhas.</p>`;
    on(box, '[data-exp]', 'click', (e, b) => exportar(b.dataset.exp));
    on(box, '[data-cleardemo]', 'click', () => apagarExemplos());
    const imp = $('#aj_imp', box);
    if (imp) imp.addEventListener('change', () => { if (imp.files[0]) importar(imp.files[0]); imp.value = ''; });
    const ac = $('#aj_acesso');
    if (ac && Host && S.mode === 'cloud') Conta.renderAcesso(ac);
    else if (ac) {
      ac.innerHTML = S.mode === 'cloud'
        ? `<p>${ic('check', 'ic-good')} Conectado ao banco do CRM. Tudo o que um sócio registra aparece para o outro em tempo real.</p><p>Para o ${esc(socioNome('pedro'))} entrar, compartilhe esta página pelo botão de compartilhar do Claude e convide o e-mail dele como <b>Editor</b>. Quem entra só como leitor vê os dados, mas não consegue alterar.</p>${S.readOnly ? `<p class="warn-text">${ic('alert')} Este acesso está somente leitura.</p>` : ''}`
        : `<p>${ic('alert', 'ic-warn')} ${S.localReason === 'nodb' ? 'O banco do CRM não respondeu nesta visita. O que for feito agora não será salvo. Recarregue a página.' : 'Esta cópia está rodando fora do Claude, sem banco de dados. Nada é salvo.'}</p>`;
    }
  },
};

/* ── exportar / importar / apagar exemplos ── */
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(head, rows) {
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
async function saveFile(filename, content, mime) {
  if (S.mode === 'local' && S.localReason === 'file') {
    try {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return;
    } catch {}
  }
  const dl = S.downloads;
  if (dl) {
    try {
      await dl.save({ filename, data: content });
      toast(`Arquivo ${filename} salvo.`);
      return;
    } catch (e) {
      if (e && e.code === 'declined') return;
      if (e && e.code === 'rate_limited') return toast('Já existe um download aguardando confirmação.', { type: 'error' });
    }
  }
  Modal.open({
    title: 'Copiar dados',
    body: `<p class="modal-text">Este acesso não permite baixar arquivos. Copie o conteúdo abaixo e cole num arquivo chamado <b>${esc(filename)}</b>.</p><textarea class="copybox" readonly rows="10">${esc(content.slice(0, 200000))}</textarea>`,
    actions: [{ label: 'Fechar', kind: 'ghost' }, { label: 'Copiar', kind: 'primary', onClick: () => copyText(content, 'Conteúdo copiado.').then(() => false) }],
  });
}
function exportar(tipo) {
  const d = today();
  if (tipo === 'json') {
    const data = { app: 'prisma-crm', versao: 1, exportadoEm: nowISO(), config: S.config };
    COLS.forEach((c) => (data[c] = Store.all(c)));
    return saveFile(`prisma-crm-backup-${d}.json`, JSON.stringify(data, null, 2), 'application/json');
  }
  if (tipo === 'leads') {
    const rows = Store.all('leads').map((l) => [l.empresa, l.contato, l.cargo, l.telefone, l.email, l.segmento, l.cidade, l.origem, (l.servicos || []).map((k) => SERVICO[k]).join(', '), +l.valor || 0, ETAPA[l.etapa] ? ETAPA[l.etapa].l : l.etapa, socioNome(l.responsavel), l.proximoContato ? fmtDate(l.proximoContato) : '', l.proximaAcao, l.motivoPerda || '', l.criadoEm ? fmtDate(String(l.criadoEm).slice(0, 10)) : '']);
    return saveFile(`prisma-crm-leads-${d}.csv`, toCSV(['Empresa', 'Contato', 'Cargo', 'Telefone', 'E-mail', 'Segmento', 'Cidade', 'Origem', 'Interesse', 'Valor estimado', 'Etapa', 'Responsável', 'Próximo contato', 'Próxima ação', 'Motivo da perda', 'Criado em'], rows), 'text/csv');
  }
  const rows = Store.all('lancamentos')
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
    .map((l) => [l.tipo === 'entrada' ? 'Entrada' : 'Saída', l.descricao, l.categoria, +l.valor || 0, fmtDate(l.vencimento), l.pagoEm ? fmtDate(l.pagoEm) : '', { pago: 'Pago', atrasado: 'Atrasado', pendente: 'Em aberto' }[Calc.lancStatus(l)], l.forma, l.clienteId ? clienteNome(l.clienteId) : '', projetoNome(l.projetoId), l.socio ? socioNome(l.socio) : '']);
  return saveFile(`prisma-crm-lancamentos-${d}.csv`, toCSV(['Tipo', 'Descrição', 'Categoria', 'Valor', 'Vencimento', 'Pago em', 'Status', 'Forma', 'Cliente', 'Projeto', 'Sócio'], rows), 'text/csv');
}
function progressModal(title) {
  const m = Modal.open({ title, body: `<div class="prog"><span class="meter"><i style="width:0%"></i></span><p class="muted small" id="prog_t">Preparando…</p></div>`, actions: [] });
  $('.modal-h [data-close]', m.el).hidden = true;
  $('.modal-backdrop', m.el).removeAttribute('data-close');
  return {
    set(n, total) {
      const i = $('.prog .meter i', m.el);
      if (i) i.style.width = ((n / total) * 100).toFixed(1) + '%';
      const t = $('#prog_t', m.el);
      if (t) t.textContent = `${n} de ${total}`;
    },
    close: () => m.close(),
  };
}
async function apagarExemplos() {
  const items = [];
  COLS.forEach((c) => Store.all(c).filter((r) => r.demo).forEach((r) => items.push({ op: 'remove', col: c, id: r.id })));
  if (!items.length) return;
  const ok = await confirmDialog({ title: 'Apagar os dados de exemplo?', text: `${plural(items.length, 'registro marcado', 'registros marcados')} como exemplo serão apagados. O que vocês cadastraram continua.`, confirm: 'Apagar exemplos', danger: true });
  if (!ok) return;
  const p = progressModal('Apagando exemplos');
  try {
    await Store.bulk(items, (n, t) => p.set(n, t));
    p.close();
    toast('Exemplos apagados. O CRM está pronto para os dados reais.', { ms: 6000 });
  } catch (e) {
    p.close();
    Store.writeError(e);
  }
}
async function importar(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('Esse arquivo não é um backup válido do Prisma CRM.', { type: 'error' });
  }
  if (!data || data.app !== 'prisma-crm') return toast('Esse arquivo não é um backup do Prisma CRM.', { type: 'error' });
  const items = [];
  COLS.forEach((c) => (Array.isArray(data[c]) ? data[c] : []).forEach((r) => { if (r && typeof r.id === 'string' && /^[\w.~:@+-]{1,200}$/.test(r.id)) items.push({ op: 'put', col: c, id: r.id, data: r }); }));
  if (!items.length) return toast('O backup não tem registros.', { type: 'error' });
  let comConfig = true;
  const ok = await confirmDialog({
    title: 'Importar backup?',
    text: `${plural(items.length, 'registro', 'registros')} de ${data.exportadoEm ? fmtDate(String(data.exportadoEm).slice(0, 10)) : 'data desconhecida'}. Registros com o mesmo código são substituídos; os outros continuam.`,
    html: data.config ? '<label class="check" for="imp_cfg"><input type="checkbox" id="imp_cfg" checked><span>Importar também os ajustes (sócios, metas e listas)</span></label>' : '',
    confirm: 'Importar',
  });
  const cb = document.getElementById('imp_cfg');
  if (cb) comConfig = cb.checked;
  if (!ok) return;
  if (comConfig && data.config) items.push({ op: 'config', data: Store.mergeConfig(data.config) });
  const p = progressModal('Importando backup');
  try {
    await Store.bulk(items, (n, t) => p.set(n, t));
    p.close();
    toast('Backup importado.');
  } catch (e) {
    p.close();
    Store.writeError(e);
  }
}
