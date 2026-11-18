/* ───────────────────────── FUNIL ───────────────────────── */
const isTouch = () => !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);

/* arrastar cartões com o dedo: toque longo ativa, soltar sobre a coluna muda a etapa */
const TouchDrag = {
  body: null,
  bind(body) {
    if (TouchDrag.body === body) return;
    TouchDrag.body = body;
    let timer = null;
    let start = null;
    let card = null;
    let ghost = null;
    let active = false;
    let over = null;
    let pt = null;
    let raf = 0;
    let offX = 0;
    let offY = 0;
    const kb = () => $('#kanban', body);
    const cancel = () => { clearTimeout(timer); timer = null; };
    const place = () => {
      if (!ghost) return;
      ghost.style.transform = `translate(${pt.x - offX}px, ${pt.y - offY}px) rotate(-2deg) scale(1.03)`;
      const el = document.elementFromPoint(pt.x, pt.y);
      const col = el && el.closest ? el.closest('.kcol') : null;
      if (col !== over) {
        if (over) over.classList.remove('over');
        over = col;
        if (over) over.classList.add('over');
      }
    };
    const loop = () => {
      if (!active) return;
      const k = kb();
      if (k) {
        const r = k.getBoundingClientRect();
        if (pt.x < r.left + 44) k.scrollLeft -= 9;
        else if (pt.x > r.right - 44) k.scrollLeft += 9;
      }
      // rolagem vertical só quando o dedo vai de propósito até a borda (acima da barra de abas ou abaixo do topo)
      const main = $('#main');
      const tb = $('#tabbar');
      const tbVis = tb && getComputedStyle(tb).display !== 'none';
      const fundo = tbVis ? tb.getBoundingClientRect().top : main.getBoundingClientRect().bottom;
      const topo = $('.topbar').getBoundingClientRect().bottom;
      if (pt.y > fundo - 28 && pt.y > start.y + 24) main.scrollTop += 8;
      else if (pt.y < topo + 28 && pt.y < start.y - 24) main.scrollTop -= 8;
      place();
      raf = requestAnimationFrame(loop);
    };
    const activate = () => {
      timer = null;
      if (!card || !card.isConnected) return;
      active = true;
      Funil.dragging = true;
      const r = card.getBoundingClientRect();
      offX = start.x - r.left;
      offY = start.y - r.top;
      ghost = card.cloneNode(true);
      ghost.classList.add('ghost');
      ghost.style.width = r.width + 'px';
      ghost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ghost);
      card.classList.add('dragging');
      const k = kb();
      if (k) k.classList.add('is-dragging');
      try { if (navigator.vibrate) navigator.vibrate(12); } catch {}
      pt = { x: start.x, y: start.y };
      loop();
    };
    const finish = (soltar) => {
      cancelAnimationFrame(raf);
      const id = card && card.dataset.id;
      const stage = over && over.dataset.stage;
      if (over) over.classList.remove('over');
      if (ghost) ghost.remove();
      if (card) card.classList.remove('dragging');
      const k = kb();
      if (k) k.classList.remove('is-dragging');
      ghost = null;
      over = null;
      active = false;
      card = null;
      Funil.dragging = false;
      if (soltar && id && stage) moveLead(id, stage);
      if (Funil.pending) { Funil.pending = false; setTimeout(() => Funil.render(), 0); }
    };
    body.addEventListener('touchstart', (e) => {
      const c = e.target.closest('.lcard');
      if (!c || S.readOnly || e.touches.length !== 1) return;
      card = c;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      cancel();
      timer = setTimeout(activate, 380);
    }, { passive: true });
    body.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!active) {
        if (timer && (Math.abs(t.clientX - start.x) > 8 || Math.abs(t.clientY - start.y) > 8)) { cancel(); card = null; }
        return;
      }
      e.preventDefault();
      pt = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    body.addEventListener('touchend', (e) => {
      if (timer) { cancel(); card = null; return; }
      if (active) { e.preventDefault(); finish(true); }
    }, { passive: false });
    body.addEventListener('touchcancel', () => { cancel(); if (active) finish(false); card = null; });
    body.addEventListener('contextmenu', (e) => { if (e.target.closest('.lcard') && (active || timer)) e.preventDefault(); });
  },
};

