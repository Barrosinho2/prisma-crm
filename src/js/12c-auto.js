/* ───────────────────────── PILOTO AUTOMÁTICO: mensagens, motor e automações por evento ───────────────────────── */

/* ── mensagens prontas ── */
const MSG_INFO = {
  primeiroContato: { l: 'Primeiro contato', quando: 'Lead novo, ainda sem conversa' },
  followup: { l: 'Follow-up', quando: 'Leads em contato ou em diagnóstico' },
  proposta: { l: 'Retorno da proposta', quando: 'Lead com proposta enviada' },
  fechamento: { l: 'Fechamento', quando: 'Lead em negociação' },
  cobranca: { l: 'Lembrete de parcela', quando: 'Antes e no dia do vencimento' },
  atraso: { l: 'Parcela atrasada', quando: 'Depois do vencimento' },
  depoimento: { l: 'Depoimento e indicação', quando: 'Projeto entregue' },
  manutencao: { l: 'Plano de manutenção', quando: 'Projeto entregue, cliente sem mensalidade' },
};
const MSG_VARS = [
  ['{contato}', 'primeiro nome do contato'],
  ['{empresa}', 'empresa'],
  ['{eu}', 'quem está usando o CRM'],
  ['{servico}', 'interesse do lead'],
  ['{projeto}', 'nome do projeto'],
  ['{descricao}', 'descrição da parcela'],
  ['{valor}', 'valor da parcela'],
  ['{vencimento}', 'quando vence'],
  ['{pix}', 'chave Pix, se cadastrada'],
];

function preencher(tpl, ctx) {
  return String(tpl || '')
    .replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined && ctx[k] !== null ? String(ctx[k]) : ''))
    .replace(/,\s*!/g, '!')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .trim();
}
function servicoTexto(arr) {
  const m = { site: 'um site', automacao: 'automação', sistema: 'um sistema', outro: 'soluções digitais' };
  const xs = (arr || []).map((k) => m[k]).filter(Boolean);
  if (!xs.length) return 'soluções digitais';
  return xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
}
function vencTexto(d) {
  if (!d) return '';
  const r = relDay(d);
  return /^\d/.test(r) ? `em ${fmtDate(d).slice(0, 5)}` : r;
}
function ctxBase(dono) {
  const pix = String(cfg().pix || '').trim();
  return { eu: S.me ? meNome() : socioNome(dono || 'pedro'), pix: pix ? `Chave Pix: ${pix}. ` : '' };
}
function msgLeadTipo(l) {
  if (l.etapa === 'novo') return 'primeiroContato';
  if (l.etapa === 'proposta') return 'proposta';
  if (l.etapa === 'negociacao') return 'fechamento';
  return 'followup';
}
function msgLead(l, tipo = msgLeadTipo(l)) {
  return preencher(cfg().msgs[tipo], Object.assign(ctxBase(l.responsavel), { contato: primeiroNome(l.contato), empresa: l.empresa, servico: servicoTexto(l.servicos) }));
}
function msgCobranca(l, tipo) {
  const c = Store.get('clientes', l.clienteId);
  const p = Store.get('projetos', l.projetoId);
  const k = tipo || (l.vencimento && l.vencimento < today() ? 'atraso' : 'cobranca');
  return preencher(cfg().msgs[k], Object.assign(ctxBase(p && p.vendedor), { contato: primeiroNome(c && c.contato), empresa: c ? c.nome : '', descricao: l.descricao, valor: money(l.valor), vencimento: vencTexto(l.vencimento), projeto: p ? p.titulo : '' }));
}
function msgProjeto(p, tipo) {
  const c = Store.get('clientes', p.clienteId);
  return preencher(cfg().msgs[tipo], Object.assign(ctxBase(p.vendedor), { contato: primeiroNome(c && c.contato), empresa: c ? c.nome : '', projeto: p.titulo }));
}

/* cartão com a mensagem e os botões que abrem o WhatsApp ou o Gmail já preenchidos */
function msgCard({ titulo, texto, tel = '', email = '', assunto = '', marca = '' }) {
  const wa = waMsgLink(tel, texto);
  return `<div class="msgc">
    <p class="msgc-t">${esc(titulo)}</p>
    <p class="msgc-x">${esc(texto)}</p>
    <div class="msgc-a">${wa ? `<a class="btn btn-sm btn-wa" href="${esc(wa)}" target="_blank" rel="noopener"${marca ? ` data-msg-sent="${esc(marca)}"` : ''}>${ic('whatsapp')}WhatsApp</a>` : ''}${email ? `<a class="btn btn-sm" href="${esc(gmailLink(email, assunto, texto))}" target="_blank" rel="noopener"${marca ? ` data-msg-sent="${esc(marca)}"` : ''}>${ic('mail')}Gmail</a>` : ''}<button type="button" class="btn btn-sm btn-ghost" data-copy="${esc(texto)}">${ic('copy')}Copiar</button>${!wa && !email ? '<span class="muted small">Sem telefone ou e-mail cadastrado</span>' : ''}</div>
  </div>`;
}

