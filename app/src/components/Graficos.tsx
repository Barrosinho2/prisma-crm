import { reais, reaisCurto } from '../lib/formato'
import { useDados } from '../lib/dados'

export const CORES_GRAF = {
  receitas: '#5E7A6B',
  despesas: '#621F32',
  resultado: '#B0855B',
  saldo: '#875364',
  previsto: '#875364',
  simulado: '#B0855B',
  realizado: '#421625',
  grade: '#E9E2DC',
  eixo: '#817678',
}

export const eixo = { fontSize: 12, fill: CORES_GRAF.eixo, fontFamily: 'DM Sans' }

export function useFmtEixo() {
  const { banco } = useDados()
  return (v: number) => (banco.config?.ocultar_valores ? '' : reaisCurto(v))
}

interface Item { name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }
export function DicaGrafico({ active, payload, label, rotulos }: { active?: boolean; payload?: Item[]; label?: string; rotulos?: Record<string, string> }) {
  const { banco } = useDados()
  if (!active || !payload?.length) return null
  const oculto = banco.config?.ocultar_valores
  return (
    <div className="min-w-[160px] rounded-xl border border-borda bg-cartao/95 px-3.5 py-2.5 text-xs shadow-elevada backdrop-blur">
      {label && <p className="mb-1.5 font-medium text-carvao">{label}</p>}
      {payload.filter(p => p.value != null).map(p => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-taupe"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{rotulos?.[String(p.dataKey)] ?? p.name}</span>
          <span className="num font-medium text-carvao">{oculto ? 'R$ ••••' : reais(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}
