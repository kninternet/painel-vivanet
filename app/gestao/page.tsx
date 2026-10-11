import { redirect } from 'next/navigation'
import Gestao from '@/components/Gestao'
import { podeVerGestao } from '@/lib/bancos'
import { sessaoAtual } from '@/lib/sessao'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitor × Equipe · Viva Net' }

export default async function Pagina() {
  const s = await sessaoAtual()
  if (!s) redirect('/entrar?voltar=/gestao')
  if (!podeVerGestao(s.agente_id)) return <main className="corpo"><div className="aviso">Esta página é restrita à gestão.</div></main>
  return <Gestao />
}
