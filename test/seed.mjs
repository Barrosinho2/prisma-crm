// Gera os dados de exemplo (marcados demo:true) relativos a 16/11/2026.
// Saída: test/seed.json (para o banco simulado) e test/ops-N.json (lotes para db_write).
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);

const T = (d, h = '10:00') => `${d}T${h}:00.000Z`;
const out = { leads: [], clientes: [], projetos: [], lancamentos: [], recorrencias: [], tarefas: [] };
const add = (col, r) => out[col].push({ ...r, demo: true });
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
const dIn = (m, d) => `${m}-${pad(Math.min(d, lastDay(m)))}`;

/* ── clientes, projetos, leads ganhos ── */
const C = [
  { id: 'cl_demo_sorriso', nome: 'Clínica Odonto Sorriso Pleno', contato: 'Dra. Camila Rocha', telefone: '(19) 90000-0101', email: 'camila@sorrisopleno.exemplo', segmento: 'Saúde', cidade: 'Campinas, SP', site: 'sorrisopleno.exemplo', origem: 'Indicação', desde: '2026-07-08' },
  { id: 'cl_demo_autopecas', nome: 'AutoPeças Rota 40', contato: 'Marcos Vieira', telefone: '(16) 90000-0202', email: 'marcos@rota40.exemplo', segmento: 'Varejo automotivo', cidade: 'Ribeirão Preto, SP', site: '', origem: 'Google', desde: '2026-07-22' },
  { id: 'cl_demo_alicerce', nome: 'Construtora Alicerce Forte', contato: 'Eng. Ricardo Lima', telefone: '(15) 90000-0303', email: 'ricardo@alicerceforte.exemplo', segmento: 'Construção civil', cidade: 'Sorocaba, SP', site: '', origem: 'Prospecção ativa', desde: '2026-08-18' },
  { id: 'cl_demo_paodeouro', nome: 'Padaria Pão de Ouro', contato: 'Antônio Mendes', telefone: '(19) 90000-0404', email: 'contato@paodeouro.exemplo', segmento: 'Alimentação', cidade: 'Campinas, SP', site: '@paodeouro.exemplo', origem: 'Instagram', desde: '2026-09-08' },
  { id: 'cl_demo_mendes', nome: 'Mendes & Associados Advocacia', contato: 'Dr. Paulo Mendes', telefone: '(11) 90000-0505', email: 'paulo@mendesassociados.exemplo', segmento: 'Jurídico', cidade: 'São Paulo, SP', site: '', origem: 'LinkedIn', desde: '2026-10-06' },
  { id: 'cl_demo_bella', nome: 'Studio Bella Estética', contato: 'Juliana Prado', telefone: '(19) 90000-0606', email: 'juliana@studiobella.exemplo', segmento: 'Beleza e estética', cidade: 'Valinhos, SP', site: '@studiobella.exemplo', origem: 'Instagram', desde: '2026-11-10' },
];
const P = [
  { id: 'pj_demo_sorriso', cli: 0, titulo: 'Site institucional', servico: 'site', valor: 3800, fech: '2026-07-08', prazo: '2026-08-05', status: 'entregue', entregueEm: '2026-08-04', pg: 'metade', lead: { id: 'ld_demo_sorriso', criado: '2026-06-24', srv: ['site'] } },
  { id: 'pj_demo_autopecas', cli: 1, titulo: 'Catálogo online de peças', servico: 'site', valor: 3200, fech: '2026-07-22', prazo: '2026-08-20', status: 'entregue', entregueEm: '2026-08-19', pg: 'avista', lead: { id: 'ld_demo_autopecas', criado: '2026-07-10', srv: ['site'] } },
  { id: 'pj_demo_alicerce', cli: 2, titulo: 'Sistema de gestão de obras', servico: 'sistema', valor: 14500, fech: '2026-08-18', prazo: '2026-12-15', status: 'desenvolvimento', pg: 'entrada_parcelas', lead: { id: 'ld_demo_alicerce', criado: '2026-07-15', srv: ['sistema'] } },
  { id: 'pj_demo_paodeouro', cli: 3, titulo: 'Pedidos automáticos pelo WhatsApp', servico: 'automacao', valor: 2400, fech: '2026-09-08', prazo: '2026-10-01', status: 'entregue', entregueEm: '2026-10-01', pg: 'metade', lead: { id: 'ld_demo_paodeouro', criado: '2026-08-25', srv: ['automacao'] } },
  { id: 'pj_demo_mendes', cli: 4, titulo: 'Landing page e captação automática', servico: 'site', valor: 4200, fech: '2026-10-06', prazo: '2026-11-14', status: 'revisao', pg: 'metade', lead: { id: 'ld_demo_mendes', criado: '2026-09-15', srv: ['site', 'automacao'] } },
  { id: 'pj_demo_bella', cli: 5, titulo: 'Site com agendamento online', servico: 'site', valor: 5600, fech: '2026-11-10', prazo: '2026-12-20', status: 'planejamento', pg: 'metade', lead: { id: 'ld_demo_bella', criado: '2026-10-27', srv: ['site', 'sistema'] } },
];
C.forEach((c, i) => add('clientes', { ...c, documento: '', leadId: P[i].lead.id, notas: '', criadoEm: T(c.desde), criadoPor: 'pedro' }));
P.forEach((p) => {
  const c = C[p.cli];
  add('projetos', {
    id: p.id, titulo: p.titulo, clienteId: c.id, servico: p.servico, valor: p.valor, dataFechamento: p.fech, prazo: p.prazo, status: p.status,
    ...(p.entregueEm ? { entregueEm: p.entregueEm } : {}),
    vendedor: 'pedro', executor: 'rafael', leadId: p.lead.id, pagamento: { tipo: p.pg, entradaPct: p.pg === 'entrada_parcelas' ? 40 : 50, parcelas: 3, forma: 'Pix' }, notas: '', criadoEm: T(p.fech, '15:00'), criadoPor: 'pedro',
  });
  add('leads', {
    id: p.lead.id, empresa: c.nome, contato: c.contato, cargo: '', telefone: c.telefone, email: c.email, segmento: c.segmento, cidade: c.cidade, site: c.site, origem: c.origem,
    servicos: p.lead.srv, valor: p.valor, etapa: 'ganho', responsavel: 'pedro', proximoContato: '', proximaAcao: '', notas: '',
    criadoEm: T(p.lead.criado, '13:20'), atualizadoEm: T(p.fech, '15:00'), etapaDesde: p.fech, fechadoEm: p.fech, clienteId: c.id, projetoId: p.id, criadoPor: 'pedro',
    historico: [
      { tipo: 'criado', texto: 'Lead criado', data: T(p.lead.criado, '13:20'), autor: 'pedro' },
      { tipo: 'reuniao', texto: 'Reunião de diagnóstico: entendemos o processo atual e o que precisa mudar.', data: T(p.lead.criado, '17:00'), autor: 'rafael' },
      { tipo: 'proposta', texto: 'Proposta enviada.', data: T(p.fech, '09:00'), autor: 'pedro' },
      { tipo: 'ganho', texto: `Venda fechada: ${p.titulo}`, data: T(p.fech, '15:00'), autor: 'pedro' },
    ],
  });
});

