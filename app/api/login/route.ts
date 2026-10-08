import { NextResponse } from 'next/server'
import { COOKIE, criarValor } from '@/lib/sessao'

/**
 * Login com o usuário do Chatwoot: o painel pergunta ao próprio Chatwoot se as credenciais valem
 * e se a pessoa é atendente da conta da Viva. A senha só passa por aqui; nada é guardado.
 */
export async function POST(req: Request) {
  const { email, senha } = (await req.json().catch(() => ({}))) as { email?: string; senha?: string }
  if (!email || !senha) return NextResponse.json({ erro: 'Informe e-mail e senha.' }, { status: 400 })
  const base = process.env.CHATWOOT_URL ?? 'https://chat.vivanettelecom.com.br'
  const conta = Number(process.env.CHATWOOT_CONTA ?? 1)
  let r: Response
  try {
    r = await fetch(`${base}/auth/sign_in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }), signal: AbortSignal.timeout(15000), cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ erro: 'Chatwoot indisponível. Tente de novo.' }, { status: 503 })
  }
  if (!r.ok) return NextResponse.json({ erro: 'E-mail ou senha incorretos.' }, { status: 401 })
  const j = await r.json().catch(() => ({})) as { data?: { id?: number; name?: string; accounts?: { id: number }[] } }
  const u = j.data
  if (!u?.id || !(u.accounts ?? []).some((a) => a.id === conta)) {
    return NextResponse.json({ erro: 'Este usuário não é atendente da Viva Net.' }, { status: 403 })
  }
  const { valor, maxAge } = criarValor(u.id, u.name ?? 'Atendente')
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, valor, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge })
  return res
}
