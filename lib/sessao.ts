/** Sessão do atendente: cookie assinado (HMAC), 12 horas. Não guarda senha nem token do Chatwoot. */
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const COOKIE = 'painel_sessao'
const DURACAO_S = 12 * 60 * 60

export interface Sessao { agente_id: number; nome: string; exp: number }

function segredo(): string {
  const s = process.env.SESSAO_SEGREDO
  if (!s || s.length < 32) throw new Error('SESSAO_SEGREDO ausente ou curto')
  return s
}
const assinar = (dados: string) => createHmac('sha256', segredo()).update(dados).digest('base64url')

export function criarValor(agente_id: number, nome: string): { valor: string; maxAge: number } {
  const dados = Buffer.from(JSON.stringify({ agente_id, nome, exp: Math.floor(Date.now() / 1000) + DURACAO_S })).toString('base64url')
  return { valor: `${dados}.${assinar(dados)}`, maxAge: DURACAO_S }
}

export async function sessaoAtual(): Promise<Sessao | null> {
  const valor = (await cookies()).get(COOKIE)?.value
  if (!valor) return null
  const [dados, ass] = valor.split('.')
  if (!dados || !ass) return null
  const esperado = Buffer.from(assinar(dados)); const recebido = Buffer.from(ass)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
  try {
    const s = JSON.parse(Buffer.from(dados, 'base64url').toString()) as Sessao
    return s.exp > Date.now() / 1000 ? s : null
  } catch { return null }
}
