// Exportação em CSV, Excel e PDF. Bibliotecas carregadas só quando usadas.

export interface Tabela {
  titulo: string
  colunas: string[]
  linhas: (string | number)[][]
  /** índices das colunas que são valores em centavos */
  dinheiro?: number[]
}

function nomeArquivo(t: string, ext: string) {
  const base = t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  return `${base}.${ext}`
}
function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const emReais = (c: number) => (c / 100).toFixed(2).replace('.', ',')

export function exportarCSV(t: Tabela) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linhas = t.linhas.map(l => l.map((v, i) => (t.dinheiro?.includes(i) ? emReais(Number(v)) : v)))
  const csv = [t.colunas, ...linhas].map(l => l.map(esc).join(';')).join('\r\n')
  baixar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), nomeArquivo(t.titulo, 'csv'))
}

export async function exportarExcel(t: Tabela) {
  const XLSX = await import('xlsx')
  const linhas = t.linhas.map(l => l.map((v, i) => (t.dinheiro?.includes(i) ? Number(v) / 100 : v)))
  const ws = XLSX.utils.aoa_to_sheet([t.colunas, ...linhas])
  const ref = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (const c of t.dinheiro ?? []) for (let r = 1; r <= ref.e.r; r++) {
    const cel = ws[XLSX.utils.encode_cell({ r, c })]
    if (cel) cel.z = '"R$" #,##0.00;-"R$" #,##0.00'
  }
  ws['!cols'] = t.colunas.map((c, i) => ({ wch: Math.min(40, Math.max(c.length, ...t.linhas.map(l => String(l[i] ?? '').length)) + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t.titulo.slice(0, 31))
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  baixar(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArquivo(t.titulo, 'xlsx'))
}

export async function exportarPDF(t: Tabela, subtitulo?: string) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: t.colunas.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  doc.setFont('times', 'normal'); doc.setFontSize(18); doc.setTextColor(66, 22, 37)
  doc.text(t.titulo, 40, 50)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(129, 118, 120)
  doc.text(subtitulo ?? `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, 40, 66)
  autoTable(doc, {
    startY: 82,
    head: [t.colunas],
    body: t.linhas.map(l => l.map((v, i) => (t.dinheiro?.includes(i) ? brl.format(Number(v) / 100) : String(v ?? '')))),
    styles: { font: 'helvetica', fontSize: 8.5, textColor: [41, 37, 38], lineColor: [227, 220, 215], lineWidth: 0.5, cellPadding: 5 },
    headStyles: { fillColor: [98, 31, 50], textColor: [248, 245, 240], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 245, 240] },
    columnStyles: Object.fromEntries((t.dinheiro ?? []).map(i => [i, { halign: 'right' }])),
    margin: { left: 40, right: 40 },
  })
  doc.save(nomeArquivo(t.titulo, 'pdf'))
}
