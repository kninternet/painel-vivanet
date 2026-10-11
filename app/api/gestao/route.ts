import { NextResponse } from 'next/server'
import { podeVerGestao } from '@/lib/bancos'
import { relatorio } from '@/lib/gestao'
import { sessaoAtual } from '@/lib/sessao'

const DATA = /^\d{4}-\d{2}-\d{2}$/
export async function GET(req: Request) {
  const s = await sessaoAtual()
  if (!s) return NextResponse.json({ erro: 'sessao' }, { status: 401 })
  if (!podeVerGestao(s.agente_id)) return NextResponse.json({ erro: 'sem_acesso' }, { status: 403 })
  const u = new URL(req.url).searchParams
  const de = u.get('de') ?? '', ate = u.get('ate') ?? ''
  const canal = ['todos', 'site', 'whatsapp', 'telegram', 'email'].includes(u.get('canal') ?? '') ? u.get('canal')! : 'todos'
  const departamento = ['todos', 'atendimento', 'financeiro', 'suporte'].includes(u.get('departamento') ?? '') ? u.get('departamento')! : 'todos'
  if (!DATA.test(de) || !DATA.test(ate) || de > ate) return NextResponse.json({ erro: 'periodo_invalido' }, { status: 400 })
  if ((Date.parse(ate) - Date.parse(de)) / 86_400_000 > 92) return NextResponse.json({ erro: 'periodo_longo' }, { status: 400 })
  try {
    return NextResponse.json(await relatorio({ de, ate, canal, departamento }))
  } catch (e) {
    console.error('[gestao]', e)
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}