/* ── automações por evento ── */

/* ao mudar de etapa: agenda o próximo contato com a ação da etapa (não mexe em contato já marcado para depois de hoje) */
function followupAuto(l, stage) {
  const A = cfg().auto;
  if (!A.followupEtapa || !ABERTAS.includes(stage)) return null;
  const t = today();
  if (l.proximoContato && l.proximoContato > t) return null;
  const dias = A.prazosEtapa[stage] ?? 2;
  return { proximoContato: addDiasUteis(t, dias), proximaAcao: A.acoesEtapa[stage] || '' };
}
function logFollowup(l, fu) {
  Store.logAuto({ tipo: 'followup', txt: `Agendou contato com ${l.empresa} para ${relDay(fu.proximoContato) === 'hoje' ? 'hoje' : fmtDateShort(fu.proximoContato)}: ${fu.proximaAcao || 'follow-up'}`, ref: `lead:${l.id}` });
}

/* ao fechar venda: tarefas do projeto para quem executa, com prazos até a entrega */
async function checklistVenda(pid, v, demo = {}) {
  const A = cfg().auto;
  if (!A.checklistVenda) return 0;
  const itens = (A.checklist[v.servico] || []).filter(Boolean);
  if (!itens.length) return 0;
  const ini = v.dataFechamento && v.dataFechamento > today() ? v.dataFechamento : today();
  const fim = v.prazo && v.prazo > ini ? v.prazo : addDiasUteis(ini, 15);
  const span = Math.max(itens.length, daysBetween(ini, fim));
  const quem = SOCIOS.includes(v.executor) ? v.executor : 'rafael';
  let n = 0;
  for (let i = 0; i < itens.length; i++) {
    const prazo = i === itens.length - 1 ? fim : addDiasUteis(addDays(ini, Math.max(1, Math.round((span * (i + 1)) / itens.length))), 0);
    await Store.put('tarefas', `auto_ck_${pid}_${i}`, { titulo: itens[i], responsavel: quem, prazo: prazo > fim ? fim : prazo, vinculo: `projeto:${pid}`, notas: '', feita: false, feitaEm: null, criadoEm: nowISO(), criadoPor: S.me, auto: 'checklist', ...demo });
    n++;
  }
  Store.logAuto({ tipo: 'checklist', txt: `Criou ${plural(n, 'tarefa', 'tarefas')} do projeto ${v.titulo} para ${socioNome(quem)}, até ${fmtDateShort(fim)}`, ref: `projeto:${pid}` });
  return n;
}

