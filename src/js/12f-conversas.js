/* ───────────────────────── leads a partir das conversas exportadas do WhatsApp ───────────────────────── */

/* ── .zip mínimo: o iPhone exporta a conversa como um .zip com o _chat.txt dentro ── */
async function inflarRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function lerZipTextos(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip inválido');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let k = 0; k < total; k++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const tam = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true);
    const xl = dv.getUint16(p + 30, true);
    const cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (!/\.txt$/i.test(nome) || /(^|\/)__MACOSX\//.test(nome)) continue;
    if (dv.getUint32(off, true) !== 0x04034b50) continue;
    const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const dados = u8.subarray(ini, ini + tam);
    const bytes = metodo === 0 ? dados : metodo === 8 ? await inflarRaw(dados) : null;
    if (bytes) out.push({ nome, texto: new TextDecoder('utf-8').decode(bytes) });
  }
  return out;
}

/* ── leitura do texto exportado (iPhone e Android, em português ou inglês) ── */
const WA_INVISIVEIS = /[‎‏‪-‮⁦-⁩﻿]/g;
const WA_MIDIA = /^(<?m[ií]dia oculta>?|<media omitted>|imagem ocultada|image omitted|[áa]udio ocultado|audio omitted|v[íi]deo omitido|video omitted|figurinha omitida|sticker omitted|documento omitido|document omitted|gif omitido|gif omitted|cart[ãa]o de contato omitido|contact card omitted)$/i;
const WA_APAGADA = /^(mensagem apagada|esta mensagem foi apagada|voc[eê] apagou esta mensagem|this message was deleted|you deleted this message)$/i;
function lerConversa(texto, arquivo) {
  const linhas = String(texto || '').replace(WA_INVISIVEIS, '').replace(/[  ]/g, ' ').split(/\r?\n/);
  const reIos = /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp])\.?\s*[Mm]\.?)?\]\s*([^:]{1,60}?):\s?(.*)$/;
  const reAndroid = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp])\.?\s*[Mm]\.?)?\s+-\s+([^:]{1,60}?):\s?(.*)$/;
  const reSistema = /^\[?\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}/;
  const brutas = [];
  for (const l of linhas) {
    const m = l.match(reIos) || l.match(reAndroid);
    if (m) {
      brutas.push({ a: +m[1], b: +m[2], y: +m[3], hh: +m[4], mm: +m[5], ampm: m[6], autor: m[7].trim(), texto: m[8] });
      continue;
    }
    if (reSistema.test(l)) { brutas.push(null); continue; }
    const ult = brutas[brutas.length - 1];
    if (ult && l.trim()) ult.texto += '\n' + l;
  }
  const validas = brutas.filter(Boolean);
  if (!validas.length) return null;
  const diaPrimeiro = validas.some((x) => x.a > 12) || !validas.some((x) => x.b > 12);
  const msgs = [];
  for (const x of validas) {
    const dia = diaPrimeiro ? x.a : x.b;
    const mes = diaPrimeiro ? x.b : x.a;
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;
    const ano = x.y < 100 ? 2000 + x.y : x.y;
    let h = x.hh;
    if (x.ampm) {
      const pm = /p/i.test(x.ampm);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    let t = x.texto.trim();
    if (WA_MIDIA.test(t) || /^<(anexado|attached):/i.test(t)) t = '[mídia]';
    if (!t || WA_APAGADA.test(t)) continue;
    msgs.push({ d: `${ano}-${pad(mes)}-${pad(dia)}`, h: `${pad(h)}:${pad(x.mm)}`, autor: x.autor, texto: t });
  }
  if (!msgs.length) return null;
  // quem é quem
  const base = String(arquivo || '').replace(/\.(txt|zip)$/i, '').trim();
  const fm = base.match(/^(?:conversa do whatsapp|conversa de whatsapp|whatsapp chat|chat de whatsapp|conversa)\s*(?:com|with|con|-|–|:)?\s*(.+)$/i);
  const nomeArq = fm ? fm[1].trim() : /^_?chat$/i.test(base) ? '' : base;
  const cont = new Map();
  msgs.forEach((m) => cont.set(m.autor, (cont.get(m.autor) || 0) + 1));
  const autores = [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n }));
  const ehSocio = (nome) => SOCIOS.some((s) => { const p = norm(primeiroNome(socioNome(s))); return p && norm(nome).split(/\s+/).includes(p); }) || /\bprisma\b/.test(norm(nome));
  const ehArquivo = (nome) => nomeArq && (norm(nome) === norm(nomeArq) || (digits(nomeArq).length >= 10 && digits(nome).endsWith(digits(nomeArq).slice(-8))));
  let prisma = autores.filter((a) => !ehArquivo(a.nome) && (ehSocio(a.nome) || (nomeArq && autores.some((b) => ehArquivo(b.nome))))).map((a) => a.nome);
  if (!prisma.length) prisma = autores.filter((a) => ehSocio(a.nome)).map((a) => a.nome);
  const cliente = autores.find((a) => !prisma.includes(a.nome));
  const clienteNome = cliente ? cliente.nome : nomeArq;
  const telDe = (s) => { const d = digits(s).replace(/^55(?=\d{10,11}$)/, ''); return d.length === 10 || d.length === 11 ? s.trim() : ''; };
  const telefone = telDe(nomeArq) || (cliente ? telDe(cliente.nome) : '');
  const hash = hashTxt(msgs.slice(0, 5).map((m) => `${m.d}${m.h}${m.autor}${m.texto}`).join('|'));
  return { arquivo: base, nomeArq, msgs, autores, prisma, clienteNome: telDe(clienteNome) ? '' : clienteNome, telefone, primeira: msgs[0].d, ultima: msgs[msgs.length - 1].d, hash };
}
function transcrever(c, max = 40000) {
  const fmt = (m) => `${m.d.slice(8, 10)}/${m.d.slice(5, 7)}/${m.d.slice(0, 4)} ${m.h} ${m.autor}: ${m.texto.length > 700 ? m.texto.slice(0, 700) + '…' : m.texto}`;
  const linhas = c.msgs.map(fmt);
  const total = linhas.reduce((a, l) => a + l.length + 1, 0);
  if (total <= max) return linhas.join('\n');
  const ini = [];
  let usado = 0;
  for (const l of linhas) {
    if (usado + l.length > max * 0.2) break;
    ini.push(l);
    usado += l.length + 1;
  }
  const fim = [];
  for (let i = linhas.length - 1; i >= ini.length; i--) {
    if (usado + linhas[i].length > max) break;
    fim.unshift(linhas[i]);
    usado += linhas[i].length + 1;
  }
  return [...ini, `[… ${linhas.length - ini.length - fim.length} mensagens do meio omitidas …]`, ...fim].join('\n');
}
function promptConversa(c) {
  const C = cfg();
  const socios = SOCIOS.map((k) => `${C.socios[k].nome} (${C.socios[k].papel.toLowerCase()})`).join(' e ');
  return `Você ajuda a preencher o CRM da Prisma Systems, empresa que vende sites, automações e sistemas para outras empresas. Os sócios são ${socios}. ${S.me ? meNome() : 'Um dos sócios'} exportou do WhatsApp a conversa abaixo e quer transformá-la em um lead do funil de vendas.

Arquivo: ${c.arquivo}
Contato no nome do arquivo: ${c.nomeArq || 'não informado'}
Participantes (número de mensagens): ${c.autores.map((a) => `${a.nome} (${a.n})`).join(', ')}
Lado da Prisma: ${c.prisma.length ? c.prisma.join(', ') : 'deduza pela conversa (quem oferece os serviços)'}
Hoje: ${today()}

Responda só com um objeto JSON, sem texto antes ou depois, neste formato:
{"ehLead": true, "empresa": "", "contato": "", "cargo": "", "telefone": "", "email": "", "cidade": "", "segmento": "", "site": "", "servicos": ["site"], "valor": null, "origem": "", "etapa": "contato", "motivoPerda": "", "proximoContato": "AAAA-MM-DD", "proximaAcao": "", "resumo": "", "marcos": [{"data": "AAAA-MM-DD", "texto": ""}]}

Regras:
- ehLead: false se não for conversa de venda ou de oportunidade (família, amigos, fornecedor, suporte de quem já é cliente sem projeto novo).
- Use só o que está na conversa e deixe "" (ou null no valor) o que não aparecer. Não invente nomes, telefones, e-mails nem valores.
- contato: nome da pessoa do lado do cliente. empresa: nome do negócio dela; se não aparecer, "".
- servicos: lista com "site", "automacao", "sistema" ou "outro".
- valor: número em reais do total do projeto que foi falado (ex.: 4800). Se só houver mensalidade, o valor mensal. null se não houve valor.
- origem: uma destas ou "": ${C.origens.join(', ')}.
- etapa: "novo" (só chegou o pedido, sem conversa de verdade), "contato" (conversando e entendendo a necessidade), "diagnostico" (reunião ou levantamento marcado ou feito), "proposta" (orçamento ou proposta enviada), "negociacao" (discutindo preço, prazo ou condições depois da proposta), "ganho" (o cliente confirmou que fechou), "perdido" (desistiu, escolheu outro ou parou de responder depois de várias cobranças).
- motivoPerda: só se a etapa for "perdido", uma destas: ${C.motivosPerda.join(', ')}.
- proximoContato: a data combinada na conversa para falar de novo; se não houver, sugira hoje quando o cliente está esperando resposta da Prisma, ou 2 dias úteis depois da última mensagem quando a Prisma está esperando o cliente. Nunca antes de hoje.
- proximaAcao: o que fazer a seguir, curto e no imperativo (até 60 caracteres).
- resumo: 2 a 4 frases sobre o que o cliente quer, o que já aconteceu e o que falta.
- marcos: até 6 momentos importantes, em ordem, com a data da mensagem (primeiro contato, reunião, proposta e valor, objeções, decisões).

Conversa:
${transcrever(c)}`;
}
function normalizarLeitura(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  const s = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const dataOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  let prox = dataOk(o.proximoContato);
  if (prox && prox < today()) prox = today();
  const valor = typeof o.valor === 'number' ? o.valor : parseMoney(o.valor);
  return {
    ehLead: o.ehLead !== false,
    empresa: s(o.empresa, 120),
    contato: s(o.contato, 80),
    cargo: s(o.cargo, 60),
    telefone: s(o.telefone, 30),
    email: s(o.email, 120),
    cidade: s(o.cidade, 80),
    segmento: s(o.segmento, 80),
    site: s(o.site, 120),
    servicos: Array.isArray(o.servicos) ? uniq(o.servicos.map(String).filter((k) => SERVICO[k])) : [],
    valor: valor > 0 && valor < 1e8 ? round2(valor) : null,
    origem: cfg().origens.includes(o.origem) ? o.origem : '',
    etapa: ETAPA[o.etapa] ? o.etapa : 'contato',
    motivoPerda: cfg().motivosPerda.includes(o.motivoPerda) ? o.motivoPerda : '',
    proximoContato: prox,
    proximaAcao: s(o.proximaAcao, 80),
    resumo: s(o.resumo, 900),
    marcos: Array.isArray(o.marcos) ? o.marcos.filter((m) => m && dataOk(m.data) && s(m.texto)).slice(0, 8).map((m) => ({ data: dataOk(m.data), texto: s(m.texto, 240) })) : [],
  };
}
/* sem o Claude: o básico, pelas regras da caixa de colar */
function leituraLocal(c) {
  const doCliente = c.msgs.filter((m) => !c.prisma.includes(m.autor));
  const d = lerMensagem(doCliente.map((m) => m.texto).join('\n').slice(0, 4000));
  const ult = c.msgs[c.msgs.length - 1];
  const esperandoPrisma = !c.prisma.includes(ult.autor);
  const respondeu = c.msgs.some((m) => c.prisma.includes(m.autor));
  const depois = addDiasUteis(ult.d, 2);
  const marcos = [{ data: c.primeira, texto: 'Primeira mensagem no WhatsApp' }];
  if (c.ultima !== c.primeira) marcos.push({ data: c.ultima, texto: `Última mensagem, de ${ult.autor}` });
  return {
    ehLead: true,
    empresa: d.empresa || '',
    contato: d.contato || c.clienteNome || '',
    cargo: d.cargo || '',
    telefone: d.telefone || c.telefone || '',
    email: d.email || '',
    cidade: '',
    segmento: '',
    site: d.site || '',
    servicos: d.servicos || [],
    valor: d.valor || null,
    origem: '',
    etapa: respondeu ? 'contato' : 'novo',
    motivoPerda: '',
    proximoContato: esperandoPrisma ? today() : depois > today() ? depois : today(),
    proximaAcao: esperandoPrisma ? 'Responder o cliente' : 'Retomar a conversa',
    resumo: '',
    marcos,
    local: true,
  };
}
const tel8 = (t) => { const d = digits(t); return d.length >= 8 ? d.slice(-8) : ''; };
function acharLeadConversa(info, c) {
  const leads = Store.all('leads').sort((a, b) => (ABERTAS.includes(b.etapa) ? 1 : 0) - (ABERTAS.includes(a.etapa) ? 1 : 0));
  let l = leads.find((x) => x.conversaHash && x.conversaHash === c.hash);
  if (l) return l;
  const t = tel8(info.telefone || c.telefone);
  if (t) { l = leads.find((x) => tel8(x.telefone) === t); if (l) return l; }
  const ne = norm(info.empresa).trim();
  if (ne) { l = leads.find((x) => norm(x.empresa).trim() === ne); if (l) return l; }
  const nc = norm(info.contato || c.clienteNome).trim();
  if (nc.includes(' ')) { l = leads.find((x) => norm(x.contato).trim() === nc); if (l) return l; }
  return null;
}
function acharClienteConversa(info, c) {
  const t = tel8(info.telefone || c.telefone);
  const ne = norm(info.empresa).trim();
  return Store.all('clientes').find((x) => (t && tel8(x.telefone) === t) || (ne && norm(x.nome).trim() === ne)) || null;
}
const isoDia = (d) => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12, 0).toISOString();
const marcosHist = (marcos) => (marcos || []).map((m) => ({ tipo: 'whatsapp', texto: m.texto, data: isoDia(m.data), autor: null }));

