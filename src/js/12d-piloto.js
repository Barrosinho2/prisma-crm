/* ───────────────────────── PILOTO AUTOMÁTICO: página ───────────────────────── */
const PILOTO = {
  followupEtapa: { ic: 'clock', t: 'Próximo contato a cada etapa', d: () => 'Quando um lead muda de etapa, o CRM agenda o próximo contato e anota o que fazer. Contato já marcado para depois de hoje é mantido.', toggle: true, ajustes: 'etapas', log: ['followup'] },
  leadParado: { ic: 'alert', t: 'Lead parado volta para a agenda', d: (A) => `Quando um lead passa ${A.diasParado} dias na mesma etapa sem próximo contato, o CRM agenda um contato para hoje com o responsável.`, toggle: true, ajustes: 'parado', log: ['parado'] },
  mensagens: { ic: 'whatsapp', t: 'Mensagens prontas', d: () => 'Nos leads, nas cobranças e nos projetos entregues aparecem botões que abrem o WhatsApp ou o Gmail com o texto já escrito.', fixo: 'Sempre ligada', acao: { l: 'Editar as mensagens', ic: 'edit', fn: () => { const m = $('#pl_msgs'); if (m) m.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); } } },
  conversas: { ic: 'chat', t: 'Leads das conversas do WhatsApp', d: () => 'Exporte as conversas do WhatsApp e solte aqui: o Claude lê cada uma e preenche empresa, contato, interesse, valor, etapa, próximo passo e o resumo do que foi falado. Lead que já existe é atualizado; você confere antes de salvar.', fixo: 'Ferramenta', acao: { l: 'Importar conversas', ic: 'chat', fn: () => abrirConversas(), write: true }, log: ['conversas'] },
  captura: { ic: 'paste', t: 'Lead a partir de uma mensagem', d: () => 'Cole a mensagem que chegou no WhatsApp, no e-mail ou no formulário do site: o CRM preenche empresa, contato, telefone, interesse e valor.', fixo: 'Ferramenta', acao: { l: 'Experimentar', ic: 'paste', fn: () => editLead(null, {}, { colar: true }), write: true } },
  checklistVenda: { ic: 'check', t: 'Tarefas do projeto ao fechar a venda', d: () => 'Quando uma venda é registrada, o CRM cria as tarefas do projeto na agenda de quem executa, com prazos distribuídos até a entrega.', toggle: true, ajustes: 'checklist', log: ['checklist'] },
  posEntrega: { ic: 'trophy', t: 'Pós-venda na entrega', d: () => 'Quando um projeto vira Entregue, o CRM cria as tarefas de pedir depoimento e indicação, oferecer manutenção (se o cliente ainda não tem) e cobrar o saldo em aberto.', toggle: true, log: ['posEntrega'] },
  recorrencias: { ic: 'repeat', t: 'Recorrências entram sozinhas no caixa', d: () => 'No começo de cada mês, despesas fixas e mensalidades entram no caixa em aberto, cada uma com o seu vencimento. Excluir um desses lançamentos pula só aquele mês.', toggle: true, log: ['recorrencias'] },
  notaFiscal: { ic: 'note', t: 'Nota fiscal a cada recebimento', d: (A) => `Quando um pagamento de cliente é marcado como recebido, o CRM cria a tarefa de emitir a nota fiscal para ${socioNome(A.nfResponsavel)}.`, toggle: true, ajustes: 'nf', log: ['notaFiscal'] },
  lembreteCobranca: { ic: 'bell', t: 'Lembrete de cobrança', d: (A) => `${A.diasCobranca === 1 ? 'Um dia' : `${A.diasCobranca} dias`} antes do vencimento, a parcela aparece em Precisa de atenção com o lembrete pronto para mandar ao cliente pelo WhatsApp.`, toggle: true, ajustes: 'cobranca' },
  imposto: { ic: 'financeiro', t: 'Imposto do mês (DAS)', d: (A) => (A.imposto === 'off' ? 'Escolha o regime da Prisma e o CRM lança o DAS todo começo de mês, com o vencimento no dia que você definir.' : A.imposto === 'simples' ? `No começo do mês, o CRM lança o DAS do mês anterior: ${fmtNum(A.impostoPct, 2)}% sobre o que entrou, com vencimento no dia ${A.impostoDia}.` : `No começo do mês, o CRM lança o DAS MEI de ${money(A.impostoValor)}, com vencimento no dia ${A.impostoDia}.`), modo: true, ajustes: 'imposto', log: ['imposto'] },
  extrato: { ic: 'bank', t: 'Baixa pelo extrato do banco', d: () => 'Importe o arquivo OFX ou CSV do banco: o CRM encontra as parcelas e contas de mesmo valor e marca como pagas na data em que o dinheiro entrou ou saiu.', fixo: 'Ferramenta', extrato: true, log: ['extrato'] },
  resumo: { ic: 'phone', t: 'Resumo da manhã no celular', d: () => 'Nos dias úteis, às 7h37, o Claude lê o CRM e manda uma notificação com os contatos, as tarefas e as contas do dia. Para mudar o horário ou desligar, peça ao Claude.', fixo: 'Na nuvem' },
  servidor: { ic: 'server', t: 'Lead do site, WhatsApp e nota sem clique', d: () => 'Receber leads do formulário do site sozinho, enviar mensagens sem abrir o WhatsApp e emitir a nota direto na prefeitura precisam de um servidor ligado às APIs desses serviços. Dá para montar à parte.', fixo: 'Precisa de servidor' },
};
const PILOTO_GRUPOS = [
  { t: 'Vendas', d: 'Funil e conversas com leads', itens: ['conversas', 'captura', 'followupEtapa', 'leadParado', 'mensagens'] },
  { t: 'Projetos', d: 'Do fechamento à entrega', itens: ['checklistVenda', 'posEntrega'] },
  { t: 'Financeiro', d: 'Caixa, cobranças e impostos', itens: ['recorrencias', 'notaFiscal', 'lembreteCobranca', 'imposto', 'extrato'] },
  { t: 'Fora do CRM', d: 'O que roda na nuvem ou precisa de mais estrutura', itens: ['resumo', 'servidor'] },
];
const LOG_IC = { conversas: 'chat', recorrencias: 'repeat', imposto: 'financeiro', parado: 'alert', followup: 'clock', checklist: 'check', posEntrega: 'trophy', notaFiscal: 'note', extrato: 'bank', cobranca: 'bell' };
const AUTO_TOGGLES = ['followupEtapa', 'leadParado', 'checklistVenda', 'posEntrega', 'recorrencias', 'notaFiscal', 'lembreteCobranca'];
const autoLigadas = () => AUTO_TOGGLES.filter((k) => cfg().auto[k]).length + (cfg().auto.imposto !== 'off' ? 1 : 0);