/* ao entregar: depoimento, manutenção (se o cliente não tem) e saldo em aberto */
async function posEntrega(pid) {
  if (!cfg().auto.posEntrega) return 0;
  const p = Store.get('projetos', pid);
  if (!p) return 0;
  const c = Store.get('clientes', p.clienteId);
  const nome = c ? c.nome : p.titulo;
  const quem = SOCIOS.includes(p.vendedor) ? p.vendedor : 'pedro';
  const t = today();
  const f = Calc.projetoFin(p);
  const itens = [{ k: 'depoimento', titulo: `Pedir depoimento e indicação: ${nome}`, prazo: addDiasUteis(t, 2) }];
  const temMensal = Store.all('recorrencias').some((r) => r.ativo && r.tipo === 'entrada' && (r.projetoId === pid || (p.clienteId && r.clienteId === p.clienteId)));
  if (!temMensal) itens.push({ k: 'manutencao', titulo: `Oferecer plano de manutenção: ${nome}`, prazo: addDiasUteis(t, 5) });
  const saldo = f.ls.filter((l) => !l.pagoEm && /saldo/i.test(l.descricao || ''));
  if (saldo.length) itens.push({ k: 'saldo', titulo: `Cobrar o saldo da entrega (${money(sum(saldo, (l) => l.valor))}): ${nome}`, prazo: t });
  if (f.semParcela > 0) itens.push({ k: 'parcela', titulo: `Lançar ${money(f.semParcela)} do projeto que ainda não tem parcela: ${p.titulo}`, prazo: t });
  const demo = herdaDemo({ projetoId: pid });
  let n = 0;
  for (const it of itens) {
    const id = `auto_pe_${pid}_${it.k}`;
    if (Store.get('tarefas', id)) continue;
    await Store.put('tarefas', id, { titulo: it.titulo, responsavel: quem, prazo: it.prazo, vinculo: `projeto:${pid}`, notas: '', feita: false, feitaEm: null, criadoEm: nowISO(), criadoPor: S.me, auto: 'posEntrega', ...demo });
    n++;
  }
  if (n) Store.logAuto({ tipo: 'posEntrega', txt: `${p.titulo} foi entregue: criou ${plural(n, 'tarefa', 'tarefas')} de pós-venda para ${socioNome(quem)}`, ref: `projeto:${pid}` });
  return n;
}
async function mudarStatusProjeto(id, status, extra = {}) {
  const p = Store.get('projetos', id);
  if (!p) return;
  const ch = { status, atualizadoEm: nowISO(), ...extra };
  if (status === 'entregue' && !p.entregueEm && !ch.entregueEm) ch.entregueEm = today();
  await Store.patch('projetos', id, ch);
  let n = 0;
  if (status === 'entregue' && p.status !== 'entregue') {
    try { n = await posEntrega(id); } catch {}
  }
  toast(n ? `Projeto entregue. ${plural(n, 'tarefa', 'tarefas')} de pós-venda na agenda de ${socioNome(p.vendedor || 'pedro')}.` : `Status: ${STATUS[status].l}.`, n ? { action: 'Ver agenda', onAction: () => go('agenda') } : {});
}

/* ao receber de um cliente: tarefa de emitir a nota fiscal */
async function notaFiscalAuto(l) {
  const A = cfg().auto;
  if (!A.notaFiscal || !l || l.tipo !== 'entrada' || !l.clienteId) return null;
  const id = `auto_nf_${l.id}`;
  if (Store.get('tarefas', id)) return null;
  const nome = clienteNome(l.clienteId);
  await Store.put('tarefas', id, {
    titulo: `Emitir nota fiscal: ${nome} · ${money(l.valor)}`,
    responsavel: A.nfResponsavel,
    prazo: today(),
    vinculo: l.projetoId && Store.get('projetos', l.projetoId) ? `projeto:${l.projetoId}` : `cliente:${l.clienteId}`,
    notas: `Referente a: ${l.descricao}`,
    feita: false,
    feitaEm: null,
    criadoEm: nowISO(),
    criadoPor: S.me,
    auto: 'notaFiscal',
    lancamentoId: l.id,
    ...(l.demo ? { demo: true } : herdaDemo({ clienteId: l.clienteId, projetoId: l.projetoId })),
  });
  Store.logAuto({ tipo: 'notaFiscal', txt: `Criou a tarefa de nota fiscal de ${money(l.valor)} (${nome}) para ${socioNome(A.nfResponsavel)}`, ref: `tarefa:${id}` });
  return id;
}
/* desfaz o efeito: tarefa ainda não feita sai junto */
function desfazNotaFiscal(tid) {
  const x = tid && Store.get('tarefas', tid);
  if (x && !x.feita) Store.remove('tarefas', tid).catch(() => {});
}

/* ao abrir a mensagem pronta pelo lead: fica registrado no histórico */
async function registrarMsgLead(id, tipo) {
  const l = Store.get('leads', id);
  if (!l || S.readOnly) return;
  const t = nowISO();
  try {
    await Store.patch('leads', id, { atualizadoEm: t, historico: [...(l.historico || []), { tipo: 'whatsapp', texto: `Mensagem pronta aberta: ${(MSG_INFO[tipo] || MSG_INFO.followup).l.toLowerCase()}`, data: t, autor: S.me }] });
  } catch {}
}