/* ── a tela: escolher → ler → conferir ── */
const Conv = { st: null };
function abrirConversas(opts = {}) {
  if (S.readOnly) return toast('Você tem acesso somente de leitura.', { type: 'error' });
  const lead = opts.leadId ? Store.get('leads', opts.leadId) : null;
  Conv.st = { fase: 'escolher', leadId: lead ? lead.id : null, itens: [], ctls: new Set(), parado: false, semClaude: null };
  Drawer.open({
    focus: '#cv_pick',
    view: () => ({
      title: lead ? `Conversa de ${esc(lead.empresa)}` : 'Leads das conversas do WhatsApp',
      sub: lead ? 'Atualiza este lead com o que foi falado no WhatsApp' : 'O Claude lê cada conversa e preenche o lead; você confere antes de salvar',
      body: '<div id="cv_root" class="cv-root"></div>',
      foot: '<div id="cv_foot" class="cv-foot"></div>',
    }),
    bind: () => pintarConversas(),
    onClose: () => {
      const st = Conv.st;
      if (st) { st.parado = true; st.ctls.forEach((c) => c.abort()); }
      Conv.st = null;
    },
  });
}
function conversasBotao(cls = 'btn', label = 'Escolher as conversas', id = '') {
  return `<label class="${cls}"${id ? ` id="${id}" tabindex="0"` : ''} data-write>${ic('chat')}<span>${esc(label)}</span><input type="file" accept=".txt,.zip,text/plain,application/zip" multiple hidden data-conversas></label>`;
}
document.addEventListener('change', (e) => {
  const inp = e.target;
  if (!inp || !inp.matches || !inp.matches('input[data-conversas]')) return;
  const files = Array.from(inp.files || []);
  inp.value = '';
  if (files.length) carregarConversas(files);
});
document.addEventListener('keydown', (e) => {
  // o "botão" de escolher é um label: Enter e espaço também abrem o seletor
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.id === 'cv_pick') {
    e.preventDefault();
    const i = $('input[data-conversas]', e.target);
    if (i) i.click();
  }
});

