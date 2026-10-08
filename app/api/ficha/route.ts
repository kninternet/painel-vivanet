import { NextResponse } from 'next/server'
import { gateway } from '@/lib/gateway'
import { sessaoAtual } from '@/lib/sessao'

export async function GET(req: Request) {
  if (!(await sessaoAtual())) return NextResponse.json({ erro: 'sessao' }, { status: 401 })
  const contrato = Number(new URL(req.url).searchParams.get('contrato'))
  if (!Number.isSafeInteger(contrato) || contrato <= 0) return NextResponse.json({ erro: 'contrato_invalido' }, { status: 400 })
  try {
    const r = await gateway('/v1/painel/contrato', { contrato_id: contrato })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch {
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}
