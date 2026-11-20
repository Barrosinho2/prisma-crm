import { Component, type ReactNode } from 'react'

// Se uma tela falhar ao abrir, mostra um aviso com botão em vez de deixar a página em branco.
// Arquivo de página antigo (o site foi atualizado com a aba aberta): recarrega sozinho uma vez.
const CHAVE = 'fin:recarregou-versao'

function ehVersaoAntiga(e: unknown) {
  const m = String((e as Error)?.message ?? e)
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading dynamically/i.test(m)
}

export class ProtecaoErros extends Component<{ children: ReactNode }, { erro: unknown }> {
  state = { erro: null as unknown }
  static getDerivedStateFromError(erro: unknown) { return { erro } }
  componentDidCatch(erro: unknown) {
    if (ehVersaoAntiga(erro)) {
      let ja = false
      try { ja = sessionStorage.getItem(CHAVE) === '1'; sessionStorage.setItem(CHAVE, '1') } catch { /* sem armazenamento */ }
      if (!ja) location.reload()
    }
    console.error(erro)
  }
  componentDidMount() { setTimeout(() => { try { sessionStorage.removeItem(CHAVE) } catch { /* nada */ } }, 10_000) }
  render() {
    if (!this.state.erro) return this.props.children
    const antiga = ehVersaoAntiga(this.state.erro)
    return (
      <div className="grid min-h-[60vh] place-items-center px-6 text-center">
        <div className="max-w-sm">
          <p className="titulo text-2xl">{antiga ? 'O sistema foi atualizado' : 'Esta tela não abriu'}</p>
          <p className="mt-2 text-sm text-taupe">{antiga ? 'Recarregue para usar a versão mais nova.' : 'Seus dados estão salvos. Recarregue a página para tentar de novo.'}</p>
          <button onClick={() => location.reload()} className="mt-5 inline-flex h-10 items-center rounded-xl bg-vinho px-4 text-sm font-medium text-marfim hover:bg-vinho-escuro">Recarregar</button>
        </div>
      </div>
    )
  }
}