function pintarConversas() {
  const st = Conv.st;
  const root = $('#cv_root');
  const foot = $('#cv_foot');
  if (!st || !root || !foot) return;
  if (st.fase === 'escolher') {
    root.innerHTML = `<div class="cv-intro">
        <p>Exporte a conversa pelo próprio WhatsApp e escolha o arquivo aqui. Dá para escolher várias de uma vez.</p>
        <ol class="cv-passos">
          <li><span><b>Abra a conversa</b> com o cliente no WhatsApp.</span></li>
          <li><span><b>No iPhone,</b> toque no nome do contato. <b>No Android,</b> toque nos três pontos e depois em Mais.</span></li>
          <li><span>Escolha <b>Exportar conversa</b> e depois <b>Sem mídia</b>. Salve o arquivo ou mande para você mesmo.</span></li>
        </ol>
        ${conversasBotao('btn btn-primary cv-pick', 'Escolher as conversas', 'cv_pick')}
        <p class="muted small">Funciona com o .txt do Android e com o .zip do iPhone. O Claude lê cada conversa usando o plano de quem está importando; na primeira vez ele pede permissão.</p>
      </div>`;
    foot.innerHTML = '<span class="grow"></span><button type="button" class="btn btn-ghost" data-cv-fechar>Cancelar</button>';
  } else if (st.fase === 'lendo') {
    const prontos = st.itens.filter((x) => ['pronto', 'erro', 'parado'].includes(x.status)).length;
    root.innerHTML = `<div class="cv-lendo"><p class="cv-lendo-t" aria-live="polite"><span class="spin" aria-hidden="true"></span>Lendo ${plural(st.itens.length, 'conversa', 'conversas')}: ${prontos} de ${st.itens.length}</p>
      <ul class="cv-fila">${st.itens.map((x) => `<li class="s-${x.status}"><span class="cv-fn">${esc(x.c ? x.c.clienteNome || x.c.nomeArq || x.arquivo : x.arquivo)}</span><span class="cv-st">${{ fila: 'na fila', lendo: 'o Claude está lendo…', pronto: x.info && x.info.local ? 'lido sem o Claude' : 'pronto', erro: x.erro || 'não deu para ler', parado: 'não lida' }[x.status]}</span></li>`).join('')}</ul>
      <p class="muted small">Cada conversa leva de alguns segundos a um minuto.</p></div>`;
    foot.innerHTML = '<span class="grow"></span><button type="button" class="btn" data-cv-parar>Parar e conferir o que já foi lido</button>';
  } else if (st.fase === 'conferir') {
    montarRevisao(root, foot);
    return;
  }
  bindPeConversas(foot);
}
function bindPeConversas(foot) {
  on(foot, '[data-cv-fechar]', 'click', () => Drawer.close());
  on(foot, '[data-cv-parar]', 'click', () => {
    const st = Conv.st;
    if (!st) return;
    st.parado = true;
    st.ctls.forEach((c) => c.abort());
  });
}