function abrirRef(ref) {
  const [tipo, id] = String(ref || '').split(':');
  if (tipo === 'lead') showLead(id);
  else if (tipo === 'projeto') showProjeto(id);
  else if (tipo === 'tarefa') editTarefa(id);
  else if (tipo === 'lanc') editLancamento(id);
  else if (tipo === 'fin') { Fin.tab = id || 'mes'; go('financeiro'); }
}
async function salvarAuto(patch, msg = 'Piloto automático atualizado.') {
  const next = clone(S.config);
  next.auto = Object.assign({}, next.auto, patch);
  await Store.saveConfig(next);
  if (msg) toast(msg);
  Auto.agendar(1200);
}
function switchHTML(k, on, label) {
  return `<button type="button" role="switch" class="switch" data-sw="${k}" aria-checked="${on}" aria-label="${esc(label)}"${S.readOnly ? ' disabled' : ''}><span class="sw-track" aria-hidden="true"><span class="sw-thumb"></span></span><span class="sw-l">${on ? 'Ligada' : 'Desligada'}</span></button>`;
}

const Piloto = {
  dirty: false,
  builtFrom: '',
  ck: null,
  mount(root) {
    root.innerHTML = `<div class="vhead"><div><h1>Piloto automático</h1><p class="vsub">O que o CRM faz sozinho por vocês. Ligue, desligue e ajuste cada automação.</p></div></div><div class="vbody" id="pl_body"></div>`;
    Piloto.dirty = false;
    Piloto.builtFrom = '';
    try { localStorage.setItem('prisma-crm-piloto-visto', '1'); } catch {}
  },
  render() {
    const body = $('#pl_body');
    if (!body) return;
    if (!dadosProntos()) { body.innerHTML = skeleton(); return; }
    const sig = JSON.stringify([S.config.auto, S.config.msgs, S.config.pix, S.config.socios, S.readOnly]);
    if (!Piloto.dirty && sig !== Piloto.builtFrom) Piloto.build(body);
    Piloto.renderVivo();
  },
  marcar(form) {
    Piloto.dirty = true;
    const b = $(`[data-aj-save="${form}"]`);
    if (b) b.disabled = false;
  },
  ajustesHTML(k, A) {
    if (k === 'etapas') {
      return `<div class="et-ed">${ABERTAS.map((e, i) => `<div class="et-row"><span class="et-n"><i style="background:var(--ord-${i + 1})"></i>${esc(ETAPA[e].l)}</span><label class="et-d"><input type="number" inputmode="numeric" min="0" max="60" id="pe_d_${e}" value="${A.prazosEtapa[e]}" aria-label="Dias úteis até o próximo contato em ${esc(ETAPA[e].l)}"><span>dias úteis</span></label><input id="pe_a_${e}" value="${esc(A.acoesEtapa[e])}" aria-label="O que fazer em ${esc(ETAPA[e].l)}" placeholder="O que fazer"></div>`).join('')}</div><p class="muted small">0 dias úteis agenda para hoje. Sábados e domingos são pulados.</p>`;
    }
    if (k === 'parado') return `<label class="inline-num" for="pa_d">Considerar parado depois de <input type="number" inputmode="numeric" id="pa_d" min="3" max="90" value="${A.diasParado}"> dias na mesma etapa</label>`;
    if (k === 'cobranca') return `<label class="inline-num" for="co_d">Lembrar <input type="number" inputmode="numeric" id="co_d" min="1" max="15" value="${A.diasCobranca}"> dias antes do vencimento</label>`;
    if (k === 'nf') return `<label class="inline-num" for="nf_r">Quem emite as notas <select id="nf_r">${SOCIOS.map((s) => `<option value="${s}"${A.nfResponsavel === s ? ' selected' : ''}>${esc(socioNome(s))}</option>`).join('')}</select></label>`;
    if (k === 'checklist') {
      return `<div class="ck-grid">${SERVICOS.map((s) => `<div class="ck-ed" data-ck="${s.k}"><h5>${esc(s.l)}</h5><ol class="ck-list" id="ck_l_${s.k}"></ol><div class="lista-add"><input id="ck_a_${s.k}" placeholder="Nova tarefa" aria-label="Nova tarefa para ${esc(s.l)}"><button type="button" class="btn btn-sm" data-ck-add="${s.k}">Adicionar</button></div></div>`).join('')}</div><p class="muted small">As tarefas vão para quem executa o projeto, na ordem da lista.</p>`;
    }
    if (k === 'imposto') {
      return `<div class="imp-ed">
        <div class="seg seg-sm" role="radiogroup" aria-label="Regime" id="im_m">${[['off', 'Desligado'], ['simples', 'Simples Nacional'], ['mei', 'MEI']].map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${A.imposto === v}">${l}</button>`).join('')}</div>
        <label class="inline-num" for="im_p" data-im="simples"${A.imposto === 'simples' ? '' : ' hidden'}>Alíquota efetiva <input id="im_p" inputmode="decimal" value="${esc(fmtNum(A.impostoPct, 2))}"> % sobre o que entrou no mês anterior</label>
        <label class="inline-num" for="im_v" data-im="mei"${A.imposto === 'mei' ? '' : ' hidden'}>Valor do DAS <span class="affix sm"><span>R$</span><input id="im_v" inputmode="decimal" value="${esc(moneyInputValue(A.impostoValor))}" placeholder="0,00"></span></label>
        <label class="inline-num" for="im_d" data-im="on"${A.imposto === 'off' ? ' hidden' : ''}>Vence no dia <input type="number" inputmode="numeric" id="im_d" min="1" max="28" value="${A.impostoDia}"> do mês seguinte</label>
        <p class="muted small">Confira a alíquota com o contador da Prisma. O valor se ajusta sozinho enquanto o DAS não for pago e ninguém mudar o valor à mão.</p>
      </div>`;
    }
    return '';
  },
  build(body) {
    const A = cfg().auto;
    Piloto.builtFrom = JSON.stringify([S.config.auto, S.config.msgs, S.config.pix, S.config.socios, S.readOnly]);
    Piloto.ck = clone(A.checklist);
    const card = (k) => {
      const P = PILOTO[k];
      const on = P.toggle ? !!A[k] : P.modo ? A.imposto !== 'off' : true;
      let ctl = '';
      if (P.toggle) ctl = switchHTML(k, on, P.t);
      else if (P.modo) ctl = `<span class="pl-tag${on ? ' on' : ''}" id="pl_imp_tag">${on ? (A.imposto === 'mei' ? 'MEI' : 'Simples') : 'Desligado'}</span>`;
      else ctl = `<span class="pl-tag">${esc(P.fixo)}</span>`;
      const aj = P.ajustes ? `<details class="pl-aj" data-write${P.modo && !on ? ' open' : ''}><summary>${ic('ajustes')}Ajustar</summary><div class="pl-aj-b" data-form-aj="${P.ajustes}">${Piloto.ajustesHTML(P.ajustes, A)}${P.ajustes === 'nf' ? '' : `<div class="aj-foot"><button type="button" class="btn btn-sm btn-primary" data-aj-save="${P.ajustes}" disabled>Salvar</button></div>`}</div></details>` : '';
      const act = P.acao ? `<button type="button" class="btn btn-sm" data-pl-act="${k}"${P.acao.write ? ' data-write' : ''}>${ic(P.acao.ic)}${esc(P.acao.l)}</button>` : P.extrato ? extratoBotao('btn btn-sm') : '';
      return `<article class="pl-card${on ? ' on' : ''}" id="pl_${k}" data-k="${k}">
        <div class="pl-top"><span class="pl-ic">${ic(P.ic)}</span><div class="pl-tt"><h3>${esc(P.t)}</h3><p data-pl-d>${esc(P.d(A))}</p></div><div class="pl-ctl">${ctl}</div></div>
        ${act ? `<div class="pl-act">${act}</div>` : ''}
        <p class="pl-last" data-pl-last hidden></p>
        ${aj}
      </article>`;
    };
    const msgs = cfg().msgs;
    body.innerHTML = `
      <section class="pl-hero" aria-live="polite"><span class="pl-hero-ic">${ic('plane')}</span><div class="pl-hero-t"><b id="pl_count"></b><span>As automações de calendário rodam quando um de vocês está com o CRM aberto, numa aba por vez. As de evento rodam na hora em que algo acontece.</span></div><p class="pl-hero-last" id="pl_last"></p></section>
      ${PILOTO_GRUPOS.map((g) => `<section class="pl-group"><div class="pl-gh"><h2>${esc(g.t)}</h2><p>${esc(g.d)}</p></div><div class="pl-grid">${g.itens.map(card).join('')}</div></section>`).join('')}
      <div class="grid g-11 top pl-bottom">
        <section class="panel" id="pl_msgs"><div class="panel-h"><div><h3>Mensagens prontas</h3><p class="panel-sub">O texto dos botões de WhatsApp e Gmail. O que está entre chaves é trocado pelos dados de cada cliente.</p></div></div>
          <div class="pad msg-ed">
            <div class="field" data-write><label for="pl_pix">Chave Pix da Prisma</label><input id="pl_pix" value="${esc(cfg().pix)}" placeholder="CNPJ, e-mail ou telefone" autocomplete="off"><p class="hint">Entra nas mensagens de cobrança no lugar de {pix}</p></div>
            <div class="vars" aria-label="Palavras que o CRM troca">${MSG_VARS.map(([v, l]) => `<span class="var"><b>${esc(v)}</b>${esc(l)}</span>`).join('')}</div>
            ${Object.keys(MSG_INFO).map((k) => `<div class="msg-i"><div class="msg-ih"><label for="pl_m_${k}"><b>${esc(MSG_INFO[k].l)}</b><small>${esc(MSG_INFO[k].quando)}</small></label><button type="button" class="link small" data-msg-reset="${k}" data-write>Texto original</button></div><textarea id="pl_m_${k}" rows="${Math.max(3, Math.ceil(String(msgs[k]).length / 62))}"${S.readOnly ? ' readonly' : ''}>${esc(msgs[k])}</textarea><p class="msg-prev" id="pl_mp_${k}"></p></div>`).join('')}
            <div class="aj-foot" data-write><span class="muted small" id="pl_mmsg"></span><button type="button" class="btn btn-primary" id="pl_msave" disabled>Salvar mensagens</button></div>
          </div>
        </section>
        <section class="panel" id="pl_hist"><div class="panel-h"><div><h3>O que o piloto fez</h3><p class="panel-sub">As últimas ações automáticas, dos dois sócios</p></div></div><div id="pl_log"></div></section>
      </div>`;
    Piloto.bind(body);
  },
  bind(body) {
    // liga/desliga: salva na hora
    on(body, '[data-sw]', 'click', async (e, b) => {
      if (S.readOnly) return;
      const k = b.dataset.sw;
      const novo = b.getAttribute('aria-checked') !== 'true';
      const card = b.closest('.pl-card');
      const pinta = (v) => { b.setAttribute('aria-checked', String(v)); $('.sw-l', b).textContent = v ? 'Ligada' : 'Desligada'; card.classList.toggle('on', v); };
      pinta(novo);
      try {
        await salvarAuto({ [k]: novo }, `${PILOTO[k].t}: ${novo ? 'ligada' : 'desligada'}.`);
      } catch {
        pinta(!novo);
      }
    });
    on(body, '[data-pl-act]', 'click', (e, b) => PILOTO[b.dataset.plAct].acao.fn());
    // ajustes
    $$('[data-form-aj]', body).forEach((f) => {
      const k = f.dataset.formAj;
      f.addEventListener('input', () => Piloto.marcar(k));
      f.addEventListener('change', () => Piloto.marcar(k));
    });
    const nf = $('#nf_r', body);
    if (nf) nf.addEventListener('change', async () => { try { await salvarAuto({ nfResponsavel: nf.value }, `As notas fiscais vão para ${socioNome(nf.value)}.`); Piloto.dirty = false; } catch {} });
    const im = $('#im_m', body);
    if (im) im.addEventListener('click', (e) => {
      const r = e.target.closest('[role=radio]');
      if (!r) return;
      $$('[role=radio]', im).forEach((x) => x.setAttribute('aria-checked', String(x === r)));
      const v = r.dataset.v;
      $$('[data-im]', body).forEach((x) => (x.hidden = !(x.dataset.im === v || (x.dataset.im === 'on' && v !== 'off'))));
      Piloto.marcar('imposto');
    });
    const paintCk = (s) => {
      const ol = $(`#ck_l_${s}`, body);
      if (!ol) return;
      ol.innerHTML = Piloto.ck[s].length ? Piloto.ck[s].map((x, i) => `<li><span>${esc(x)}</span><button type="button" class="icon-btn xs" data-ck-del="${s}:${i}" aria-label="Remover ${esc(x)}">${ic('close')}</button></li>`).join('') : '<li class="muted small ck-vazio">Nenhuma tarefa: vendas deste serviço não criam checklist.</li>';
      on(ol, '[data-ck-del]', 'click', (e, b) => {
        const [ss, i] = b.dataset.ckDel.split(':');
        Piloto.ck[ss].splice(+i, 1);
        Piloto.marcar('checklist');
        paintCk(ss);
      });
    };
    SERVICOS.forEach((s) => paintCk(s.k));
    const addCk = (s) => {
      const inp = $(`#ck_a_${s}`, body);
      const v = inp.value.trim();
      if (!v) return inp.focus();
      Piloto.ck[s].push(v);
      inp.value = '';
      Piloto.marcar('checklist');
      paintCk(s);
      inp.focus();
    };
    on(body, '[data-ck-add]', 'click', (e, b) => addCk(b.dataset.ckAdd));
    SERVICOS.forEach((s) => { const i = $(`#ck_a_${s.k}`, body); if (i) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCk(s.k); } }); });
    on(body, '[data-aj-save]', 'click', (e, b) =>
      busy(b, async () => {
        const k = b.dataset.ajSave;
        const A = cfg().auto;
        const num = (id, min, max, def) => { const n = Math.round(+$(id, body).value); return isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
        let patch = {};
        let msg = 'Ajuste salvo.';
        if (k === 'etapas') {
          const prazos = {};
          const acoes = {};
          ABERTAS.forEach((s) => { prazos[s] = num(`#pe_d_${s}`, 0, 60, A.prazosEtapa[s]); acoes[s] = $(`#pe_a_${s}`, body).value.trim(); });
          patch = { prazosEtapa: prazos, acoesEtapa: acoes };
          msg = 'Prazos por etapa salvos.';
        } else if (k === 'parado') {
          patch = { diasParado: num('#pa_d', 3, 90, A.diasParado) };
          msg = `Leads sem próximo contato há ${patch.diasParado} dias voltam para a agenda.`;
        } else if (k === 'cobranca') {
          patch = { diasCobranca: num('#co_d', 1, 15, A.diasCobranca) };
          msg = 'Antecedência do lembrete salva.';
        } else if (k === 'checklist') {
          patch = { checklist: clone(Piloto.ck) };
          msg = 'Tarefas do projeto salvas.';
        } else if (k === 'imposto') {
          const r = $('#im_m [aria-checked="true"]', body);
          const modo = r ? r.dataset.v : 'off';
          const pctV = parseMoney($('#im_p', body).value);
          const val = parseMoney($('#im_v', body).value);
          if (modo === 'simples' && !(pctV > 0 && pctV < 40)) { toast('Informe a alíquota em porcentagem, por exemplo 6.', { type: 'error' }); $('#im_p', body).focus(); return; }
          if (modo === 'mei' && !(val > 0)) { toast('Informe o valor do DAS MEI.', { type: 'error' }); $('#im_v', body).focus(); return; }
          patch = { imposto: modo, impostoPct: modo === 'simples' ? round2(pctV) : A.impostoPct, impostoValor: modo === 'mei' ? round2(val) : A.impostoValor, impostoDia: num('#im_d', 1, 28, A.impostoDia) };
          msg = modo === 'off' ? 'Lançamento do DAS desligado.' : 'DAS configurado. O do mês anterior entra no caixa em instantes.';
        }
        try {
          await salvarAuto(patch, msg);
          Piloto.dirty = false;
          Piloto.builtFrom = '';
          Piloto.render();
        } catch {}
      })
    );
    // mensagens
    const ctxEx = Object.assign(ctxBase(), { contato: 'Marina', empresa: 'Clínica Sorriso', servico: 'um site', projeto: 'Site da Clínica Sorriso', descricao: 'Site da Clínica Sorriso · Parcela 2/3', valor: money(1500), vencimento: 'amanhã' });
    const prev = () => {
      const pixV = $('#pl_pix', body).value.trim();
      ctxEx.pix = pixV ? `Chave Pix: ${pixV}. ` : '';
      Object.keys(MSG_INFO).forEach((k) => { const p = $(`#pl_mp_${k}`, body); if (p) p.textContent = preencher($(`#pl_m_${k}`, body).value, Object.assign({}, ctxEx, k === 'atraso' ? { vencimento: 'há 3 dias' } : {})); });
    };
    prev();
    const marcaMsg = () => { Piloto.dirty = true; $('#pl_msave', body).disabled = false; $('#pl_mmsg', body).textContent = 'Alterações não salvas'; prev(); };
    $('#pl_msgs', body).addEventListener('input', marcaMsg);
    on(body, '[data-msg-reset]', 'click', (e, b) => { $(`#pl_m_${b.dataset.msgReset}`, body).value = DEFAULT_CONFIG.msgs[b.dataset.msgReset]; marcaMsg(); });
    $('#pl_msave', body).addEventListener('click', (e) =>
      busy(e.currentTarget, async () => {
        const next = clone(S.config);
        next.pix = $('#pl_pix', body).value.trim();
        Object.keys(MSG_INFO).forEach((k) => { const v = $(`#pl_m_${k}`, body).value.trim(); next.msgs[k] = v || DEFAULT_CONFIG.msgs[k]; });
        try {
          await Store.saveConfig(next);
          Piloto.dirty = false;
          Piloto.builtFrom = '';
          toast('Mensagens salvas.');
          Piloto.render();
        } catch {}
      })
    );
  },
  renderVivo() {
    const A = cfg().auto;
    const n = autoLigadas();
    const c = $('#pl_count');
    if (c) c.textContent = `${n} de ${AUTO_TOGGLES.length + 1} automações ligadas`;
    const log = S.autoLog || [];
    const last = $('#pl_last');
    if (last) last.innerHTML = log.length ? `Última ação ${esc(relTime(log[0].em))}${log[0].por ? ' · ' + esc(socioNome(log[0].por)) : ''}` : 'Nenhuma ação automática ainda';
    // descrição e última ação de cada cartão
    for (const [k, P] of Object.entries(PILOTO)) {
      const el = $(`#pl_${k}`);
      if (!el) continue;
      const d = $('[data-pl-d]', el);
      if (d && !Piloto.dirty) d.textContent = P.d(A);
      const lp = $('[data-pl-last]', el);
      const it = P.log ? log.find((x) => P.log.includes(x.tipo)) : null;
      if (lp) {
        lp.hidden = !it;
        if (it) lp.innerHTML = `${ic('check')}<span>${esc(cap(relTime(it.em)))}: ${esc(it.txt)}</span>`;
      }
    }
    const box = $('#pl_log');
    if (!box) return;
    if (!log.length) {
      box.innerHTML = `<p class="muted pad">Nada ainda. Cada ação automática aparece aqui, com o dia e quem estava com o CRM aberto.</p>`;
      return;
    }
    let dia = '';
    const html = [];
    log.forEach((x, i) => {
      const d = String(x.em || '').slice(0, 10) ? toISODate(new Date(x.em)) : '';
      if (d !== dia) {
        dia = d;
        html.push(`<li class="lg-day">${esc(cap(relDay(d)))}</li>`);
      }
      const hm = (() => { const dt = new Date(x.em); return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`; })();
      html.push(`<li><button type="button" class="lg-i" data-lg="${i}"${x.ref ? '' : ' disabled'}><span class="lg-ic">${ic(LOG_IC[x.tipo] || 'plane')}</span><span class="lg-t"><b>${esc(x.txt)}</b><small>${hm}${x.por ? ' · com o CRM de ' + esc(socioNome(x.por)) : ''}</small></span></button></li>`);
    });
    box.innerHTML = `<ul class="lg-list">${html.join('')}</ul>`;
    on(box, '[data-lg]', 'click', (e, b) => abrirRef(log[+b.dataset.lg].ref));
  },
};