const Funil = {
  modo: 'kanban',
  q: '',
  resp: '',
  serv: '',
  origem: '',
  etapaLista: '',
  dragging: false,
  pending: false,
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Funil de vendas</h1><p class="vsub" id="fn_sub"></p></div><div class="vactions"><button type="button" class="btn btn-ghost" data-conversas-abrir data-write>${ic('chat')}Importar conversas</button><button type="button" class="btn btn-primary" data-new-lead data-write>${ic('plus')}Novo lead</button></div></div>
      <div class="toolbar" role="search">
        <div class="seg seg-sm" role="radiogroup" aria-label="Visualização" id="fn_modo"><button type="button" role="radio" data-v="kanban">${ic('kanban')}<span>Quadro</span></button><button type="button" role="radio" data-v="lista">${ic('list')}<span>Lista</span></button></div>
        <label class="tb-search">${ic('search')}<input id="fn_q" type="search" placeholder="Filtrar por empresa, contato ou cidade" aria-label="Filtrar leads" autocomplete="off"></label>
        <button type="button" class="btn btn-sm sm-only-flex tb-more" id="fn_more" aria-expanded="false" aria-controls="fn_resp">${ic('ajustes')}<span>Filtros</span></button>
        <select id="fn_resp" class="tb-filt" aria-label="Filtrar por responsável"></select>
        <select id="fn_serv" class="tb-filt" aria-label="Filtrar por serviço"><option value="">Todos os serviços</option>${SERVICOS.map((s) => `<option value="${s.k}">${s.l}</option>`).join('')}</select>
        <select id="fn_origem" class="tb-filt" aria-label="Filtrar por origem"></select>
        <select id="fn_etapa" class="tb-filt" aria-label="Filtrar por etapa" hidden></select>
      </div>
      <div class="vbody" id="fn_body"></div>`;
    const q = $('#fn_q', root);
    q.value = Funil.q;
    q.addEventListener('input', () => { Funil.q = q.value; Funil.render(); });
    ['resp', 'serv', 'origem'].forEach((k) => {
      const s = $('#fn_' + k, root);
      s.addEventListener('change', () => { Funil[k] = s.value; Funil.render(); });
    });
    const et = $('#fn_etapa', root);
    et.addEventListener('change', () => { Funil.etapaLista = et.value; Funil.render(); });
    $('#fn_modo', root).addEventListener('click', (e) => {
      const b = e.target.closest('[role=radio]');
      if (!b) return;
      Funil.modo = b.dataset.v;
      Funil.render();
    });
    on(root, '[data-new-lead]', 'click', () => editLead());
    on(root, '[data-conversas-abrir]', 'click', () => abrirConversas());
    $('#fn_more', root).addEventListener('click', (e) => {
      const tb = e.currentTarget.closest('.toolbar');
      const open = !tb.classList.contains('open');
      tb.classList.toggle('open', open);
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });
    TouchDrag.bind($('#fn_body', root));
  },
  filtered() {
    const n = norm(Funil.q).trim();
    return Store.all('leads').filter((l) => {
      if (Funil.resp && l.responsavel !== Funil.resp) return false;
      if (Funil.serv && !(l.servicos || []).includes(Funil.serv)) return false;
      if (Funil.origem && (l.origem || '') !== Funil.origem) return false;
      if (n && ![l.empresa, l.contato, l.cidade, l.segmento, l.email].some((x) => norm(x).includes(n))) return false;
      return true;
    });
  },
  syncToolbar() {
    $$('#fn_modo [role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === Funil.modo)));
    $('#fn_resp').innerHTML = `<option value="">Todos os responsáveis</option>${SOCIOS.map((k) => `<option value="${k}"${Funil.resp === k ? ' selected' : ''}>${esc(socioNome(k))}</option>`).join('')}`;
    const origens = uniq([...cfg().origens, ...Store.all('leads').map((l) => l.origem).filter(Boolean)]);
    $('#fn_origem').innerHTML = `<option value="">Todas as origens</option>${origens.map((o) => `<option value="${esc(o)}"${Funil.origem === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}`;
    $('#fn_serv').value = Funil.serv;
    const et = $('#fn_etapa');
    et.hidden = Funil.modo !== 'lista';
    const nFiltros = [Funil.resp, Funil.serv, Funil.origem, Funil.modo === 'lista' ? Funil.etapaLista : ''].filter(Boolean).length;
    $('#fn_more span').textContent = nFiltros ? `Filtros (${nFiltros})` : 'Filtros';
    et.innerHTML = `<option value="">Abertos, ganhos e perdidos</option><option value="abertos"${Funil.etapaLista === 'abertos' ? ' selected' : ''}>Só abertos</option>${ETAPAS.map((e) => `<option value="${e.k}"${Funil.etapaLista === e.k ? ' selected' : ''}>${esc(e.l)}</option>`).join('')}`;
  },
  render() {
    if (Funil.dragging) { Funil.pending = true; return; }
    const body = $('#fn_body');
    if (!body) return;
    Funil.syncToolbar();
    if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
    const pipe = Calc.pipeline();
    $('#fn_sub').textContent = pipe.n ? `${plural(pipe.n, 'lead aberto', 'leads abertos')} somando ${money0(pipe.total)}. Previsão ponderada pela etapa: ${money0(pipe.ponderado)}.` : 'Nenhum lead aberto agora.';
    const leads = Funil.filtered();
    if (!Store.all('leads').length) {
      body.innerHTML = emptyState('O funil está vazio', 'Cadastre a primeira empresa interessada e acompanhe cada conversa até a venda.', `<button type="button" class="btn btn-primary" data-new-lead data-write>${ic('plus')}Cadastrar lead</button>`);
      on(body, '[data-new-lead]', 'click', () => editLead());
      return;
    }
    if (Funil.modo === 'lista') return Funil.renderLista(body, leads);
    const kb = $('#kanban', body);
    const sl = kb ? kb.scrollLeft : 0;
    const limite = addDays(today(), -60);
    const cols = [...ABERTAS, 'ganho', 'perdido'];
    const nCol = (k) => leads.filter((l) => l.etapa === k).length;
    const jump = `<div class="kjump" aria-label="Ir para a etapa">${cols.map((k) => `<button type="button" data-jump="${k}">${esc(ETAPA[k].l)}<b>${nCol(k)}</b></button>`).join('')}</div>`;
    const hint = isTouch() && !S.readOnly ? '<p class="khint">Toque e segure um cartão para arrastar entre as etapas.</p>' : '';
    body.innerHTML = `${jump}${hint}<div class="kanban" id="kanban">${cols
      .map((k, i) => {
        let items = leads.filter((l) => l.etapa === k);
        let antigos = 0;
        if (k === 'ganho' || k === 'perdido') {
          const rec = items.filter((l) => String(l.fechadoEm || l.perdidoEm || l.etapaDesde || l.atualizadoEm || '').slice(0, 10) >= limite);
          antigos = items.length - rec.length;
          items = rec;
        }
        items.sort(sortLeads);
        const total = sum(items, (l) => l.valor);
        const stripe = k === 'ganho' ? 'var(--good)' : k === 'perdido' ? 'var(--ink-3)' : `var(--ord-${i + 1})`;
        return `<section class="kcol k-${k}" data-stage="${k}" aria-label="${esc(ETAPA[k].l)}">
          <header class="kcol-h"><i class="kstripe" style="background:${stripe}"></i><h3>${esc(ETAPA[k].l)}</h3><span class="kcount">${items.length}</span><span class="ksum">${total ? moneyShort(total) : ''}</span></header>
          <div class="kcol-b">${items.map(leadCard).join('') || `<p class="kempty">${k === 'ganho' ? 'Vendas dos últimos 60 dias aparecem aqui' : k === 'perdido' ? 'Nada perdido nos últimos 60 dias' : 'Arraste um lead para cá'}</p>`}
          ${antigos ? `<button type="button" class="link small kmore" data-old="${k}">Ver mais ${antigos} na lista</button>` : ''}</div>
          ${k === 'novo' ? `<button type="button" class="kadd" data-new-lead data-write>${ic('plus')}Novo lead</button>` : ''}
        </section>`;
      })
      .join('')}</div>`;
    const kb2 = $('#kanban', body);
    kb2.scrollLeft = sl;
    const marcaJump = () => {
      const colsEl = $$('.kcol', kb2);
      let best = 0;
      colsEl.forEach((c, i) => { if (Math.abs(c.offsetLeft - kb2.scrollLeft - 14) < Math.abs(colsEl[best].offsetLeft - kb2.scrollLeft - 14)) best = i; });
      $$('.kjump button', body).forEach((b, i) => b.setAttribute('aria-current', String(i === best)));
    };
    marcaJump();
    let jt = 0;
    kb2.addEventListener('scroll', () => { cancelAnimationFrame(jt); jt = requestAnimationFrame(marcaJump); }, { passive: true });
    on(body, '[data-jump]', 'click', (e, b) => {
      const col = $(`.kcol[data-stage="${b.dataset.jump}"]`, kb2);
      if (col) kb2.scrollTo({ left: col.offsetLeft - 14, behavior: reduceMotion() ? 'auto' : 'smooth' });
    });
    on(body, '[data-new-lead]', 'click', () => editLead());
    on(body, '[data-old]', 'click', (e, b) => { Funil.modo = 'lista'; Funil.etapaLista = b.dataset.old; Funil.render(); });
    on(body, '[data-more]', 'click', (e, b) => {
      e.stopPropagation();
      menuLead(b, b.dataset.more);
    });
    $$('.lcard', body).forEach((c) => {
      c.addEventListener('click', () => showLead(c.dataset.id));
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showLead(c.dataset.id); }
      });
      c.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        c.classList.add('dragging');
        kb2.classList.add('is-dragging');
        Funil.dragging = true;
      });
      c.addEventListener('dragend', () => {
        c.classList.remove('dragging');
        kb2.classList.remove('is-dragging');
        $$('.kcol.over', body).forEach((x) => x.classList.remove('over'));
        Funil.dragging = false;
        if (Funil.pending) { Funil.pending = false; setTimeout(() => Funil.render(), 0); }
      });
    });
    $$('.kcol', body).forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        Funil.dragging = false;
        if (id) moveLead(id, col.dataset.stage);
      });
    });
  },
  renderLista(body, leads) {
    let list = leads;
    if (Funil.etapaLista === 'abertos') list = list.filter((l) => ABERTAS.includes(l.etapa));
    else if (Funil.etapaLista) list = list.filter((l) => l.etapa === Funil.etapaLista);
    list = list.slice().sort((a, b) => (ETAPA[a.etapa]?.i ?? 9) - (ETAPA[b.etapa]?.i ?? 9) || sortLeads(a, b));
    body.innerHTML = list.length
      ? `<div class="tbl-wrap panel"><table class="tbl tbl-click tbl-cards k3"><thead><tr><th>Empresa</th><th>Etapa</th><th>Interesse</th><th class="num">Valor</th><th>Próximo contato</th><th>Origem</th><th>Resp.</th></tr></thead><tbody>${list
          .map((l) => `<tr data-id="${esc(l.id)}" tabindex="0"><td class="ga-main"><b>${esc(l.empresa)}</b>${demoTag(l)}<small class="cell-sub">${esc([l.contato, l.cidade].filter(Boolean).join(' · '))}</small></td><td class="ga-sub">${pill(ETAPA[l.etapa] ? ETAPA[l.etapa].l : l.etapa, stageTone(l.etapa))}</td><td class="hide-sm"><span class="tags">${servTags(l.servicos)}</span></td><td class="num ga-val">${l.valor ? money0(l.valor) : '<span class="dash">—</span>'}</td><td class="ga-full">${ABERTAS.includes(l.etapa) ? (l.proximoContato ? followChip(l.proximoContato) : '<span class="muted dash">—</span>') : l.etapa === 'perdido' ? `<span class="muted small">${esc(l.motivoPerda || '')}</span>` : `<span class="muted small">${l.fechadoEm ? 'fechado ' + fmtDate(l.fechadoEm) : ''}</span>`}</td><td class="hide-sm">${esc(l.origem || '—')}</td><td class="ga-side">${avatar(l.responsavel, 'sm')}</td></tr>`)
          .join('')}</tbody></table></div><p class="muted small list-foot">${plural(list.length, 'lead', 'leads')}</p>`
      : emptyState('Nenhum lead com esses filtros', 'Limpe a busca ou escolha outra etapa.');
    $$('tr[data-id]', body).forEach((tr) => {
      tr.addEventListener('click', () => showLead(tr.dataset.id));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') showLead(tr.dataset.id); });
    });
  },
};
function menuLead(anchor, id) {
  const l = Store.get('leads', id);
  if (!l) return;
  const aberto = ABERTAS.includes(l.etapa);
  const itens = [{ label: 'Abrir e registrar contato', ic: 'note', fn: () => showLead(id) }];
  if (aberto) {
    itens.push({ label: 'Falar amanhã', ic: 'clock', fn: async () => { try { await Store.patch('leads', id, { proximoContato: addDays(today(), 1), atualizadoEm: nowISO() }); toast(`Próximo contato com ${l.empresa}: amanhã.`); } catch {} } });
    itens.push({ sep: true });
    ABERTAS.filter((k) => k !== l.etapa).forEach((k) => itens.push({ label: `Mover para ${ETAPA[k].l}`, ic: 'arrow', fn: () => moveLead(id, k) }));
    itens.push({ sep: true });
    itens.push({ label: 'Marcar como ganho', ic: 'trophy', fn: () => winFlow({ leadId: id }) });
    itens.push({ label: 'Marcar como perdido', ic: 'xcircle', danger: true, fn: () => loseFlow(id) });
  } else {
    itens.push({ sep: true });
    ABERTAS.forEach((k) => itens.push({ label: `Reabrir em ${ETAPA[k].l}`, ic: 'repeat', fn: () => moveLead(id, k) }));
  }
  Pop.open(anchor, itens);
}
function sortLeads(a, b) {
  const fa = a.proximoContato || '9999';
  const fb = b.proximoContato || '9999';
  if (ABERTAS.includes(a.etapa) && fa !== fb) return fa.localeCompare(fb);
  return (+b.valor || 0) - (+a.valor || 0);
}
function leadCard(l) {
  const aberto = ABERTAS.includes(l.etapa);
  const dias = aberto ? Calc.diasNaEtapa(l) : 0;
  let foot = '';
  if (aberto) foot = l.proximoContato ? followChip(l.proximoContato) : '<span class="muted small">sem próximo contato</span>';
  else if (l.etapa === 'ganho') foot = `<span class="muted small">${l.fechadoEm ? 'fechado em ' + fmtDateShort(l.fechadoEm) : 'ganho'}</span>`;
  else foot = `<span class="muted small">${esc(l.motivoPerda || 'perdido')}</span>`;
  return `<article class="lcard" draggable="${S.readOnly || isTouch() ? 'false' : 'true'}" data-id="${esc(l.id)}" tabindex="0" aria-label="${esc(l.empresa)}">
    <div class="lc-top"><h4>${esc(l.empresa)}</h4><span class="lc-tr"><button type="button" class="lc-more" data-more="${esc(l.id)}" aria-label="Ações rápidas para ${esc(l.empresa)}" aria-haspopup="menu" data-write>${ic('more')}</button>${avatar(l.responsavel, 'sm')}</span></div>
    ${l.contato || l.segmento ? `<p class="lc-sub">${esc([l.contato, l.segmento].filter(Boolean).join(' · '))}</p>` : ''}
    ${(l.servicos || []).length || l.demo ? `<div class="lc-tags">${servTags(l.servicos)}${demoTag(l)}</div>` : ''}
    <div class="lc-bot"><b class="lc-val">${l.valor ? money0(l.valor) : '<span class="muted">sem valor</span>'}</b>${foot}</div>
    ${aberto && dias >= 14 ? `<p class="lc-stale">${ic('alert')}${dias} dias nesta etapa</p>` : ''}
  </article>`;
}