async function carregarConversas(files) {
  const st = Conv.st;
  if (!st || st.fase !== 'escolher') return;
  const lista = [];
  for (const f of files.slice(0, 30)) {
    try {
      if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) {
        const txts = await lerZipTextos(await f.arrayBuffer());
        if (!txts.length) lista.push({ arquivo: f.name, erro: 'O .zip não tem uma conversa em texto.' });
        txts.slice(0, 1).forEach((t) => lista.push({ arquivo: f.name, texto: t.texto }));
      } else lista.push({ arquivo: f.name, texto: await lerArquivoTexto(f) });
    } catch {
      lista.push({ arquivo: f.name, erro: 'Não consegui abrir este arquivo.' });
    }
  }
  if (Conv.st !== st) return;
  st.itens = lista.map((x, k) => {
    const c = x.erro ? null : lerConversa(x.texto, x.arquivo);
    return { k, arquivo: x.arquivo, c, status: c ? 'fila' : 'erro', erro: x.erro || (c ? '' : 'Não parece uma conversa exportada do WhatsApp.') };
  });
  if (files.length > 30) toast('Até 30 conversas por vez. As primeiras 30 foram carregadas.');
  st.fase = 'lendo';
  pintarConversas();
  await lerConversas(st);
}
async function lerConversas(st) {
  let sample = null;
  try { sample = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('sample') : null; } catch { sample = null; }
  if (!sample) st.semClaude = 'indisponivel';
  const fila = st.itens.filter((x) => x.status === 'fila');
  const worker = async () => {
    while (fila.length && Conv.st === st && !st.parado) {
      const it = fila.shift();
      it.status = 'lendo';
      pintarConversas();
      if (!st.semClaude) {
        const ctl = new AbortController();
        st.ctls.add(ctl);
        try {
          it.info = normalizarLeitura(await sample.json(promptConversa(it.c), { signal: ctl.signal }));
        } catch (e) {
          const code = e && e.code;
          if (code === 'cancelled') { it.status = 'parado'; continue; }
          if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired'].includes(code)) st.semClaude = code === 'not_granted' ? 'negado' : 'indisponivel';
          else if (code === 'rate_limited') st.semClaude = 'limite';
          else it.avisoLeitura = 'O Claude não conseguiu ler esta conversa; preenchi o básico.';
        } finally {
          st.ctls.delete(ctl);
        }
      }
      if (!it.info) it.info = leituraLocal(it.c);
      it.status = 'pronto';
      pintarConversas();
    }
  };
  await Promise.all([worker(), worker()]);
  if (Conv.st !== st) return;
  st.itens.forEach((x) => { if (x.status === 'fila' || x.status === 'lendo') x.status = 'parado'; });
  prepararRevisao(st);
  st.fase = 'conferir';
  pintarConversas();
}

