/* ───────────────────────── componentes de interface ───────────────────────── */
/* ícones embutidos direto no SVG: referência ao sprite quebra quando a página é servida com outra URL base */
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

function avatar(socio, size = '') {
  const n = socio ? socioNome(socio) : '?';
  const cls = size ? 'av-' + size : '';
  return `<span class="av av-${esc(socio || 'none')} ${cls}" title="${esc(n)}" aria-label="${esc(n)}">${esc((n || '?').trim().charAt(0).toUpperCase())}</span>`;
}
function pill(text, tone = 'gray', icon = '') {
  return `<span class="pill p-${tone}">${icon ? ic(icon) : '<i class="dot"></i>'}${esc(text)}</span>`;
}
function demoTag(r) {
  return r && r.demo ? '<span class="demo-tag" title="Registro de exemplo">exemplo</span>' : '';
}
function tag(text) {
  return `<span class="tag">${esc(text)}</span>`;
}
function servTags(arr) {
  return (arr || []).map((k) => tag(SERVICO[k] || k)).join('');
}
function on(root, sel, evt, fn) {
  $$(sel, root).forEach((el) => el.addEventListener(evt, (e) => fn(e, el)));
}
function emptyState(title, text, btn = '') {
  return `<div class="empty"><div class="empty-mark">${prismMark('sm')}</div><p class="empty-t">${esc(title)}</p><p class="empty-d">${esc(text)}</p>${btn}</div>`;
}
function prismMark(cls = '') {
  return `<svg class="mark ${cls}" viewBox="0 0 40 32" aria-hidden="true"><path class="m-in" d="M1.5 16.5h12.25"/><path class="m-pass" d="M13.75 16.5 25.5 15"/><path class="m-prism" d="M20 4 31 26H9z"/><path class="m-r1" d="M25.5 15 38.5 9"/><path class="m-r2" d="M25.5 15 38.5 15.5"/><path class="m-r3" d="M25.5 15 38.5 22"/></svg>`;
}

/* ── toast ── */
function toast(msg, opts = {}) {
  const { type = 'info', action = null, onAction = null, ms = 4000 } = opts;
  const root = $('#toasts');
  if (!root) return () => {};
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const s = document.createElement('span');
  s.textContent = msg;
  el.appendChild(s);
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-act';
    b.type = 'button';
    b.textContent = action;
    b.onclick = () => {
      dismiss();
      if (onAction) onAction();
    };
    el.appendChild(b);
  }
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  timer = setTimeout(dismiss, ms);
  return dismiss;
}