/* ── parcelas dos projetos ── */
let seq = 0;
const lanc = (o) => add('lancamentos', { id: `lc_demo_${String(++seq).padStart(3, '0')}`, notas: '', forma: 'Pix', clienteId: null, projetoId: null, criadoEm: T(o.vencimento, '08:00'), criadoPor: 'rafael', ...o });
const parc = (pi, label, valor, venc, pago) => lanc({ tipo: 'entrada', descricao: `${P[pi].titulo} · ${label}`, valor, categoria: 'Projetos', vencimento: venc, pagoEm: pago || null, clienteId: C[P[pi].cli].id, projetoId: P[pi].id });
parc(0, 'Entrada', 1900, '2026-07-08', '2026-07-08');
parc(0, 'Saldo na entrega', 1900, '2026-08-05', '2026-08-05');
parc(1, 'Pagamento à vista', 3200, '2026-07-22', '2026-07-23');
parc(2, 'Entrada', 5800, '2026-08-20', '2026-08-20');
parc(2, 'Parcela 1/3', 2900, '2026-09-20', '2026-09-22');
parc(2, 'Parcela 2/3', 2900, '2026-10-20', '2026-10-20');
parc(2, 'Parcela 3/3', 2900, '2026-11-20', null);
parc(3, 'Entrada', 1200, '2026-09-08', '2026-09-09');
parc(3, 'Saldo na entrega', 1200, '2026-10-02', '2026-10-02');
parc(4, 'Entrada', 2100, '2026-10-07', '2026-10-07');
parc(4, 'Saldo na entrega', 2100, '2026-11-21', null);
parc(5, 'Entrada', 2800, '2026-11-11', '2026-11-11');
parc(5, 'Saldo na entrega', 2800, '2026-12-20', null);