function prepararRevisao(st) {
  const vistos = new Map();
  for (const it of st.itens) {
    if (it.status !== 'pronto') continue;
    const info = it.info;
    const c = it.c;
    const alvo = st.leadId ? Store.get('leads', st.leadId) : acharLeadConversa(info, c);
    const cli = alvo ? null : acharClienteConversa(info, c);
    const fechou = info.etapa === 'ganho';
    let etapa = fechou ? 'negociacao' : info.etapa;
    const notas = [];
    if (it.avisoLeitura) notas.push(it.avisoLeitura);
    if (fechou) notas.push('A conversa indica que o cliente fechou. Depois de salvar, abra o lead e use Marcar como ganho para registrar a venda.');
    let vals;
    if (alvo) {
      const aberto = ABERTAS.includes(alvo.etapa);
      if (!aberto) etapa = alvo.etapa;
      else if (etapa !== 'perdido' && ETAPA[etapa].i < ETAPA[alvo.etapa].i) etapa = alvo.etapa;
      vals = {
        empresa: alvo.empresa || info.empresa,
        contato: alvo.contato || info.contato,
        telefone: alvo.telefone || info.telefone || c.telefone,
        valor: info.valor || alvo.valor || null,
        servicos: uniq([...(alvo.servicos || []), ...info.servicos]),
        etapa,
        responsavel: alvo.responsavel || S.me || 'pedro',
        motivoPerda: info.motivoPerda || alvo.motivoPerda || '',
        proximoContato: info.proximoContato || alvo.proximoContato || '',
        proximaAcao: fechou ? 'Registrar a venda no CRM' : info.proximaAcao || alvo.proximaAcao || '',
      };
    } else {
      vals = {
        empresa: info.empresa,
        contato: info.contato || c.clienteNome,
        telefone: info.telefone || c.telefone,
        valor: info.valor,
        servicos: info.servicos,
        etapa,
        responsavel: S.me || 'pedro',
        motivoPerda: info.motivoPerda,
        proximoContato: info.proximoContato || today(),
        proximaAcao: fechou ? 'Registrar a venda no CRM' : info.proximaAcao,
      };
      if (cli) notas.push(`${cli.nome} já é cliente. Crie o lead só se for um projeto novo.`);
    }
    // a mesma conversa (ou o mesmo telefone) duas vezes na mesma importação
    const chave = c.hash;
    const tk = tel8(vals.telefone);
    const dup = vistos.get(chave) || (tk && vistos.get('t' + tk));
    vistos.set(chave, it);
    if (tk) vistos.set('t' + tk, it);
    let acao = alvo ? `atualizar:${alvo.id}` : 'criar';
    if (!info.ehLead && !st.leadId) {
      acao = 'ignorar';
      notas.unshift('Não parece uma conversa de venda (pessoal, fornecedor ou suporte). Escolha Criar lead se for.');
    } else if (cli && !alvo && !info.ehLead) acao = 'ignorar';
    if (dup) {
      acao = 'ignorar';
      notas.unshift('Parece a mesma conversa de outro arquivo desta importação.');
    }
    const etapaOpts = [...ABERTAS, 'perdido', ...(vals.etapa === 'ganho' ? ['ganho'] : [])].map((k) => ({ v: k, l: ETAPA[k].l }));
    const semFone = !vals.telefone;
    it.fields = [
      { k: 'empresa', l: 'Empresa', req: true, ph: 'Nome do negócio' },
      { k: 'contato', l: 'Contato', ph: 'Nome da pessoa' },
      { k: 'telefone', l: 'Telefone / WhatsApp', t: 'tel', ph: '(11) 99999-9999', hint: semFone ? 'O WhatsApp não exporta o número de contatos salvos: cole aqui.' : '' },
      { k: 'valor', l: 'Valor', t: 'money' },
      { k: 'servicos', l: 'Interesse', t: 'chips', opts: SERVICOS.map((s) => ({ v: s.k, l: s.l })), span: 2 },
      { k: 'etapa', l: 'Etapa', t: 'select', opts: etapaOpts },
      { k: 'responsavel', l: 'Responsável', t: 'select', opts: optSocios() },
      { k: 'motivoPerda', l: 'Motivo da perda', t: 'select', opts: optList(cfg().motivosPerda), empty: 'Selecione', req: true, show: (v) => v.etapa === 'perdido' },
      { k: 'proximoContato', l: 'Próximo contato', t: 'date', show: (v) => ABERTAS.includes(v.etapa) },
      { k: 'proximaAcao', l: 'Próxima ação', show: (v) => ABERTAS.includes(v.etapa) },
    ];
    Object.assign(it, { alvo, cli, vals, acao, notas });
  }
}
function montarRevisao(root, foot) {
  const st = Conv.st;
  const prontos = st.itens.filter((x) => x.status === 'pronto');
  const fora = st.itens.filter((x) => x.status !== 'pronto');
  const avisoClaude = { negado: 'O Claude não foi autorizado neste aparelho, então preenchi só o básico de cada conversa. Confira etapa e próximo passo.', indisponivel: Host ? 'A leitura com IA não está ligada neste CRM, então preenchi só o básico de cada conversa. Confira etapa e próximo passo.' : 'O Claude não está disponível aqui, então preenchi só o básico de cada conversa. Confira etapa e próximo passo.', limite: 'O limite de uso do Claude foi atingido no meio da leitura. As conversas que faltavam foram preenchidas só com o básico.' }[st.semClaude];
  const per = (c) => (c.primeira === c.ultima ? fmtDate(c.primeira) : `${fmtDate(c.primeira)} a ${fmtDate(c.ultima)}`);
  root.innerHTML = `${avisoClaude ? `<div class="banner b-warn">${ic('alert')}<div>${esc(avisoClaude)}</div></div>` : ''}
    ${fora.length ? `<div class="banner b-gray">${ic('alert')}<div>${plural(fora.length, 'arquivo ficou de fora', 'arquivos ficaram de fora')}: ${esc(fora.map((x) => `${x.c ? x.c.clienteNome || x.arquivo : x.arquivo} (${x.status === 'parado' ? 'não lida' : x.erro})`).join('; '))}.</div></div>` : ''}
    ${prontos.length ? prontos.map((it) => {
      const built = buildForm(it.fields, it.vals);
      it.fid = built.fid;
      const nome = it.c.clienteNome || it.c.nomeArq || it.arquivo;
      return `<article class="cv-card${it.acao === 'ignorar' ? ' off' : ''}" data-cv="${it.k}">
        <header class="cv-h"><span class="cv-ic">${ic('whatsapp')}</span><div class="cv-ht"><h3>${esc(nome)}</h3><small>${plural(it.c.msgs.length, 'mensagem', 'mensagens')} · ${per(it.c)}${it.info.local ? ' · lido sem o Claude' : ''}</small></div>
          <select data-cv-acao="${it.k}" aria-label="O que fazer com a conversa de ${esc(nome)}">
            <option value="criar"${it.acao === 'criar' ? ' selected' : ''}>Criar lead novo</option>
            ${it.alvo ? `<option value="atualizar:${esc(it.alvo.id)}"${it.acao.startsWith('atualizar') ? ' selected' : ''}>Atualizar: ${esc(it.alvo.empresa)}</option>` : ''}
            <option value="ignorar"${it.acao === 'ignorar' ? ' selected' : ''}>Ignorar</option>
          </select></header>
        ${it.notas.length ? `<ul class="cv-notas">${it.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <div class="cv-b"${it.acao === 'ignorar' ? ' hidden' : ''}>
          ${it.info.resumo ? `<p class="cv-resumo">${esc(it.info.resumo)}</p>` : ''}
          ${built.html}
          ${it.info.marcos.length ? `<details class="cv-marcos"><summary>O que aconteceu na conversa (${it.info.marcos.length})</summary><ol>${it.info.marcos.map((m) => `<li><span>${esc(fmtDateShort(m.data))}</span><p>${esc(m.texto)}</p></li>`).join('')}</ol></details>` : ''}
        </div>
      </article>`;
    }).join('') : emptyState('Nenhuma conversa lida', 'Escolha os arquivos de novo. Use a opção Exportar conversa do WhatsApp, sem mídia.')}`;
  prontos.forEach((it) => bindForm(root, it.fid, it.fields));
  const conta = () => prontos.filter((it) => $(`[data-cv-acao="${it.k}"]`, root).value !== 'ignorar').length;
  const pintaPe = () => {
    const n = conta();
    foot.innerHTML = `<button type="button" class="btn btn-ghost" data-cv-mais>${ic('plus')}Outras conversas</button><span class="grow"></span><button type="button" class="btn btn-ghost" data-cv-fechar>Cancelar</button><button type="button" class="btn btn-primary" data-cv-salvar${n ? '' : ' disabled'}>${n ? `Salvar ${plural(n, 'lead', 'leads')}` : 'Nada para salvar'}</button>`;
    bindPeConversas(foot);
    on(foot, '[data-cv-salvar]', 'click', (e, b) => busy(b, () => salvarConversas(root, prontos)));
    on(foot, '[data-cv-mais]', 'click', () => { const lid = st.leadId; Drawer.close(); abrirConversas({ leadId: lid }); });
  };
  on(root, '[data-cv-acao]', 'change', (e, sel) => {
    const card = sel.closest('.cv-card');
    const off = sel.value === 'ignorar';
    card.classList.toggle('off', off);
    $('.cv-b', card).hidden = off;
    pintaPe();
  });
  pintaPe();
}
async function salvarConversas(root, itens) {
  const plano = [];
  for (const it of itens) {
    const acao = $(`[data-cv-acao="${it.k}"]`, root).value;
    if (acao === 'ignorar') continue;
    const v = readForm(root, it.fid, it.fields);
    if (!validateForm(root, it.fid, it.fields, v)) {
      fieldEl(root, it.fid, 'empresa').closest('.cv-card').scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
      return;
    }
    plano.push({ it, acao, v });
  }
  let criados = 0;
  let atualizados = 0;
  for (const { it, acao, v } of plano) {
    try {
      if (acao.startsWith('atualizar:') && Store.get('leads', acao.slice(10))) {
        await atualizarLeadConversa(acao.slice(10), it, v);
        atualizados++;
      } else {
        await criarLeadConversa(it, v);
        criados++;
      }
    } catch {
      break;
    }
  }
  const n = criados + atualizados;
  if (!n) return;
  Store.logAuto({ tipo: 'conversas', txt: `Leu ${plural(plano.length, 'conversa', 'conversas')} do WhatsApp: ${[criados ? plural(criados, 'lead novo', 'leads novos') : '', atualizados ? plural(atualizados, 'lead atualizado', 'leads atualizados') : ''].filter(Boolean).join(' e ')}`, ref: '' });
  Drawer.close();
  toast(`${[criados ? plural(criados, 'lead criado', 'leads criados') : '', atualizados ? plural(atualizados, 'lead atualizado', 'leads atualizados') : ''].filter(Boolean).join(' e ')} a partir das conversas.`, { action: 'Ver funil', ms: 6000, onAction: () => go('funil') });
}
async function criarLeadConversa(it, v) {
  const { info, c } = it;
  const t = nowISO();
  const aberto = ABERTAS.includes(v.etapa);
  const origem = info.origem || (cfg().origens.includes('WhatsApp') ? 'WhatsApp' : '');
  const hist = [{ tipo: 'criado', texto: 'Lead criado a partir da conversa do WhatsApp', data: t, autor: S.me }, ...marcosHist(info.marcos)];
  if (info.resumo) hist.push({ tipo: 'nota', texto: `Resumo da conversa: ${info.resumo}`, data: t, autor: S.me });
  if (v.etapa === 'perdido') hist.push({ tipo: 'perdido', texto: `Perdido: ${v.motivoPerda}`, data: t, autor: S.me });
  await Store.put('leads', newId('ld'), {
    empresa: v.empresa,
    contato: v.contato || '',
    cargo: info.cargo || '',
    telefone: v.telefone || '',
    email: info.email || '',
    segmento: info.segmento || '',
    cidade: info.cidade || '',
    site: info.site || '',
    servicos: v.servicos || [],
    valor: v.valor || null,
    origem,
    etapa: v.etapa,
    responsavel: v.responsavel,
    proximoContato: aberto ? v.proximoContato || '' : '',
    proximaAcao: aberto ? v.proximaAcao || '' : '',
    notas: info.resumo ? `Resumo da conversa do WhatsApp: ${info.resumo}` : '',
    ...(v.etapa === 'perdido' ? { motivoPerda: v.motivoPerda, perdidoEm: c.ultima } : {}),
    criadoEm: isoDia(c.primeira),
    atualizadoEm: t,
    etapaDesde: c.ultima,
    criadoPor: S.me,
    historico: hist,
    importadoDe: 'whatsapp',
    conversaHash: c.hash,
    conversaAte: c.ultima,
  });
}
async function atualizarLeadConversa(id, it, v) {
  const l = Store.get('leads', id);
  const { info, c } = it;
  const t = nowISO();
  const ch = { atualizadoEm: t, conversaHash: c.hash, conversaAte: c.ultima, responsavel: v.responsavel };
  for (const k of ['empresa', 'contato', 'telefone']) if (v[k] && v[k] !== l[k]) ch[k] = v[k];
  for (const k of ['cargo', 'email', 'segmento', 'cidade', 'site']) if (!l[k] && info[k]) ch[k] = info[k];
  if (!l.origem && info.origem) ch.origem = info.origem;
  if (v.valor && v.valor !== l.valor) ch.valor = v.valor;
  if (JSON.stringify(v.servicos || []) !== JSON.stringify(l.servicos || [])) ch.servicos = v.servicos || [];
  if (ABERTAS.includes(v.etapa)) {
    ch.proximoContato = v.proximoContato || '';
    ch.proximaAcao = v.proximaAcao || '';
  }
  const ja = l.historico || [];
  const novos = marcosHist(info.marcos).filter((h) => !ja.some((x) => x.texto === h.texto && String(x.data).slice(0, 10) === h.data.slice(0, 10)));
  const hist = [...ja, ...novos];
  if (info.resumo) hist.push({ tipo: 'nota', texto: `Resumo da conversa do WhatsApp: ${info.resumo}`, data: t, autor: S.me });
  if (v.etapa !== l.etapa) {
    ch.etapa = v.etapa;
    ch.etapaDesde = today();
    if (v.etapa === 'perdido') {
      ch.motivoPerda = v.motivoPerda;
      ch.perdidoEm = today();
      hist.push({ tipo: 'perdido', texto: `Perdido: ${v.motivoPerda} (pela conversa do WhatsApp)`, data: t, autor: S.me });
    } else hist.push({ tipo: 'etapa', texto: `${ETAPA[l.etapa] ? ETAPA[l.etapa].l : l.etapa} → ${ETAPA[v.etapa].l} (pela conversa do WhatsApp)`, data: t, autor: S.me });
  }
  if (!l.notas && info.resumo) ch.notas = `Resumo da conversa do WhatsApp: ${info.resumo}`;
  ch.historico = hist;
  await Store.patch('leads', id, ch);
}