/* ── modal ── */
function syncInert() {
  const app = document.getElementById('app');
  const dr = document.getElementById('drawer-root');
  const modal = !!document.querySelector('#modal-root .modal-wrap:not(.closing)');
  if (app) app.inert = modal || Drawer.isOpen();
  if (dr) dr.inert = modal;
}
const Modal = (() => {
  const stack = [];
  let seq = 0;
  function open({ title, body = '', actions = [{ label: 'Fechar' }], size = '', onOpen = null, onClose = null }) {
    const id = 'mdl' + ++seq;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal-backdrop" data-close></div>
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}_t">
        <div class="modal-h"><h2 id="${id}_t">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">${ic('close')}</button></div>
        <div class="modal-b">${body}</div>
        <div class="modal-f"></div>
      </div>`;
    const prevFocus = document.activeElement;
    const api = { el: wrap, close };
    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      wrap.classList.remove('in');
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 160);
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      syncInert();
      if (onClose) onClose(result);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
    }
    const foot = $('.modal-f', wrap);
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.kind ? ' btn-' + a.kind : '');
      b.textContent = a.label;
      b.onclick = async () => {
        if (!a.onClick) return close(a.value);
        b.disabled = true;
        try {
          const r = await a.onClick(wrap, api);
          if (r !== false) close(a.value);
        } catch (e) {
          console.error(e);
        } finally {
          b.disabled = false;
        }
      };
      foot.appendChild(b);
    });
    if (!actions.length) foot.remove();
    $$('[data-close]', wrap).forEach((el) => el.addEventListener('click', () => close()));
    $('#modal-root').appendChild(wrap);
    stack.push(api);
    syncInert();
    requestAnimationFrame(() => wrap.classList.add('in'));
    if (onOpen) onOpen(wrap, api);
    const first = $('.modal-b input:not([type=hidden]), .modal-b select, .modal-b textarea, .modal-b button', wrap) || $('.modal-f .btn-primary, .modal-f .btn-danger', wrap);
    setTimeout(() => first && first.focus(), 30);
    return api;
  }
  function top() { return stack[stack.length - 1] || null; }
  return { open, top };
})();

function confirmDialog({ title, text, confirm = 'Confirmar', danger = false, html = '' }) {
  return new Promise((resolve) => {
    let ok = false;
    Modal.open({
      title,
      body: (text ? `<p class="modal-text">${esc(text)}</p>` : '') + html,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: confirm, kind: danger ? 'danger' : 'primary', onClick: () => { ok = true; } },
      ],
      onClose: () => resolve(ok),
    });
  });
}

/* ── drawer lateral (detalhes e formulários) ── */
const Drawer = (() => {
  let cur = null;
  let el = null;
  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'drawer-wrap';
    el.innerHTML = `<div class="drawer-backdrop" data-dclose></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer_t">
        <header class="drawer-h"><div class="drawer-ht"><h2 id="drawer_t"></h2><p class="drawer-sub"></p></div><div class="drawer-hx"></div><button type="button" class="icon-btn" data-dclose aria-label="Fechar painel">${ic('close')}</button></header>
        <div class="drawer-b" id="drawer_body"></div>
        <footer class="drawer-f"></footer>
      </aside>`;
    $$('[data-dclose]', el).forEach((x) => x.addEventListener('click', () => close()));
    $('#drawer-root').appendChild(el);
    return el;
  }
  function paint(keepScroll) {
    const v = cur.view();
    if (!v) {
      // registro recém-criado ainda pode estar a caminho do banco
      if (cur.grace && Date.now() < cur.grace) {
        const mine = cur;
        $('#drawer_t', el).textContent = 'Carregando…';
        $('.drawer-sub', el).hidden = true;
        $('.drawer-hx', el).innerHTML = '';
        $('.drawer-b', el).innerHTML = '<div class="drawer-loading"><span class="spin" aria-hidden="true"></span></div>';
        $('.drawer-f', el).hidden = true;
        setTimeout(() => { if (cur === mine) paint(true); }, cur.grace - Date.now() + 50);
        return;
      }
      return close();
    }
    cur.grace = 0;
    const body = $('.drawer-b', el);
    const st = keepScroll ? body.scrollTop : 0;
    $('#drawer_t', el).innerHTML = v.title || '';
    const sub = $('.drawer-sub', el);
    sub.innerHTML = v.sub || '';
    sub.hidden = !v.sub;
    $('.drawer-hx', el).innerHTML = v.head || '';
    body.innerHTML = v.body || '';
    const f = $('.drawer-f', el);
    f.innerHTML = v.foot || '';
    f.hidden = !v.foot;
    if (cur.bind) cur.bind(el, v);
    body.scrollTop = st;
  }
  function open(o) {
    ensure();
    const prev = cur;
    cur = Object.assign({ refreshable: false }, o);
    if (!prev) cur.prevFocus = document.activeElement;
    else cur.prevFocus = prev.prevFocus;
    paint(false);
    el.classList.add('open');
    document.body.classList.add('drawer-open');
    syncInert();
    setTimeout(() => {
      const first = cur && cur.focus ? $(cur.focus, el) : null;
      (first || $('.drawer-h .icon-btn', el)).focus();
    }, 60);
  }
  function refresh() {
    if (!cur || !cur.refreshable || !el) return;
    const body = $('.drawer-b', el);
    const saved = {};
    $$('input[id], textarea[id], select[id]', el).forEach((i) => {
      if (i.type === 'file') return;
      saved[i.id] = i.type === 'checkbox' ? i.checked : i.value;
    });
    const pressed = {};
    $$('[role=radiogroup][id]', el).forEach((g) => {
      const b = $('[aria-checked="true"]', g);
      if (b) pressed[g.id] = b.dataset.v;
    });
    const act = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
    paint(true);
    for (const [id, v] of Object.entries(saved)) {
      const i = document.getElementById(id);
      if (!i || !el.contains(i)) continue;
      if (i.type === 'checkbox') i.checked = v;
      else i.value = v;
    }
    for (const [id, v] of Object.entries(pressed)) {
      const g = document.getElementById(id);
      if (!g) continue;
      $$('[role=radio]', g).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    }
    if (act) {
      const a = document.getElementById(act);
      if (a) a.focus();
    }
    void body;
  }
  function close() {
    if (!cur || !el) return;
    const pf = cur.prevFocus;
    const oc = cur.onClose;
    cur = null;
    el.classList.remove('open');
    document.body.classList.remove('drawer-open');
    syncInert();
    if (oc) oc();
    if (pf && pf.focus && document.contains(pf)) pf.focus();
  }
  return { open, close, refresh, isOpen: () => !!cur, current: () => cur };
})();

/* ── menu suspenso ── */
const Pop = (() => {
  let el = null;
  let anchorEl = null;
  function close() {
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
    if (anchorEl) anchorEl.setAttribute('aria-expanded', 'false');
    anchorEl = null;
  }
  function open(anchor, items) {
    el = $('#menuPop');
    if (anchorEl === anchor && !el.hidden) return close();
    close();
    anchorEl = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    el.innerHTML = items
      .map((it, i) => (it.sep ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.ic ? ic(it.ic) : ''}<span>${esc(it.label)}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}</button>`))
      .join('');
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.right - w;
    if (left < 8) left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    $$('button', el).forEach((b) =>
      b.addEventListener('click', () => {
        const it = items[+b.dataset.i];
        close();
        if (it && it.fn) it.fn();
      })
    );
    const first = $('button', el);
    if (first) first.focus();
  }
  document.addEventListener('pointerdown', (e) => {
    if (el && !el.hidden && !el.contains(e.target) && anchorEl && !anchorEl.contains(e.target)) close();
  });
  return { open, close, isOpen: () => el && !el.hidden };
})();

