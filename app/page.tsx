import { redirect } from 'next/navigation'
import Painel from '@/components/Painel'
import { sessaoAtual } from '@/lib/sessao'

export const dynamic = 'force-dynamic'

export default async function Pagina() {
  const s = await sessaoAtual()
  if (!s) redirect('/entrar')
  return <Painel atendente={s.nome} />
}