/* ── lançamento gerado por uma recorrência (manual ou pelo piloto) ── */
function corpoRecorrencia(r, m) {
  return {
    tipo: r.tipo,
    descricao: r.descricao,
    valor: r.valor,
    categoria: r.categoria,
    vencimento: dateInMonth(m, r.dia),
    pagoEm: null,
    forma: r.forma || '',
    clienteId: r.clienteId || null,
    projetoId: r.projetoId || null,
    recorrenciaId: r.id,
    competencia: m,
    notas: '',
    criadoEm: nowISO(),
    criadoPor: S.me,
    ...(r.demo ? { demo: true } : {}),
  };
}
/* cria só se não existir no banco (nunca sobrescreve o que alguém já mexeu) */
async function criarSeNaoExiste(col, id, data) {
  if (Store.get(col, id)) return false;
  if (S.mode === 'cloud') {
    const s = await S.db.collection(col).doc(id).get();
    if (s.exists) return false;
  }
  await Store.put(col, id, data);
  return true;
}

/* ── motor das automações de calendário (rodam com o CRM aberto, numa aba por vez) ── */
const Auto = {
  timer: null,
  rodando: false,
  ultima: 0,
  feitas: 0,
  agendar(ms = 1500) {
    clearTimeout(Auto.timer);
    Auto.timer = setTimeout(() => {
      Auto.rodar().catch((e) => console.warn('piloto automático', e));
    }, ms);
  },
  pronto() {
    if (S.readOnly || S.fatal) return false;
    return S.mode === 'local' || (S.mode === 'cloud' && S.ready);
  },
  impostoPlano() {
    const A = cfg().auto;
    if (A.imposto === 'off') return null;
    const comp = monthAdd(thisMonth(), -1);
    const id = `imp_${comp}`;
    let base = 0;
    let valor = 0;
    if (A.imposto === 'simples') {
      base = round2(sum(Store.all('lancamentos').filter((l) => l.tipo === 'entrada' && !l.demo && l.pagoEm && monthOf(l.pagoEm) === comp), (l) => l.valor));
      valor = round2((base * (+A.impostoPct || 0)) / 100);
    } else valor = round2(+A.impostoValor || 0);
    if (!(valor > 0)) return null;
    const cur = Store.get('lancamentos', id);
    const nomeMes = monthLabel(comp).toLowerCase();
    const plano = {
      id,
      comp,
      valor,
      descricao: `DAS ${A.imposto === 'mei' ? 'MEI' : 'Simples Nacional'} · ${nomeMes}`,
      notas: A.imposto === 'simples' ? `Calculado pelo piloto automático: ${fmtNum(A.impostoPct, 2)}% sobre ${money(base)} recebidos em ${nomeMes}.` : 'Valor fixo do DAS MEI, lançado pelo piloto automático.',
      cur,
    };
    const ajustar = cur && !cur.pagoEm && cur.auto === 'imposto' && Math.abs((+cur.valor || 0) - (+cur.valorAuto || 0)) < 0.005 && Math.abs(cur.valor - valor) >= 0.01;
    if (cur && !ajustar) return null;
    if (!cur && S.autoEstado.feitos && S.autoEstado.feitos[`imp:${comp}`] && !Auto.estadoNovo) return null;
    plano.ajustar = !!ajustar;
    return plano;
  },
  plano() {
    const A = cfg().auto;
    const t = today();
    return {
      recorrencias: A.recorrencias ? Calc.recPendentes(thisMonth()) : [],
      parados: A.leadParado ? Calc.leadsAbertos().filter((l) => Calc.leadParado(l, A.diasParado, t) && !(l.paradoAviso && daysBetween(l.paradoAviso, t) < A.diasParado)) : [],
      imposto: Auto.impostoPlano(),
    };
  },
  temTrabalho(p) {
    return p.recorrencias.length > 0 || p.parados.length > 0 || !!p.imposto;
  },
  async rodar(forcar = false) {
    if (Auto.rodando || !Auto.pronto()) return;
    const agora = Date.now();
    if (!forcar && agora - Auto.ultima < 15000) return Auto.agendar(15000 - (agora - Auto.ultima) + 50);
    if (!Auto.temTrabalho(Auto.plano())) return;
    Auto.rodando = true;
    Auto.ultima = agora;
    const feito = { rec: [], imp: null, parados: [] };
    try {
      if (!(await Store.trava(45000))) return;
      const est = await Store.lerEstado();
      Auto.estadoNovo = false;
      const p = Auto.plano();
      const m = thisMonth();
      // 1) recorrências do mês
      for (const r of p.recorrencias) {
        try {
          if (await criarSeNaoExiste('lancamentos', Calc.recLancId(r.id, m), corpoRecorrencia(r, m))) feito.rec.push(r);
        } catch (e) {
          console.warn('recorrência não lançada', r.id, e);
          break;
        }
      }
      // 2) imposto da competência anterior
      const x = p.imposto;
      if (x && !(est.feitos[`imp:${x.comp}`] && !x.cur)) {
        try {
          const cat = cfg().categoriasSaida.find((c) => /imposto/i.test(c)) || 'Impostos & taxas';
          if (x.ajustar) {
            await Store.patch('lancamentos', x.id, { valor: x.valor, valorAuto: x.valor, notas: x.notas, atualizadoEm: nowISO() });
            feito.imp = { ...x, ajustado: true };
          } else if (await criarSeNaoExiste('lancamentos', x.id, { tipo: 'saida', descricao: x.descricao, valor: x.valor, valorAuto: x.valor, categoria: cat, vencimento: dateInMonth(m, cfg().auto.impostoDia), pagoEm: null, forma: 'Boleto', clienteId: null, projetoId: null, competencia: x.comp, auto: 'imposto', notas: x.notas, criadoEm: nowISO(), criadoPor: S.me })) {
            feito.imp = x;
          }
          est.feitos[`imp:${x.comp}`] = today();
        } catch (e) {
          console.warn('imposto não lançado', e);
        }
      }
      // 3) leads parados viram contato para hoje
      const t = today();
      for (const l0 of p.parados) {
        const l = Store.get('leads', l0.id);
        if (!l || !Calc.leadParado(l, cfg().auto.diasParado, t)) continue;
        const d = Calc.diasNaEtapa(l);
        const agoraIso = nowISO();
        try {
          await Store.patch('leads', l.id, {
            proximoContato: t,
            proximaAcao: `Retomar o contato (parado há ${d} dias)`,
            paradoAviso: t,
            historico: [...(l.historico || []), { tipo: 'auto', texto: `Parado há ${d} dias em ${ETAPA[l.etapa].l.toLowerCase()}: contato agendado para hoje`, data: agoraIso, autor: null }],
          });
          feito.parados.push({ l, d });
        } catch (e) {
          console.warn('lead parado não reagendado', l.id, e);
          break;
        }
      }
      // estado e histórico
      const algo = feito.rec.length || feito.imp || feito.parados.length;
      if (algo || p.imposto) {
        for (const [k, v] of Object.entries(est.feitos)) if (daysBetween(String(v).slice(0, 10), t) > 400) delete est.feitos[k];
        est.ultimaRodada = nowISO();
        est.por = S.me || null;
        try { await Store.gravarEstado(est); } catch (e) { console.warn('estado do piloto não salvo', e); }
      }
      if (feito.rec.length) Store.logAuto({ tipo: 'recorrencias', txt: `Lançou ${plural(feito.rec.length, 'recorrência', 'recorrências')} de ${MESES[+m.slice(5, 7) - 1]} no caixa: ${feito.rec.map((r) => r.descricao).slice(0, 4).join(', ')}${feito.rec.length > 4 ? '…' : ''}`, ref: 'fin:recorrencias' });
      if (feito.imp) Store.logAuto({ tipo: 'imposto', txt: feito.imp.ajustado ? `Atualizou o ${feito.imp.descricao} para ${money(feito.imp.valor)}` : `Lançou o ${feito.imp.descricao}: ${money(feito.imp.valor)}, vence dia ${cfg().auto.impostoDia}`, ref: `lanc:${feito.imp.id}` });
      for (const { l, d } of feito.parados) Store.logAuto({ tipo: 'parado', txt: `${l.empresa} estava parado há ${d} dias: contato agendado para hoje com ${socioNome(l.responsavel)}`, ref: `lead:${l.id}` });
      const partes = [];
      if (feito.rec.length) partes.push(`${plural(feito.rec.length, 'recorrência lançada', 'recorrências lançadas')} no caixa`);
      if (feito.imp) partes.push(feito.imp.ajustado ? 'DAS atualizado' : 'DAS do mês lançado');
      if (feito.parados.length) partes.push(`${plural(feito.parados.length, 'lead parado voltou', 'leads parados voltaram')} para a agenda`);
      if (partes.length) {
        Auto.feitas += partes.length;
        toast(`Piloto automático: ${partes.join(', ')}.`, { action: 'Ver', ms: 6000, onAction: () => go('piloto') });
      }
    } finally {
      Auto.rodando = false;
    }
  },
  iniciar() {
    // primeira rodada logo depois que os dados chegam; depois a cada 5 minutos, ao voltar para a aba e na virada do dia
    let primeira = true;
    Store.subscribe(() => {
      if (primeira && Auto.pronto()) {
        primeira = false;
        Auto.estadoNovo = S.mode === 'cloud';
        Auto.agendar(1200);
      }
    });
    setInterval(() => Auto.agendar(300), 5 * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Auto.agendar(800); });
  },
};

