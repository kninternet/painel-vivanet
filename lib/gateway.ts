import 'server-only'

const BASE = process.env.GATEWAY_URL ?? 'http://177.86.157.241:3200'

/** Chamada ao sgp-gateway com a chave do canal "painel" (só no servidor). */
export async function gateway(rota: string, corpo: unknown, timeoutMs = 25000): Promise<Response> {
  const chave = process.env.GATEWAY_KEY
  if (!chave) throw new Error('GATEWAY_KEY não configurada')
  return fetch(`${BASE}${rota}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gateway-key': chave },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
}
