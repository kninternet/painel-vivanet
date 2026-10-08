import { NextResponse } from 'next/server'
import { gateway } from '@/lib/gateway'
import { sessaoAtual } from '@/lib/sessao'

const TIPOS = ['contrato', 'termoadesao', 'contratofidelidade', 'cancelamento', 'termocomodato']

/** PDF do documento do contrato, aberto numa aba nova. */
export async function GET(req: Request) {
  if (!(await sessaoAtual())) return new NextResponse('Sessão expirada. Entre de novo no painel.', { status: 401 })
  const u = new URL(req.url)
  const contrato = Number(u.searchParams.get('contrato')); const tipo = u.searchParams.get('tipo') ?? ''
  if (!Number.isSafeInteger(contrato) || !TIPOS.includes(tipo)) return new NextResponse('Pedido inválido.', { status: 400 })
  const r = await gateway('/v1/painel/documento', { contrato_id: contrato, tipo }, 30000).catch(() => null)
  if (!r || !r.ok) return new NextResponse('Documento indisponível no SGP.', { status: 502 })
  return new NextResponse(await r.arrayBuffer(), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${tipo}-${contrato}.pdf"` },
  })
}
