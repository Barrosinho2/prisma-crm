/* ───────────────────────── gráficos (SVG/HTML, sem bibliotecas) ───────────────────────── */
const SVGNS = 'http://www.w3.org/2000/svg';
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}
function axisMoney(v) {
  if (v === 0) return 'R$ 0';
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}R$ ${fmtNum(a / 1e6, 1)} mi`;
  if (a >= 1e4) return `${s}R$ ${fmtNum(a / 1e3, 0)} mil`;
  return `${s}R$ ${fmtNum(a, 0)}`;
}
function barPath(x, w, y0, y1, r = 4) {
  // barra com ponta arredondada (lado do dado) e base reta (lado da linha de base)
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  if (y1 < y0) {
    return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}
function svgEl(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* Registro de gráficos: a view declara, o mount desenha e redesenha ao redimensionar */
const Charts = (() => {
  const specs = new Map();
  const tableMode = new Set();
  const animated = new Set();
  const observed = new Set();
  let ro = null;
  function set(id, spec) { specs.set(id, spec); }
  function draw(el) {
    const id = el.dataset.chart;
    const spec = specs.get(id);
    if (!spec) return;
    const host = el;
    host.innerHTML = '';
    if (tableMode.has(id)) {
      host.appendChild(spec.table());
      return;
    }
    // anima só a primeira vez que cada gráfico aparece na sessão
    const first = !animated.has(id);
    animated.add(id);
    spec.draw(host, first && !reduceMotion());
  }
  function mount(root) {
    for (const el of observed) {
      if (!el.isConnected) {
        if (ro) ro.unobserve(el);
        observed.delete(el);
      }
    }
    if (!ro && window.ResizeObserver) {
      ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const el = e.target;
          const w = Math.round(e.contentRect.width);
          if (el.dataset.w && +el.dataset.w === w) continue;
          el.dataset.w = w;
          if (el.isConnected) draw(el);
        }
      });
    }
    $$('[data-chart]', root).forEach((el) => {
      draw(el);
      el.dataset.w = Math.round(el.clientWidth);
      if (ro) {
        ro.observe(el);
        observed.add(el);
      }
    });
    $$('[data-tview]', root).forEach((b) => {
      const id = b.dataset.tview;
      b.setAttribute('aria-pressed', String(tableMode.has(id)));
      b.onclick = () => {
        if (tableMode.has(id)) tableMode.delete(id);
        else tableMode.add(id);
        b.setAttribute('aria-pressed', String(tableMode.has(id)));
        b.innerHTML = tableMode.has(id) ? `${ic('chart')}<span>Gráfico</span>` : `${ic('table')}<span>Tabela</span>`;
        const el = root.querySelector(`[data-chart="${CSS.escape(id)}"]`);
        if (el) draw(el);
      };
      b.innerHTML = tableMode.has(id) ? `${ic('chart')}<span>Gráfico</span>` : `${ic('table')}<span>Tabela</span>`;
    });
  }
  function redrawAll() { for (const el of observed) if (el.isConnected) draw(el); }
  return { set, mount, draw, redrawAll };
})();

function simpleTable(head, rows, numericFrom = 1) {
  const t = document.createElement('table');
  t.className = 'tbl tbl-compact';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  head.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i >= numericFrom) th.className = 'num';
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  t.appendChild(thead);
  const tb = document.createElement('tbody');
  rows.forEach((r) => {
    const row = document.createElement('tr');
    r.forEach((c, i) => {
      const td = document.createElement('td');
      td.textContent = c;
      if (i >= numericFrom) td.className = 'num';
      row.appendChild(td);
    });
    tb.appendChild(row);
  });
  t.appendChild(tb);
  const wrap = document.createElement('div');
  wrap.className = 'tbl-wrap';
  wrap.appendChild(t);
  return wrap;
}

/* ── Entradas (para cima) × saídas (para baixo), resultado como ponto ── */
function flowChartSpec(data, curMonth) {
  return {
    table: () => simpleTable(['Mês', 'Entradas', 'Saídas', 'Resultado'], data.map((d) => [monthLabel(d.m), money(d.entradas), money(d.saidas), signedMoney0(d.resultado)])),
    draw(host, animate) {
      const W = Math.max(300, host.clientWidth);
      const H = Math.max(236, Math.min(440, host.clientHeight - 24));
      const padL = 70;
      const padR = 8;
      const padT = 12;
      const padB = 28;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const maxIn = Math.max(0, ...data.map((d) => d.entradas), ...data.map((d) => d.resultado));
      const maxOut = Math.max(0, ...data.map((d) => d.saidas), ...data.map((d) => -d.resultado));
      const step = niceStep(Math.max(maxIn, maxOut, 1) / 2.2);
      const top = Math.max(step, Math.ceil(maxIn / step) * step);
      const bot = Math.ceil(maxOut / step) * step;
      const y = (v) => padT + ((top - v) / (top + bot || 1)) * plotH;
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': 'Entradas e saídas por mês' });
      // grade + eixo
      for (let v = -bot; v <= top + 0.01; v += step) {
        const yy = Math.round(y(v)) + 0.5;
        svgEl('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: v === 0 ? 'c-base' : 'c-grid' }, svg);
        const t = svgEl('text', { x: padL - 10, y: yy + 4, 'text-anchor': 'end', class: 'c-tick' }, svg);
        t.textContent = axisMoney(v);
      }
      const n = data.length;
      const bw = plotW / n;
      const barW = Math.min(24, Math.max(10, bw * 0.34));
      const y0 = y(0);
      data.forEach((d, i) => {
        const cx = padL + bw * i + bw / 2;
        const x = cx - barW / 2;
        const g = svgEl('g', { class: 'c-band' + (d.m === curMonth ? ' cur' : '') }, svg);
        const pIn = barPath(x, barW, y0, y(d.entradas));
        if (pIn) svgEl('path', { d: pIn, class: 'c-in' + (animate ? ' grow-up' : ''), style: animate ? `animation-delay:${i * 50}ms` : '' }, g);
        const pOut = barPath(x, barW, y0 + 1, y(-d.saidas) + 1);
        if (pOut) svgEl('path', { d: pOut, class: 'c-out' + (animate ? ' grow-down' : ''), style: animate ? `animation-delay:${i * 50 + 80}ms` : '' }, g);
        if (d.entradas || d.saidas) svgEl('circle', { cx, cy: y(d.resultado), r: 4.5, class: 'c-dot' + (animate ? ' fade' : ''), style: animate ? `animation-delay:${400 + i * 50}ms` : '' }, g);
        const lab = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'c-xl' + (d.m === curMonth ? ' cur' : '') }, svg);
        lab.textContent = monthLabel(d.m, 'short') + (d.m.slice(5) === '01' ? ' ' + d.m.slice(2, 4) : '');
        const hit = svgEl('rect', { x: padL + bw * i, y: padT, width: bw, height: plotH, class: 'c-hit', tabindex: 0, 'aria-label': `${monthLabel(d.m)}: entradas ${money(d.entradas)}, saídas ${money(d.saidas)}, resultado ${signedMoney0(d.resultado)}` }, svg);
        const showTip = (px, py) => {
          g.classList.add('hover');
          Tip.show(px, py, monthLabel(d.m), [
            { color: 'var(--series-in)', value: money(d.entradas), label: 'Entradas' },
            { color: 'var(--series-out)', value: money(d.saidas), label: 'Saídas' },
            { color: 'var(--ink)', shape: 'dot', value: signedMoney0(d.resultado), label: 'Resultado' },
          ]);
        };
        hit.addEventListener('pointermove', (e) => showTip(e.clientX, e.clientY));
        hit.addEventListener('pointerdown', (e) => { $$('.c-band.hover', svg).forEach((x) => x.classList.remove('hover')); showTip(e.clientX, e.clientY); });
        hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'touch') return; g.classList.remove('hover'); Tip.hide(); });
        hit.addEventListener('focus', () => { const r = hit.getBoundingClientRect(); showTip(r.left + r.width / 2, r.top + 30); });
        hit.addEventListener('blur', () => { g.classList.remove('hover'); Tip.hide(); });
      });
      host.appendChild(svg);
    },
  };
}

/* ── barras horizontais (ranking ou etapas ordenadas) ── */
function hbarSpec(rows, { fmt = (v) => fmtNum(v), colors = null, head = ['Item', 'Valor'], tableRow = null, empty = 'Sem dados ainda.' } = {}) {
  return {
    table: () => simpleTable(head, rows.map((r) => (tableRow ? tableRow(r) : [r.label, fmt(r.value)]))),
    draw(host, animate) {
      if (!rows.length || rows.every((r) => !r.value)) {
        host.innerHTML = `<p class="chart-empty">${esc(empty)}</p>`;
        return;
      }
      const max = Math.max(...rows.map((r) => r.value), 1);
      const wrap = document.createElement('div');
      wrap.className = 'hb';
      rows.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'hb-row';
        row.tabIndex = 0;
        const l = document.createElement('div');
        l.className = 'hb-l';
        const lt = document.createElement('span');
        lt.textContent = r.label;
        l.appendChild(lt);
        if (r.sub) {
          const s = document.createElement('small');
          s.textContent = r.sub;
          l.appendChild(s);
        }
        const tr = document.createElement('div');
        tr.className = 'hb-track';
        const bar = document.createElement('i');
        bar.style.width = (r.value > 0 ? Math.max(1.5, (r.value / max) * 100) : 0) + '%';
        bar.style.background = colors ? colors[i % colors.length] : 'var(--series-in)';
        if (animate) {
          bar.classList.add('grow-x');
          bar.style.animationDelay = i * 45 + 'ms';
        }
        tr.appendChild(bar);
        const v = document.createElement('div');
        v.className = 'hb-v';
        v.textContent = fmt(r.value);
        row.append(l, tr, v);
        const tipRows = r.tip || [{ value: fmt(r.value), label: r.label }];
        row.addEventListener('pointermove', (e) => Tip.show(e.clientX, e.clientY, r.label, tipRows));
        row.addEventListener('pointerdown', (e) => Tip.show(e.clientX, e.clientY, r.label, tipRows));
        row.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') Tip.hide(); });
        row.addEventListener('focus', () => { const b = row.getBoundingClientRect(); Tip.show(b.left + b.width * 0.6, b.top + 6, r.label, tipRows); });
        row.addEventListener('blur', () => Tip.hide());
        if (r.onClick) {
          row.classList.add('click');
          row.addEventListener('click', r.onClick);
          row.addEventListener('keydown', (e) => { if (e.key === 'Enter') r.onClick(); });
        }
        wrap.appendChild(row);
      });
      host.appendChild(wrap);
    },
  };
}

/* ── projeção de saldo (linha + área) ── */
function lineSpec(pts) {
  return {
    table: () => {
      const rows = pts.filter((p, i) => i % 7 === 0 || i === pts.length - 1).map((p) => [fmtDate(p.d), money(p.v)]);
      return simpleTable(['Data', 'Saldo projetado'], rows);
    },
    draw(host, animate) {
      const W = Math.max(300, host.clientWidth);
      const H = 250;
      const padL = 72;
      const padR = 16;
      const padT = 18;
      const padB = 28;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const vals = pts.map((p) => p.v);
      let lo = Math.min(0, ...vals);
      let hi = Math.max(...vals, 1);
      const step = niceStep((hi - lo) / 4 || 1);
      lo = Math.floor(lo / step) * step;
      hi = Math.ceil(hi / step) * step;
      if (hi === lo) hi = lo + step;
      const x = (i) => padL + (i / (pts.length - 1)) * plotW;
      const y = (v) => padT + ((hi - v) / (hi - lo)) * plotH;
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': 'Projeção do saldo em caixa' });
      for (let v = lo; v <= hi + 0.01; v += step) {
        const yy = Math.round(y(v)) + 0.5;
        svgEl('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: v === 0 ? 'c-base' : 'c-grid' }, svg);
        const t = svgEl('text', { x: padL - 10, y: yy + 4, 'text-anchor': 'end', class: 'c-tick' }, svg);
        t.textContent = axisMoney(v);
      }
      const every = pts.length > 60 ? 15 : 7;
      pts.forEach((p, i) => {
        if (i % every !== 0) return;
        const t = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : 'middle', class: 'c-xl' }, svg);
        t.textContent = i === 0 ? 'hoje' : fmtDateShort(p.d);
      });
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
      const base = y(Math.max(lo, Math.min(0, hi)));
      svgEl('path', { d: `${line}L${x(pts.length - 1)},${base}L${x(0)},${base}Z`, class: 'c-area' }, svg);
      const lp = svgEl('path', { d: line, class: 'c-line' + (animate ? ' draw' : '') }, svg);
      if (animate) {
        const len = lp.getTotalLength ? lp.getTotalLength() : 1000;
        lp.style.strokeDasharray = len;
        lp.style.strokeDashoffset = len;
      }
      // rótulos seletivos: ponto final e mínimo
      const last = pts.length - 1;
      let minI = 0;
      pts.forEach((p, i) => { if (p.v < pts[minI].v) minI = i; });
      const label = (i, txt, below) => {
        svgEl('circle', { cx: x(i), cy: y(pts[i].v), r: 4.5, class: 'c-end' }, svg);
        const anchor = i > pts.length * 0.8 ? 'end' : i < pts.length * 0.15 ? 'start' : 'middle';
        const t = svgEl('text', { x: x(i), y: y(pts[i].v) + (below ? 18 : -10), 'text-anchor': anchor, class: 'c-lab' }, svg);
        t.textContent = txt;
      };
      if (minI > 0 && minI < last && pts[minI].v < pts[0].v - 1) label(minI, `mínimo ${money0(pts[minI].v)}`, true);
      label(last, money0(pts[last].v), false);
      // mira
      const cross = svgEl('line', { x1: 0, x2: 0, y1: padT, y2: padT + plotH, class: 'c-cross', visibility: 'hidden' }, svg);
      const dot = svgEl('circle', { r: 4.5, class: 'c-end', visibility: 'hidden' }, svg);
      const hit = svgEl('rect', { x: padL, y: padT, width: plotW, height: plotH, class: 'c-hit', tabindex: 0, 'aria-label': 'Use as setas para percorrer a projeção' }, svg);
      let idx = 0;
      const showAt = (i, cx, cy) => {
        idx = Math.max(0, Math.min(last, i));
        const p = pts[idx];
        cross.setAttribute('x1', x(idx));
        cross.setAttribute('x2', x(idx));
        cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', x(idx));
        dot.setAttribute('cy', y(p.v));
        dot.setAttribute('visibility', 'visible');
        const rows = [{ color: 'var(--series-in)', value: money(p.v), label: 'Saldo projetado' }];
        p.itens.slice(0, 4).forEach((it) => rows.push({ value: signedMoney0(it.v), label: it.desc }));
        if (p.itens.length > 4) rows.push({ value: `+${p.itens.length - 4}`, label: 'outros lançamentos' });
        const r = svg.getBoundingClientRect();
        Tip.show(cx ?? r.left + (x(idx) / W) * r.width, cy ?? r.top + (y(p.v) / H) * r.height, idx === 0 ? 'Hoje' : `${weekdayLabel(p.d)}, ${fmtDate(p.d)}`, rows);
      };
      const hideX = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); Tip.hide(); };
      const fromPointer = (e) => {
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        showAt(Math.round(((px - padL) / plotW) * last), e.clientX, e.clientY);
      };
      hit.addEventListener('pointermove', fromPointer);
      hit.addEventListener('pointerdown', fromPointer);
      hit.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hideX(); });
      hit.addEventListener('focus', () => showAt(idx));
      hit.addEventListener('blur', hideX);
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { showAt(idx + 1); e.preventDefault(); }
        if (e.key === 'ArrowLeft') { showAt(idx - 1); e.preventDefault(); }
      });
      host.appendChild(svg);
      if (animate) requestAnimationFrame(() => lp.classList.add('go'));
    },
  };
}

function meter(frac, tone = '') {
  const w = Math.max(0, Math.min(1, frac || 0)) * 100;
  return `<span class="meter ${tone}"><i style="width:${w.toFixed(1)}%"></i></span>`;
}

function chartPanel({ id, title, sub = '', legend = '', cls = '', extra = '' }) {
  return `<section class="panel ${cls}">
    <div class="panel-h"><div><h3>${esc(title)}</h3>${sub ? `<p class="panel-sub">${sub}</p>` : ''}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-tview="${esc(id)}" aria-pressed="false"></button></div>
    ${legend ? `<div class="legend">${legend}</div>` : ''}
    <div class="chart-host" data-chart="${esc(id)}"></div>${extra}
  </section>`;
}
function legendItem(color, label, shape = 'sq') {
  return `<span class="lg"><i class="lg-${shape}" style="background:${color}"></i>${esc(label)}</span>`;
}