/* ── formulários ── */
let formSeq = 0;
function buildForm(fields, vals = {}) {
  const fid = 'f' + ++formSeq;
  const html = `<div class="form-grid" data-form="${fid}">${fields.map((f) => fieldHTML(fid, f, vals[f.k], vals)).join('')}</div>`;
  return { fid, html };
}
function fieldHTML(fid, f, v, vals) {
  const id = `${fid}_${f.k}`;
  const hidden = f.show && !f.show(vals) ? ' hidden' : '';
  const span = f.span === 2 ? ' span-2' : '';
  const req = f.req ? '<b class="req" aria-hidden="true"> *</b>' : '';
  const label = f.l && f.t !== 'check' ? `<label for="${id}">${esc(f.l)}${req}</label>` : '';
  const hint = f.hint ? `<p class="hint">${esc(f.hint)}</p>` : '';
  let ctl = '';
  switch (f.t) {
    case 'textarea':
      ctl = `<textarea id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(v ?? '')}</textarea>`;
      break;
    case 'money':
      ctl = `<div class="affix"><span>R$</span><input id="${id}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(moneyInputValue(v))}" data-money></div>`;
      break;
    case 'number':
      ctl = `<input id="${id}" type="number" inputmode="numeric"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''} step="${f.step || 1}" value="${esc(v ?? '')}">`;
      break;
    case 'date':
      ctl = `<input id="${id}" type="date" value="${esc(v || '')}">`;
      break;
    case 'month':
      ctl = `<input id="${id}" type="month" value="${esc(v || '')}">`;
      break;
    case 'select': {
      const opts = (typeof f.opts === 'function' ? f.opts(vals) : f.opts) || [];
      ctl = `<select id="${id}">${selectOptions(opts, v, f.empty)}</select>`;
      break;
    }
    case 'chips': {
      const sel = new Set(v || []);
      ctl = `<div class="chips" id="${id}" role="group" aria-label="${esc(f.l || '')}">${f.opts.map((o) => `<button type="button" class="chip" data-v="${esc(o.v)}" aria-pressed="${sel.has(o.v)}">${esc(o.l)}</button>`).join('')}</div>`;
      break;
    }
    case 'seg':
      ctl = `<div class="seg" id="${id}" role="radiogroup" aria-label="${esc(f.l || '')}">${f.opts.map((o) => `<button type="button" role="radio" data-v="${esc(o.v)}" aria-checked="${String(o.v) === String(v)}">${o.ic ? ic(o.ic) : ''}<span>${esc(o.l)}</span></button>`).join('')}</div>`;
      break;
    case 'check':
      ctl = `<label class="check" for="${id}"><input id="${id}" type="checkbox"${v ? ' checked' : ''}><span>${esc(f.l || '')}</span></label>`;
      break;
    default:
      ctl = `<input id="${id}" type="${f.t || 'text'}" value="${esc(v ?? '')}" placeholder="${esc(f.ph || '')}" autocomplete="off"${f.list ? ` list="${id}_dl"` : ''}>${f.list ? `<datalist id="${id}_dl">${f.list.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>` : ''}`;
  }
  return `<div class="field${span}${f.t === 'check' ? ' field-check' : ''}${f.more ? ' is-more' : ''}" data-k="${esc(f.k)}"${hidden}>${label}${ctl}${hint}<p class="err" hidden></p></div>`;
}
function selectOptions(opts, v, empty) {
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') + opts.map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(v ?? '') ? ' selected' : ''}>${esc(o.l)}</option>`).join('');
}
function fieldEl(root, fid, k) {
  return root.querySelector('#' + CSS.escape(`${fid}_${k}`));
}
function readForm(root, fid, fields) {
  const out = {};
  for (const f of fields) {
    const el = fieldEl(root, fid, f.k);
    if (!el) continue;
    switch (f.t) {
      case 'money': {
        const n = parseMoney(el.value);
        out[f.k] = isNaN(n) ? null : round2(n);
        break;
      }
      case 'number':
        out[f.k] = el.value === '' ? null : +el.value;
        break;
      case 'chips':
        out[f.k] = $$('.chip[aria-pressed="true"]', el).map((b) => b.dataset.v);
        break;
      case 'seg': {
        const b = el.querySelector('[aria-checked="true"]');
        out[f.k] = b ? b.dataset.v : null;
        break;
      }
      case 'check':
        out[f.k] = el.checked;
        break;
      default:
        out[f.k] = el.value.trim();
    }
  }
  return out;
}
function bindForm(root, fid, fields, onChange) {
  const grid = root.querySelector(`[data-form="${fid}"]`);
  if (!grid) return;
  const refresh = () => {
    const vals = readForm(root, fid, fields);
    for (const f of fields) {
      const wrap = grid.querySelector(`.field[data-k="${CSS.escape(f.k)}"]`);
      if (!wrap) continue;
      if (f.show) wrap.hidden = !f.show(vals);
      if (f.t === 'select' && typeof f.opts === 'function') {
        const sel = fieldEl(root, fid, f.k);
        const opts = f.opts(vals);
        const sig = JSON.stringify(opts);
        if (sel.dataset.sig !== sig) {
          const cur = sel.value;
          sel.innerHTML = selectOptions(opts, cur, f.empty);
          sel.dataset.sig = sig;
        }
      }
    }
    if (onChange) onChange(readForm(root, fid, fields), root);
  };
  grid.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && grid.contains(chip)) {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
      refresh();
      return;
    }
    const r = e.target.closest('[role=radio]');
    if (r && grid.contains(r)) {
      $$('[role=radio]', r.parentElement).forEach((b) => b.setAttribute('aria-checked', String(b === r)));
      refresh();
    }
  });
  grid.addEventListener('keydown', (e) => {
    const r = e.target.closest('[role=radio]');
    if (!r || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const all = $$('[role=radio]', r.parentElement);
    const i = all.indexOf(r) + (e.key === 'ArrowRight' ? 1 : -1);
    const n = all[(i + all.length) % all.length];
    n.focus();
    n.click();
    e.preventDefault();
  });
  grid.addEventListener('input', refresh);
  grid.addEventListener('change', refresh);
  grid.addEventListener(
    'blur',
    (e) => {
      if (e.target.matches && e.target.matches('[data-money]')) {
        const n = parseMoney(e.target.value);
        if (!isNaN(n)) e.target.value = moneyInputValue(n);
      }
    },
    true
  );
  refresh();
}
function validateForm(root, fid, fields, vals) {
  let firstBad = null;
  for (const f of fields) {
    const wrap = root.querySelector(`[data-form="${fid}"] .field[data-k="${CSS.escape(f.k)}"]`);
    if (!wrap) continue;
    const err = $('.err', wrap);
    let msg = '';
    if (!wrap.hidden) {
      const v = vals[f.k];
      if (f.req && (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length))) msg = f.t === 'chips' ? 'Escolha pelo menos uma opção.' : 'Preencha este campo.';
      else if (f.t === 'money' && f.positive && !(v > 0)) msg = 'Informe um valor maior que zero.';
      else if (f.t === 'money' && v === null && fieldEl(root, fid, f.k).value.trim()) msg = 'Valor inválido. Use o formato 1.234,56.';
      else if (f.check) msg = f.check(v, vals) || '';
    }
    err.textContent = msg;
    err.hidden = !msg;
    wrap.classList.toggle('bad', !!msg);
    if (msg && !firstBad) firstBad = fieldEl(root, fid, f.k);
  }
  if (firstBad) {
    firstBad.focus();
    return false;
  }
  return true;
}

