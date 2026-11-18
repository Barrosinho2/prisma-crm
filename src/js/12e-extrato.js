/* ───────────────────────── extrato do banco (OFX ou CSV): baixa automática ───────────────────────── */
function extratoBotao(cls = 'btn') {
  return `<label class="${cls}" data-write>${ic('bank')}<span>Importar extrato</span><input type="file" accept=".ofx,.csv,.txt,text/csv,application/x-ofx" hidden data-extrato></label>`;
}
document.addEventListener('change', (e) => {
  const inp = e.target;
  if (!inp || !inp.matches || !inp.matches('input[data-extrato]')) return;
  const f = inp.files && inp.files[0];
  inp.value = '';
  if (f) importarExtrato(f);
});

function hashTxt(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
async function lerArquivoTexto(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
function lerData(s) {
  const v = String(s || '').trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    if (+m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return '';
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  return '';
}
function lerOFX(txt) {
  const out = [];
  for (const b of txt.split(/<STMTTRN>/i).slice(1)) {
    const g = (tag) => {
      const m = b.match(new RegExp('<' + tag + '>\\s*([^<\\r\\n]+)', 'i'));
      return m ? m[1].trim() : '';
    };
    const dt = g('DTPOSTED');
    const valor = parseMoney(g('TRNAMT'));
    if (!/^\d{8}/.test(dt) || isNaN(valor) || !valor) continue;
    const desc = [g('NAME'), g('MEMO')].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ') || 'Movimentação do banco';
    out.push({ data: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`, valor: round2(valor), desc: desc.replace(/\s+/g, ' '), fid: g('FITID') });
  }
  return out;
}
function splitCSV(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
function lerCSV(txt) {
  const linhas = txt.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  let hi = linhas.findIndex((l) => /\b(data|date)\b/.test(norm(l)) && /(valor|amount|value|credito|debito|quantia)/.test(norm(l)));
  if (hi < 0) hi = 0;
  const head = linhas[hi];
  const sep = [';', ',', '\t'].map((c) => [c, head.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const H = splitCSV(head, sep).map((h) => norm(h).replace(/["']/g, '').trim());
  const acha = (res, evitar = []) => {
    for (const re of res) {
      const i = H.findIndex((h, j) => re.test(h) && !evitar.includes(j));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cData = acha([/^data\b/, /^date\b/, /^dt\b/, /data/]);
  const cValor = acha([/^valor\b/, /^valor/, /^value\b/, /^amount\b/, /quantia|montante/], [cData]);
  const cCred = acha([/credito|entrada/], [cData, cValor]);
  const cDeb = acha([/debito|saida/], [cData, cValor, cCred]);
  const cDesc = acha([/descri/, /^title\b|titulo/, /histor/, /memo|estabelecimento|detalhe|lancamento|identific/], [cData, cValor, cCred, cDeb]);
  const cHist = acha([/histor/], [cData, cValor, cCred, cDeb, cDesc]);
  const cTipo = acha([/^tipo\b|natureza|^d\/c$|^dc$/], [cData, cValor, cCred, cDeb, cDesc]);
  if (cData < 0 || (cValor < 0 && cCred < 0 && cDeb < 0)) return [];
  const cartao = H.includes('title') && H.includes('amount');
  const out = [];
  for (const l of linhas.slice(hi + 1)) {
    const c = splitCSV(l, sep);
    const data = lerData(c[cData]);
    if (!data) continue;
    let valor = NaN;
    if (cValor >= 0) {
      valor = parseMoney(c[cValor]);
      if (cTipo >= 0 && /^(d|debito|saida|despesa)/.test(norm(c[cTipo] || ''))) valor = -Math.abs(valor);
      if (cartao) valor = -valor;
    } else {
      const cr = cCred >= 0 ? parseMoney(c[cCred]) : NaN;
      const db = cDeb >= 0 ? parseMoney(c[cDeb]) : NaN;
      valor = (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(db) ? 0 : Math.abs(db));
    }
    if (isNaN(valor) || !valor) continue;
    const desc = [cHist >= 0 ? c[cHist] : '', cDesc >= 0 ? c[cDesc] : ''].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ') || 'Movimentação do banco';
    if (/^saldo\b/i.test(norm(desc))) continue;
    out.push({ data, valor: round2(valor), desc: desc.replace(/\s+/g, ' '), fid: '' });
  }
  return out;
}
function lerExtrato(txt) {
  return /<STMTTRN>/i.test(txt) ? lerOFX(txt) : lerCSV(txt);
}
function catPalpite(tipo, desc) {
  const n = norm(desc);
  const cats = tipo === 'entrada' ? cfg().categoriasEntrada : cfg().categoriasSaida;
  const tem = (re) => cats.find((c) => re.test(norm(c)));
  if (tipo === 'saida') {
    if (/tarifa|iof|juros|das\b|simples nacional|imposto|darf|gps\b|inss|iss\b/.test(n)) return tem(/imposto|taxa/) || cats[cats.length - 1];
    if (/google ads|facebook|meta ads|instagram|linkedin ads|anuncio/.test(n)) return tem(/marketing|anuncio/) || cats[cats.length - 1];
    if (/hostinger|hostgator|locaweb|godaddy|registro\.?br|aws|amazon web|vercel|netlify|digitalocean|cloudflare|hospedagem|dominio/.test(n)) return tem(/hospedagem|dominio/) || cats[cats.length - 1];
    if (/figma|adobe|notion|canva|github|openai|anthropic|claude|chatgpt|microsoft|google workspace|gsuite|slack|zapier|make\.com|n8n|software|assinatura/.test(n)) return tem(/ferramenta|software/) || cats[cats.length - 1];
    if (/contab|contador/.test(n)) return tem(/contab/) || cats[cats.length - 1];
    if (/pro.?labore|retirada/.test(n)) return tem(/pro.?labore|retirada/) || cats[cats.length - 1];
    return tem(/outras/) || cats[cats.length - 1];
  }
  return tem(/outras/) || cats[cats.length - 1];
}
/* junta cada movimentação com o lançamento em aberto de mesmo valor e data mais próxima */
function casarExtrato(txs) {
  const todos = Store.all('lancamentos').filter((l) => !l.demo);
  const abertos = todos.filter((l) => !l.pagoEm);
  const pagos = todos.filter((l) => l.pagoEm);
  const importados = new Set(todos.map((l) => l.extratoId).filter(Boolean));
  const usados = new Set();
  const vistos = new Set();
  return txs
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((tx) => {
      const tipo = tx.valor > 0 ? 'entrada' : 'saida';
      const v = Math.abs(tx.valor);
      let id = tx.fid ? `ofx_${tx.fid}` : `csv_${hashTxt(`${tx.data}|${tx.valor}|${norm(tx.desc)}`)}`;
      while (vistos.has(id)) id += '_';
      vistos.add(id);
      const row = { tx, id, tipo, v, cat: catPalpite(tipo, tx.desc) };
      if (importados.has(id)) return Object.assign(row, { acao: 'ja', motivo: 'importada antes' });
      const cands = abertos
        .filter((l) => l.tipo === tipo && !usados.has(l.id) && Math.abs((+l.valor || 0) - v) < 0.01)
        .map((l) => ({ l, dist: Math.abs(daysBetween(l.vencimento || tx.data, tx.data)) }))
        .filter((c) => c.dist <= 45)
        .sort((a, b) => a.dist - b.dist);
      if (cands.length) {
        usados.add(cands[0].l.id);
        return Object.assign(row, { acao: `baixa:${cands[0].l.id}`, opcoes: cands.map((c) => c.l) });
      }
      const pago = pagos.find((l) => l.tipo === tipo && !l.extratoId && !usados.has(l.id) && Math.abs((+l.valor || 0) - v) < 0.01 && Math.abs(daysBetween(l.pagoEm, tx.data)) <= 5);
      if (pago) {
        usados.add(pago.id);
        return Object.assign(row, { acao: 'ja', motivo: `já marcado: ${pago.descricao}` });
      }
      return Object.assign(row, { acao: 'ignorar', opcoes: [] });
    });
}

async function importarExtrato(file) {
  if (S.readOnly) return toast('Você tem acesso somente de leitura.', { type: 'error' });
  let txt = '';
  try {
    txt = await lerArquivoTexto(file);
  } catch {
    return toast('Não foi possível ler o arquivo.', { type: 'error' });
  }
  const txs = lerExtrato(txt);
  if (!txs.length) return toast('Não encontrei movimentações nesse arquivo. Use o extrato em OFX ou CSV exportado pelo banco.', { type: 'error', ms: 7000 });
  const rows = casarExtrato(txs);
  const nBaixa = rows.filter((r) => r.acao.startsWith('baixa')).length;
  const nJa = rows.filter((r) => r.acao === 'ja').length;
  const nNovo = rows.filter((r) => r.acao === 'ignorar').length;
  const ini = rows[0].tx.data;
  const fim = rows[rows.length - 1].tx.data;
  const opts = (r) => {
    if (r.acao === 'ja') return '';
    const o = (r.opcoes || []).map((l) => `<option value="baixa:${esc(l.id)}">Marcar como ${r.tipo === 'entrada' ? 'recebido' : 'pago'}: ${esc(l.descricao)} (vence ${fmtDate(l.vencimento).slice(0, 5)})</option>`);
    o.push(`<option value="criar">Criar ${r.tipo === 'entrada' ? 'entrada' : 'despesa'} já paga: ${esc(r.cat)}</option>`);
    o.push('<option value="ignorar">Ignorar</option>');
    return `<select data-ex="${esc(r.id)}" aria-label="O que fazer com ${esc(r.tx.desc)}">${o.join('')}</select>`;
  };
  const linha = (r) => `<li class="ex-i ${r.acao === 'ja' ? 'ja' : r.acao.startsWith('baixa') ? 'bate' : 'novo'}"><span class="ex-d">${fmtDate(r.tx.data).slice(0, 5)}</span><span class="ex-t"><b>${esc(r.tx.desc)}</b>${r.acao === 'ja' ? `<small>${esc(cap(r.motivo))}</small>` : ''}</span><span class="ex-v ${r.tipo === 'entrada' ? 'pos' : 'neg'}">${r.tipo === 'entrada' ? '+' : '−'}${money(r.v)}</span><span class="ex-a">${r.acao === 'ja' ? pill('Já no CRM', 'gray', 'check') : opts(r)}</span></li>`;
  let aplicado = false;
  const m = Modal.open({
    title: `Extrato: ${file.name}`,
    size: 'modal-lg',
    body: `<p class="modal-text">${plural(rows.length, 'movimentação', 'movimentações')} de ${fmtDate(ini)} a ${fmtDate(fim)}.</p>
      <div class="ex-sum"><span class="ex-chip bate"><b>${nBaixa}</b> ${nBaixa === 1 ? 'bate com um lançamento em aberto' : 'batem com lançamentos em aberto'}</span><span class="ex-chip ja"><b>${nJa}</b> ${nJa === 1 ? 'já estava no CRM' : 'já estavam no CRM'}</span><span class="ex-chip novo"><b>${nNovo}</b> ${nNovo === 1 ? 'não encontrada' : 'não encontradas'}</span></div>
      ${nNovo ? `<label class="check" for="ex_criar"><input type="checkbox" id="ex_criar"><span>${nNovo === 1 ? 'Criar um lançamento já pago para a movimentação não encontrada' : `Criar lançamentos já pagos para as ${nNovo} movimentações não encontradas`}</span></label>` : ''}
      <ul class="ex-list">${rows.map(linha).join('')}</ul>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost' },
      {
        label: 'Aplicar',
        kind: 'primary',
        onClick: async (root) => {
          const escolha = new Map($$('select[data-ex]', root).map((s) => [s.dataset.ex, s.value]));
          const plano = rows.filter((r) => r.acao !== 'ja').map((r) => ({ r, acao: escolha.get(r.id) || 'ignorar' })).filter((x) => x.acao !== 'ignorar');
          if (!plano.length) { toast('Nada para aplicar. Escolha o que fazer em cada movimentação.', { type: 'error' }); return false; }
          aplicado = true;
          m.close();
          await aplicarExtrato(plano, file.name);
        },
      },
    ],
  });
  const ck = $('#ex_criar', m.el);
  if (ck) ck.addEventListener('change', () => rows.filter((r) => r.acao === 'ignorar').forEach((r) => { const s = $(`select[data-ex="${CSS.escape(r.id)}"]`, m.el); if (s) s.value = ck.checked ? 'criar' : 'ignorar'; }));
  return aplicado;
}
async function aplicarExtrato(plano, nome) {
  const p = progressModal('Aplicando o extrato');
  let baixas = 0;
  let novos = 0;
  let nfs = 0;
  try {
    for (let i = 0; i < plano.length; i++) {
      const { r, acao } = plano[i];
      if (acao.startsWith('baixa:')) {
        const id = acao.slice(6);
        const l = Store.get('lancamentos', id);
        if (l && !l.pagoEm) {
          await Store.patch('lancamentos', id, { pagoEm: r.tx.data, extratoId: r.id, atualizadoEm: nowISO() });
          baixas++;
          try { if (await notaFiscalAuto(l)) nfs++; } catch {}
        }
      } else if (acao === 'criar') {
        await Store.put('lancamentos', newId('lc'), { tipo: r.tipo, descricao: r.tx.desc.slice(0, 140), valor: r.v, categoria: r.cat, vencimento: r.tx.data, pagoEm: r.tx.data, forma: 'Transferência', clienteId: null, projetoId: null, extratoId: r.id, notas: `Importado do extrato ${nome}`, criadoEm: nowISO(), criadoPor: S.me });
        novos++;
      }
      p.set(i + 1, plano.length);
    }
  } catch (e) {
    console.warn('extrato', e);
  } finally {
    p.close();
  }
  if (baixas || novos) Store.logAuto({ tipo: 'extrato', txt: `Extrato ${nome}: ${plural(baixas, 'baixa', 'baixas')}${novos ? ` e ${plural(novos, 'lançamento novo', 'lançamentos novos')}` : ''}${nfs ? `, ${plural(nfs, 'nota fiscal', 'notas fiscais')} para emitir` : ''}`, ref: 'fin:mes' });
  toast(`Extrato aplicado: ${plural(baixas, 'lançamento marcado como pago', 'lançamentos marcados como pagos')}${novos ? ` e ${plural(novos, 'novo', 'novos')}` : ''}.${nfs ? ` ${plural(nfs, 'nota fiscal', 'notas fiscais')} na agenda.` : ''}`, { ms: 7000 });
}
