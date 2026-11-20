// Dinheiro (centavos inteiros) e datas ('AAAA-MM-DD') no fuso America/Sao_Paulo.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCurto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function reais(cents: number): string {
  return brl.format(cents / 100)
}
export function reaisCurto(cents: number): string {
  const v = Math.abs(cents) / 100
  if (v >= 1_000_000) return (cents < 0 ? '-' : '') + 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (v >= 10_000) return (cents < 0 ? '-' : '') + 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  return brlCurto.format(cents / 100)
}

/** "1.234,56" | "1234,5" | "1234.56" | "R$ 10" → centavos. Retorna null se inválido. */
export function paraCentavos(texto: string): number | null {
  let s = String(texto ?? '').replace(/[R$\s]/g, '').trim()
  if (!s) return null
  const neg = s.startsWith('-')
  s = s.replace(/^-/, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  else if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [int, dec = ''] = s.split('.')
  const c = Number(int) * 100 + Number((dec + '00').slice(0, 2))
  if (!Number.isSafeInteger(c)) return null
  return neg ? -c : c
}
export function centavosParaTexto(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------- datas ----------
const fmtHoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
export function hoje(): string {
  return fmtHoje.format(new Date())
}
export function data(a: number, m: number, d: number): string {
  // m: 1..12, aceita transbordo (m=13 → próximo ano)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.toISOString().slice(0, 10)
}
export function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number)
  return [a, m, d]
}
export function ultimoDia(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}
/** dia d do mês de iso, limitado ao último dia */
export function diaNoMes(iso: string, d: number): string {
  const [a, m] = partes(iso)
  return data(a, m, Math.min(d, ultimoDia(a, m)))
}
export function inicioMes(iso: string): string {
  const [a, m] = partes(iso)
  return data(a, m, 1)
}
export function fimMes(iso: string): string {
  const [a, m] = partes(iso)
  return data(a, m, ultimoDia(a, m))
}
export function somaMeses(iso: string, n: number): string {
  const [a, m, d] = partes(iso)
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1))
  const aa = alvo.getUTCFullYear(), mm = alvo.getUTCMonth() + 1
  return data(aa, mm, Math.min(d, ultimoDia(aa, mm)))
}
export function somaDias(iso: string, n: number): string {
  const [a, m, d] = partes(iso)
  return data(a, m, d + n)
}
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000)
}
export function mesChave(iso: string): string {
  return iso.slice(0, 7)
}
export function mesmoMes(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export function nomeMes(iso: string, ano = true): string {
  const [a, m] = partes(iso)
  const n = MESES[m - 1]
  return ano ? `${n[0].toUpperCase()}${n.slice(1)} de ${a}` : n[0].toUpperCase() + n.slice(1)
}
export function mesCurto(iso: string, ano = false): string {
  const [a, m] = partes(iso)
  return ano ? `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}` : MESES_CURTOS[m - 1]
}
export function diaSemana(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getUTCDay()
}
export function dataLonga(iso: string): string {
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
  const [a, m, d] = partes(iso)
  return `${dias[diaSemana(iso)]}, ${d} de ${MESES[m - 1]} de ${a}`
}
export function brParaIso(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  return data(+m[3], +m[2], +m[1]) === iso ? iso : null
}
export function pct(parte: number, total: number): number {
  if (!total) return 0
  return (parte / total) * 100
}