/* ── recorrências ── */
const R = [
  { id: 'rc_demo_hosp', tipo: 'saida', descricao: 'Hospedagem VPS', valor: 89, categoria: 'Hospedagem & domínios', dia: 5, inicio: '2026-07', forma: 'Cartão' },
  { id: 'rc_demo_workspace', tipo: 'saida', descricao: 'Google Workspace', valor: 35, categoria: 'Ferramentas & softwares', dia: 8, inicio: '2026-07', forma: 'Cartão' },
  { id: 'rc_demo_contab', tipo: 'saida', descricao: 'Contabilidade', valor: 300, categoria: 'Contabilidade', dia: 10, inicio: '2026-08', forma: 'Boleto' },
  { id: 'rc_demo_figma', tipo: 'saida', descricao: 'Figma', valor: 85, categoria: 'Ferramentas & softwares', dia: 12, inicio: '2026-07', forma: 'Cartão' },
  { id: 'rc_demo_adobe', tipo: 'saida', descricao: 'Adobe Creative Cloud', valor: 124, categoria: 'Ferramentas & softwares', dia: 15, inicio: '2026-07', forma: 'Cartão' },
  { id: 'rc_demo_ia', tipo: 'saida', descricao: 'Assinatura de IA', valor: 110, categoria: 'Ferramentas & softwares', dia: 18, inicio: '2026-07', forma: 'Cartão' },
  { id: 'rc_demo_internet', tipo: 'saida', descricao: 'Internet fibra', valor: 120, categoria: 'Escritório & internet', dia: 20, inicio: '2026-07', forma: 'Boleto' },
  { id: 'rc_demo_dominios', tipo: 'saida', descricao: 'Renovação de domínios', valor: 120, categoria: 'Hospedagem & domínios', dia: 3, inicio: '2026-07', forma: 'Pix', frequencia: 'anual', mesAnual: 7 },
  { id: 'rc_demo_manut_sorriso', tipo: 'entrada', descricao: 'Manutenção — Sorriso Pleno', valor: 150, categoria: 'Manutenção & mensalidades', dia: 10, inicio: '2026-09', forma: 'Pix', clienteId: 'cl_demo_sorriso', projetoId: 'pj_demo_sorriso' },
  { id: 'rc_demo_suporte_pao', tipo: 'entrada', descricao: 'Suporte da automação — Pão de Ouro', valor: 120, categoria: 'Manutenção & mensalidades', dia: 15, inicio: '2026-10', forma: 'Pix', clienteId: 'cl_demo_paodeouro', projetoId: 'pj_demo_paodeouro' },
];
R.forEach((r) => add('recorrencias', { frequencia: 'mensal', mesAnual: null, fim: '', ativo: true, clienteId: null, projetoId: null, criadoEm: T(r.inicio + '-01'), criadoPor: 'rafael', ...r }));

