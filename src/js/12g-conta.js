/* ── conta e acesso dos sócios (só na versão hospedada na Vercel, com login) ── */
const Host = window.PrismaHost && window.PrismaHost.tipo === 'vercel' ? window.PrismaHost : null;

const Conta = {
  membros: null,
  caixa: null,
  lidoEm: 0,
  lendo: null,
  async lerMembros(forcar) {
    if (!Host) return [];
    if (!forcar && this.membros && Date.now() - this.lidoEm < 30000) return this.membros;
    if (this.lendo) return this.lendo;
    this.lendo = (async () => {
      try {
        this.membros = await Host.membros();
        this.lidoEm = Date.now();
      } catch (e) {
        console.warn('sócios', e);
        if (!this.membros) this.membros = [];
      }
      this.lendo = null;
      return this.membros;
    })();
    return this.lendo;
  },
  ativo(socio) {
    if (!Host) return false;
    if (!this.membros) this.lerMembros().then(() => Store.emit());
    return !!(this.membros || []).find((m) => m.socio === socio && m.ativo);
  },
  dataCurta(iso) {
    return iso ? fmtDateShort(toISODate(new Date(iso))) : '';
  },
  endereco() {
    return Host.endereco.replace(/^https?:\/\//, '').replace(/\/$/, '');
  },

  renderMe(box) {
    const c = Host.conta();
    box.innerHTML = `<div class="conta">${avatar(c.socio, 'lg')}<div class="conta-id"><b>${esc(socioNome(c.socio))}</b><small>${esc(c.email)}</small></div><div class="conta-acts"><button type="button" class="btn btn-sm" data-senha>${ic('key')}Trocar senha</button><button type="button" class="btn btn-sm btn-ghost" data-sair>${ic('logout')}Sair</button></div></div><p class="muted small conta-nota">O que você registra fica no seu nome. Em outro aparelho, entre com este e-mail e a sua senha.</p>`;
    on(box, '[data-senha]', 'click', () => Conta.trocarSenha());
    on(box, '[data-sair]', 'click', () => Conta.sair());
  },

  renderAcesso(box) {
    const desenhar = (lista) => {
      const eu = Host.conta().socio;
      const linhas = SOCIOS.map((s) => {
        const m = (lista || []).find((x) => x.socio === s) || { socio: s };
        const vale = m.conviteExpira && new Date(m.conviteExpira).getTime() > Date.now();
        const status = m.ativo ? esc(m.email) : vale ? `Ainda não entrou. O código vale até ${esc(this.dataCurta(m.conviteExpira))}` : lista ? 'Ainda não entrou' : '…';
        const acao = s === eu ? '<span class="acesso-tag">Você</span>' : `<button type="button" class="btn btn-sm" data-convite="${s}" data-write>${ic('key')}${m.ativo ? 'Gerar código para senha nova' : 'Gerar código de acesso'}</button>`;
        return `<li>${avatar(s)}<div class="conta-id"><b>${esc(socioNome(s))}</b><small>${status}</small></div>${acao}</li>`;
      }).join('');
      box.innerHTML = `<p>${ic('check', 'ic-good')} Conectado ao banco do CRM. Tudo o que um sócio registra aparece para o outro em tempo real.</p><ul class="acesso-lista">${linhas}</ul><p class="muted small conta-nota">O código serve para o primeiro acesso e para criar uma senha nova quando alguém esquece. Vale uma vez, por 7 dias.</p>`;
      on(box, '[data-convite]', 'click', (e, b) => Conta.convite(b.dataset.convite));
    };
    desenhar(this.membros);
    // ao abrir a página (caixa nova), sempre busca de novo: o outro sócio pode ter acabado de entrar
    const nova = box !== this.caixa;
    this.caixa = box;
    if (nova || !this.membros || Date.now() - this.lidoEm > 30000) this.lerMembros(true).then((l) => { if (box.isConnected) desenhar(l); });
  },

  async convite(socio) {
    if (!Host) return go('ajustes');
    const nome = socioNome(socio);
    let r;
    try {
      r = await Host.gerarConvite(socio);
    } catch (e) {
      return toast(e && e.code === 'rede' ? 'Sem conexão. Confira a internet e tente de novo.' : 'Não foi possível gerar o código agora. Tente de novo em instantes.', { type: 'error' });
    }
    this.lerMembros(true).then(() => Store.emit());
    const vale = this.dataCurta(r.expira);
    const msg = `Oi, ${nome}! Seu acesso ao Prisma CRM: abra ${Host.endereco}, toque em "Usar código de acesso" e use o código ${r.codigo}. Ele vale uma vez, até ${vale}.`;
    Modal.open({
      title: `Código de acesso do ${nome}`,
      body: `<p class="modal-text">Mande para o ${esc(nome)}. Ele abre <b>${esc(this.endereco())}</b>, toca em <b>Usar código de acesso</b> e cria a senha.</p><div class="codigo-grande">${esc(r.codigo)}</div><p class="muted small">Vale uma vez, até ${esc(vale)}. Se você gerar outro, este deixa de valer.</p>`,
      actions: [
        { label: 'Fechar', kind: 'ghost' },
        { label: 'Copiar mensagem', onClick: () => copyText(msg, 'Mensagem copiada.').then(() => false) },
        { label: 'Mandar no WhatsApp', kind: 'primary', onClick: () => { window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener'); return false; } },
      ],
    });
  },

  trocarSenha() {
    Modal.open({
      title: 'Trocar senha',
      body: `<div class="conta-form">
          <div class="field"><label for="ts_1">Nova senha</label><input id="ts_1" type="password" autocomplete="new-password" minlength="8"><span class="hint">Pelo menos 8 caracteres.</span></div>
          <div class="field"><label for="ts_2">Repita a nova senha</label><input id="ts_2" type="password" autocomplete="new-password"></div>
          <p class="auth-erro" id="ts_err" role="alert" hidden></p>
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        {
          label: 'Salvar senha',
          kind: 'primary',
          onClick: async (wrap) => {
            const a = $('#ts_1', wrap).value;
            const b = $('#ts_2', wrap).value;
            const err = $('#ts_err', wrap);
            const falha = (t) => { err.textContent = t; err.hidden = false; return false; };
            if (a.length < 8) return falha('A senha precisa ter pelo menos 8 caracteres.');
            if (a !== b) return falha('As duas senhas não estão iguais.');
            try {
              await Host.trocarSenha(a);
            } catch (e) {
              const c = String((e && e.code) || '');
              if (c === 'same_password') return falha('A senha nova é igual à atual.');
              if (c === 'weak_password') return falha('Essa senha é fácil de adivinhar. Use uma mais longa, misturando letras e números.');
              if (c.includes('reauth')) return falha('Por segurança, saia e crie a senha nova com um código de acesso.');
              return falha('Não foi possível trocar a senha agora. Tente de novo em instantes.');
            }
            toast('Senha trocada.');
          },
        },
      ],
    });
  },

  sair() {
    if (Store.pendingWrites()) return toast('Espere terminar de salvar e tente de novo.', { type: 'error' });
    Modal.open({
      title: 'Sair do CRM?',
      body: '<p class="modal-text">Para entrar de novo neste aparelho, você vai precisar do seu e-mail e da senha.</p>',
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Sair', kind: 'primary', onClick: () => Host.sair() },
      ],
    });
  },
};
if (Host) Host.aoMudarConexao(() => Store.emit());
