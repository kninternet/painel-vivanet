'use client'
import { useState } from 'react'

export default function Entrar() {
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(''); const [enviando, setEnviando] = useState(false)
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setEnviando(true)
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    const voltar = new URLSearchParams(window.location.search).get('voltar') ?? '/'
    if (r.ok) window.location.href = voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/'
    else setErro(j.erro ?? 'Não foi possível entrar.')
  }
  const campo: React.CSSProperties = { height: 44, borderRadius: 10, border: '1px solid var(--borda-forte)', background: 'var(--cartao)', color: '#fff', padding: '0 12px', fontSize: 14, width: '100%' }
  return (
    <main style={{ maxWidth: 360, margin: '48px auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="forte" style={{ fontSize: 18 }}>Painel do atendente</div>
        <div className="suave">Entre com o mesmo e-mail e senha do Chatwoot.</div>
      </div>
      <form onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="suave">E-mail<input style={campo} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="suave">Senha<input style={campo} type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
        {erro && <div style={{ color: 'var(--ruim)', fontSize: 13 }}>{erro}</div>}
        <button className="btn prim" type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  )
}