// lançamentos gerados pelas recorrências (novembro: internet e suporte do Pão de Ouro ficam por lançar)
const meses = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const naoLancarNov = new Set(['rc_demo_internet', 'rc_demo_suporte_pao']);
const pagoAte = '2026-11-16';
for (const m of meses) {
  for (const r of R) {
    if (m < r.inicio) continue;
    if (r.frequencia === 'anual' && +m.slice(5) !== r.mesAnual) continue;
    if (m === '2026-11' && naoLancarNov.has(r.id)) continue;
    const venc = dIn(m, r.dia);
    let pago = venc <= pagoAte ? venc : null;
    if (r.id === 'rc_demo_manut_sorriso' && m === '2026-11') pago = null; // atrasado de propósito
    if (r.id === 'rc_demo_manut_sorriso' && m === '2026-09') pago = '2026-09-11';
    add('lancamentos', { id: `rec_${r.id}_${m}`, tipo: r.tipo, descricao: r.descricao, valor: r.valor, categoria: r.categoria, vencimento: venc, pagoEm: pago, forma: r.forma, clienteId: r.clienteId || null, projetoId: r.projetoId || null, recorrenciaId: r.id, competencia: m, notas: '', criadoEm: T(m + '-01', '08:00'), criadoPor: 'rafael' });
  }
}

/* ── despesas variáveis ── */
const desp = (descricao, valor, categoria, venc, pago, extra = {}) => lanc({ tipo: 'saida', descricao, valor, categoria, vencimento: venc, pagoEm: pago, ...extra });
desp('DAS Simples Nacional (julho)', 306, 'Impostos & taxas', '2026-08-20', '2026-08-20', { forma: 'Boleto' });
desp('DAS Simples Nacional (agosto)', 462, 'Impostos & taxas', '2026-09-20', '2026-09-19', { forma: 'Boleto' });
desp('DAS Simples Nacional (setembro)', 255, 'Impostos & taxas', '2026-10-20', '2026-10-20', { forma: 'Boleto' });
desp('DAS Simples Nacional (outubro)', 388, 'Impostos & taxas', '2026-11-20', null, { forma: 'Boleto' });
desp('Anúncios Meta Ads', 250, 'Marketing & anúncios', '2026-07-05', '2026-07-05', { forma: 'Cartão' });
desp('Anúncios Meta Ads', 400, 'Marketing & anúncios', '2026-08-05', '2026-08-05', { forma: 'Cartão' });
desp('Anúncios Meta Ads', 400, 'Marketing & anúncios', '2026-09-05', '2026-09-05', { forma: 'Cartão' });
desp('Anúncios Meta Ads', 500, 'Marketing & anúncios', '2026-10-05', '2026-10-05', { forma: 'Cartão' });
desp('Anúncios Meta Ads', 350, 'Marketing & anúncios', '2026-11-03', '2026-11-03', { forma: 'Cartão' });
desp('Monitor 27" para desenvolvimento', 1100, 'Equipamentos', '2026-07-14', '2026-07-14', { forma: 'Cartão' });
desp('Ilustrações para a Pão de Ouro', 600, 'Freelancers & terceiros', '2026-09-25', '2026-09-25', { clienteId: 'cl_demo_paodeouro', projetoId: 'pj_demo_paodeouro' });
for (const [m, venc, pago] of [['setembro', '2026-09-30', '2026-09-30'], ['outubro', '2026-10-30', '2026-10-30'], ['novembro', '2026-11-30', null]]) {
  desp(`Pró-labore Rafael (${m})`, 1000, 'Pró-labore & retiradas', venc, pago, { socio: 'rafael', forma: 'Transferência' });
  desp(`Pró-labore Pedro (${m})`, 1000, 'Pró-labore & retiradas', venc, pago, { socio: 'pedro', forma: 'Transferência' });
}

