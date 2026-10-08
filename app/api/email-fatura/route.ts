import { NextResponse } from 'next/server'
import { gateway } from '@/lib/gateway'
import { sessaoAtual } from '@/lib/sessao'

/** Envia uma fatura por e-mail ao endereço do cadastro do cliente (rota de e-mail do gateway). */
export async function POST(req: Request) {
  if (!(await sessaoAtual())) return NextResponse.json({ erro: 'sessao' }, { status: 401 })
  const { contrato_id, fatura_id } = (await req.json().catch(() => ({}))) as { contrato_id?: number; fatura_id?: number }
  if (!contrato_id || !fatura_id) return NextResponse.json({ erro: 'pedido_invalido' }, { status: 400 })
  try {
    const r = await gateway('/v1/email/fatura', { contrato_id, fatura_id })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch {
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}
