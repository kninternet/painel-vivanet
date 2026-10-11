import 'server-only'
import { Pool } from 'pg'

// Conexões só de leitura (usuário painel_leitura) para o dashboard de gestão.
const opcoes = { max: 3, idleTimeoutMillis: 10_000, options: '-c default_transaction_read_only=on -c statement_timeout=20000' }
const g = globalThis as unknown as { _cw?: Pool; _gw?: Pool }
export const chatwootDb = () => (g._cw ??= new Pool({ connectionString: process.env.CHATWOOT_DB_URL, ...opcoes }))
export const gatewayDb = () => (g._gw ??= new Pool({ connectionString: process.env.GATEWAY_DB_URL, ...opcoes }))

/** Quem pode ver o dashboard: ids de usuário do Chatwoot em GESTAO_AGENTES. */
export const podeVerGestao = (agenteId: number) =>
  (process.env.GESTAO_AGENTES ?? '').split(',').map((x) => Number(x.trim())).filter(Boolean).includes(agenteId)
