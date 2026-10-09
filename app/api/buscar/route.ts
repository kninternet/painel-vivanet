import { NextResponse } from 'next/server'
import { gateway } from '@/lib/gateway'
import { sessaoAtual } from '@/lib/sessao'

/** Limite de buscas por atendente (em memória: o painel roda em um processo só). */
const janelas = new Map<number, number[]>()
function dentroDoLimite(agente: number, max = 30, janelaS = 600) {
  const agora = Date.now()
  const lista = (janelas.get(agente) ?? []).filter((t) => agora - t < janelaS * 1000)
  if (lista.length >= max) return false
  lista.push(agora); janelas.set(agente, lista)
  return true
}
const mascarar = (d: string) => (d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`)

/** Busca por CPF/CNPJ fora de uma conversa: devolve só nome e contratos (POPs da Viva Net). */
export async function POST(req: Request) {
  const s = await sessaoAtual()
  if (!s) return NextResponse.json({ erro: 'sessao' }, { status: 401 })
  const { cpfcnpj } = (await req.json().catch(() => ({}))) as { cpfcnpj?: string }
  const doc = String(cpfcnpj ?? '').replace(/\D/g, '')
  if (doc.length !== 11 && doc.length !== 14) return NextResponse.json({ erro: 'cpfcnpj_invalido' }, { status: 400 })
  if (!dentroDoLimite(s.agente_id)) return NextResponse.json({ erro: 'muitas_buscas' }, { status: 429 })

  try {
    const r = await gateway('/v1/identificar', { cpfcnpj: doc })
    const dados = await r.json().catch(() => ({}))
    const clientes = (Array.isArray(dados?.clientes) ? dados.clientes : []).map((c: any) => ({
      nome: String(c.nome ?? ''),
      contratos: (Array.isArray(c.contratos) ? c.contratos : []).map((ct: any) => ({
        contrato_id: Number(ct.contrato_id),
        plano: ct.plano ?? null,
        status: ct.status ?? null,
        pop: ct.pop_nome ?? null,
        endereco: ct.endereco ?? null,
      })),
    }))
    console.info(JSON.stringify({ evento: 'busca_painel', agente_id: s.agente_id, agente: s.nome, doc: mascarar(doc),
      contratos: clientes.reduce((n: number, c: any) => n + c.contratos.length, 0), em: new Date().toISOString() }))
    return NextResponse.json({ clientes }, { status: r.ok ? 200 : r.status })
  } catch {
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 })
  }
}
