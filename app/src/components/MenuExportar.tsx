import { useState } from 'react'
import * as L from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Botao, useAvisos } from './ui'
import { exportarCSV, exportarExcel, exportarPDF, type Tabela } from '../lib/exportar'

export function MenuExportar({ gerar, subtitulo }: { gerar: () => Tabela; subtitulo?: string }) {
  const [aberto, setAberto] = useState(false)
  const { avisar } = useAvisos()
  const fazer = async (f: (t: Tabela) => unknown) => {
    setAberto(false)
    const t = gerar()
    if (!t.linhas.length) return avisar('Não há dados para exportar com os filtros atuais.', 'info')
    try { await f(t); avisar('Arquivo gerado.') } catch { avisar('Não foi possível gerar o arquivo.', 'erro') }
  }
  return (
    <div className="relative">
      <Botao icone={L.Download} onClick={() => setAberto(v => !v)} aria-haspopup="menu" aria-expanded={aberto}>Exportar</Botao>
      <AnimatePresence>
        {aberto && (<>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute right-0 top-12 z-40 w-48 rounded-2xl border border-borda bg-cartao p-1.5 shadow-elevada">
            <Item i={L.FileText} r="CSV" f={() => fazer(exportarCSV)} />
            <Item i={L.FileSpreadsheet} r="Excel (.xlsx)" f={() => fazer(exportarExcel)} />
            <Item i={L.FileDown} r="PDF" f={() => fazer(t => exportarPDF(t, subtitulo))} />
          </motion.div>
        </>)}
      </AnimatePresence>
    </div>
  )
}
function Item({ i: Ic, r, f }: { i: L.LucideIcon; r: string; f: () => void }) {
  return <button role="menuitem" onClick={f} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm hover:bg-creme"><Ic className="h-4 w-4 text-taupe" />{r}</button>
}