/* ── lead a partir de uma mensagem colada ── */
const PROVEDORES = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|bol|uol|terra|ig|globo|r7|proton|protonmail|zoho|aol)\./i;
function lerMensagem(txt) {
  const t = String(txt || '').replace(/\r/g, '').trim();
  const out = { campos: [] };
  if (!t) return out;
  const put = (k, v) => {
    const s = String(v || '').trim().replace(/^[\s"'“”*_-]+|[\s"'“”*_,.;:!-]+$/g, '');
    if (s && !out[k]) { out[k] = s; out.campos.push(k); }
  };
  const kv = (re) => { const m = t.match(re); return m ? m[1] : ''; };
  // formulário do site ou e-mail com "Campo: valor"
  let form = 0;
  const fk = (k, re) => { const v = kv(re); if (v) { form++; put(k, v); } };
  fk('empresa', /^\s*\**(?:empresa|company|nome da empresa|neg[óo]cio|raz[ãa]o social|loja|marca)\**\s*[:=]\s*(.+)$/im);
  fk('contato', /^\s*\**(?:nome(?: completo)?|seu nome|name|contato|respons[áa]vel)\**\s*[:=]\s*(.+)$/im);
  fk('email', /^\s*\**e-?mail\**\s*[:=]\s*(\S+@\S+)/im);
  fk('telefone', /^\s*\**(?:telefone|celular|whats(?:app)?|fone|tel)\**\s*[:=]\s*([+\d()\s.-]{8,})$/im);
  fk('cidade', /^\s*\**(?:cidade|localiza[çc][ãa]o)\**\s*[:=]\s*(.+)$/im);
  fk('segmento', /^\s*\**(?:segmento|ramo|setor|[áa]rea de atua[çc][ãa]o)\**\s*[:=]\s*(.+)$/im);
  fk('site', /^\s*\**(?:site|website|instagram|insta)\**\s*[:=]\s*(\S+)/im);
  // conversa exportada ou copiada do WhatsApp: "[16/11/2026 10:32] João Silva: ..." ou "16/11/2026 10:32 - João Silva: ..."
  const wa = t.match(/^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:-\s*)?([^:\n]{2,40}):/m);
  if (wa && !/^\+?\d[\d\s()-]+$/.test(wa[1].trim())) put('contato', wa[1]);
  // frases soltas
  const nomeRe = '([A-ZÀ-Ý][a-zà-ÿ]+(?:\\s+[A-ZÀ-Ý][a-zà-ÿ]+)?)';
  const apres = '(?:[Mm]eu nome [ée]\\s+|[Mm]e chamo\\s+|[Aa]qui [ée]\\s+(?:o\\s+|a\\s+)?|[Ss]ou\\s+(?:o|a)\\s+)';
  put('contato', kv(new RegExp('\\b' + apres + nomeRe)));
  const pal = "[A-ZÀ-Ý0-9][\\wÀ-ÿ&'’-]*(?:\\.[\\wÀ-ÿ]+)*";
  const empRe = '(' + pal + '(?:\\s+(?:d[aeo]s?\\s+|&\\s+)?' + pal + '){0,3})';
  put('empresa', kv(new RegExp('\\b(?:da empresa|na empresa|a empresa|empresa)\\s+' + empRe)));
  put('empresa', kv(new RegExp('\\b' + apres + '[A-ZÀ-Ý][a-zà-ÿ]+(?:\\s+[A-ZÀ-Ý][a-zà-ÿ]+)?,?\\s+d[aoe]\\s+' + empRe)));
  const cargoM = t.match(new RegExp('\\b([Dd]on[oa]|[Pp]ropriet[áa]ri[oa]|[Gg]erente|[Ss][óo]ci[oa]|[Dd]iretora?|[Cc]oordenadora?|[Rr]espons[áa]vel)\\s+d[aoe]\\s+' + empRe));
  if (cargoM) { put('cargo', cap(cargoM[1].toLowerCase())); put('empresa', cargoM[2]); }
  put('empresa', kv(new RegExp('\\b(?:[Ss]ou d[aoe]|[Tt]rabalho n[ao]|[Rr]epresento [ao]|[Ff]alo d[aoe]|[Tt]enho (?:um|uma) [a-zà-ÿ]+ chamad[ao])\\s+' + empRe)));
  // contatos em qualquer lugar do texto
  const em = t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (em) put('email', em[0].toLowerCase());
  const semEmail = em ? t.replace(em[0], ' ') : t;
  const tels = semEmail.match(/(?:\+?55[\s.-]*)?\(?\b[1-9]\d\)?[\s.-]*(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}\b/g) || [];
  const tel = tels.find((x) => { const d = digits(x).replace(/^55(?=\d{10,11}$)/, ''); return d.length === 10 || d.length === 11; });
  if (tel) put('telefone', tel);
  const ig = semEmail.match(/(?:^|[\s(])@([A-Za-z0-9_.]{3,30})\b/);
  const url = semEmail.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com\.br|com|net\.br|net|org\.br|org|br|io|app|site|store|online|shop|dev)(?:\/[^\s)]*)?/i);
  if (url && !/wa\.me|whatsapp\.com/i.test(url[0])) put('site', url[0]);
  else if (ig) put('site', '@' + ig[1]);
  // empresa pelo domínio do e-mail, quando não é um e-mail pessoal
  if (!out.empresa && em) {
    const dom = em[0].split('@')[1];
    if (!PROVEDORES.test(dom)) {
      const base = dom.split('.')[0].replace(/[-_]+/g, ' ');
      if (base.length > 2) { put('empresa', base.replace(/\b\w/g, (c) => c.toUpperCase())); out.empresaPalpite = true; }
    }
  }
  // interesse
  const n = norm(t);
  const serv = [];
  if (/\b(site|sites|landing ?page|pagina|loja virtual|e-?commerce|portfolio|hotsite|blog)\b/.test(n)) serv.push('site');
  if (/\b(automacao|automacoes|automatizar|automatizado|automatica|automatico|chat ?bot|bot|robo|integracao|integrar|n8n|zapier|disparo)\b/.test(n)) serv.push('automacao');
  if (/\b(sistema|sistemas|software|aplicativo|app|plataforma|erp|crm|portal|painel|dashboard)\b/.test(n)) serv.push('sistema');
  if (serv.length) { out.servicos = serv; out.campos.push('servicos'); }
  // valor
  let valor = NaN;
  const vr = t.match(/R\$\s*([\d.]+(?:,\d{1,2})?)(\s*mil\b)?/i);
  if (vr) valor = parseMoney(vr[1]) * (vr[2] ? 1000 : 1);
  if (isNaN(valor)) {
    const vm = n.match(/\b(\d+(?:[.,]\d+)?)\s*mil\b/);
    if (vm) valor = parseFloat(vm[1].replace(',', '.')) * 1000;
  }
  if (isNaN(valor)) {
    const vo = n.match(/orcamento[^\d\n]{0,25}(\d[\d.,]{2,})/);
    if (vo) valor = parseMoney(vo[1]);
  }
  if (valor > 0 && valor < 10000000) { out.valor = round2(valor); out.campos.push('valor'); }
  // origem
  const origens = cfg().origens;
  const tem = (o) => origens.find((x) => norm(x) === norm(o));
  if (wa && tem('WhatsApp')) out.origem = tem('WhatsApp');
  else if (form >= 2 && tem('Site da Prisma')) out.origem = tem('Site da Prisma');
  else if (/\bindica(cao|do|da|ou)\b/.test(n) && tem('Indicação')) out.origem = tem('Indicação');
  else if (/\binstagram|\binsta\b|\bdirect\b/.test(n) && tem('Instagram')) out.origem = tem('Instagram');
  else if (/\blinkedin\b/.test(n) && tem('LinkedIn')) out.origem = tem('LinkedIn');
  else if (/\bgoogle\b/.test(n) && tem('Google')) out.origem = tem('Google');
  if (out.origem) out.campos.push('origem');
  out.notas = t.slice(0, 2000);
  return out;
}
const CAMPO_NOME = { empresa: 'empresa', contato: 'contato', cargo: 'cargo', telefone: 'telefone', email: 'e-mail', cidade: 'cidade', segmento: 'segmento', site: 'site', servicos: 'interesse', valor: 'valor', origem: 'origem' };
function aplicarMensagem(el, fid, dados) {
  const preenchidos = [];
  const setv = (k, v) => {
    const inp = fieldEl(el, fid, k);
    if (!inp || v === undefined || v === null || v === '') return;
    if (inp.value && inp.value.trim() && k !== 'notas') return;
    inp.value = k === 'valor' ? moneyInputValue(v) : v;
    const wrap = inp.closest('.field');
    if (wrap) { wrap.classList.remove('filled'); void wrap.offsetWidth; wrap.classList.add('filled'); }
    if (k !== 'notas') preenchidos.push(CAMPO_NOME[k] || k);
  };
  ['empresa', 'contato', 'telefone', 'email', 'cidade', 'segmento', 'site', 'valor'].forEach((k) => setv(k, dados[k]));
  if (dados.origem) {
    const sel = fieldEl(el, fid, 'origem');
    if (sel && !sel.value) { sel.value = dados.origem; preenchidos.push('origem'); }
  }
  if (dados.servicos && dados.servicos.length) {
    const box = fieldEl(el, fid, 'servicos');
    if (box && !$('.chip[aria-pressed="true"]', box)) {
      dados.servicos.forEach((k) => { const c = $(`.chip[data-v="${k}"]`, box); if (c) c.setAttribute('aria-pressed', 'true'); });
      preenchidos.push('interesse');
    }
  }
  const notas = fieldEl(el, fid, 'notas');
  if (notas && dados.notas && !notas.value.includes(dados.notas.slice(0, 40))) notas.value = (notas.value ? notas.value + '\n\n' : '') + `Mensagem recebida:\n${dados.notas}`;
  if (dados.cargo) setv('cargo', dados.cargo);
  const grid = $('.form-grid', el);
  if (grid && !grid.classList.contains('show-more') && (['email', 'cidade', 'segmento', 'site', 'cargo', 'notas'].some((k) => dados[k]))) {
    grid.classList.add('show-more');
    const b = $('[data-more-toggle]', el);
    if (b) { b.setAttribute('aria-expanded', 'true'); $('span', b).textContent = 'Menos detalhes'; }
  }
  if (grid) grid.dispatchEvent(new Event('input', { bubbles: true }));
  return preenchidos;
}
function colarHTML(fid, aberto) {
  return `<div class="paste${aberto ? ' open' : ''}">
    <button type="button" class="paste-t" data-paste-toggle aria-expanded="${aberto}" aria-controls="${fid}_pastebox">${ic('paste')}<span><b>Colar a mensagem do cliente</b><small>WhatsApp, e-mail ou formulário do site: o CRM preenche o que encontrar</small></span>${ic('right', 'paste-chev')}</button>
    <div class="paste-b" id="${fid}_pastebox"${aberto ? '' : ' hidden'}>
      <textarea id="${fid}_msg" rows="5" placeholder="Cole aqui a mensagem que chegou. Ex.: Oi, sou a Marina da Clínica Sorriso, queria um orçamento de site. Meu WhatsApp é (11) 98888-7777"></textarea>
      <div class="paste-f"><span class="small" id="${fid}_msgres" aria-live="polite"></span><button type="button" class="btn btn-sm btn-primary" data-paste-go>Preencher o formulário</button></div>
    </div>
  </div>`;
}
function bindColar(el, fid) {
  const box = $(`#${fid}_pastebox`, el);
  if (!box) return;
  const tg = $('[data-paste-toggle]', el);
  const ta = $(`#${fid}_msg`, el);
  const res = $(`#${fid}_msgres`, el);
  tg.addEventListener('click', () => {
    const abrir = box.hidden;
    box.hidden = !abrir;
    tg.setAttribute('aria-expanded', String(abrir));
    tg.parentElement.classList.toggle('open', abrir);
    if (abrir) ta.focus();
  });
  const go = () => {
    const dados = lerMensagem(ta.value);
    if (!ta.value.trim()) { ta.focus(); res.textContent = 'Cole a mensagem primeiro.'; res.className = 'small warn-text'; return; }
    const ok = aplicarMensagem(el, fid, dados);
    const falta = [];
    if (!fieldEl(el, fid, 'empresa').value.trim()) falta.push('o nome da empresa');
    res.className = 'small';
    res.textContent = ok.length ? `Preenchido: ${ok.join(', ')}.${dados.empresaPalpite ? ' A empresa veio do e-mail; confira.' : ''}${falta.length ? ` Falta ${falta.join(' e ')}.` : ' Confira e salve.'}` : `Não encontrei dados para preencher. A mensagem foi para as observações.${falta.length ? ` Falta ${falta.join(' e ')}.` : ''}`;
    if (falta.length) fieldEl(el, fid, 'empresa').focus();
  };
  $('[data-paste-go]', el).addEventListener('click', go);
  ta.addEventListener('paste', () => setTimeout(go, 30));
}
