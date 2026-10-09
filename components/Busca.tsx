'use client'
import { useState } from 'react'

interface Contrato { contrato_id: number; plano: string | null; status: string | null; pop: string | null; endereco: string | null }
interface Cliente { nome: string; contratos: Contrato[] }

const ERROS: Record<string, string> = {
  cpfcnpj_invalido: 'CPF tem 11 dígitos e CNPJ tem 14.',
  muitas_buscas: 'Muitas buscas em pouco tempo. Aguarde alguns minutos.',
  indisponivel: 'Não foi possível consultar agora. Tente de novo.',
}

/** Busca fora de conversa: número do contrato abre a ficha; CPF/CNPJ lista os contratos do cliente. */
export default function Busca({ onAbrir, aviso }: { onAbrir: (contrato: number) => void; aviso?: string }) {
  const [valor, setValor] = useState('')
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const d = valor.replace(/\D/g, '')
    setErro(''); setClientes(null)
    if (d.length > 0 && d.length <= 9) return onAbrir(Number(d))
    if (d.length !== 11 && d.length !== 14) return setErro('Digite o número do contrato, um CPF (11 dígitos) ou um CNPJ (14 dígitos).')
    setCarregando(true)
    const r = await fetch('/api/buscar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpfcnpj: d }) })
    if (r.status === 401) { window.location.href = '/entrar'; return }
    const j = await r.json().catch(() => ({ erro: 'indisponivel' }))
    setCarregando(false)
    if (!r.ok) return setErro(ERROS[j.erro] ?? ERROS.indisponivel)
    const lista: Cliente[] = (j.clientes ?? []).filter((c: Cliente) => c.contratos.length > 0)
    if (lista.length === 0) return setErro('Nenhum contrato da Viva Net encontrado para esse CPF/CNPJ.')
    const todos = lista.flatMap((c) => c.contratos)
    if (todos.length === 1) return onAbrir(todos[0].contrato_id)
    setClientes(lista)
  }

  return (
    <div className="corpo"><div className="aviso" style={{ display: 'block' }}>
      {aviso && <p style={{ marginBottom: 12 }}>{aviso}</p>}
      <form onSubmit={buscar}>
        <div className="rotulo">Buscar cliente</div>
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="numeric" autoFocus
          placeholder="Nº do contrato, CPF ou CNPJ"
          style={{ width: '100%', font: 'inherit', fontSize: 16, padding: '10px 12px', borderRadius: 8, border: '1px solid #C8CADB', marginTop: 6 }} />
        <button className="btn prim" style={{ width: '100%', marginTop: 8 }} disabled={carregando}>{carregando ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {erro && <p style={{ marginTop: 10, color: '#9B1C1C', fontWeight: 600 }}>{erro}</p>}
      {clientes?.map((c, i) => (
        <div key={i} style={{ marginTop: 14 }}>
          <div className="forte">{c.nome}</div>
          {c.contratos.map((ct) => (
            <button key={ct.contrato_id} className="btn" style={{ width: '100%', marginTop: 6, textAlign: 'left', display: 'block', height: 'auto', padding: '8px 10px' }}
              onClick={() => onAbrir(ct.contrato_id)}>
              <div className="forte">Contrato {ct.contrato_id}{ct.status ? ` · ${ct.status}` : ''}</div>
              <div className="suave" style={{ fontSize: 12 }}>{[ct.plano, ct.pop, ct.endereco].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      ))}
    </div></div>
  )
}
