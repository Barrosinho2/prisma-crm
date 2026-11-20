// Espelho das tabelas do banco. Datas em 'AAAA-MM-DD', valores em centavos inteiros.

export type TipoConta = 'corrente' | 'digital' | 'poupanca' | 'dinheiro' | 'reserva'
export type TipoLanc = 'receita' | 'despesa'
export type StatusLanc = 'pendente' | 'efetivado' | 'cancelado'
export type FormaPagamento =
  | 'pix' | 'debito' | 'dinheiro' | 'boleto' | 'transferencia' | 'credito' | 'debito_automatico' | 'outro'

export interface Config {
  user_id: string
  nome: string | null
  dia_salario: number | null
  objetivo_economia_cents: number
  essenciais_cents: number | null
  moeda: 'BRL'
  ocultar_valores: boolean
  alerta_dias: number
  alertas_ativos: boolean
  onboarding: Record<string, boolean>
}

export interface Conta {
  id: string
  nome: string
  tipo: TipoConta
  saldo_inicial_cents: number
  data_saldo_inicial: string
  cor: string | null
  ordem: number
  arquivada: boolean
  criado_em?: string
}

export interface Categoria {
  id: string
  nome: string
  tipo: TipoLanc
  icone: string
  cor: string
  ordem: number
  oculta: boolean
  essencial: boolean
}

export interface Cartao {
  id: string
  nome: string
  instituicao: string | null
  limite_cents: number
  dia_fechamento: number
  dia_vencimento: number
  conta_pagamento_id: string | null
  cor: string
  arquivado: boolean
}

export interface Recorrencia {
  id: string
  tipo: TipoLanc
  nome: string
  valor_cents: number
  dia: number
  categoria_id: string | null
  conta_id: string | null
  cartao_id: string | null
  forma_pagamento: FormaPagamento | null
  inicio: string
  fim: string | null
  ativa: boolean
  essencial: boolean
  obs: string | null
}

export interface Fatura {
  id: string
  cartao_id: string
  fechamento: string
  vencimento: string
}

export interface Compra {
  id: string
  cartao_id: string
  descricao: string
  valor_total_cents: number
  parcelas: number
  data_compra: string
  categoria_id: string | null
  obs: string | null
  cancelada: boolean
  criado_em?: string
}

export interface Parcela {
  id: string
  compra_id: string
  fatura_id: string
  numero: number
  valor_cents: number
  competencia: string
}

export interface Lancamento {
  id: string
  tipo: TipoLanc
  descricao: string
  valor_cents: number
  data_prevista: string
  data_efetiva: string | null
  status: StatusLanc
  categoria_id: string | null
  conta_id: string | null
  cartao_id: string | null
  compra_id: string | null
  forma_pagamento: FormaPagamento | null
  recorrencia_id: string | null
  competencia: string | null
  obs: string | null
  criado_em?: string
}

export interface Transferencia {
  id: string
  origem_id: string
  destino_id: string
  valor_cents: number
  data: string
  descricao: string | null
  cancelada: boolean
}

export interface PagamentoFatura {
  id: string
  fatura_id: string
  conta_id: string
  valor_cents: number
  data: string
  cancelado: boolean
}

export interface Meta {
  id: string
  nome: string
  alvo_cents: number
  prazo: string | null
  conta_id: string | null
  emergencia: boolean
  meses_alvo: number | null
  icone: string
  arquivada: boolean
  criado_em?: string
}

export interface MovimentoMeta {
  id: string
  meta_id: string
  tipo: 'aporte' | 'retirada'
  valor_cents: number
  data: string
  conta_id: string | null
  obs: string | null
  cancelado: boolean
}

export interface Orcamento {
  id: string
  categoria_id: string
  competencia: string
  limite_cents: number
}

export interface Banco {
  config: Config | null
  contas: Conta[]
  categorias: Categoria[]
  cartoes: Cartao[]
  recorrencias: Recorrencia[]
  faturas: Fatura[]
  compras: Compra[]
  parcelas: Parcela[]
  lancamentos: Lancamento[]
  transferencias: Transferencia[]
  pagamentos: PagamentoFatura[]
  metas: Meta[]
  movimentos: MovimentoMeta[]
  orcamentos: Orcamento[]
}

export const bancoVazio = (): Banco => ({
  config: null, contas: [], categorias: [], cartoes: [], recorrencias: [], faturas: [], compras: [],
  parcelas: [], lancamentos: [], transferencias: [], pagamentos: [], metas: [], movimentos: [], orcamentos: [],
})

export const TIPOS_CONTA: Record<TipoConta, string> = {
  corrente: 'Conta corrente', digital: 'Conta digital', poupanca: 'Poupança', dinheiro: 'Dinheiro em espécie', reserva: 'Conta de reserva',
}
export const FORMAS: Record<FormaPagamento, string> = {
  pix: 'Pix', debito: 'Débito', dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência',
  credito: 'Crédito', debito_automatico: 'Débito automático', outro: 'Outro',
}