/* ── tooltip dos gráficos ── */
const Tip = (() => {
  function show(x, y, title, rows) {
    const el = $('#tip');
    el.innerHTML = '';
    if (title) {
      const t = document.createElement('div');
      t.className = 'tip-t';
      t.textContent = title;
      el.appendChild(t);
    }
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'tip-r';
      if (r.color) {
        const k = document.createElement('i');
        k.className = 'tip-k' + (r.shape === 'dot' ? ' dot' : '');
        k.style.background = r.color;
        row.appendChild(k);
      }
      const v = document.createElement('b');
      v.textContent = r.value;
      row.appendChild(v);
      const l = document.createElement('span');
      l.textContent = r.label;
      row.appendChild(l);
      el.appendChild(row);
    }
    el.hidden = false;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    let top = y - h - 10;
    if (top < 8) top = y + 16;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = top + 'px';
  }
  function hide() {
    const el = $('#tip');
    if (el) el.hidden = true;
  }
  return { show, hide };
})();

function go(route) {
  Router.route(route);
  try {
    if (location.hash !== '#' + route) history.replaceState(null, '', '#' + route);
  } catch {
    try { location.hash = route; } catch {}
  }
}

/* copiar texto (só funciona dentro de um clique) */
async function copyText(t, okMsg = 'Copiado.') {
  try {
    await navigator.clipboard.writeText(t);
    toast(okMsg);
  } catch {
    toast('Não foi possível copiar. Selecione o texto e copie manualmente.', { type: 'error' });
  }
}