/* ── leads abertos e perdidos ── */
const L = (o) => add('leads', { cargo: '', email: '', site: '', notas: '', criadoPor: o.responsavel, proximaAcao: '', ...o });
const H = (tipo, texto, d, h, autor) => ({ tipo, texto, data: T(d, h), autor });
L({ id: 'ld_demo_movimento', empresa: 'Academia Movimento Fit', contato: 'Bruno Tavares', cargo: 'Dono', telefone: '(19) 90000-1101', segmento: 'Fitness', cidade: 'Campinas, SP', origem: 'Instagram', servicos: ['site'], valor: 3000, etapa: 'novo', responsavel: 'pedro', proximoContato: '2026-11-16', proximaAcao: 'Primeiro contato pelo WhatsApp', criadoEm: T('2026-11-14', '18:40'), atualizadoEm: T('2026-11-14', '18:40'), etapaDesde: '2026-11-14', historico: [H('criado', 'Lead criado. Chegou pelo direct pedindo orçamento de site.', '2026-11-14', '18:40', 'pedro')] });
L({ id: 'ld_demo_casanova', empresa: 'Imobiliária Casa Nova', contato: 'Fernanda Lopes', cargo: 'Gerente comercial', telefone: '(19) 90000-1202', segmento: 'Imobiliário', cidade: 'Indaiatuba, SP', origem: 'Indicação', servicos: ['sistema', 'site'], valor: 12000, etapa: 'novo', responsavel: 'pedro', proximoContato: '2026-11-17', proximaAcao: 'Ligar para entender o volume de imóveis', criadoEm: T('2026-11-15', '11:05'), atualizadoEm: T('2026-11-15', '11:05'), etapaDesde: '2026-11-15', notas: 'Indicação da Dra. Camila (Sorriso Pleno).', historico: [H('criado', 'Lead criado por indicação da Sorriso Pleno.', '2026-11-15', '11:05', 'pedro')] });
L({ id: 'ld_demo_sabor', empresa: 'Restaurante Sabor da Serra', contato: 'Lúcia Ferraz', telefone: '(19) 90000-1303', segmento: 'Alimentação', cidade: 'Jundiaí, SP', origem: 'Google', servicos: ['site'], valor: 2800, etapa: 'contato', responsavel: 'pedro', proximoContato: '2026-11-14', proximaAcao: 'Enviar exemplos de cardápio digital', criadoEm: T('2026-11-03', '09:30'), atualizadoEm: T('2026-11-05', '16:00'), etapaDesde: '2026-11-05', historico: [H('criado', 'Lead criado', '2026-11-03', '09:30', 'pedro'), H('etapa', 'Novo lead → Em contato', '2026-11-05', '16:00', 'pedro'), H('ligacao', 'Quer site com cardápio digital e botão de reserva. Pediu exemplos.', '2026-11-05', '16:05', 'pedro')] });
L({ id: 'ld_demo_pequenosaber', empresa: 'Escola Pequeno Saber', contato: 'Marta Albuquerque', cargo: 'Diretora', telefone: '(19) 90000-1404', segmento: 'Educação', cidade: 'Campinas, SP', origem: 'Indicação', servicos: ['site', 'automacao'], valor: 4500, etapa: 'contato', responsavel: 'rafael', proximoContato: '2026-11-19', proximaAcao: 'Mostrar um portal de matrículas', criadoEm: T('2026-10-28', '14:00'), atualizadoEm: T('2026-11-10', '10:00'), etapaDesde: '2026-11-10', historico: [H('criado', 'Lead criado', '2026-10-28', '14:00', 'rafael'), H('email', 'Mandou a lista do que a secretaria faz à mão nas matrículas.', '2026-11-10', '10:00', 'rafael')] });
L({ id: 'ld_demo_viasul', empresa: 'Transportadora Via Sul', contato: 'Henrique Batista', cargo: 'Gerente de operações', telefone: '(41) 90000-1505', segmento: 'Logística', cidade: 'Curitiba, PR', origem: 'Prospecção ativa', servicos: ['automacao'], valor: 7800, etapa: 'diagnostico', responsavel: 'pedro', proximoContato: '2026-11-19', proximaAcao: 'Reunião de diagnóstico do rastreio de entregas', criadoEm: T('2026-10-20', '10:00'), atualizadoEm: T('2026-11-04', '15:00'), etapaDesde: '2026-11-04', historico: [H('criado', 'Lead criado', '2026-10-20', '10:00', 'pedro'), H('ligacao', 'Avisam clientes sobre entregas por telefone, um por um.', '2026-10-28', '11:00', 'pedro'), H('etapa', 'Em contato → Diagnóstico', '2026-11-04', '15:00', 'pedro')] });
L({ id: 'ld_demo_visaoclara', empresa: 'Ótica Visão Clara', contato: 'Patrícia Nunes', telefone: '(19) 90000-1606', segmento: 'Varejo', cidade: 'Americana, SP', origem: 'Instagram', servicos: ['site'], valor: 6000, etapa: 'diagnostico', responsavel: 'pedro', proximoContato: '', proximaAcao: '', criadoEm: T('2026-10-15', '17:00'), atualizadoEm: T('2026-10-24', '10:00'), etapaDesde: '2026-10-24', historico: [H('criado', 'Lead criado', '2026-10-15', '17:00', 'pedro'), H('reuniao', 'Primeira conversa. Quer vender armações pelo site.', '2026-10-24', '10:00', 'pedro')] });
L({ id: 'ld_demo_amigofiel', empresa: 'Clínica Veterinária Amigo Fiel', contato: 'Dra. Beatriz Campos', cargo: 'Sócia', telefone: '(19) 90000-1707', segmento: 'Saúde animal', cidade: 'Campinas, SP', origem: 'Indicação', servicos: ['sistema'], valor: 9500, etapa: 'proposta', responsavel: 'pedro', proximoContato: '2026-11-17', proximaAcao: 'Retornar sobre a proposta enviada', criadoEm: T('2026-10-09', '09:00'), atualizadoEm: T('2026-11-10', '18:00'), etapaDesde: '2026-11-10', historico: [H('criado', 'Lead criado', '2026-10-09', '09:00', 'pedro'), H('reuniao', 'Diagnóstico: agenda de consultas em planilha, muitos esquecimentos.', '2026-10-30', '14:00', 'rafael'), H('proposta', 'Proposta do sistema de agendamento com lembretes enviada.', '2026-11-10', '18:00', 'pedro')] });
L({ id: 'ld_demo_exata', empresa: 'Contabilidade Exata', contato: 'Roberto Saldanha', cargo: 'Sócio', telefone: '(11) 90000-1808', segmento: 'Serviços contábeis', cidade: 'São Paulo, SP', origem: 'LinkedIn', servicos: ['automacao'], valor: 8400, etapa: 'proposta', responsavel: 'rafael', proximoContato: '2026-11-18', proximaAcao: 'Apresentar o fluxo de automação das guias', criadoEm: T('2026-10-01', '10:30'), atualizadoEm: T('2026-11-06', '17:30'), etapaDesde: '2026-11-06', historico: [H('criado', 'Lead criado', '2026-10-01', '10:30', 'rafael'), H('reuniao', 'Mapeamos o envio de guias para 140 clientes.', '2026-10-21', '15:00', 'rafael'), H('proposta', 'Proposta enviada.', '2026-11-06', '17:30', 'rafael')] });
L({ id: 'ld_demo_recanto', empresa: 'Hotel Fazenda Recanto Verde', contato: 'Cláudio Moraes', cargo: 'Administrador', telefone: '(35) 90000-1909', segmento: 'Turismo', cidade: 'Monte Verde, MG', origem: 'Google', servicos: ['site', 'sistema'], valor: 11000, etapa: 'negociacao', responsavel: 'pedro', proximoContato: '2026-11-16', proximaAcao: 'Enviar proposta revisada com reservas online', criadoEm: T('2026-09-22', '14:10'), atualizadoEm: T('2026-11-11', '16:00'), etapaDesde: '2026-11-11', historico: [H('criado', 'Lead criado', '2026-09-22', '14:10', 'pedro'), H('reuniao', 'Diagnóstico com o Cláudio: 32 chalés, reservas só por telefone.', '2026-10-02', '10:00', 'rafael'), H('proposta', 'Proposta enviada: site e reservas online.', '2026-10-20', '09:00', 'pedro'), H('whatsapp', 'Pediu para dividir em mais parcelas e incluir pagamento antecipado.', '2026-11-11', '16:00', 'pedro')] });
L({ id: 'ld_demo_patinhas', empresa: 'Pet Shop Patinhas', contato: 'Rogério Dias', telefone: '(19) 90000-2010', segmento: 'Pet', cidade: 'Paulínia, SP', origem: 'Instagram', servicos: ['site'], valor: 2500, etapa: 'perdido', motivoPerda: 'Preço', perdidoEm: '2026-10-21', responsavel: 'pedro', proximoContato: '', criadoEm: T('2026-10-02', '11:00'), atualizadoEm: T('2026-10-21', '11:00'), etapaDesde: '2026-10-21', historico: [H('criado', 'Lead criado', '2026-10-02', '11:00', 'pedro'), H('perdido', 'Perdido: Preço — achou caro para o momento.', '2026-10-21', '11:00', 'pedro')] });
L({ id: 'ld_demo_saudeja', empresa: 'Farmácia Saúde Já', contato: 'Vanessa Teles', telefone: '(19) 90000-2111', segmento: 'Farmácia', cidade: 'Sumaré, SP', origem: 'Google', servicos: ['automacao'], valor: 5000, etapa: 'perdido', motivoPerda: 'Sem resposta', perdidoEm: '2026-11-08', responsavel: 'rafael', proximoContato: '', criadoEm: T('2026-09-29', '15:00'), atualizadoEm: T('2026-11-08', '09:00'), etapaDesde: '2026-11-08', historico: [H('criado', 'Lead criado', '2026-09-29', '15:00', 'rafael'), H('perdido', 'Perdido: Sem resposta depois de três tentativas.', '2026-11-08', '09:00', 'rafael')] });