/* ── "Mais detalhes" nos formulários ── */
function moreToggle(aberto) {
  return `<button type="button" class="more-toggle" data-more-toggle aria-expanded="${aberto}">${ic('right')}<span>${aberto ? 'Menos detalhes' : 'Mais detalhes'}</span><small>cargo, e-mail, segmento, cidade, site e observações</small></button>`;
}
function bindMoreToggle(el) {
  on(el, '[data-more-toggle]', 'click', (e, b) => {
    const grid = $('.form-grid', el);
    const open = !grid.classList.contains('show-more');
    grid.classList.toggle('show-more', open);
    b.setAttribute('aria-expanded', String(open));
    $('span', b).textContent = open ? 'Menos detalhes' : 'Mais detalhes';
  });
}

/* ── atalhos de data ── */
function quickDates(inputId, checkId = '') {
  const opts = [['Amanhã', 1], ['Em 3 dias', 3], ['Próx. semana', 7], ['Em 15 dias', 15]];
  return `<div class="qdates" role="group" aria-label="Datas rápidas">${opts.map(([l, n]) => `<button type="button" class="qd" data-qd="${esc(inputId)}" data-qd-check="${esc(checkId)}" data-n="${n}">${l}</button>`).join('')}</div>`;
}
function bindQuickDates(el) {
  on(el, '[data-qd]', 'click', (e, b) => {
    const inp = document.getElementById(b.dataset.qd);
    if (!inp) return;
    inp.value = addDays(today(), +b.dataset.n);
    if (b.dataset.qdCheck) { const c = document.getElementById(b.dataset.qdCheck); if (c) c.checked = true; }
    $$('[data-qd="' + CSS.escape(b.dataset.qd) + '"]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/* ── minigráfico de tendência (6 meses) ── */
function spark(vals, label) {
  if (!vals.length || vals.every((v) => !v)) return '';
  const W = 96, H = 28, max = Math.max(...vals, 1);
  const x = (i) => 3 + (i / (vals.length - 1)) * (W - 6);
  const y = (v) => H - 4 - (v / max) * (H - 8);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = vals.length - 1;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><polygon class="sp-a" points="${x(0)},${H - 4} ${pts} ${x(last)},${H - 4}"/><polyline class="sp-l" points="${pts}"/><circle class="sp-d" cx="${x(last)}" cy="${y(vals[last])}" r="2.6"/></svg>`;
}

/* ── tema: automático (segue o Claude/sistema), claro ou escuro ── */
const Tema = (() => {
  const host = document.documentElement.getAttribute('data-theme');
  let atual = 'auto';
  try { atual = localStorage.getItem('prisma-crm-tema') || 'auto'; } catch {}
  function aplicar() {
    const r = document.documentElement;
    if (atual === 'auto') { if (host) r.setAttribute('data-theme', host); else r.removeAttribute('data-theme'); }
    else r.setAttribute('data-theme', atual);
    const b = document.getElementById('themeBtn');
    if (b) {
      const nome = { auto: 'automático', light: 'claro', dark: 'escuro' }[atual];
      b.innerHTML = ic(atual === 'dark' ? 'moon' : atual === 'light' ? 'sun' : 'auto');
      b.setAttribute('aria-label', `Tema ${nome}. Clique para trocar`);
      b.title = `Tema ${nome}`;
    }
  }
  function set(t) {
    atual = t;
    try { localStorage.setItem('prisma-crm-tema', t); } catch {}
    aplicar();
    Charts.redrawAll && Charts.redrawAll();
  }
  function ciclo() { set(atual === 'auto' ? 'light' : atual === 'light' ? 'dark' : 'auto'); }
  return { aplicar, set, ciclo, get: () => atual };
})();