/* ── tarefas ── */
const TF = (o) => add('tarefas', { notas: '', feita: false, feitaEm: null, criadoPor: o.responsavel, ...o });
TF({ id: 'tf_demo_1', titulo: 'Enviar proposta revisada ao Recanto Verde', responsavel: 'pedro', prazo: '2026-11-16', vinculo: 'lead:ld_demo_recanto', criadoEm: T('2026-11-11', '16:10') });
TF({ id: 'tf_demo_2', titulo: 'Configurar domínio e SSL do Studio Bella', responsavel: 'rafael', prazo: '2026-11-17', vinculo: 'projeto:pj_demo_bella', criadoEm: T('2026-11-11', '09:00') });
TF({ id: 'tf_demo_3', titulo: 'Emitir nota fiscal da entrada da Mendes & Associados', responsavel: 'pedro', prazo: '2026-11-14', vinculo: 'cliente:cl_demo_mendes', criadoEm: T('2026-11-07', '10:00') });
TF({ id: 'tf_demo_4', titulo: 'Reunião de sprint com a Alicerce', responsavel: 'rafael', prazo: '2026-11-19', vinculo: 'projeto:pj_demo_alicerce', criadoEm: T('2026-11-12', '10:00') });
TF({ id: 'tf_demo_5', titulo: 'Publicar o case da Pão de Ouro no portfólio', responsavel: 'rafael', prazo: '2026-11-24', vinculo: 'cliente:cl_demo_paodeouro', criadoEm: T('2026-11-02', '10:00') });
TF({ id: 'tf_demo_6', titulo: 'Revisar textos da landing page com o Dr. Paulo', responsavel: 'rafael', prazo: '2026-11-13', vinculo: 'projeto:pj_demo_mendes', feita: true, feitaEm: '2026-11-13', criadoEm: T('2026-11-09', '10:00') });

/* ── saída ── */
fs.writeFileSync(path.join(DIR, 'seed.json'), JSON.stringify(out, null, 1));
const ops = [];
for (const [col, rows] of Object.entries(out)) for (const r of rows) {
  const { id, ...data } = r;
  ops.push({ op: 'set', path: `${col}/${id}`, data });
}
const batches = [];
for (let i = 0; i < ops.length; i += 50) batches.push(ops.slice(i, i + 50));
batches.forEach((b, i) => fs.writeFileSync(path.join(DIR, `ops-${i + 1}.json`), JSON.stringify(b)));
const counts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
console.log('docs', ops.length, counts, 'batches', batches.length, batches.map((b) => JSON.stringify(b).length));
